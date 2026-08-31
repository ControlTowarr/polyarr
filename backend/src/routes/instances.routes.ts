import { Router } from 'express';
import { DataSource } from 'typeorm';
import { Instance } from '../entities';
import { RadarrService } from '../services/radarr.service';
import { SonarrService } from '../services/sonarr.service';

import { LibraryScannerService } from '../services/library-scanner.service';

export function normalizeUrl(url: string): string {
  let normalized = (url || '').trim();
  if (!normalized) return '';
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `http://${normalized}`;
  }
  normalized = normalized.replace(/\/+$/, '');
  normalized = normalized.replace(/\/api(\/v\d+)?$/i, '');
  return normalized;
}

export function createInstancesRouter(db: DataSource, libraryScanner?: LibraryScannerService): Router {
  const router = Router();
  const repo = db.getRepository(Instance);

  router.get('/', async (req, res) => {
    const instances = await repo.find();
    res.json(instances);
  });

  router.get('/:id', async (req, res) => {
    const instance = await repo.findOneBy({ id: parseInt(req.params.id) });
    if (!instance) return res.status(404).json({ error: 'Not found' });
    res.json(instance);
  });

  router.post('/', async (req, res) => {
    try {
      const data = { ...req.body };
      if (data.url) {
        data.url = normalizeUrl(data.url);
      }

      // Auto-fetch root folder & quality profile if not explicitly supplied
      if ((!data.rootFolderPath || !data.qualityProfileId) && data.url && data.apiKey) {
        try {
          const service = data.type === 'radarr'
            ? new RadarrService(data.url, data.apiKey)
            : new SonarrService(data.url, data.apiKey);

          if (!data.rootFolderPath) {
            const rootFolders = await service.getRootFolders().catch(() => []);
            if (rootFolders.length > 0) {
              data.rootFolderPath = rootFolders[0].path;
            }
          }

          if (!data.qualityProfileId) {
            const profiles = await service.getQualityProfiles().catch(() => []);
            if (profiles.length > 0) {
              data.qualityProfileId = profiles[0].id;
            }
          }
        } catch {
          // Non-blocking fallback to defaults
        }
      }

      const instance = repo.create(data);
      await repo.save(instance);
      res.status(201).json(instance);
    } catch (e: any) {
      res.status(400).json({ error: e.message || 'Failed to create instance' });
    }
  });

  router.put('/:id', async (req, res) => {
    const instance = await repo.findOneBy({ id: parseInt(req.params.id) });
    if (!instance) return res.status(404).json({ error: 'Not found' });
    const data = { ...req.body };
    if (data.url) {
      data.url = normalizeUrl(data.url);
    }
    repo.merge(instance, data);
    await repo.save(instance);
    res.json(instance);
  });

  router.delete('/:id', async (req, res) => {
    await repo.delete(parseInt(req.params.id));
    res.status(204).send();
  });

  router.post('/test-connection', async (req, res) => {
    let { type, url, apiKey } = req.body;
    if (!type || !url || !apiKey) {
      return res.status(400).json({ error: 'Type, URL, and API Key are required' });
    }
    url = normalizeUrl(url);
    try {
      const service = type === 'radarr' 
        ? new RadarrService(url, apiKey)
        : new SonarrService(url, apiKey);
      const status = await service.testConnection();
      res.json({ success: true, ...status, url });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message || 'Connection failed' });
    }
  });

  router.post('/fetch-root-folders', async (req, res) => {
    let { type, url, apiKey } = req.body;
    if (!type || !url || !apiKey) {
      return res.status(400).json({ error: 'Type, URL, and API Key are required' });
    }
    url = normalizeUrl(url);
    try {
      const service = type === 'radarr' 
        ? new RadarrService(url, apiKey)
        : new SonarrService(url, apiKey);
      const rootFolders = await service.getRootFolders();
      res.json(rootFolders);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/fetch-quality-profiles', async (req, res) => {
    let { type, url, apiKey } = req.body;
    if (!type || !url || !apiKey) {
      return res.status(400).json({ error: 'Type, URL, and API Key are required' });
    }
    url = normalizeUrl(url);
    try {
      const service = type === 'radarr' 
        ? new RadarrService(url, apiKey)
        : new SonarrService(url, apiKey);
      const profiles = await service.getQualityProfiles();
      res.json(profiles);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/:id/test', async (req, res) => {
    const instance = await repo.findOneBy({ id: parseInt(req.params.id) });
    if (!instance) return res.status(404).json({ error: 'Not found' });
    try {
      const service = instance.type === 'radarr' 
        ? new RadarrService(instance.url, instance.apiKey)
        : new SonarrService(instance.url, instance.apiKey);
      const status = await service.testConnection();
      res.json(status);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  router.get('/:id/root-folders', async (req, res) => {
    const instance = await repo.findOneBy({ id: parseInt(req.params.id) });
    if (!instance) return res.status(404).json({ error: 'Not found' });
    try {
      const service = instance.type === 'radarr' 
        ? new RadarrService(instance.url, instance.apiKey)
        : new SonarrService(instance.url, instance.apiKey);
      const rootFolders = await service.getRootFolders();
      res.json(rootFolders);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  router.get('/:id/quality-profiles', async (req, res) => {
    const instance = await repo.findOneBy({ id: parseInt(req.params.id) });
    if (!instance) return res.status(404).json({ error: 'Not found' });
    try {
      const service = instance.type === 'radarr' 
        ? new RadarrService(instance.url, instance.apiKey)
        : new SonarrService(instance.url, instance.apiKey);
      const profiles = await service.getQualityProfiles();
      res.json(profiles);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/:id/scan', async (req, res) => {
    const instance = await repo.findOneBy({ id: parseInt(req.params.id) });
    if (!instance) return res.status(404).json({ error: 'Not found' });
    try {
      const scanner = libraryScanner || new LibraryScannerService(db);
      const result = await scanner.scanSingleInstance(instance);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
}
