import { create } from "zustand";
import type {
  BodyRegion,
  MedStatus,
  MedType,
  SessionStep,
  TriggerCategory,
  WavePhase,
} from "@/lib/types";

export const PHASE_DURATIONS: Record<WavePhase, number> = {
  rising: 180,
  peak: 60,
  falling: 180,
};

interface SessionState {
  intensity: number;
  trigger: TriggerCategory | null;
  medStatus: MedStatus | null;
  bodyLocation: BodyRegion | null;
  currentStep: SessionStep;
  currentPhase: WavePhase;
  liveIntensity: number;
  medAckText: string | null;
  bodyScanText: string | null;
  waveNarration: string | null;
  reflectionText: string | null;
  sessionStartedAt: string | null;
  journalNote: string | null;
  nextStepChoice: string | null;
  wavePhaseRequestId: number;

  setIntensity: (value: number) => void;
  setTrigger: (value: TriggerCategory) => void;
  setMedStatus: (value: MedStatus) => void;
  setBodyLocation: (value: BodyRegion | null) => void;
  setCurrentStep: (step: SessionStep) => void;
  setCurrentPhase: (phase: WavePhase) => void;
  setLiveIntensity: (value: number) => void;
  setMedAckText: (text: string | null) => void;
  setBodyScanText: (text: string | null) => void;
  setWaveNarration: (text: string | null) => void;
  setReflectionText: (text: string | null) => void;
  setSessionStartedAt: (iso: string | null) => void;
  setJournalNote: (note: string | null) => void;
  setNextStepChoice: (value: string | null) => void;
  bumpWavePhaseRequest: () => void;
  resetSession: () => void;
}

const initial = {
  intensity: 5,
  trigger: null as TriggerCategory | null,
  medStatus: null as MedStatus | null,
  bodyLocation: null as BodyRegion | null,
  currentStep: "intake" as SessionStep,
  currentPhase: "rising" as WavePhase,
  liveIntensity: 5,
  medAckText: null as string | null,
  bodyScanText: null as string | null,
  waveNarration: null as string | null,
  reflectionText: null as string | null,
  sessionStartedAt: null as string | null,
  journalNote: null as string | null,
  nextStepChoice: null as string | null,
  wavePhaseRequestId: 0,
};

export const useSessionStore = create<SessionState>((set) => ({
  ...initial,

  setIntensity: (intensity) => set({ intensity }),
  setTrigger: (trigger) => set({ trigger }),
  setMedStatus: (medStatus) => set({ medStatus }),
  setBodyLocation: (bodyLocation) => set({ bodyLocation }),
  setCurrentStep: (currentStep) => set({ currentStep }),
  setCurrentPhase: (currentPhase) => set({ currentPhase }),
  setLiveIntensity: (liveIntensity) => set({ liveIntensity }),
  setMedAckText: (medAckText) => set({ medAckText }),
  setBodyScanText: (bodyScanText) => set({ bodyScanText }),
  setWaveNarration: (waveNarration) => set({ waveNarration }),
  setReflectionText: (reflectionText) => set({ reflectionText }),
  setSessionStartedAt: (sessionStartedAt) => set({ sessionStartedAt }),
  setJournalNote: (journalNote) => set({ journalNote }),
  setNextStepChoice: (nextStepChoice) => set({ nextStepChoice }),
  bumpWavePhaseRequest: () =>
    set((s) => ({ wavePhaseRequestId: s.wavePhaseRequestId + 1 })),

  resetSession: () => set({ ...initial, liveIntensity: initial.intensity }),
}));

export function buildIntakePayload(
  intensity: number,
  trigger: TriggerCategory,
  medStatus: MedStatus,
  medType: MedType,
) {
  return { intensity, trigger, medStatus, medType };
}
