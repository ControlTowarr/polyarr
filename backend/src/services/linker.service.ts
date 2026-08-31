import * as fs from 'fs/promises';
import * as path from 'path';

export class LinkerService {
  translatePath(sourcePath: string, mainPath: string, childPath: string): string {
    if (!sourcePath || !mainPath || !childPath) {
      return sourcePath || '';
    }

    const normalizedSource = sourcePath.replace(/\\/g, '/');
    const normalizedMain = mainPath.replace(/\\/g, '/').replace(/\/+$/, '');
    const normalizedChild = childPath.replace(/\\/g, '/').replace(/\/+$/, '');

    if (normalizedMain && normalizedSource.startsWith(normalizedMain)) {
      return normalizedSource.replace(normalizedMain, normalizedChild);
    }
    return sourcePath;
  }

  async linkMedia(
    sourcePath: string,
    mainPath: string,
    childPath: string,
    linkType: 'hardlink' | 'symlink'
  ): Promise<string> {
    const destPath = this.translatePath(sourcePath, mainPath, childPath);
    await fs.mkdir(path.dirname(destPath), { recursive: true });

    try {
      if (linkType === 'hardlink') {
        await fs.link(sourcePath, destPath);
      } else {
        await fs.symlink(sourcePath, destPath);
      }
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
    return destPath;
  }

  async linkExists(sourcePath: string, mainPath: string, childPath: string): Promise<boolean> {
    const destPath = this.translatePath(sourcePath, mainPath, childPath);
    try {
      await fs.access(destPath);
      return true;
    } catch {
      return false;
    }
  }
}
