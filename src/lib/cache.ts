import type { Entry } from '../types';

const CACHE_KEY = 'period:v1:entries';
const CACHE_TS_KEY = 'period:v1:entries:ts';

export function loadCache(): { entries: Entry[]; ageMs: number } | null {
  const raw = localStorage.getItem(CACHE_KEY);
  const ts = localStorage.getItem(CACHE_TS_KEY);

  if (!raw || !ts) {
    return null;
  }

  const parsedTs = Number.parseInt(ts, 10);
  if (Number.isNaN(parsedTs)) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Entry[];
    return {
      entries: parsed,
      ageMs: Math.max(0, Date.now() - parsedTs)
    };
  } catch {
    return null;
  }
}

export function saveCache(entries: Entry[]): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(entries));
  localStorage.setItem(CACHE_TS_KEY, Date.now().toString());
}
