import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import * as path from 'path';

import { initializeDatabase } from './config/database';
import { SyncRun } from './entities';
import { logger } from './utils/logger';

// Services
import { SettingsService } from './services/settings.service';
import { MediaInspectorService } from './services/media-inspector.service';
import { LinkerService } from './services/linker.service';
import { SyncEngineService } from './services/sync-engine.service';
import { LibraryScannerService } from './services/library-scanner.service';
import { SchedulerService } from './services/scheduler.service';

// Routes
import { createInstancesRouter } from './routes/instances.routes';
import { createSyncProfilesRouter } from './routes/sync-profiles.routes';
import { createWebhooksRouter } from './routes/webhooks.routes';
import { createMediaRouter } from './routes/media.routes';
import { createHistoryRouter } from './routes/history.routes';
import { createSettingsRouter } from './routes/settings.routes';

async function bootstrap() {
  try {
    const db = await initializeDatabase();
    logger.info('Database initialized');

    // Recover any in-flight sync runs left over from an unexpected shutdown/restart
    try {
      const syncRunRepo = db.getRepository(SyncRun);
      const runningRuns = await syncRunRepo.find({ where: { status: 'running' } });
      if (runningRuns.length > 0) {
        logger.warn(`[Startup] Found ${runningRuns.length} interrupted sync run(s) from prior session. Marking as interrupted.`);
        for (const run of runningRuns) {
          run.status = 'interrupted';
          run.summary = run.summary && run.summary.trim() !== ''
            ? `${run.summary} (Interrupted by server restart)`
            : 'Sync interrupted: Server was restarted while sync was in progress.';
          run.completedAt = new Date();
          await syncRunRepo.save(run);
        }
      }
    } catch (recoveryErr) {
      logger.warn('[Startup] Failed to recover interrupted sync runs:', recoveryErr);
    }

    const app = express();
    app.set('etag', false);
    app.use(cors());
    app.use(express.json());

    // Prevent 304 caching on dynamic API routes
    app.use('/api', (req, res, next) => {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      next();
    });

    // Initialize Services
    const settingsService = new SettingsService();
    const mediaInspector = new MediaInspectorService();
    const linker = new LinkerService();
    const syncEngine = new SyncEngineService(db, mediaInspector, linker);
    const libraryScanner = new LibraryScannerService(db);
    const scheduler = new SchedulerService(db, syncEngine);

    // Mount Routes
    app.use('/api/instances', createInstancesRouter(db, libraryScanner));
    app.use('/api/sync-profiles', createSyncProfilesRouter(db, libraryScanner, syncEngine));
    app.use('/api/webhooks', createWebhooksRouter(syncEngine));
    app.use('/api/media', createMediaRouter(db, libraryScanner));
    app.use('/api/history', createHistoryRouter(db));
    app.use('/api/settings', createSettingsRouter(settingsService));

    // Serve static files for Angular SPA
    const fs = require('fs');
    const possiblePaths = [
      path.join(__dirname, '../../frontend/dist/frontend/browser'),
      path.join(__dirname, '../frontend/dist/frontend/browser'),
      path.join(process.cwd(), 'frontend/dist/frontend/browser'),
      path.join(process.cwd(), '../frontend/dist/frontend/browser'),
      path.join(__dirname, '../../public'),
    ];
    const publicPath = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[0];
    logger.info(`Serving static files from: ${publicPath}`);

    app.use(express.static(publicPath));
    app.use((req, res) => {
      const indexPath = path.join(publicPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Polyarr UI is building or not found. Please check http://localhost:4200 during dev.');
      }
    });

    const PORT = parseInt(process.env.PORT || '3000', 10);
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server listening on port ${PORT}`);
      scheduler.start();
    });

    // Graceful Shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received. Shutting down gracefully.');
      scheduler.stop();
      server.close(() => {
        logger.info('Server closed.');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
