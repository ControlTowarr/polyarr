import { RadarrService } from '../../src/services/radarr.service';

// Mock global fetch
global.fetch = jest.fn();

describe('RadarrService', () => {
  let radarrService: RadarrService;

  beforeEach(() => {
    radarrService = new RadarrService('http://localhost:7878', 'apikey123');
    jest.clearAllMocks();
  });

  it('testConnection calls correct URL with API key', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ version: '3.0.0' }),
    });

    const result = await radarrService.testConnection();
    (expect(result) as any).toEqual({ version: "3.0.0" });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:7878/api/v3/system/status', {
      method: 'GET',
      headers: {
        'X-Api-Key': 'apikey123',
        'Content-Type': 'application/json',
      },
    });
  });

  it('getMovies returns parsed response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [{ title: 'Movie 1' }],
    });

    const movies = await radarrService.getMovies();
    expect(movies as any).toEqual([{ title: 'Movie 1' }]);
  });

  it('getMovieByTmdbId filters correctly', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [{ tmdbId: 100, title: 'Movie 1' }, { tmdbId: 200, title: 'Movie 2' }],
    });

    const movie = await radarrService.getMovieByTmdbId(100);
    expect(movie as any).toEqual({ tmdbId: 100, title: 'Movie 1' });

    const notFound = await radarrService.getMovieByTmdbId(300);
    expect(notFound).toBeNull();
  });

  it('addMovie sends correct payload', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1, title: 'New Movie' }),
    });

    const payload = { title: 'New Movie', tmdbId: 123 };
    const result = await radarrService.addMovie(payload as any);

    (expect(result) as any).toEqual({ id: 1, title: 'New Movie' });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:7878/api/v3/movie', (expect as any).objectContaining({
      method: 'POST',
      body: JSON.stringify({ ...payload, addOptions: {} }),
    }));
  });

  it('searchMovie sends correct command', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 10 }),
    });

    await radarrService.searchMovie([1]);

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:7878/api/v3/command', (expect as any).objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'MoviesSearch', movieIds: [1] }),
    }));
  });

  it('lookupMovie searches with term=tmdb: and returns first match', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [{ id: 1, title: 'Winter\'s Bone', tmdbId: 39013 }],
    });

    const result = await radarrService.lookupMovie(39013);
    (expect(result) as any).toEqual({ id: 1, title: 'Winter\'s Bone', tmdbId: 39013 });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:7878/api/v3/movie/lookup?term=tmdb:39013', (expect as any).objectContaining({
      method: 'GET',
    }));
  });

  it('throws error for non-ok response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await (expect(radarrService.getMovies()) as any).rejects.toThrow(/Radarr API Error/);
  });
});
