import { LibraryScannerService } from '../../src/services/library-scanner.service';
import { DataSource } from 'typeorm';
import { RadarrService } from '../../src/services/radarr.service';
import { SonarrService } from '../../src/services/sonarr.service';

jest.mock('../../src/services/radarr.service');
jest.mock('../../src/services/sonarr.service');

describe('LibraryScannerService', () => {
  let scannerService: LibraryScannerService;
  let db: jest.Mocked<DataSource>;
  let mockRepository: any;

  beforeEach(() => {
    mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((obj) => ({ ...obj, id: 1 })),
      save: jest.fn().mockImplementation((obj) => Promise.resolve(obj)),
    };
    db = {
      getRepository: jest.fn().mockReturnValue(mockRepository),
    } as unknown as jest.Mocked<DataSource>;

    scannerService = new LibraryScannerService(db);
    jest.clearAllMocks();
  });

  it('safely discovers library items for Radarr without writing files', async () => {
    mockRepository.findOne.mockResolvedValueOnce({
      id: 1,
      mainInstance: { id: 1, name: 'Radarr Main', type: 'radarr', url: 'http://localhost:7878', apiKey: 'key1', language: 'en', isMain: true },
      childInstance: { id: 2, name: 'Radarr FR', type: 'radarr', url: 'http://localhost:7777', apiKey: 'key2', language: 'fr', isMain: false },
    });

    const movies = [
      { id: 1, title: 'Inception', year: 2010, tmdbId: 27205, hasFile: true, movieFile: { id: 10, path: '/movies/Inception.mkv', mediaInfo: { audioLanguages: 'eng/fra' } } },
      { id: 2, title: 'Avatar', year: 2009, tmdbId: 19995, hasFile: false },
    ];
    (RadarrService.prototype.getMovies as jest.Mock).mockResolvedValue(movies);

    const result = await scannerService.scanLibrary(1);

    expect(result.total).toBe(4); // 2 movies across 2 instances
    expect(result.errors).toBe(0);
  });

  it('safely discovers library items for Sonarr without writing files', async () => {
    mockRepository.findOne.mockResolvedValueOnce({
      id: 1,
      mainInstance: { id: 1, name: 'Sonarr Main', type: 'sonarr', url: 'http://localhost:8989', apiKey: 'key1', language: 'en', isMain: true },
      childInstance: { id: 2, name: 'Sonarr Anime', type: 'sonarr', url: 'http://localhost:8888', apiKey: 'key2', language: 'ja', isMain: false },
    });

    const seriesList = [
      { id: 100, title: 'Attack on Titan', tvdbId: 267440, year: 2013, monitored: true, statistics: { episodeFileCount: 25 } },
    ];

    (SonarrService.prototype.getSeries as jest.Mock).mockResolvedValue(seriesList);

    const result = await scannerService.scanLibrary(1);

    expect(result.total).toBe(2); // 1 series across 2 instances
    expect(result.errors).toBe(0);
  });

  it('handles individual instance errors gracefully', async () => {
    mockRepository.findOne.mockResolvedValueOnce({
      id: 1,
      mainInstance: { id: 1, name: 'Radarr Main', type: 'radarr', url: 'http://localhost:7878', apiKey: 'key1', language: 'en' },
      childInstance: { id: 2, name: 'Radarr FR', type: 'radarr', url: 'http://localhost:7777', apiKey: 'key2', language: 'fr' },
    });

    (RadarrService.prototype.getMovies as jest.Mock).mockRejectedValueOnce(new Error('Connection timed out'));

    const result = await scannerService.scanLibrary(1);

    expect(result.errors).toBe(1);
    expect(result.details.length).toBe(1);
  });
});
