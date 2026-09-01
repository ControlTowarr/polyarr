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

      // Check if the path exists; if not, walk up to the nearest existing parent directory
      let targetPath = resolvedPath;
      let stat;
      try {
        stat = await fs.stat(targetPath);
      } catch {
        let cur = targetPath;
        while (cur && cur !== path.dirname(cur)) {
          cur = path.dirname(cur);
          try {
            const s = await fs.stat(cur);
            if (s.isDirectory() && isPathAllowed(cur, allowedRoots)) {
              targetPath = cur;
              stat = s;
              break;
            }
          } catch {
            // continue walking up
          }
        }
      }

      if (!stat || !stat.isDirectory()) {
        return res.status(404).json({ error: `Directory not found: ${resolvedPath}` });
      }

      // Read directory entries, filtering to directories only
      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      const directories: DirectoryEntry[] = [];

      for (const entry of entries) {
        // Skip hidden directories (starting with .) for cleaner browsing
        if (entry.name.startsWith('.')) continue;
        if (entry.isDirectory()) {
          directories.push({
            name: entry.name,
            path: path.join(targetPath, entry.name),
          });
        }
      }

      // Sort alphabetically
      directories.sort((a, b) => a.name.localeCompare(b.name));

      // Compute parent (null if at filesystem root)
      const parentPath = targetPath === '/' ? null : path.dirname(targetPath);

      // If parent is outside allowlist, don't expose it
      const parent = parentPath && isPathAllowed(parentPath, allowedRoots) ? parentPath : null;

      const result: BrowseResult = {
        currentPath: targetPath,
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

  return router;
}
