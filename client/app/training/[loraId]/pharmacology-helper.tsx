"use client";

/**
 * Companion panel for the lora-med-ack form. Reads the live input
 * state's matType + medicationStatus and shows the canonical
 * pharmacology paragraph from client/lib/clinical/pharmacology.ts.
 *
 * The doctor's job in this LoRA is *framing*, not pharmacology copy —
 * the canonical paragraph is injected by the runtime, so seed examples
 * should use the canonical text (or a close paraphrase) verbatim.
 */

import { useMemo } from "react";

import {
  getPharmacologySnippet,
  type PharmacologySnippet,
} from "@/lib/clinical/pharmacology";
import type { MatType, MedicationStatus } from "@/types/models";

interface Props {
  matType: unknown;
  medicationStatus: unknown;
  onApplyToClaim: (snippet: PharmacologySnippet) => void;
}

const MAT_TYPES: readonly MatType[] = [
  "buprenorphine",
  "methadone",
  "naltrexone",
  "vivitrol",
  "none",
];
const MEDICATION_STATUSES: readonly MedicationStatus[] = [
  "on_time",
  "late",
  "missed",
  "none",
];

function asMatType(value: unknown): MatType | null {
  return typeof value === "string" && (MAT_TYPES as readonly string[]).includes(value)
    ? (value as MatType)
    : null;
}

function asMedicationStatus(value: unknown): MedicationStatus | null {
  return typeof value === "string" &&
    (MEDICATION_STATUSES as readonly string[]).includes(value)
    ? (value as MedicationStatus)
    : null;
}

export function PharmacologyHelper({
  matType,
  medicationStatus,
  onApplyToClaim,
}: Props) {
  const snippet = useMemo(() => {
    const mat = asMatType(matType);
    const status = asMedicationStatus(medicationStatus);
    if (!mat || !status) return null;
    return getPharmacologySnippet(mat, status);
  }, [matType, medicationStatus]);

  return (
    <aside className="rounded-2xl border border-accent/30 bg-accent-soft/30 p-5">
      <header>
        <p className="text-xs uppercase tracking-wide text-accent">
          Pharmacology lookup
        </p>
        <h3 className="mt-1 font-semibold">Canonical paragraph</h3>
        <p className="mt-1 text-xs text-foreground/65">
          Pulled from <code>client/lib/clinical/pharmacology.ts</code>. The
          runtime injects this text into the model prompt — your example
          should use it (or a close paraphrase) so the fine-tune learns
          the framing, not the facts.
        </p>
      </header>

      {snippet ? (
        <div className="mt-4 space-y-3">
          <p className="rounded-xl bg-background/70 p-3 text-sm leading-relaxed text-foreground/85">
            {snippet.claim}
          </p>
          <p className="text-xs text-foreground/55">
            <span className="font-medium">Citation:</span> {snippet.citation}
            {snippet.citationDetail
              ? ` — ${snippet.citationDetail}`
              : null}
          </p>
          <button
            type="button"
            onClick={() => onApplyToClaim(snippet)}
            className="inline-flex items-center gap-2 rounded-full border border-accent bg-background px-4 py-2 text-xs font-medium text-accent hover:bg-accent hover:text-accent-foreground transition"
          >
            Use this in the pharmacologyClaim field →
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-foreground/60">
          Pick a <strong>medication</strong> and <strong>status</strong> on
          the left to see the canonical pharmacology paragraph for that
          combination.
        </p>
      )}
    </aside>
  );
}
