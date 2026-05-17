/**
 * Wave#15 Phase 0 — adaptive, load-amortized LiteRT context-envelope probe.
 *
 * Replaces the O(n²) grid. Two facts drive the design:
 *  1. Model load (~2.6 GB) is the only expensive step. engineMaxTokens /
 *     outputMaxTokens / backend are load-time, but the *prompt* sent is
 *     free — so ONE loaded engine runs every surface × variant as cheap
 *     inner sends. The whole surface dimension is an inner loop, not
 *     reloads.
 *  2. The constraints are monotonic with known-ish ceilings, so we
 *     binary-search the ceiling instead of gridding it, seeded by what
 *     already passed on device (4096 / 512 on E2B/GPU/iPhone17Pro).
 *
 * Crash-resilience: every probe console.log's its result the instant it
 * completes (captured live by idevicesyslog), BEFORE the next load — so a
 * SIGSEGV on a risky >4096 outlier only loses the in-flight probe.
 *
 * To keep the system prompt out of the (load-time) LLMConfig so a single
 * load can A/B canonical vs compact, the surface's system text is folded
 * into the user message. Token counts stay truthful — we record the
 * engine's GenerationStats.promptTokens. Chat-template channel shift is an
 * accepted fidelity caveat for envelope mapping (see the plan doc).
 */

import { createLLM, type LiteRTLMInstance } from "react-native-litert-lm";

import { buildChunkPrompt } from "@/prompts/chunk-generator";
import { buildReflectionPrompt } from "@/prompts/reflection";
import type {
  ChunkGenerationContextPayload,
  ReflectionContext,
  SessionHistoryEntry,
} from "@/prompts/schemas";
import {
  WAVE_SYSTEM_PROMPT,
  WAVE_SYSTEM_PROMPT_STOCK_COMPACT,
} from "@/prompts/wave-system";

export type Backend = "gpu" | "cpu";
export type PromptVariant = "canonical" | "compact";
export type SurfaceId = "chunk1" | "chunk3" | "chunk5" | "reflection";

export interface Probe {
  surface: SurfaceId;
  variant: PromptVariant;
}

export type ProbeOutcome =
  | "ok"
  | "truncated"
  | "invalid_json"
  | "hang"
  | "empty"
  | "load_error"
  | "gen_error";

export interface ProbeResult {
  engineMaxTokens: number;
  outputMaxTokens: number;
  backend: Backend;
  surface: SurfaceId;
  variant: PromptVariant;
  outcome: ProbeOutcome;
  promptTokens: number | null;
  completionTokens: number | null;
  ttftMs: number | null;
  tokensPerSecond: number | null;
  residentBytes: number | null;
  isLowMemory: boolean | null;
  sample: string;
  error: string | null;
  wallMs: number;
}

const PROFILE: ChunkGenerationContextPayload["profile"] = {
  matType: "buprenorphine",
  medicationStatus: "on_time",
  trigger: "stress",
  triggerOther: null,
  usedSubstanceToday: false,
};

function priorChunk(n: 1 | 2 | 3 | 4 | 5): SessionHistoryEntry {
  return {
    kind: "chunk",
    chunkNumber: n,
    lines: [
      "Let your shoulders drop a little, and notice the weight of your body where it meets the chair.",
      "There is nothing to fix in this breath. Just let it arrive and leave on its own.",
      "If the urge is here, you do not have to push it away. You can let it sit beside you.",
      "Notice one place that feels even slightly more settled than a moment ago.",
      "You are not behind. You are exactly where this practice begins.",
      "When you are ready, let your attention widen back out to the room.",
    ],
  };
}

function historyUpTo(chunk: number): SessionHistoryEntry[] {
  const h: SessionHistoryEntry[] = [];
  for (let n = 1; n < chunk; n++) h.push(priorChunk(n as 1 | 2 | 3 | 4 | 5));
  return h;
}

const REFLECTION_CTX: ReflectionContext = {
  intakeIntensity: 7,
  matType: "buprenorphine",
  medicationStatus: "on_time",
  trigger: "stress",
  usedSubstanceToday: false,
  bodyLocation: "chest",
  currentIntensity: 4,
  endingIntensity: 3,
  durationSeconds: 600,
};

/** Returns one combined message (system text folded in) per surface×variant. */
export function buildMessage(p: Probe): string {
  if (p.surface === "reflection") {
    const r = buildReflectionPrompt(REFLECTION_CTX);
    return `${r.systemPrompt}\n\n${r.userPrompt}`;
  }
  const chunkNumber = (
    p.surface === "chunk1" ? 1 : p.surface === "chunk3" ? 3 : 5
  ) as 1 | 3 | 5;
  const ctx: ChunkGenerationContextPayload = {
    chunkNumber,
    intakeIntensity: 7,
    profile: PROFILE,
    sessionHistory: historyUpTo(chunkNumber),
  };
  const c = buildChunkPrompt(ctx);
  const sys =
    p.variant === "compact" && c.systemPrompt.includes(WAVE_SYSTEM_PROMPT)
      ? c.systemPrompt.replace(
          WAVE_SYSTEM_PROMPT,
          WAVE_SYSTEM_PROMPT_STOCK_COMPACT,
        )
      : c.systemPrompt;
  return `${sys}\n\n${c.userPrompt}`;
}

/** chunk5/canonical = the heaviest input; used to probe ceilings honestly. */
export const HEAVY_PROBE: Probe = { surface: "chunk5", variant: "canonical" };
/** A surface whose schema wants the most output, for the O-ceiling search. */
export const LONG_OUTPUT_PROBE: Probe = {
  surface: "chunk1",
  variant: "compact",
};

function classify(
  surface: SurfaceId,
  text: string,
  completion: number,
  outputMaxTokens: number,
): ProbeOutcome {
  if (!text) return "empty";
  const m = text.match(/\{[\s\S]*\}/);
  let valid = false;
  if (m) {
    try {
      const o = JSON.parse(m[0]);
      valid =
        surface === "reflection"
          ? typeof o.insight === "string" && !!o.nextSteps
          : Array.isArray(o.lines) && o.lines.length > 0;
    } catch {
      valid = false;
    }
  }
  if (valid) return completion >= outputMaxTokens ? "truncated" : "ok";
  return completion >= outputMaxTokens ? "truncated" : "invalid_json";
}

const blank = (
  cfg: { engineMaxTokens: number; outputMaxTokens: number; backend: Backend },
  p: Probe,
): Omit<ProbeResult, "outcome" | "wallMs"> => ({
  ...cfg,
  surface: p.surface,
  variant: p.variant,
  promptTokens: null,
  completionTokens: null,
  ttftMs: null,
  tokensPerSecond: null,
  residentBytes: null,
  isLowMemory: null,
  sample: "",
  error: null,
});

function emit(r: ProbeResult) {
  // Streamed live by idevicesyslog -m litert-sweep — crash-safe checkpoint.
  // eslint-disable-next-line no-console
  console.log("[litert-sweep]", JSON.stringify(r));
}

/**
 * Load ONE engine at (engineMaxTokens, outputMaxTokens, backend), then run
 * every probe as a cheap inner send (resetConversation between). One
 * expensive load amortized over many measurements. Each result is emitted
 * immediately. The engine is always torn down.
 */
export async function runConfig(
  modelPath: string,
  cfg: { engineMaxTokens: number; outputMaxTokens: number; backend: Backend },
  probes: Probe[],
  timeoutMs: number,
): Promise<ProbeResult[]> {
  const out: ProbeResult[] = [];
  let llm: LiteRTLMInstance | null = null;
  // A hung native sendMessage cannot be cancelled (the JS timeout fires
  // but the native thread stays stuck); calling close() on it crashes the
  // app. So once hung we leak the engine and bail — the process is dead
  // anyway, and every prior probe was already streamed.
  let hung = false;
  try {
    llm = createLLM({ enableMemoryTracking: true });
    try {
      await llm.loadModel(modelPath, {
        backend: cfg.backend,
        engineMaxTokens: cfg.engineMaxTokens,
        outputMaxTokens: cfg.outputMaxTokens,
        systemPrompt: "",
        temperature: 0,
        topK: 1,
      });
    } catch (e) {
      for (const p of probes) {
        const r: ProbeResult = {
          ...blank(cfg, p),
          outcome: "load_error",
          error: e instanceof Error ? e.message : String(e),
          wallMs: 0,
        };
        emit(r);
        out.push(r);
      }
      return out;
    }

    for (const p of probes) {
      const t0 = Date.now();
      try {
        llm.resetConversation();
      } catch {
        /* fresh conversation best-effort */
      }
      const msg = buildMessage(p);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<{ hang: true }>((res) => {
        timer = setTimeout(() => res({ hang: true }), timeoutMs);
      });
      const gen = llm
        .sendMessage(msg)
        .then((text) => ({ hang: false as const, text }));
      let race: { hang: true } | { hang: false; text: string };
      try {
        race = await Promise.race([gen, timeout]);
      } catch (e) {
        if (timer) clearTimeout(timer);
        const r: ProbeResult = {
          ...blank(cfg, p),
          outcome: "gen_error",
          error: e instanceof Error ? e.message : String(e),
          wallMs: Date.now() - t0,
        };
        emit(r);
        out.push(r);
        continue;
      }
      if (timer) clearTimeout(timer);

      if ("hang" in race && race.hang) {
        const r: ProbeResult = {
          ...blank(cfg, p),
          outcome: "hang",
          wallMs: Date.now() - t0,
        };
        emit(r);
        out.push(r);
        hung = true;
        // A wedged conversation poisons the engine — stop, don't close.
        break;
      }

      const text = (race as { text: string }).text ?? "";
      let st: Partial<{
        promptTokens: number;
        completionTokens: number;
        timeToFirstToken: number;
        tokensPerSecond: number;
      }> = {};
      let mem: Partial<{ residentBytes: number; isLowMemory: boolean }> = {};
      try {
        st = llm.getStats() as typeof st;
      } catch {
        /* best-effort */
      }
      try {
        mem = llm.getMemoryUsage() as typeof mem;
      } catch {
        /* best-effort */
      }
      const completion = st.completionTokens ?? 0;
      const r: ProbeResult = {
        ...blank(cfg, p),
        outcome: classify(p.surface, text, completion, cfg.outputMaxTokens),
        promptTokens: st.promptTokens ?? null,
        completionTokens: st.completionTokens ?? null,
        ttftMs: st.timeToFirstToken ?? null,
        tokensPerSecond: st.tokensPerSecond ?? null,
        residentBytes: mem.residentBytes ?? null,
        isLowMemory: mem.isLowMemory ?? null,
        sample: text.slice(0, 160),
        wallMs: Date.now() - t0,
      };
      emit(r);
      out.push(r);
    }
    return out;
  } finally {
    if (!hung) {
      try {
        llm?.close();
      } catch {
        /* torn down regardless */
      }
    }
  }
}

/**
 * Single-load, ASCENDING-input probe at the best known-safe config
 * (E=4096, O=512 — already shown on device to load & run chunk1; the
 * chunk1 data also showed output is naturally ~94 tok, so O is not the
 * constraint — input length is). One expensive load; every surface×variant
 * runs as a free inner send, ordered lightest→heaviest input so every
 * passing case is streamed BEFORE the one that hangs/crashes. The boundary
 * is wherever it flips ok→hang. A hang ends the pass (engine wedged) but
 * all prior results are already captured.
 *
 * This replaces the earlier ceiling-binary-search, which started with the
 * heaviest prompt and crashed the app before learning anything (the
 * observed `chunk5/canonical @4096 → hang` then SIGSEGV on close).
 * The >4096 ceiling question is handled separately by the one-shot
 * outlier probes in the screen.
 */
export const ASCENDING_PROBES: Probe[] = [
  { surface: "reflection", variant: "canonical" }, // smallest input (~700)
  { surface: "chunk1", variant: "compact" },
  { surface: "chunk1", variant: "canonical" },
  { surface: "chunk3", variant: "compact" },
  { surface: "chunk3", variant: "canonical" },
  { surface: "chunk5", variant: "compact" },
  { surface: "chunk5", variant: "canonical" }, // heaviest — the known hang
];

export async function runAdaptiveSafe(
  modelPath: string,
  timeoutMs: number,
  onResult: (r: ProbeResult) => void,
): Promise<{ eStar: number; oStar: number; results: ProbeResult[] }> {
  const all: ProbeResult[] = [];
  const sink = (rs: ProbeResult[]) => {
    for (const r of rs) {
      all.push(r);
      onResult(r);
    }
  };

  sink(
    await runConfig(
      modelPath,
      { engineMaxTokens: 4096, outputMaxTokens: 512, backend: "gpu" },
      ASCENDING_PROBES,
      timeoutMs,
    ),
  );

  // Only if nothing hung (engine still healthy) add a CPU sanity — backend
  // behaviour differs sharply (#6765 was CPU-only).
  if (!all.some((r) => r.outcome === "hang")) {
    sink(
      await runConfig(
        modelPath,
        { engineMaxTokens: 4096, outputMaxTokens: 512, backend: "cpu" },
        [{ surface: "chunk3", variant: "canonical" }],
        timeoutMs,
      ),
    );
  }

  return { eStar: 4096, oStar: 512, results: all };
}

/** Suggested upward outlier ladder for the manual >4096 probe control. */
export const OUTLIER_LADDER = [6144, 8192, 12288, 16384, 24576, 32768];
export const SWEEP_TIMEOUT_MS = 90_000;
