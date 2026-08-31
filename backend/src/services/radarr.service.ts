export interface RadarrMovie {
  id: number;
  title: string;
  year: number;
  tmdbId: number;
  imdbId?: string;
  overview?: string;
  path?: string;
  rootFolderPath?: string;
  qualityProfileId: number;
  monitored: boolean;
  hasFile: boolean;
  movieFileId?: number;
  movieFile?: RadarrMovieFile;
  images?: Array<{ coverType: string; url?: string; remoteUrl?: string }>;
}

export interface RadarrMovieFile {
  id: number;
  movieId: number;
  relativePath: string;
  path: string;
  size: number;
  quality: any;
  mediaInfo?: RadarrMediaInfo;
}

export interface RadarrMediaInfo {
  audioChannels: number;
  audioCodec: string;
  audioLanguages: string;
  audioStreamCount: number;
  videoCodec: string;
  resolution: string;
  runTime: string;
  subtitles: string;
}

export interface RadarrQualityProfile {
  id: number;
  name: string;
}

export interface RadarrRootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

export interface AddMovieParams {
  title: string;
  tmdbId: number;
  qualityProfileId: number;
  rootFolderPath: string;
  monitored: boolean;
  searchForMovie: boolean;
}

export interface RadarrWebhookPayload {
  eventType: string;
  movie: any;
  movieFile?: any;
  isUpgrade?: boolean;
}

export class RadarrService {
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
      throw new Error(`Radarr API Error: ${response.statusText || response.status} for ${url}`);
    }

    return await response.json() as T;
  }

  async testConnection(): Promise<{ version: string; instanceName?: string }> {
    const data = await this.request<{ version: string; instanceName?: string; appName?: string }>('GET', '/system/status');
    if (data.appName && data.appName !== 'Radarr') {
      throw new Error(`Invalid instance type: Connected to ${data.appName}, expected Radarr`);
    }
    return data;
  }

  async getMovies(): Promise<RadarrMovie[]> {
    return this.request<RadarrMovie[]>('GET', '/movie');
  }

  async getMovie(id: number): Promise<RadarrMovie> {
    return this.request<RadarrMovie>('GET', `/movie/${id}`);
  }

  async getMovieByTmdbId(tmdbId: number): Promise<RadarrMovie | null> {
    const movies = await this.getMovies();
    return movies.find(m => m.tmdbId === tmdbId) || null;
  }

  async lookupMovie(tmdbId: number): Promise<RadarrMovie | null> {
    const results = await this.request<RadarrMovie[]>('GET', `/movie/lookup?tmdbId=${tmdbId}`);
    return results.length > 0 ? results[0] : null;
  }

  async addMovie(params: AddMovieParams): Promise<RadarrMovie> {
    const payload = {
      title: params.title,
      tmdbId: params.tmdbId,
      qualityProfileId: params.qualityProfileId,
      rootFolderPath: params.rootFolderPath,
      monitored: params.monitored,
      addOptions: {
        searchForMovie: params.searchForMovie
      }
    };
    return this.request<RadarrMovie>('POST', '/movie', payload);
  }

  async getMovieFiles(movieId: number): Promise<RadarrMovieFile[]> {
    return this.request<RadarrMovieFile[]>('GET', `/moviefile?movieId=${movieId}`);
  }

  async searchMovie(movieIds: number[]): Promise<void> {
    await this.request('POST', '/command', {
      name: 'MoviesSearch',
      movieIds
    });
  }

  async rescanMovie(movieId: number): Promise<void> {
    await this.request('POST', '/command', {
      name: 'RescanMovie',
      movieId
    });
  }

  async getRootFolders(): Promise<RadarrRootFolder[]> {
    return this.request<RadarrRootFolder[]>('GET', '/rootfolder');
  }

  async getQualityProfiles(): Promise<RadarrQualityProfile[]> {
    return this.request<RadarrQualityProfile[]>('GET', '/qualityprofile');
  }

  getPosterUrl(movie: RadarrMovie): string | null {
    const poster = movie.images?.find(img => img.coverType === 'poster');
    if (poster?.remoteUrl) return poster.remoteUrl;
    if (poster?.url) return `${this.normalizedUrl}${poster.url}`;
    return null;
  }
}
