import express from 'express';
import request from 'supertest';
import { createWebhooksRouter } from '../../src/routes/webhooks.routes';
import { SyncEngineService } from '../../src/services/sync-engine.service';

jest.mock('../../src/services/sync-engine.service');

describe('Webhooks Routes', () => {
  let app: express.Application;
  let syncEngine: jest.Mocked<SyncEngineService>;

  beforeEach(() => {
    syncEngine = {
      handleRadarrImport: jest.fn().mockResolvedValue(undefined),
      handleSonarrImport: jest.fn().mockResolvedValue(undefined),
    } as any;

    app = express();
    app.use(express.json());
    app.use('/', createWebhooksRouter(syncEngine));
  });

  it('POST /radarr/:instanceId with Download event returns 200 and calls sync', async () => {
    const response = await request(app)
      .post('/radarr/1')
      .send({ eventType: 'Download', movie: { title: 'Test' } });

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
    
    // Allow async execution to complete
    await new Promise(process.nextTick);
    
    expect(syncEngine.handleRadarrImport).toHaveBeenCalledWith(1, (expect as any).objectContaining({ eventType: 'Download' }));
  });

  it('POST /radarr/:instanceId with non-Download event returns 200 but does not trigger sync', async () => {
    const response = await request(app)
      .post('/radarr/1')
      .send({ eventType: 'Test' });

    expect(response.status).toBe(200);
    
    await new Promise(process.nextTick);
    
    expect(syncEngine.handleRadarrImport).not.toHaveBeenCalled();
  });

  it('POST /sonarr/:instanceId with Download event returns 200 and calls sync', async () => {
    const response = await request(app)
      .post('/sonarr/2')
      .send({ eventType: 'Download', series: { title: 'Test' } });

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
    
    await new Promise(process.nextTick);
    
    expect(syncEngine.handleSonarrImport).toHaveBeenCalledWith(2, (expect as any).objectContaining({ eventType: 'Download' }));
  });
});
