export interface Instance {
  id: number;
  name: string;
  type: 'radarr' | 'sonarr';
  url: string;
  apiKey: string;
  language: string;
  rootFolderPath: string;
  qualityProfileId: number;
  isMain: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SyncProfile {
  id: number;
  mainInstanceId: number;
  childInstanceId: number;
  enabled: boolean;
  linkType: 'hardlink' | 'symlink';
  delayHours: number;
  searchIfMissing: boolean;
  syncMonitoredSeasons: boolean;
  mainPath: string;
  childPath: string;
  mainInstance?: Instance;
  childInstance?: Instance;
  createdAt: string;
  updatedAt: string;
}

export interface MediaItem {
  id: number;
  externalId: string;
  mediaType: 'movie' | 'series';
  title: string;
  year: number;
  overview?: string;
  posterUrl?: string | null;
  instances: MediaItemInstance[];
}

export interface MediaItemInstance {
  id: number;
  instanceId: number;
  instance?: Instance;
  arrId: number;
  status: 'available' | 'monitored' | 'missing';
  syncMethod: 'linked' | 'downloaded' | 'not_synced' | null;
  audioLanguages: string[];
  filePath: string | null;
}

export interface MediaItemDetail extends MediaItem {
  syncHistory: SyncHistoryEntry[];
}

export interface SyncHistoryEntry {
  id: number;
  syncProfileId: number;
  mediaTitle: string;
  mediaType: 'movie' | 'episode';
  externalId: string;
  action: 'linked' | 'search_triggered' | 'added' | 'season_monitored' | 'error';
  details: string;
  createdAt: string;
}

export interface MediaStats {
  totalItems: number;
  syncedCount: number;
  mainOnlyCount: number;
  linkedCount?: number;
  downloadedCount?: number;
  pendingCount?: number;
  errorCount?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface MediaQueryParams {
  page?: number;
  limit?: number;
  mediaType?: string;
  syncStatus?: string;
  instanceId?: number;
  search?: string;
  language?: string;
}

export interface HistoryQueryParams {
  page?: number;
  limit?: number;
  syncProfileId?: number;
  action?: string;
  mediaType?: string;
  search?: string;
}

export interface Settings {
  setup_completed?: boolean;
  syncIntervalMinutes?: number;
  defaultDelayHours?: number;
  defaultLinkType?: 'hardlink' | 'symlink';
  logLevel?: string;
}

export interface RootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

export interface QualityProfile {
  id: number;
  name: string;
}

export interface ScanResult {
  total: number;
  linked: number;
  searchTriggered: number;
  alreadyExists: number;
  errors: number;
}
