"use client";

import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import type { NextStepChoice } from "@/lib/types";

const NEXT_STEPS: { value: NextStepChoice; label: string }[] = [
  { value: "call_someone", label: "Call someone" },
  { value: "walk", label: "Short walk" },
  { value: "eat", label: "Eat something" },
  { value: "hands", label: "Hands / grounding" },
  { value: "rest", label: "Rest" },
];

type Props = {
  text: string | null;
  loading: boolean;
  sessionsCompleted: number;
  avgDrop: number | null;
  streak: number;
  journalNote: string | null;
  onJournalChange: (value: string) => void;
  nextStep: string | null;
  onNextStep: (value: NextStepChoice) => void;
  onSave: () => void;
  saving: boolean;
};

export function ReflectionScreen({
  text,
  loading,
  sessionsCompleted,
  avgDrop,
  streak,
  journalNote,
  onJournalChange,
  nextStep,
  onNextStep,
  onSave,
  saving,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="py-3 text-center">
          <p className="text-xs text-foreground/50">Sessions</p>
          <p className="text-2xl font-semibold tabular-nums">{sessionsCompleted}</p>
        </Card>
        <Card className="py-3 text-center">
          <p className="text-xs text-foreground/50">Avg drop (recent)</p>
          <p className="text-2xl font-semibold tabular-nums">
            {avgDrop != null ? avgDrop.toFixed(1) : "—"}
          </p>
        </Card>
        <Card className="py-3 text-center">
          <p className="text-xs text-foreground/50">Streak</p>
          <p className="text-2xl font-semibold tabular-nums">{streak}</p>
        </Card>
      </div>

      <Card>
        <h2 className="text-lg font-semibold">Reflection</h2>
        {loading ? (
          <div className="mt-4 space-y-2" aria-busy="true">
            <div className="h-4 w-full animate-pulse rounded bg-foreground/10" />
            <div className="h-4 w-[92%] animate-pulse rounded bg-foreground/10" />
          </div>
        ) : (
          <div className="mt-4 text-sm leading-relaxed text-foreground/90">
            {text?.split("\n\n").map((para, i) => (
              <p key={i} className="mb-3 last:mb-0">
                {para}
              </p>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <label className="text-sm font-medium" htmlFor="journal">
          Optional journal note
        </label>
        <textarea
          id="journal"
          rows={3}
          value={journalNote ?? ""}
          onChange={(e) => onJournalChange(e.target.value)}
          onBlur={() => {}}
          className="mt-2 w-full rounded-xl border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/40"
          placeholder="A few words about this wave…"
        />
      </Card>

      <Card>
        <p className="text-sm font-medium">Next gentle step</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {NEXT_STEPS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => onNextStep(s.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                nextStep === s.value
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/15 hover:border-foreground/30"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </Card>

      <Button className="w-full" disabled={saving} onClick={onSave}>
        {saving ? "Saving…" : "Save session & go to dashboard"}
      </Button>
    </div>
  );
}
