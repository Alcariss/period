import { describe, expect, it } from 'vitest';
import { monthDays, periodOnDate } from './calendar';
import type { PeriodSpan } from './cycle-types';

const period: PeriodSpan = { startDate: '2026-09-29', endDate: '2026-10-03', open: false, endDateConfidence: 'confirmed', summary: '' };
describe('calendar history', () => {
  it('lays out Monday-first months, including leap days and year boundaries', () => {
    expect(monthDays('2026-10').slice(0, 5)).toEqual([null, null, null, '2026-10-01', '2026-10-02']);
    expect(monthDays('2024-02').filter(Boolean)).toHaveLength(29);
    expect(monthDays('2027-01').at(-1)).toBe('2027-01-31');
  });
  it('finds the entire period from any included day across a month boundary', () => {
    expect(periodOnDate([period], '2026-10-02', '2026-10-28')).toBe(period);
    expect(periodOnDate([period], '2026-09-29', '2026-10-28')).toBe(period);
    expect(periodOnDate([period], '2026-10-03', '2026-10-28')).toBe(period);
    expect(periodOnDate([period], '2026-10-04', '2026-10-28')).toBeUndefined();
  });
  it('shades an ongoing period through today, excluding future dates', () => {
    const open = { ...period, endDate: null, open: true };
    expect(periodOnDate([open], '2026-10-28', '2026-10-28')).toBe(open);
    expect(periodOnDate([open], '2026-10-29', '2026-10-28')).toBeUndefined();
  });
});
