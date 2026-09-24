import { describe, expect, it } from 'vitest';

import { MOON_PHASES, computeMoonPhase, moonPhaseMeta } from './moon-phase';

describe('moon phase', () => {
  it('identifies a known new moon', () => {
    const info = computeMoonPhase(new Date('2024-01-11T12:00:00Z'));
    expect(info.phase).toBe('new');
    expect(info.illumination).toBeLessThan(0.05);
  });

  it('identifies a known full moon', () => {
    const info = computeMoonPhase(new Date('2024-01-25T18:00:00Z'));
    expect(info.phase).toBe('full');
    expect(info.illumination).toBeGreaterThan(0.95);
  });

  it('identifies a first quarter around a week after new moon', () => {
    const info = computeMoonPhase(new Date('2024-01-18T04:00:00Z'));
    expect(info.phase).toBe('firstQuarter');
  });

  it('exposes eight phases with distinct emoji', () => {
    expect(MOON_PHASES).toHaveLength(8);
    const emojis = new Set(MOON_PHASES.map((meta) => meta.emoji));
    expect(emojis.size).toBe(8);
  });

  it('looks up metadata by phase name', () => {
    expect(moonPhaseMeta('full').label).toBe('Full moon');
    expect(moonPhaseMeta('new').emoji).toBe(String.fromCodePoint(0x1f311));
  });
});
