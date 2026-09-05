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
  return parsePeriodNotes(entry.notes) !== null;
}

export function toPeriodEntry(startDate: string, endDate: string | null): NewEntry {
  return {
    date: startDate,
    krvaceni: '1',
    notes: encodePeriodNotes(endDate)
  };
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
