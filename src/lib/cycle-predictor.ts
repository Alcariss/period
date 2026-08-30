import type { Entry } from '../types';
import type { CyclePhaseInfo, CyclePhaseName, CycleStats, PeriodPrediction } from './cycle-types';

const SAME_PERIOD_MAX_GAP_DAYS = 7;
const DEFAULT_PERIOD_LENGTH_DAYS = 5;
const LUTEAL_PHASE_DAYS = 14;
const OVULATION_WINDOW_DAYS = 2;
const IRREGULAR_VARIATION_THRESHOLD_DAYS = 8;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const PHASE_CONTENT: Record<CyclePhaseName, { hormonalState: string; commonExperiences: string[] }> = {
  menstrual: {
    hormonalState: 'Estrogen and progesterone are at their lowest as the uterine lining sheds.',
    commonExperiences: ['Cramping', 'Fatigue', 'Low energy', 'Headache', 'Low mood']
  },
  follicular: {
    hormonalState: 'FSH drives follicle growth while estrogen rises, thickening the uterine lining.',
    commonExperiences: ['Rising energy', 'Improving mood', 'Better focus', 'Increased motivation']
  },
  ovulation: {
    hormonalState: 'An LH surge triggers egg release; estrogen peaks just before dropping sharply.',
    commonExperiences: ['Peak energy', 'Higher libido', 'Increased confidence', 'More sociable']
  },
  luteal: {
    hormonalState:
      'Progesterone rises to prepare the uterine lining; without pregnancy, it falls sharply with estrogen near the end.',
    commonExperiences: ['Possible mood swings', 'Bloating', 'Breast tenderness', 'Food cravings', 'Trouble sleeping']
  }
};

function toDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
}

function groupIntoPeriods(entries: Entry[]): Entry[][] {
  const bleedingEntries = entries
    .filter((entry) => Number.parseInt(entry.krvaceni, 10) > 0)
    .slice()
    .sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime());

  if (bleedingEntries.length === 0) {
    return [];
  }

  const firstEntry = bleedingEntries[0];
  if (!firstEntry) {
    return [];
  }

  const periods: Entry[][] = [[firstEntry]];

  for (let i = 1; i < bleedingEntries.length; i += 1) {
    const current = bleedingEntries[i];
    const previous = bleedingEntries[i - 1];
    if (!current || !previous) {
      continue;
    }

    const gap = daysBetween(toDate(previous.date), toDate(current.date));
    const activePeriod = periods[periods.length - 1];

    if (gap <= SAME_PERIOD_MAX_GAP_DAYS && activePeriod) {
      activePeriod.push(current);
    } else {
      periods.push([current]);
    }
  }

  return periods;
}

function periodStartDate(period: Entry[]): Date {
  const first = period[0];
  return toDate(first ? first.date : '');
}

function periodLengthDays(period: Entry[]): number {
  if (period.length === 0) {
    return DEFAULT_PERIOD_LENGTH_DAYS;
  }

  const start = periodStartDate(period);
  const last = period[period.length - 1];
  const end = toDate(last ? last.date : '');
  return daysBetween(start, end) + 1;
}

export function computeCycleStats(entries: Entry[]): CycleStats | null {
  const periods = groupIntoPeriods(entries);
  if (periods.length < 2) {
    return null;
  }

  const cycleLengths: number[] = [];
  for (let i = 1; i < periods.length; i += 1) {
    const current = periods[i];
    const previous = periods[i - 1];
    if (!current || !previous) {
      continue;
    }
    cycleLengths.push(daysBetween(periodStartDate(previous), periodStartDate(current)));
  }

  const averageCycleLengthDays = Math.round(
    cycleLengths.reduce((sum, length) => sum + length, 0) / cycleLengths.length
  );
  const minCycleLengthDays = Math.min(...cycleLengths);
  const maxCycleLengthDays = Math.max(...cycleLengths);

  return {
    averageCycleLengthDays,
    minCycleLengthDays,
    maxCycleLengthDays,
    cycleCount: cycleLengths.length,
    isRegular: maxCycleLengthDays - minCycleLengthDays < IRREGULAR_VARIATION_THRESHOLD_DAYS
  };
}

export function predictNextPeriod(entries: Entry[], referenceDate: Date): PeriodPrediction | null {
  const stats = computeCycleStats(entries);
  if (!stats) {
    return null;
  }

  const periods = groupIntoPeriods(entries);
  const lastPeriod = periods[periods.length - 1];
  if (!lastPeriod) {
    return null;
  }

  const lastPeriodStart = periodStartDate(lastPeriod);
  const predictedStart = new Date(lastPeriodStart);
  predictedStart.setDate(predictedStart.getDate() + stats.averageCycleLengthDays);

  const ovulationEstimate = new Date(predictedStart);
  ovulationEstimate.setDate(ovulationEstimate.getDate() - LUTEAL_PHASE_DAYS);

  return {
    predictedStartDate: toIsoDate(predictedStart),
    daysUntil: daysBetween(referenceDate, predictedStart),
    ovulationEstimateDate: toIsoDate(ovulationEstimate),
    stats
  };
}

export function getCyclePhase(entries: Entry[], referenceDate: Date): CyclePhaseInfo | null {
  const periods = groupIntoPeriods(entries);
  if (periods.length === 0) {
    return null;
  }

  const lastPeriod = periods[periods.length - 1];
  if (!lastPeriod) {
    return null;
  }

  const stats = computeCycleStats(entries);
  const averageCycleLengthDays = stats?.averageCycleLengthDays ?? 28;
  const lastPeriodLengthDays = periodLengthDays(lastPeriod);

  const cycleDay = daysBetween(periodStartDate(lastPeriod), referenceDate) + 1;
  const ovulationDay = Math.max(
    lastPeriodLengthDays + 1,
    averageCycleLengthDays - LUTEAL_PHASE_DAYS
  );

  let phase: CyclePhaseName;
  if (cycleDay <= lastPeriodLengthDays) {
    phase = 'menstrual';
  } else if (cycleDay < ovulationDay) {
    phase = 'follicular';
  } else if (cycleDay <= ovulationDay + OVULATION_WINDOW_DAYS - 1) {
    phase = 'ovulation';
  } else {
    phase = 'luteal';
  }

  return {
    phase,
    cycleDay,
    ...PHASE_CONTENT[phase]
  };
}
