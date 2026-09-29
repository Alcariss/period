import type { Entry, NewEntry } from '../types';
import type { PeriodSpan } from './cycle-types';

export const PERIOD_NOTES_PREFIX = '__period__:';

export function encodePeriodNotes(endDate: string | null): string {
  return endDate ? `${PERIOD_NOTES_PREFIX}${endDate}` : `${PERIOD_NOTES_PREFIX}open`;
}

export function parsePeriodNotes(notes: string): { endDate: string | null } | null {
  const trimmed = notes.trim();
  if (!trimmed.startsWith(PERIOD_NOTES_PREFIX)) {
    return null;
  }

  const rest = trimmed.slice(PERIOD_NOTES_PREFIX.length);
  if (rest === 'open' || rest === '') {
    return { endDate: null };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rest)) {
    return { endDate: rest };
  }

  return null;
}

export function isPeriodRecord(entry: Entry): boolean {
  return Boolean(entry.periodStart) || parsePeriodNotes(entry.notes) !== null;
}

// Period rows share a date with daily logs, so anything already stored on that
// date (events, symptoms, notes) must survive the period write.
export function toPeriodEntry(
  startDate: string,
  endDate: string | null,
  summary = '',
  existing?: Entry
): NewEntry {
  const carriedNotes = existing && parsePeriodNotes(existing.notes) === null ? existing.notes : '';

  return {
    date: startDate,
    krvaceni: existing && Number.parseInt(existing.krvaceni, 10) > 0 ? existing.krvaceni : '1',
    nalady: existing?.nalady ?? '',
    tlak: existing?.tlak ?? '',
    nadymani: existing?.nadymani ?? '',
    energie: existing?.energie ?? '',
    notes: carriedNotes,
    periodStart: startDate,
    periodEnd: endDate ?? '',
    periodNotes: summary,
    events: existing?.events ?? ''
  };
}

// Strips the period markers from a row while keeping everything else the user
// logged on that date.
export function toPeriodClearedEntry(existing: Entry): NewEntry {
  const carriedNotes = parsePeriodNotes(existing.notes) === null ? existing.notes : '';

  return {
    ...existing,
    krvaceni: '0',
    notes: carriedNotes,
    periodStart: '',
    periodEnd: '',
    periodNotes: ''
  };
}

// True when a row still holds user data once its period markers are removed.
export function hasNonPeriodData(entry: Entry): boolean {
  const cleared = toPeriodClearedEntry(entry);
  return Boolean(
    cleared.events
      || cleared.notes
      || cleared.nalady
      || cleared.tlak
      || cleared.nadymani
      || cleared.energie
  );
}

export function findOpenPeriod(periods: PeriodSpan[]): PeriodSpan | null {
  for (let index = periods.length - 1; index >= 0; index -= 1) {
    const period = periods[index];
    if (period?.open) {
      return period;
    }
  }

  return null;
}

export function rangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return startA <= endB && startB <= endA;
}
