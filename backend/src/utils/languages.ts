const langMap: Record<string, string> = { 'eng': 'en', 'en': 'en', 'english': 'en', 'fra': 'fr', 'fre': 'fr', 'fr': 'fr', 'french': 'fr', 'francais': 'fr', 'deu': 'de', 'ger': 'de', 'de': 'de', 'german': 'de', 'deutsch': 'de', 'spa': 'es', 'es': 'es', 'spanish': 'es', 'ita': 'it', 'it': 'it', 'italian': 'it', 'por': 'pt', 'pt': 'pt', 'portuguese': 'pt', 'jpn': 'ja', 'ja': 'ja', 'japanese': 'ja', 'kor': 'ko', 'ko': 'ko', 'korean': 'ko', 'zho': 'zh', 'chi': 'zh', 'zh': 'zh', 'chinese': 'zh', 'rus': 'ru', 'ru': 'ru', 'russian': 'ru', 'ara': 'ar', 'ar': 'ar', 'arabic': 'ar', 'hin': 'hi', 'hi': 'hi', 'hindi': 'hi', 'nld': 'nl', 'dut': 'nl', 'nl': 'nl', 'dutch': 'nl', 'pol': 'pl', 'pl': 'pl', 'polish': 'pl', 'swe': 'sv', 'sv': 'sv', 'swedish': 'sv', 'nor': 'no', 'no': 'no', 'norwegian': 'no', 'dan': 'da', 'da': 'da', 'danish': 'da', 'fin': 'fi', 'fi': 'fi', 'finnish': 'fi', 'tur': 'tr', 'tr': 'tr', 'turkish': 'tr', 'und': 'und' };

export function normalizeLanguageCode(code: string): string {
  const normalized = code.toLowerCase().trim();
  return langMap[normalized] || 'und';
}

export function parseAudioLanguages(audioLanguagesStr: string): string[] {
  if (!audioLanguagesStr) return [];
  return audioLanguagesStr.split('/').map(normalizeLanguageCode).filter(l => l !== 'und');
}

export function hasLanguage(languages: string[], targetLang: string): boolean {
  const normalized = normalizeLanguageCode(targetLang);
  return languages.includes(normalized);
}

export function getLanguageDisplayName(code: string): string {
  const normalized = normalizeLanguageCode(code);
  const entry = Object.entries(langMap).find(([k, v]) => v === normalized && k.length > 3);
  if (entry) {
    return entry[0].charAt(0).toUpperCase() + entry[0].slice(1);
  }
  return code;
}
