import { SyncEngineService } from '../../src/services/sync-engine.service';
import { DataSource } from 'typeorm';
import { MediaInspectorService } from '../../src/services/media-inspector.service';
import { LinkerService } from '../../src/services/linker.service';
import { RadarrService } from '../../src/services/radarr.service';
import { SonarrService } from '../../src/services/sonarr.service';
import { SyncProfile, Instance } from '../../src/entities';

jest.mock('../../src/services/radarr.service');
jest.mock('../../src/services/sonarr.service');

describe('SyncEngineService', () => {
  let syncEngine: SyncEngineService;
  let db: jest.Mocked<DataSource>;
  let mediaInspector: jest.Mocked<MediaInspectorService>;
  let linker: jest.Mocked<LinkerService>;
  let mockRepository: any;

  beforeEach(() => {
    mockRepository = {
      findOneBy: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    db = {
      getRepository: jest.fn().mockReturnValue(mockRepository),
    } as unknown as jest.Mocked<DataSource>;

    mediaInspector = {
      hasLanguage: jest.fn(),
      detectLanguages: jest.fn(),
      parseFromArrMediaInfo: jest.fn(),
      inspectFile: jest.fn(),
    } as unknown as jest.Mocked<MediaInspectorService>;

    linker = {
      linkMedia: jest.fn(),
      linkExists: jest.fn(),
      translatePath: jest.fn(),
    } as unknown as jest.Mocked<LinkerService>;

    // Default mock methods for syncEngine tracking/logging
    (SyncEngineService.prototype as any).trackMediaItem = jest.fn();
    (SyncEngineService.prototype as any).logAction = jest.fn();

    syncEngine = new SyncEngineService(db, mediaInspector, linker);
    jest.clearAllMocks();
  });

  describe('processMovie', () => {
    let mockProfile: any;
    let mockMainInstance: any;
    let mockChildInstance: any;
    let mockMovie: any;
    let mockMovieFile: any;

    beforeEach(() => {
      mockProfile = { id: 1, languages: ['fr'], linkType: 'hardlink', mainPath: '/main', childPath: '/child', searchIfMissing: true } as any;
      mockMainInstance = { id: 1, type: 'radarr', url: 'url1', apiKey: 'key1' } as any;
      mockChildInstance = { id: 2, type: 'radarr', url: 'url2', apiKey: 'key2', rootFolderPath: '/child', language: 'fr' } as any;
      mockMovie = { tmdbId: 100, title: 'Test Movie', rootFolderPath: '/main' };
      mockMovieFile = { path: '/main/Test Movie/file.mkv', mediaInfo: { audioLanguages: 'eng' } };
      
      (RadarrService.prototype.getMovieByTmdbId as jest.Mock).mockResolvedValue({ id: 200, hasFile: false });
      (RadarrService.prototype.addMovie as jest.Mock).mockResolvedValue({ id: 200, hasFile: false });
      (RadarrService.prototype.getMovieFiles as jest.Mock).mockResolvedValue([]);
      (RadarrService.prototype.searchMovie as jest.Mock).mockResolvedValue(undefined);
      (RadarrService.prototype.rescanMovie as jest.Mock).mockResolvedValue(undefined);
      (RadarrService.prototype.lookupMovie as jest.Mock).mockResolvedValue({ tmdbId: 100, title: 'Test Movie' });
    });

    it('should link file and rescan when child language is present', async () => {
      mediaInspector.hasLanguage.mockResolvedValue(true);
      (RadarrService.prototype.getMovieByTmdbId as jest.Mock).mockResolvedValue({ id: 200, hasFile: false });
      
      const result = await syncEngine.processMovie(mockProfile, mockMainInstance, mockChildInstance, mockMovie, mockMovieFile);
      
      expect(result).toBe('linked');
      expect(linker.linkMedia).toHaveBeenCalledWith('/main/Test Movie/file.mkv', '/main', '/child', 'hardlink');
      expect(RadarrService.prototype.rescanMovie).toHaveBeenCalledWith(200);
    });

    it('should trigger search when child language is NOT present', async () => {
      mediaInspector.hasLanguage.mockResolvedValue(false);
      (RadarrService.prototype.getMovieByTmdbId as jest.Mock).mockResolvedValue({ id: 200, hasFile: false });
      
      const result = await syncEngine.processMovie(mockProfile, mockMainInstance, mockChildInstance, mockMovie, mockMovieFile);
      
      expect(result).toBe('search_triggered');
      expect(RadarrService.prototype.searchMovie).toHaveBeenCalledWith([200]);
    });

    it('should return already_exists when movie exists in child with file', async () => {
      mediaInspector.hasLanguage.mockResolvedValue(true);
      (RadarrService.prototype.getMovieByTmdbId as jest.Mock).mockResolvedValue({ id: 200, hasFile: true });
      (RadarrService.prototype.getMovieFiles as jest.Mock).mockResolvedValue([{ size: 100 }]); 
      
      const result = await syncEngine.processMovie(mockProfile, mockMainInstance, mockChildInstance, mockMovie, mockMovieFile);
      
      expect(result).toBe('already_exists');
      expect(linker.linkMedia).not.toHaveBeenCalled();
    });

    it('should lookup and add movie if not in child', async () => {
      mediaInspector.hasLanguage.mockResolvedValue(true);
      (RadarrService.prototype.getMovieByTmdbId as jest.Mock).mockResolvedValue(undefined);
      (RadarrService.prototype.addMovie as jest.Mock).mockResolvedValue({ id: 200, hasFile: false });
      
      const result = await syncEngine.processMovie(mockProfile, mockMainInstance, mockChildInstance, mockMovie, mockMovieFile);
      
      expect(result).toBe('linked');
      expect(RadarrService.prototype.addMovie).toHaveBeenCalled();
      expect(linker.linkMedia).toHaveBeenCalled();
    });
  });

  describe('processEpisode', () => {
    let mockProfile: any;
    let mockMainInstance: any;
    let mockChildInstance: any;
    let mockSeries: any;
    let mockEpisode: any;
    let mockEpisodeFile: any;

    beforeEach(() => {
      mockProfile = { id: 1, languages: ['fr'], linkType: 'hardlink', mainPath: '/main/Test Series', childPath: '/child/Test Series', searchIfMissing: true } as any;
      mockMainInstance = { id: 1, type: 'sonarr', url: 'url1', apiKey: 'key1' } as any;
      mockChildInstance = { id: 2, type: 'sonarr', url: 'url2', apiKey: 'key2', rootFolderPath: '/child', language: 'fr' } as any;
      mockSeries = { tvdbId: 100, title: 'Test Series', path: '/main/Test Series' };
      mockEpisode = { id: 10, seasonNumber: 1, episodeNumber: 1 };
      mockEpisodeFile = { path: '/main/Test Series/Season 1/ep1.mkv', mediaInfo: { audioLanguages: 'eng' } };

      (SonarrService.prototype.getSeriesByTvdbId as jest.Mock).mockResolvedValue({ id: 200, path: '/child/Test Series' });
      (SonarrService.prototype.getEpisodes as jest.Mock).mockResolvedValue([{ id: 201, seasonNumber: 1, episodeNumber: 1, hasFile: false }]);
      (SonarrService.prototype.rescanSeries as jest.Mock).mockResolvedValue(undefined);
      (SonarrService.prototype.searchEpisodes as jest.Mock).mockResolvedValue(undefined);
      (SonarrService.prototype.lookupSeries as jest.Mock).mockResolvedValue({ tvdbId: 100, title: 'Test Series' });
      (SonarrService.prototype.addSeries as jest.Mock).mockResolvedValue({ id: 200 });
    });

    it('links file and rescans when language matches', async () => {
      mediaInspector.hasLanguage.mockResolvedValue(true);

      const result = await syncEngine.processEpisode(mockProfile, mockMainInstance, mockChildInstance, mockSeries, mockEpisode, mockEpisodeFile);
      
      expect(result).toBe('linked');
      expect(linker.linkMedia).toHaveBeenCalledWith('/main/Test Series/Season 1/ep1.mkv', '/main/Test Series', '/child/Test Series', 'hardlink');
      expect(SonarrService.prototype.rescanSeries).toHaveBeenCalledWith(200);
    });

    it('triggers search when language does not match', async () => {
      mediaInspector.hasLanguage.mockResolvedValue(false);

      const result = await syncEngine.processEpisode(mockProfile, mockMainInstance, mockChildInstance, mockSeries, mockEpisode, mockEpisodeFile);
      
      expect(result).toBe('search_triggered');
      expect(SonarrService.prototype.searchEpisodes).toHaveBeenCalledWith([201]);
    });
  });

  describe('syncMonitoredSeasons', () => {
    it('updates child seasons to match main', async () => {
      mockRepository.findOneBy
        .mockResolvedValueOnce({ id: 1, type: 'sonarr', url: 'url1', apiKey: 'key1' })
        .mockResolvedValueOnce({ id: 2, type: 'sonarr', url: 'url2', apiKey: 'key2' });

      (SonarrService.prototype.getSeries as jest.Mock).mockResolvedValue([{ tvdbId: 10, seasons: [{ seasonNumber: 1, monitored: true }] }]);
      (SonarrService.prototype.getSeriesByTvdbId as jest.Mock).mockResolvedValue({ id: 100, seasons: [{ seasonNumber: 1, monitored: false }] });
      (SonarrService.prototype.updateSeries as jest.Mock).mockResolvedValue(undefined);

      await syncEngine.syncMonitoredSeasons({ mainInstanceId: 1, childInstanceId: 2 } as any);
      
      expect(SonarrService.prototype.updateSeries).toHaveBeenCalledWith((expect as any).objectContaining({
        id: 100,
        seasons: [{ seasonNumber: 1, monitored: true }]
      }));
    });
  });

  describe('dryRunProfile', () => {
    it('generates correct report for Radarr profile without making mutations', async () => {
      const mockProfile = {
        id: 1,
        mainInstanceId: 1,
        childInstanceId: 2,
        linkType: 'hardlink',
        mainPath: '/movies-main',
        childPath: '/movies-child',
        searchIfMissing: true,
        mainInstance: { id: 1, name: 'Radarr Main', type: 'radarr', url: 'http://main-radarr', apiKey: 'k1', language: 'en' },
        childInstance: { id: 2, name: 'Radarr French', type: 'radarr', url: 'http://child-radarr', apiKey: 'k2', language: 'fr' }
      };

      mockRepository.findOne.mockResolvedValue(mockProfile);

      // Main has 4 movies:
      // 1. Movie A (tmdb: 101) has 'fr' audio, not on child -> should be wouldLink
      // 2. Movie B (tmdb: 102) has 'en' audio only, not on child -> should be needsDownload
      // 3. Movie C (tmdb: 103) has 'fr' audio, on child with file, link exists -> alreadyLinked
      // 4. Movie D (tmdb: 104) has 'en' audio, on child with file -> alreadyExistsChild
      (RadarrService.prototype.getMovies as jest.Mock)
        .mockResolvedValueOnce([
          { id: 1, tmdbId: 101, title: 'Movie A', year: 2021, hasFile: true, movieFile: { path: '/movies-main/Movie A/file.mkv' } },
          { id: 2, tmdbId: 102, title: 'Movie B', year: 2022, hasFile: true, movieFile: { path: '/movies-main/Movie B/file.mkv' } },
          { id: 3, tmdbId: 103, title: 'Movie C', year: 2023, hasFile: true, movieFile: { path: '/movies-main/Movie C/file.mkv' } },
          { id: 4, tmdbId: 104, title: 'Movie D', year: 2024, hasFile: true, movieFile: { path: '/movies-main/Movie D/file.mkv' } },
        ])
        .mockResolvedValueOnce([
          { id: 30, tmdbId: 103, title: 'Movie C', year: 2023, hasFile: true },
          { id: 40, tmdbId: 104, title: 'Movie D', year: 2024, hasFile: true, path: '/movies-child/Movie D' },
        ]);

      mediaInspector.detectLanguages.mockImplementation(async (path: string) => {
        if (path.includes('Movie B') || path.includes('Movie D')) return ['en'];
        return ['en', 'fr'];
      });

      linker.translatePath.mockImplementation((src: string, main: string, child: string) => {
        return src.replace(main, child);
      });

      linker.linkExists.mockImplementation(async (src: string) => {
        return src.includes('Movie C');
      });

      const report = await syncEngine.dryRunProfile(1);

      expect(report.profileId).toBe(1);
      expect(report.targetLanguage).toBe('fr');
      expect(report.summary.totalScanned).toBe(4);
      expect(report.wouldLink.length).toBe(1);
      expect(report.wouldLink[0].title).toBe('Movie A');
      expect(report.needsDownload.length).toBe(1);
      expect(report.needsDownload[0].title).toBe('Movie B');
      expect(report.alreadyLinked.length).toBe(1);
      expect(report.alreadyLinked[0].title).toBe('Movie C');
      expect(report.alreadyExistsChild.length).toBe(1);
      expect(report.alreadyExistsChild[0].title).toBe('Movie D');
      expect(report.errors.length).toBe(0);

      // Verify no mutations were performed
      expect(RadarrService.prototype.addMovie).not.toHaveBeenCalled();
      expect(RadarrService.prototype.searchMovie).not.toHaveBeenCalled();
      expect(linker.linkMedia).not.toHaveBeenCalled();
    });

    it('generates correct report for Sonarr profile without making mutations', async () => {
      const mockProfile = {
        id: 2,
        mainInstanceId: 3,
        childInstanceId: 4,
        linkType: 'hardlink',
        mainPath: '/tv-main',
        childPath: '/tv-child',
        searchIfMissing: true,
        mainInstance: { id: 3, name: 'Sonarr Main', type: 'sonarr', url: 'http://main-sonarr', apiKey: 'k3', language: 'en' },
        childInstance: { id: 4, name: 'Sonarr French', type: 'sonarr', url: 'http://child-sonarr', apiKey: 'k4', language: 'fr' }
      };

      mockRepository.findOne.mockResolvedValue(mockProfile);

      (SonarrService.prototype.getSeries as jest.Mock)
        .mockResolvedValueOnce([
          { id: 10, tvdbId: 2001, title: 'Series Main Only', year: 2020 },
          { id: 20, tvdbId: 2002, title: 'Series Both', year: 2021 }
        ])
        .mockResolvedValueOnce([
          { id: 50, tvdbId: 2002, title: 'Series Both', year: 2021 }
        ]);

      (SonarrService.prototype.getEpisodes as jest.Mock).mockImplementation(async (seriesId: number) => {
        if (seriesId === 10) {
          return [{ id: 1, seriesId: 10, seasonNumber: 1, episodeNumber: 1, hasFile: true, episodeFileId: 101 }];
        }
        if (seriesId === 20) {
          return [
            { id: 2, seriesId: 20, seasonNumber: 1, episodeNumber: 1, hasFile: true, episodeFileId: 102 },
            { id: 3, seriesId: 20, seasonNumber: 1, episodeNumber: 2, hasFile: true, episodeFileId: 103 },
          ];
        }
        if (seriesId === 50) {
          return [
            { id: 51, seriesId: 50, seasonNumber: 1, episodeNumber: 1, hasFile: true },
            { id: 52, seriesId: 50, seasonNumber: 1, episodeNumber: 2, hasFile: false },
          ];
        }
        return [];
      });

      (SonarrService.prototype.getEpisodeFiles as jest.Mock).mockImplementation(async (seriesId: number) => {
        if (seriesId === 10) {
          return [{ id: 101, path: '/tv-main/Series Main Only/S01E01.mkv' }];
        }
        if (seriesId === 20) {
          return [
            { id: 102, path: '/tv-main/Series Both/S01E01.mkv' },
            { id: 103, path: '/tv-main/Series Both/S01E02.mkv' },
          ];
        }
        return [];
      });

      mediaInspector.detectLanguages.mockImplementation(async (path: string) => {
        if (path.includes('S01E02')) return ['en'];
        return ['en', 'fr'];
      });
      linker.translatePath.mockImplementation((src: string, main: string, child: string) => src.replace(main, child));
      linker.linkExists.mockImplementation(async (src: string) => src.includes('Series Both/S01E01.mkv'));

      const report = await syncEngine.dryRunProfile(2);

      expect(report.profileId).toBe(2);
      expect(report.summary.totalScanned).toBe(3);
      expect(report.wouldLink.length).toBe(1); // S01E01 on Series Main Only (has FR, not linked)
      expect(report.alreadyLinked.length).toBe(1); // S01E01 on Series Both (has FR, linkExists)
      expect(report.needsDownload.length).toBe(1); // S01E02 on Series Both (lacks FR, child lacks file)
      expect(report.errors.length).toBe(0);

      // Verify no mutating calls
      expect(SonarrService.prototype.addSeries).not.toHaveBeenCalled();
      expect(SonarrService.prototype.searchEpisodes).not.toHaveBeenCalled();
      expect(linker.linkMedia).not.toHaveBeenCalled();
    });
  });
});
