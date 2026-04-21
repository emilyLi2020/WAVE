/**
 * /api/training/export — download seeds as JSONL or CSV.
 *
 * - format=jsonl + loraId=<id> emits one Unsloth ShareGPT-style record
 *   per row, ready to feed to TRL's SFTTrainer with the `gemma-4` chat
 *   template (see docs/model-training.md §6 and Unsloth's Gemma 4 guide).
 * - format=csv emits a flat dump of every seed across every LoRA. Useful
 *   for ad-hoc inspection in a spreadsheet.
 *
 * By default only seeds with status >= ready are exported, so half-
 * finished drafts never sneak into a training run. Pass `includeDrafts=1`
 * to override.
 */

import { NextResponse } from "next/server";

import { assertTrainingEnabled } from "@/lib/training/guard";
import { isLoraId } from "@/lib/training/lora-specs";
import { listAllSeeds, listSeedsForLora } from "@/lib/training/storage";
import type { TrainingSeed } from "@/lib/training/types";

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

function toJsonl(seeds: readonly TrainingSeed[]): string {
  const lines: string[] = [];
  for (const seed of seeds) {
    const messages = [
      { role: "user", content: JSON.stringify(seed.input) },
      { role: "assistant", content: JSON.stringify(seed.output) },
    ];
    lines.push(JSON.stringify({ messages }));
  }
  return `${lines.join("\n")}\n`;
}

function toCsv(seeds: readonly TrainingSeed[]): string {
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
  ].join(",");
  const rows = seeds.map((seed) =>
    [
      csvEscape(seed.id),
      csvEscape(seed.loraId),
      csvEscape(seed.input),
      csvEscape(seed.output),
      csvEscape(seed.authorInitials),
      csvEscape(seed.notes),
      csvEscape(seed.status),
      csvEscape(seed.createdAt),
      csvEscape(seed.updatedAt),
    ].join(","),
  );
  return `${[header, ...rows].join("\n")}\n`;
}

export async function GET(request: Request) {
  assertTrainingEnabled();
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "jsonl").toLowerCase();
  const loraIdParam = url.searchParams.get("loraId");
  const includeDrafts = url.searchParams.get("includeDrafts") === "1";

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

  if (format === "csv") {
    const body = toCsv(seeds);
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

  if (format !== "jsonl") {
    return NextResponse.json(
      { error: "unsupported_format", supported: ["jsonl", "csv"] },
      { status: 400 },
    );
  }

  if (!loraIdParam) {
    return NextResponse.json(
      {
        error: "loraId_required_for_jsonl",
        message:
          "JSONL export is per-LoRA so each file matches one Unsloth training run. Use ?format=csv for an all-LoRAs dump.",
      },
      { status: 400 },
    );
  }

  const body = toJsonl(seeds);
  return new Response(body, {
    headers: {
      "Content-Type": "application/jsonl; charset=utf-8",
      "Content-Disposition": `attachment; filename="${loraIdParam}.jsonl"`,
      "Cache-Control": "no-store",
    },
  });
}
