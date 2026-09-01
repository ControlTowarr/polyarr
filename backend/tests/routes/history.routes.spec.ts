import express from 'express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createHistoryRouter } from '../../src/routes/history.routes';

describe('History Routes', () => {
  let app: express.Application;
  let db: jest.Mocked<DataSource>;
  let mockHistoryRepo: any;
  let mockRunRepo: any;

  beforeEach(() => {
    mockHistoryRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [
            { id: 1, mediaTitle: 'Movie A', action: 'linked', createdAt: new Date() }
          ],
          1
        ])
      }),
      find: jest.fn().mockResolvedValue([
        { id: 1, mediaTitle: 'Movie A', action: 'linked', details: 'Hardlinked file', createdAt: new Date() },
        { id: 2, mediaTitle: 'Movie B', action: 'search_triggered', details: 'Searched for missing lang', createdAt: new Date() },
        { id: 3, mediaTitle: 'Movie C', action: 'error', details: 'Failed lookup', createdAt: new Date() }
      ])
    };

    mockRunRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [
            {
              id: 1,
              syncRunId: 'sync-1-100',
              syncProfileId: 1,
              status: 'completed',
              totalScanned: 10,
              linkedCount: 5,
              errorCount: 0,
              durationMs: 1200,
              createdAt: new Date()
            }
          ],
          1
        ]),
        getOne: jest.fn().mockResolvedValue({
          id: 1,
          syncRunId: 'sync-1-100',
          syncProfileId: 1,
          status: 'completed',
          totalScanned: 10,
          linkedCount: 5,
          errorCount: 0,
          durationMs: 1200,
          createdAt: new Date()
        })
      })
    };

    db = {
      getRepository: jest.fn((entity: any) => {
        if (entity.name === 'SyncRun' || entity.toString().includes('SyncRun')) {
          return mockRunRepo;
        }
        return mockHistoryRepo;
      })
    } as unknown as jest.Mocked<DataSource>;

    app = express();
    app.use(express.json());
    app.use('/', createHistoryRouter(db));
  });

  it('GET /runs returns paginated sync runs', async () => {
    const response = await request(app).get('/runs?page=1&limit=10');
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].syncRunId).toBe('sync-1-100');
    expect(response.body.total).toBe(1);
  });

  it('GET /runs/:id returns detailed sync run with categorized items', async () => {
    const response = await request(app).get('/runs/1');
    expect(response.status).toBe(200);
    expect(response.body.run.id).toBe(1);
    expect(response.body.items).toHaveLength(3);
    expect(response.body.categorized.linked).toHaveLength(1);
    expect(response.body.categorized.searchTriggered).toHaveLength(1);
    expect(response.body.categorized.errors).toHaveLength(1);
  });

  it('GET /runs with triggerType filters runs', async () => {
    const response = await request(app).get('/runs?triggerType=dry_run');
    expect(response.status).toBe(200);
    expect(mockRunRepo.createQueryBuilder().andWhere).toHaveBeenCalledWith('run.triggerType = :triggerType', { triggerType: 'dry_run' });
  });

  it('GET /runs/:id categorizes would_link, needs_download, and already_exists_child', async () => {
    mockHistoryRepo.find.mockResolvedValueOnce([
      { id: 1, mediaTitle: 'Movie A', action: 'would_link', details: 'Contains FR audio', createdAt: new Date() },
      { id: 2, mediaTitle: 'Movie B', action: 'needs_download', details: 'Missing FR audio', createdAt: new Date() },
      { id: 3, mediaTitle: 'Movie C', action: 'already_exists_child', details: 'Secondary has file', createdAt: new Date() },
      { id: 4, mediaTitle: 'Movie D', action: 'error', details: 'Lookup error', createdAt: new Date() },
    ]);

    const response = await request(app).get('/runs/1');
    expect(response.status).toBe(200);
    expect(response.body.categorized.linked).toHaveLength(1);
    expect(response.body.categorized.searchTriggered).toHaveLength(1);
    expect(response.body.categorized.alreadyExistsChild).toHaveLength(1);
    expect(response.body.categorized.errors).toHaveLength(1);
  });

  it('GET /logs returns flat history logs', async () => {
    const response = await request(app).get('/logs');
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].mediaTitle).toBe('Movie A');
  });
});

