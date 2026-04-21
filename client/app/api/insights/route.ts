/**
 * /api/insights — TEMPORARY scaffolding for the insights regenerate flow.
 *
 * The /insights page renders four static "Gemma-on-device" cards as
 * its default state. The Regenerate button on that page POSTs the
 * patient's session log to this route, which calls OpenAI gpt-5-mini
 * server-side with `reasoning: { effort: "medium" }` and returns 3-5
 * fresh cards conforming to `insightsPayloadSchema`.
 *
 * This is a sibling of `/api/narrate` and follows the same
 * deletion plan: when the on-device Gemma + LoRA stack lands, the
 * regenerate path will move to `client/lib/gemma/session.ts` and this
 * route, the `openai` dep, and the `OPENAI_API_KEY` env var go away.
 *
 * Security:
 *   - `OPENAI_API_KEY` is read only from `process.env` (server-side).
 *   - This route never logs the patient's session log or the model
 *     output. PHI-adjacent payloads must not leave the request
 *     lifetime.
 */

import { NextResponse } from "next/server";
import OpenAI from "openai";

import { buildInsightsPrompt } from "@/lib/prompts/insights";
import {
  INSIGHTS_JSON_SCHEMA_NAME,
  insightsJsonSchema,
  insightsPayloadSchema,
  insightsRequestSchema,
} from "@/lib/prompts/schemas";
import type { Session } from "@/types/models";

export const runtime = "nodejs";

const MODEL = "gpt-5-mini";

let cachedClient: OpenAI | null = null;
function getClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Copy client/.env.local.example to client/.env.local and fill it in. This is temporary scaffolding; see docs/gemma-capabilities.md.",
    );
  }
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = insightsRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { systemPrompt, userPrompt } = buildInsightsPrompt(
    parsed.data.sessions as Session[],
  );

  let client: OpenAI;
  try {
    client = getClient();
  } catch (err) {
    return NextResponse.json(
      { error: "openai_not_configured", message: (err as Error).message },
      { status: 500 },
    );
  }

  try {
    const response = await client.responses.create({
      model: MODEL,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      text: {
        format: {
          type: "json_schema",
          name: INSIGHTS_JSON_SCHEMA_NAME,
          strict: true,
          schema: insightsJsonSchema,
        },
      },
      // Insights regeneration synthesizes patterns across the whole
      // session log, so we run at `medium` reasoning effort — the same
      // tier the reflection JSON phase uses in /api/narrate.
      reasoning: { effort: "medium" as const },
    });

    const text = response.output_text;
    if (!text) {
      return NextResponse.json(
        { error: "model_returned_empty" },
        { status: 502 },
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "model_returned_invalid_json" },
        { status: 502 },
      );
    }

    const validated = insightsPayloadSchema.safeParse(payload);
    if (!validated.success) {
      return NextResponse.json(
        { error: "model_failed_schema", issues: validated.error.issues },
        { status: 502 },
      );
    }

    return NextResponse.json(validated.data);
  } catch (err) {
    return NextResponse.json(
      { error: "openai_call_failed", message: (err as Error).message },
      { status: 502 },
    );
  }
}
