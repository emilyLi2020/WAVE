"use client";

/**
 * Intake — the interactive prototype's stepped carousel (one decision
 * per screen), wired to the real `IntakeAnswers` contract:
 *
 *   step 0 · intensity   → intakeIntensity (1-10 slider)
 *   step 1 · MAT          → matType
 *   step 2 · today's dose → medicationStatus (skipped when MAT = none)
 *   step 3 · trigger      → trigger (+ optional free text)
 *
 * The prototype's "how late?" sub-choice is collected for parity but is
 * not part of the model contract, so it stays local. A de-emphasized
 * demo-mode toggle rides in the topbar for reviewers.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  getOnboardingMatServerSnapshot,
  getOnboardingMatSnapshot,
  subscribeOnboardingProfile,
} from "@/lib/onboarding/profile";
import { setWaveIntensity } from "@/lib/session/wave-intensity";
import type {
  MatType,
  MedicationStatus,
  TriggerCategory,
} from "@/types/models";

const MAT_OPTIONS: { v: MatType; l: string }[] = [
  { v: "buprenorphine", l: "Buprenorphine / Suboxone" },
  { v: "naltrexone", l: "Naltrexone (oral)" },
  { v: "vivitrol", l: "Vivitrol (injection)" },
  { v: "methadone", l: "Methadone" },
  { v: "none", l: "Not on MAT" },
];

const DOSE_OPTIONS: { v: MedicationStatus; l: string }[] = [
  { v: "on_time", l: "Yes, on time" },
  { v: "late", l: "Yes, but late" },
  { v: "missed", l: "Missed dose" },
];

const DOSE_LATE_OPTIONS = ["1–2 hours late", "3–5 hours late", "6+ hours late"];

const TRIGGER_OPTIONS: { v: TriggerCategory; l: string }[] = [
  { v: "social", l: "Social situation" },
  { v: "stress", l: "Stress · emotions" },
  { v: "physical", l: "Physical sensation" },
  { v: "unknown_or_other", l: "Don't know · other" },
];

const INTENSITY_LABELS = [
  "barely there",
  "faint",
  "noticing it",
  "present",
  "hard to ignore",
  "pulling",
  "strong",
  "loud",
  "urgent",
  "all-consuming",
];

export interface IntakeAnswers {
  intakeIntensity: number;
  matType: MatType;
  medicationStatus: MedicationStatus;
  trigger: TriggerCategory;
  triggerOther: string | null;
  demoMode: boolean;
}

interface Props {
  onSubmit: (answers: IntakeAnswers) => void;
}

export function IntakeForm({ onSubmit }: Props) {
  const [step, setStep] = useState(0);
  const [intensity, setIntensity] = useState<number | null>(null);
  // Pre-filled from the on-device onboarding profile (hydration-safe:
  // server snapshot is null). The patient can still override it; an
  // explicit choice wins over the onboarding value.
  const onboardingMat = useSyncExternalStore(
    subscribeOnboardingProfile,
    getOnboardingMatSnapshot,
    getOnboardingMatServerSnapshot,
  );
  const [matChoice, setMatType] = useState<MatType | null>(null);
  const matType = matChoice ?? onboardingMat;
  const [dose, setDose] = useState<MedicationStatus | null>(null);
  const [doseLate, setDoseLate] = useState<string | null>(null);
  const [trigger, setTrigger] = useState<TriggerCategory | null>(null);
  const [triggerOther, setTriggerOther] = useState("");
  const [demoMode, setDemoMode] = useState(false);

  // Drive the shared root WaveCanvas swell from the entered craving,
  // live, like the mobile session demo. Reset on unmount so the rest of
  // the session (and any other route) returns to the calm default.
  useEffect(() => {
    setWaveIntensity(intensity);
  }, [intensity]);
  useEffect(() => () => setWaveIntensity(null), []);

  const skipsDose = matType === "none";
  const total = matType && !skipsDose ? 4 : 3;
  const visibleStep = skipsDose && step > 1 ? step - 1 : step;

  const stepReady =
    (step === 0 && intensity != null) ||
    (step === 1 && matType != null) ||
    (step === 2 && dose != null) ||
    (step === 3 && trigger != null);

  function next() {
    if (!stepReady) return;
    if (step === 0) return setStep(1);
    if (step === 1) return setStep(skipsDose ? 3 : 2);
    if (step === 2) return setStep(3);
    // step 3 → submit
    onSubmit({
      intakeIntensity: intensity ?? 5,
      matType: matType ?? "none",
      medicationStatus: skipsDose ? "none" : (dose ?? "none"),
      trigger: trigger ?? "unknown_or_other",
      triggerOther:
        trigger === "unknown_or_other" && triggerOther.trim().length > 0
          ? triggerOther.trim().slice(0, 80)
          : null,
      demoMode,
    });
  }

  function back() {
    if (step === 0) return;
    if (step === 3 && skipsDose) return setStep(1);
    setStep(step - 1);
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button
          type="button"
          className="back-link"
          onClick={back}
          disabled={step === 0}
          style={step === 0 ? { opacity: 0.3 } : undefined}
        >
          <ArrowLeft />
          <span>Back</span>
        </button>
        <span className="crumb">
          Intake · {Math.min(visibleStep + 1, total)} / {total}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={demoMode}
          onClick={() => setDemoMode((v) => !v)}
          className="crumb"
          style={{
            background: "none",
            border: 0,
            cursor: "pointer",
            color: demoMode ? "var(--accent)" : "var(--ink-faint)",
          }}
          title="Shorten every meditation pause so the full session previews in ~2 minutes"
        >
          Demo {demoMode ? "ON" : "OFF"}
        </button>
      </div>

      <div className="screen-body">
        {step === 0 ? (
          <IntakeIntensity value={intensity} onChange={setIntensity} />
        ) : null}

        {step === 1 ? (
          <>
            <span className="eyebrow">Question 2 · MAT</span>
            <h1 className="display">What medication are you on?</h1>
            <p className="lede">
              This is the thing every other urge-surfing app misses.
            </p>
            <div style={{ height: 4 }} />
            <div
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              {MAT_OPTIONS.map((o) => (
                <button
                  key={o.v}
                  type="button"
                  className="chip list"
                  aria-pressed={matType === o.v}
                  onClick={() => setMatType(o.v)}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <span className="eyebrow">Question 3 · today&apos;s dose</span>
            <h1 className="display">Did you take today&apos;s dose?</h1>
            <p className="lede">
              A 7/10 at hour 4 isn&apos;t the same as a 7/10 at hour 22.
            </p>
            <div style={{ height: 4 }} />
            <div
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              {DOSE_OPTIONS.map((o) => (
                <button
                  key={o.v}
                  type="button"
                  className="chip list"
                  aria-pressed={dose === o.v}
                  onClick={() => {
                    setDose(o.v);
                    if (o.v !== "late") setDoseLate(null);
                  }}
                >
                  {o.l}
                </button>
              ))}
            </div>
            {dose === "late" ? (
              <div style={{ marginTop: 6 }}>
                <span
                  className="eyebrow"
                  style={{ display: "block", marginBottom: 8 }}
                >
                  About how late?
                </span>
                <div className="chip-grid cols-3" style={{ gap: 6 }}>
                  {DOSE_LATE_OPTIONS.map((o) => (
                    <button
                      key={o}
                      type="button"
                      className="chip"
                      style={{ padding: "12px 4px", fontSize: 13 }}
                      aria-pressed={doseLate === o}
                      onClick={() => setDoseLate(o)}
                    >
                      {o}
                    </button>
                  ))}
                </div>
                <p className="hint" style={{ marginTop: 8 }}>
                  Best guess — WAVE uses this to set the acknowledgment, not
                  to grade you.
                </p>
              </div>
            ) : null}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <span className="eyebrow">Last question · trigger</span>
            <h1 className="display">What set this off?</h1>
            <p className="lede">Best guess. You can change your mind later.</p>
            <div style={{ height: 4 }} />
            <div
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              {TRIGGER_OPTIONS.map((o) => (
                <button
                  key={o.v}
                  type="button"
                  className="chip list"
                  aria-pressed={trigger === o.v}
                  onClick={() => {
                    setTrigger(o.v);
                    if (o.v !== "unknown_or_other") setTriggerOther("");
                  }}
                >
                  {o.l}
                </button>
              ))}
            </div>
            {trigger === "unknown_or_other" ? (
              <input
                type="text"
                maxLength={80}
                value={triggerOther}
                onChange={(e) => setTriggerOther(e.target.value)}
                placeholder="Say more (optional)"
                className="plan-area"
                style={{ marginTop: 8, minHeight: 0, padding: "12px 14px" }}
              />
            ) : null}
          </>
        ) : null}

        <div className="spacer-grow" />
        <button
          type="button"
          className="btn primary"
          style={{ alignSelf: "stretch" }}
          onClick={next}
          disabled={!stepReady}
        >
          {step === 3 ? "Continue to session" : "Continue"}
          <ArrowRight />
        </button>
      </div>
    </div>
  );
}

function IntakeIntensity({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  const touched = value != null;
  const current = value ?? 5;
  const zoneRef = useRef<HTMLDivElement>(null);
  const min = 1;
  const max = 10;

  // Vertical drag: top of the zone = strongest (10), bottom = 1 — the
  // same mapping as the mobile session demo's drag-the-wave intake
  // (applyDragY: ratio = 1 - localY/zoneH; v = round(1 + ratio*9)). The
  // shared ocean rises live with the value via the wave-intensity store.
  function valueAt(clientY: number): number {
    const r = zoneRef.current?.getBoundingClientRect();
    if (!r || r.height === 0) return current;
    const ratio = 1 - (clientY - r.top) / r.height;
    return Math.round(
      min + Math.max(0, Math.min(1, ratio)) * (max - min),
    );
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onChange(valueAt(e.clientY));
    const onMove = (ev: PointerEvent) => onChange(valueAt(ev.clientY));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      onChange(Math.min(max, current + 1));
    }
    if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      onChange(Math.max(min, current - 1));
    }
    if (e.key === "Home") {
      e.preventDefault();
      onChange(min);
    }
    if (e.key === "End") {
      e.preventDefault();
      onChange(max);
    }
  }

  return (
    <>
      <span className="eyebrow">Question 1 · intensity</span>
      <h1 className="display serif">How strong is it, right now?</h1>
      <p className="lede" style={{ margin: 0 }}>
        {touched
          ? `${INTENSITY_LABELS[current - 1]}.`
          : "Drag the wave up or down. There's no wrong answer."}
      </p>
      <div
        ref={zoneRef}
        className="drag-zone"
        role="slider"
        tabIndex={0}
        aria-label="Craving intensity"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={current}
        aria-valuetext={
          touched ? `${current} of 10 — ${INTENSITY_LABELS[current - 1]}` : undefined
        }
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      >
        <div
          className={`drag-readout ${touched ? "touched" : ""}`}
          aria-hidden
        >
          <span className="num">{current}</span>
          <span className="denom">/10</span>
          <span className="label">
            {touched ? INTENSITY_LABELS[current - 1] : "drag the wave"}
          </span>
        </div>
      </div>
    </>
  );
}

function ArrowRight() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function ArrowLeft() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}
