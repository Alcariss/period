import type { PeriodSpan } from './cycle-types';

/** Monday-first month, padded only before the first day. Dates stay local. */
export function monthDays(month: string): (string | null)[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(year!, monthNumber! - 1, 1);
  const padding = (first.getDay() + 6) % 7;
  const count = new Date(year!, monthNumber!, 0).getDate();
  return [
    ...Array<null>(padding).fill(null),
    ...Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)
  ];
}

export function periodOnDate(periods: PeriodSpan[], date: string, today: string): PeriodSpan | undefined {
  return periods.find((period) => date >= period.startDate && date <= (period.endDate ?? today));
}
