"use client";

import { useEffect, useMemo, useState } from "react";

import {
  GEMMA_MODEL_ID,
  getGemmaModelLoadState,
  preloadLocalGemma,
  subscribeGemmaModelLoad,
  type GemmaModelFileLoadState,
  type GemmaModelLoadState,
} from "@/lib/gemma/local-runtime";

interface Props {
  children: React.ReactNode;
}

export function ModelPreloadGate({ children }: Props) {
  const [state, setState] = useState<GemmaModelLoadState>(
    getGemmaModelLoadState,
  );

  useEffect(() => {
    return subscribeGemmaModelLoad(setState);
  }, []);

  function handleStart() {
    void preloadLocalGemma().catch((err) => {
      if (typeof console === "undefined") return;
      console.error("[wave] Gemma preload failed", err);
    });
  }

  const runtimeLabel = useMemo(() => {
    if (state.device === "webgpu") return "WebGPU acceleration";
    if (state.device === "wasm") return "browser fallback runtime";
    if (state.device === "cpu") return "CPU runtime";
    return "checking device support";
  }, [state.device]);

  if (state.phase === "ready") {
    return <>{children}</>;
  }

  const progress = state.progress ?? 0;
  const isIdle = state.phase === "idle";
  const isLoading = state.phase === "loading";
  const showProgress = isLoading && state.progress !== null;
  const isError = state.phase === "error";
  const completedFiles = state.files.filter(
    (fileState) => fileState.progress === 100,
  ).length;
  const statusLabel = isError
    ? "Setup paused"
    : isIdle
      ? "Ready to start"
      : "Preparing local Gemma model";
  const detailLabel = state.file
    ? `${state.status} ${state.file}`
    : isIdle
      ? "The download has not started yet."
      : state.message;
  const summaryLabel =
    state.files.length > 0
      ? `${completedFiles}/${state.files.length} files`
      : showProgress
        ? `${progress}%`
        : runtimeLabel;

  return (
    <section className="flex min-h-[calc(100vh-8rem)] items-center justify-center bg-background px-6 py-12 text-foreground">
      <section
        className="w-full max-w-xl rounded-[2rem] border border-border bg-surface p-8 shadow-2xl shadow-accent/10"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-accent"
          >
            <span
              className={`h-3 w-3 rounded-full bg-accent ${isLoading ? "animate-pulse" : ""}`}
            />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-foreground/45">
              Local model setup
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {isError
                ? "Gemma could not load"
                : "Preparing Gemma on this device"}
            </h1>
          </div>
        </div>

        <p className="mt-6 text-sm leading-relaxed text-foreground/70">
          WAVE uses Gemma locally for sessions, check-ins, reflections, and
          insights. The first visit downloads and caches the model; after that,
          the app can reuse it from browser storage.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-surface-muted p-4">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="min-w-0 font-medium">
              {statusLabel}
            </span>
            <span className="w-28 shrink-0 text-right font-mono tabular-nums text-foreground/50">
              {summaryLabel}
            </span>
          </div>

          <p
            className="mt-3 h-5 truncate text-xs text-foreground/55"
            title={detailLabel}
          >
            {detailLabel}
          </p>

          {state.files.length > 0 ? (
            <ul className="mt-4 max-h-56 space-y-3 overflow-y-auto pr-1">
              {state.files.map((fileState) => (
                <ModelFileProgress
                  key={fileState.file}
                  fileState={fileState}
                />
              ))}
            </ul>
          ) : null}

          <dl className="mt-4 grid gap-3 text-xs text-foreground/55 sm:grid-cols-2">
            <div>
              <dt className="font-medium text-foreground/70">Model</dt>
              <dd className="mt-1 h-4 truncate" title={GEMMA_MODEL_ID}>
                {GEMMA_MODEL_ID}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground/70">Current file</dt>
              <dd
                className="mt-1 h-4 truncate"
                title={state.file ?? undefined}
              >
                {state.file ?? (isError ? "not available" : "checking cache")}
              </dd>
            </div>
          </dl>
        </div>

        {isError ? (
          <div className="mt-6 rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
            <p className="font-medium">Download or runtime setup failed.</p>
            <p className="mt-1 text-danger/80">{state.message}</p>
            <button
              type="button"
              onClick={handleStart}
              className="mt-4 rounded-full border border-danger/40 bg-surface px-4 py-2 text-xs font-medium text-danger transition hover:bg-danger-soft"
            >
              Try again
            </button>
          </div>
        ) : isIdle ? (
          <div className="mt-6">
            <button
              type="button"
              onClick={handleStart}
              className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90"
            >
              Start download
            </button>
            <p className="mt-4 text-xs leading-relaxed text-foreground/50">
              Start when you&apos;re ready to use a model-backed page. Chrome or
              Edge with WebGPU gives the smoothest demo; cached loads should be
              much faster.
            </p>
          </div>
        ) : (
          <p className="mt-5 text-xs leading-relaxed text-foreground/50">
            Keep this tab open during the first download. Chrome or Edge with
            WebGPU gives the smoothest demo; cached loads should be much faster.
          </p>
        )}
      </section>
    </section>
  );
}

function ModelFileProgress({
  fileState,
}: {
  fileState: GemmaModelFileLoadState;
}) {
  const progress = fileState.progress ?? 0;
  const progressLabel =
    fileState.progress !== null ? `${fileState.progress}%` : fileState.status;
  const byteLabel =
    fileState.loaded !== null && fileState.total !== null
      ? `${formatBytes(fileState.loaded)} / ${formatBytes(fileState.total)}`
      : null;

  return (
    <li>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate font-medium" title={fileState.file}>
          {formatFileName(fileState.file)}
        </span>
        <span className="shrink-0 font-mono tabular-nums text-foreground/50">
          {progressLabel}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      {byteLabel ? (
        <p className="mt-1 truncate text-[0.7rem] text-foreground/45">
          {byteLabel}
        </p>
      ) : null}
    </li>
  );
}

function formatFileName(file: string): string {
  return file.split("/").pop() ?? file;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  const megabytes = kilobytes / 1024;
  if (megabytes < 1024) return `${megabytes.toFixed(1)} MB`;
  return `${(megabytes / 1024).toFixed(1)} GB`;
}
