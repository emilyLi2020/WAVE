/**
 * GET/PUT per-LoRA clinician LLM instructions for the /training UI.
 * Persisted at data/training-seeds/clinician-llm-instructions.json (see storage.ts).
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { assertTrainingEnabled } from "@/lib/training/guard";
import { isLoraId } from "@/lib/training/lora-specs";
import {
  getClinicianLlmInstructions,
  setClinicianLlmInstructions,
} from "@/lib/training/storage";
import { LORA_IDS } from "@/lib/training/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Detailed per-surface instructions (phase narration, each check-in, etc.). */
const MAX_INSTRUCTIONS_CHARS = 64_000;

const putSchema = z.object({
  loraId: z.enum(LORA_IDS),
  instructionsText: z.string().max(MAX_INSTRUCTIONS_CHARS),
});

export async function GET(request: Request) {
  assertTrainingEnabled();
  const url = new URL(request.url);
  const loraIdParam = url.searchParams.get("loraId");
  if (!loraIdParam || !isLoraId(loraIdParam)) {
    return NextResponse.json(
      { error: "missing_or_unknown_lora_id" },
      { status: 400 },
    );
  }
  const state = await getClinicianLlmInstructions(loraIdParam);
  return NextResponse.json({ loraId: loraIdParam, ...state });
}

export async function PUT(request: Request) {
  assertTrainingEnabled();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const state = await setClinicianLlmInstructions(
    parsed.data.loraId,
    parsed.data.instructionsText,
  );
  return NextResponse.json({ loraId: parsed.data.loraId, ...state });
}
