export type CycleEventType = 'fight' | 'sex';

export type CycleEventMeta = {
  id: CycleEventType;
  label: string;
  emoji: string;
};

export const CYCLE_EVENT_TYPES: readonly CycleEventMeta[] = [
  { id: 'fight', label: 'Fight', emoji: '🥊' },
  { id: 'sex', label: 'Sex', emoji: '❤️' }
] as const;

const EVENT_SEPARATOR = ',';

const VALID_EVENT_IDS: readonly CycleEventType[] = CYCLE_EVENT_TYPES.map((meta) => meta.id);

export function isCycleEventType(value: string): value is CycleEventType {
  return VALID_EVENT_IDS.includes(value as CycleEventType);
}

export function parseEvents(raw: string): CycleEventType[] {
  if (!raw) {
    return [];
  }

  const seen = new Set<CycleEventType>();
  raw
    .split(EVENT_SEPARATOR)
    .map((part) => part.trim().toLowerCase())
    .filter(isCycleEventType)
    .forEach((id) => seen.add(id));

  return VALID_EVENT_IDS.filter((id) => seen.has(id));
}

export function serializeEvents(events: readonly CycleEventType[]): string {
  return VALID_EVENT_IDS.filter((id) => events.includes(id)).join(EVENT_SEPARATOR);
}

export function toggleEvent(raw: string, type: CycleEventType): string {
  const current = parseEvents(raw);
  const next = current.includes(type)
    ? current.filter((id) => id !== type)
    : [...current, type];

  return serializeEvents(next);
}

export function hasEvent(raw: string, type: CycleEventType): boolean {
  return parseEvents(raw).includes(type);
}
