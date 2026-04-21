/**
 * /api/training/seeds/[id] — get, patch, delete one seed.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { assertTrainingEnabled } from "@/lib/training/guard";
import { getSpec, isLoraId } from "@/lib/training/lora-specs";
import { deleteSeed, getSeed, updateSeed } from "@/lib/training/storage";
import { SEED_STATUSES } from "@/lib/training/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  input: z.record(z.string(), z.unknown()).optional(),
  output: z.record(z.string(), z.unknown()).optional(),
  authorInitials: z.string().min(1).max(6).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(SEED_STATUSES).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  assertTrainingEnabled();
  const { id } = await context.params;
  const seed = await getSeed(id);
  if (!seed) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ seed });
}

export async function PATCH(request: Request, context: RouteContext) {
  assertTrainingEnabled();
  const { id } = await context.params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await getSeed(id);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!isLoraId(existing.loraId)) {
    return NextResponse.json(
      { error: "stored_seed_has_unknown_lora_id" },
      { status: 500 },
    );
  }

  // If the patch is promoting status above draft, validate the merged
  // (input, output) against the LoRA's schemas.
  const merged = {
    input: parsed.data.input ?? existing.input,
    output: parsed.data.output ?? existing.output,
    status: parsed.data.status ?? existing.status,
  };

  if (merged.status !== "draft") {
    const spec = getSpec(existing.loraId);
    const inputCheck = spec.inputSchema.safeParse(merged.input);
    if (!inputCheck.success) {
      return NextResponse.json(
        { error: "input_failed_schema", issues: inputCheck.error.issues },
        { status: 400 },
      );
    }
    const outputCheck = spec.outputSchema.safeParse(merged.output);
    if (!outputCheck.success) {
      return NextResponse.json(
        { error: "output_failed_schema", issues: outputCheck.error.issues },
        { status: 400 },
      );
    }
  }

  try {
    const seed = await updateSeed(id, parsed.data);
    return NextResponse.json({ seed });
  } catch (err) {
    return NextResponse.json(
      { error: "storage_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  assertTrainingEnabled();
  const { id } = await context.params;
  try {
    await deleteSeed(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "storage_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
