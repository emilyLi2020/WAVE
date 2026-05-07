import Link from "next/link";

import { ClinicianLlmInstructionsPanel } from "@/app/training/_components/clinician-llm-instructions-panel";
import { toClientSpec } from "@/lib/training/client-spec";
import { assertTrainingEnabled } from "@/lib/training/guard";
import { getSpec } from "@/lib/training/lora-specs";
import { resolveTrainingLoraRouteParam } from "@/lib/training/resolve-lora-route";
import { getClinicianLlmInstructions } from "@/lib/training/storage";

import { SeedForm } from "../seed-form";
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ loraId: string }>;
}

export default async function NewSeedPage({ params }: PageProps) {
  assertTrainingEnabled();
  const { loraId: raw } = await params;
  const loraId = resolveTrainingLoraRouteParam(raw, { pathSuffix: "/new" });

  const spec = getSpec(loraId);
  const instructionsState = await getClinicianLlmInstructions(loraId);

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
            New example
          </h1>
        </div>
      </header>

      <ClinicianLlmInstructionsPanel
        loraId={spec.loraId}
        loraTitle={spec.title}
        shortTitle={spec.shortTitle}
        initialState={instructionsState}
        compact
      />

      <SeedForm spec={toClientSpec(spec)} existing={null} />
    </div>
  );
}
