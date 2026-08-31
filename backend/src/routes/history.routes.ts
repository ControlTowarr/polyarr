import { Router } from 'express';
import { DataSource } from 'typeorm';
import { SyncHistory } from '../entities';

export function createHistoryRouter(db: DataSource): Router {
  const router = Router();
  const repo = db.getRepository(SyncHistory);

  router.get('/', async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const syncProfileId = req.query.syncProfileId ? parseInt(req.query.syncProfileId as string) : undefined;
    const action = req.query.action as string;

    const query = repo.createQueryBuilder('history')
      .leftJoinAndSelect('history.syncProfile', 'syncProfile');

    if (syncProfileId) {
      query.andWhere('history.syncProfileId = :syncProfileId', { syncProfileId });
    }
    if (action) {
      query.andWhere('history.action = :action', { action });
    }

    query.orderBy('history.createdAt', 'DESC');
    query.skip((page - 1) * limit).take(limit);

    const [items, total] = await query.getManyAndCount();
    res.json({ data: items, items, total, page, limit });
  });

  return router;
}
