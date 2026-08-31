import { Router } from 'express';
import { DataSource } from 'typeorm';
import { MediaItem, MediaItemInstance, SyncHistory } from '../entities';
import { LibraryScannerService } from '../services/library-scanner.service';

export function createMediaRouter(db: DataSource, libraryScanner?: LibraryScannerService): Router {
  const router = Router();
  const mediaRepo = db.getRepository(MediaItem);
  const instanceRepo = db.getRepository(MediaItemInstance);
  const historyRepo = db.getRepository(SyncHistory);

  router.get('/', async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const mediaType = req.query.mediaType as string;
    const syncStatus = req.query.syncStatus as string;
    const language = req.query.language as string;
    const search = req.query.search as string;

    const query = mediaRepo.createQueryBuilder('media')
      .leftJoinAndSelect('media.instances', 'instances')
      .leftJoinAndSelect('instances.instance', 'instance');

    // Default: Must exist in at least one main instance
    query.where(qb => {
      const subQuery = qb.subQuery()
        .select('mii.mediaItemId')
        .from(MediaItemInstance, 'mii')
        .innerJoin('mii.instance', 'inst')
        .where('inst.isMain = :isMain', { isMain: true })
        .getQuery();
      return `media.id IN ${subQuery}`;
    });

    if (mediaType) {
      query.andWhere('media.mediaType = :mediaType', { mediaType });
    }
    
    if (search) {
      query.andWhere('LOWER(media.title) LIKE LOWER(:search)', { search: `%${search}%` });
    }

    if (syncStatus === 'main_only') {
      // Must NOT exist in any child instance
      query.andWhere(qb => {
        const subQuery = qb.subQuery()
          .select('mii_child.mediaItemId')
          .from(MediaItemInstance, 'mii_child')
          .innerJoin('mii_child.instance', 'inst_child')
          .where('inst_child.isMain = false')
          .getQuery();
        return `media.id NOT IN ${subQuery}`;
      });
    } else if (syncStatus === 'synced') {
      // Must exist in at least one child instance
      query.andWhere(qb => {
        const subQuery = qb.subQuery()
          .select('mii_child.mediaItemId')
          .from(MediaItemInstance, 'mii_child')
          .innerJoin('mii_child.instance', 'inst_child')
          .where('inst_child.isMain = false')
          .getQuery();
        return `media.id IN ${subQuery}`;
      });
    }

    query.orderBy('media.id', 'DESC');
    query.skip((page - 1) * limit).take(limit);

    let [items, total] = await query.getManyAndCount();

    if (language) {
      const langLower = language.toLowerCase();
      items = items.filter(item =>
        item.instances?.some(inst =>
          inst.audioLanguages?.some(l => l.toLowerCase() === langLower) ||
          inst.instance?.language?.toLowerCase() === langLower
        )
      );
    }

    res.json({ data: items, items, total, page, limit });
  });

  router.get('/stats', async (req, res) => {
    try {
      // Count total items on Main instance
      const mainItemsQuery = mediaRepo.createQueryBuilder('media')
        .where(qb => {
          const subQuery = qb.subQuery()
            .select('mii.mediaItemId')
            .from(MediaItemInstance, 'mii')
            .innerJoin('mii.instance', 'inst')
            .where('inst.isMain = true')
            .getQuery();
          return `media.id IN ${subQuery}`;
        });

      const totalItems = await mainItemsQuery.getCount();

      // Count items on Main + at least one Child (Synced)
      const syncedQuery = mediaRepo.createQueryBuilder('media')
        .where(qb => {
          const subMain = qb.subQuery()
            .select('m1.mediaItemId')
            .from(MediaItemInstance, 'm1')
            .innerJoin('m1.instance', 'inst1')
            .where('inst1.isMain = true')
            .getQuery();
          return `media.id IN ${subMain}`;
        })
        .andWhere(qb => {
          const subChild = qb.subQuery()
            .select('m2.mediaItemId')
            .from(MediaItemInstance, 'm2')
            .innerJoin('m2.instance', 'inst2')
            .where('inst2.isMain = false')
            .getQuery();
          return `media.id IN ${subChild}`;
        });

      const syncedCount = await syncedQuery.getCount();
      const mainOnlyCount = Math.max(0, totalItems - syncedCount);

      res.json({
        totalItems,
        syncedCount,
        mainOnlyCount,
        linkedCount: syncedCount,
        downloadedCount: totalItems,
        pendingCount: 0,
        errorCount: 0
      });
    } catch (e: any) {
      res.json({
        totalItems: 0,
        syncedCount: 0,
        mainOnlyCount: 0,
        linkedCount: 0,
        downloadedCount: 0,
        pendingCount: 0,
        errorCount: 0
      });
    }
  });

  // Safe read-only library discovery scan
  router.post('/scan', async (req, res) => {
    try {
      const scanner = libraryScanner || new LibraryScannerService(db);
      const result = await scanner.scanAllLibraries();
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/:id', async (req, res) => {
    const item = await mediaRepo.findOne({
      where: { id: parseInt(req.params.id) },
      relations: ['instances', 'instances.instance']
    });
    if (!item) return res.status(404).json({ error: 'Not found' });

    const syncHistory = await historyRepo.find({
      where: { externalId: item.externalId },
      order: { createdAt: 'DESC' },
      take: 20
    });

    res.json({ ...item, syncHistory });
  });

  return router;
}
