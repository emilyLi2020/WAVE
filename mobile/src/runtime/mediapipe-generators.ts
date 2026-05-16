// MediaPipe LLM Inference (Google MediaPipeTasksGenAI iOS SDK) backed
// implementations of the four generator functions the lib/gemma wrappers
// consume. Same shapes as wllama-generators / litert-generators, so
// swapping is a one-line import change downstream.
//
// Why this exists alongside litert-generators.ts: the react-native-litert-lm
// wrapper (which targets LiteRT-LM directly) is stuck on a stale C++ runtime
// that can't load Gemma 4 bundles built with current tooling. MediaPipe LLM
// Inference sits on top of LiteRT and accepts the MediaPipe-Model-Maker
// flavored .litertlm bundle we already have on HF. Both runtimes satisfy
// the "uses LiteRT" prize requirement; this one actually loads.
//
// Strategy notes (largely carried from litert-generators):
//   - No engine-level JSON-schema enforcement. We rely on the existing
//     <output_contract> prompt blocks + extractFirstJsonObject + Zod at
//     the call site.
//   - The Swift wrapper (LlmInferenceModel.swift) hardcodes a Gemma chat
//     template wrap around our prompt:
//       <start_of_turn>user\n{prompt}<end_of_turn><start_of_turn>model
//     Our WAVE prompts are plain prose, so the wrap should be benign for
//     Gemma 4 fine-tunes (which were trained with this template). If output
//     quality degrades, the wrapper would need to be forked to expose a
//     "raw prompt" mode.
//   - MediaPipe LLM Inference sessions are stateless: each generateResponse
//     call starts a fresh context. No resetConversation() needed (compared
//     with litert-generators) — already idempotent per call.
//   - generateResponseAsync streams tokens via onPartialResponse events,
//     each carrying a DELTA (the Swift code does `fullResponse += part`).
//   - Check-in's onDelta semantics mirror litert/wllama: fire ONCE at stream
//     end with the sanitized reply. Streaming raw JSON-in-progress to the
//     voice loop would leak `{"reply": "...` fragments into the sentence
//     buffer.

import ExpoLlmMediapipe, {
  generateStreamingText,
} from "expo-llm-mediapipe";
import type {
  PartialResponseEventPayload,
} from "expo-llm-mediapipe";

import { ensureModel } from "@/runtime/model-cache";
import { buildCheckInPrompt } from "@/lib/prompts/check-in";
import { buildChunkPrompt } from "@/lib/prompts/chunk-generator";
import { buildInsightsPrompt } from "@/lib/prompts/insights";
import { buildReflectionPrompt } from "@/lib/prompts/reflection";
import type {
  CheckInContextPayload,
  ChunkGenerationContextPayload,
  ReflectionContext,
} from "@/lib/prompts/schemas";
import type {
  CheckInChatTurnPayload,
  EndConversationSignal,
} from "@/lib/gemma/checkin";
import type { ObstacleCategory } from "@/types/session";
import type { Session } from "@/types/models";

interface GenerateOptions {
  maxNewTokens: number;
  signal?: AbortSignal;
  onDelta?: (accumulated: string) => void;
}

export interface LocalChunkResult {
  text: string;
}

export interface LocalCheckInResult {
  text: string;
  endConversation: EndConversationSignal | null;
}

const CHECK_IN_TOOL_NONE_OBSTACLE = "none" as const;
const ALLOWED_OBSTACLES: readonly ObstacleCategory[] = [
  "cannot_visualize",
  "mind_wandering",
  "urge_overwhelming",
  "breath_tight",
  "breath_anxiety",
  "gave_in",
  "guilt_failure",
  "physical_discomfort",
  "sleepiness",
];
const CHECK_IN_TOOL_OBSTACLES = [
  CHECK_IN_TOOL_NONE_OBSTACLE,
  ...ALLOWED_OBSTACLES,
] as const;

// ────────────────────────────────────────────────────────────────────────
// Singleton model lifecycle
// ────────────────────────────────────────────────────────────────────────

// Module-level singleton: the handle is allocated by the native module on
// loadModel() and freed by releaseModel(). Mirrors the pattern in
// litert-generators.ts (llmPromise) but here the resolved value is a numeric
// handle, not an instance object.
let modelHandlePromise: Promise<number> | null = null;

export type LoadProgressCallback = (progressPct: number) => void;

interface LoadOptions {
  onProgress?: LoadProgressCallback;
  maxTokens?: number;
  topK?: number;
  temperature?: number;
  randomSeed?: number;
}

export function preloadWaveMediaPipe(
  opts?: LoadOptions,
): Promise<number> {
  if (!modelHandlePromise) {
    modelHandlePromise = (async () => {
      const fileUri = await ensureModel("mediapipe-wave", {
        onProgress: opts?.onProgress,
      });
      // MediaPipeTasksGenAI's LlmInference.Options(modelPath:) takes a raw
      // POSIX path. expo-file-system returns paths with the file:// scheme;
      // strip it (same lesson as litert-generators preloadWaveLiteRT —
      // commit 2b6fdc6).
      const nativePath = fileUri.replace(/^file:\/\//, "");
      const handle = await ExpoLlmMediapipe.createModel(
        nativePath,
        opts?.maxTokens ?? 512,
        opts?.topK ?? 1,
        opts?.temperature ?? 0,
        opts?.randomSeed ?? 0,
      );
      return handle;
    })();
  }
  return modelHandlePromise;
}

export async function unloadWaveMediaPipe(): Promise<void> {
  if (!modelHandlePromise) return;
  try {
    const handle = await modelHandlePromise;
    await ExpoLlmMediapipe.releaseModel(handle);
  } finally {
    modelHandlePromise = null;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Generation primitive
// ────────────────────────────────────────────────────────────────────────

function streamOnce(
  handle: number,
  prompt: string,
  options: GenerateOptions,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let accumulated = "";
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    generateStreamingText(
      handle,
      prompt,
      (delta: string) => {
        if (settled) return;
        if (options.signal?.aborted) {
          settle(() => reject(new DOMException("Aborted", "AbortError")));
          return;
        }
        accumulated += delta;
        options.onDelta?.(accumulated);
      },
      (errMsg: string) => {
        settle(() => reject(new Error(errMsg)));
      },
      options.signal,
    )
      .then(() => settle(() => resolve(accumulated)))
      .catch((err) =>
        settle(() => reject(err instanceof Error ? err : new Error(String(err)))),
      );
  });
}

// ────────────────────────────────────────────────────────────────────────
// Chunk narration
// ────────────────────────────────────────────────────────────────────────

export async function generateWllamaChunk(
  context: ChunkGenerationContextPayload,
  options: GenerateOptions,
): Promise<LocalChunkResult> {
  throwIfAborted(options.signal);
  const handle = await preloadWaveMediaPipe();
  throwIfAborted(options.signal);

  const prompt = buildChunkPrompt(context);
  const combined = `${prompt.systemPrompt}\n\n${prompt.userPrompt}`;

  const raw = await streamOnce(handle, combined, options);
  throwIfAborted(options.signal);
  return { text: extractFirstJsonObject(raw) };
}

// ────────────────────────────────────────────────────────────────────────
// Reflection (final structured card after check-in 5)
// ────────────────────────────────────────────────────────────────────────

export async function generateWllamaReflection(
  input: ReflectionContext,
  options: GenerateOptions,
): Promise<LocalChunkResult> {
  throwIfAborted(options.signal);
  const handle = await preloadWaveMediaPipe();
  throwIfAborted(options.signal);

  const prompt = buildReflectionPrompt(input);
  const combined = `${prompt.systemPrompt}\n\n${prompt.userPrompt}`;

  const raw = await streamOnce(handle, combined, options);
  throwIfAborted(options.signal);
  return { text: extractFirstJsonObject(raw) };
}

// ────────────────────────────────────────────────────────────────────────
// Insights (cross-session patterns card, /insights page)
// ────────────────────────────────────────────────────────────────────────

export async function generateWllamaInsights(
  sessions: readonly Session[],
  options: GenerateOptions,
): Promise<LocalChunkResult> {
  throwIfAborted(options.signal);
  const handle = await preloadWaveMediaPipe();
  throwIfAborted(options.signal);

  const prompt = buildInsightsPrompt([...sessions]);
  const combined = `${prompt.systemPrompt}\n\n${prompt.userPrompt}`;

  const raw = await streamOnce(handle, combined, options);
  throwIfAborted(options.signal);
  return { text: extractFirstJsonObject(raw) };
}

// ────────────────────────────────────────────────────────────────────────
// Multi-turn check-in
// ────────────────────────────────────────────────────────────────────────

export async function generateWllamaCheckIn(
  history: readonly CheckInChatTurnPayload[],
  context: CheckInContextPayload,
  options: GenerateOptions,
): Promise<LocalCheckInResult> {
  throwIfAborted(options.signal);
  const handle = await preloadWaveMediaPipe();
  throwIfAborted(options.signal);

  const agentTurnsInHistory = history.filter((t) => t.role === "agent").length;
  const { systemPrompt, contextBlock } = buildCheckInPrompt(context, {
    agentTurnsInHistory,
  });

  const composedSystem = `${systemPrompt}

<output_contract>
Respond with a JSON object matching this exact schema:

{
  "reply": "<patient-facing prose, 1-3 short sentences>",
  "endConversation": null | { "cravingScore": <integer 1-10>, "obstacleCategory": "<one of: ${CHECK_IN_TOOL_OBSTACLES.join(", ")}>" }
}

Rules:
- "reply" is the visible patient-facing text the speaker will hear. Plain prose, no markdown, no lists.
- "endConversation" is null UNLESS this check-in is complete and the patient is ready to continue.
- When ending, "obstacleCategory" is "${CHECK_IN_TOOL_NONE_OBSTACLE}" when no clear obstacle is present.
- Emit nothing outside the JSON object — no preamble, no analysis, no extra keys.
</output_contract>`;

  const historyText = history
    .map((t) => `${t.role === "agent" ? "WAVE" : "Patient"}: ${t.content}`)
    .join("\n");

  const combined = `${composedSystem}

${contextBlock}

${historyText}

WAVE:`;

  const raw = await streamOnce(handle, combined, {
    ...options,
    // Suppress incremental delta during check-in: mid-stream JSON chars are
    // useless to the voice-loop caller. Final-fire semantic only.
    onDelta: undefined,
  });
  throwIfAborted(options.signal);

  const parsed = parseCheckInJson(raw);
  const replyText = sanitizeCheckInModelText(parsed.reply);
  options.onDelta?.(replyText);

  const endConversation = normalizeEndConversation(parsed.endConversation);
  return { text: replyText, endConversation };
}

// ────────────────────────────────────────────────────────────────────────
// helpers (verbatim port from litert-generators.ts / wllama-generators.ts)
// ────────────────────────────────────────────────────────────────────────

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

export function extractFirstJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return text.trim();
  return text.slice(start, end + 1);
}

interface CheckInJsonOutput {
  reply: string;
  endConversation: {
    cravingScore: number;
    obstacleCategory: string;
  } | null;
}

export function parseCheckInJson(raw: string): CheckInJsonOutput {
  const candidate = extractFirstJsonObject(raw);
  try {
    const parsed = JSON.parse(candidate) as Partial<CheckInJsonOutput>;
    const reply = typeof parsed.reply === "string" ? parsed.reply : "";
    const endConversation =
      parsed.endConversation &&
      typeof parsed.endConversation === "object" &&
      "cravingScore" in parsed.endConversation
        ? parsed.endConversation
        : null;
    return { reply, endConversation };
  } catch {
    return { reply: raw.trim(), endConversation: null };
  }
}

export function normalizeEndConversation(
  signal: CheckInJsonOutput["endConversation"],
): EndConversationSignal | null {
  if (!signal) return null;
  const score = Math.round(signal.cravingScore);
  if (!Number.isFinite(score) || score < 1 || score > 10) return null;
  const obstacle = signal.obstacleCategory;
  if (obstacle === CHECK_IN_TOOL_NONE_OBSTACLE) {
    return { cravingScore: score, obstacleCategory: null };
  }
  if (ALLOWED_OBSTACLES.includes(obstacle as ObstacleCategory)) {
    return {
      cravingScore: score,
      obstacleCategory: obstacle as ObstacleCategory,
    };
  }
  return { cravingScore: score, obstacleCategory: null };
}

function sanitizeCheckInModelText(text: string): string {
  return text
    .replace(/\]\s*\[/g, " ")
    .replace(/[\[\]]/g, "")
    .replace(/[–—]/g, ",")
    .replace(/\s+([,.;:?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
