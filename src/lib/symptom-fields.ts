import type { SymptomField } from './symptom-labels';

export const OPTIONAL_SYMPTOM_FIELDS: SymptomField[] = ['nalady', 'tlak', 'nadymani', 'energie'];

export function activeOptionalFields(values: Partial<Record<SymptomField, string>>): SymptomField[] {
  return OPTIONAL_SYMPTOM_FIELDS.filter((field) => (values[field] ?? '').trim() !== '');
}

export function availableFieldsToAdd(activeFields: SymptomField[]): SymptomField[] {
  return OPTIONAL_SYMPTOM_FIELDS.filter((field) => !activeFields.includes(field));
}
