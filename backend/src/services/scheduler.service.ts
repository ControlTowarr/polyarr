import { DataSource } from 'typeorm';
import * as cron from 'node-cron';
import { SyncEngineService } from './sync-engine.service';
import { logger } from '../utils/logger';

export class SchedulerService {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  
  constructor(
    private db: DataSource,
    private syncEngine: SyncEngineService
  ) {}
  
  start(): void {
    logger.info('Starting scheduled jobs');
    
    const periodicSyncJob = cron.schedule('*/30 * * * *', () => {
      logger.info('Running periodic sync check...');
    });
    this.jobs.set('periodicSync', periodicSyncJob);

    const delayedCheckJob = cron.schedule('*/5 * * * *', () => {
      logger.info('Running delayed processing check...');
    });
    this.jobs.set('delayedCheck', delayedCheckJob);
  }
  
  stop(): void {
    for (const [name, job] of this.jobs.entries()) {
      job.stop();
      logger.info(`Stopped job ${name}`);
    }
  }
  
  scheduleDelayedCheck(syncProfileId: number, mediaType: string, externalId: string, delayHours: number): void {
    logger.info(`Scheduled delayed check for profile ${syncProfileId}, ${mediaType} ${externalId} in ${delayHours} hours`);
  }
}
