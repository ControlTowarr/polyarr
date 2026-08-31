import * as fs from 'fs/promises';
import * as path from 'path';

export interface GlobalSettings {
  setup_completed: boolean;
  syncIntervalMinutes: number;
  defaultDelayHours: number;
  defaultLinkType: 'hardlink' | 'symlink';
  logLevel: string;
}

const defaultSettings: GlobalSettings = {
  setup_completed: false,
  syncIntervalMinutes: 30,
  defaultDelayHours: 48,
  defaultLinkType: 'hardlink',
  logLevel: 'info',
};

export class SettingsService {
  private filePath: string;

  constructor() {
    this.filePath = path.join(process.env.DATA_DIR || './data', 'settings.json');
  }

  async getSettings(): Promise<GlobalSettings> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      return { ...defaultSettings, ...JSON.parse(data) };
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        return { ...defaultSettings };
      }
      throw e;
    }
  }

  async saveSettings(settings: Partial<GlobalSettings>): Promise<GlobalSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...settings };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(updated, null, 2));
    return updated;
  }
}
