import type { Entry, NewEntry } from '../types';

const DEFAULT_SYMPTOM = '0';

const SYMPTOM_LIMITS: Record<string, number> = {
  krvaceni: 5,
  nalady: 3,
  tlak: 3,
  nadymani: 3,
  energie: 3
};

export function clampSymptomValue(rawValue: string | undefined, maxValue: number): string {
  const parsed = Number.parseInt(String(rawValue ?? ''), 10);

  if (Number.isNaN(parsed)) {
    return DEFAULT_SYMPTOM;
  }

  const clamped = Math.min(Math.max(parsed, 0), maxValue);
  return String(clamped);
}

export function clampOptionalSymptomValue(rawValue: string | undefined, maxValue: number): string {
  const trimmed = String(rawValue ?? '').trim();

  if (trimmed === '') {
    return '';
  }

  const parsed = Number.parseInt(trimmed, 10);

  if (Number.isNaN(parsed)) {
    return '';
  }

  const clamped = Math.min(Math.max(parsed, 0), maxValue);
  return String(clamped);
}

export function normalizeDate(value: string | undefined): string {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? '' : trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeEntry(rawEntry: Partial<NewEntry>): Entry {
  return {
    date: normalizeDate(rawEntry.date),
    krvaceni: clampSymptomValue(rawEntry.krvaceni, SYMPTOM_LIMITS.krvaceni ?? 0),
    nalady: clampOptionalSymptomValue(rawEntry.nalady, SYMPTOM_LIMITS.nalady ?? 0),
    tlak: clampOptionalSymptomValue(rawEntry.tlak, SYMPTOM_LIMITS.tlak ?? 0),
    nadymani: clampOptionalSymptomValue(rawEntry.nadymani, SYMPTOM_LIMITS.nadymani ?? 0),
    energie: clampOptionalSymptomValue(rawEntry.energie, SYMPTOM_LIMITS.energie ?? 0),
    notes: typeof rawEntry.notes === 'string' ? rawEntry.notes.trim() : ''
  };
}
