import Link from "next/link";
import { notFound } from "next/navigation";

import { toClientSpec } from "@/lib/training/client-spec";
import { assertTrainingEnabled } from "@/lib/training/guard";
import { getSpec, isLoraId } from "@/lib/training/lora-specs";
import { getSeed } from "@/lib/training/storage";

import { InvariantsCallout } from "../invariants-callout";
import { SeedForm } from "../seed-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ loraId: string; seedId: string }>;
}

export default async function EditSeedPage({ params }: PageProps) {
  assertTrainingEnabled();
  const { loraId, seedId } = await params;
  if (!isLoraId(loraId)) notFound();

  const spec = getSpec(loraId);
  const seed = await getSeed(seedId);
  if (!seed || seed.loraId !== loraId) notFound();

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wide text-foreground/50">
            <Link
              href={`/training/${spec.loraId}`}
              className="hover:text-accent"
            >
              ← {spec.shortTitle}
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Edit example
          </h1>
          <p className="mt-1 text-xs text-foreground/55">
            Last updated {new Date(seed.updatedAt).toLocaleString()}
            {seed.authorInitials ? ` · by ${seed.authorInitials}` : ""}
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <SeedForm spec={toClientSpec(spec)} existing={seed} />
        <InvariantsCallout
          invariants={spec.invariants}
          citationPrompt={spec.citationPrompt}
        />
      </div>
    </div>
  );
}
