import { DataSource } from 'typeorm';
import { SyncProfile, Instance, MediaItem, MediaItemInstance } from '../entities';
import { RadarrService } from './radarr.service';
import { SonarrService } from './sonarr.service';
import { normalizeLanguageCode } from '../utils/languages';
import { logger } from '../utils/logger';

export interface ScanResult {
  total: number;
  discovered: number;
  linked: number;
  downloaded: number;
  missing: number;
  errors: number;
  details: string[];
}

export class LibraryScannerService {
  constructor(
    private db: DataSource
  ) {}

  /**
   * Safe read-only library discovery scan across all connected instances.
   * Does NOT create symlinks/hardlinks, write files, or trigger searches.
   */
  async scanAllLibraries(): Promise<ScanResult> {
    const instances = await this.db.getRepository(Instance).find();
    const result: ScanResult = {
      total: 0,
      discovered: 0,
      linked: 0,
      downloaded: 0,
      missing: 0,
      errors: 0,
      details: []
    };

    for (const instance of instances) {
      await this.scanSingleInstance(instance, result);
    }

    return result;
  }

  /**
   * Safe read-only discovery for a single instance.
   */
  async scanSingleInstance(instance: Instance, existingResult?: ScanResult): Promise<ScanResult> {
    const result: ScanResult = existingResult || {
      total: 0,
      discovered: 0,
      linked: 0,
      downloaded: 0,
      missing: 0,
      errors: 0,
      details: []
    };

    try {
      if (instance.type === 'radarr') {
        await this.scanRadarrInstance(instance, result);
      } else if (instance.type === 'sonarr') {
        await this.scanSonarrInstance(instance, result);
      }
    } catch (err: any) {
      result.errors++;
      result.details.push(`Failed scanning instance "${instance.name}": ${err.message}`);
      logger.error(`Error scanning instance ${instance.name}:`, err);
    }

    return result;
  }

  /**
   * Safe read-only scan for instances in a specific sync profile.
   */
  async scanLibrary(syncProfileId: number): Promise<ScanResult> {
    const profile = await this.db.getRepository(SyncProfile).findOne({
      where: { id: syncProfileId },
      relations: ['mainInstance', 'childInstance']
    });

    if (!profile || !profile.mainInstance || !profile.childInstance) {
      throw new Error('Profile not found');
    }

    const result: ScanResult = {
      total: 0,
      discovered: 0,
      linked: 0,
      downloaded: 0,
      missing: 0,
      errors: 0,
      details: []
    };

    for (const instance of [profile.mainInstance, profile.childInstance]) {
      await this.scanSingleInstance(instance, result);
    }

    return result;
  }

  private async scanRadarrInstance(instance: Instance, result: ScanResult): Promise<void> {
    const radarr = new RadarrService(instance.url, instance.apiKey);
    const movies = await radarr.getMovies();
    const mediaRepo = this.db.getRepository(MediaItem);
    const miiRepo = this.db.getRepository(MediaItemInstance);

    for (const movie of movies) {
      if (!movie.tmdbId) continue;
      result.total++;

      try {
        const externalId = movie.tmdbId.toString();
        let mediaItem = await mediaRepo.findOne({
          where: { externalId, mediaType: 'movie' },
          relations: ['instances']
        });

        const posterImg = movie.images?.find(img => img.coverType === 'poster');
        const posterUrl = posterImg?.remoteUrl || posterImg?.url || '';

        if (!mediaItem) {
          mediaItem = mediaRepo.create({
            externalId,
            mediaType: 'movie',
            title: movie.title,
            year: movie.year,
            overview: movie.overview || '',
            posterUrl,
          });
          await mediaRepo.save(mediaItem);
          result.discovered++;
        } else {
          let changed = false;
          if (!mediaItem.posterUrl && posterUrl) { mediaItem.posterUrl = posterUrl; changed = true; }
          if (!mediaItem.overview && movie.overview) { mediaItem.overview = movie.overview; changed = true; }
          if (changed) await mediaRepo.save(mediaItem);
        }

        let mii = await miiRepo.findOne({
          where: { mediaItemId: mediaItem.id, instanceId: instance.id }
        });

        const movieFile = movie.movieFile;
        const languages = this.extractAudioLanguages(movieFile, instance.language);
        const status = movie.hasFile ? 'available' : (movie.monitored ? 'monitored' : 'missing');

        let syncMethod: 'linked' | 'downloaded' | 'not_synced' = 'not_synced';
        if (movie.hasFile) {
          syncMethod = 'downloaded';
          result.downloaded++;
        } else {
          result.missing++;
        }

        if (!mii) {
          mii = miiRepo.create({
            mediaItemId: mediaItem.id,
            instanceId: instance.id,
            arrId: movie.id,
            status,
            syncMethod,
            audioLanguages: languages,
            filePath: movieFile?.path || '',
            lastChecked: new Date(),
          });
        } else {
          mii.arrId = movie.id;
          mii.status = status;
          mii.syncMethod = syncMethod;
          mii.audioLanguages = languages;
          mii.filePath = movieFile?.path || mii.filePath;
          mii.lastChecked = new Date();
        }

        await miiRepo.save(mii);
      } catch (err: any) {
        result.errors++;
        result.details.push(`Error indexing movie ${movie.title}: ${err.message}`);
      }
    }
  }

  private async scanSonarrInstance(instance: Instance, result: ScanResult): Promise<void> {
    const sonarr = new SonarrService(instance.url, instance.apiKey);
    const seriesList = await sonarr.getSeries();
    const mediaRepo = this.db.getRepository(MediaItem);
    const miiRepo = this.db.getRepository(MediaItemInstance);

    for (const s of seriesList) {
      if (!s.tvdbId) continue;
      result.total++;

      try {
        const externalId = s.tvdbId.toString();
        let mediaItem = await mediaRepo.findOne({
          where: { externalId, mediaType: 'series' },
          relations: ['instances']
        });

        const posterImg = s.images?.find(img => img.coverType === 'poster');
        const posterUrl = posterImg?.remoteUrl || posterImg?.url || '';

        if (!mediaItem) {
          mediaItem = mediaRepo.create({
            externalId,
            mediaType: 'series',
            title: s.title,
            year: s.year,
            overview: s.overview || '',
            posterUrl,
          });
          await mediaRepo.save(mediaItem);
          result.discovered++;
        } else {
          let changed = false;
          if (!mediaItem.posterUrl && posterUrl) { mediaItem.posterUrl = posterUrl; changed = true; }
          if (!mediaItem.overview && s.overview) { mediaItem.overview = s.overview; changed = true; }
          if (changed) await mediaRepo.save(mediaItem);
        }

        let mii = await miiRepo.findOne({
          where: { mediaItemId: mediaItem.id, instanceId: instance.id }
        });

        const status = (s.statistics?.episodeFileCount || 0) > 0 ? 'available' : (s.monitored ? 'monitored' : 'missing');
        const languages = [normalizeLanguageCode(instance.language || 'en')];

        if (!mii) {
          mii = miiRepo.create({
            mediaItemId: mediaItem.id,
            instanceId: instance.id,
            arrId: s.id,
            status,
            syncMethod: (s.statistics?.episodeFileCount || 0) > 0 ? 'downloaded' : 'not_synced',
            audioLanguages: languages,
            filePath: s.path || '',
            lastChecked: new Date(),
          });
        } else {
          mii.arrId = s.id;
          mii.status = status;
          mii.syncMethod = (s.statistics?.episodeFileCount || 0) > 0 ? 'downloaded' : 'not_synced';
          mii.audioLanguages = languages;
          mii.filePath = s.path || mii.filePath;
          mii.lastChecked = new Date();
        }

        await miiRepo.save(mii);
      } catch (err: any) {
        result.errors++;
        result.details.push(`Error indexing series ${s.title}: ${err.message}`);
      }
    }
  }

  private extractAudioLanguages(file: any, defaultLanguage: string): string[] {
    const languages: string[] = [];
    if (file?.mediaInfo?.audioLanguages) {
      const parts = file.mediaInfo.audioLanguages.split('/');
      for (const part of parts) {
        const norm = normalizeLanguageCode(part.trim());
        if (norm && !languages.includes(norm)) {
          languages.push(norm);
        }
      }
    }

    if (languages.length === 0 && defaultLanguage) {
      languages.push(normalizeLanguageCode(defaultLanguage));
    }

    return languages.length > 0 ? languages : ['en'];
  }
}
