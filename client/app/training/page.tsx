import Link from "next/link";

import { assertTrainingEnabled } from "@/lib/training/guard";
import { LORA_SPEC_LIST } from "@/lib/training/lora-specs";
import { countSeedsByLora } from "@/lib/training/storage";

export const dynamic = "force-dynamic";

export default async function TrainingOverviewPage() {
  assertTrainingEnabled();
  const counts = await countSeedsByLora();

  const totalReady = LORA_SPEC_LIST.reduce(
    (acc, spec) => acc + counts[spec.loraId].ready + counts[spec.loraId].approved,
    0,
  );
  const totalTarget = LORA_SPEC_LIST.reduce(
    (acc, spec) => acc + spec.targetCount,
    0,
  );

  return (
    <div className="space-y-10">
      <div>
        <p className="text-xs uppercase tracking-wide text-foreground/50">
          Training data collection
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Welcome. Your seed examples train WAVE.
        </h1>
        <p className="mt-3 max-w-2xl text-foreground/70 leading-relaxed">
          The browser demo uses one multitask fine-tune called{" "}
          <code>lora-wave-session</code>, merged into the local Gemma ONNX
          model so the PWA loads one model instead of swapping adapters. We
          still collect examples under future specialized LoRA names so each
          clinical surface can be reviewed on its own.
        </p>
      </div>

      <div className="rounded-2xl border border-accent/30 bg-accent-soft/30 p-6">
        <h2 className="font-semibold">Current model architecture</h2>
        <p className="mt-2 text-sm text-foreground/75 leading-relaxed">
          Write 20 high-quality examples for each specialized set below. The
          export page can download each set separately for demonstration
          adapters, or combine every ready row into the one{" "}
          <code>lora-wave-session</code> dataset that fine-tunes the model used
          in the demo.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-semibold">How this works</h2>
        <ol className="mt-3 space-y-2 text-sm text-foreground/75 list-decimal pl-5">
          <li>
            Pick a specialized sample set from the sidebar. Read the clinical
            rationale box so you know what tone and protocol constraints apply.
          </li>
          <li>
            Click <em>Add new example</em>. Fill in the patient context on
            the left (intensity, medication, trigger), then write the
            response WAVE should produce on the right.
          </li>
          <li>
            Save as <em>draft</em> while you think it through. Mark it{" "}
            <em>ready</em> when you&apos;re happy with it. The training
            run only uses <em>ready</em> and <em>approved</em> rows, so
            drafts are safe scratch space.
          </li>
          <li>
            Aim to spread examples across the coverage grid on each
            sample set&apos;s page — different medications, different missed
            doses, different triggers. A strong dataset has a few examples
            in every cell.
          </li>
        </ol>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Progress</h2>
          <p className="text-sm text-foreground/60">
            {totalReady} ready · target {totalTarget}
          </p>
        </div>
        <div className="mt-3 h-2 rounded-full bg-surface-muted overflow-hidden">
          <div
            className="h-full bg-accent transition-all"
            style={{
              width: `${Math.min(100, (totalReady / totalTarget) * 100)}%`,
            }}
          />
        </div>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LORA_SPEC_LIST.map((spec) => {
            const c = counts[spec.loraId];
            const ready = c.ready + c.approved;
            const pct = Math.min(100, (ready / spec.targetCount) * 100);
            return (
              <li
                key={spec.loraId}
                className="rounded-2xl border border-border bg-surface p-4"
              >
                <div className="flex items-baseline justify-between">
                  <Link
                    href={`/training/${spec.loraId}`}
                    className="font-semibold hover:text-accent"
                  >
                    {spec.shortTitle}
                  </Link>
                  <span className="text-xs font-mono text-foreground/60">
                    {ready}/{spec.targetCount}
                  </span>
                </div>
                <p className="mt-1 text-xs text-foreground/55 truncate">
                  {spec.loraId}
                  {spec.isStretch ? " · stretch" : ""}
                </p>
                <div className="mt-3 h-1.5 rounded-full bg-surface-muted overflow-hidden">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {c.draft > 0 ? (
                  <p className="mt-2 text-xs text-foreground/50">
                    + {c.draft} draft{c.draft === 1 ? "" : "s"} (not counted)
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-2xl border border-border bg-surface-muted/40 p-6 text-sm text-foreground/70">
        <p>
          <strong>Privacy note.</strong> The examples you write here are
          synthetic clinical dialogue, not real patient data. Don&apos;t paste
          anything from a real chart or session note. If you ever need to
          reference a patient, change every detail (age, name, dose, time)
          before typing it in.
        </p>
      </div>
    </div>
  );
}
