import { DataSource } from 'typeorm';
import { MediaInspectorService } from './media-inspector.service';
import { LinkerService } from './linker.service';
import { Instance, SyncProfile, MediaItem, MediaItemInstance, SyncHistory } from '../entities';
import { RadarrService, RadarrMovie, RadarrMovieFile, RadarrWebhookPayload } from './radarr.service';
import { SonarrService, SonarrSeries, SonarrEpisode, SonarrEpisodeFile, SonarrWebhookPayload } from './sonarr.service';
import { logger } from '../utils/logger';

export class SyncEngineService {
  constructor(
    private db: DataSource,
    private mediaInspector: MediaInspectorService,
    private linker: LinkerService
  ) {}

  async handleRadarrImport(instanceId: number, payload: RadarrWebhookPayload): Promise<void> {
    if (payload.eventType !== 'Download') return;

    const instanceRepo = this.db.getRepository(Instance);
    const profileRepo = this.db.getRepository(SyncProfile);
    
    const mainInstance = await instanceRepo.findOneBy({ id: instanceId });
    if (!mainInstance || !mainInstance.isMain) return;

    const profiles = await profileRepo.find({ where: { mainInstanceId: instanceId, enabled: true }, relations: ['childInstance'] });

    for (const profile of profiles) {
      try {
        const movie = payload.movie as RadarrMovie;
        const movieFile = payload.movieFile as RadarrMovieFile;
        await this.processMovie(profile, mainInstance, profile.childInstance, movie, movieFile);
      } catch (e) {
        logger.error(`Error processing radarr import for profile ${profile.id}:`, e);
      }
    }
  }

  async handleSonarrImport(instanceId: number, payload: SonarrWebhookPayload): Promise<void> {
    if (payload.eventType !== 'Download') return;

    const instanceRepo = this.db.getRepository(Instance);
    const profileRepo = this.db.getRepository(SyncProfile);
    
    const mainInstance = await instanceRepo.findOneBy({ id: instanceId });
    if (!mainInstance || !mainInstance.isMain) return;

    const profiles = await profileRepo.find({ where: { mainInstanceId: instanceId, enabled: true }, relations: ['childInstance'] });

    for (const profile of profiles) {
      try {
        const series = payload.series as SonarrSeries;
        for (const ep of payload.episodes) {
          const episode = ep as SonarrEpisode;
          const episodeFile = payload.episodeFile as SonarrEpisodeFile;
          await this.processEpisode(profile, mainInstance, profile.childInstance, series, episode, episodeFile);
        }
        
        if (profile.syncMonitoredSeasons) {
          await this.syncMonitoredSeasons(profile);
        }
      } catch (e) {
        logger.error(`Error processing sonarr import for profile ${profile.id}:`, e);
      }
    }
  }

  async syncProfile(profileId: number): Promise<{ total: number; linked: number; searchTriggered: number; errors: number }> {
    const profile = await this.db.getRepository(SyncProfile).findOne({
      where: { id: profileId },
      relations: ['mainInstance', 'childInstance']
    });

    if (!profile || !profile.mainInstance || !profile.childInstance) {
      throw new Error('Sync profile not found');
    }

    const main = profile.mainInstance;
    const child = profile.childInstance;
    const stats = { total: 0, linked: 0, searchTriggered: 0, errors: 0 };

    if (main.type === 'radarr') {
      const radarr = new RadarrService(main.url, main.apiKey);
      const movies = await radarr.getMovies();
      for (const movie of movies) {
        if (!movie.hasFile || !movie.movieFile) continue;
        stats.total++;
        try {
          const res = await this.processMovie(profile, main, child, movie, movie.movieFile);
          if (res === 'linked') stats.linked++;
          else if (res === 'search_triggered') stats.searchTriggered++;
        } catch (e) {
          stats.errors++;
        }
      }
    } else if (main.type === 'sonarr') {
      const sonarr = new SonarrService(main.url, main.apiKey);
      const seriesList = await sonarr.getSeries();
      for (const s of seriesList) {
        const episodes = await sonarr.getEpisodes(s.id);
        const files = await sonarr.getEpisodeFiles(s.id);
        for (const ep of episodes) {
          if (!ep.hasFile || !ep.episodeFileId) continue;
          const file = files.find(f => f.id === ep.episodeFileId);
          if (!file) continue;
          stats.total++;
          try {
            const res = await this.processEpisode(profile, main, child, s, ep, file);
            if (res === 'linked') stats.linked++;
            else if (res === 'search_triggered') stats.searchTriggered++;
          } catch (e) {
            stats.errors++;
          }
        }
      }

      if (profile.syncMonitoredSeasons) {
        await this.syncMonitoredSeasons(profile);
      }
    }

    return stats;
  }

  async syncMonitoredSeasons(syncProfile: SyncProfile): Promise<void> {
    const mainInstance = await this.db.getRepository(Instance).findOneBy({ id: syncProfile.mainInstanceId });
    const childInstance = await this.db.getRepository(Instance).findOneBy({ id: syncProfile.childInstanceId });
    if (!mainInstance || !childInstance) return;

    const sonarrMain = new SonarrService(mainInstance.url, mainInstance.apiKey);
    const sonarrChild = new SonarrService(childInstance.url, childInstance.apiKey);

    const mainSeries = await sonarrMain.getSeries();
    for (const ms of mainSeries) {
      if (!ms.tvdbId) continue;
      const cs = await sonarrChild.getSeriesByTvdbId(ms.tvdbId);
      if (cs) {
        let updated = false;
        for (const mSeason of ms.seasons) {
          const cSeason = cs.seasons.find(s => s.seasonNumber === mSeason.seasonNumber);
          if (cSeason && cSeason.monitored !== mSeason.monitored) {
            cSeason.monitored = mSeason.monitored;
            updated = true;
          }
        }
        if (updated) {
          await sonarrChild.updateSeries(cs);
          await this.logAction(syncProfile.id, cs.title, 'episode', ms.tvdbId.toString(), 'season_monitored', 'Updated seasons monitored status');
        }
      }
    }
  }

  async processMovie(
    syncProfile: SyncProfile,
    mainInstance: Instance,
    childInstance: Instance,
    movie: RadarrMovie,
    movieFile: RadarrMovieFile
  ): Promise<'linked' | 'search_triggered' | 'already_exists' | 'error'> {
    try {
      const childRadarr = new RadarrService(childInstance.url, childInstance.apiKey);
      let targetMovie = await childRadarr.getMovieByTmdbId(movie.tmdbId);

      const hasLang = await this.mediaInspector.hasLanguage(movieFile.path, childInstance.language, movieFile.mediaInfo);

      if (!targetMovie) {
        const lookup = await childRadarr.lookupMovie(movie.tmdbId);
        if (!lookup) throw new Error('Movie not found on child instance lookup');
        targetMovie = await childRadarr.addMovie({
          title: lookup.title,
          tmdbId: lookup.tmdbId,
          qualityProfileId: childInstance.qualityProfileId,
          rootFolderPath: childInstance.rootFolderPath,
          monitored: true,
          searchForMovie: !hasLang && syncProfile.searchIfMissing
        });
        
        await this.logAction(syncProfile.id, movie.title, 'movie', movie.tmdbId.toString(), 'added', 'Added missing movie to child');
      } else {
        if (targetMovie.hasFile) {
          return 'already_exists';
        }
      }

      await this.trackMediaItem(movie.tmdbId.toString(), 'movie', movie.title, movie.year, mainInstance.id, movie.id, movieFile.path, ['en']);

      if (hasLang) {
        const linked = await this.linker.linkExists(movieFile.path, syncProfile.mainPath, syncProfile.childPath);
        if (!linked) {
          await this.linker.linkMedia(movieFile.path, syncProfile.mainPath, syncProfile.childPath, syncProfile.linkType);
          await childRadarr.rescanMovie(targetMovie.id);
          await this.logAction(syncProfile.id, movie.title, 'movie', movie.tmdbId.toString(), 'linked', 'Hardlinked file');
        }
        return 'linked';
      } else if (syncProfile.searchIfMissing) {
        await childRadarr.searchMovie([targetMovie.id]);
        await this.logAction(syncProfile.id, movie.title, 'movie', movie.tmdbId.toString(), 'search_triggered', 'Searched for missing language');
        return 'search_triggered';
      }
      return 'error';
    } catch (e: any) {
      await this.logAction(syncProfile.id, movie.title, 'movie', movie.tmdbId.toString(), 'error', e.message);
      return 'error';
    }
  }

  async processEpisode(
    syncProfile: SyncProfile,
    mainInstance: Instance,
    childInstance: Instance,
    series: SonarrSeries,
    episode: SonarrEpisode,
    episodeFile: SonarrEpisodeFile
  ): Promise<'linked' | 'search_triggered' | 'already_exists' | 'error'> {
    try {
      const childSonarr = new SonarrService(childInstance.url, childInstance.apiKey);
      let targetSeries = await childSonarr.getSeriesByTvdbId(series.tvdbId);

      if (!targetSeries) {
        const lookup = await childSonarr.lookupSeries(series.tvdbId);
        if (!lookup) throw new Error('Series not found on lookup');
        targetSeries = await childSonarr.addSeries({
          title: lookup.title,
          tvdbId: lookup.tvdbId,
          qualityProfileId: childInstance.qualityProfileId,
          rootFolderPath: childInstance.rootFolderPath,
          monitored: true,
          seasons: series.seasons.map(s => ({ seasonNumber: s.seasonNumber, monitored: s.monitored })),
          searchForMissingEpisodes: false
        });
        await this.logAction(syncProfile.id, series.title, 'episode', series.tvdbId.toString(), 'added', 'Added series');
      }

      const childEpisodes = await childSonarr.getEpisodes(targetSeries.id);
      const ce = childEpisodes.find(e => e.seasonNumber === episode.seasonNumber && e.episodeNumber === episode.episodeNumber);

      if (ce && ce.hasFile) {
        return 'already_exists';
      }

      const hasLang = await this.mediaInspector.hasLanguage(episodeFile.path, childInstance.language, episodeFile.mediaInfo);

      if (hasLang) {
        const linked = await this.linker.linkExists(episodeFile.path, syncProfile.mainPath, syncProfile.childPath);
        if (!linked) {
          await this.linker.linkMedia(episodeFile.path, syncProfile.mainPath, syncProfile.childPath, syncProfile.linkType);
          await childSonarr.rescanSeries(targetSeries.id);
          await this.logAction(syncProfile.id, `${series.title} S${episode.seasonNumber}E${episode.episodeNumber}`, 'episode', series.tvdbId.toString(), 'linked', 'Linked file');
        }
        return 'linked';
      } else if (syncProfile.searchIfMissing) {
        if (ce) {
          await childSonarr.searchEpisodes([ce.id]);
          await this.logAction(syncProfile.id, `${series.title} S${episode.seasonNumber}E${episode.episodeNumber}`, 'episode', series.tvdbId.toString(), 'search_triggered', 'Triggered search');
          return 'search_triggered';
        }
      }
      return 'error';
    } catch (e: any) {
      await this.logAction(syncProfile.id, `${series.title} S${episode.seasonNumber}E${episode.episodeNumber}`, 'episode', series.tvdbId.toString(), 'error', e.message);
      return 'error';
    }
  }

  private async trackMediaItem(
    externalId: string, 
    mediaType: 'movie' | 'series', 
    title: string, 
    year: number, 
    instanceId: number, 
    arrId: number, 
    filePath: string,
    langs: string[]
  ): Promise<MediaItem> {
    const itemRepo = this.db.getRepository(MediaItem);
    const instRepo = this.db.getRepository(MediaItemInstance);
    
    let item = await itemRepo.findOne({ where: { externalId, mediaType }, relations: ['instances'] });
    if (!item) {
      item = itemRepo.create({ externalId, mediaType, title, year });
      item = await itemRepo.save(item);
    }
    
    let mii = await instRepo.findOne({ where: { mediaItemId: item.id, instanceId }});
    if (!mii) {
      mii = instRepo.create({ mediaItemId: item.id, instanceId, arrId, status: 'available', filePath, audioLanguages: langs, lastChecked: new Date() });
    } else {
      mii.arrId = arrId;
      mii.filePath = filePath;
      mii.audioLanguages = langs;
      mii.lastChecked = new Date();
    }
    await instRepo.save(mii);
    return item;
  }

  private async logAction(
    syncProfileId: number,
    mediaTitle: string,
    mediaType: 'movie' | 'episode',
    externalId: string,
    action: 'linked' | 'search_triggered' | 'added' | 'season_monitored' | 'error',
    details: string
  ): Promise<SyncHistory> {
    const repo = this.db.getRepository(SyncHistory);
    const hist = repo.create({ syncProfileId, mediaTitle, mediaType, externalId, action, details });
    return repo.save(hist);
  }
}
