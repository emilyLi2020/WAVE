"use client";

import Link from "next/link";
import { useEffect, useMemo, useReducer, useState } from "react";

import { BodyScanDiagram } from "./body-scan-diagram";
import { IntakeForm, type IntakeAnswers } from "./intake-form";
import { IntensitySlider } from "./intensity-slider";
import { NarratedPhase } from "./narrated-phase";
import { NarrationCard } from "./narration-card";
import { NextStepChips } from "./next-step-chips";
import { ReflectionProgress } from "./reflection-progress";
import { SafetyHandoff } from "./safety-handoff";
import { SafetyScreen, type SafetyOutcome } from "./safety-screen";
import { StreamedNarration } from "./streamed-narration";

import type { BodyScanLocation, SessionOutcome } from "@/types/models";
import type {
  BodyScanContext,
  IntakeContext,
  PhasePayloadMap,
  ReflectionContext,
  WaveContext,
} from "@/lib/prompts/schemas";
import {
  generateReflection,
  type ReflectionTitle,
} from "@/lib/gemma/session";
import { encouragementForPhase } from "@/lib/prompts/encouragement-bank";

type Phase =
  | "intake"
  | "safety"
  | "safetyHandoff"
  | "ack"
  | "bodyScan"
  | "waveRise"
  | "wavePeak"
  | "waveFall"
  | "reflection"
  | "done";

interface State {
  phase: Phase;
  startedAt: string;
  intake: IntakeAnswers | null;
  usedSubstanceToday: boolean;
  bodyLocation: BodyScanLocation | null;
  currentIntensity: number;
  endingIntensity: number | null;
  outcome: SessionOutcome | null;
  pickedNextStep: string | null;
  intensitySamples: { timestamp: string; intensity: number }[];
}

type Action =
  | { type: "intakeSubmitted"; answers: IntakeAnswers }
  | { type: "safetyResolved"; outcome: SafetyOutcome }
  | { type: "advance"; from: Phase }
  | { type: "bodyLocationPicked"; location: BodyScanLocation }
  | { type: "intensityChanged"; value: number }
  | { type: "intensitySampled"; value: number }
  | { type: "nextStepPicked"; choice: string };

function initialState(): State {
  return {
    phase: "intake",
    startedAt: new Date().toISOString(),
    intake: null,
    usedSubstanceToday: false,
    bodyLocation: null,
    currentIntensity: 5,
    endingIntensity: null,
    outcome: null,
    pickedNextStep: null,
    intensitySamples: [],
  };
}

const NEXT_PHASE: Partial<Record<Phase, Phase>> = {
  ack: "bodyScan",
  bodyScan: "waveRise",
  waveRise: "wavePeak",
  wavePeak: "waveFall",
  waveFall: "reflection",
  reflection: "done",
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "intakeSubmitted":
      return {
        ...state,
        intake: action.answers,
        currentIntensity: action.answers.intakeIntensity,
        phase: "safety",
      };
    case "safetyResolved":
      if (action.outcome.kind === "handoff") {
        return {
          ...state,
          phase: "safetyHandoff",
          outcome: "safety_exited",
        };
      }
      return {
        ...state,
        usedSubstanceToday: action.outcome.usedSubstanceToday,
        phase: "ack",
      };
    case "advance": {
      const next = NEXT_PHASE[action.from];
      if (!next) return state;
      if (next === "reflection") {
        return {
          ...state,
          phase: next,
          endingIntensity: state.currentIntensity,
        };
      }
      if (next === "done") {
        return { ...state, phase: next, outcome: "completed" };
      }
      return { ...state, phase: next };
    }
    case "bodyLocationPicked":
      return { ...state, bodyLocation: action.location };
    case "intensityChanged":
      return { ...state, currentIntensity: action.value };
    case "intensitySampled":
      return {
        ...state,
        intensitySamples: [
          ...state.intensitySamples,
          { timestamp: new Date().toISOString(), intensity: action.value },
        ],
      };
    case "nextStepPicked":
      return { ...state, pickedNextStep: action.choice };
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function SessionMachine() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  const intakeContext: IntakeContext | null = useMemo(() => {
    if (!state.intake) return null;
    return {
      intakeIntensity: state.intake.intakeIntensity,
      matType: state.intake.matType,
      medicationStatus: state.intake.medicationStatus,
      trigger: state.intake.trigger,
      usedSubstanceToday: state.usedSubstanceToday,
    };
  }, [state.intake, state.usedSubstanceToday]);

  const bodyContext: BodyScanContext | null = useMemo(() => {
    if (!intakeContext || !state.bodyLocation) return null;
    return { ...intakeContext, bodyLocation: state.bodyLocation };
  }, [intakeContext, state.bodyLocation]);

  const waveContext: WaveContext | null = useMemo(() => {
    if (!bodyContext) return null;
    return { ...bodyContext, currentIntensity: state.currentIntensity };
  }, [bodyContext, state.currentIntensity]);

  const reflectionContext: ReflectionContext | null = useMemo(() => {
    if (!waveContext || state.endingIntensity === null) return null;
    const durationSeconds = Math.max(
      0,
      Math.round(
        (Date.now() - new Date(state.startedAt).getTime()) / 1000,
      ),
    );
    return {
      ...waveContext,
      endingIntensity: state.endingIntensity,
      durationSeconds,
    };
  }, [waveContext, state.endingIntensity, state.startedAt]);

  return (
    <div className="space-y-8">
      {state.phase === "intake" ? (
        <IntakeForm
          onSubmit={(answers) =>
            dispatch({ type: "intakeSubmitted", answers })
          }
        />
      ) : null}

      {state.phase === "safety" ? (
        <SafetyScreen
          onResolved={(outcome) =>
            dispatch({ type: "safetyResolved", outcome })
          }
        />
      ) : null}

      {state.phase === "safetyHandoff" ? <SafetyHandoff /> : null}

      {state.phase === "ack" && intakeContext ? (
        <NarratedPhase
          phase="med-ack"
          input={intakeContext}
          loadingFallback={
            <NarrationCard
              title="Acknowledgment"
              badge="Phase 1 of 5"
              loading
            />
          }
        >
          {(payload, source) => (
            <NarrationCard
              title="Acknowledgment"
              badge="Phase 1 of 5"
              loading={false}
              source={source}
              footer={
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wide text-foreground/50">
                    Source: {payload.citationKey}
                  </span>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "advance", from: "ack" })}
                    className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
                  >
                    Body scan →
                  </button>
                </div>
              }
            >
              <p>{payload.acknowledgment}</p>
            </NarrationCard>
          )}
        </NarratedPhase>
      ) : null}

      {state.phase === "bodyScan" && intakeContext ? (
        <BodyScanPhase
          intakeContext={intakeContext}
          selected={state.bodyLocation}
          onSelect={(location) =>
            dispatch({ type: "bodyLocationPicked", location })
          }
          onAdvance={() => dispatch({ type: "advance", from: "bodyScan" })}
        />
      ) : null}

      {(state.phase === "waveRise" ||
        state.phase === "wavePeak" ||
        state.phase === "waveFall") &&
      waveContext ? (
        <WavePhaseBlock
          key={state.phase}
          phase={state.phase}
          waveContext={waveContext}
          currentIntensity={state.currentIntensity}
          onIntensityChange={(value) =>
            dispatch({ type: "intensityChanged", value })
          }
          onIntensitySample={(value) =>
            dispatch({ type: "intensitySampled", value })
          }
          onAdvance={(from) => dispatch({ type: "advance", from })}
        />
      ) : null}

      {state.phase === "reflection" && reflectionContext ? (
        <ReflectionPhaseBlock
          reflectionContext={reflectionContext}
          onPickNextStep={(choice) => {
            dispatch({ type: "nextStepPicked", choice });
            dispatch({ type: "advance", from: "reflection" });
          }}
        />
      ) : null}

      {state.phase === "done" ? (
        <article className="rounded-2xl border border-border bg-surface p-8 text-center">
          <h2 className="text-xl font-semibold">
            You stayed for the whole wave.
          </h2>
          <p className="mt-2 text-foreground/70">
            {state.pickedNextStep
              ? `Heading to: ${state.pickedNextStep}.`
              : "That's a complete session."}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-full bg-accent px-5 py-2.5 text-accent-foreground font-medium hover:opacity-90"
            >
              See dashboard →
            </Link>
            <Link
              href="/"
              className="rounded-full border border-border px-5 py-2.5 hover:border-accent hover:text-accent"
            >
              Home
            </Link>
          </div>
        </article>
      ) : null}

      <SessionFooter phase={state.phase} />
    </div>
  );
}

function BodyScanPhase({
  intakeContext,
  selected,
  onSelect,
  onAdvance,
}: {
  intakeContext: IntakeContext;
  selected: BodyScanLocation | null;
  onSelect: (location: BodyScanLocation) => void;
  onAdvance: () => void;
}) {
  const phaseInput: BodyScanContext | null = selected
    ? { ...intakeContext, bodyLocation: selected }
    : null;

  return (
    <div className="space-y-4">
      <NarrationCard
        title="Body scan"
        badge="Phase 2 of 5"
        loading={false}
      >
        <p className="text-foreground/80">
          Pick the spot in your body where the craving is sitting. WAVE will
          narrate the scan from there.
        </p>
        <div className="mt-4">
          <BodyScanDiagram selected={selected} onSelect={onSelect} />
        </div>
      </NarrationCard>

      {phaseInput ? (
        <StreamedNarration
          key={phaseInput.bodyLocation}
          phase="body-scan"
          input={phaseInput}
          loadingFallback={
            <NarrationCard
              title="Body scan narration"
              badge="Phase 2 of 5"
              loading
            />
          }
        >
          {(text, source, isStreaming) => (
            <NarrationCard
              title="Body scan narration"
              badge="Phase 2 of 5"
              loading={false}
              source={source}
              footer={
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={onAdvance}
                    className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
                  >
                    Start the wave →
                  </button>
                </div>
              }
            >
              <p>
                {text}
                {isStreaming ? <StreamingCaret /> : null}
              </p>
            </NarrationCard>
          )}
        </StreamedNarration>
      ) : null}
    </div>
  );
}

const WAVE_PHASE_META: Record<
  "waveRise" | "wavePeak" | "waveFall",
  {
    phase: "wave-rise" | "wave-peak" | "wave-fall";
    title: string;
    badge: string;
    cta: string;
    barClass: string;
  }
> = {
  waveRise: {
    phase: "wave-rise",
    title: "The wave is rising",
    badge: "Phase 3 of 5 · rise",
    cta: "At the peak →",
    barClass: "bg-wave-rise",
  },
  wavePeak: {
    phase: "wave-peak",
    title: "You're at the peak",
    badge: "Phase 3 of 5 · peak",
    cta: "Coming down →",
    barClass: "bg-wave-peak",
  },
  waveFall: {
    phase: "wave-fall",
    title: "The wave is falling",
    badge: "Phase 4 of 5 · fall",
    cta: "Reflect →",
    barClass: "bg-wave-fall",
  },
};

function WavePhaseBlock({
  phase,
  waveContext,
  currentIntensity,
  onIntensityChange,
  onIntensitySample,
  onAdvance,
}: {
  phase: "waveRise" | "wavePeak" | "waveFall";
  waveContext: WaveContext;
  currentIntensity: number;
  onIntensityChange: (value: number) => void;
  onIntensitySample: (value: number) => void;
  onAdvance: (from: Phase) => void;
}) {
  const meta = WAVE_PHASE_META[phase];
  // Snapshot the wave context at phase entry so the live slider does not
  // re-trigger generateText on every drag. The parent passes
  // `key={state.phase}` so this initializer reruns when the patient
  // advances rise → peak → fall.
  const [phaseInput] = useState<WaveContext>(waveContext);
  // Sample the encouragement once per phase so it stays stable while
  // the narration streams in and while the patient drags the slider.
  const [encouragement] = useState<string>(() =>
    encouragementForPhase(meta.phase),
  );
  return (
    <div className="space-y-4">
      <div
        aria-hidden
        className="h-32 rounded-2xl border border-border bg-surface relative overflow-hidden"
      >
        <div
          className={`absolute inset-x-0 bottom-0 ${meta.barClass} opacity-60 transition-all duration-700`}
          style={{ height: `${currentIntensity * 10}%` }}
        />
        <div className="absolute inset-0 flex items-end justify-center p-3 text-xs uppercase tracking-wide text-foreground/60">
          {meta.badge}
        </div>
      </div>

      <StreamedNarration
        phase={meta.phase}
        input={phaseInput}
        loadingFallback={
          <NarrationCard
            title={meta.title}
            badge={meta.badge}
            loading
            footer={
              <WaveFooter
                encouragement={encouragement}
                currentIntensity={currentIntensity}
                onIntensityChange={onIntensityChange}
                onIntensitySample={onIntensitySample}
                onAdvanceClick={() => onAdvance(phase)}
                cta={meta.cta}
              />
            }
          />
        }
      >
        {(text, source, isStreaming) => (
          <NarrationCard
            title={meta.title}
            badge={meta.badge}
            loading={false}
            source={source}
            footer={
              <WaveFooter
                encouragement={encouragement}
                currentIntensity={currentIntensity}
                onIntensityChange={onIntensityChange}
                onIntensitySample={onIntensitySample}
                onAdvanceClick={() => onAdvance(phase)}
                cta={meta.cta}
              />
            }
          >
            <p>
              {text}
              {isStreaming ? <StreamingCaret /> : null}
            </p>
          </NarrationCard>
        )}
      </StreamedNarration>
    </div>
  );
}

function WaveFooter({
  encouragement,
  currentIntensity,
  onIntensityChange,
  onIntensitySample,
  onAdvanceClick,
  cta,
}: {
  encouragement: string;
  currentIntensity: number;
  onIntensityChange: (value: number) => void;
  onIntensitySample: (value: number) => void;
  onAdvanceClick: () => void;
  cta: string;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm italic text-foreground/70">{encouragement}</p>
      <IntensitySlider
        value={currentIntensity}
        onChange={onIntensityChange}
        onSample={onIntensitySample}
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onAdvanceClick}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          {cta}
        </button>
      </div>
    </div>
  );
}

function StreamingCaret() {
  return (
    <span
      aria-hidden
      className="ml-1 inline-block h-4 w-[2px] -mb-0.5 bg-accent align-middle animate-pulse"
    />
  );
}

type ReflectionState =
  | { kind: "loading"; titles: ReflectionTitle[] }
  | {
      kind: "ready";
      payload: PhasePayloadMap["reflection"];
      source: "model" | "fallback";
    };

/**
 * Drives the reflection phase: streams reasoning-summary titles into
 * <ReflectionProgress /> while the model is still composing the
 * structured insight, then swaps to the regular NarrationCard +
 * NextStepChips when the payload arrives. Snapshots the
 * ReflectionContext at mount so any downstream state changes during
 * the long medium-effort call don't cancel the in-flight stream.
 */
function ReflectionPhaseBlock({
  reflectionContext,
  onPickNextStep,
}: {
  reflectionContext: ReflectionContext;
  onPickNextStep: (choice: string) => void;
}) {
  const [phaseInput] = useState<ReflectionContext>(reflectionContext);
  const [state, setState] = useState<ReflectionState>({
    kind: "loading",
    titles: [],
  });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    void generateReflection(phaseInput, {
      signal: controller.signal,
      onTitle: (title) => {
        if (cancelled) return;
        setState((prev) => {
          if (prev.kind !== "loading") return prev;
          // Dedupe by index — the route guarantees one emit per
          // summary part but the client also enforces it so a route
          // bug never produces duplicate rows.
          if (prev.titles.some((t) => t.index === title.index)) return prev;
          // Sort by index so out-of-order arrivals still render in
          // the model's intended sequence.
          const next = [...prev.titles, title].sort(
            (a, b) => a.index - b.index,
          );
          return { kind: "loading", titles: next };
        });
      },
    })
      .then((result) => {
        if (cancelled) return;
        setState({
          kind: "ready",
          payload: result.payload,
          source: result.source,
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (typeof console !== "undefined") {
          console.error("[wave] reflection phase error", err);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [phaseInput]);

  if (state.kind === "loading") {
    return <ReflectionProgress titles={state.titles} />;
  }

  return (
    <NarrationCard
      title="Reflection"
      badge="Phase 5 of 5"
      loading={false}
      source={state.source}
      footer={
        <div className="space-y-3">
          <p className="text-sm text-foreground/70">
            Pick one 10-minute action.
          </p>
          <NextStepChips
            options={state.payload.nextSteps}
            onPick={onPickNextStep}
          />
        </div>
      }
    >
      <p>{state.payload.insight}</p>
    </NarrationCard>
  );
}

function SessionFooter({ phase }: { phase: Phase }) {
  if (phase === "done" || phase === "safetyHandoff") return null;
  return (
    <div className="flex items-center justify-start pt-4">
      <Link
        href="/"
        className="text-sm text-foreground/60 hover:text-accent"
      >
        ← Leave session
      </Link>
    </div>
  );
}
