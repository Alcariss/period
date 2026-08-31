import { describe, expect, it } from 'vitest';

import {
  clampOptionalSymptomValue,
  clampSymptomValue,
  normalizeDate,
  normalizeEntry
} from './entry-normalizer';

describe('entry normalizer', () => {
  it('normalizes a raw spreadsheet row, keeping unset optional symptoms blank', () => {
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
      tlak: '',
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

  it('clamps required symptom values to their valid range, defaulting missing to 0', () => {
    expect(clampSymptomValue('9', 5)).toBe('5');
    expect(clampSymptomValue('-2', 3)).toBe('0');
    expect(clampSymptomValue('2', 3)).toBe('2');
    expect(clampSymptomValue('', 3)).toBe('0');
  });

  it('clamps optional symptom values but keeps missing/blank values blank', () => {
    expect(clampOptionalSymptomValue('9', 5)).toBe('5');
    expect(clampOptionalSymptomValue('-2', 3)).toBe('0');
    expect(clampOptionalSymptomValue('2', 3)).toBe('2');
    expect(clampOptionalSymptomValue('', 3)).toBe('');
    expect(clampOptionalSymptomValue(undefined, 3)).toBe('');
    expect(clampOptionalSymptomValue('  ', 3)).toBe('');
    expect(clampOptionalSymptomValue('not-a-number', 3)).toBe('');
  });
});
