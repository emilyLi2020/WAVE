"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { buildChunkPrompt } from "@/lib/prompts/chunk-generator";
import { buildCheckInPrompt } from "@/lib/prompts/check-in";
import { buildReflectionPrompt } from "@/lib/prompts/reflection";
import type {
  CheckInContextPayload,
  ChunkGenerationContextPayload,
  ReflectionContext,
  SessionHistoryEntry,
} from "@/lib/prompts/schemas";
import {
  describeWaveWllamaSource,
  loadWaveWllama,
  LOCAL_GGUF_HOST,
  WAVE_GGUF_DEFAULT_N_CTX,
  WAVE_GGUF_FILE,
  WAVE_GGUF_REPO,
  type WllamaInstance,
} from "@/lib/wllama";

const PATIENT_PROFILE = {
  matType: "buprenorphine",
  medicationStatus: "on_time",
  trigger: "stress",
  triggerOther: null,
  usedSubstanceToday: false,
} as const;

const SESSION_HISTORY: SessionHistoryEntry[] = [
  {
    kind: "chunk",
    chunkNumber: 1,
    lines: [
      "Welcome back. You showing up for this is the practice.",
      "Find a position your body can rest in for a few minutes.",
      "Urges arrive like waves. They build, they crest, and they fall.",
      "Notice what is already here in the body, without trying to fix anything.",
      "Let your breath be ordinary for one slow round.",
      "When you are ready, we will move into the body together.",
    ],
  },
];

const PHASE_CONTEXT: ChunkGenerationContextPayload = {
  chunkNumber: 2,
  intakeIntensity: 7,
  profile: PATIENT_PROFILE,
  sessionHistory: SESSION_HISTORY,
};

const CHECK_IN_CONTEXT: CheckInContextPayload = {
  chunkNumber: 1,
  cravingScore: 7,
  scoreHistory: [],
  obstacleHint: null,
  profile: PATIENT_PROFILE,
  intakeIntensity: 7,
  sessionHistory: SESSION_HISTORY,
  demoMode: false,
};

const REFLECTION_CONTEXT: ReflectionContext = {
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

const FIRST_PATIENT_TURN =
  "It's around a 7. It's been building for a couple hours.";

type TaskKey = "smoke" | "phase" | "checkin" | "reflection";

interface TaskResult {
  text: string;
  elapsedMs: number;
  tokensPerSecond: number;
  error?: string;
}

const MAX_TOKENS: Record<TaskKey, number> = {
  smoke: 32,
  phase: 320,
  checkin: 220,
  reflection: 320,
};

interface LoadState {
  phase: "idle" | "loading" | "ready" | "error";
  message: string;
  percent: number;
}

const INITIAL_LOAD: LoadState = { phase: "idle", message: "Not loaded.", percent: 0 };

export function WllamaTestClient() {
  const wllamaRef = useRef<WllamaInstance | null>(null);
  const [load, setLoad] = useState<LoadState>(INITIAL_LOAD);
  const [running, setRunning] = useState<TaskKey | null>(null);
  const [results, setResults] = useState<Partial<Record<TaskKey, TaskResult>>>(
    {},
  );
  const [localHost, setLocalHost] = useState<string>(LOCAL_GGUF_HOST);
  const [useLocal, setUseLocal] = useState<boolean>(false);
  const [nCtx, setNCtx] = useState<number>(WAVE_GGUF_DEFAULT_N_CTX);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setUseLocal(params.get("local") === "1");
    const h = params.get("local-host");
    if (h) setLocalHost(h);
    const c = params.get("n_ctx");
    if (c) {
      const parsed = Number.parseInt(c, 10);
      if (Number.isFinite(parsed) && parsed > 0) setNCtx(parsed);
    }
  }, []);

  const loadModel = useCallback(async () => {
    if (load.phase === "loading" || load.phase === "ready") return;
    const sourceLabel = describeWaveWllamaSource({
      useLocalMirror: useLocal,
      localHost,
    });
    setLoad({
      phase: "loading",
      message: `Loading ${sourceLabel} (n_ctx=${nCtx})…`,
      percent: 0,
    });
    try {
      const wllama = await loadWaveWllama({
        nCtx,
        useLocalMirror: useLocal,
        localHost,
        onProgress: ({ percent }) => {
          setLoad({
            phase: "loading",
            message: `Downloading ${sourceLabel} ${percent}% (n_ctx=${nCtx})`,
            percent,
          });
        },
      });
      wllamaRef.current = wllama;
      setLoad({
        phase: "ready",
        message: "Loaded and ready (wllama).",
        percent: 100,
      });
    } catch (err) {
      setLoad({
        phase: "error",
        message: err instanceof Error ? err.message : String(err),
        percent: 0,
      });
    }
  }, [useLocal, localHost, nCtx, load.phase]);

  const runTask = useCallback(
    async (
      key: TaskKey,
      messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    ) => {
      const wllama = wllamaRef.current;
      if (!wllama) return;
      if (running) return;
      setRunning(key);
      const started = performance.now();
      try {
        const out = await wllama.createChatCompletion({
          messages,
          max_tokens: MAX_TOKENS[key],
          temperature: 0,
          top_k: 1,
        });
        const elapsedMs = performance.now() - started;
        const text = out.choices?.[0]?.message?.content ?? "";
        const approxTokens = Math.max(1, Math.round(text.length / 4));
        setResults((prev) => ({
          ...prev,
          [key]: {
            text,
            elapsedMs,
            tokensPerSecond: elapsedMs > 0 ? (approxTokens / elapsedMs) * 1000 : 0,
          },
        }));
        console.info(
          "[wllama-test] %s len=%d in %dms",
          key,
          text.length,
          Math.round(elapsedMs),
          text,
        );
      } catch (err) {
        setResults((prev) => ({
          ...prev,
          [key]: {
            text: "",
            elapsedMs: 0,
            tokensPerSecond: 0,
            error: err instanceof Error ? err.message : String(err),
          },
        }));
      } finally {
        setRunning(null);
      }
    },
    [running],
  );

  const runSmoke = useCallback(() => {
    return runTask("smoke", [
      {
        role: "user",
        content: "What is the capital of France? Answer in one sentence.",
      },
    ]);
  }, [runTask]);

  const runPhase = useCallback(() => {
    const built = buildChunkPrompt(PHASE_CONTEXT);
    return runTask("phase", [
      { role: "system", content: built.systemPrompt },
      { role: "user", content: built.userPrompt },
    ]);
  }, [runTask]);

  const runCheckIn = useCallback(() => {
    const built = buildCheckInPrompt(CHECK_IN_CONTEXT, { agentTurnsInHistory: 0 });
    return runTask("checkin", [
      { role: "system", content: built.systemPrompt },
      {
        role: "user",
        content: `${built.contextBlock}\n\n${FIRST_PATIENT_TURN}`,
      },
    ]);
  }, [runTask]);

  const runReflection = useCallback(() => {
    const built = buildReflectionPrompt(REFLECTION_CONTEXT);
    return runTask("reflection", [
      { role: "system", content: built.systemPrompt },
      { role: "user", content: built.userPrompt },
    ]);
  }, [runTask]);

  // Dispose the current wllama session and load a fresh one. Used between
  // tasks in runAll because llama.cpp's slot/server harness has a known bug
  // (see https://github.com/ggml-org/llama.cpp/pull/20277) that aborts the
  // WASM worker on the second back-to-back createChatCompletion when the
  // two prompts share little prefix — exactly the WAVE prompts' situation.
  // The reload only re-uploads from browser CacheStorage to GPU; no network.
  const reloadWllama = useCallback(async (label: string) => {
    const prior = wllamaRef.current;
    if (prior) {
      try {
        await prior.exit();
      } catch {
        /* worker may already be dead from a prior abort; ignore */
      }
      wllamaRef.current = null;
    }
    setLoad({
      phase: "loading",
      message: `Reloading wllama before ${label}…`,
      percent: 0,
    });
    const wllama = await loadWaveWllama({
      nCtx,
      useLocalMirror: useLocal,
      localHost,
      onProgress: ({ percent }) => {
        setLoad({
          phase: "loading",
          message: `Reloading wllama before ${label} (${percent}%)…`,
          percent,
        });
      },
    });
    wllamaRef.current = wllama;
    setLoad({
      phase: "ready",
      message: `Reloaded for ${label}.`,
      percent: 100,
    });
  }, [localHost, nCtx, useLocal]);

  const runAll = useCallback(async () => {
    if (load.phase !== "ready" || running) return;
    await runPhase();
    await reloadWllama("check-in");
    await runCheckIn();
    await reloadWllama("reflection");
    await runReflection();
  }, [load.phase, running, runPhase, runCheckIn, runReflection, reloadWllama]);

  const canRun = load.phase === "ready" && running === null;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-foreground/50">
          Browser-runtime GGUF · wllama
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          WAVE fine-tune via @wllama/wllama (GGUF)
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-foreground/70 leading-relaxed">
          Loads <code className="font-mono">gemma-4-e2b-it-peft.Q4_K_M</code>{" "}
          (5-part split, ~3.2 GB total) via wllama's WebGPU/WASM runtime.
          Bypasses onnxruntime-web's WebGPU fp16 overflow bug entirely.
        </p>
      </header>

      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
        Loads <code>{WAVE_GGUF_REPO}</code> / <code>{WAVE_GGUF_FILE}</code> from
        HF (~3.2 GB in 5 shards). First load cached by the browser's
        CacheStorage. Append <code>?local=1</code> to fetch from a local-hf
        mirror at <code>{localHost}</code> instead (faster iteration when
        working on the GGUF).
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <strong>Heads up:</strong> &quot;Run all 3 tasks&quot; reloads the
        wllama instance between each task to dodge a llama.cpp slot-manager
        bug (
        <a
          href="https://github.com/ggml-org/llama.cpp/pull/20277"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          ggml-org/llama.cpp#20277
        </a>
        ) that aborts the WASM worker on back-to-back{" "}
        <code>createChatCompletion</code> calls when the prompts share little
        prefix — which is exactly the WAVE prompts. The reload only
        re-uploads from the browser cache to GPU (no network), so it adds a
        few seconds per task but keeps the run from crashing. Single-task
        buttons (or the smoke test) don&apos;t need this.
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-semibold tracking-tight" style={{ color: "#10b981" }}>
            Fine-tune (PEFT-merged Q4_K_M GGUF)
          </h3>
          <span className="text-[10px] uppercase tracking-wide text-foreground/50">
            {load.phase}
          </span>
        </div>
        <p className="mt-1 break-all text-xs text-foreground/55">
          {describeWaveWllamaSource({ useLocalMirror: useLocal, localHost })}
        </p>
        <p className="mt-3 text-xs text-foreground/70">{load.message}</p>
        <button
          type="button"
          disabled={load.phase === "loading" || load.phase === "ready"}
          onClick={loadModel}
          className="mt-3 inline-flex items-center rounded-md border border-border bg-surface-muted px-3 py-1.5 text-xs font-medium text-foreground/80 disabled:cursor-not-allowed disabled:opacity-50 hover:border-accent/60 hover:text-foreground"
        >
          {load.phase === "loading"
            ? `Loading… ${load.percent || 0}%`
            : load.phase === "ready"
              ? "Loaded"
              : load.phase === "error"
                ? "Retry"
                : "Load"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canRun}
          onClick={runAll}
          className="inline-flex items-center rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90"
        >
          {running !== null && running !== "smoke"
            ? `Running ${running}…`
            : "Run all 3 tasks"}
        </button>
        <button
          type="button"
          disabled={!canRun}
          onClick={runSmoke}
          className="inline-flex items-center rounded-md border border-border bg-surface-muted px-3 py-2 text-xs font-medium text-foreground/80 disabled:cursor-not-allowed disabled:opacity-50 hover:border-accent/60 hover:text-foreground"
        >
          Smoke only (capital of France)
        </button>
        {load.phase !== "ready" ? (
          <span className="text-xs text-foreground/55">
            Load the model above first.
          </span>
        ) : (
          <span className="text-xs text-foreground/55">
            Phase → Check-in (turn 1) → Reflection, sequentially.
          </span>
        )}
      </div>

      {(["smoke", "phase", "checkin", "reflection"] as const).map((key) => {
        const r = results[key];
        if (!r) return null;
        return (
          <section
            key={key}
            className="rounded-2xl border border-border bg-surface-muted/30 p-5"
          >
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold tracking-tight">{key}</h2>
              <span className="text-[11px] text-foreground/55">
                {r.elapsedMs.toFixed(0)} ms · {r.tokensPerSecond.toFixed(1)} tok/s
              </span>
            </div>
            {r.error ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                {r.error}
              </p>
            ) : (
              <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-muted/50 px-3 py-2 text-xs leading-relaxed text-foreground/85">
                {r.text}
              </pre>
            )}
          </section>
        );
      })}
    </div>
  );
}
