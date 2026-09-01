import { Router } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';

export interface DirectoryEntry {
  name: string;
  path: string;
}

export interface BrowseResult {
  currentPath: string;
  parent: string | null;
  directories: DirectoryEntry[];
}

/**
 * Parses the ALLOWED_BROWSE_ROOTS env var into an array of allowed base paths.
 * Returns null (unrestricted) if not set or empty.
 */
function getAllowedRoots(): string[] | null {
  const raw = process.env.ALLOWED_BROWSE_ROOTS;
  if (!raw || raw.trim() === '') return null;
  return raw.split(',').map(r => path.resolve(r.trim())).filter(Boolean);
}

/**
 * Checks whether the resolved target path is allowed given the optional allowlist.
 */
function isPathAllowed(resolvedPath: string, allowedRoots: string[] | null): boolean {
  if (!allowedRoots) return true; // Unrestricted
  return allowedRoots.some(root => resolvedPath === root || resolvedPath.startsWith(root + path.sep));
}

export function createFilesystemRouter(): Router {
  const router = Router();

  /**
   * GET /api/filesystem/browse?path=/some/path
   *
   * Lists directories (only) at the given path on the Polyarr server's filesystem.
   * Used by the path browser component for configuring local media paths.
   *
   * Security:
   * - Only returns directory names, never file names or contents.
   * - Path traversal is prevented via path.resolve().
   * - Optional env var ALLOWED_BROWSE_ROOTS restricts browsable paths.
   */
  router.get('/browse', async (req, res) => {
    try {
      const rawPath = (req.query.path as string) || '/';
      const resolvedPath = path.resolve(rawPath);

      // Security: check allowlist
      const allowedRoots = getAllowedRoots();
      if (!isPathAllowed(resolvedPath, allowedRoots)) {
        return res.status(403).json({
          error: 'Access denied. Path is outside of allowed browse roots.',
          allowedRoots: allowedRoots,
        });
      }

      // Check if the path exists and is a directory
      let stat;
      try {
        stat = await fs.stat(resolvedPath);
      } catch {
        return res.status(404).json({ error: `Path not found: ${resolvedPath}` });
      }

      if (!stat.isDirectory()) {
        return res.status(400).json({ error: `Not a directory: ${resolvedPath}` });
      }

      // Read directory entries, filtering to directories only
      const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
      const directories: DirectoryEntry[] = [];

      for (const entry of entries) {
        // Skip hidden directories (starting with .) for cleaner browsing
        if (entry.name.startsWith('.')) continue;
        if (entry.isDirectory()) {
          directories.push({
            name: entry.name,
            path: path.join(resolvedPath, entry.name),
          });
        }
      }

      // Sort alphabetically
      directories.sort((a, b) => a.name.localeCompare(b.name));

      // Compute parent (null if at filesystem root)
      const parentPath = resolvedPath === '/' ? null : path.dirname(resolvedPath);

      // If parent is outside allowlist, don't expose it
      const parent = parentPath && isPathAllowed(parentPath, allowedRoots) ? parentPath : null;

      const result: BrowseResult = {
        currentPath: resolvedPath,
        parent,
        directories,
      };

      return res.json(result);
    } catch (err: any) {
      logger.error('[Filesystem] Browse error:', err);
      if (err.code === 'EACCES') {
        return res.status(403).json({ error: 'Permission denied' });
      }
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  /**
   * GET /api/filesystem/autocomplete?query=/some/path
   *
   * Unraid-style path autocomplete.
   * Parses the query into parent directory and current prefix,
   * checks if the exact path exists, and returns matching subdirectories.
   */
  router.get('/autocomplete', async (req, res) => {
    try {
      let rawQuery = (req.query.query as string || '').trim();
      if (!rawQuery) {
        rawQuery = '/';
      }

      // Ensure leading slash
      if (!rawQuery.startsWith('/')) {
        rawQuery = '/' + rawQuery;
      }

      const allowedRoots = getAllowedRoots();

      let parentDir: string;
      let currentPrefix: string;

      if (rawQuery.endsWith('/') || rawQuery === '/') {
        parentDir = path.resolve(rawQuery);
        currentPrefix = '';
      } else {
        parentDir = path.dirname(rawQuery);
        currentPrefix = path.basename(rawQuery);
      }

      // Check security allowlist on parentDir
      if (!isPathAllowed(parentDir, allowedRoots)) {
        return res.json({
          query: rawQuery,
          parentDir,
          currentPrefix,
          exists: false,
          suggestions: [],
          error: 'Access denied: outside allowed roots',
        });
      }

      // Check if the exact typed path exists as a directory
      const resolvedExact = path.resolve(rawQuery);
      let exists = false;
      try {
        const exactStat = await fs.stat(resolvedExact);
        exists = exactStat.isDirectory();
      } catch {
        exists = false;
      }

      // Check if parent directory exists to read subdirectories
      let parentStat;
      try {
        parentStat = await fs.stat(parentDir);
      } catch {
        parentStat = null;
      }

      const suggestions: DirectoryEntry[] = [];

      if (parentStat && parentStat.isDirectory()) {
        try {
          const entries = await fs.readdir(parentDir, { withFileTypes: true });
          const prefixLower = currentPrefix.toLowerCase();

          for (const entry of entries) {
            // Ignore hidden entries unless query starts with .
            if (entry.name.startsWith('.') && !currentPrefix.startsWith('.')) continue;

            if (entry.isDirectory()) {
              if (!currentPrefix || entry.name.toLowerCase().startsWith(prefixLower)) {
                suggestions.push({
                  name: entry.name,
                  path: path.join(parentDir, entry.name),
                });
              }
            }
          }

          // Sort alphabetically
          suggestions.sort((a, b) => a.name.localeCompare(b.name));
        } catch (readErr: any) {
          logger.warn(`[Filesystem] Autocomplete read error in ${parentDir}:`, readErr.message);
        }
      }

      return res.json({
        query: rawQuery,
        parentDir,
        currentPrefix,
        exists,
        suggestions,
      });
    } catch (err: any) {
      logger.error('[Filesystem] Autocomplete error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  return router;
}

