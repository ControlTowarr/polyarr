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
    } as unknown as jest.Mocked<MediaInspectorService>;

    linker = {
      linkMedia: jest.fn(),
      linkExists: jest.fn(),
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
});
