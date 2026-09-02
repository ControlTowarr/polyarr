import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Instance,
  SyncProfile,
  MediaItem,
  MediaItemDetail,
  MediaStats,
  SyncHistoryEntry,
  SyncRun,
  SyncRunDetail,
  SyncRunQueryParams,
  Settings,
  RootFolder,
  QualityProfile,
  ScanResult,
  DryRunReport,
  PaginatedResult,
  MediaQueryParams,
  HistoryQueryParams
} from '../models';

export interface CachedDashboardState {
  mediaItems: MediaItem[];
  totalItems: number;
  page: number;
  limit: number;
  filters: {
    search: string;
    mediaType: string;
    syncStatus: string;
    language: string;
  };
  stats: MediaStats | null;
  scrollY: number;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = '/api';
  cachedDashboardState: CachedDashboardState | null = null;

  clearDashboardCache(): void {
    this.cachedDashboardState = null;
  }

  constructor(private http: HttpClient) {}

  // Instances
  getInstances(): Observable<Instance[]> {
    return this.http.get<Instance[]>(`${this.baseUrl}/instances`);
  }
  
  getInstance(id: number): Observable<Instance> {
    return this.http.get<Instance>(`${this.baseUrl}/instances/${id}`);
  }
  
  createInstance(data: Partial<Instance>): Observable<Instance> {
    return this.http.post<Instance>(`${this.baseUrl}/instances`, data);
  }
  
  updateInstance(id: number, data: Partial<Instance>): Observable<Instance> {
    return this.http.put<Instance>(`${this.baseUrl}/instances/${id}`, data);
  }
  
  deleteInstance(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/instances/${id}`);
  }
  
  testInstance(id: number): Observable<{ version: string }> {
    return this.http.post<{ version: string }>(`${this.baseUrl}/instances/${id}/test`, {});
  }

  testDirectConnection(data: { type?: string; url: string; apiKey: string }): Observable<{ success: boolean; type?: 'radarr' | 'sonarr'; version?: string; instanceName?: string; error?: string; url?: string }> {
    return this.http.post<{ success: boolean; type?: 'radarr' | 'sonarr'; version?: string; instanceName?: string; error?: string; url?: string }>(`${this.baseUrl}/instances/test-connection`, data);
  }

  fetchDirectRootFolders(data: { type?: string; url: string; apiKey: string }): Observable<RootFolder[]> {
    return this.http.post<RootFolder[]>(`${this.baseUrl}/instances/fetch-root-folders`, data);
  }

  fetchDirectQualityProfiles(data: { type?: string; url: string; apiKey: string }): Observable<QualityProfile[]> {
    return this.http.post<QualityProfile[]>(`${this.baseUrl}/instances/fetch-quality-profiles`, data);
  }
  
  getInstanceRootFolders(id: number): Observable<RootFolder[]> {
    return this.http.get<RootFolder[]>(`${this.baseUrl}/instances/${id}/root-folders`);
  }
  
  getInstanceQualityProfiles(id: number): Observable<QualityProfile[]> {
    return this.http.get<QualityProfile[]>(`${this.baseUrl}/instances/${id}/quality-profiles`);
  }

  scanInstance(id: number): Observable<ScanResult> {
    return this.http.post<ScanResult>(`${this.baseUrl}/instances/${id}/scan`, {});
  }

  // Sync Profiles
  getSyncProfiles(): Observable<SyncProfile[]> {
    return this.http.get<SyncProfile[]>(`${this.baseUrl}/sync-profiles`);
  }
  
  getSyncProfile(id: number): Observable<SyncProfile> {
    return this.http.get<SyncProfile>(`${this.baseUrl}/sync-profiles/${id}`);
  }
  
  createSyncProfile(data: Partial<SyncProfile>): Observable<SyncProfile> {
    return this.http.post<SyncProfile>(`${this.baseUrl}/sync-profiles`, data);
  }
  
  updateSyncProfile(id: number, data: Partial<SyncProfile>): Observable<SyncProfile> {
    return this.http.put<SyncProfile>(`${this.baseUrl}/sync-profiles/${id}`, data);
  }
  
  deleteSyncProfile(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/sync-profiles/${id}`);
  }
  
  triggerScan(profileId: number): Observable<ScanResult> {
    return this.http.post<ScanResult>(`${this.baseUrl}/sync-profiles/${profileId}/scan`, {});
  }

  syncProfile(profileId: number): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/sync-profiles/${profileId}/sync`, {});
  }

  dryRunProfile(profileId: number): Observable<DryRunReport> {
    return this.http.post<DryRunReport>(`${this.baseUrl}/sync-profiles/${profileId}/dry-run`, {});
  }

  // Media
  getMediaItems(params: MediaQueryParams): Observable<PaginatedResult<MediaItem>> {
    return this.http.get<PaginatedResult<MediaItem>>(`${this.baseUrl}/media`, { params: this.buildHttpParams(params) });
  }
  
  getMediaItem(id: number): Observable<MediaItemDetail> {
    return this.http.get<MediaItemDetail>(`${this.baseUrl}/media/${id}`);
  }
  
  getMediaStats(): Observable<MediaStats> {
    return this.http.get<MediaStats>(`${this.baseUrl}/media/stats`);
  }

  triggerLibraryScan(): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/media/scan`, {});
  }

  // History & Sync Runs
  getSyncRuns(params: SyncRunQueryParams = {}): Observable<PaginatedResult<SyncRun>> {
    return this.http.get<PaginatedResult<SyncRun>>(`${this.baseUrl}/history/runs`, { params: this.buildHttpParams(params) });
  }

  getSyncRunDetail(id: number | string): Observable<SyncRunDetail> {
    return this.http.get<SyncRunDetail>(`${this.baseUrl}/history/runs/${id}`);
  }

  getHistory(params: HistoryQueryParams): Observable<PaginatedResult<SyncHistoryEntry>> {
    return this.http.get<PaginatedResult<SyncHistoryEntry>>(`${this.baseUrl}/history/logs`, { params: this.buildHttpParams(params) });
  }

  // Filesystem Browser & Autocomplete
  browseFilesystem(browsePath: string): Observable<{ currentPath: string; parent: string | null; directories: { name: string; path: string }[] }> {
    return this.http.get<any>(`${this.baseUrl}/filesystem/browse`, { params: { path: browsePath } });
  }

  autocompletePath(query: string): Observable<{
    query: string;
    parentDir: string;
    currentPrefix: string;
    exists: boolean;
    suggestions: { name: string; path: string }[];
  }> {
    return this.http.get<any>(`${this.baseUrl}/filesystem/autocomplete`, { params: { query } });
  }

  // Settings
  getSettings(): Observable<Settings> {
    return this.http.get<Settings>(`${this.baseUrl}/settings`);
  }
  
  updateSettings(data: Partial<Settings>): Observable<Settings> {
    return this.http.put<Settings>(`${this.baseUrl}/settings`, data);
  }

  private buildHttpParams(params: Record<string, any>): HttpParams {
    let httpParams = new HttpParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        httpParams = httpParams.set(key, value.toString());
      }
    });
    return httpParams;
  }
}
