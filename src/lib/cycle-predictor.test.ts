import { describe, expect, it } from 'vitest';

import { assignPeriodGroups, getCyclePhase, computeCycleStats, getPeriodSpanWarnings, listPeriodSpans, predictNextPeriod } from './cycle-predictor';
import type { Entry } from '../types';

function entry(date: string, krvaceni = '0'): Entry {
  return { date, krvaceni, nalady: '0', tlak: '0', nadymani: '0', energie: '0', notes: '' };
}

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function periodEntries(startDate: string, lengthDays: number): Entry[] {
  const start = new Date(`${startDate}T00:00:00`);
  return Array.from({ length: lengthDays }, (_, index) => {
    const day = new Date(start);
    day.setDate(day.getDate() + index);
    return entry(toLocalIsoDate(day), '2');
  });
}

describe('computeCycleStats', () => {
  it('returns null when fewer than two periods are logged', () => {
    const entries = periodEntries('2026-06-01', 5);
    expect(computeCycleStats(entries)).toBeNull();
  });

  it('computes average, min, max cycle length across three regular periods', () => {
    const entries = [
      ...periodEntries('2026-06-01', 5),
      ...periodEntries('2026-06-29', 5),
      ...periodEntries('2026-07-27', 5)
    ];

    const stats = computeCycleStats(entries);

    expect(stats).toEqual({
      averageCycleLengthDays: 28,
      minCycleLengthDays: 28,
      maxCycleLengthDays: 28,
      cycleCount: 2,
      isRegular: true
    });
  });

  it('flags irregular cycles when variation is 8 days or more (FIGO threshold)', () => {
    const entries = [
      ...periodEntries('2026-01-01', 4),
      ...periodEntries('2026-01-22', 4),
      ...periodEntries('2026-03-01', 4)
    ];

    const stats = computeCycleStats(entries);

    expect(stats?.isRegular).toBe(false);
  });
});

describe('predictNextPeriod', () => {
  it('returns null when there is not enough cycle history', () => {
    const entries = periodEntries('2026-06-01', 5);
    expect(predictNextPeriod(entries, new Date('2026-06-10'))).toBeNull();
  });

  it('predicts the next start date from the average cycle length and estimates ovulation 14 days earlier', () => {
    const entries = [
      ...periodEntries('2026-06-01', 5),
      ...periodEntries('2026-06-29', 5)
    ];

    const prediction = predictNextPeriod(entries, new Date('2026-07-20'));

    expect(prediction?.predictedStartDate).toBe('2026-07-27');
    expect(prediction?.daysUntil).toBe(7);
    expect(prediction?.ovulationEstimateDate).toBe('2026-07-13');
  });
});

describe('getCyclePhase', () => {
  const entries = [
    ...periodEntries('2026-06-01', 5),
    ...periodEntries('2026-06-29', 5)
  ];

  it('returns null when no bleeding has ever been logged', () => {
    expect(getCyclePhase([], new Date('2026-06-10'))).toBeNull();
  });

  it('classifies a day within the bleeding window as menstrual', () => {
    const phase = getCyclePhase(entries, new Date('2026-06-30'));
    expect(phase?.phase).toBe('menstrual');
    expect(phase?.cycleDay).toBe(2);
  });

  it('stays on cycle day 1 for an evening reference time on the period start day', () => {
    const freshEntries = periodEntries('2026-06-01', 5);
    const eveningOfStartDay = new Date('2026-06-01T22:05:00');
    const phase = getCyclePhase(freshEntries, eveningOfStartDay);
    expect(phase?.cycleDay).toBe(1);
    expect(phase?.phase).toBe('menstrual');
  });

  it('classifies a mid-cycle day before ovulation as follicular', () => {
    const phase = getCyclePhase(entries, new Date('2026-07-06'));
    expect(phase?.phase).toBe('follicular');
    expect(phase?.cycleDay).toBe(8);
  });

  it('classifies the estimated ovulation window as ovulation', () => {
    const phase = getCyclePhase(entries, new Date('2026-07-13'));
    expect(phase?.phase).toBe('ovulation');
  });

  it('classifies the days after ovulation as luteal', () => {
    const phase = getCyclePhase(entries, new Date('2026-07-20'));
    expect(phase?.phase).toBe('luteal');
  });

  it('estimates ovulation around cycle day 10 for a short 24-day average cycle', () => {
    const shortCycleEntries = [
      ...periodEntries('2026-06-01', 5),
      ...periodEntries('2026-06-25', 5)
    ];

    const phase = getCyclePhase(shortCycleEntries, new Date('2026-07-04'));
    expect(phase?.cycleDay).toBe(10);
    expect(phase?.phase).toBe('ovulation');
  });

  it('keeps classifying as luteal when a period is overdue rather than wrapping to a new cycle', () => {
    const phase = getCyclePhase(entries, new Date('2026-08-05'));
    expect(phase?.phase).toBe('luteal');
  });
});

describe('assignPeriodGroups', () => {
  it('assigns the same group index to consecutive bleeding days in one period', () => {
    const groups = assignPeriodGroups(periodEntries('2026-06-01', 3));
    expect(groups['2026-06-01']).toBe(0);
    expect(groups['2026-06-02']).toBe(0);
    expect(groups['2026-06-03']).toBe(0);
  });

  it('assigns increasing group indices to separate periods', () => {
    const entries = [...periodEntries('2026-06-01', 3), ...periodEntries('2026-06-29', 3)];
    const groups = assignPeriodGroups(entries);
    expect(groups['2026-06-01']).toBe(0);
    expect(groups['2026-06-29']).toBe(1);
  });

  it('does not assign a group to non-bleeding entries', () => {
    const groups = assignPeriodGroups([entry('2026-06-15', '0')]);
    expect(groups['2026-06-15']).toBeUndefined();
  });
});

describe('listPeriodSpans', () => {
  it('reads start/end period records from notes', () => {
    const entries: Entry[] = [
      { ...entry('2026-06-01', '1'), notes: '__period__:2026-06-05' },
      { ...entry('2026-06-29', '1'), notes: '__period__:open' }
    ];

    expect(listPeriodSpans(entries)).toEqual([
      { startDate: '2026-06-01', endDate: '2026-06-05', open: false, endDateConfidence: 'confirmed' },
      { startDate: '2026-06-29', endDate: null, open: true, endDateConfidence: 'confirmed' }
    ]);
  });

  it('keeps legacy bleeding groups alongside explicit period records', () => {
    const entries: Entry[] = [
      ...periodEntries('2026-06-01', 5),
      { ...entry('2026-06-29', '1'), notes: '__period__:2026-07-03' }
    ];

    const spans = listPeriodSpans(entries);
    expect(spans).toEqual([
      { startDate: '2026-06-01', endDate: '2026-06-05', open: false, endDateConfidence: 'inferred' },
      { startDate: '2026-06-29', endDate: '2026-07-03', open: false, endDateConfidence: 'confirmed' }
    ]);
    expect(computeCycleStats(entries)?.averageCycleLengthDays).toBe(28);
  });

  it('keeps sparse legacy entries as separate episodes without a confirmed stop date', () => {
    const entries: Entry[] = [
      entry('2026-06-01', '2'),
      entry('2026-06-02', '1'),
      entry('2026-06-29', '2'),
      entry('2026-06-30', '1')
    ];

    const spans = listPeriodSpans(entries);
    expect(spans).toEqual([
      { startDate: '2026-06-01', endDate: '2026-06-02', open: false, endDateConfidence: 'inferred' },
      { startDate: '2026-06-29', endDate: '2026-06-30', open: false, endDateConfidence: 'inferred' }
    ]);
    expect(computeCycleStats(entries)?.averageCycleLengthDays).toBe(28);
  });

  it('treats a gap greater than 7 days as a new episode', () => {
    const entries: Entry[] = [entry('2026-06-01', '1'), entry('2026-06-10', '1')];
    const spans = listPeriodSpans(entries);
    expect(spans).toHaveLength(2);
    expect(spans[0]?.startDate).toBe('2026-06-01');
    expect(spans[1]?.startDate).toBe('2026-06-10');
  });

  it('drops an explicit period whose end date is before its start date and warns', () => {
    const entries: Entry[] = [{ ...entry('2026-06-01', '1'), notes: '__period__:2026-05-30' }];

    expect(listPeriodSpans(entries)).toEqual([]);
    expect(getPeriodSpanWarnings(entries)).toEqual([
      'Ignored period starting 2026-06-01: end date is before the start date.'
    ]);
  });

  it('resolves an overlap between an inferred legacy span and a confirmed explicit span', () => {
    const entries: Entry[] = [
      entry('2026-06-01', '2'),
      entry('2026-06-02', '2'),
      entry('2026-06-03', '2'),
      { ...entry('2026-06-02', '1'), notes: '__period__:2026-06-06' }
    ];

    const spans = listPeriodSpans(entries);
    expect(spans).toEqual([{ startDate: '2026-06-02', endDate: '2026-06-06', open: false, endDateConfidence: 'confirmed' }]);
    expect(getPeriodSpanWarnings(entries)).toEqual([
      'Ignored inferred period starting 2026-06-01: overlaps confirmed period starting 2026-06-02.'
    ]);
  });

  it('warns and drops the later span when two explicit periods overlap', () => {
    const entries: Entry[] = [
      { ...entry('2026-06-01', '1'), notes: '__period__:2026-06-05' },
      { ...entry('2026-06-03', '1'), notes: '__period__:2026-06-08' }
    ];

    const spans = listPeriodSpans(entries);
    expect(spans).toEqual([
      { startDate: '2026-06-01', endDate: '2026-06-05', open: false, endDateConfidence: 'confirmed' }
    ]);
    expect(getPeriodSpanWarnings(entries)).toEqual([
      'Ignored period starting 2026-06-03: overlaps period starting 2026-06-01.'
    ]);
  });
});

