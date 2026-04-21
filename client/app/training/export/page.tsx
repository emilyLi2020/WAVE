import { assertTrainingEnabled } from "@/lib/training/guard";
import { LORA_SPEC_LIST } from "@/lib/training/lora-specs";
import {
  countSeedsByLora,
  describeDataLocation,
} from "@/lib/training/storage";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  assertTrainingEnabled();
  const [counts, dataLocation] = await Promise.all([
    countSeedsByLora(),
    describeDataLocation(),
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
          Download per-LoRA JSONL files in Unsloth&apos;s ShareGPT messages
          format. Each file feeds directly into TRL&apos;s SFTTrainer with
          the <code>gemma-4</code> chat template, per
          <code> docs/model-training.md §6</code>. By default only{" "}
          <em>ready</em> and <em>approved</em> seeds are exported — drafts
          are excluded so half-finished thinking never enters a training
          run.
        </p>
      </header>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold">Per-LoRA JSONL</h2>
        <p className="mt-1 text-xs text-foreground/55">
          One file per LoRA. Filename is <code>{`<lora-id>.jsonl`}</code>.
        </p>
        <ul className="mt-4 divide-y divide-border">
          {LORA_SPEC_LIST.map((spec) => {
            const c = counts[spec.loraId];
            const ready = c.ready + c.approved;
            const disabled = ready === 0;
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
                <div className="flex items-center gap-2">
                  <a
                    href={`/api/training/export?format=jsonl&loraId=${spec.loraId}`}
                    aria-disabled={disabled}
                    className={`rounded-full border border-border bg-background px-4 py-1.5 text-xs font-medium transition ${
                      disabled
                        ? "opacity-40 pointer-events-none"
                        : "hover:border-accent hover:text-accent"
                    }`}
                  >
                    Download .jsonl
                  </a>
                  <a
                    href={`/api/training/export?format=jsonl&loraId=${spec.loraId}&includeDrafts=1`}
                    className="text-[11px] text-foreground/50 hover:text-accent"
                    title="Include drafts. Only useful for inspecting work-in-progress; do not feed to training."
                  >
                    + drafts
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
            ? `${dataLocation.fileCount} file${dataLocation.fileCount === 1 ? "" : "s"} present.`
            : "Directory will be created on the first save."}{" "}
          Commit these files to git so the training engineer can pull
          them. Override the location with{" "}
          <code>WAVE_TRAINING_DATA_DIR</code> if you run <code>pnpm dev</code>
          {" "}from somewhere other than <code>client/</code>.
        </p>
        <p>
          <strong>Pipeline integration.</strong> The JSONL downloads
          above match Unsloth&apos;s ShareGPT messages format (one
          conversation per line). From <code>models/</code>, load with{" "}
          <code>datasets.load_dataset(&quot;json&quot;, ...)</code> and
          pass the <code>messages</code> field to TRL&apos;s SFTTrainer
          with the <code>gemma-4</code> chat template
          (<code>docs/model-training.md §6</code>).
        </p>
      </div>
    </div>
  );
}
