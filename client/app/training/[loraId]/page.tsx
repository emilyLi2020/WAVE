import Link from "next/link";
import { notFound } from "next/navigation";

import { toClientSpec } from "@/lib/training/client-spec";
import { assertTrainingEnabled } from "@/lib/training/guard";
import { getSpec, isLoraId } from "@/lib/training/lora-specs";
import {
  computeVoiceCoverage,
  listSeedsForLora,
} from "@/lib/training/storage";
import type { SeedStatus } from "@/lib/training/types";

import { SeedActions } from "./seed-actions";
import { VoiceChecklist } from "./voice-checklist";

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
  const { loraId } = await params;
  if (!isLoraId(loraId)) notFound();

  const spec = getSpec(loraId);
  const clientSpec = toClientSpec(spec);
  const seeds = await listSeedsForLora(loraId);
  const coverage = computeVoiceCoverage(seeds, spec.voiceScenarios);

  const ready = seeds.filter((s) => s.status !== "draft").length;
  const draft = seeds.length - ready;

  // Pick a representative output field to preview in the seed list.
  const previewField = spec.outputFields.find((f) => f.kind === "text") ??
    spec.outputFields[0];

  // Pick up to two enum input fields to chip-render alongside each seed.
  const chipFields = spec.inputFields
    .filter((f) => f.kind === "enum")
    .slice(0, 2);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-wide text-foreground/50">
          {spec.isStretch ? "Stretch LoRA" : "MVP LoRA"} · {spec.loraId}
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
          <Link
            href={`/training/${spec.loraId}/new`}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 transition"
          >
            + Add new example
          </Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-semibold">Why this is its own LoRA</h2>
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
            eval harness. Drafts are exempt so you can think out loud.
          </p>
        </div>
      </div>

      <VoiceChecklist
        scenarios={clientSpec.voiceScenarios}
        coverage={coverage}
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
              const chipValues = chipFields
                .map((field) => seed.input[field.key])
                .filter((value): value is string => typeof value === "string");
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
                        {chipValues.map((value, idx) => (
                          <span
                            key={`${value}-${idx}`}
                            className="text-foreground/55"
                          >
                            {idx === 0 ? "" : "· "}
                            {value}
                          </span>
                        ))}
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
