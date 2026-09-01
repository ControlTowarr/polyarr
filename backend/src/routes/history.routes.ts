import { Router } from 'express';
import { DataSource } from 'typeorm';
import { SyncHistory, SyncRun } from '../entities';

export function createHistoryRouter(db: DataSource): Router {
  const router = Router();
  const historyRepo = db.getRepository(SyncHistory);
  const runRepo = db.getRepository(SyncRun);

  // 1. Get paginated sync runs (events)
  router.get('/runs', async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const syncProfileId = req.query.syncProfileId ? parseInt(req.query.syncProfileId as string) : undefined;
      const status = req.query.status as string;
      const triggerType = req.query.triggerType as string;

      const query = runRepo.createQueryBuilder('run')
        .leftJoinAndSelect('run.syncProfile', 'syncProfile')
        .leftJoinAndSelect('syncProfile.mainInstance', 'mainInstance')
        .leftJoinAndSelect('syncProfile.childInstance', 'childInstance');

      if (syncProfileId) {
        query.andWhere('run.syncProfileId = :syncProfileId', { syncProfileId });
      }
      if (status) {
        query.andWhere('run.status = :status', { status });
      }
      if (triggerType) {
        query.andWhere('run.triggerType = :triggerType', { triggerType });
      }

      query.orderBy('run.createdAt', 'DESC');
      query.skip((page - 1) * limit).take(limit);

      const [items, total] = await query.getManyAndCount();
      res.json({ data: items, items, total, page, limit });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Get single sync run detail with categorized items & logs
  router.get('/runs/:id', async (req, res) => {
    try {
      const idParam = req.params.id;
      const isNumeric = /^\d+$/.test(idParam);

      const query = runRepo.createQueryBuilder('run')
        .leftJoinAndSelect('run.syncProfile', 'syncProfile')
        .leftJoinAndSelect('syncProfile.mainInstance', 'mainInstance')
        .leftJoinAndSelect('syncProfile.childInstance', 'childInstance');

      if (isNumeric) {
        query.where('run.id = :id', { id: parseInt(idParam, 10) });
      } else {
        query.where('run.syncRunId = :id', { id: idParam });
      }

      const run = await query.getOne();
      if (!run) {
        return res.status(404).json({ error: 'Sync run not found' });
      }

      // Fetch all items belonging to this run
      const items = await historyRepo.find({
        where: { syncRunId: run.syncRunId },
        order: { createdAt: 'ASC' }
      });

      // Group items into categorized buckets for the modal view
      const linked = items.filter(i => i.action === 'linked' || i.action === 'would_link');
      const alreadyLinked = items.filter(i => i.action === 'already_linked');
      const searchTriggered = items.filter(i => i.action === 'search_triggered' || i.action === 'needs_download');
      const alreadyExistsChild = items.filter(i => i.action === 'already_exists_child');
      const added = items.filter(i => i.action === 'added');
      const seasonMonitored = items.filter(i => i.action === 'season_monitored');
      const errors = items.filter(i => i.action === 'error');

      res.json({
        run,
        items,
        summary: {
          totalScanned: run.totalScanned,
          linkedCount: run.linkedCount,
          alreadyLinkedCount: run.alreadyLinkedCount,
          searchTriggeredCount: run.searchTriggeredCount,
          alreadyExistsChildCount: run.alreadyExistsChildCount,
          skippedCount: run.skippedCount,
          errorCount: run.errorCount,
          durationMs: run.durationMs
        },
        categorized: {
          linked,
          alreadyLinked,
          searchTriggered,
          alreadyExistsChild,
          added,
          seasonMonitored,
          errors
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Get raw log entries (backward-compatible & for raw log tab)
  const getLogsHandler = async (req: any, res: any) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const syncProfileId = req.query.syncProfileId ? parseInt(req.query.syncProfileId as string) : undefined;
      const syncRunId = req.query.syncRunId as string;
      const action = req.query.action as string;

      const query = historyRepo.createQueryBuilder('history')
        .leftJoinAndSelect('history.syncProfile', 'syncProfile')
        .leftJoinAndSelect('syncProfile.mainInstance', 'mainInstance')
        .leftJoinAndSelect('syncProfile.childInstance', 'childInstance');

      if (syncProfileId) {
        query.andWhere('history.syncProfileId = :syncProfileId', { syncProfileId });
      }
      if (syncRunId) {
        query.andWhere('history.syncRunId = :syncRunId', { syncRunId });
      }
      if (action) {
        query.andWhere('history.action = :action', { action });
      }

      query.orderBy('history.createdAt', 'DESC');
      query.skip((page - 1) * limit).take(limit);

      const [items, total] = await query.getManyAndCount();
      res.json({ data: items, items, total, page, limit });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  router.get('/logs', getLogsHandler);
  router.get('/', getLogsHandler);

  return router;
}

