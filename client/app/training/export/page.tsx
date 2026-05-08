import Link from "next/link";

import { assertTrainingEnabled } from "@/lib/training/guard";
import { LORA_SPEC_LIST } from "@/lib/training/lora-specs";
import {
  countSeedsByLora,
  describeDataLocation,
  getAllClinicianLlmInstructions,
} from "@/lib/training/storage";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  assertTrainingEnabled();
  const [counts, dataLocation, instructionsByLora] = await Promise.all([
    countSeedsByLora(),
    describeDataLocation(),
    getAllClinicianLlmInstructions(),
  ]);

  const totalReady = LORA_SPEC_LIST.reduce(
    (acc, spec) => acc + counts[spec.loraId].ready + counts[spec.loraId].approved,
    0,
  );

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-foreground/50">
          For engineers
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Export training data
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-foreground/70">
          Download specialized JSONL files for demonstration adapters, or one
          combined JSONL file for the browser demo&apos;s multitask{" "}
          <code>lora-wave-session</code> fine-tune. By default only{" "}
          <em>ready</em> and <em>approved</em> seeds are exported, so drafts are
          excluded from training runs.
        </p>
      </header>

      <div className="rounded-2xl border border-border bg-surface-muted/50 p-5 text-sm text-foreground/75">
        <p className="font-medium text-foreground/90">Per-sample-set LLM instructions</p>
        <p className="mt-1 text-xs text-foreground/65 leading-relaxed">
          Detailed instructions are edited on each sample set&apos;s page (or when
          adding an example). Combined and per-LoRA downloads embed the matching
          instructions on each row — not one global block.
        </p>
        <p className="mt-3 text-xs">
          <Link href="/training" className="text-accent hover:underline">
            View status on the training home →
          </Link>
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 ring-1 ring-accent/20">
        <p className="text-xs uppercase tracking-wide text-foreground/50">
          For LLM review &amp; handoff
        </p>
        <h2 className="mt-2 font-semibold">Clinician content export</h2>
        <p className="mt-1 text-xs text-foreground/65">
          One JSON object per line: <code>input</code>, <code>output</code>,{" "}
          <code>notes</code>, initials, status, LoRA title, and this LoRA&apos;s{" "}
          <code>clinicianLlmInstructions</code> when saved. No ShareGPT{" "}
          <code>messages</code> wrapper — paste into an LLM for spot-checks,
          Synthetix-style expansion, or documentation.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            href="/api/training/export?format=clinician-jsonl"
            className="rounded-full border border-accent/40 bg-accent-soft/50 px-4 py-1.5 text-xs font-medium hover:border-accent hover:text-accent transition"
          >
            Download wave-clinician-seeds.jsonl
          </a>
          <a
            href="/api/training/export?format=clinician-jsonl&includeDrafts=1"
            className="text-[11px] text-foreground/50 hover:text-accent"
          >
            Include drafts
          </a>
        </div>
        <ul className="mt-5 divide-y divide-border border-t border-border">
          {LORA_SPEC_LIST.map((spec) => {
            const instrLen =
              instructionsByLora[spec.loraId].instructionsText.trim().length;
            return (
              <li
                key={spec.loraId}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{spec.shortTitle}</p>
                  <p className="text-xs text-foreground/55">
                    {spec.loraId}
                    {instrLen > 0 ?
                      ` · ${instrLen.toLocaleString()} chars of instructions`
                    : " · no instructions saved"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <a
                    href={`/api/training/export?format=clinician-jsonl&loraId=${spec.loraId}`}
                    className="rounded-full border border-border bg-background px-4 py-1.5 text-xs font-medium transition hover:border-accent hover:text-accent"
                  >
                    Export for LLM (.jsonl)
                  </a>
                  <a
                    href={`/api/training/export?format=clinician-jsonl&loraId=${spec.loraId}&includeDrafts=1`}
                    className="rounded-full border border-border bg-background px-4 py-1.5 text-xs font-medium transition hover:border-accent hover:text-accent"
                  >
                    + drafts
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-2xl border border-accent/30 bg-accent-soft/30 p-5">
        <h2 className="font-semibold">Demo multitask JSONL</h2>
        <p className="mt-1 text-xs text-foreground/65">
          Combines every ready specialized row into{" "}
          <code>lora-wave-session.jsonl</code>. The user message wraps each row
          with its source surface so one adapter can learn check-ins and
          reflection together. When this row&apos;s LoRA has saved instructions,
          the line begins with a <code>system</code> message carrying that
          surface&apos;s text only.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            href="/api/training/export?format=jsonl"
            className="rounded-full border border-border bg-background px-4 py-1.5 text-xs font-medium hover:border-accent hover:text-accent transition"
          >
            Download lora-wave-session.jsonl
          </a>
          <a
            href="/api/training/export?format=jsonl&includeDrafts=1"
            className="text-[11px] text-foreground/50 hover:text-accent"
          >
            Include drafts
          </a>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold">Specialized JSONL</h2>
        <p className="mt-1 text-xs text-foreground/55">
          One file per future specialized adapter. Filename is{" "}
          <code>{`<lora-id>.jsonl`}</code>.
        </p>
        <ul className="mt-4 divide-y divide-border">
          {LORA_SPEC_LIST.map((spec) => {
            const c = counts[spec.loraId];
            const ready = c.ready + c.approved;
            return (
              <li
                key={spec.loraId}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {spec.shortTitle}
                    {spec.isStretch ? (
                      <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/55">
                        stretch
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-foreground/55">
                    {spec.loraId} · {ready} ready
                    {c.draft > 0 ? ` · ${c.draft} draft (excluded)` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <a
                    href={`/api/training/export?format=jsonl&loraId=${spec.loraId}`}
                    className="rounded-full border border-border bg-background px-4 py-1.5 text-xs font-medium transition hover:border-accent hover:text-accent"
                    title="Ready + approved only. Empty file if you only have drafts."
                  >
                    Download .jsonl
                  </a>
                  <a
                    href={`/api/training/export?format=jsonl&loraId=${spec.loraId}&includeDrafts=1`}
                    className="rounded-full border border-border bg-background px-4 py-1.5 text-xs font-medium transition hover:border-accent hover:text-accent"
                    title="Includes draft rows for backup or handoff."
                  >
                    .jsonl + drafts
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold">All seeds, flat CSV</h2>
        <p className="mt-1 text-xs text-foreground/55">
          One row per seed across every LoRA, with stringified JSON
          payloads. Useful for spreadsheet review or quick diffs.
          {totalReady} ready row{totalReady === 1 ? "" : "s"} total.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            href="/api/training/export?format=csv"
            className="rounded-full border border-border bg-background px-4 py-1.5 text-xs font-medium hover:border-accent hover:text-accent transition"
          >
            Download wave-training-seeds.csv
          </a>
          <a
            href="/api/training/export?format=csv&includeDrafts=1"
            className="text-[11px] text-foreground/50 hover:text-accent"
          >
            Include drafts
          </a>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface-muted/40 p-5 text-xs text-foreground/65 space-y-3">
        <p>
          <strong>On disk.</strong> Raw seeds live as one JSON file per
          LoRA at:
        </p>
        <pre className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-[11px] text-foreground/80 overflow-x-auto">
          {dataLocation.absolutePath}
        </pre>
        <p>
          {dataLocation.exists
            ? `${dataLocation.fileCount} file${dataLocation.fileCount === 1 ? "" : "s"} present (LoRA seed arrays + optional clinician-llm-instructions.json).`
            : "Directory will be created on the first save."}{" "}
          Commit these files to git so the training engineer can pull
          them. Override the location with{" "}
          <code>WAVE_TRAINING_DATA_DIR</code> if you need a custom path;
          otherwise seeds resolve under <code>client/data/training-seeds</code>{" "}
          (with upward search from <code>process.cwd()</code> for monorepos).
        </p>
        <p>
          <strong>Pipeline integration.</strong> The JSONL downloads
          above match Unsloth&apos;s ShareGPT messages format (one conversation
          per line). Each conversation may start with a <code>system</code> turn
          containing the instructions for <em>that row&apos;s</em> LoRA. Use the
          combined file for the browser demo LoRA; use the per-specialist files
          only for offline demonstration adapters. From <code>models/</code>,
          load with{" "}
          <code>datasets.load_dataset(&quot;json&quot;, ...)</code> and
          pass the <code>messages</code> field to TRL&apos;s SFTTrainer
          with the <code>gemma-4</code> chat template
          (<code>docs/model-training.md §6</code>).
        </p>
      </div>
    </div>
  );
}
