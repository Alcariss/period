import type { Entry } from '../types';
import type { CyclePhaseInfo, CyclePhaseName, CycleStats, PeriodPrediction, PeriodSpan } from './cycle-types';
import { parsePeriodNotes, rangesOverlap } from './period-records';
import { CYCLE_EVENT_TYPES, parseEvents } from './cycle-events';
import type { CycleEventType } from './cycle-events';
import { MOON_PHASES, computeMoonPhase } from './moon-phase';
import type { MoonPhaseName } from './moon-phase';

const SAME_PERIOD_MAX_GAP_DAYS = 7;
const DEFAULT_PERIOD_LENGTH_DAYS = 5;
const LUTEAL_PHASE_DAYS = 14;
const OVULATION_WINDOW_DAYS = 2;
const IRREGULAR_VARIATION_THRESHOLD_DAYS = 8;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const PHASE_ORDER: readonly CyclePhaseName[] = ['menstrual', 'follicular', 'ovulation', 'luteal'];

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

function effectiveEnd(period: PeriodSpan): string {
  return period.endDate ?? period.startDate;
}

function resolveOverlaps(spans: PeriodSpan[]): { spans: PeriodSpan[]; warnings: string[] } {
  const sorted = spans
    .slice()
    .sort((left, right) => toDate(left.startDate).getTime() - toDate(right.startDate).getTime());

  const kept: PeriodSpan[] = [];
  const warnings: string[] = [];

  for (const candidate of sorted) {
    if (candidate.endDate !== null && toDate(candidate.endDate).getTime() < toDate(candidate.startDate).getTime()) {
      warnings.push(`Ignored period starting ${candidate.startDate}: end date is before the start date.`);
      continue;
    }

    const conflict = kept.find((existing) =>
      rangesOverlap(candidate.startDate, effectiveEnd(candidate), existing.startDate, effectiveEnd(existing))
    );

    if (!conflict) {
      kept.push(candidate);
      continue;
    }

    const candidateConfirmed = candidate.endDateConfidence === 'confirmed';
    const conflictConfirmed = conflict.endDateConfidence === 'confirmed';

    if (candidateConfirmed && !conflictConfirmed) {
      kept.splice(kept.indexOf(conflict), 1, candidate);
      warnings.push(
        `Ignored inferred period starting ${conflict.startDate}: overlaps confirmed period starting ${candidate.startDate}.`
      );
    } else {
      warnings.push(
        `Ignored period starting ${candidate.startDate}: overlaps period starting ${conflict.startDate}.`
      );
    }
  }

  return { spans: kept, warnings };
}

function collectLegacySummary(entries: Entry[], startDate: string, endDate: string): string {
  const notesInRange = entries
    .filter((entry) => entry.date >= startDate && entry.date <= endDate)
    .map((entry) => entry.notes.trim())
    .filter((text) => text.length > 0);

  const deduped = notesInRange.filter((text, index) => notesInRange.indexOf(text) === index);
  return deduped.join('; ');
}

function buildPeriodSpans(entries: Entry[]): { spans: PeriodSpan[]; warnings: string[] } {
  const explicit: PeriodSpan[] = [];
  const explicitStarts = new Set<string>();

  for (const entry of entries) {
    if (!entry.date) {
      continue;
    }

    const hasColumnMarker = Boolean(entry.periodStart);
    const legacyMarker = hasColumnMarker ? null : parsePeriodNotes(entry.notes);
    if (!hasColumnMarker && !legacyMarker) {
      continue;
    }

    const endDate = hasColumnMarker ? (entry.periodEnd || null) : (legacyMarker?.endDate ?? null);

    explicitStarts.add(entry.date);
    explicit.push({
      startDate: entry.date,
      endDate,
      open: endDate === null,
      endDateConfidence: 'confirmed',
      summary: hasColumnMarker ? entry.periodNotes : ''
    });
  }

  const leftover = entries.filter((entry) => !entry.periodStart && parsePeriodNotes(entry.notes) === null);
  const legacySpans = groupIntoPeriods(leftover)
    .map((group) => {
      const first = group[0];
      const last = group[group.length - 1];
      const startDate = first?.date ?? '';
      const endDate = last?.date ?? first?.date ?? '';
      return {
        startDate,
        endDate,
        open: false,
        endDateConfidence: 'inferred',
        summary: startDate ? collectLegacySummary(leftover, startDate, endDate) : ''
      } satisfies PeriodSpan;
    })
    .filter((period) => period.startDate && !explicitStarts.has(period.startDate));

  return resolveOverlaps([...legacySpans, ...explicit]);
}

export function listPeriodSpans(entries: Entry[]): PeriodSpan[] {
  return buildPeriodSpans(entries).spans;
}

export function getPeriodSpanWarnings(entries: Entry[]): string[] {
  return buildPeriodSpans(entries).warnings;
}

function spanStart(period: PeriodSpan): Date {
  return toDate(period.startDate);
}

function spanLengthDays(period: PeriodSpan, referenceDate: Date): number {
  const start = spanStart(period);
  const end = period.endDate ? toDate(period.endDate) : startOfDay(referenceDate);
  const length = daysBetween(start, end) + 1;
  return length > 0 ? length : DEFAULT_PERIOD_LENGTH_DAYS;
}

function classifyPhase(
  cycleDay: number,
  periodLengthDays: number,
  averageCycleLengthDays: number
): CyclePhaseName {
  const ovulationDay = Math.max(periodLengthDays + 1, averageCycleLengthDays - LUTEAL_PHASE_DAYS);

  if (cycleDay <= periodLengthDays) {
    return 'menstrual';
  }
  if (cycleDay < ovulationDay) {
    return 'follicular';
  }
  if (cycleDay <= ovulationDay + OVULATION_WINDOW_DAYS - 1) {
    return 'ovulation';
  }
  return 'luteal';
}

export function assignPeriodGroups(entries: Entry[]): Record<string, number> {
  const periods = groupIntoPeriods(entries);
  const groupByDate: Record<string, number> = {};

  periods.forEach((period, index) => {
    period.forEach((entry) => {
      groupByDate[entry.date] = index;
    });
  });

  return groupByDate;
}

export function computeCycleStats(entries: Entry[]): CycleStats | null {
  const periods = listPeriodSpans(entries);
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
    cycleLengths.push(daysBetween(spanStart(previous), spanStart(current)));
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

  const periods = listPeriodSpans(entries);
  const lastPeriod = periods[periods.length - 1];
  if (!lastPeriod) {
    return null;
  }

  const lastPeriodStart = spanStart(lastPeriod);
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
  const periods = listPeriodSpans(entries);
  if (periods.length === 0) {
    return null;
  }

  const lastPeriod = periods[periods.length - 1];
  if (!lastPeriod) {
    return null;
  }

  const stats = computeCycleStats(entries);
  const averageCycleLengthDays = stats?.averageCycleLengthDays ?? 28;
  const lastPeriodLengthDays = spanLengthDays(lastPeriod, referenceDate);

  const cycleDay = daysBetween(spanStart(lastPeriod), referenceDate) + 1;
  const phase = classifyPhase(cycleDay, lastPeriodLengthDays, averageCycleLengthDays);

  return {
    phase,
    cycleDay,
    ...PHASE_CONTENT[phase]
  };
}

export function getPhaseForDate(entries: Entry[], date: string): CyclePhaseInfo | null {
  const periods = listPeriodSpans(entries);
  if (periods.length === 0) {
    return null;
  }

  const target = toDate(date);
  let owningPeriod: PeriodSpan | null = null;
  for (const period of periods) {
    if (spanStart(period).getTime() <= target.getTime()) {
      owningPeriod = period;
    } else {
      break;
    }
  }

  if (!owningPeriod) {
    return null;
  }

  const stats = computeCycleStats(entries);
  const averageCycleLengthDays = stats?.averageCycleLengthDays ?? 28;
  const periodLengthDays = spanLengthDays(owningPeriod, target);
  const cycleDay = daysBetween(spanStart(owningPeriod), target) + 1;
  const phase = classifyPhase(cycleDay, periodLengthDays, averageCycleLengthDays);

  return {
    phase,
    cycleDay,
    ...PHASE_CONTENT[phase]
  };
}

export type EventPhaseSummary = {
  eventType: CycleEventType;
  total: number;
  countsByPhase: Record<CyclePhaseName, number>;
  topPhase: CyclePhaseName | null;
};

function emptyPhaseCounts(): Record<CyclePhaseName, number> {
  return { menstrual: 0, follicular: 0, ovulation: 0, luteal: 0 };
}

export function summarizeEventsByPhase(entries: Entry[]): EventPhaseSummary[] {
  const countsByType = new Map<CycleEventType, Record<CyclePhaseName, number>>();
  CYCLE_EVENT_TYPES.forEach((meta) => countsByType.set(meta.id, emptyPhaseCounts()));

  for (const entry of entries) {
    const events = parseEvents(entry.events);
    if (events.length === 0) {
      continue;
    }

    const phaseInfo = getPhaseForDate(entries, entry.date);
    if (!phaseInfo) {
      continue;
    }

    for (const eventType of events) {
      const counts = countsByType.get(eventType);
      if (counts) {
        counts[phaseInfo.phase] += 1;
      }
    }
  }

  return CYCLE_EVENT_TYPES.map((meta) => {
    const countsByPhase = countsByType.get(meta.id) ?? emptyPhaseCounts();
    let total = 0;
    let topPhase: CyclePhaseName | null = null;
    let topCount = 0;

    for (const phase of PHASE_ORDER) {
      const count = countsByPhase[phase];
      total += count;
      if (count > topCount) {
        topCount = count;
        topPhase = phase;
      }
    }

    return { eventType: meta.id, total, countsByPhase, topPhase };
  });
}

export type EventMoonSummary = {
  eventType: CycleEventType;
  total: number;
  topMoonPhase: MoonPhaseName | null;
  topCount: number;
};

function moonPhaseForDate(date: string): MoonPhaseName {
  return computeMoonPhase(new Date(`${date}T12:00:00`)).phase;
}

export function summarizeEventsByMoonPhase(entries: Entry[]): EventMoonSummary[] {
  const countsByType = new Map<CycleEventType, Map<MoonPhaseName, number>>();
  CYCLE_EVENT_TYPES.forEach((meta) => countsByType.set(meta.id, new Map()));

  for (const entry of entries) {
    if (!entry.date) {
      continue;
    }

    const events = parseEvents(entry.events);
    if (events.length === 0) {
      continue;
    }

    const moonPhase = moonPhaseForDate(entry.date);
    for (const eventType of events) {
      const counts = countsByType.get(eventType);
      if (counts) {
        counts.set(moonPhase, (counts.get(moonPhase) ?? 0) + 1);
      }
    }
  }

  return CYCLE_EVENT_TYPES.map((meta) => {
    const counts = countsByType.get(meta.id) ?? new Map<MoonPhaseName, number>();
    let total = 0;
    let topMoonPhase: MoonPhaseName | null = null;
    let topCount = 0;

    for (const moonMeta of MOON_PHASES) {
      const count = counts.get(moonMeta.id) ?? 0;
      total += count;
      if (count > topCount) {
        topCount = count;
        topMoonPhase = moonMeta.id;
      }
    }

    return { eventType: meta.id, total, topMoonPhase, topCount };
  });
}
