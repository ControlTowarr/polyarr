export interface SonarrSeries {
  id: number;
  title: string;
  tvdbId: number;
  year?: number;
  imdbId?: string;
  overview?: string;
  path?: string;
  qualityProfileId: number;
  monitored: boolean;
  seasons: SonarrSeason[];
  images?: Array<{ coverType: string; url?: string; remoteUrl?: string }>;
  statistics?: {
    episodeFileCount?: number;
    episodeCount?: number;
    totalEpisodeCount?: number;
    sizeOnDisk?: number;
  };
}

export interface SonarrSeason {
  seasonNumber: number;
  monitored: boolean;
  statistics?: any;
}

export interface SonarrEpisode {
  id: number;
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  monitored: boolean;
  hasFile: boolean;
  episodeFileId: number;
}

export interface SonarrEpisodeFile {
  id: number;
  seriesId: number;
  seasonNumber: number;
  relativePath: string;
  path: string;
  size: number;
  quality: any;
  mediaInfo?: SonarrMediaInfo;
}

export interface SonarrMediaInfo {
  audioChannels: number;
  audioCodec: string;
  audioLanguages: string;
  audioStreamCount: number;
  videoCodec: string;
  resolution: string;
  runTime: string;
  subtitles: string;
}

export interface SonarrQualityProfile {
  id: number;
  name: string;
}

export interface SonarrRootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

export interface AddSeriesParams {
  title: string;
  tvdbId: number;
  qualityProfileId: number;
  rootFolderPath: string;
  monitored: boolean;
  seasons: SonarrSeason[];
  searchForMissingEpisodes: boolean;
}

export interface SonarrWebhookPayload {
  eventType: string;
  series: any;
  episodes: any[];
  episodeFile?: any;
  isUpgrade?: boolean;
}

export class SonarrService {
  private normalizedUrl: string;

  constructor(private baseUrl: string, private apiKey: string) {
    this.normalizedUrl = baseUrl.replace(/\/+$/, '');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.normalizedUrl}/api/v3${path}`;
    const headers = {
      'X-Api-Key': this.apiKey,
      'Content-Type': 'application/json'
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Sonarr API Error: ${response.statusText || response.status} for ${url}`);
    }

    return await response.json() as T;
  }

  async testConnection(): Promise<{ version: string; instanceName?: string }> {
    const data = await this.request<{ version: string; instanceName?: string; appName?: string }>('GET', '/system/status');
    if (data.appName && data.appName !== 'Sonarr') {
      throw new Error(`Invalid instance type: Connected to ${data.appName}, expected Sonarr`);
    }
    return data;
  }

  async getSeries(): Promise<SonarrSeries[]> {
    return this.request<SonarrSeries[]>('GET', '/series');
  }

  async getSeriesById(id: number): Promise<SonarrSeries> {
    return this.request<SonarrSeries>('GET', `/series/${id}`);
  }

  async getSeriesByTvdbId(tvdbId: number): Promise<SonarrSeries | null> {
    const series = await this.getSeries();
    return series.find(s => s.tvdbId === tvdbId) || null;
  }

  async lookupSeries(tvdbId: number): Promise<SonarrSeries | null> {
    const results = await this.request<SonarrSeries[]>('GET', `/series/lookup?term=tvdb:${tvdbId}`);
    return results.length > 0 ? results[0] : null;
  }

  async addSeries(params: AddSeriesParams): Promise<SonarrSeries> {
    const payload = {
      title: params.title,
      tvdbId: params.tvdbId,
      qualityProfileId: params.qualityProfileId,
      rootFolderPath: params.rootFolderPath,
      monitored: params.monitored,
      seasons: params.seasons,
      addOptions: {
        searchForMissingEpisodes: params.searchForMissingEpisodes
      }
    };
    return this.request<SonarrSeries>('POST', '/series', payload);
  }

  async updateSeries(series: SonarrSeries): Promise<SonarrSeries> {
    return this.request<SonarrSeries>('PUT', `/series/${series.id}`, series);
  }

  async getEpisodes(seriesId: number): Promise<SonarrEpisode[]> {
    return this.request<SonarrEpisode[]>('GET', `/episode?seriesId=${seriesId}`);
  }

  async getEpisodeFiles(seriesId: number): Promise<SonarrEpisodeFile[]> {
    return this.request<SonarrEpisodeFile[]>('GET', `/episodefile?seriesId=${seriesId}`);
  }

  async monitorEpisodes(episodeIds: number[], monitored: boolean): Promise<void> {
    await this.request('PUT', '/episode/monitor', {
      episodeIds,
      monitored
    });
  }

  async searchSeason(seriesId: number, seasonNumber: number): Promise<void> {
    await this.request('POST', '/command', {
      name: 'SeasonSearch',
      seriesId,
      seasonNumber
    });
  }

  async searchEpisodes(episodeIds: number[]): Promise<void> {
    await this.request('POST', '/command', {
      name: 'EpisodeSearch',
      episodeIds
    });
  }

  async rescanSeries(seriesId: number): Promise<void> {
    await this.request('POST', '/command', {
      name: 'RescanSeries',
      seriesId
    });
  }

  async getRootFolders(): Promise<SonarrRootFolder[]> {
    return this.request<SonarrRootFolder[]>('GET', '/rootfolder');
  }

  async getQualityProfiles(): Promise<SonarrQualityProfile[]> {
    return this.request<SonarrQualityProfile[]>('GET', '/qualityprofile');
  }

  getPosterUrl(series: SonarrSeries): string | null {
    const poster = series.images?.find(img => img.coverType === 'poster');
    if (poster?.remoteUrl) return poster.remoteUrl;
    if (poster?.url) return `${this.normalizedUrl}${poster.url}`;
    return null;
  }
}
