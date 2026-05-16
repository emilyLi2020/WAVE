// LiteRT-LM-backed implementations of the four generator functions the
// lib/gemma wrappers consume. Same shapes as
// client/lib/gemma/wllama-generators.ts so swapping is a one-line import
// change downstream.
//
// Strategy notes for the LiteRT port:
//   - The wrapper's LLMConfig has no response_format / grammar option, unlike
//     llama.cpp's wllama. We rely on the existing <output_contract> prompt
//     blocks + extractFirstJsonObject + Zod at the call site instead of
//     engine-enforced JSON schema.
//   - The wrapper's chat surface (sendMessage / sendMessageAsync) treats the
//     system prompt as load-time config and per-call messages as user-only.
//     Each WAVE flow has its own composed system prompt (WAVE_SYSTEM_PROMPT
//     + flow-specific additions), so we load with NO system prompt and pass
//     the full composed prompt as one user message after resetConversation().
//     If output quality on the fine-tune degrades vs. wllama, fall back to
//     either (a) loading the model once per flow with that flow's system
//     prompt, or (b) using applyGemmaTemplate to bypass the wrapper's chat
//     template entirely.
//   - sendMessageAsync has no AbortSignal. Aborting from JS stops accumulation
//     but the native generator keeps running until done. For barge-in (step 5c)
//     we'll either close() and reload, or upstream a cancel PR.

import { createLLM } from "react-native-litert-lm";
import type { LiteRTLMInstance } from "react-native-litert-lm";

import { buildChunkPrompt } from "@/prompts/chunk-generator";
import type { ChunkGenerationContextPayload } from "@/prompts/schemas";
import type {
  CheckInChatTurnPayload,
  GenerateOptions,
  LocalChunkResult,
  LocalCheckInResult,
} from "./types";

// HF Hub path for the fine-tuned LITERTLM bundle. Verified on HF at this exact
// URL (5,071,689,680 bytes); the wrapper auto-caches into iOS sandbox
// Library/Caches/litert_models/ after first download.
export const WAVE_LITERT_URL =
  "https://huggingface.co/Maelstrome/lora-wave-session-r32/resolve/main/mediapipe/model.litertlm";

let llmPromise: Promise<LiteRTLMInstance> | null = null;

export type LoadProgressCallback = (progressPct: number) => void;

interface LoadOptions {
  onProgress?: LoadProgressCallback;
  /** Override the default GPU backend (e.g. 'cpu' if GPU fails on a device). */
  backend?: "gpu" | "cpu" | "npu";
}

/**
 * Singleton load. Subsequent calls return the same instance; first call
 * triggers download + load with the wrapper's built-in caching to iOS
 * Library/Caches/litert_models/.
 */
export function preloadWaveLiteRT(
  opts?: LoadOptions,
): Promise<LiteRTLMInstance> {
  if (!llmPromise) {
    llmPromise = (async () => {
      const llm = createLLM({ enableMemoryTracking: true });
      await llm.loadModel(
        WAVE_LITERT_URL,
        {
          // No systemPrompt here; we pass per-flow composed prompts as user
          // messages after resetConversation(). See file header for rationale.
          backend: opts?.backend ?? "gpu",
          maxTokens: 512,
          temperature: 0,
          topK: 1,
        },
        opts?.onProgress,
      );
      return llm;
    })();
  }
  return llmPromise;
}

export async function unloadWaveLiteRT(): Promise<void> {
  if (!llmPromise) return;
  try {
    const llm = await llmPromise;
    llm.close();
  } finally {
    llmPromise = null;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Helpers (ported verbatim from wllama-generators.ts)
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

/**
 * Stream a one-shot generation. Resets the wrapper's conversation before
 * starting so single-shot flows (chunk/reflection/insights) don't accumulate
 * KV state across calls. Multi-turn flows (check-in) bypass this and manage
 * their own history.
 */
function streamOnce(
  llm: LiteRTLMInstance,
  prompt: string,
  options: GenerateOptions,
): Promise<string> {
  llm.resetConversation();
  return new Promise<string>((resolve, reject) => {
    let accumulated = "";
    let resolved = false;
    try {
      llm.sendMessageAsync(prompt, (token, done) => {
        if (resolved) return;
        if (options.signal?.aborted) {
          resolved = true;
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        accumulated += token;
        options.onDelta?.(accumulated);
        if (done) {
          resolved = true;
          resolve(accumulated);
        }
      });
    } catch (err) {
      reject(err as Error);
    }
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
  const llm = await preloadWaveLiteRT();
  throwIfAborted(options.signal);

  const prompt = buildChunkPrompt(context);
  const combined = `${prompt.systemPrompt}\n\n${prompt.userPrompt}`;

  const raw = await streamOnce(llm, combined, options);
  throwIfAborted(options.signal);
  return { text: extractFirstJsonObject(raw) };
}

// ────────────────────────────────────────────────────────────────────────
// Stubs — implemented in step 3 (port prompts + generators + wrappers)
// ────────────────────────────────────────────────────────────────────────

export async function generateWllamaReflection(
  _input: unknown,
  _options: GenerateOptions,
): Promise<LocalChunkResult> {
  throw new Error("generateWllamaReflection: not implemented yet (step 3)");
}

export async function generateWllamaInsights(
  _sessions: readonly unknown[],
  _options: GenerateOptions,
): Promise<LocalChunkResult> {
  throw new Error("generateWllamaInsights: not implemented yet (step 3)");
}

export async function generateWllamaCheckIn(
  _history: readonly CheckInChatTurnPayload[],
  _context: unknown,
  _options: GenerateOptions,
): Promise<LocalCheckInResult> {
  throw new Error("generateWllamaCheckIn: not implemented yet (step 3)");
}
