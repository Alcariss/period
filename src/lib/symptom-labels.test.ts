import { describe, expect, it } from 'vitest';

import { getSymptomLabel, SYMPTOM_META } from './symptom-labels';

describe('getSymptomLabel', () => {
  it('returns the Czech label for a valid bleeding intensity', () => {
    expect(getSymptomLabel('krvaceni', '0')).toBe('Žádné');
    expect(getSymptomLabel('krvaceni', '5')).toBe('Velmi silné');
  });

  it('returns the Czech label for the energy scale, which uses distinct wording', () => {
    expect(getSymptomLabel('energie', '3')).toBe('Vyčerpaná');
  });

  it('falls back to the lowest label for out-of-range or invalid values', () => {
    expect(getSymptomLabel('nalady', '9')).toBe('Žádné');
    expect(getSymptomLabel('nalady', 'not-a-number')).toBe('Žádné');
  });

  it('exposes the max scale value used to size each slider', () => {
    expect(SYMPTOM_META.krvaceni.max).toBe(5);
    expect(SYMPTOM_META.nalady.max).toBe(3);
  });
});
