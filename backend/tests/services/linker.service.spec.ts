import { LinkerService } from '../../src/services/linker.service';
import * as fs from 'fs/promises';
import * as path from 'path';

jest.mock('fs/promises');

describe('LinkerService', () => {
  let linkerService: LinkerService;

  beforeEach(() => {
    linkerService = new LinkerService();
    jest.clearAllMocks();
  });

  describe('translatePath', () => {
    it('translates path correctly when source is under mainPath', () => {
      const source = '/data/movies/Movie/file.mkv';
      const main = '/data/movies';
      const child = '/data/movies-fr';
      expect(linkerService.translatePath(source, main, child)).toBe('/data/movies-fr/Movie/file.mkv');
    });

    it('returns original path when source is not under mainPath', () => {
      const source = '/other/movies/Movie/file.mkv';
      const main = '/data/movies';
      const child = '/data/movies-fr';
      expect(linkerService.translatePath(source, main, child)).toBe('/other/movies/Movie/file.mkv');
    });

    it('handles trailing slashes on main and child paths', () => {
      const source = '/data/movies/Movie/file.mkv';
      const main = '/data/movies/';
      const child = '/data/movies-fr/';
      expect(linkerService.translatePath(source, main, child)).toBe('/data/movies-fr/Movie/file.mkv');
    });

    it('returns original source when mainPath or childPath is empty', () => {
      const source = '/data/movies/Movie/file.mkv';
      expect(linkerService.translatePath(source, '', '/data/movies-fr')).toBe(source);
      expect(linkerService.translatePath(source, '/data/movies', '')).toBe(source);
    });

    it('handles Windows-style backslashes', () => {
      const source = 'C:\\data\\movies\\Movie\\file.mkv';
      const main = 'C:\\data\\movies';
      const child = 'C:\\data\\movies-fr';
      expect(linkerService.translatePath(source, main, child)).toBe('C:/data/movies-fr/Movie/file.mkv');
    });
  });

  describe('linkMedia', () => {
    it('creates a hardlink when requested', async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.link as jest.Mock).mockResolvedValue(undefined);

      const result = await linkerService.linkMedia('/data/main/file.mkv', '/data/main', '/data/child', 'hardlink');
      
      expect(fs.access).toHaveBeenCalledWith('/data/main/file.mkv');
      expect(fs.mkdir).toHaveBeenCalledWith(path.dirname('/data/child/file.mkv'), { recursive: true });
      expect(fs.link).toHaveBeenCalledWith('/data/main/file.mkv', '/data/child/file.mkv');
      expect(result).toBe('/data/child/file.mkv');
    });

    it('creates a symlink when requested', async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.symlink as jest.Mock).mockResolvedValue(undefined);

      const result = await linkerService.linkMedia('/data/main/file.mkv', '/data/main', '/data/child', 'symlink');
      
      expect(fs.access).toHaveBeenCalledWith('/data/main/file.mkv');
      expect(fs.mkdir).toHaveBeenCalledWith(path.dirname('/data/child/file.mkv'), { recursive: true });
      expect(fs.symlink).toHaveBeenCalledWith('/data/main/file.mkv', '/data/child/file.mkv');
      expect(result).toBe('/data/child/file.mkv');
    });

    it('handles EEXIST gracefully', async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      const error = new Error('File exists');
      (error as any).code = 'EEXIST';
      (fs.link as jest.Mock).mockRejectedValue(error);

      const result = await linkerService.linkMedia('/data/main/file.mkv', '/data/main', '/data/child', 'hardlink');
      expect(result).toBe('/data/child/file.mkv');
    });

    it('throws on non-EEXIST error', async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      const error = new Error('Permission denied');
      (error as any).code = 'EACCES';
      (fs.link as jest.Mock).mockRejectedValue(error);

      await (expect(linkerService.linkMedia('/data/main/file.mkv', '/data/main', '/data/child', 'hardlink')) as any).rejects.toThrow('Permission denied');
    });

    it('throws if source file does not exist without creating destination directory', async () => {
      (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      await expect(linkerService.linkMedia('/data/main/file.mkv', '/data/main', '/data/child', 'hardlink')).rejects.toThrow('ENOENT');
      expect(fs.mkdir).not.toHaveBeenCalled();
    });
  });

  describe('linkExists', () => {
    it('returns true when file exists', async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      const result = await linkerService.linkExists('/data/main/file.mkv', '/data/main', '/data/child');
      expect(result).toBe(true);
      expect(fs.access).toHaveBeenCalledWith('/data/child/file.mkv');
    });

    it('returns false when file does not exist (ENOENT)', async () => {
      (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));
      const result = await linkerService.linkExists('/data/main/file.mkv', '/data/main', '/data/child');
      expect(result).toBe(false);
    });
  });
});
