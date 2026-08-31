import { normalizeLanguageCode, parseAudioLanguages, hasLanguage, getLanguageDisplayName } from '../../src/utils/languages';

describe('Languages Utility', () => {
  describe('normalizeLanguageCode', () => {
    it('normalizes ISO 639-2/T codes', () => {
      expect(normalizeLanguageCode('eng')).toBe('en');
    });

    it('normalizes ISO 639-2/B codes', () => {
      expect(normalizeLanguageCode('fre')).toBe('fr');
    });

    it('normalizes ISO 639-1 codes', () => {
      expect(normalizeLanguageCode('en')).toBe('en');
    });

    it('normalizes full language names', () => {
      expect(normalizeLanguageCode('english')).toBe('en');
      expect(normalizeLanguageCode('french')).toBe('fr');
    });

    it('handles unknown codes', () => {
      expect(normalizeLanguageCode('xyz')).toBe('und');
    });

    it('is case insensitive', () => {
      expect(normalizeLanguageCode('ENG')).toBe('en');
      expect(normalizeLanguageCode('French')).toBe('fr');
    });

    it('trims whitespace', () => {
      expect(normalizeLanguageCode(' eng ')).toBe('en');
    });
  });

  describe('parseAudioLanguages', () => {
    it('parses a single language', () => {
      expect(parseAudioLanguages('eng')).toEqual(['en']);
    });

    it('parses multiple languages', () => {
      expect(parseAudioLanguages('eng/fra')).toEqual(['en', 'fr']);
    });

    it('filters out unknown (und) codes', () => {
      expect(parseAudioLanguages('eng/und')).toEqual(['en']);
    });

    it('returns empty array for empty string', () => {
      expect(parseAudioLanguages('')).toEqual([]);
    });

    it('parses three languages', () => {
      expect(parseAudioLanguages('eng/fra/deu')).toEqual(['en', 'fr', 'de']);
    });
  });

  describe('hasLanguage', () => {
    it('returns true for a positive match', () => {
      expect(hasLanguage(['en', 'fr'], 'fr')).toBe(true);
    });

    it('returns false for a negative match', () => {
      expect(hasLanguage(['en', 'fr'], 'de')).toBe(false);
    });

    it('handles different code forms for target language', () => {
      expect(hasLanguage(['en', 'fr'], 'french')).toBe(true);
      expect(hasLanguage(['en', 'fr'], 'fre')).toBe(true);
    });
  });

  describe('getLanguageDisplayName', () => {
    it('returns capitalized names for known codes', () => {
      expect(getLanguageDisplayName('en')).toBe('English');
      expect(getLanguageDisplayName('fr')).toBe('French');
      expect(getLanguageDisplayName('de')).toBe('German');
    });

    it('returns the code if unknown', () => {
      expect(getLanguageDisplayName('xyz')).toBe('xyz');
    });
  });
});
