import { DataSource } from 'typeorm';
import { MediaInspectorService } from './media-inspector.service';
import { LinkerService } from './linker.service';
import { Instance, SyncProfile, MediaItem, MediaItemInstance, SyncHistory, SyncRun } from '../entities';
import { RadarrService, RadarrMovie, RadarrMovieFile, RadarrWebhookPayload } from './radarr.service';
import { SonarrService, SonarrSeries, SonarrEpisode, SonarrEpisodeFile, SonarrWebhookPayload } from './sonarr.service';
import { normalizeLanguageCode } from '../utils/languages';
import { logger } from '../utils/logger';

export interface DryRunItem {
  id: string;
  title: string;
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

  async syncProfile(
    profileId: number,
    triggerType: 'manual' | 'scheduled' | 'webhook' = 'manual'
  ): Promise<{
    total: number;
    linked: number;
    alreadyLinked: number;
    alreadyExistsChild: number;
    searchTriggered: number;
    skipped: number;
    errors: number;
    syncRunId?: string;
  }> {
    const profile = await this.db.getRepository(SyncProfile).findOne({
      where: { id: profileId },
      relations: ['mainInstance', 'childInstance']
    });

    if (!profile || !profile.mainInstance || !profile.childInstance) {
      throw new Error('Sync profile not found');
    }

    const main = profile.mainInstance;
    const child = profile.childInstance;
    const stats = {
      total: 0,
      linked: 0,
      alreadyLinked: 0,
      alreadyExistsChild: 0,
      searchTriggered: 0,
      skipped: 0,
      errors: 0
    };

    const startTime = Date.now();
    const syncRunId = `sync-${profile.id}-${startTime}`;

    const syncRunRepo = this.db.getRepository(SyncRun);
    let syncRun = syncRunRepo.create({
      syncRunId,
      syncProfileId: profile.id,
      triggerType,
      status: 'running',
      totalScanned: 0,
      linkedCount: 0,
      alreadyLinkedCount: 0,
      searchTriggeredCount: 0,
      alreadyExistsChildCount: 0,
      skippedCount: 0,
      errorCount: 0,
      durationMs: 0,
    });
    try {
      const saved = await syncRunRepo.save(syncRun);
      if (saved) syncRun = saved;
    } catch (e) {
      logger.warn('[Sync] Could not create initial sync run record:', e);
    }

    logger.info(`[Sync] Starting ${triggerType} sync for profile ${profile.id} (${syncRunId}): ${main.name} (${main.type}) ➔ ${child.name}`);

    if (main.type === 'radarr') {
      await this.syncRadarr(profile, main, child, syncRunId, stats);
    } else if (main.type === 'sonarr') {
      await this.syncSonarr(profile, main, child, syncRunId, stats);
    }

    const durationMs = Date.now() - startTime;
    const summaryDetails = `Sync completed for ${main.name} ➔ ${child.name}: ${stats.total} total items scanned (${stats.linked} linked, ${stats.alreadyLinked} already linked, ${stats.searchTriggered} searches triggered, ${stats.skipped} skipped, ${stats.errors} errors) in ${(durationMs / 1000).toFixed(1)}s.`;
    logger.info(`[Sync] ${summaryDetails}`);

    if (syncRun) {
      syncRun.totalScanned = stats.total;
      syncRun.linkedCount = stats.linked;
      syncRun.alreadyLinkedCount = stats.alreadyLinked;
      syncRun.searchTriggeredCount = stats.searchTriggered;
      syncRun.alreadyExistsChildCount = stats.alreadyExistsChild;
      syncRun.skippedCount = stats.skipped;
      syncRun.errorCount = stats.errors;
      syncRun.durationMs = durationMs;
      syncRun.summary = summaryDetails;
      syncRun.completedAt = new Date();
      syncRun.status = stats.errors > 0
        ? (stats.linked > 0 || stats.searchTriggered > 0 ? 'partial' : 'error')
        : 'completed';
      try {
        await syncRunRepo.save(syncRun);
      } catch (e) {
        logger.warn('[Sync] Could not update final sync run record:', e);
      }
    }

    return { ...stats, syncRunId };
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

  private async syncRadarr(
    profile: SyncProfile,
    main: Instance,
    child: Instance,
    syncRunId: string,
    stats: { total: number; linked: number; alreadyLinked: number; alreadyExistsChild: number; searchTriggered: number; skipped: number; errors: number }
  ): Promise<void> {
    const radarr = new RadarrService(main.url, main.apiKey);
    const movies = await radarr.getMovies();
    for (const movie of movies) {
      if (!movie.hasFile) continue;
      let movieFile = movie.movieFile;
      if (!movieFile && movie.id) {
        try {
          const files = await radarr.getMovieFiles(movie.id);
          if (files && files.length > 0) movieFile = files[0];
        } catch (fileErr: any) {
          logger.warn(`Could not fetch movie file for ${movie.title}:`, fileErr);
        }
      }
      if (!movieFile || !movieFile.path) continue;
      stats.total++;
      try {
        const res = await this.processMovie(profile, main, child, movie, movieFile, syncRunId);
        if (res === 'linked') stats.linked++;
        else if (res === 'already_linked') stats.alreadyLinked++;
        else if (res === 'search_triggered') stats.searchTriggered++;
        else if (res === 'already_exists') stats.alreadyExistsChild++;
        else if (res === 'skipped') stats.skipped++;
        else if (res === 'error') stats.errors++;
      } catch (e: any) {
        stats.errors++;
        await this.logAction(
          profile.id, 
          movie.title, 
          'movie', 
          movie.tmdbId?.toString() || movie.id.toString(), 
          'error', 
          e.message,
          { syncRunId, sourcePath: movieFile?.path }
        );
      }
    }
  }

  private async syncSonarr(
    profile: SyncProfile,
    main: Instance,
    child: Instance,
    syncRunId: string,
    stats: { total: number; linked: number; alreadyLinked: number; alreadyExistsChild: number; searchTriggered: number; skipped: number; errors: number }
  ): Promise<void> {
    const sonarr = new SonarrService(main.url, main.apiKey);
    const seriesList = await sonarr.getSeries();
    for (const s of seriesList) {
      try {
        const [episodes, files] = await Promise.all([
          sonarr.getEpisodes(s.id),
          sonarr.getEpisodeFiles(s.id)
        ]);
        const fileMap = new Map<number, SonarrEpisodeFile>();
        for (const f of files) {
          fileMap.set(f.id, f);
        }
        for (const ep of episodes) {
          if (!ep.hasFile || !ep.episodeFileId) continue;
          const file = fileMap.get(ep.episodeFileId);
          if (!file || !file.path) continue;
          stats.total++;
          try {
            const res = await this.processEpisode(profile, main, child, s, ep, file, syncRunId);
            if (res === 'linked') stats.linked++;
            else if (res === 'already_linked') stats.alreadyLinked++;
            else if (res === 'search_triggered') stats.searchTriggered++;
            else if (res === 'already_exists') stats.alreadyExistsChild++;
            else if (res === 'skipped') stats.skipped++;
            else if (res === 'error') stats.errors++;
          } catch (e: any) {
            stats.errors++;
            await this.logAction(
              profile.id, 
              `${s.title} S${ep.seasonNumber}E${ep.episodeNumber}`, 
              'episode', 
              s.tvdbId?.toString() || s.id.toString(), 
              'error', 
              e.message,
              { syncRunId, sourcePath: file?.path }
            );
          }
        }
      } catch (seriesErr: any) {
        stats.errors++;
        await this.logAction(
          profile.id, 
          s.title, 
          'episode', 
          s.tvdbId?.toString() || s.id.toString(), 
          'error', 
          seriesErr.message,
          { syncRunId }
        );
      }
    }

    if (profile.syncMonitoredSeasons) {
      await this.syncMonitoredSeasons(profile);
    }
  }

  private getEffectivePaths(profile: SyncProfile, main: Instance, child: Instance): { mainPath: string; childPath: string } {
    // Priority: profile-level override → instance.localPath (Polyarr's mount) → instance.rootFolderPath (auto-detected from *Arr API)
    const mainPath = (profile.mainPath && profile.mainPath.trim() !== '') ? profile.mainPath : (main.localPath && main.localPath.trim() !== '' ? main.localPath : (main.rootFolderPath || ''));
    const childPath = (profile.childPath && profile.childPath.trim() !== '') ? profile.childPath : (child.localPath && child.localPath.trim() !== '' ? child.localPath : (child.rootFolderPath || ''));
    return { mainPath, childPath };
  }

  /**
   * Processes a Radarr movie synchronization event or library scan item.
   *
   * Logic:
   * 1. Check if the target child instance already has a file for this movie.
   * 2. Inspect the main file to detect whether it contains the child instance's target audio language.
   * 3. Target language present -> create zero-space hardlink/symlink and rescan child instance (returns 'linked' or 'already_linked').
   * 4. Target language missing ->
   *    - If searchIfMissing is TRUE: trigger search on child indexers to grab a separate language release (returns 'search_triggered').
   *    - If searchIfMissing is FALSE: skip without triggering search (returns 'skipped', no-op for linking/downloading).
   */
  async processMovie(
    syncProfile: SyncProfile,
    mainInstance: Instance,
    childInstance: Instance,
    movie: RadarrMovie,
    movieFile: RadarrMovieFile,
    syncRunId?: string
  ): Promise<'linked' | 'already_linked' | 'search_triggered' | 'already_exists' | 'error' | 'skipped'> {
    const sourcePath = movieFile.path || '';
    const { mainPath, childPath } = this.getEffectivePaths(syncProfile, mainInstance, childInstance);
    const destPath = this.linker.translatePath(sourcePath, mainPath, childPath);
    let detectedLangs: string[] = [];

    try {
      const hasLang = await this.mediaInspector.hasLanguage(sourcePath, childInstance.language, movieFile.mediaInfo);
      if (this.mediaInspector.detectLanguages) {
        try {
          detectedLangs = await this.mediaInspector.detectLanguages(sourcePath, movieFile.mediaInfo);
        } catch {
          detectedLangs = [];
        }
      }

      await this.trackMediaItem(movie.tmdbId.toString(), 'movie', movie.title, movie.year, mainInstance.id, movie.id, movieFile.path, detectedLangs);

      // Domain Rule: If target audio is missing AND auto-search is OFF, never add or modify child instance
      if (!hasLang && !syncProfile.searchIfMissing) {
        return 'skipped';
      }

      const childRadarr = new RadarrService(childInstance.url, childInstance.apiKey);
      let targetMovie = await childRadarr.getMovieByTmdbId(movie.tmdbId);

      if (!targetMovie) {
        const lookup = await childRadarr.lookupMovie(movie.tmdbId).catch(() => null);
        const title = lookup?.title || movie.title;
        const tmdbId = lookup?.tmdbId || movie.tmdbId;
        const year = lookup?.year || movie.year;

        targetMovie = await childRadarr.addMovie({
          title,
          tmdbId,
          year,
          qualityProfileId: childInstance.qualityProfileId,
          rootFolderPath: childInstance.rootFolderPath,
          monitored: true,
          searchForMovie: !hasLang && syncProfile.searchIfMissing,
          movie: lookup || undefined
        });
        
        if (!hasLang && syncProfile.searchIfMissing) {
          await this.logAction(
            syncProfile.id, 
            movie.title, 
            'movie', 
            movie.tmdbId.toString(), 
            'search_triggered', 
            `Added & triggered search for missing language on ${childInstance.name}`,
            { syncRunId, sourcePath, destinationPath: destPath, languagesDetected: detectedLangs }
          );
          return 'search_triggered';
        } else {
          await this.logAction(
            syncProfile.id, 
            movie.title, 
            'movie', 
            movie.tmdbId.toString(), 
            'added', 
            `Added movie to ${childInstance.name}`,
            { syncRunId, sourcePath, destinationPath: destPath, languagesDetected: detectedLangs }
          );
        }
      } else {
        if (targetMovie.hasFile) {
          return 'already_exists';
        }
      }

      if (hasLang) {
        // Main file contains target audio: link and rescan child
        const linked = await this.linker.linkExists(sourcePath, mainPath, childPath);
        if (!linked) {
          await this.linker.linkMedia(sourcePath, mainPath, childPath, syncProfile.linkType);
          await childRadarr.rescanMovie(targetMovie.id);
          await this.logAction(
            syncProfile.id, 
            movie.title, 
            'movie', 
            movie.tmdbId.toString(), 
            'linked', 
            `Hardlinked file to ${childInstance.name}`,
            { syncRunId, sourcePath, destinationPath: destPath, languagesDetected: detectedLangs }
          );
          return 'linked';
        }
        return 'already_linked';
      } else if (syncProfile.searchIfMissing) {
        // Target audio is missing AND auto-search is enabled: dispatch search to indexers
        await childRadarr.searchMovie([targetMovie.id]);
        await this.logAction(
          syncProfile.id, 
          movie.title, 
          'movie', 
          movie.tmdbId.toString(), 
          'search_triggered', 
          `Searched for missing language on ${childInstance.name}`,
          { syncRunId, sourcePath, destinationPath: destPath, languagesDetected: detectedLangs }
        );
        return 'search_triggered';
      }
      return 'skipped';
    } catch (e: any) {
      await this.logAction(
        syncProfile.id, 
        movie.title, 
        'movie', 
        movie.tmdbId.toString(), 
        'error', 
        e.message,
        { syncRunId, sourcePath, destinationPath: destPath, languagesDetected: detectedLangs }
      );
      return 'error';
    }
  }

  /**
   * Processes a Sonarr episode synchronization event or library scan item.
   *
   * Logic:
   * 1. Check if the target child instance already has a file for this episode.
   * 2. Inspect the main file to detect whether it contains the child instance's target audio language.
   * 3. Target language present -> create zero-space hardlink/symlink and rescan child series (returns 'linked' or 'already_linked').
   * 4. Target language missing ->
   *    - If searchIfMissing is TRUE: trigger search on child indexers to grab a separate language release (returns 'search_triggered').
   *    - If searchIfMissing is FALSE: skip without triggering search (returns 'skipped', no-op for linking/downloading).
   */
  async processEpisode(
    syncProfile: SyncProfile,
    mainInstance: Instance,
    childInstance: Instance,
    series: SonarrSeries,
    episode: SonarrEpisode,
    episodeFile: SonarrEpisodeFile,
    syncRunId?: string
  ): Promise<'linked' | 'already_linked' | 'search_triggered' | 'already_exists' | 'error' | 'skipped'> {
    const sourcePath = episodeFile.path || '';
    const { mainPath, childPath } = this.getEffectivePaths(syncProfile, mainInstance, childInstance);
    const destPath = this.linker.translatePath(sourcePath, mainPath, childPath);
    let detectedLangs: string[] = [];

    try {
      const hasLang = await this.mediaInspector.hasLanguage(sourcePath, childInstance.language, episodeFile.mediaInfo);
      if (this.mediaInspector.detectLanguages) {
        try {
          detectedLangs = await this.mediaInspector.detectLanguages(sourcePath, episodeFile.mediaInfo);
        } catch {
          detectedLangs = [];
        }
      }

      // Domain Rule: If target audio is missing AND auto-search is OFF, never add or modify child instance
      if (!hasLang && !syncProfile.searchIfMissing) {
        return 'skipped';
      }

      const childSonarr = new SonarrService(childInstance.url, childInstance.apiKey);
      let targetSeries = await childSonarr.getSeriesByTvdbId(series.tvdbId);

      if (!targetSeries) {
        const lookup = await childSonarr.lookupSeries(series.tvdbId).catch(() => null);
        const title = lookup?.title || series.title;
        const tvdbId = lookup?.tvdbId || series.tvdbId;

        targetSeries = await childSonarr.addSeries({
          title,
          tvdbId,
          qualityProfileId: childInstance.qualityProfileId,
          rootFolderPath: childInstance.rootFolderPath,
          monitored: true,
          seasons: (lookup?.seasons || series.seasons).map(s => ({ seasonNumber: s.seasonNumber, monitored: s.monitored })),
          searchForMissingEpisodes: false
        });
        await this.logAction(
          syncProfile.id, 
          series.title, 
          'episode', 
          series.tvdbId.toString(), 
          'added', 
          `Added series to ${childInstance.name}`,
          { syncRunId, sourcePath, destinationPath: destPath }
        );
      }

      const childEpisodes = await childSonarr.getEpisodes(targetSeries.id);
      const ce = childEpisodes.find(e => e.seasonNumber === episode.seasonNumber && e.episodeNumber === episode.episodeNumber);

      if (ce && ce.hasFile) {
        return 'already_exists';
      }

      if (hasLang) {
        // Main episode file contains target audio: link and rescan child series
        const linked = await this.linker.linkExists(sourcePath, mainPath, childPath);
        if (!linked) {
          await this.linker.linkMedia(sourcePath, mainPath, childPath, syncProfile.linkType);
          await childSonarr.rescanSeries(targetSeries.id);
          await this.logAction(
            syncProfile.id, 
            `${series.title} S${episode.seasonNumber}E${episode.episodeNumber}`, 
            'episode', 
            series.tvdbId.toString(), 
            'linked', 
            `Linked file to ${childInstance.name}`,
            { syncRunId, sourcePath, destinationPath: destPath, languagesDetected: detectedLangs }
          );
          return 'linked';
        }
        return 'already_linked';
      } else if (syncProfile.searchIfMissing) {
        // Target audio is missing AND auto-search is enabled: dispatch search for episode on indexers
        if (ce) {
          await childSonarr.searchEpisodes([ce.id]);
          await this.logAction(
            syncProfile.id, 
            `${series.title} S${episode.seasonNumber}E${episode.episodeNumber}`, 
            'episode', 
            series.tvdbId.toString(), 
            'search_triggered', 
            `Triggered search on ${childInstance.name}`,
            { syncRunId, sourcePath, destinationPath: destPath, languagesDetected: detectedLangs }
          );
          return 'search_triggered';
        }
      }
      return 'skipped';
    } catch (e: any) {
      await this.logAction(
        syncProfile.id, 
        `${series.title} S${episode.seasonNumber}E${episode.episodeNumber}`, 
        'episode', 
        series.tvdbId.toString(), 
        'error', 
        e.message,
        { syncRunId, sourcePath, destinationPath: destPath, languagesDetected: detectedLangs }
      );
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
    details: string,
    meta?: {
      syncRunId?: string;
      sourcePath?: string;
      destinationPath?: string;
      languagesDetected?: string[];
    }
  ): Promise<SyncHistory> {
    const repo = this.db.getRepository(SyncHistory);
    const hist = repo.create({
      syncProfileId,
      mediaTitle,
      mediaType,
      externalId,
      action,
      details,
      syncRunId: meta?.syncRunId,
      sourcePath: meta?.sourcePath,
      destinationPath: meta?.destinationPath,
      languagesDetected: meta?.languagesDetected
    });
    return repo.save(hist);
  }

  async dryRunProfile(profileId: number): Promise<DryRunReport> {
    const profile = await this.db.getRepository(SyncProfile).findOne({
      where: { id: profileId },
      relations: ['mainInstance', 'childInstance']
    });

    if (!profile || !profile.mainInstance || !profile.childInstance) {
      throw new Error('Sync profile not found');
    }

    const main = profile.mainInstance;
    const child = profile.childInstance;
    const targetLang = normalizeLanguageCode(child.language || 'en');
    const startTime = Date.now();

    const report: DryRunReport = {
      profileId: profile.id,
      profileName: `${main.name} ➔ ${child.name}`,
      mainInstanceName: main.name,
      childInstanceName: child.name,
      linkType: profile.linkType || 'hardlink',
      targetLanguage: targetLang,
      generatedAt: new Date().toISOString(),
      summary: {
        totalScanned: 0,
        wouldLinkCount: 0,
        needsDownloadCount: 0,
        alreadyLinkedCount: 0,
        alreadyExistsChildCount: 0,
        errorCount: 0,
      },
      wouldLink: [],
      needsDownload: [],
      alreadyLinked: [],
      alreadyExistsChild: [],
      errors: [],
    };

    if (main.type === 'radarr') {
      await this.dryRunRadarr(profile, main, child, targetLang, report);
    } else if (main.type === 'sonarr') {
      await this.dryRunSonarr(profile, main, child, targetLang, report);
    }

    report.summary.wouldLinkCount = report.wouldLink.length;
    report.summary.needsDownloadCount = report.needsDownload.length;
    report.summary.alreadyLinkedCount = report.alreadyLinked.length;
    report.summary.alreadyExistsChildCount = report.alreadyExistsChild.length;
    report.summary.errorCount = report.errors.length;
    report.summary.totalScanned =
      report.summary.wouldLinkCount +
      report.summary.needsDownloadCount +
      report.summary.alreadyLinkedCount +
      report.summary.alreadyExistsChildCount +
      report.summary.errorCount;

    const durationMs = Date.now() - startTime;
    const syncRunId = `dryrun-${profile.id}-${startTime}`;
    const summaryDetails = `Dry run for ${main.name} ➔ ${child.name}: ${report.summary.totalScanned} total items simulated (${report.summary.wouldLinkCount} would link, ${report.summary.needsDownloadCount} needs download, ${report.summary.alreadyLinkedCount} already linked, ${report.summary.alreadyExistsChildCount} on secondary, ${report.summary.errorCount} errors) in ${(durationMs / 1000).toFixed(1)}s.`;

    try {
      const syncRunRepo = this.db.getRepository(SyncRun);
      const historyRepo = this.db.getRepository(SyncHistory);

      const syncRun = syncRunRepo.create({
        syncRunId,
        syncProfileId: profile.id,
        triggerType: 'dry_run',
        status: report.summary.errorCount > 0
          ? (report.summary.wouldLinkCount > 0 || report.summary.needsDownloadCount > 0 ? 'partial' : 'error')
          : 'completed',
        totalScanned: report.summary.totalScanned,
        linkedCount: report.summary.wouldLinkCount,
        alreadyLinkedCount: report.summary.alreadyLinkedCount,
        searchTriggeredCount: report.summary.needsDownloadCount,
        alreadyExistsChildCount: report.summary.alreadyExistsChildCount,
        skippedCount: 0,
        errorCount: report.summary.errorCount,
        durationMs,
        summary: summaryDetails,
        completedAt: new Date()
      });
      await syncRunRepo.save(syncRun);

      const allSimItems: { item: DryRunItem; action: any }[] = [
        ...report.wouldLink.map(i => ({ item: i, action: 'would_link' as const })),
        ...report.needsDownload.map(i => ({ item: i, action: 'needs_download' as const })),
        ...report.alreadyLinked.map(i => ({ item: i, action: 'already_linked' as const })),
        ...report.alreadyExistsChild.map(i => ({ item: i, action: 'already_exists_child' as const })),
        ...report.errors.map(i => ({ item: i, action: 'error' as const })),
      ];

      const historyEntries = allSimItems.map(({ item, action }) =>
        historyRepo.create({
          syncRunId,
          syncProfileId: profile.id,
          mediaTitle: item.title,
          mediaType: item.mediaType,
          externalId: item.externalId,
          action,
          details: item.reason,
          sourcePath: item.sourcePath,
          destinationPath: item.destinationPath,
          languagesDetected: item.languagesDetected,
        })
      );

      if (historyEntries.length > 0) {
        await historyRepo.save(historyEntries);
      }
    } catch (persistErr) {
      logger.warn('[DryRun] Failed to persist dry run audit record:', persistErr);
    }

    return report;
  }

  private async dryRunRadarr(
    profile: SyncProfile,
    main: Instance,
    child: Instance,
    targetLang: string,
    report: DryRunReport
  ): Promise<void> {
    const mainRadarr = new RadarrService(main.url, main.apiKey);
    const childRadarr = new RadarrService(child.url, child.apiKey);

    const [mainMovies, childMovies] = await Promise.all([
      mainRadarr.getMovies(),
      childRadarr.getMovies().catch(() => [] as RadarrMovie[])
    ]);

    const childMovieMap = new Map<number, RadarrMovie>();
    for (const cm of childMovies) {
      if (cm.tmdbId) {
        childMovieMap.set(cm.tmdbId, cm);
      }
    }

    for (const movie of mainMovies) {
      if (!movie.hasFile) continue;
      let movieFile = movie.movieFile;
      if (!movieFile && movie.id) {
        try {
          const files = await mainRadarr.getMovieFiles(movie.id);
          if (files && files.length > 0) movieFile = files[0];
        } catch (err: any) {
          logger.warn(`Could not fetch movie file for ${movie.title}:`, err);
        }
      }
      if (!movieFile || !movieFile.path) continue;
      report.summary.totalScanned++;

      const externalId = movie.tmdbId?.toString() || movie.id.toString();
      const sourcePath = movieFile.path || '';
      const { mainPath, childPath } = this.getEffectivePaths(profile, main, child);
      const destPath = this.linker.translatePath(sourcePath, mainPath, childPath);

      try {
        const detectedLangs = await this.mediaInspector.detectLanguages(sourcePath, movieFile.mediaInfo);
        const hasTargetLang = detectedLangs.includes(targetLang);
        const linkExists = await this.linker.linkExists(sourcePath, mainPath, childPath);
        const targetMovie = movie.tmdbId ? childMovieMap.get(movie.tmdbId) : undefined;

        const baseItem: Omit<DryRunItem, 'action' | 'reason'> = {
          id: `movie-${movie.id}-${externalId}`,
          title: movie.title,
          mediaType: 'movie',
          year: movie.year,
          externalId,
          sourcePath,
          destinationPath: destPath,
          languagesDetected: detectedLangs,
          targetLanguage: targetLang,
        };

        if (hasTargetLang) {
          // Main file HAS the target language audio
          if (linkExists) {
            report.alreadyLinked.push({
              ...baseItem,
              action: 'already_linked',
              reason: `Hardlink is already verified and intact at destination (${destPath}).`,
            });
          } else {
            report.wouldLink.push({
              ...baseItem,
              action: 'would_link',
              reason: !targetMovie
                ? `Contains ${targetLang.toUpperCase()} audio. Will add movie to ${child.name} and hardlink file.`
                : `Contains ${targetLang.toUpperCase()} audio. Will hardlink file to ${child.name}.`,
            });
          }
        } else {
          // Main file LACKS the target language audio -> needs separate download on secondary
          if (targetMovie && targetMovie.hasFile) {
            report.alreadyExistsChild.push({
              ...baseItem,
              action: 'already_exists_child',
              reason: `Secondary instance (${child.name}) already has its own file downloaded.`,
            });
          } else {
            report.needsDownload.push({
              ...baseItem,
              action: 'needs_download',
              searchEnabled: profile.searchIfMissing,
              reason: profile.searchIfMissing
                ? `Lacks ${targetLang.toUpperCase()} audio on main. Will add to ${child.name} and trigger search on indexers.`
                : `Lacks ${targetLang.toUpperCase()} audio on main. Skipped (auto-search off; child instance will not be modified).`,
            });
          }
        }
      } catch (err: any) {
        report.errors.push({
          id: `movie-${movie.id}-${externalId}`,
          title: movie.title,
          mediaType: 'movie',
          year: movie.year,
          externalId,
          sourcePath,
          destinationPath: destPath,
          targetLanguage: targetLang,
          action: 'error',
          reason: `Error inspecting movie: ${err.message}`,
        });
      }
    }
  }

  private async dryRunSonarr(
    profile: SyncProfile,
    main: Instance,
    child: Instance,
    targetLang: string,
    report: DryRunReport
  ): Promise<void> {
    const mainSonarr = new SonarrService(main.url, main.apiKey);
    const childSonarr = new SonarrService(child.url, child.apiKey);

    const [mainSeriesList, childSeriesList] = await Promise.all([
      mainSonarr.getSeries(),
      childSonarr.getSeries().catch(() => [] as SonarrSeries[])
    ]);

    const childSeriesMap = new Map<number, SonarrSeries>();
    for (const cs of childSeriesList) {
      if (cs.tvdbId) {
        childSeriesMap.set(cs.tvdbId, cs);
      }
    }

    for (const series of mainSeriesList) {
      const tvdbId = series.tvdbId;
      const externalId = tvdbId?.toString() || series.id.toString();
      const childSeries = tvdbId ? childSeriesMap.get(tvdbId) : undefined;

      try {
        const [episodes, files, childEpisodes] = await Promise.all([
          mainSonarr.getEpisodes(series.id),
          mainSonarr.getEpisodeFiles(series.id),
          childSeries ? childSonarr.getEpisodes(childSeries.id).catch(() => [] as SonarrEpisode[]) : Promise.resolve([] as SonarrEpisode[])
        ]);

        const fileMap = new Map<number, SonarrEpisodeFile>();
        for (const f of files) {
          fileMap.set(f.id, f);
        }

        const childEpMap = new Map<string, SonarrEpisode>();
        for (const ce of childEpisodes) {
          childEpMap.set(`${ce.seasonNumber}_${ce.episodeNumber}`, ce);
        }

        for (const ep of episodes) {
          if (!ep.hasFile || !ep.episodeFileId) continue;
          const file = fileMap.get(ep.episodeFileId);
          if (!file) continue;

          report.summary.totalScanned++;

          const sourcePath = file.path || '';
          const { mainPath, childPath } = this.getEffectivePaths(profile, main, child);
          const destPath = this.linker.translatePath(sourcePath, mainPath, childPath);
          const detectedLangs = await this.mediaInspector.detectLanguages(sourcePath, file.mediaInfo);
          const hasTargetLang = detectedLangs.includes(targetLang);
          const linkExists = await this.linker.linkExists(sourcePath, mainPath, childPath);
          const childEp = childEpMap.get(`${ep.seasonNumber}_${ep.episodeNumber}`);

          const epTitle = `${series.title} S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`;
          const baseItem: Omit<DryRunItem, 'action' | 'reason'> = {
            id: `ep-${series.id}-${ep.id}`,
            title: epTitle,
            mediaType: 'episode',
            seasonNumber: ep.seasonNumber,
            episodeNumber: ep.episodeNumber,
            year: series.year,
            externalId,
            sourcePath,
            destinationPath: destPath,
            languagesDetected: detectedLangs,
            targetLanguage: targetLang,
          };

          if (hasTargetLang) {
            // Main episode HAS target language audio
            if (linkExists) {
              report.alreadyLinked.push({
                ...baseItem,
                action: 'already_linked',
                reason: `Episode hardlink is already verified and intact at destination (${destPath}).`,
              });
            } else {
              report.wouldLink.push({
                ...baseItem,
                action: 'would_link',
                reason: !childSeries
                  ? `Contains ${targetLang.toUpperCase()} audio. Will add series to ${child.name} and hardlink episode.`
                  : `Contains ${targetLang.toUpperCase()} audio. Will hardlink episode to ${child.name}.`,
              });
            }
          } else {
            // Main episode LACKS target language audio
            if (childEp && childEp.hasFile) {
              report.alreadyExistsChild.push({
                ...baseItem,
                action: 'already_exists_child',
                reason: `Secondary instance (${child.name}) already has its own file for S${ep.seasonNumber}E${ep.episodeNumber}.`,
              });
            } else {
              report.needsDownload.push({
                ...baseItem,
                action: 'needs_download',
                searchEnabled: profile.searchIfMissing,
                reason: profile.searchIfMissing
                  ? `Lacks ${targetLang.toUpperCase()} audio on main. Will trigger search on ${child.name}.`
                  : `Lacks ${targetLang.toUpperCase()} audio on main. Skipped (auto-search off; child instance will not be modified).`,
              });
            }
          }
        }
      } catch (err: any) {
        report.errors.push({
          id: `series-${series.id}-${externalId}`,
          title: series.title,
          mediaType: 'episode',
          year: series.year,
          externalId,
          targetLanguage: targetLang,
          action: 'error',
          reason: `Error inspecting series ${series.title}: ${err.message}`,
        });
      }
    }
  }
}

