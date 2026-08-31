export type SymptomField = 'krvaceni' | 'nalady' | 'tlak' | 'nadymani' | 'energie';

export type SymptomMeta = {
  emoji: string;
  name: string;
  max: number;
  labels: string[];
};

export const SYMPTOM_META: Record<SymptomField, SymptomMeta> = {
  krvaceni: {
    emoji: '🩸',
    name: 'Intenzita',
    max: 5,
    labels: ['Žádná', 'Velmi slabá', 'Slabá', 'Střední', 'Silná', 'Velmi silná']
  },
  nalady: {
    emoji: String.fromCodePoint(0x1f3a2),
    name: 'Výkyvy nálad',
    max: 3,
    labels: ['Žádné', 'Mírné', 'Střední', 'Silné']
  },
  tlak: {
    emoji: String.fromCodePoint(0x1fac3),
    name: 'Tlak v břiše',
    max: 3,
    labels: ['Žádné', 'Mírné', 'Střední', 'Silné']
  },
  nadymani: {
    emoji: '🎈',
    name: 'Nadýmání',
    max: 3,
    labels: ['Žádné', 'Mírné', 'Střední', 'Silné']
  },
  energie: {
    emoji: String.fromCodePoint(0x1faab),
    name: 'Vyčerpání',
    max: 3,
    labels: ['Žádné', 'Mírné', 'Střední', 'Vysoké']
  }
};

export function getSymptomLabel(field: SymptomField, value: string): string {
  const meta = SYMPTOM_META[field];
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < 0 || parsed >= meta.labels.length) {
    return meta.labels[0] ?? '';
  }

  return meta.labels[parsed] ?? '';
}
