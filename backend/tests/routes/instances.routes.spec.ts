import express from 'express';
import request from 'supertest';
import { createInstancesRouter } from '../../src/routes/instances.routes';
import { DataSource } from 'typeorm';
import { RadarrService } from '../../src/services/radarr.service';
import { SonarrService } from '../../src/services/sonarr.service';

jest.mock('../../src/services/radarr.service');
jest.mock('../../src/services/sonarr.service');

describe('Instances Routes', () => {
  let app: express.Application;
  let db: jest.Mocked<DataSource>;
  let mockRepository: any;

  beforeEach(() => {
    mockRepository = {
      find: jest.fn().mockResolvedValue([{ id: 1, name: 'Inst 1' }]),
      findOneBy: jest.fn().mockResolvedValue({ id: 1, type: 'radarr', url: 'url', apiKey: 'key' }),
      create: jest.fn().mockImplementation(data => data),
      save: jest.fn().mockResolvedValue(undefined),
      merge: jest.fn().mockImplementation((dest, src) => Object.assign(dest, src)),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    db = {
      getRepository: jest.fn().mockReturnValue(mockRepository),
    } as unknown as jest.Mocked<DataSource>;

    app = express();
    app.use(express.json());
    app.use('/instances', createInstancesRouter(db));
    jest.clearAllMocks();
  });

  it('GET /instances returns list', async () => {
    const res = await request(app).get('/instances');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1, name: 'Inst 1' }]);
  });

  it('POST /instances creates new instance', async () => {
    const newInstance = { name: 'Inst 2', type: 'radarr' };
    const res = await request(app).post('/instances').send(newInstance);
    expect(res.status).toBe(201);
    expect(mockRepository.create).toHaveBeenCalledWith(newInstance);
    expect(mockRepository.save).toHaveBeenCalled();
  });

  it('PUT /instances/:id updates instance', async () => {
    const res = await request(app).put('/instances/1').send({ name: 'Updated' });
    expect(res.status).toBe(200);
    expect(mockRepository.merge).toHaveBeenCalled();
    expect(mockRepository.save).toHaveBeenCalled();
  });

  it('DELETE /instances/:id deletes instance', async () => {
    const res = await request(app).delete('/instances/1');
    expect(res.status).toBe(204);
    expect(mockRepository.delete).toHaveBeenCalledWith(1);
  });

  it('POST /instances/:id/test tests connection for radarr', async () => {
    (RadarrService.prototype.testConnection as jest.Mock).mockResolvedValue(true);
    const res = await request(app).post('/instances/1/test');
    expect(res.status).toBe(200);
    expect(res.body).toBe(true);
  });

  it('returns 404 for non-existent instance test', async () => {
    mockRepository.findOneBy.mockResolvedValue(null);
    const res = await request(app).post('/instances/99/test');
    expect(res.status).toBe(404);
  });

  it('POST /instances/test-connection auto-detects Sonarr instance', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ appName: 'Sonarr', version: '4.0.1', instanceName: 'Sonarr Anime' }),
    } as any);

    const res = await request(app)
      .post('/instances/test-connection')
      .send({ url: 'http://sonarr.local:8989', apiKey: 'testkey' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      type: 'sonarr',
      version: '4.0.1',
      instanceName: 'Sonarr Anime',
      url: 'http://sonarr.local:8989',
    });

    global.fetch = originalFetch;
  });

  it('POST /instances/test-connection auto-detects Radarr instance', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ appName: 'Radarr', version: '5.1.0', instanceName: 'Radarr 4K' }),
    } as any);

    const res = await request(app)
      .post('/instances/test-connection')
      .send({ url: 'http://radarr.local:7878', apiKey: 'testkey' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      type: 'radarr',
      version: '5.1.0',
      instanceName: 'Radarr 4K',
      url: 'http://radarr.local:7878',
    });

    global.fetch = originalFetch;
  });
});
