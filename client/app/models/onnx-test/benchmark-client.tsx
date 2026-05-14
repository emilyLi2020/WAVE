"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  pipeline,
  env,
  TextStreamer,
  type TextGenerationPipeline,
} from "@huggingface/transformers";
import {
  CreateMLCEngine,
  type MLCEngineInterface,
  type AppConfig,
  type InitProgressReport,
} from "@mlc-ai/web-llm";

// Runtime benchmark: same upstream Gemma 4 E2B IT, two browser runtimes.
// - ONNX: onnx-community/gemma-4-E2B-it-ONNX via @huggingface/transformers
// - MLC:  google/gemma-4-E2B-it via @mlc-ai/web-llm (mlc-google-it-export)
// Apples-to-apples runtime comparison — same model, same q4f16 quant.

type RuntimeKey = "onnx" | "mlc";

const RUNTIMES: Record<
  RuntimeKey,
  { label: string; subtitle: string; color: string; backend: string }
> = {
  onnx: {
    label: "ONNX · @huggingface/transformers",
    subtitle:
      "onnx-community/gemma-4-E2B-it-ONNX · onnxruntime-web · q4f16 · WebGPU",
    color: "#3b82f6",
    backend: "transformers.js v4 + onnxruntime-web",
  },
  mlc: {
    label: "MLC · @mlc-ai/web-llm",
    subtitle: "/mlc-google-it-export/ · google/gemma-4-E2B-it · q4f16_1 · WebGPU",
    color: "#10b981",
    backend: "web-llm (PR #3485 conv_template)",
  },
};

const ONNX_MODEL_ID = "onnx-community/gemma-4-E2B-it-ONNX";
const MLC_MODEL_ID = "google-gemma-4-E2B-it-q4f16_1";

const MLC_APP_CONFIG: AppConfig = {
  model_list: [
    {
      model:
        typeof window === "undefined"
          ? "/mlc-google-it-export/"
          : new URL("/mlc-google-it-export/", window.location.origin).toString(),
      model_id: MLC_MODEL_ID,
      model_lib:
        typeof window === "undefined"
          ? "/mlc-google-it-export/gemma-4-E2B-it-q4f16_1-webgpu.wasm"
          : new URL(
              "/mlc-google-it-export/gemma-4-E2B-it-q4f16_1-webgpu.wasm",
              window.location.origin,
            ).toString(),
      overrides: { context_window_size: 4096, sliding_window_size: -1 },
    },
  ],
};

// Three WAVE inference scenarios. Each is a sequence of user turns played in
// order; for multi-turn scenarios the conversation history accumulates between
// turns so we can measure prefill on a growing context.
type ScenarioKey = "phase" | "checkin" | "reflection";

// Prompts are kept simple and conversational. Earlier versions tried to stuff
// a persona / system instruction into the user role; Google E2B IT can't follow
// long instruction-style user turns and falls into "please clarify" loops, and
// splitting into a separate system role made it worse (Gemma 4's chat template
// doesn't support a distinct system role cleanly). For pure runtime/throughput
// numbers, simple prompts that we know elicit coherent output are sufficient.
const SCENARIOS: Record<
  ScenarioKey,
  {
    label: string;
    description: string;
    userTurns: string[];
    suggestedMaxTokens: number;
  }
> = {
  phase: {
    label: "Phase narration",
    description:
      "Single-turn long-form. Stresses sustained decode throughput on one open-ended prompt.",
    suggestedMaxTokens: 200,
    userTurns: [
      "Write a calming six-line guided meditation for someone feeling anxious. Use simple, concrete sentences in second person.",
    ],
  },
  checkin: {
    label: "Check-in (multi-turn)",
    description:
      "Three user turns of back-and-forth, history accumulates each turn. Stresses prefill on growing context.",
    suggestedMaxTokens: 96,
    userTurns: [
      "I'm feeling anxious right now. What's one small thing I can do in the next minute?",
      "Okay, I tried that. My chest still feels tight and warm.",
      "It started about twenty minutes ago after I saw a beer ad on my phone.",
    ],
  },
  reflection: {
    label: "Reflection",
    description:
      "Single-turn long-form summary. Stresses sustained decode throughput.",
    suggestedMaxTokens: 200,
    userTurns: [
      "Write a two-paragraph reflection on finishing a short meditation session. The breathing exercise helped most, the body scan was harder. Address the reader in second person.",
    ],
  },
};

const RUN_COUNT_CHOICES = [1, 3, 5] as const;

interface RunResult {
  runtime: RuntimeKey;
  scenario: ScenarioKey;
  runIndex: number; // 1-based; warmup uses 0 and is not stored
  turnIndex: number; // 1-based turn within the scenario
  totalTurns: number;
  ttftMs: number;
  decodeMs: number;
  totalMs: number;
  tokenCount: number;
  decodeTokensPerSec: number;
  output: string;
  error?: string;
}

type ChatMessage = { role: "user" | "assistant"; content: string };

type LoadState = {
  phase: "idle" | "loading" | "ready" | "error";
  message: string;
  percent: number;
};

const INITIAL_LOAD: LoadState = {
  phase: "idle",
  message: "Not loaded.",
  percent: 0,
};

export function OnnxBenchmarkClient() {
  // Single-active runtime: only one engine in VRAM. Loading one disposes the
  // other. Results accumulate across switches so ONNX and MLC runs end up in
  // the same comparison table.
  const onnxRef = useRef<TextGenerationPipeline | null>(null);
  const mlcRef = useRef<MLCEngineInterface | null>(null);
  const activeRef = useRef<RuntimeKey | null>(null);

  const [onnxState, setOnnxState] = useState<LoadState>(INITIAL_LOAD);
  const [mlcState, setMlcState] = useState<LoadState>(INITIAL_LOAD);
  const [runCount, setRunCount] = useState<number>(3);
  const [includeWarmup, setIncludeWarmup] = useState<boolean>(true);
  const [running, setRunning] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>("");
  const [results, setResults] = useState<RunResult[]>([]);

  useEffect(() => {
    env.allowLocalModels = true;
    env.allowRemoteModels = true;
    if (typeof window !== "undefined") {
      env.localModelPath = `${window.location.origin}/`;
    }
    env.useBrowserCache = true;
  }, []);

  const disposeAll = useCallback(async () => {
    if (onnxRef.current) {
      try {
        await (
          onnxRef.current as unknown as { dispose?: () => Promise<void> }
        ).dispose?.();
      } catch {
        /* ignore */
      }
      onnxRef.current = null;
    }
    if (mlcRef.current) {
      try {
        await mlcRef.current.unload();
      } catch {
        /* ignore */
      }
      mlcRef.current = null;
    }
    activeRef.current = null;
  }, []);

  const loadOnnx = useCallback(async () => {
    if (running) return;
    await disposeAll();
    setMlcState(INITIAL_LOAD);
    setOnnxState({ phase: "loading", message: "Initializing on WEBGPU…", percent: 0 });
    try {
      const pipe = (await pipeline("text-generation", ONNX_MODEL_ID, {
        dtype: "q4f16",
        device: "webgpu",
        progress_callback: (info: unknown) => {
          const i = info as { status?: string; file?: string; progress?: number };
          if (i.status === "progress" && i.file && typeof i.progress === "number") {
            setOnnxState({
              phase: "loading",
              message: `${i.file} ${i.progress.toFixed(0)}%`,
              percent: Math.round(i.progress),
            });
          }
        },
      })) as TextGenerationPipeline;
      onnxRef.current = pipe;
      activeRef.current = "onnx";
      setOnnxState({ phase: "ready", message: "Loaded and ready.", percent: 100 });
    } catch (err) {
      setOnnxState({
        phase: "error",
        message: err instanceof Error ? err.message : String(err),
        percent: 0,
      });
    }
  }, [disposeAll, running]);

  const loadMlc = useCallback(async () => {
    if (running) return;
    await disposeAll();
    setOnnxState(INITIAL_LOAD);
    setMlcState({ phase: "loading", message: "Initializing MLC engine…", percent: 0 });
    try {
      const engine = await CreateMLCEngine(MLC_MODEL_ID, {
        appConfig: MLC_APP_CONFIG,
        initProgressCallback: (r: InitProgressReport) => {
          setMlcState({
            phase: "loading",
            message: r.text,
            percent: Math.round(r.progress * 100),
          });
        },
      });
      mlcRef.current = engine;
      activeRef.current = "mlc";
      setMlcState({ phase: "ready", message: "Engine ready.", percent: 100 });
    } catch (err) {
      setMlcState({
        phase: "error",
        message: err instanceof Error ? err.message : String(err),
        percent: 0,
      });
    }
  }, [disposeAll, running]);

  // --- One assistant turn through ONNX. Multi-turn = pass full `history` ---
  const runOnnxTurn = useCallback(
    async (history: ChatMessage[], maxTokens: number): Promise<RawTurnTiming> => {
      const pipe = onnxRef.current;
      if (!pipe) return rawError("pipeline not loaded");
      let firstTokenTime = 0;
      let lastTokenTime = 0;
      let tokenCount = 0;
      let output = "";
      const startedAt = performance.now();

      const streamer = new TextStreamer(
        (pipe as unknown as { tokenizer: ConstructorParameters<typeof TextStreamer>[0] })
          .tokenizer,
        {
          skip_prompt: true,
          skip_special_tokens: true,
          // Capture output here AND silence the default stdout writer
          // (transformers.js falls back to `process.stdout.write` which is
          // undefined under Next/turbopack's partial `process` shim).
          callback_function: (text: string) => {
            output += text;
          },
          token_callback_function: (tokens: bigint[]) => {
            const now = performance.now();
            if (firstTokenTime === 0) firstTokenTime = now;
            lastTokenTime = now;
            tokenCount += tokens.length;
          },
        },
      );

      try {
        await pipe(history, {
          max_new_tokens: maxTokens,
          do_sample: false,
          return_full_text: false,
          streamer,
        } as Parameters<TextGenerationPipeline["_call"]>[1]);
        const endedAt = performance.now();
        return {
          firstTokenTime,
          lastTokenTime,
          tokenCount,
          startedAt,
          endedAt,
          output,
        };
      } catch (err) {
        return rawError(err instanceof Error ? err.message : String(err));
      }
    },
    [],
  );

  // --- One assistant turn through MLC. Pass full `history` each call;
  //     we deliberately do NOT call engine.resetChat() — it's unreliable
  //     and could trigger an internal reload that pollutes timing. ---
  const runMlcTurn = useCallback(
    async (history: ChatMessage[], maxTokens: number): Promise<RawTurnTiming> => {
      const engine = mlcRef.current;
      if (!engine) return rawError("engine not loaded");
      let firstTokenTime = 0;
      let lastTokenTime = 0;
      let tokenCount = 0;
      let output = "";
      const startedAt = performance.now();
      try {
        const stream = await engine.chat.completions.create({
          messages: history,
          temperature: 0,
          max_tokens: maxTokens,
          stream: true,
        });
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta.length === 0) continue;
          const now = performance.now();
          if (firstTokenTime === 0) firstTokenTime = now;
          lastTokenTime = now;
          tokenCount += 1;
          output += delta;
        }
        const endedAt = performance.now();
        return {
          firstTokenTime,
          lastTokenTime,
          tokenCount,
          startedAt,
          endedAt,
          output,
        };
      } catch (err) {
        return rawError(err instanceof Error ? err.message : String(err));
      }
    },
    [],
  );

  // MLC-only: reload the engine to dodge web-llm's state leak across distinct
  // tasks (see docs/postmortems/mlc-finetune.md). Called between scenario runs;
  // reload time is intentionally NOT measured. Within a multi-turn scenario we
  // keep the same engine and pass full history — that path is leak-free.
  const reloadMlcEngine = useCallback(async () => {
    const prior = mlcRef.current;
    if (!prior) return;
    try {
      await prior.unload();
    } catch {
      /* ignore */
    }
    mlcRef.current = null;
    const fresh = await CreateMLCEngine(MLC_MODEL_ID, {
      appConfig: MLC_APP_CONFIG,
      initProgressCallback: (r: InitProgressReport) => {
        setMlcState({
          phase: "loading",
          message: `reload: ${r.text}`,
          percent: Math.round(r.progress * 100),
        });
      },
    });
    mlcRef.current = fresh;
    setMlcState({ phase: "ready", message: "Engine ready.", percent: 100 });
  }, []);

  // Play one scenario end-to-end on the active runtime. Each user turn
  // produces a RunResult; conversation history accumulates between turns.
  const runScenarioOnce = useCallback(
    async (runIndex: number, scenario: ScenarioKey): Promise<RunResult[]> => {
      const active = activeRef.current;
      if (!active) return [];
      const spec = SCENARIOS[scenario];
      const runOne = active === "onnx" ? runOnnxTurn : runMlcTurn;
      const history: ChatMessage[] = [];
      const out: RunResult[] = [];

      for (let t = 0; t < spec.userTurns.length; t++) {
        history.push({ role: "user", content: spec.userTurns[t] });
        const raw = await runOne(history, spec.suggestedMaxTokens);
        if (raw.error) {
          out.push({
            runtime: active,
            scenario,
            runIndex,
            turnIndex: t + 1,
            totalTurns: spec.userTurns.length,
            ttftMs: 0,
            decodeMs: 0,
            totalMs: 0,
            tokenCount: 0,
            decodeTokensPerSec: 0,
            output: "",
            error: raw.error,
          });
          break; // stop the scenario on first error
        }
        history.push({ role: "assistant", content: raw.output });
        out.push(finalize(active, scenario, runIndex, t + 1, spec.userTurns.length, raw));
      }
      return out;
    },
    [runMlcTurn, runOnnxTurn],
  );

  const runBenchmark = useCallback(async () => {
    const active = activeRef.current;
    if (!active || running) return;
    setRunning(true);

    const allScenarios = Object.keys(SCENARIOS) as ScenarioKey[];

    if (includeWarmup) {
      // One warmup, on the shortest scenario (phase narration, single turn).
      if (active === "mlc") {
        setStatusText("Reloading MLC engine for warmup…");
        try {
          await reloadMlcEngine();
        } catch (err) {
          console.error("MLC reload before warmup failed:", err);
        }
      }
      setStatusText(`Warmup on ${active.toUpperCase()}…`);
      await runScenarioOnce(0, "phase");
    }

    const collected: RunResult[] = [...results];
    let stepIndex = 0;
    const totalSteps = runCount * allScenarios.length;
    for (let i = 0; i < runCount; i++) {
      for (const sk of allScenarios) {
        stepIndex += 1;
        if (active === "mlc") {
          setStatusText(
            `MLC · reloading engine before ${SCENARIOS[sk].label} (step ${stepIndex}/${totalSteps})…`,
          );
          try {
            await reloadMlcEngine();
          } catch (err) {
            console.error("MLC reload between scenarios failed:", err);
          }
        }
        setStatusText(
          `${active.toUpperCase()} · ${SCENARIOS[sk].label} · step ${stepIndex}/${totalSteps}…`,
        );
        const batch = await runScenarioOnce(i + 1, sk);
        collected.push(...batch);
        setResults([...collected]);
      }
    }

    setStatusText("");
    setRunning(false);
  }, [includeWarmup, reloadMlcEngine, results, runCount, runScenarioOnce, running]);

  const onnxOk = results.filter((r) => r.runtime === "onnx" && !r.error);
  const mlcOk = results.filter((r) => r.runtime === "mlc" && !r.error);
  const activeKey: RuntimeKey | null =
    onnxState.phase === "ready" ? "onnx" : mlcState.phase === "ready" ? "mlc" : null;
  const canRun = activeKey !== null && !running;

  return (
    <div
      style={{
        padding: 32,
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        maxWidth: 1100,
        margin: "0 auto",
        color: "#1f2937",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 26, letterSpacing: -0.3 }}>
          Runtime benchmark · ONNX vs MLC
        </h1>
        <p style={{ color: "#6b7280", marginTop: 8, lineHeight: 1.5, fontSize: 14 }}>
          Upstream Gemma 4 E2B IT on both sides (our fine-tune is broken in both
          pipelines for now), same q4f16 quantization, greedy decoding (temperature
          0). Three scenarios — phase narration (single-turn long-form), check-in
          (multi-turn with growing context), reflection (single-turn summary).{" "}
          <strong>TTFT</strong> = prefill (start → first token);{" "}
          <strong>decode tok/s</strong> excludes prefill.
        </p>
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            color: "#78350f",
            padding: "10px 14px",
            borderRadius: 6,
            fontSize: 13,
            marginTop: 12,
            lineHeight: 1.5,
          }}
        >
          ⚠️ <strong>MLC reset caveat.</strong> web-llm <code>resetChat()</code> is
          unreliable (KV state leaks across distinct tasks), so between scenarios
          and between runs of the same scenario we fully reload the MLC engine.
          Reload time is <em>not</em> included in timing — only the actual
          <code>chat.completions.create</code> stream is measured. Within a
          multi-turn scenario we keep the same engine and pass full history,
          which is the leak-free path. See{" "}
          <code>docs/postmortems/mlc-finetune.md</code>.
        </div>
      </header>

      {/* Runtime cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <RuntimeCard
          runtime="onnx"
          state={onnxState}
          isActive={activeKey === "onnx"}
          busy={
            running || onnxState.phase === "loading" || mlcState.phase === "loading"
          }
          onLoad={loadOnnx}
        />
        <RuntimeCard
          runtime="mlc"
          state={mlcState}
          isActive={activeKey === "mlc"}
          busy={
            running || onnxState.phase === "loading" || mlcState.phase === "loading"
          }
          onLoad={loadMlc}
        />
      </div>

      {/* Scenarios (info-only — every Run benchmarks all three) + config */}
      <div
        style={{
          padding: 16,
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "#6b7280",
            textTransform: "uppercase",
            letterSpacing: 0.4,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Scenarios benchmarked each run
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {(Object.keys(SCENARIOS) as ScenarioKey[]).map((k) => {
            const s = SCENARIOS[k];
            return (
              <div
                key={k}
                style={{
                  textAlign: "left",
                  padding: 12,
                  background: "white",
                  color: "#1f2937",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                  {s.label}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#6b7280",
                    lineHeight: 1.4,
                    marginBottom: 6,
                  }}
                >
                  {s.description}
                </div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  {s.userTurns.length} turn{s.userTurns.length === 1 ? "" : "s"} ·
                  max {s.suggestedMaxTokens} tok/turn
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            gap: 24,
            marginTop: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <ConfigGroup label="runs per scenario">
            {RUN_COUNT_CHOICES.map((n) => (
              <Pill
                key={n}
                selected={runCount === n}
                disabled={running}
                onClick={() => setRunCount(n)}
              >
                {n}
              </Pill>
            ))}
          </ConfigGroup>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: "#374151",
              cursor: running ? "not-allowed" : "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={includeWarmup}
              disabled={running}
              onChange={(e) => setIncludeWarmup(e.target.checked)}
            />
            warmup run (discarded)
          </label>
        </div>
      </div>

      {/* Run button + status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 16,
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          marginBottom: 20,
        }}
      >
        <button
          onClick={runBenchmark}
          disabled={!canRun}
          style={{
            padding: "10px 20px",
            fontSize: 15,
            fontWeight: 500,
            background: canRun ? "#10b981" : "#d1d5db",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: canRun ? "pointer" : "not-allowed",
          }}
        >
          {running
            ? statusText || "Running…"
            : activeKey
              ? `▶ Benchmark all 3 scenarios on ${activeKey.toUpperCase()} (${runCount}× each)`
              : "Load a runtime first"}
        </button>
        <button
          onClick={() => setResults([])}
          disabled={results.length === 0 || running}
          style={{
            padding: "10px 16px",
            fontSize: 14,
            background: "transparent",
            color: results.length === 0 || running ? "#9ca3af" : "#6b7280",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            cursor: results.length === 0 || running ? "not-allowed" : "pointer",
          }}
        >
          Clear results
        </button>
        <div style={{ marginLeft: "auto", color: "#6b7280", fontSize: 13 }}>
          {results.length > 0
            ? `ONNX: ${onnxOk.length} ok · MLC: ${mlcOk.length} ok`
            : "No runs yet."}
        </div>
      </div>

      {results.length > 0 ? (
        <ResultsView results={results} />
      ) : (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            background: "#f9fafb",
            border: "1px dashed #d1d5db",
            borderRadius: 8,
            color: "#9ca3af",
            fontSize: 14,
          }}
        >
          No runs yet. Load a runtime, pick a scenario, click Benchmark. Then load
          the other runtime and re-run to compare side-by-side.
        </div>
      )}
    </div>
  );
}

interface RawTurnTiming {
  firstTokenTime: number;
  lastTokenTime: number;
  tokenCount: number;
  startedAt: number;
  endedAt: number;
  output: string;
  error?: string;
}

function rawError(error: string): RawTurnTiming {
  return {
    firstTokenTime: 0,
    lastTokenTime: 0,
    tokenCount: 0,
    startedAt: 0,
    endedAt: 0,
    output: "",
    error,
  };
}

function finalize(
  runtime: RuntimeKey,
  scenario: ScenarioKey,
  runIndex: number,
  turnIndex: number,
  totalTurns: number,
  t: RawTurnTiming,
): RunResult {
  const ttftMs = t.firstTokenTime > 0 ? t.firstTokenTime - t.startedAt : 0;
  const decodeMs =
    t.lastTokenTime > t.firstTokenTime ? t.lastTokenTime - t.firstTokenTime : 0;
  const totalMs = t.endedAt - t.startedAt;
  const decodeTokensPerSec =
    decodeMs > 0 && t.tokenCount > 1 ? ((t.tokenCount - 1) / decodeMs) * 1000 : 0;
  return {
    runtime,
    scenario,
    runIndex,
    turnIndex,
    totalTurns,
    ttftMs,
    decodeMs,
    totalMs,
    tokenCount: t.tokenCount,
    decodeTokensPerSec,
    output: t.output,
  };
}

function RuntimeCard({
  runtime,
  state,
  isActive,
  busy,
  onLoad,
}: {
  runtime: RuntimeKey;
  state: LoadState;
  isActive: boolean;
  busy: boolean;
  onLoad: () => void;
}) {
  const meta = RUNTIMES[runtime];
  const label = isActive
    ? "✓ Active"
    : state.phase === "loading"
      ? "Loading…"
      : state.phase === "ready"
        ? "Switch to this"
        : state.phase === "error"
          ? "Retry"
          : "Load";
  return (
    <div
      style={{
        padding: 16,
        background: isActive ? `${meta.color}11` : "white",
        border: `2px solid ${isActive ? meta.color : "#e5e7eb"}`,
        borderRadius: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 17, color: meta.color }}>{meta.label}</h3>
        {isActive && (
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              background: meta.color,
              color: "white",
              borderRadius: 999,
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            ACTIVE
          </span>
        )}
      </div>
      <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>
        {meta.subtitle}
      </div>
      <div
        style={{
          color: meta.color,
          fontSize: 11,
          marginTop: 4,
          fontWeight: 600,
          letterSpacing: 0.4,
        }}
      >
        Backend: {meta.backend}
      </div>

      <button
        onClick={onLoad}
        disabled={busy || isActive}
        style={{
          marginTop: 12,
          padding: "8px 14px",
          fontSize: 13,
          fontWeight: 500,
          background: isActive ? "#e5e7eb" : meta.color,
          color: isActive ? "#6b7280" : "white",
          border: "none",
          borderRadius: 6,
          cursor: busy || isActive ? "not-allowed" : "pointer",
          opacity: busy && !isActive ? 0.6 : 1,
        }}
      >
        {label}
      </button>

      <div style={{ marginTop: 12 }}>
        <div
          style={{
            background: "#f3f4f6",
            height: 6,
            borderRadius: 3,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${state.percent}%`,
              background: state.phase === "error" ? "#ef4444" : meta.color,
              height: "100%",
              transition: "width 0.2s",
            }}
          />
        </div>
        <div
          style={{
            fontSize: 12,
            color: state.phase === "error" ? "#b91c1c" : "#6b7280",
            marginTop: 6,
            wordBreak: "break-word",
          }}
        >
          {state.message}
        </div>
      </div>
    </div>
  );
}

function ConfigGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 12, color: "#6b7280" }}>{label}:</span>
      <div style={{ display: "flex", gap: 4 }}>{children}</div>
    </div>
  );
}

function Pill({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "4px 10px",
        fontSize: 12,
        background: selected ? "#1f2937" : "white",
        color: selected ? "white" : "#374151",
        border: "1px solid #d1d5db",
        borderRadius: 999,
        cursor: disabled ? "not-allowed" : "pointer",
        minWidth: 32,
      }}
    >
      {children}
    </button>
  );
}

function ResultsView({ results }: { results: RunResult[] }) {
  // Summary grid: rows = scenarios, columns = ONNX | MLC.
  const scenarios = Object.keys(SCENARIOS) as ScenarioKey[];

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "180px 1fr 1fr",
          gap: 12,
          marginBottom: 16,
          alignItems: "stretch",
        }}
      >
        <div /> {/* corner */}
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: RUNTIMES.onnx.color,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            padding: "4px 8px",
          }}
        >
          ONNX
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: RUNTIMES.mlc.color,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            padding: "4px 8px",
          }}
        >
          MLC
        </div>
        {scenarios.map((s) => (
          <ScenarioRow
            key={s}
            scenario={s}
            onnxRows={results.filter(
              (r) => r.scenario === s && r.runtime === "onnx" && !r.error,
            )}
            mlcRows={results.filter(
              (r) => r.scenario === s && r.runtime === "mlc" && !r.error,
            )}
          />
        ))}
      </div>

      {/* Per-turn detail table */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          overflow: "hidden",
          background: "white",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              <Th>Runtime</Th>
              <Th>Scenario</Th>
              <Th>Run</Th>
              <Th>Turn</Th>
              <Th align="right">TTFT</Th>
              <Th align="right">Decode</Th>
              <Th align="right">Decode rate</Th>
              <Th align="right">Total</Th>
              <Th align="right">Tokens</Th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const meta = RUNTIMES[r.runtime];
              return (
                <tr key={i} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <Td>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "white",
                        background: meta.color,
                        borderRadius: 4,
                        letterSpacing: 0.4,
                      }}
                    >
                      {r.runtime.toUpperCase()}
                    </span>
                  </Td>
                  <Td>{SCENARIOS[r.scenario].label}</Td>
                  <Td>#{r.runIndex}</Td>
                  <Td>
                    {r.turnIndex}/{r.totalTurns}
                  </Td>
                  {r.error ? (
                    <td colSpan={5} style={{ padding: 8, color: "#b91c1c" }}>
                      {r.error}
                    </td>
                  ) : (
                    <>
                      <Td align="right">{fmtMs(r.ttftMs)}</Td>
                      <Td align="right">{fmtMs(r.decodeMs)}</Td>
                      <Td align="right">{fmtTps(r.decodeTokensPerSec)}</Td>
                      <Td align="right">{fmtSec(r.totalMs)}</Td>
                      <Td align="right">{r.tokenCount}</Td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details style={{ marginTop: 12 }}>
        <summary
          style={{ cursor: "pointer", fontSize: 13, color: "#6b7280", padding: 8 }}
        >
          Show generated outputs ({results.filter((r) => !r.error).length})
        </summary>
        <div style={{ marginTop: 8 }}>
          {results
            .filter((r) => !r.error)
            .map((r, i) => {
              const meta = RUNTIMES[r.runtime];
              return (
                <div
                  key={i}
                  style={{
                    padding: 12,
                    background: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: 6,
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: meta.color,
                      marginBottom: 6,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                    }}
                  >
                    {r.runtime} · {SCENARIOS[r.scenario].label} · run #{r.runIndex}{" "}
                    · turn {r.turnIndex}/{r.totalTurns} · {r.tokenCount} tok ·{" "}
                    {fmtTps(r.decodeTokensPerSec)}
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {r.output}
                  </div>
                </div>
              );
            })}
        </div>
      </details>
    </div>
  );
}

function ScenarioRow({
  scenario,
  onnxRows,
  mlcRows,
}: {
  scenario: ScenarioKey;
  onnxRows: RunResult[];
  mlcRows: RunResult[];
}) {
  return (
    <>
      <div
        style={{
          padding: 12,
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          color: "#374151",
          display: "flex",
          alignItems: "center",
        }}
      >
        {SCENARIOS[scenario].label}
      </div>
      <SummaryBox runtime="onnx" rows={onnxRows} />
      <SummaryBox runtime="mlc" rows={mlcRows} />
    </>
  );
}

function SummaryBox({ runtime, rows }: { runtime: RuntimeKey; rows: RunResult[] }) {
  const meta = RUNTIMES[runtime];
  const avg = (key: keyof RunResult): number => {
    if (rows.length === 0) return 0;
    const vals = rows.map((r) => Number(r[key])).filter((n) => Number.isFinite(n));
    return vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  };
  const median = (key: keyof RunResult): number => {
    if (rows.length === 0) return 0;
    const vals = rows
      .map((r) => Number(r[key]))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (vals.length === 0) return 0;
    const m = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
  };

  return (
    <div
      style={{
        padding: 12,
        background: "white",
        border: `1px solid ${meta.color}33`,
        borderLeft: `4px solid ${meta.color}`,
        borderRadius: 8,
      }}
    >
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: "#9ca3af" }}>No runs yet.</div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
            {rows.length} turn{rows.length === 1 ? "" : "s"} measured
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            <MetricMini
              label="TTFT"
              primary={fmtMs(avg("ttftMs"))}
              secondary={`${fmtMs(median("ttftMs"))} med`}
            />
            <MetricMini
              label="Decode"
              primary={fmtTps(avg("decodeTokensPerSec"))}
              secondary={`${fmtTps(median("decodeTokensPerSec"))} med`}
            />
            <MetricMini
              label="Total"
              primary={fmtSec(avg("totalMs"))}
              secondary={`${fmtSec(median("totalMs"))} med`}
            />
            <MetricMini
              label="Tokens"
              primary={`${avg("tokenCount").toFixed(0)} tok`}
              secondary="avg / turn"
            />
          </div>
        </>
      )}
    </div>
  );
}

function MetricMini({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: 0.4,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2, color: "#1f2937" }}>
        {primary}
      </div>
      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>{secondary}</div>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        padding: "8px 12px",
        textAlign: align,
        fontSize: 11,
        fontWeight: 600,
        color: "#6b7280",
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      style={{
        padding: "8px 12px",
        textAlign: align,
        fontFamily:
          align === "right" ? "ui-monospace, SFMono-Regular, monospace" : "inherit",
      }}
    >
      {children}
    </td>
  );
}

function fmtMs(n: number): string {
  return `${n.toFixed(0)} ms`;
}
function fmtSec(n: number): string {
  return `${(n / 1000).toFixed(2)} s`;
}
function fmtTps(n: number): string {
  return `${n.toFixed(1)} tok/s`;
}
