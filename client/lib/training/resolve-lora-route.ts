import { notFound, redirect } from "next/navigation";

import { isLoraId } from "./lora-specs";
import { LORA_IDS, type LoRAId } from "./types";

/** Short paths and typos that should resolve to a canonical LoRA id. */
const ROUTE_ALIASES: Record<string, LoRAId> = {
  "phase-narration": "lora-phase-narration",
};

export interface ResolveLoraRouteOptions {
  /** e.g. `/new` or `/abc-uuid` for nested training routes */
  pathSuffix?: string;
}

/**
 * Normalizes `app/training/[loraId]/…` segments: decode URI, map aliases,
 * fix casing, redirect to canonical URL. Calls `notFound()` if unknown.
 */
export function resolveTrainingLoraRouteParam(
  raw: string,
  options?: ResolveLoraRouteOptions,
): LoRAId {
  const suffix = options?.pathSuffix ?? "";
  const decoded = decodeURIComponent(raw).trim();

  const fromAlias = ROUTE_ALIASES[decoded.toLowerCase()];
  if (fromAlias) {
    redirect(`/training/${fromAlias}${suffix}`);
  }

  const caseMatch =
    LORA_IDS.find((id) => id.toLowerCase() === decoded.toLowerCase()) ?? null;
  if (caseMatch && caseMatch !== decoded) {
    redirect(`/training/${caseMatch}${suffix}`);
  }

  const candidate = caseMatch ?? decoded;
  if (!isLoraId(candidate)) {
    notFound();
  }
  return candidate;
}
