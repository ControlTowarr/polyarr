import { execFile } from 'child_process';
import { promisify } from 'util';
import { parseAudioLanguages, normalizeLanguageCode } from '../utils/languages';

const execFileAsync = promisify(execFile);

export class MediaInspectorService {
  parseFromArrMediaInfo(mediaInfo: { audioLanguages?: string; audioStreamCount?: number }): string[] | null {
    if (!mediaInfo || !mediaInfo.audioLanguages) return null;
    const langs = parseAudioLanguages(mediaInfo.audioLanguages);
    if (langs.length === 0 || langs.includes('und')) return null;
    if (mediaInfo.audioStreamCount && langs.length !== mediaInfo.audioStreamCount) return null;
    return langs;
  }

  async inspectFile(filePath: string): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync('mediainfo', ['--Output=JSON', filePath]);
      const data = JSON.parse(stdout);
      const tracks = data.media?.track || [];
      const audioTracks = tracks.filter((t: any) => t['@type'] === 'Audio');
      
      const languages = audioTracks
        .map((t: any) => t.Language_String3 || t.Language || 'und')
        .map((l: string) => normalizeLanguageCode(l))
        .filter((l: string) => l !== 'und');

      return [...new Set<string>(languages)];
    } catch (error) {
      console.error(`Failed to inspect file ${filePath}:`, error);
      return [];
    }
  }

  async detectLanguages(filePath: string, mediaInfo?: { audioLanguages?: string; audioStreamCount?: number }): Promise<string[]> {
    const tier1 = this.parseFromArrMediaInfo(mediaInfo || {});
    if (tier1) return tier1;
    return this.inspectFile(filePath);
  }

  async hasLanguage(filePath: string, language: string, mediaInfo?: { audioLanguages?: string; audioStreamCount?: number }): Promise<boolean> {
    const detected = await this.detectLanguages(filePath, mediaInfo);
    return detected.includes(normalizeLanguageCode(language));
  }
}
