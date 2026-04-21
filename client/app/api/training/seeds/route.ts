/**
 * /api/training/seeds — list + create.
 *
 * Server-only Route Handler for the dev /training UI. Validates the
 * payload against the LoRA's input/output Zod schemas before insert so
 * malformed seeds never make it to disk.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { assertTrainingEnabled } from "@/lib/training/guard";
import { getSpec, isLoraId } from "@/lib/training/lora-specs";
import {
  createSeed,
  listAllSeeds,
  listSeedsForLora,
} from "@/lib/training/storage";
import { LORA_IDS, SEED_STATUSES } from "@/lib/training/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  loraId: z.enum(LORA_IDS),
  input: z.record(z.string(), z.unknown()),
  output: z.record(z.string(), z.unknown()),
  authorInitials: z.string().min(1).max(6).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(SEED_STATUSES).optional(),
});

export async function GET(request: Request) {
  assertTrainingEnabled();
  const url = new URL(request.url);
  const loraIdParam = url.searchParams.get("loraId");

  if (loraIdParam) {
    if (!isLoraId(loraIdParam)) {
      return NextResponse.json({ error: "unknown_lora_id" }, { status: 400 });
    }
    const seeds = await listSeedsForLora(loraIdParam);
    return NextResponse.json({ seeds });
  }
  const seeds = await listAllSeeds();
  return NextResponse.json({ seeds });
}

export async function POST(request: Request) {
  assertTrainingEnabled();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { loraId, input, output, authorInitials, notes, status } = parsed.data;
  const spec = getSpec(loraId);

  // Drafts are allowed to be incomplete; ready/approved must validate.
  const effectiveStatus = status ?? "draft";
  if (effectiveStatus !== "draft") {
    const inputCheck = spec.inputSchema.safeParse(input);
    if (!inputCheck.success) {
      return NextResponse.json(
        {
          error: "input_failed_schema",
          issues: inputCheck.error.issues,
        },
        { status: 400 },
      );
    }
    const outputCheck = spec.outputSchema.safeParse(output);
    if (!outputCheck.success) {
      return NextResponse.json(
        {
          error: "output_failed_schema",
          issues: outputCheck.error.issues,
        },
        { status: 400 },
      );
    }
  }

  try {
    const seed = await createSeed({
      loraId,
      input,
      output,
      authorInitials: authorInitials ?? null,
      notes: notes ?? null,
      status: effectiveStatus,
    });
    return NextResponse.json({ seed }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "storage_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
