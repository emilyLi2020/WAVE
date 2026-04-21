/**
 * Layout for the dev-only /training surface. Sidebar lists every LoRA
 * with a (filled / target) count badge so the doctor can see at a
 * glance which LoRAs still need examples.
 *
 * Gated by NEXT_PUBLIC_TRAINING_ENABLED — every page in here calls
 * assertTrainingEnabled() which 404s when the flag is off. That is the
 * single knob to remove the surface before deploying the demo.
 */

import Link from "next/link";

import { assertTrainingEnabled } from "@/lib/training/guard";
import { LORA_SPEC_LIST } from "@/lib/training/lora-specs";
import { countSeedsByLora } from "@/lib/training/storage";

import { SidebarLink } from "./sidebar-link";

export const dynamic = "force-dynamic";

export default async function TrainingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  assertTrainingEnabled();
  const counts = await countSeedsByLora();

  return (
    <div className="min-h-full bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
          <Link
            href="/training"
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            <span
              aria-hidden
              className="inline-block h-3 w-6 rounded-full bg-accent"
            />
            <span>WAVE — training data</span>
          </Link>
          <div className="flex items-center gap-4 text-xs text-foreground/60">
            <span className="rounded-full border border-warn/40 bg-warn-soft px-2 py-0.5 text-warn">
              Internal · clinician only
            </span>
            <Link
              href="/"
              className="text-foreground/60 hover:text-accent transition-colors"
            >
              ↗ Patient app
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8 grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-1">
          <SidebarLink href="/training" label="Overview" />
          <SidebarLink href="/training/export" label="Export · for engineers" />

          <div className="pt-6 pb-2 text-xs uppercase tracking-wide text-foreground/50 px-2">
            MVP LoRAs
          </div>
          {LORA_SPEC_LIST.filter((spec) => !spec.isStretch).map((spec) => {
            const c = counts[spec.loraId];
            return (
              <SidebarLink
                key={spec.loraId}
                href={`/training/${spec.loraId}`}
                label={spec.shortTitle}
                badge={`${c.ready + c.approved}/${spec.targetCount}`}
                badgeHint={
                  c.draft > 0
                    ? `${c.draft} draft${c.draft === 1 ? "" : "s"} not counted`
                    : undefined
                }
              />
            );
          })}

          <div className="pt-6 pb-2 text-xs uppercase tracking-wide text-foreground/50 px-2">
            Stretch LoRAs
          </div>
          {LORA_SPEC_LIST.filter((spec) => spec.isStretch).map((spec) => {
            const c = counts[spec.loraId];
            return (
              <SidebarLink
                key={spec.loraId}
                href={`/training/${spec.loraId}`}
                label={spec.shortTitle}
                badge={`${c.ready + c.approved}/${spec.targetCount}`}
                badgeHint={
                  c.draft > 0
                    ? `${c.draft} draft${c.draft === 1 ? "" : "s"} not counted`
                    : undefined
                }
              />
            );
          })}
        </aside>

        <section>{children}</section>
      </div>
    </div>
  );
}
