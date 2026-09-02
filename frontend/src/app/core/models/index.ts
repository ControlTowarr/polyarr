export interface Instance {
  id: number;
  name: string;
  type: 'radarr' | 'sonarr';
  url: string;
  apiKey: string;
  language: string;
  rootFolderPath: string;
  localPath: string;
  qualityProfileId: number;
  isMain: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SyncProfile {
  id: number;
  mainInstanceId: number;
  childInstanceId: number;
  /** Whether this sync profile is active in automated scans and syncs */
  enabled: boolean;
  /** Linking strategy: 'hardlink' (default, 0 extra storage) or 'symlink' */
  linkType: 'hardlink' | 'symlink';
  /** Delay in hours before searching the child instance if target audio is missing */
  delayHours: number;
  /**
   * If true: child instance automatically searches indexers when main file lacks target audio.
   * If false: child instance does NOT search indexers; missing audio items are ignored (no-op) and only compatible files are linked.
   */
  searchIfMissing: boolean;
  /**
   * Sonarr only: keeps season monitor status synchronized across Sonarr instances.
   */
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
  syncRunId?: string;
  syncProfileId: number;
  mediaTitle: string;
  mediaType: 'movie' | 'episode';
  externalId: string;
  action: 'linked' | 'already_linked' | 'search_triggered' | 'added' | 'season_monitored' | 'skipped' | 'would_link' | 'needs_download' | 'already_exists_child' | 'error';
  details: string;
  sourcePath?: string;
  destinationPath?: string;
  languagesDetected?: string[];
  createdAt: string;
}

export interface SyncRun {
  id: number;
  syncRunId: string;
  syncProfileId: number;
  syncProfile?: SyncProfile;
  triggerType: 'manual' | 'scheduled' | 'webhook' | 'dry_run';
  status: 'running' | 'completed' | 'partial' | 'error' | 'interrupted';
  totalScanned: number;
  linkedCount: number;
  alreadyLinkedCount: number;
  searchTriggeredCount: number;
  alreadyExistsChildCount: number;
  skippedCount: number;
  errorCount: number;
  durationMs: number;
  summary: string;
  createdAt: string;
  completedAt?: string;
}

export interface SyncRunDetail {
  run: SyncRun;
  items: SyncHistoryEntry[];
  summary: {
    totalScanned: number;
    linkedCount: number;
    alreadyLinkedCount: number;
    searchTriggeredCount: number;
    alreadyExistsChildCount: number;
    skippedCount: number;
    errorCount: number;
    durationMs: number;
  };
  categorized: {
    linked: SyncHistoryEntry[];
    alreadyLinked: SyncHistoryEntry[];
    searchTriggered: SyncHistoryEntry[];
    alreadyExistsChild: SyncHistoryEntry[];
    added: SyncHistoryEntry[];
    seasonMonitored: SyncHistoryEntry[];
    errors: SyncHistoryEntry[];
  };
}

export interface SyncRunQueryParams {
  page?: number;
  limit?: number;
  syncProfileId?: number;
  status?: string;
  triggerType?: string;
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
  syncRunId?: string;
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

export interface SyncResult {
  total: number;
  linked: number;
  alreadyLinked: number;
  alreadyExistsChild: number;
  searchTriggered: number;
  skipped: number;
  errors: number;
}

export interface DryRunItem {
  id: string;
  title: string;
  seriesTitle?: string;
  mediaType: 'movie' | 'episode';
  year?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  externalId: string;
  sourcePath?: string;
  destinationPath?: string;
  languagesDetected?: string[];
  targetLanguage: string;
  searchEnabled?: boolean;
  action:
    | 'would_link'
    | 'needs_download'
    | 'already_linked'
    | 'already_exists_child'
    | 'error';
  reason: string;
}

export interface DryRunReport {
  profileId: number;
  profileName: string;
  mainInstanceName: string;
  childInstanceName: string;
  linkType: 'hardlink' | 'symlink';
  targetLanguage: string;
  generatedAt: string;
  summary: {
    totalScanned: number;
    wouldLinkCount: number;
    needsDownloadCount: number;
    alreadyLinkedCount: number;
    alreadyExistsChildCount: number;
    errorCount: number;
  };
  wouldLink: DryRunItem[];
  needsDownload: DryRunItem[];
  alreadyLinked: DryRunItem[];
  alreadyExistsChild: DryRunItem[];
  errors: DryRunItem[];
}
