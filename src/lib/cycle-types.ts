export type CyclePhaseName = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';

export type CyclePhaseInfo = {
  phase: CyclePhaseName;
  cycleDay: number;
  hormonalState: string;
  commonExperiences: string[];
};

export type CycleStats = {
  averageCycleLengthDays: number;
  minCycleLengthDays: number;
  maxCycleLengthDays: number;
  cycleCount: number;
  isRegular: boolean;
};

export type PeriodPrediction = {
  predictedStartDate: string;
  daysUntil: number;
  ovulationEstimateDate: string;
  stats: CycleStats;
};
