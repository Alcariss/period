import { describe, expect, it } from 'vitest';

import { assignPeriodGroups, getCyclePhase, computeCycleStats, predictNextPeriod } from './cycle-predictor';
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
