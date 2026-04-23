/**
 * Per-LoRA voice-scenario checklist. Replaces the old matType ×
 * medicationStatus coverage grid.
 *
 * The doctor's job is to demonstrate each *voice* at least once;
 * Synthetix expands across the rest of the input grid. A scenario
 * counts as covered when it has ≥ 1 ready/approved example whose
 * `input` payload matches the scenario's predicate.
 */

import type { ClientVoiceScenario } from "@/lib/training/client-spec";
import type { VoiceCoverage } from "@/lib/training/storage";

interface Props {
  scenarios: readonly ClientVoiceScenario[];
  coverage: readonly VoiceCoverage[];
}

export function VoiceChecklist({ scenarios, coverage }: Props) {
  const byId = new Map(coverage.map((c) => [c.scenarioId, c]));
  const covered = scenarios.filter(
    (s) => (byId.get(s.id)?.count ?? 0) > 0,
  ).length;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Voice scenarios</h2>
        <p className="text-xs text-foreground/55">
          {covered}/{scenarios.length} covered
        </p>
      </div>
      <p className="mt-1 text-xs text-foreground/55">
        Aim for at least one <em>ready</em> example per scenario. Don&apos;t
        try to enumerate every input combination — Synthetix will expand
        across matType, trigger, and the rest of the input grid from your
        seeds.
      </p>
      <ul className="mt-4 divide-y divide-border">
        {scenarios.map((scenario) => {
          const c = byId.get(scenario.id);
          const count = c?.count ?? 0;
          const drafts = (c?.totalIncludingDrafts ?? 0) - count;
          const covered = count > 0;
          return (
            <li
              key={scenario.id}
              className="py-3 flex items-start gap-3"
            >
              <span
                className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  covered
                    ? "bg-accent text-accent-foreground"
                    : "bg-surface-muted text-foreground/40"
                }`}
                aria-hidden
              >
                {covered ? "✓" : ""}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {scenario.label}
                  <span className="ml-2 text-xs font-mono text-foreground/45">
                    {count} ready
                    {drafts > 0 ? ` · ${drafts} draft` : ""}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-foreground/60 leading-relaxed">
                  {scenario.description}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
