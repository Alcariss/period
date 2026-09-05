import { describe, expect, it } from 'vitest';

import type { Entry } from '../types';
import {
  encodePeriodNotes,
  findOpenPeriod,
  isPeriodRecord,
  parsePeriodNotes,
  rangesOverlap,
  toPeriodEntry
} from './period-records';
import type { PeriodSpan } from './cycle-types';

function entry(date: string, notes = ''): Entry {
  return { date, krvaceni: '1', nalady: '', tlak: '', nadymani: '', energie: '', notes };
}

describe('period records', () => {
  it('encodes open and closed period notes', () => {
    expect(encodePeriodNotes(null)).toBe('__period__:open');
    expect(encodePeriodNotes('2026-09-08')).toBe('__period__:2026-09-08');
  });

  it('parses open, closed, and non-period notes', () => {
    expect(parsePeriodNotes('__period__:open')).toEqual({ endDate: null });
    expect(parsePeriodNotes('__period__:2026-09-08')).toEqual({ endDate: '2026-09-08' });
    expect(parsePeriodNotes('tired')).toBeNull();
  });

  it('builds a sheet row for a period start', () => {
    expect(toPeriodEntry('2026-09-01', null)).toEqual({
      date: '2026-09-01',
      krvaceni: '1',
      notes: '__period__:open'
    });
  });

  it('detects period records', () => {
    expect(isPeriodRecord(entry('2026-09-01', '__period__:open'))).toBe(true);
    expect(isPeriodRecord(entry('2026-09-01', 'tired'))).toBe(false);
  });

  it('returns the latest open period', () => {
    const periods: PeriodSpan[] = [
      { startDate: '2026-06-01', endDate: '2026-06-05', open: false },
      { startDate: '2026-06-29', endDate: null, open: true }
    ];
    expect(findOpenPeriod(periods)?.startDate).toBe('2026-06-29');
    expect(findOpenPeriod([{ startDate: '2026-06-01', endDate: '2026-06-05', open: false }])).toBeNull();
  });

  it('detects overlapping date ranges', () => {
    expect(rangesOverlap('2026-06-01', '2026-06-05', '2026-06-05', '2026-06-08')).toBe(true);
    expect(rangesOverlap('2026-06-01', '2026-06-05', '2026-06-06', '2026-06-08')).toBe(false);
  });
});
