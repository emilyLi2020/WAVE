import type { Metadata } from "next";
import Link from "next/link";

import {
  CAVEATS,
  EXAMPLE_COMPARISON,
  MODEL_RESULT,
  QUALITY_GATES,
  SCORE_CARDS,
  SCORE_WEIGHTS,
} from "@/lib/data/model-results";

export const metadata: Metadata = {
  title: "Model Results - WAVE",
  description:
    "Base Gemma versus WAVE phase-narration LoRA training results, methodology, and held-out eval scores.",
};

export default function ModelResultsPage() {
  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-x-[-20%] top-0 -z-10 h-[34rem] rounded-full bg-gradient-to-r from-wave-fall/30 via-accent-soft/50 to-wave-rise/30 blur-3xl"
      />

      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <nav aria-label="Breadcrumb" className="text-sm text-foreground/60">
          <Link href="/" className="hover:text-accent">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span>Model Results</span>
        </nav>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/90 px-3 py-1 text-xs font-medium text-foreground/70 shadow-sm backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Contest fine-tuning proof
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Fine-tuning made WAVE&apos;s narration model measurably better.
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground/70">
              {MODEL_RESULT.claim} The evaluation compares base Gemma and the
              LoRA on the same held-out prompts.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {MODEL_RESULT.badges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground/70"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>

          <article className="rounded-[2rem] border border-border bg-surface/90 p-6 shadow-lg shadow-accent/10 backdrop-blur">
            <p className="text-xs uppercase tracking-wide text-foreground/50">
              Composite score
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <ScorePlate label="Base Gemma" value="67.29" muted />
              <ScorePlate label="LoRA Gemma" value="70.44" />
            </div>
            <div className="mt-5 rounded-2xl bg-accent-soft/60 p-4">
              <p className="text-sm font-medium text-accent">
                +3.15 point WAVE score improvement
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground/70">
                The adapter improved held-out likelihood and reference
                similarity without losing format, style, or safety.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="border-y border-border bg-surface-muted/40">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Scorecard
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/70">
                NLL and perplexity are the closest LLM analogs to traditional
                ML loss. Lower is better. Token F1 and ROUGE-L show reference
                similarity.
              </p>
            </div>
            <span className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
              Better than base: yes
            </span>
          </div>

          <ul className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {SCORE_CARDS.map((score) => (
              <li
                key={score.label}
                className="rounded-2xl border border-border bg-surface p-5"
              >
                <p className="text-xs uppercase tracking-wide text-foreground/50">
                  {score.label}
                </p>
                <div className="mt-4 space-y-2 text-sm">
                  <MetricRow label="Base" value={score.base} />
                  <MetricRow label="LoRA" value={score.lora} highlight />
                </div>
                <p className="mt-4 inline-flex rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
                  Delta {score.delta}
                </p>
                <p className="mt-3 text-xs leading-relaxed text-foreground/60">
                  {score.interpretation}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 py-14 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            Quality gates stayed clean
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/70">
            The LoRA improved likelihood without breaking the behaviors WAVE
            needs before a narration can appear in the app.
          </p>
          <ul className="mt-6 space-y-3">
            {QUALITY_GATES.map((gate) => (
              <li
                key={gate.label}
                className="rounded-2xl border border-border bg-surface-muted/50 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{gate.label}</p>
                  <div className="flex gap-2 text-xs font-medium">
                    <span className="rounded-full bg-surface px-2.5 py-1 text-foreground/60">
                      Base {gate.base}
                    </span>
                    <span className="rounded-full bg-accent-soft px-2.5 py-1 text-accent">
                      LoRA {gate.lora}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-sm text-foreground/60">
                  {gate.description}
                </p>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            How the score is built
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/70">
            The WAVE score is intentionally task-specific: it rewards lower
            held-out loss, but only if the model also keeps format, voice, and
            clinical safety intact.
          </p>
          <ul className="mt-6 space-y-4">
            {SCORE_WEIGHTS.map((weight) => (
              <li key={weight.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{weight.label}</span>
                  <span className="text-foreground/60">{weight.value} pts</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${weight.value}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-2xl bg-surface-muted p-4 text-sm leading-relaxed text-foreground/70">
            <p>
              Dataset: {MODEL_RESULT.dataset.totalExamples} examples,{" "}
              {MODEL_RESULT.dataset.trainExamples} train and{" "}
              {MODEL_RESULT.dataset.heldOutExamples} held out, split with seed{" "}
              {MODEL_RESULT.dataset.seed}.
            </p>
            <p className="mt-2">
              Training: {MODEL_RESULT.training.method}, rank{" "}
              {MODEL_RESULT.training.loraRank}, alpha{" "}
              {MODEL_RESULT.training.loraAlpha}, learning rate{" "}
              {MODEL_RESULT.training.learningRate},{" "}
              {MODEL_RESULT.training.quantization}.
            </p>
          </div>
        </article>
      </section>

      <section className="border-y border-border bg-surface-muted/40">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-semibold tracking-tight">
              Same prompt, two generations
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground/70">
              {EXAMPLE_COMPARISON.promptSummary} Both outputs satisfy the
              schema; the LoRA version is more grounded in bodily support and
              surface contact.
            </p>
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <OutputCard
              title="Base Gemma"
              subtitle="Original model"
              lines={EXAMPLE_COMPARISON.baseLines}
            />
            <OutputCard
              title="LoRA Gemma"
              subtitle="Fine-tuned adapter"
              lines={EXAMPLE_COMPARISON.loraLines}
              highlighted
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
          <article className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-2xl font-semibold tracking-tight">
              What this proves
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-foreground/70">
              On the held-out set, the LoRA reduced completion NLL from 4.7676
              to 4.7097 and perplexity from 117.63 to 111.02. That means the
              desired WAVE narration became more likely under the fine-tuned
              model. It also improved Token F1 and ROUGE-L while keeping every
              quality gate at 100%.
            </p>
            <div className="mt-5 rounded-2xl border border-border bg-surface-muted/60 p-4">
              <p className="text-sm font-medium">
                Contest-ready claim
              </p>
              <p className="mt-2 text-sm leading-relaxed text-foreground/70">
                Fine-tuning improved held-out completion likelihood and
                reference similarity versus base Gemma while preserving 100%
                JSON validity, schema adherence, patient-facing style, safety,
                and medication directive pass rates.
              </p>
            </div>
          </article>

          <aside className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="font-semibold">Caveats</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-foreground/70">
              {CAVEATS.map((caveat) => (
                <li key={caveat} className="flex gap-2">
                  <span
                    aria-hidden
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warn"
                  />
                  <span>{caveat}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>
    </div>
  );
}

function ScorePlate({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-border p-4 ${
        muted ? "bg-surface-muted/70" : "bg-accent text-accent-foreground"
      }`}
    >
      <p className="text-xs uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-2 text-4xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function MetricRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-foreground/55">{label}</span>
      <span className={highlight ? "font-semibold text-accent" : "font-medium"}>
        {value}
      </span>
    </div>
  );
}

function OutputCard({
  title,
  subtitle,
  lines,
  highlighted = false,
}: {
  title: string;
  subtitle: string;
  lines: readonly string[];
  highlighted?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl border p-6 ${
        highlighted
          ? "border-accent/50 bg-accent-soft/40"
          : "border-border bg-surface"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs uppercase tracking-wide text-foreground/50">
            {subtitle}
          </p>
        </div>
        {highlighted ? (
          <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            Fine-tuned
          </span>
        ) : null}
      </div>
      <ol className="mt-5 space-y-3">
        {lines.map((line, index) => (
          <li key={line} className="flex gap-3 text-sm leading-relaxed">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-medium text-foreground/50">
              {index + 1}
            </span>
            <span className="text-foreground/75">{line}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}
