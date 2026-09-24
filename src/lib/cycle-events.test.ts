import { describe, expect, it } from 'vitest';

import { hasEvent, parseEvents, serializeEvents, toggleEvent } from './cycle-events';

describe('cycle events', () => {
  it('parses valid event ids and ignores unknown ones', () => {
    expect(parseEvents('fight,sex')).toEqual(['fight', 'sex']);
    expect(parseEvents('sex, FIGHT')).toEqual(['fight', 'sex']);
    expect(parseEvents('nap,fight,walk')).toEqual(['fight']);
    expect(parseEvents('')).toEqual([]);
  });

  it('serializes with a stable order and no duplicates', () => {
    expect(serializeEvents(['sex', 'fight'])).toBe('fight,sex');
    expect(serializeEvents(['fight', 'fight'])).toBe('fight');
  });

  it('toggles an event on and off', () => {
    expect(toggleEvent('', 'fight')).toBe('fight');
    expect(toggleEvent('fight', 'sex')).toBe('fight,sex');
    expect(toggleEvent('fight,sex', 'fight')).toBe('sex');
    expect(toggleEvent('sex', 'sex')).toBe('');
  });

  it('reports whether an event is present', () => {
    expect(hasEvent('fight,sex', 'sex')).toBe(true);
    expect(hasEvent('fight', 'sex')).toBe(false);
  });
});
