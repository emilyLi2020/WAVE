import Link from "next/link";

import { ClinicianLlmInstructionsPanel } from "@/app/training/_components/clinician-llm-instructions-panel";
import { assertTrainingEnabled } from "@/lib/training/guard";
import { getSpec } from "@/lib/training/lora-specs";
import { resolveTrainingLoraRouteParam } from "@/lib/training/resolve-lora-route";
import {
  computeStackCoverage,
  getClinicianLlmInstructions,
  listSeedsForLora,
} from "@/lib/training/storage";
import type { SeedStatus } from "@/lib/training/types";

import { CoverageGrid } from "./coverage-grid";
import { SeedActions } from "./seed-actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ loraId: string }>;
}

const statusBadgeStyles: Record<SeedStatus, string> = {
  draft: "bg-surface-muted text-foreground/60",
  ready: "bg-accent-soft text-accent",
  approved: "bg-accent text-accent-foreground",
};

function shorten(value: unknown, max = 110): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export default async function LoraIndexPage({ params }: PageProps) {
  assertTrainingEnabled();
  const { loraId: raw } = await params;
  const loraId = resolveTrainingLoraRouteParam(raw);
  const spec = getSpec(loraId);
  const [seeds, instructionsState] = await Promise.all([
    listSeedsForLora(loraId),
    getClinicianLlmInstructions(loraId),
  ]);
  const coverage = computeStackCoverage(
    seeds,
    spec.stackAxes.rowKey,
    spec.stackAxes.colKey,
    spec.stackAxes.rowOptions,
    spec.stackAxes.colOptions,
  );

  const ready = seeds.filter((s) => s.status !== "draft").length;
  const draft = seeds.length - ready;

  // Pick a representative output field to preview in the seed list.
  const previewField = spec.outputFields.find((f) => f.kind === "text") ??
    spec.outputFields[0];

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-wide text-foreground/50">
          Specialized sample set · {spec.loraId}
        </p>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {spec.title}
            </h1>
            <p className="mt-1 text-sm text-foreground/60 max-w-2xl">
              {spec.whereUsed}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/training/export?format=clinician-jsonl&loraId=${spec.loraId}&includeDrafts=1`}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground/85 hover:border-accent hover:text-accent transition"
              title="Plain JSON per line: input, output, notes — for LLM review or handoff"
            >
              Export for LLM
            </a>
            <Link
              href={`/training/${spec.loraId}/new`}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 transition"
            >
              + Add new example
            </Link>
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-semibold">Why this set is separate</h2>
          <p className="mt-2 text-sm text-foreground/70 leading-relaxed">
            {spec.clinicalRationale}
          </p>
        </div>
        <div className="rounded-2xl border border-warn/40 bg-warn-soft/40 p-5">
          <h2 className="font-semibold text-warn">Hard invariants</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-foreground/80 list-disc pl-5">
            {spec.invariants.map((invariant) => (
              <li key={invariant}>{invariant}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-foreground/55">
            Every <em>ready</em> example is checked against these by the
            dataset validators. Drafts are exempt so you can think out loud.
          </p>
        </div>
      </div>

      <CoverageGrid axes={spec.stackAxes} coverage={coverage} />

      <ClinicianLlmInstructionsPanel
        loraId={spec.loraId}
        loraTitle={spec.title}
        shortTitle={spec.shortTitle}
        initialState={instructionsState}
      />

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Examples</h2>
          <p className="text-xs text-foreground/55">
            {ready} ready · {draft} draft · target {spec.targetCount}
          </p>
        </div>

        {seeds.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface-muted/40 p-8 text-center">
            <p className="text-sm text-foreground/60">
              No examples yet. Click <em>Add new example</em> to start.
            </p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-surface overflow-hidden">
            {seeds.map((seed) => {
              const previewValue = previewField
                ? seed.output[previewField.key]
                : undefined;
              const rowAxis = seed.input[spec.stackAxes.rowKey];
              const colAxis = seed.input[spec.stackAxes.colKey];
              return (
                <li key={seed.id} className="p-4 hover:bg-surface-muted/40">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={`rounded-full px-2 py-0.5 ${statusBadgeStyles[seed.status]}`}
                        >
                          {seed.status}
                        </span>
                        {typeof rowAxis === "string" ? (
                          <span className="text-foreground/55">
                            {rowAxis}
                          </span>
                        ) : null}
                        {typeof colAxis === "string" ? (
                          <span className="text-foreground/55">
                            · {colAxis}
                          </span>
                        ) : null}
                        {seed.authorInitials ? (
                          <span className="text-foreground/55">
                            · by {seed.authorInitials}
                          </span>
                        ) : null}
                        <span className="text-foreground/45">
                          ·{" "}
                          {new Date(seed.updatedAt).toLocaleDateString(
                            undefined,
                            {
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-foreground/85 leading-relaxed">
                        {shorten(previewValue) || (
                          <span className="text-foreground/40 italic">
                            (no preview field)
                          </span>
                        )}
                      </p>
                      {seed.notes ? (
                        <p className="mt-1 text-xs text-foreground/50">
                          Notes: {shorten(seed.notes, 160)}
                        </p>
                      ) : null}
                    </div>
                    <SeedActions seedId={seed.id} loraId={spec.loraId} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
