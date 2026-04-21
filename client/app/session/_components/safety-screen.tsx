"use client";

import { useState } from "react";

export type SafetyOutcome =
  | { kind: "proceed"; usedSubstanceToday: boolean }
  | { kind: "handoff" };

interface Props {
  onResolved: (outcome: SafetyOutcome) => void;
}

/**
 * Rule-based intake safety screen. Per PRD.md > Domain Constraints >
 * Crisis handoff (point 1), this runs BEFORE any LLM call.
 *
 *  - Q1 No                     → proceed, usedSubstanceToday=false
 *  - Q1 Yes, Q2 No             → proceed, usedSubstanceToday=true
 *  - Q1 Yes, Q2 Yes            → SAMHSA handoff (no model call)
 */
export function SafetyScreen({ onResolved }: Props) {
  const [q1, setQ1] = useState<"yes" | "no" | null>(null);

  function answerQ1(answer: "yes" | "no") {
    setQ1(answer);
    if (answer === "no") {
      onResolved({ kind: "proceed", usedSubstanceToday: false });
    }
  }

  function answerQ2(answer: "yes" | "no") {
    if (answer === "yes") {
      onResolved({ kind: "handoff" });
    } else {
      onResolved({ kind: "proceed", usedSubstanceToday: true });
    }
  }

  return (
    <div className="space-y-6">
      <article className="rounded-2xl border border-border bg-surface p-6">
        <header className="flex items-center justify-between">
          <h2 className="font-semibold">Two quick safety questions</h2>
          <span className="text-xs uppercase tracking-wide text-foreground/50">
            Safety
          </span>
        </header>
        <p className="mt-2 text-sm text-foreground/70">
          These run on the device. Nothing is sent anywhere.
        </p>

        <div className="mt-6">
          <p className="font-medium">Have you used any substances today?</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => answerQ1("no")}
              aria-pressed={q1 === "no"}
              className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                q1 === "no"
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border bg-surface-muted hover:border-accent hover:text-accent"
              }`}
            >
              No
            </button>
            <button
              type="button"
              onClick={() => answerQ1("yes")}
              aria-pressed={q1 === "yes"}
              className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                q1 === "yes"
                  ? "border-warn bg-warn-soft text-warn"
                  : "border-border bg-surface-muted hover:border-accent hover:text-accent"
              }`}
            >
              Yes
            </button>
          </div>
        </div>

        {q1 === "yes" ? (
          <div className="mt-6 rounded-xl border border-warn/40 bg-warn-soft/40 p-4">
            <p className="font-medium">
              Are you feeling physically unwell, dizzy, or having trouble
              breathing right now?
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => answerQ2("no")}
                className="rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium hover:border-accent hover:text-accent transition"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => answerQ2("yes")}
                className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm font-medium text-danger hover:opacity-90 transition"
              >
                Yes
              </button>
            </div>
          </div>
        ) : null}
      </article>
    </div>
  );
}
