import { DataSource } from 'typeorm';
import * as path from 'path';
import { Instance, SyncProfile, MediaItem, MediaItemInstance, SyncHistory } from '../entities';

export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: path.join(process.env.DATA_DIR || './data', 'polyarr.sqlite'),
  synchronize: true,
  logging: false,
  entities: [Instance, SyncProfile, MediaItem, MediaItemInstance, SyncHistory],
  migrations: [],
  subscribers: [],
});

export const initializeDatabase = async () => {
  await AppDataSource.initialize();
  return AppDataSource;
};
