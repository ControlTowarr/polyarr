import { MediaInspectorService } from '../../src/services/media-inspector.service';
import * as child_process from 'child_process';
import { promisify } from 'util';

jest.mock('child_process', () => ({
  execFile: jest.fn((cmd, args, callback) => {
    callback(null, { stdout: '' });
  }),
}));

describe('MediaInspectorService', () => {
  let inspectorService: MediaInspectorService;

  beforeEach(() => {
    inspectorService = new MediaInspectorService();
    jest.clearAllMocks();
  });

  describe('parseFromArrMediaInfo', () => {
    it('returns parsed languages for valid data', () => {
      const result = inspectorService.parseFromArrMediaInfo({ audioLanguages: 'eng/fra', audioStreamCount: 2 });
      expect(result).toEqual(['en', 'fr']);
    });

    it('returns null for missing audioLanguages', () => {
      expect(inspectorService.parseFromArrMediaInfo({})).toBeNull();
    });

    it('returns null when langs include und', () => {
      // und is filtered out by parseAudioLanguages, so if it results in fewer streams or empty array...
      // Actually parseAudioLanguages filters 'und', so 'eng/und' becomes ['en'].
      // If original had 'eng/und', the parsed is ['en'] (length 1).
      // If audioStreamCount was 2, length matches check fails.
      const result = inspectorService.parseFromArrMediaInfo({ audioLanguages: 'und', audioStreamCount: 1 });
      expect(result).toBeNull();
    });

    it('returns null when audioStreamCount disagrees', () => {
      const result = inspectorService.parseFromArrMediaInfo({ audioLanguages: 'eng', audioStreamCount: 2 });
      expect(result).toBeNull();
    });
  });

  describe('inspectFile', () => {
    it('parses languages from mediainfo JSON', async () => {
      const mockOutput = JSON.stringify({
        media: {
          track: [
            { '@type': 'General' },
            { '@type': 'Audio', Language_String3: 'eng' },
            { '@type': 'Audio', Language: 'fra' }
          ]
        }
      });
      (child_process.execFile as any).mockImplementation((file: string, args: string[], callback: Function) => {
        callback(null, { stdout: mockOutput });
      });

      const result = await inspectorService.inspectFile('/path/to/file.mkv');
      expect(result).toEqual(['en', 'fr']);
    });

    it('filters unknown audio tracks and returns unique', async () => {
      const mockOutput = JSON.stringify({
        media: {
          track: [
            { '@type': 'Audio', Language_String3: 'eng' },
            { '@type': 'Audio', Language_String3: 'eng' },
            { '@type': 'Audio' } // und
          ]
        }
      });
      (child_process.execFile as any).mockImplementation((file: string, args: string[], callback: Function) => {
        callback(null, { stdout: mockOutput });
      });

      const result = await inspectorService.inspectFile('/path/to/file.mkv');
      expect(result).toEqual(['en']);
    });

    it('returns empty array on exec error', async () => {
      (child_process.execFile as any).mockImplementation((file: string, args: string[], callback: Function) => {
        callback(new Error('Exec failed'));
      });

      const result = await inspectorService.inspectFile('/path/to/file.mkv');
      expect(result).toEqual([]);
    });
  });

  describe('detectLanguages', () => {
    it('uses Tier 1 when reliable', async () => {
      const result = await inspectorService.detectLanguages('/path/to/file.mkv', { audioLanguages: 'eng/fra', audioStreamCount: 2 });
      expect(result).toEqual(['en', 'fr']);
      expect(child_process.execFile).not.toHaveBeenCalled();
    });

    it('falls back to Tier 2 when Tier 1 returns null', async () => {
      const mockOutput = JSON.stringify({
        media: { track: [{ '@type': 'Audio', Language_String3: 'eng' }] }
      });
      (child_process.execFile as any).mockImplementation((file: string, args: string[], callback: Function) => {
        callback(null, { stdout: mockOutput });
      });

      const result = await inspectorService.detectLanguages('/path/to/file.mkv', { audioLanguages: 'eng', audioStreamCount: 2 });
      expect(result).toEqual(['en']);
      expect(child_process.execFile).toHaveBeenCalled();
    });
  });

  describe('hasLanguage', () => {
    it('returns true when language is present', async () => {
      const result = await inspectorService.hasLanguage('/path/to/file.mkv', 'fre', { audioLanguages: 'eng/fra', audioStreamCount: 2 });
      expect(result).toBe(true);
    });

    it('returns false when language is not present', async () => {
      const result = await inspectorService.hasLanguage('/path/to/file.mkv', 'deu', { audioLanguages: 'eng/fra', audioStreamCount: 2 });
      expect(result).toBe(false);
    });
  });
});
