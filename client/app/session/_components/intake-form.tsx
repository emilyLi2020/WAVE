"use client";

import { useState } from "react";

import type {
  MatType,
  MedicationStatus,
  TriggerCategory,
} from "@/types/models";

const intensityOptions: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const matOptions: { value: MatType; label: string }[] = [
  { value: "buprenorphine", label: "Buprenorphine / Suboxone" },
  { value: "naltrexone", label: "Naltrexone (oral)" },
  { value: "vivitrol", label: "Vivitrol (injection)" },
  { value: "methadone", label: "Methadone" },
  { value: "none", label: "Not on MAT" },
];

const medicationOptions: { value: MedicationStatus; label: string }[] = [
  { value: "on_time", label: "Yes, on time" },
  { value: "late", label: "Yes, but late" },
  { value: "missed", label: "No — missed dose" },
];

const triggerOptions: { value: TriggerCategory; label: string }[] = [
  { value: "social", label: "Social situation" },
  { value: "stress", label: "Stress / emotions" },
  { value: "physical", label: "Physical sensation" },
  { value: "unknown", label: "I don't know" },
  { value: "other", label: "Other" },
];

export interface IntakeAnswers {
  intakeIntensity: number;
  matType: MatType;
  medicationStatus: MedicationStatus;
  trigger: TriggerCategory;
}

interface Props {
  onSubmit: (answers: IntakeAnswers) => void;
}

export function IntakeForm({ onSubmit }: Props) {
  const [intensity, setIntensity] = useState<number | null>(null);
  const [matType, setMatType] = useState<MatType | null>(null);
  const [medicationStatus, setMedicationStatus] =
    useState<MedicationStatus | null>(null);
  const [trigger, setTrigger] = useState<TriggerCategory | null>(null);

  const needsMedicationStatus = matType !== null && matType !== "none";
  const ready =
    intensity !== null &&
    matType !== null &&
    trigger !== null &&
    (!needsMedicationStatus || medicationStatus !== null);

  function handleSubmit() {
    if (!ready || intensity === null || matType === null || trigger === null) {
      return;
    }
    onSubmit({
      intakeIntensity: intensity,
      matType,
      medicationStatus: needsMedicationStatus
        ? (medicationStatus as MedicationStatus)
        : "none",
      trigger,
    });
  }

  return (
    <div className="space-y-8">
      <article className="rounded-2xl border border-border bg-surface p-6">
        <header className="flex items-center justify-between">
          <h2 className="font-semibold">
            1. How intense is this craving right now?
          </h2>
          <span className="text-xs uppercase tracking-wide text-foreground/50">
            Intake
          </span>
        </header>
        <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10">
          {intensityOptions.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setIntensity(value)}
              aria-pressed={intensity === value}
              className={`rounded-xl border py-3 text-sm font-semibold transition ${
                intensity === value
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-surface-muted hover:border-accent hover:text-accent"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </article>

      <article className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-semibold">2. What MAT are you on?</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {matOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMatType(option.value)}
              aria-pressed={matType === option.value}
              className={`text-left rounded-xl border px-4 py-3 text-sm transition ${
                matType === option.value
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border bg-surface-muted hover:border-accent hover:text-accent"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </article>

      {needsMedicationStatus ? (
        <article className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-semibold">3. Did you take today&apos;s dose?</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {medicationOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMedicationStatus(option.value)}
                aria-pressed={medicationStatus === option.value}
                className={`text-left rounded-xl border px-4 py-3 text-sm transition ${
                  medicationStatus === option.value
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border bg-surface-muted hover:border-accent hover:text-accent"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </article>
      ) : null}

      <article className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-semibold">
          {needsMedicationStatus ? 4 : 3}. What triggered this?
        </h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {triggerOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTrigger(option.value)}
              aria-pressed={trigger === option.value}
              className={`text-left rounded-xl border px-4 py-3 text-sm transition ${
                trigger === option.value
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border bg-surface-muted hover:border-accent hover:text-accent"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </article>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!ready}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-accent-foreground font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
