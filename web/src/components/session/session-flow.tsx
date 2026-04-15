"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IntakeContainer } from "@/components/intake/intake-container";
import { BodyDiagramSvg } from "@/components/session/body-diagram-svg";
import { MedAckScreen } from "@/components/session/med-ack-screen";
import { ReflectionScreen } from "@/components/session/reflection-screen";
import { WaveCanvas } from "@/components/session/wave-canvas";
import { WaveIntensitySlider } from "@/components/session/wave-intensity-slider";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { useWaveSequence } from "@/hooks/use-wave-sequence";
import { postSessionStep } from "@/lib/api-session";
import { medTypeLabel } from "@/lib/medications";
import { getCurrentStreak } from "@/lib/patterns";
import { getAllSessions, saveSession } from "@/lib/storage";
import type {
  BodyRegion,
  MedStatus,
  NextStepChoice,
  SessionLog,
  TriggerCategory,
  WavePhase,
} from "@/lib/types";
import {
  buildIntakePayload,
  useSessionStore,
} from "@/store/sessionStore";
import { useUserStore } from "@/store/userStore";

export function SessionFlow() {
  const router = useRouter();
  const medProfile = useUserStore((s) => s.medProfile);
  const {
    intensity,
    trigger,
    medStatus,
    bodyLocation,
    currentStep,
    currentPhase,
    liveIntensity,
    medAckText,
    bodyScanText,
    waveNarration,
    reflectionText,
    sessionStartedAt,
    journalNote,
    nextStepChoice,
    setIntensity,
    setTrigger,
    setMedStatus,
    setBodyLocation,
    setCurrentStep,
    setCurrentPhase,
    setLiveIntensity,
    setMedAckText,
    setBodyScanText,
    setWaveNarration,
    setReflectionText,
    setSessionStartedAt,
    setJournalNote,
    setNextStepChoice,
    resetSession,
  } = useSessionStore();

  const [error, setError] = useState<string | null>(null);
  const [loadingMed, setLoadingMed] = useState(false);
  const [loadingBody, setLoadingBody] = useState(false);
  const [loadingWave, setLoadingWave] = useState(false);
  const [loadingReflection, setLoadingReflection] = useState(false);
  const [saving, setSaving] = useState(false);
  const [waveActive, setWaveActive] = useState(false);

  const intakePayload = useCallback(() => {
    if (!medProfile || trigger == null || medStatus == null) {
      throw new Error("Missing intake");
    }
    return buildIntakePayload(intensity, trigger, medStatus, medProfile.medType);
  }, [intensity, medProfile, medStatus, trigger]);

  const fetchMedAck = async (
    inten: number,
    tr: TriggerCategory,
    ms: MedStatus,
  ) => {
    if (!medProfile) return;
    setError(null);
    setLoadingMed(true);
    try {
      const intake = buildIntakePayload(inten, tr, ms, medProfile.medType);
      const text = await postSessionStep(
        "med_ack",
        intake,
        getAllSessions(),
        {},
      );
      setIntensity(inten);
      setTrigger(tr);
      setMedStatus(ms);
      setLiveIntensity(inten);
      setSessionStartedAt(new Date().toISOString());
      setMedAckText(text);
      setCurrentStep("med_ack");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load acknowledgment");
    } finally {
      setLoadingMed(false);
    }
  };

  const runBodyScan = async (region: BodyRegion) => {
    setError(null);
    setLoadingBody(true);
    try {
      const intake = intakePayload();
      const text = await postSessionStep("body_scan", intake, getAllSessions(), {
        bodyLocation: region,
      });
      setBodyScanText(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load body scan");
    } finally {
      setLoadingBody(false);
    }
  };

  const runWavePhase = async (phase: WavePhase) => {
    setCurrentPhase(phase);
    setError(null);
    setLoadingWave(true);
    try {
      const intake = intakePayload();
      const li = useSessionStore.getState().liveIntensity;
      const text = await postSessionStep("wave_phase", intake, getAllSessions(), {
        phase,
        currentIntensity: li,
      });
      setWaveNarration(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load wave narration");
    } finally {
      setLoadingWave(false);
    }
  };

  const runReflection = async () => {
    setError(null);
    setLoadingReflection(true);
    try {
      const intake = intakePayload();
      const end = useSessionStore.getState().liveIntensity;
      const text = await postSessionStep("reflection", intake, getAllSessions(), {
        intensityEnd: end,
      });
      setReflectionText(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load reflection");
    } finally {
      setLoadingReflection(false);
    }
  };

  useWaveSequence({
    active: waveActive && currentStep === "wave",
    onPhaseStart: (phase) => {
      void runWavePhase(phase);
    },
    onComplete: () => {
      setCurrentStep("reflection");
      void runReflection();
    },
  });

  const handleSaveSession = async () => {
    if (!medProfile || trigger == null || medStatus == null) return;
    setSaving(true);
    setError(null);
    try {
      const started = sessionStartedAt ?? new Date().toISOString();
      const log: SessionLog = {
        id: crypto.randomUUID(),
        startedAt: started,
        completedAt: new Date().toISOString(),
        intensityStart: intensity,
        intensityEnd: liveIntensity,
        trigger,
        medStatus,
        medType: medProfile.medType,
        bodyLocation,
        completed: true,
        journalNote: journalNote?.trim() || null,
        nextStepChoice: nextStepChoice,
      };
      saveSession(log);
      resetSession();
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const allSessions = getAllSessions();
  const recentSessions = allSessions.filter((s) => s.completed);
  const streakCount = getCurrentStreak(allSessions);
  const avgDrop =
    recentSessions.length > 0
      ? recentSessions.reduce((acc, s) => {
          if (s.intensityEnd == null) return acc;
          return acc + (s.intensityStart - s.intensityEnd);
        }, 0) / recentSessions.length
      : null;

  if (!medProfile) {
    return (
      <p className="text-center text-sm text-foreground/70">
        Complete onboarding first.{" "}
        <Link className="font-medium text-foreground underline" href="/">
          Go home
        </Link>
      </p>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Session</h1>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-foreground/60 underline-offset-4 hover:text-foreground hover:underline"
        >
          Exit
        </Link>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {currentStep === "intake" ? (
        <IntakeContainer
          medTypeLabel={medTypeLabel(medProfile.medType)}
          onSubmit={({ intensity: inten, trigger: tr, medStatus: ms }) => {
            void fetchMedAck(inten, tr, ms);
          }}
        />
      ) : null}

      {currentStep === "med_ack" ? (
        <MedAckScreen
          intensity={intensity}
          text={medAckText}
          loading={loadingMed}
          onContinue={() => setCurrentStep("body_scan")}
        />
      ) : null}

      {currentStep === "body_scan" ? (
        <div className="space-y-6">
          <BodyDiagramSvg
            selected={bodyLocation}
            onSelect={(region) => {
              setBodyLocation(region);
              void runBodyScan(region);
            }}
          />
          <div className="flex flex-wrap gap-2 text-xs text-foreground/60">
            {(
              [
                "chest",
                "stomach",
                "throat",
                "shoulders",
                "jaw",
                "hands",
                "legs",
              ] as const
            ).map((id) => (
              <span key={id} className="rounded-full bg-foreground/5 px-2 py-1">
                {id}
              </span>
            ))}
          </div>
          <Card>
            {loadingBody ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-4 w-full rounded bg-foreground/10" />
                <div className="h-4 w-full rounded bg-foreground/10" />
              </div>
            ) : (
              <div className="text-sm leading-relaxed text-foreground/90">
                {bodyScanText?.split("\n\n").map((p, i) => (
                  <p key={i} className="mb-2 last:mb-0">
                    {p}
                  </p>
                ))}
              </div>
            )}
          </Card>
          <Button
            disabled={!bodyLocation || loadingBody}
            className="w-full"
            onClick={() => {
              setCurrentPhase("rising");
              setWaveNarration(null);
              setCurrentStep("wave");
              setWaveActive(true);
            }}
          >
            Enter the wave
          </Button>
        </div>
      ) : null}

      {currentStep === "wave" ? (
        <div className="space-y-4">
          <WaveCanvas phase={currentPhase} intensity={liveIntensity} />
          <WaveIntensitySlider value={liveIntensity} onChange={setLiveIntensity} />
          <Card>
            {loadingWave ? (
              <div className="h-4 w-full animate-pulse rounded bg-foreground/10" />
            ) : (
              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                {waveNarration}
              </p>
            )}
          </Card>
          <button
            type="button"
            className="w-full text-center text-xs text-foreground/40 underline-offset-2 hover:text-foreground/70 hover:underline"
            onClick={() => {
              setWaveActive(false);
              setCurrentStep("reflection");
              void runReflection();
            }}
          >
            Skip wave (demo) — jump to reflection
          </button>
        </div>
      ) : null}

      {currentStep === "reflection" ? (
        <ReflectionScreen
          text={reflectionText}
          loading={loadingReflection}
          sessionsCompleted={recentSessions.length}
          avgDrop={avgDrop}
          streak={streakCount}
          journalNote={journalNote}
          onJournalChange={(v) => setJournalNote(v)}
          nextStep={nextStepChoice}
          onNextStep={(v: NextStepChoice) => setNextStepChoice(v)}
          onSave={() => void handleSaveSession()}
          saving={saving}
        />
      ) : null}

      {currentStep === "complete" ? null : null}
    </div>
  );
}
