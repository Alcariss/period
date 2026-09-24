export type MoonPhaseName =
  | 'new'
  | 'waxingCrescent'
  | 'firstQuarter'
  | 'waxingGibbous'
  | 'full'
  | 'waningGibbous'
  | 'lastQuarter'
  | 'waningCrescent';

export type MoonPhaseMeta = {
  id: MoonPhaseName;
  label: string;
  emoji: string;
};

export type MoonPhaseInfo = {
  phase: MoonPhaseName;
  label: string;
  emoji: string;
  illumination: number;
  ageDays: number;
};

const SYNODIC_MONTH_DAYS = 29.530588853;
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);
const MS_PER_DAY = 86400000;
const MOON_PHASE_COUNT = 8;
const MOON_PHASE_BASE_CODEPOINT = 0x1f311;

const MOON_PHASE_DEFS: readonly { id: MoonPhaseName; label: string }[] = [
  { id: 'new', label: 'New moon' },
  { id: 'waxingCrescent', label: 'Waxing crescent' },
  { id: 'firstQuarter', label: 'First quarter' },
  { id: 'waxingGibbous', label: 'Waxing gibbous' },
  { id: 'full', label: 'Full moon' },
  { id: 'waningGibbous', label: 'Waning gibbous' },
  { id: 'lastQuarter', label: 'Last quarter' },
  { id: 'waningCrescent', label: 'Waning crescent' }
];

export const MOON_PHASES: readonly MoonPhaseMeta[] = MOON_PHASE_DEFS.map((def, index) => ({
  id: def.id,
  label: def.label,
  emoji: String.fromCodePoint(MOON_PHASE_BASE_CODEPOINT + index)
}));

export function moonPhaseMeta(phase: MoonPhaseName): MoonPhaseMeta {
  const found = MOON_PHASES.find((meta) => meta.id === phase);
  if (!found) {
    throw new Error(`Unknown moon phase: ${phase}`);
  }
  return found;
}

export function computeMoonAgeDays(date: Date): number {
  const diffDays = (date.getTime() - KNOWN_NEW_MOON_MS) / MS_PER_DAY;
  const age = diffDays % SYNODIC_MONTH_DAYS;
  return age < 0 ? age + SYNODIC_MONTH_DAYS : age;
}

export function computeMoonPhase(date: Date): MoonPhaseInfo {
  const ageDays = computeMoonAgeDays(date);
  const fraction = ageDays / SYNODIC_MONTH_DAYS;
  const index = Math.floor(fraction * MOON_PHASE_COUNT + 0.5) % MOON_PHASE_COUNT;
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;

  const meta = MOON_PHASES[index];
  if (!meta) {
    throw new Error(`Invalid moon phase index: ${index}`);
  }

  return {
    phase: meta.id,
    label: meta.label,
    emoji: meta.emoji,
    illumination,
    ageDays
  };
}
