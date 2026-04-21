/**
 * /api/narrate/reflection — TEMPORARY scaffolding (reflection only).
 *
 * Sibling of /api/narrate. Reflection is the only JSON phase that runs
 * with `reasoning.effort: "medium"`, which can take 5-10s on
 * gpt-5-mini. Instead of leaving the patient staring at a static
 * "loading…" card, this route also asks for `reasoning.summary: "auto"`
 * and relays the model's reasoning-summary section titles as Server-Sent
 * Events so the UI can show an animated checklist of what the model is
 * thinking through. The final structured payload is delivered as a
 * single `event: payload` frame at the end of the stream.
 *
 * Wire format (SSE):
 *   event: title
 *   data: {"index": <number>, "text": "<bold heading from summary part>"}
 *
 *   event: payload
 *   data: <validated reflection JSON>
 *
 *   event: done
 *   data: {}
 *
 *   event: error
 *   data: {"message": "..."}
 *
 * Title extraction: each reasoning summary part starts with a bold
 * markdown heading like `**Reading the situation card**`. We buffer
 * delta text per `summary_index`, run a small regex, and emit one
 * `title` event per part as soon as the heading is parsable. If a
 * summary part finishes without a parsable heading we fall back to a
 * truncated first sentence of the completed text.
 *
 * Reasoning summaries require organisation verification on
 * gpt-5-family models (per the Reasoning guide). If the org isn't
 * verified, the upstream stream simply emits no
 * `response.reasoning_summary_*` events and this route returns only
 * the final `payload` frame; the client UI degrades to its
 * "Thinking through your session…" muted line.
 *
 * Deletion plan:
 *   - When the in-browser Gemma + LoRA stack ships, delete this whole
 *     route alongside /api/narrate, /api/narrate/stream, the `openai`
 *     dep, and OPENAI_API_KEY. The client boundary
 *     `generateReflection()` keeps its onTitle shape so the UI never
 *     changes; Gemma will emit synthetic milestones instead of model
 *     summary titles.
 */

import { NextResponse } from "next/server";
import OpenAI from "openai";

import { buildReflectionPrompt } from "@/lib/prompts/reflection";
import {
  PHASE_SCHEMAS,
  narrateReflectionStreamRequestSchema,
} from "@/lib/prompts/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const TITLE_MIN = 2;
const TITLE_MAX = 80;

/**
 * Pulls "Reading the situation" out of
 * "**Reading the situation**\n\nThe patient…". Returns null until the
 * closing `**` has been streamed, so we never emit a half-typed title.
 */
function extractTitle(buffer: string): string | null {
  const re = new RegExp(`^\\s*\\*\\*([^*\\n]{${TITLE_MIN},${TITLE_MAX}})\\*\\*`);
  const m = re.exec(buffer);
  return m ? m[1].trim() : null;
}

/**
 * Last-resort title when a summary part finishes without a bold
 * heading. Take the first sentence of the completed text and cap to a
 * few words so the checklist row stays scannable.
 */
function extractTitleFromDone(text: string): string | null {
  const stripped = text.replace(/[*_`#>]/g, "").trim();
  if (!stripped) return null;
  const firstSentence = stripped.split(/(?<=[.!?])\s/)[0] ?? stripped;
  const words = firstSentence.split(/\s+/).slice(0, 6).join(" ");
  const trimmed = words.replace(/[.,;:!?]+$/, "").trim();
  if (trimmed.length < TITLE_MIN) return null;
  return trimmed.length > TITLE_MAX
    ? `${trimmed.slice(0, TITLE_MAX - 1).trimEnd()}…`
    : trimmed;
}

interface SummaryPartState {
  buffer: string;
  emitted: boolean;
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = narrateReflectionStreamRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const req = parsed.data;
  const schemaSpec = PHASE_SCHEMAS.reflection;
  const { systemPrompt, userPrompt } = buildReflectionPrompt(req.input);

  let client: OpenAI;
  try {
    client = getClient();
  } catch (err) {
    return NextResponse.json(
      { error: "openai_not_configured", message: (err as Error).message },
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();
  const upstreamAbort = new AbortController();

  const onClientAbort = () => upstreamAbort.abort();
  request.signal.addEventListener("abort", onClientAbort, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const parts = new Map<number, SummaryPartState>();
      let aggregatedText = "";
      let payloadEmitted = false;

      const emitTitle = (index: number, text: string) => {
        controller.enqueue(
          encoder.encode(sseFrame("title", { index, text })),
        );
      };

      try {
        const events = await client.responses.create(
          {
            model: MODEL,
            input: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            text: {
              format: {
                type: "json_schema",
                name: schemaSpec.jsonSchemaName,
                strict: true,
                schema: schemaSpec.jsonSchema,
              },
            },
            // Reflection is the synthesis moment of the session — a
            // medium reasoning budget produces a noticeably more
            // grounded insight than the default. Streaming + summary:auto
            // turn that latency into a progress indicator instead of
            // dead air. See AGENTS.md > LLM Calls.
            reasoning: {
              effort: "medium" as const,
              summary: "auto" as const,
            },
            stream: true,
          },
          { signal: upstreamAbort.signal },
        );

        for await (const event of events) {
          // Reasoning summary streaming. We extract a single bold
          // heading per `summary_index` and emit it once.
          if (event.type === "response.reasoning_summary_part.added") {
            const idx = event.summary_index;
            if (!parts.has(idx)) {
              parts.set(idx, { buffer: "", emitted: false });
            }
          } else if (event.type === "response.reasoning_summary_text.delta") {
            const idx = event.summary_index;
            const state = parts.get(idx) ?? { buffer: "", emitted: false };
            state.buffer += event.delta;
            if (!state.emitted) {
              const title = extractTitle(state.buffer);
              if (title) {
                state.emitted = true;
                emitTitle(idx, title);
              }
            }
            parts.set(idx, state);
          } else if (event.type === "response.reasoning_summary_text.done") {
            const idx = event.summary_index;
            const state = parts.get(idx);
            if (state && !state.emitted) {
              const title =
                extractTitle(event.text) ?? extractTitleFromDone(event.text);
              if (title) {
                state.emitted = true;
                emitTitle(idx, title);
              }
            }
          } else if (event.type === "response.output_text.delta") {
            // Structured-output JSON streams into output_text too. We
            // don't surface the partial JSON to the client — only the
            // final validated payload — but we accumulate so we have a
            // fallback if `response.output_text.done` doesn't fire.
            aggregatedText += event.delta;
          } else if (event.type === "response.output_text.done") {
            aggregatedText = event.text ?? aggregatedText;
          } else if (event.type === "response.completed") {
            const text = aggregatedText;
            if (!text) {
              controller.enqueue(
                encoder.encode(
                  sseFrame("error", { message: "model_returned_empty" }),
                ),
              );
              break;
            }
            let parsedJson: unknown;
            try {
              parsedJson = JSON.parse(text);
            } catch {
              controller.enqueue(
                encoder.encode(
                  sseFrame("error", {
                    message: "model_returned_invalid_json",
                  }),
                ),
              );
              break;
            }
            const validated = schemaSpec.zod.safeParse(parsedJson);
            if (!validated.success) {
              controller.enqueue(
                encoder.encode(
                  sseFrame("error", { message: "model_failed_schema" }),
                ),
              );
              break;
            }
            controller.enqueue(
              encoder.encode(sseFrame("payload", validated.data)),
            );
            controller.enqueue(encoder.encode(sseFrame("done", {})));
            payloadEmitted = true;
            break;
          } else if (
            event.type === "response.failed" ||
            event.type === "response.incomplete"
          ) {
            controller.enqueue(
              encoder.encode(
                sseFrame("error", {
                  message: `upstream_${event.type.replace("response.", "")}`,
                }),
              ),
            );
            break;
          }
        }

        if (!payloadEmitted) {
          // Stream ended without `response.completed`. Surface as an
          // error so the client retries / falls back rather than
          // silently hanging.
          controller.enqueue(
            encoder.encode(
              sseFrame("error", { message: "stream_ended_without_payload" }),
            ),
          );
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          // Patient went away mid-reflection. Drop quietly.
        } else {
          controller.enqueue(
            encoder.encode(
              sseFrame("error", { message: (err as Error).message }),
            ),
          );
        }
      } finally {
        request.signal.removeEventListener("abort", onClientAbort);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
    cancel() {
      upstreamAbort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
