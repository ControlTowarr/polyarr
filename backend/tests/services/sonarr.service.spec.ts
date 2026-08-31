import { SonarrService } from '../../src/services/sonarr.service';

// Mock global fetch
global.fetch = jest.fn();

describe('SonarrService', () => {
  let sonarrService: SonarrService;

  beforeEach(() => {
    sonarrService = new SonarrService('http://localhost:8989', 'apikey123');
    jest.clearAllMocks();
  });

  it('testConnection calls correct URL with API key', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ version: '3.0.0' }),
    });

    const result = await sonarrService.testConnection();
    (expect(result) as any).toEqual({ version: "3.0.0" });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8989/api/v3/system/status', {
      method: 'GET',
      headers: {
        'X-Api-Key': 'apikey123',
        'Content-Type': 'application/json',
      },
    });
  });

  it('getSeries returns parsed response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [{ title: 'Series 1' }],
    });

    const series = await sonarrService.getSeries();
    expect(series as any).toEqual([{ title: 'Series 1' }]);
  });

  it('getSeriesByTvdbId filters correctly', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [{ tvdbId: 100, title: 'Series 1' }, { tvdbId: 200, title: 'Series 2' }],
    });

    const series = await sonarrService.getSeriesByTvdbId(100);
    (expect(series) as any).toEqual({ tvdbId: 100, title: 'Series 1' });
  });

  it('addSeries sends correct payload', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1, title: 'New Series' }),
    });

    const payload = { title: 'New Series', tvdbId: 123 };
    const result = await sonarrService.addSeries(payload as any);

    (expect(result) as any).toEqual({ id: 1, title: 'New Series' });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8989/api/v3/series', (expect as any).objectContaining({
      method: 'POST',
      body: JSON.stringify({ ...payload, addOptions: {} }),
    }));
  });

  it('updateSeries sends correct payload', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1, title: 'Updated Series' }),
    });

    const payload = { id: 1, title: 'Updated Series' };
    await sonarrService.updateSeries(payload as any);

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8989/api/v3/series/1', (expect as any).objectContaining({
      method: 'PUT',
      body: JSON.stringify(payload),
    }));
  });

  it('searchSeason sends correct command', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 10 }),
    });

    await sonarrService.searchSeason(1, 2);

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8989/api/v3/command', (expect as any).objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'SeasonSearch', seriesId: 1, seasonNumber: 2 }),
    }));
  });
  
  it('searchEpisodes sends correct command', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 11 }),
    });

    await sonarrService.searchEpisodes([101, 102]);

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8989/api/v3/command', (expect as any).objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'EpisodeSearch', episodeIds: [101, 102] }),
    }));
  });
  
  it('rescanSeries sends correct command', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 12 }),
    });

    await sonarrService.rescanSeries(1);

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8989/api/v3/command', (expect as any).objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'RescanSeries', seriesId: 1 }),
    }));
  });

  it('throws error for non-ok response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
    });

    await (expect(sonarrService.getSeries()) as any).rejects.toThrow(/Sonarr API Error/);
  });
});
