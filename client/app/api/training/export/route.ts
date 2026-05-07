/**
 * /api/training/export — download seeds as JSONL or CSV.
 *
 * - format=jsonl + loraId=<id> emits one specialized LoRA seed file.
 * - format=jsonl without loraId emits the combined lora-wave-session dataset
 *   used by the browser demo's single multitask LoRA.
 * - format=clinician-jsonl emits one plain JSON object per line: input, output,
 *   notes, LoRA metadata, and this LoRA's clinicianLlmInstructions when set.
 * - format=csv — flat dump with per-row instructions for that row's LoRA.
 *
 * By default only seeds with status >= ready are exported, so half-
 * finished drafts never sneak into a training run. Pass `includeDrafts=1`
 * to override.
 *
 * Per-LoRA clinician instructions (saved in the training UI) become a
 * leading system message in ShareGPT JSONL when non-empty.
 */

import { NextResponse } from "next/server";

import { assertTrainingEnabled } from "@/lib/training/guard";
import { getSpec, isLoraId } from "@/lib/training/lora-specs";
import {
  getAllClinicianLlmInstructions,
  listAllSeeds,
  listSeedsForLora,
} from "@/lib/training/storage";
import {
  DEMO_LORA_ID,
  type ClinicianLlmInstructionsState,
  type LoRAId,
  type TrainingSeed,
} from "@/lib/training/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function instructionsForLora(
  byLora: Record<LoRAId, ClinicianLlmInstructionsState>,
  loraId: LoRAId,
): { text: string; updatedAt: string | null } {
  const slot = byLora[loraId];
  return {
    text: slot.instructionsText.trim(),
    updatedAt: slot.updatedAt,
  };
}

/** After natural check-in turns, teach the model to emit the validated JSON envelope. */
const CHECKIN_STRUCTURED_USER =
  "[wave-structured] Reply with a single JSON object only (keys reply and endConversation). The reply string must exactly match your last WAVE message above.";

function isCheckInDialogueSeed(seed: TrainingSeed): boolean {
  if (!seed.loraId.startsWith("lora-check-in-")) return false;
  const raw = seed.output as Record<string, unknown> | null | undefined;
  const turns = raw?.dialogueTurns;
  return Array.isArray(turns) && turns.length >= 2;
}

function shareGptMessagesForSeed(
  seed: TrainingSeed,
  options: { combined: boolean },
  systemContent: string,
): { role: "system" | "user" | "assistant"; content: string }[] {
  const input = options.combined
    ? {
        surface: seed.loraId,
        input: seed.input,
      }
    : seed.input;

  const base: { role: "system" | "user" | "assistant"; content: string }[] = [
    ...(systemContent !== "" ?
      [{ role: "system" as const, content: systemContent }]
    : []),
    { role: "user" as const, content: JSON.stringify(input) },
  ];

  if (!isCheckInDialogueSeed(seed)) {
    return [
      ...base,
      { role: "assistant" as const, content: JSON.stringify(seed.output) },
    ];
  }

  const output = seed.output as {
    reply?: string;
    endConversation?: unknown;
    dialogueTurns?: { role: string; content: string }[];
  };
  const turns = output.dialogueTurns ?? [];
  for (const line of turns) {
    const content = typeof line.content === "string" ? line.content : "";
    if (line.role === "patient") {
      base.push({ role: "user", content });
    } else if (line.role === "agent") {
      base.push({ role: "assistant", content });
    }
  }

  const structuredPayload = {
    reply: typeof output.reply === "string" ? output.reply : "",
    endConversation: output.endConversation ?? { action: "continue" },
  };

  return [
    ...base,
    { role: "user" as const, content: CHECKIN_STRUCTURED_USER },
    {
      role: "assistant" as const,
      content: JSON.stringify(structuredPayload),
    },
  ];
}

function toJsonl(
  seeds: readonly TrainingSeed[],
  options: { combined: boolean },
  byLora: Record<LoRAId, ClinicianLlmInstructionsState>,
): string {
  const lines: string[] = [];
  for (const seed of seeds) {
    const { text: systemContent } = instructionsForLora(byLora, seed.loraId);
    const messages = shareGptMessagesForSeed(seed, options, systemContent);
    lines.push(JSON.stringify({ messages }));
  }
  return `${lines.join("\n")}\n`;
}

/** One object per line: clinician-authored fields only, easy for LLM tools. */
function toClinicianJsonl(
  seeds: readonly TrainingSeed[],
  byLora: Record<LoRAId, ClinicianLlmInstructionsState>,
  options: { singleLoraId: LoRAId | null },
): string {
  if (seeds.length === 0 && options.singleLoraId) {
    const { text, updatedAt } = instructionsForLora(
      byLora,
      options.singleLoraId,
    );
    if (text !== "") {
      return `${JSON.stringify({
        _wave_export: "no_seeds",
        loraId: options.singleLoraId,
        clinicianLlmInstructions: text,
        clinicianLlmInstructionsUpdatedAt: updatedAt,
      })}\n`;
    }
  }

  const lines = seeds.map((seed) => {
    const { text, updatedAt } = instructionsForLora(byLora, seed.loraId);
    const instrBlock =
      text !== "" ?
        {
          clinicianLlmInstructions: text,
          clinicianLlmInstructionsUpdatedAt: updatedAt,
        }
      : {};
    return JSON.stringify({
      ...instrBlock,
      loraId: seed.loraId,
      loraTitle: getSpec(seed.loraId).title,
      id: seed.id,
      status: seed.status,
      authorInitials: seed.authorInitials,
      notes: seed.notes,
      input: seed.input,
      output: seed.output,
      createdAt: seed.createdAt,
      updatedAt: seed.updatedAt,
    });
  });
  return `${lines.join("\n")}\n`;
}

function toCsv(
  seeds: readonly TrainingSeed[],
  byLora: Record<LoRAId, ClinicianLlmInstructionsState>,
): string {
  const header = [
    "id",
    "lora_id",
    "input_json",
    "output_json",
    "author_initials",
    "notes",
    "status",
    "created_at",
    "updated_at",
    "clinician_llm_instructions",
    "clinician_llm_instructions_updated_at",
  ].join(",");
  const rows = seeds.map((seed) => {
    const { text, updatedAt } = instructionsForLora(byLora, seed.loraId);
    return [
      csvEscape(seed.id),
      csvEscape(seed.loraId),
      csvEscape(seed.input),
      csvEscape(seed.output),
      csvEscape(seed.authorInitials),
      csvEscape(seed.notes),
      csvEscape(seed.status),
      csvEscape(seed.createdAt),
      csvEscape(seed.updatedAt),
      csvEscape(text || null),
      csvEscape(updatedAt),
    ].join(",");
  });
  return `${[header, ...rows].join("\n")}\n`;
}

export async function GET(request: Request) {
  assertTrainingEnabled();
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "jsonl").toLowerCase();
  const loraIdParam = url.searchParams.get("loraId");
  const includeDrafts = url.searchParams.get("includeDrafts") === "1";
  const combinedJsonl =
    !loraIdParam && (format === "jsonl" || format === "clinician-jsonl");

  let seeds: TrainingSeed[];
  if (loraIdParam) {
    if (!isLoraId(loraIdParam)) {
      return NextResponse.json({ error: "unknown_lora_id" }, { status: 400 });
    }
    seeds = await listSeedsForLora(loraIdParam);
  } else {
    seeds = await listAllSeeds();
  }

  if (!includeDrafts) {
    seeds = seeds.filter((seed) => seed.status !== "draft");
  }

  const byLora = await getAllClinicianLlmInstructions();

  if (format === "csv") {
    const body = toCsv(seeds, byLora);
    const filename = loraIdParam
      ? `wave-${loraIdParam}-seeds.csv`
      : "wave-training-seeds.csv";
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (format === "clinician-jsonl") {
    const body = toClinicianJsonl(seeds, byLora, {
      singleLoraId:
        loraIdParam !== null && isLoraId(loraIdParam) ? loraIdParam : null,
    });
    const filename = combinedJsonl
      ? "wave-clinician-seeds.jsonl"
      : `${loraIdParam}-clinician.jsonl`;
    return new Response(body, {
      headers: {
        "Content-Type": "application/jsonl; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (format !== "jsonl") {
    return NextResponse.json(
      {
        error: "unsupported_format",
        supported: ["jsonl", "clinician-jsonl", "csv"],
      },
      { status: 400 },
    );
  }

  const body = toJsonl(seeds, { combined: combinedJsonl }, byLora);
  const filename = combinedJsonl ? `${DEMO_LORA_ID}.jsonl` : `${loraIdParam}.jsonl`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/jsonl; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
