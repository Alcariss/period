import { describe, expect, it } from 'vitest';

import { clampSymptomValue, normalizeDate, normalizeEntry } from './entry-normalizer';

describe('entry normalizer', () => {
  it('normalizes a raw spreadsheet row into a canonical entry', () => {
    const normalized = normalizeEntry({
      date: '2026-08-15',
      krvaceni: '9',
      nalady: '2',
      tlak: '',
      nadymani: '4',
      energie: '3',
      notes: '  tired  '
    });

    expect(normalized).toEqual({
      date: '2026-08-15',
      krvaceni: '5',
      nalady: '2',
      tlak: '0',
      nadymani: '3',
      energie: '3',
      notes: 'tired'
    });
  });

  it('keeps valid ISO dates intact and invalid dates blank', () => {
    expect(normalizeDate('2026-08-15')).toBe('2026-08-15');
    expect(normalizeDate('not-a-date')).toBe('');
    expect(normalizeDate('')).toBe('');
  });

  it('clamps symptom values to their valid range', () => {
    expect(clampSymptomValue('9', 5)).toBe('5');
    expect(clampSymptomValue('-2', 3)).toBe('0');
    expect(clampSymptomValue('2', 3)).toBe('2');
    expect(clampSymptomValue('', 3)).toBe('0');
  });
});
