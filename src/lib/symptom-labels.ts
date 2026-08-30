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
    name: 'Krvácení',
    max: 5,
    labels: ['Žádné', 'Špinění', 'Slabé', 'Střední', 'Silné', 'Velmi silné']
  },
  nalady: {
    emoji: '🌙',
    name: 'Nálady',
    max: 3,
    labels: ['Žádné', 'Mírné', 'Střední', 'Silné']
  },
  tlak: {
    emoji: '💢',
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
    emoji: '⚡',
    name: 'Energie',
    max: 3,
    labels: ['Normální', 'Nízká', 'Velmi nízká', 'Vyčerpaná']
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
