export type MedType =
  | "buprenorphine"
  | "naltrexone_oral"
  | "naltrexone_vivitrol"
  | "methadone"
  | "none";

export interface MedProfile {
  medType: MedType;
  usualDoseTime: string;
  onVivitrolWeek: number | null;
}

export interface SessionLog {
  id: string;
  startedAt: string;
  completedAt: string | null;
  intensityStart: number;
  intensityEnd: number | null;
  trigger: TriggerCategory;
  medStatus: MedStatus;
  medType: MedType;
  bodyLocation: BodyRegion | null;
  completed: boolean;
  journalNote: string | null;
  nextStepChoice?: string | null;
}

export type TriggerCategory =
  | "stress_emotions"
  | "social"
  | "physical"
  | "unknown"
  | "other";

export type MedStatus =
  | "taken_on_time"
  | "taken_late"
  | "missed"
  | "not_applicable";

export type BodyRegion =
  | "chest"
  | "stomach"
  | "throat"
  | "shoulders"
  | "jaw"
  | "legs"
  | "hands";

export interface UserPrefs {
  name?: string;
  usualDoseTime?: string;
  timezone: string;
  notificationPrefs: {
    inAppRemindersEnabled: boolean;
  };
}

/** Snapshot at start of a craving session (matches guide IntakeData). */
export interface IntakeData {
  intensity: number;
  trigger: TriggerCategory;
  medStatus: MedStatus;
  medType: MedType;
}

export type SessionStep =
  | "intake"
  | "med_ack"
  | "body_scan"
  | "wave"
  | "reflection"
  | "complete";

export type WavePhase = "rising" | "peak" | "falling";

export type SessionApiStep =
  | "med_ack"
  | "body_scan"
  | "wave_phase"
  | "reflection";

export interface WavePhaseExtra {
  phase: WavePhase;
  currentIntensity: number;
}

export interface RiskWindow {
  label: string;
  count: number;
  hourStart: number;
  hourEnd: number;
  dayOfWeek: number | null;
}

export interface MedCorrelationResult {
  avgDropWhenTaken: number | null;
  avgDropWhenMissed: number | null;
  difference: number | null;
  sampleTaken: number;
  sampleMissed: number;
  meaningful: boolean;
}

export interface TriggerStat {
  trigger: TriggerCategory;
  count: number;
  percentage: number;
}

export type NextStepChoice =
  | "call_someone"
  | "walk"
  | "eat"
  | "hands"
  | "rest";
