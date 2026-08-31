import { Router } from 'express';
import { DataSource } from 'typeorm';
import { SyncProfile, SyncHistory } from '../entities';
import { LibraryScannerService } from '../services/library-scanner.service';
import { SyncEngineService } from '../services/sync-engine.service';

export function createSyncProfilesRouter(
  db: DataSource,
  libraryScanner: LibraryScannerService,
  syncEngine?: SyncEngineService
): Router {
  const router = Router();
  const repo = db.getRepository(SyncProfile);
  const historyRepo = db.getRepository(SyncHistory);

  router.get('/', async (req, res) => {
    const profiles = await repo.find({ relations: ['mainInstance', 'childInstance'] });
    res.json(profiles);
  });

  router.get('/:id', async (req, res) => {
    const profile = await repo.findOne({ where: { id: parseInt(req.params.id) }, relations: ['mainInstance', 'childInstance'] });
    if (!profile) return res.status(404).json({ error: 'Not found' });
    res.json(profile);
  });

  router.post('/', async (req, res) => {
    try {
      const data = { ...req.body };
      if (!data.mainPath) data.mainPath = '';
      if (!data.childPath) data.childPath = '';
      const profile = repo.create(data);
      await repo.save(profile);
      const saved = await repo.findOne({ where: { id: (profile as any).id }, relations: ['mainInstance', 'childInstance'] });
      res.status(201).json(saved || profile);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  router.put('/:id', async (req, res) => {
    const profile = await repo.findOneBy({ id: parseInt(req.params.id) });
    if (!profile) return res.status(404).json({ error: 'Not found' });
    repo.merge(profile, req.body);
    await repo.save(profile);
    const updated = await repo.findOne({ where: { id: profile.id }, relations: ['mainInstance', 'childInstance'] });
    res.json(updated || profile);
  });

  router.delete('/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await historyRepo.delete({ syncProfileId: id });
      await repo.delete(id);
      res.status(204).send();
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Safe discovery scan for instances in profile
  router.post('/:id/scan', async (req, res) => {
    try {
      const result = await libraryScanner.scanLibrary(parseInt(req.params.id));
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Explicit sync operation (executes hardlinks / searches according to rules)
  router.post('/:id/sync', async (req, res) => {
    try {
      if (!syncEngine) {
        return res.status(500).json({ error: 'Sync engine not available' });
      }
      const result = await syncEngine.syncProfile(parseInt(req.params.id));
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
}
