import type { ProgressInfo } from "@huggingface/transformers";

import type {
  SpeechToTextEngine,
  SpeechToTextResult,
  VoiceModelLoadState,
  VoiceRuntimeDevice,
  WhisperModelId,
} from "@/lib/voice/types";

const WHISPER_CACHE_KEY = "wave-whisper-voice-test-cache";
const WHISPER_SAMPLE_RATE = 16_000;

type TransformersEnv = {
  logLevel: unknown;
  allowRemoteModels: boolean;
  allowLocalModels: boolean;
  useBrowserCache?: boolean;
  useWasmCache?: boolean;
  cacheKey?: string;
};

type TransformersLogLevel = {
  WARNING: unknown;
};

type AutomaticSpeechRecognitionPipeline = (
  audio: Float32Array,
) => Promise<{ text?: unknown }>;

const sttLoadListeners = new Set<(state: VoiceModelLoadState) => void>();
const enginePromises = new Map<string, Promise<SpeechToTextEngine>>();

let sttLoadState: VoiceModelLoadState = {
  phase: "idle",
  status: "idle",
  progress: null,
  message: "Whisper has not been loaded.",
  modelId: null,
  device: "unknown",
};

export function getWhisperLoadState(): VoiceModelLoadState {
  return sttLoadState;
}

export function subscribeWhisperLoad(
  listener: (state: VoiceModelLoadState) => void,
): () => void {
  sttLoadListeners.add(listener);
  listener(sttLoadState);
  return () => {
    sttLoadListeners.delete(listener);
  };
}

export async function createWhisperSpeechToTextEngine(
  modelId: WhisperModelId,
): Promise<SpeechToTextEngine> {
  const device = getWhisperDevice();
  const key = `${modelId}:${device}`;
  const existingPromise = enginePromises.get(key);
  if (existingPromise) return existingPromise;

  const enginePromise = loadWhisperEngine(modelId, device).catch((err) => {
    enginePromises.delete(key);
    setSttLoadState({
      phase: "error",
      status: "error",
      progress: null,
      message:
        err instanceof Error ? err.message : "Whisper could not be loaded.",
      modelId,
      device,
    });
    throw err;
  });

  enginePromises.set(key, enginePromise);
  return enginePromise;
}

async function loadWhisperEngine(
  modelId: WhisperModelId,
  device: VoiceRuntimeDevice,
): Promise<SpeechToTextEngine> {
  setSttLoadState({
    phase: "loading",
    status: "initializing",
    progress: null,
    message: "Preparing Whisper speech recognition.",
    modelId,
    device,
  });

  const { env, LogLevel, pipeline } = await import("@huggingface/transformers");
  configureTransformersEnvironment(env as TransformersEnv, LogLevel);

  if (typeof navigator !== "undefined" && navigator.storage?.persist) {
    void navigator.storage.persist().catch(() => false);
  }

  const transcriber = (await pipeline(
    "automatic-speech-recognition",
    modelId,
    {
      device: device === "webgpu" ? "webgpu" : "wasm",
      progress_callback: (progress: ProgressInfo) =>
        handleWhisperProgress(progress, modelId, device),
    },
  )) as unknown as AutomaticSpeechRecognitionPipeline;

  setSttLoadState({
    phase: "ready",
    status: "ready",
    progress: 100,
    message: "Whisper is ready for local transcription.",
    modelId,
    device,
  });

  return {
    modelId,
    device,
    async transcribe(
      audio: Float32Array,
      sampleRate: number,
    ): Promise<SpeechToTextResult> {
      if (sampleRate !== WHISPER_SAMPLE_RATE) {
        throw new Error(
          `Whisper expects ${WHISPER_SAMPLE_RATE} Hz audio, received ${sampleRate} Hz.`,
        );
      }

      const startedAt = performance.now();
      const output = await transcriber(audio);
      const text = typeof output.text === "string" ? output.text.trim() : "";

      return {
        text,
        elapsedMs: Math.round(performance.now() - startedAt),
        modelId,
        device,
        audioDurationMs: Math.round((audio.length / sampleRate) * 1000),
      };
    },
  };
}

function configureTransformersEnvironment(
  env: TransformersEnv,
  logLevel: TransformersLogLevel,
): void {
  env.logLevel = logLevel.WARNING;
  env.allowRemoteModels = true;
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.useWasmCache = true;
  env.cacheKey = WHISPER_CACHE_KEY;
}

function handleWhisperProgress(
  progress: ProgressInfo,
  modelId: WhisperModelId,
  device: VoiceRuntimeDevice,
): void {
  const progressRecord = progress as ProgressInfo & { progress?: unknown };
  const rawProgress =
    typeof progressRecord.progress === "number" ? progressRecord.progress : null;
  const progressValue =
    rawProgress === null ? null : Math.max(0, Math.min(100, rawProgress));
  const status =
    typeof progress.status === "string" ? progress.status : "loading";

  setSttLoadState({
    phase: "loading",
    status,
    progress: progressValue,
    message:
      progressValue === null
        ? `Loading ${modelId}.`
        : `Loading ${modelId}: ${progressValue.toFixed(0)}%.`,
    modelId,
    device,
  });
}

function setSttLoadState(nextState: VoiceModelLoadState): void {
  sttLoadState = nextState;
  for (const listener of sttLoadListeners) {
    listener(nextState);
  }
}

function getWhisperDevice(): VoiceRuntimeDevice {
  if (typeof navigator !== "undefined" && "gpu" in navigator) return "webgpu";
  if (typeof window !== "undefined") return "wasm";
  return "cpu";
}
