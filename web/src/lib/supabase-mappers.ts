import type {
  BodyRegion,
  MedProfile,
  MedStatus,
  MedType,
  SessionLog,
  TriggerCategory,
} from "@/lib/types";

export type SessionRow = {
  id: string;
  device_id: string;
  started_at: string;
  completed_at: string | null;
  intensity_start: number;
  intensity_end: number | null;
  trigger: string;
  med_status: string;
  med_type: string;
  body_location: string | null;
  completed: boolean;
  journal_note: string | null;
  next_step_choice: string | null;
};

export function sessionRowToLog(r: SessionRow): SessionLog {
  return {
    id: r.id,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    intensityStart: r.intensity_start,
    intensityEnd: r.intensity_end,
    trigger: r.trigger as TriggerCategory,
    medStatus: r.med_status as MedStatus,
    medType: r.med_type as MedType,
    bodyLocation: r.body_location as BodyRegion | null,
    completed: r.completed,
    journalNote: r.journal_note,
    nextStepChoice: r.next_step_choice,
  };
}

export function sessionLogToInsert(deviceId: string, log: SessionLog) {
  return {
    id: log.id,
    device_id: deviceId,
    started_at: log.startedAt,
    completed_at: log.completedAt,
    intensity_start: log.intensityStart,
    intensity_end: log.intensityEnd,
    trigger: log.trigger,
    med_status: log.medStatus,
    med_type: log.medType,
    body_location: log.bodyLocation,
    completed: log.completed,
    journal_note: log.journalNote,
    next_step_choice: log.nextStepChoice ?? null,
  };
}

export type MedProfileRow = {
  device_id: string;
  med_type: string;
  usual_dose_time: string;
  on_vivitrol_week: number | null;
};

export function medRowToProfile(r: MedProfileRow): MedProfile {
  return {
    medType: r.med_type as MedType,
    usualDoseTime: r.usual_dose_time,
    onVivitrolWeek: r.on_vivitrol_week,
  };
}

export function medProfileToRow(deviceId: string, p: MedProfile) {
  return {
    device_id: deviceId,
    med_type: p.medType,
    usual_dose_time: p.usualDoseTime,
    on_vivitrol_week: p.onVivitrolWeek,
    updated_at: new Date().toISOString(),
  };
}
