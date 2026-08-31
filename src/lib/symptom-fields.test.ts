import { describe, expect, it } from 'vitest';

import { activeOptionalFields, availableFieldsToAdd, OPTIONAL_SYMPTOM_FIELDS } from './symptom-fields';

describe('activeOptionalFields', () => {
  it('returns only the optional fields that have a non-blank value', () => {
    const active = activeOptionalFields({
      nalady: '2',
      tlak: '',
      nadymani: undefined,
      energie: '0'
    });

    expect(active).toEqual(['nalady', 'energie']);
  });

  it('returns an empty array when every optional field is blank', () => {
    expect(activeOptionalFields({})).toEqual([]);
  });

  it('treats whitespace-only values as blank', () => {
    expect(activeOptionalFields({ tlak: '   ' })).toEqual([]);
  });
});

describe('availableFieldsToAdd', () => {
  it('returns the optional fields not already active, in canonical order', () => {
    expect(availableFieldsToAdd(['tlak'])).toEqual(['nalady', 'nadymani', 'energie']);
  });

  it('returns an empty array once every optional field is active', () => {
    expect(availableFieldsToAdd(OPTIONAL_SYMPTOM_FIELDS)).toEqual([]);
  });

  it('returns all optional fields when none are active', () => {
    expect(availableFieldsToAdd([])).toEqual(OPTIONAL_SYMPTOM_FIELDS);
  });
});
