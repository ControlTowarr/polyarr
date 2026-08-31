import { Router } from 'express';
import { SyncEngineService } from '../services/sync-engine.service';
import { logger } from '../utils/logger';

export function createWebhooksRouter(syncEngine: SyncEngineService): Router {
  const router = Router();

  router.post('/radarr/:instanceId', (req, res) => {
    const instanceId = parseInt(req.params.instanceId);
    logger.debug(`Received Radarr webhook for instance ${instanceId}: ${JSON.stringify(req.body)}`);
    
    // Respond immediately
    res.status(200).send('OK');

    // Process async
    if (req.body.eventType === 'Download') {
      syncEngine.handleRadarrImport(instanceId, req.body).catch(e => {
        logger.error(`Error processing radarr webhook:`, e);
      });
    }
  });

  router.post('/sonarr/:instanceId', (req, res) => {
    const instanceId = parseInt(req.params.instanceId);
    logger.debug(`Received Sonarr webhook for instance ${instanceId}: ${JSON.stringify(req.body)}`);
    
    // Respond immediately
    res.status(200).send('OK');

    // Process async
    if (req.body.eventType === 'Download') {
      syncEngine.handleSonarrImport(instanceId, req.body).catch(e => {
        logger.error(`Error processing sonarr webhook:`, e);
      });
    }
  });

  return router;
}
