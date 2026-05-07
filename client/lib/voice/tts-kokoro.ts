import type { ProgressInfo } from "@huggingface/transformers";

import { SentenceChunkBuffer } from "@/lib/voice/sentence-buffer";
import type {
  KokoroDtype,
  KokoroDevice,
  KokoroRuntimeId,
  KokoroRuntimeOption,
  KokoroTextToSpeechEngine,
  KokoroStreamPlaybackEvent,
  KokoroVoiceInfo,
  TextToSpeechOptions,
  TextToSpeechResult,
  TtsPlaybackLifecycleEvent,
  VoiceModelLoadState,
} from "@/lib/voice/types";
import {
  KOKORO_DEFAULT_VOICE_ID,
  KOKORO_DEFAULT_RUNTIME_ID,
  KOKORO_DEVICE,
  KOKORO_MODEL_ID,
  KOKORO_RUNTIME_OPTIONS,
} from "@/lib/voice/types";

type KokoroTtsConstructor = {
  from_pretrained(
    modelId: string,
    options: {
      dtype: KokoroDtype;
      device: KokoroDevice;
      progress_callback?: (progress: ProgressInfo) => void;
    },
  ): Promise<KokoroTtsInstance>;
};

type KokoroVoiceRecord = Record<string, KokoroVoiceMetadata>;

interface KokoroVoiceMetadata {
  name?: string;
  language?: string;
  gender?: string;
  traits?: string;
  targetQuality?: string;
  overallGrade?: string;
}

interface KokoroTtsInstance {
  voices?: KokoroVoiceRecord;
  list_voices?: () => unknown;
  generate(
    text: string,
    options: { voice: string; speed?: number },
  ): Promise<KokoroRawAudio>;
  stream?: (
    text: string | KokoroTextSplitterStream,
    options: { voice: string; speed?: number; split_pattern?: RegExp },
  ) => AsyncGenerator<KokoroGeneratedStreamChunk, void, void>;
}

interface KokoroRawAudio {
  toBlob(): Blob;
}

interface KokoroGeneratedStreamChunk {
  text: string;
  phonemes: string;
  audio: KokoroRawAudio;
}

interface KokoroTextSplitterStream {
  push(...texts: string[]): void;
  close(): void;
  flush(): void;
}

type KokoroTextSplitterStreamConstructor = new () => KokoroTextSplitterStream;

interface KokoroModule {
  KokoroTTS: KokoroTtsConstructor;
  TextSplitterStream?: KokoroTextSplitterStreamConstructor;
}

type TransformersEnv = {
  logLevel: unknown;
  allowRemoteModels: boolean;
  allowLocalModels: boolean;
  useBrowserCache?: boolean;
  useWasmCache?: boolean;
  cacheKey?: string;
};

type TransformersLogLevel = {
  ERROR?: unknown;
  WARNING: unknown;
};

const KOKORO_CACHE_KEY = "wave-kokoro-voice-test-cache";
const EXPECTED_ONNX_PROVIDER_WARNINGS = [
  "Some nodes were not assigned to the preferred execution providers",
  "Rerunning with verbose output on a non-minimal build will show node assignments",
] as const;

const kokoroLoadListeners = new Set<(state: VoiceModelLoadState) => void>();

let kokoroLoadState: VoiceModelLoadState = {
  phase: "idle",
  status: "idle",
  progress: null,
  message: "Kokoro has not been loaded.",
  modelId: null,
  device: KOKORO_DEVICE,
};
const kokoroPromises = new Map<KokoroRuntimeId, Promise<KokoroTtsInstance>>();
let audioElement: HTMLAudioElement | null = null;
const activeObjectUrls = new Set<string>();
let playbackToken = 0;
let activePlaybackAbort: (() => void) | null = null;

export function getKokoroLoadState(): VoiceModelLoadState {
  return kokoroLoadState;
}

export function subscribeKokoroLoad(
  listener: (state: VoiceModelLoadState) => void,
): () => void {
  kokoroLoadListeners.add(listener);
  listener(kokoroLoadState);
  return () => {
    kokoroLoadListeners.delete(listener);
  };
}

export function createKokoroTextToSpeechEngine(
  runtimeId: KokoroRuntimeId = KOKORO_DEFAULT_RUNTIME_ID,
): KokoroTextToSpeechEngine {
  const runtime = getKokoroRuntime(runtimeId);
  return {
    runtime,
    getVoices: () => getVoices(runtime.id),
    speak: (text, preferredVoiceId, options) =>
      speak(text, preferredVoiceId, runtime.id, options),
    speakStream: (chunks, preferredVoiceId, options) =>
      speakStream(chunks, preferredVoiceId, runtime.id, options),
    stop,
  };
}

export async function preloadKokoroTextToSpeech(
  runtimeId: KokoroRuntimeId = KOKORO_DEFAULT_RUNTIME_ID,
): Promise<void> {
  await getKokoro(getKokoroRuntime(runtimeId));
}

export async function getVoices(
  runtimeId: KokoroRuntimeId = KOKORO_DEFAULT_RUNTIME_ID,
): Promise<KokoroVoiceInfo[]> {
  const tts = await getKokoro(getKokoroRuntime(runtimeId));
  return listKokoroVoices(tts);
}

export async function speak(
  text: string,
  preferredVoiceId = KOKORO_DEFAULT_VOICE_ID,
  runtimeId: KokoroRuntimeId = KOKORO_DEFAULT_RUNTIME_ID,
  options: TextToSpeechOptions = {},
): Promise<TextToSpeechResult> {
  const cleanText = text.trim();
  if (cleanText.length === 0) {
    return {
      elapsedMs: 0,
      backend: "kokoro",
      playbackMode: "full-response",
      voice: null,
      kokoroVoice: null,
      usedLocalVoice: true,
      warning: "No response text was available to speak.",
      firstAudioMs: null,
      chunkCount: 0,
    };
  }

  const startedAt = performance.now();
  const token = beginPlayback();
  const runtime = getKokoroRuntime(runtimeId);
  const tts = await getKokoro(runtime);
  const selectedVoice = selectKokoroVoice(tts, preferredVoiceId);
  const voiceId = selectedVoice.id;
  const audio = await tts.generate(cleanText, {
    voice: voiceId,
    speed: 0.94,
  });
  throwIfStopped(token);

  const objectUrl = URL.createObjectURL(audio.toBlob());
  activeObjectUrls.add(objectUrl);
  audioElement = new Audio(objectUrl);

  return new Promise((resolve, reject) => {
    const player = audioElement;
    if (!player) {
      resolve({
        elapsedMs: Math.round(performance.now() - startedAt),
        backend: "kokoro",
        playbackMode: "full-response",
        voice: null,
        kokoroVoice: selectedVoice,
        usedLocalVoice: true,
        warning: "Kokoro audio player could not be created.",
        firstAudioMs: null,
        chunkCount: 1,
      });
      return;
    }

    let settled = false;
    let firstAudioMs: number | null = null;
    const abortPlayback = () => {
      if (settled) return;
      settled = true;
      player.pause();
      player.currentTime = 0;
      finishPlayback();
      reject(new DOMException("Kokoro playback stopped.", "AbortError"));
    };
    activePlaybackAbort = abortPlayback;

    function finishPlayback() {
      releaseObjectUrl(objectUrl);
      if (audioElement === player) audioElement = null;
      if (activePlaybackAbort === abortPlayback) activePlaybackAbort = null;
    }

    function finish(warning: string | null) {
      if (settled) return;
      settled = true;
      finishPlayback();
      resolve({
        elapsedMs: Math.round(performance.now() - startedAt),
        backend: "kokoro",
        playbackMode: "full-response",
        voice: null,
        kokoroVoice: selectedVoice,
        usedLocalVoice: true,
        warning,
        firstAudioMs,
        chunkCount: 1,
      });
    }

    player.onplaying = () => {
      firstAudioMs ??= Math.round(performance.now() - startedAt);
      options.onPlaybackEvent?.({
        status: "start",
        backend: "kokoro",
        chunkIndex: 1,
        text: cleanText,
      });
    };
    player.onended = () => {
      options.onPlaybackEvent?.({
        status: "end",
        backend: "kokoro",
        chunkIndex: 1,
        text: cleanText,
      });
      finish(null);
    };
    player.onerror = () => {
      options.onPlaybackEvent?.({
        status: "end",
        backend: "kokoro",
        chunkIndex: 1,
        text: cleanText,
      });
      finish("Kokoro audio playback failed.");
    };
    void player.play().catch((err: unknown) => {
      finish(
        err instanceof Error
          ? err.message
          : "Kokoro audio playback was blocked.",
      );
    });
  });
}

export async function speakStream(
  chunks: AsyncIterable<string>,
  preferredVoiceId = KOKORO_DEFAULT_VOICE_ID,
  runtimeId: KokoroRuntimeId = KOKORO_DEFAULT_RUNTIME_ID,
  options: {
    onEvent?: (event: KokoroStreamPlaybackEvent) => void;
    onPlaybackEvent?: (event: TtsPlaybackLifecycleEvent) => void;
  } = {},
): Promise<TextToSpeechResult> {
  const startedAt = performance.now();
  const token = beginPlayback();
  const runtime = getKokoroRuntime(runtimeId);
  const tts = await getKokoro(runtime);
  const selectedVoice = selectKokoroVoice(tts, preferredVoiceId);
  const module = await importKokoroModule();

  if (typeof tts.stream === "function" && module.TextSplitterStream) {
    return speakNativeKokoroStream({
      chunks,
      selectedVoice,
      startedAt,
      token,
      tts,
      TextSplitterStream: module.TextSplitterStream,
      onEvent: options.onEvent,
      onPlaybackEvent: options.onPlaybackEvent,
    });
  }

  return speakManualSentenceStream({
    chunks,
    selectedVoice,
    startedAt,
    token,
    tts,
    onEvent: options.onEvent,
    onPlaybackEvent: options.onPlaybackEvent,
    fallbackReason: "Native Kokoro stream API was unavailable.",
  });
}

async function speakNativeKokoroStream({
  chunks,
  selectedVoice,
  startedAt,
  token,
  tts,
  TextSplitterStream,
  onEvent,
  onPlaybackEvent,
}: {
  chunks: AsyncIterable<string>;
  selectedVoice: KokoroVoiceInfo;
  startedAt: number;
  token: number;
  tts: KokoroTtsInstance;
  TextSplitterStream: KokoroTextSplitterStreamConstructor;
  onEvent?: (event: KokoroStreamPlaybackEvent) => void;
  onPlaybackEvent?: (event: TtsPlaybackLifecycleEvent) => void;
}): Promise<TextToSpeechResult> {
  const mode = "native-kokoro-stream";
  const splitter = new TextSplitterStream();
  const queue = new AsyncPromiseQueue<GeneratedAudioChunk>();
  let chunkCount = 0;
  let firstAudioMs: number | null = null;
  let warning: string | null = null;

  const pushPromise = (async () => {
    try {
      for await (const text of chunks) {
        throwIfStopped(token);
        if (text.trim().length === 0) continue;
        onEvent?.({ status: "generating", chunkIndex: 0, text, mode });
        splitter.push(text);
      }
      splitter.close();
    } catch (err) {
      safeCloseTextSplitter(splitter);
      queue.fail(err);
    }
  })();

  const streamPromise = (async () => {
    try {
      if (!tts.stream) {
        throw new Error("Native Kokoro stream API was unavailable.");
      }

      const stream = tts.stream(splitter, {
        voice: selectedVoice.id,
        speed: 0.94,
      });

      for await (const generatedChunk of stream) {
        throwIfStopped(token);
        const cleanText = generatedChunk.text.trim();
        chunkCount += 1;
        const chunkIndex = chunkCount;
        onEvent?.({
          status: "generating",
          chunkIndex,
          text: cleanText,
          mode,
        });
        queue.enqueue(
          Promise.resolve({
            audio: generatedChunk.audio,
            chunkIndex,
            text: cleanText,
          }),
        );
      }
      queue.close();
    } catch (err) {
      queue.fail(err);
    }
  })();

  try {
    onEvent?.({ status: "buffering", chunkIndex: 0, text: "", mode });
    while (true) {
      const generatedChunk = await queue.next();
      if (!generatedChunk) break;
      throwIfStopped(token);
      if (firstAudioMs === null) {
        firstAudioMs = Math.round(performance.now() - startedAt);
      }
      onEvent?.({
        status: "playing",
        chunkIndex: generatedChunk.chunkIndex,
        text: generatedChunk.text,
        mode,
      });
      await playRawAudio(generatedChunk.audio, token, {
        onStart: () =>
          onPlaybackEvent?.({
            status: "start",
            backend: "kokoro",
            chunkIndex: generatedChunk.chunkIndex,
            text: generatedChunk.text,
          }),
        onEnd: () =>
          onPlaybackEvent?.({
            status: "end",
            backend: "kokoro",
            chunkIndex: generatedChunk.chunkIndex,
            text: generatedChunk.text,
          }),
      });
    }
    await pushPromise;
    await streamPromise;
    onEvent?.({ status: "finished", chunkIndex: chunkCount, text: "", mode });
  } catch (err) {
    safeCloseTextSplitter(splitter);
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    warning =
      err instanceof Error
        ? err.message
        : "Native Kokoro streaming playback failed.";
  }

  return {
    elapsedMs: Math.round(performance.now() - startedAt),
    backend: "kokoro",
    playbackMode: "streaming-sentence",
    voice: null,
    kokoroVoice: selectedVoice,
    usedLocalVoice: true,
    warning,
    firstAudioMs,
    chunkCount,
    streamMode: mode,
  };
}

async function speakManualSentenceStream({
  chunks,
  selectedVoice,
  startedAt,
  token,
  tts,
  onEvent,
  onPlaybackEvent,
  fallbackReason,
}: {
  chunks: AsyncIterable<string>;
  selectedVoice: KokoroVoiceInfo;
  startedAt: number;
  token: number;
  tts: KokoroTtsInstance;
  onEvent?: (event: KokoroStreamPlaybackEvent) => void;
  onPlaybackEvent?: (event: TtsPlaybackLifecycleEvent) => void;
  fallbackReason?: string;
}): Promise<TextToSpeechResult> {
  const mode = "manual-sentence-chunks";
  let generatedChain: Promise<unknown> = Promise.resolve();
  let chunkCount = 0;
  let firstAudioMs: number | null = null;
  let warning: string | null = fallbackReason ?? null;

  const queue = new AsyncPromiseQueue<GeneratedAudioChunk>();
  const sentenceBuffer = new SentenceChunkBuffer();

  function enqueueTextChunk(text: string): void {
    const cleanText = text.trim();
    if (cleanText.length === 0) return;
    chunkCount += 1;
    const chunkIndex = chunkCount;
    onEvent?.({ status: "generating", chunkIndex, text: cleanText, mode });
    const audioPromise = generatedChain.then(async () => {
      throwIfStopped(token);
      const audio = await tts.generate(cleanText, {
        voice: selectedVoice.id,
        speed: 0.94,
      });
      throwIfStopped(token);
      return { audio, chunkIndex, text: cleanText };
    });
    generatedChain = audioPromise.then(() => undefined);
    queue.enqueue(audioPromise);
  }

  void (async () => {
    try {
      for await (const text of chunks) {
        throwIfStopped(token);
        for (const chunk of sentenceBuffer.push(text)) {
          enqueueTextChunk(chunk);
        }
      }
      for (const chunk of sentenceBuffer.flush()) {
        enqueueTextChunk(chunk);
      }
      await generatedChain;
      queue.close();
    } catch (err) {
      queue.fail(err);
    }
  })();

  try {
    onEvent?.({ status: "buffering", chunkIndex: 0, text: "", mode });
    while (true) {
      const generatedChunk = await queue.next();
      if (!generatedChunk) break;
      throwIfStopped(token);
      if (firstAudioMs === null) {
        firstAudioMs = Math.round(performance.now() - startedAt);
      }
      onEvent?.({
        status: "playing",
        chunkIndex: generatedChunk.chunkIndex,
        text: generatedChunk.text,
        mode,
      });
      await playRawAudio(generatedChunk.audio, token, {
        onStart: () =>
          onPlaybackEvent?.({
            status: "start",
            backend: "kokoro",
            chunkIndex: generatedChunk.chunkIndex,
            text: generatedChunk.text,
          }),
        onEnd: () =>
          onPlaybackEvent?.({
            status: "end",
            backend: "kokoro",
            chunkIndex: generatedChunk.chunkIndex,
            text: generatedChunk.text,
          }),
      });
    }
    onEvent?.({ status: "finished", chunkIndex: chunkCount, text: "", mode });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    warning =
      err instanceof Error ? err.message : "Kokoro streaming playback failed.";
  }

  return {
    elapsedMs: Math.round(performance.now() - startedAt),
    backend: "kokoro",
    playbackMode: "streaming-sentence",
    voice: null,
    kokoroVoice: selectedVoice,
    usedLocalVoice: true,
    warning,
    firstAudioMs,
    chunkCount,
    streamMode: mode,
  };
}

function safeCloseTextSplitter(splitter: KokoroTextSplitterStream): void {
  try {
    splitter.close();
  } catch {
    // Kokoro can already close the native splitter during interrupted playback.
  }
}

export function stop(): void {
  playbackToken += 1;
  activePlaybackAbort?.();
  activePlaybackAbort = null;
  if (audioElement) {
    audioElement.pause();
    audioElement.currentTime = 0;
    audioElement = null;
  }

  for (const objectUrl of activeObjectUrls) {
    URL.revokeObjectURL(objectUrl);
  }
  activeObjectUrls.clear();
}

async function getKokoro(
  runtime: KokoroRuntimeOption,
): Promise<KokoroTtsInstance> {
  const existingPromise = kokoroPromises.get(runtime.id);
  if (existingPromise) return existingPromise;

  const kokoroPromise = (async () => {
    setKokoroLoadState({
      phase: "loading",
      status: "initializing",
      progress: null,
      message: `Preparing Kokoro local TTS (${runtime.label}).`,
      modelId: KOKORO_MODEL_ID,
      device: runtime.device,
    });

    const { env, LogLevel } = await import("@huggingface/transformers");
    configureKokoroTransformersEnvironment(
      env as TransformersEnv,
      LogLevel as TransformersLogLevel,
    );

    const module = await importKokoroModule();
    const tts = await suppressExpectedOnnxProviderWarning(() =>
      module.KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
        dtype: runtime.dtype,
        device: runtime.device,
        progress_callback: (progress) => handleKokoroProgress(progress, runtime),
      }),
    );

    setKokoroLoadState({
      phase: "ready",
      status: "ready",
      progress: 100,
      message: `Kokoro is ready for local speech generation (${runtime.label}).`,
      modelId: KOKORO_MODEL_ID,
      device: runtime.device,
    });

    return tts;
  })().catch((err) => {
    kokoroPromises.delete(runtime.id);
    setKokoroLoadState({
      phase: "error",
      status: "error",
      progress: null,
      message:
        err instanceof Error ? err.message : "Kokoro could not be loaded.",
      modelId: KOKORO_MODEL_ID,
      device: runtime.device,
    });
    throw err;
  });

  kokoroPromises.set(runtime.id, kokoroPromise);
  return kokoroPromise;
}

async function importKokoroModule(): Promise<KokoroModule> {
  return (await import("kokoro-js")) as KokoroModule;
}

function configureKokoroTransformersEnvironment(
  env: TransformersEnv,
  logLevel: TransformersLogLevel,
): void {
  env.logLevel = logLevel.ERROR ?? logLevel.WARNING;
  env.allowRemoteModels = true;
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.useWasmCache = true;
  env.cacheKey = KOKORO_CACHE_KEY;
}

async function suppressExpectedOnnxProviderWarning<T>(
  action: () => Promise<T>,
): Promise<T> {
  const originalWarn = console.warn;
  const originalError = console.error;

  function shouldSuppress(args: readonly unknown[]): boolean {
    return args.some(
      (arg) =>
        typeof arg === "string" &&
        EXPECTED_ONNX_PROVIDER_WARNINGS.some((warning) =>
          arg.includes(warning),
        ),
    );
  }

  console.warn = (...args: unknown[]) => {
    if (shouldSuppress(args)) return;
    originalWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    if (shouldSuppress(args)) return;
    originalError(...args);
  };

  try {
    return await action();
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
}

function listKokoroVoices(tts: KokoroTtsInstance): KokoroVoiceInfo[] {
  const voiceRecord =
    tts.voices && typeof tts.voices === "object" ? tts.voices : null;
  if (voiceRecord) {
    return Object.entries(voiceRecord).map(([id, metadata]) => ({
      id,
      name: metadata.name ?? id,
      language: metadata.language ?? "unknown",
      gender: metadata.gender ?? "unknown",
      traits: metadata.traits ?? null,
      targetQuality: metadata.targetQuality ?? null,
      overallGrade: metadata.overallGrade ?? null,
    }));
  }

  const listed = tts.list_voices?.();
  if (Array.isArray(listed)) {
    return listed
      .filter((voice): voice is string => typeof voice === "string")
      .map((id) => ({
        id,
        name: id,
        language: "unknown",
        gender: "unknown",
        traits: null,
        targetQuality: null,
        overallGrade: null,
      }));
  }

  return [
    {
      id: KOKORO_DEFAULT_VOICE_ID,
      name: KOKORO_DEFAULT_VOICE_ID,
      language: "en-us",
      gender: "female",
      traits: null,
      targetQuality: null,
      overallGrade: "A",
    },
  ];
}

function selectKokoroVoice(
  tts: KokoroTtsInstance,
  preferredVoiceId: string,
): KokoroVoiceInfo {
  const voices = listKokoroVoices(tts);
  return (
    voices.find((voice) => voice.id === preferredVoiceId) ??
    voices.find((voice) => voice.id === KOKORO_DEFAULT_VOICE_ID) ??
    voices[0] ?? {
      id: KOKORO_DEFAULT_VOICE_ID,
      name: KOKORO_DEFAULT_VOICE_ID,
      language: "en-us",
      gender: "female",
      traits: null,
      targetQuality: null,
      overallGrade: "A",
    }
  );
}

function handleKokoroProgress(
  progress: ProgressInfo,
  runtime: KokoroRuntimeOption,
): void {
  const progressRecord = progress as ProgressInfo & { progress?: unknown };
  const rawProgress =
    typeof progressRecord.progress === "number" ? progressRecord.progress : null;
  const progressValue =
    rawProgress === null ? null : Math.max(0, Math.min(100, rawProgress));
  const status =
    typeof progress.status === "string" ? progress.status : "loading";

  setKokoroLoadState({
    phase: "loading",
    status,
    progress: progressValue,
    message:
      progressValue === null
        ? `Loading Kokoro local TTS (${runtime.label}).`
        : `Loading Kokoro local TTS (${runtime.label}): ${progressValue.toFixed(0)}%.`,
    modelId: KOKORO_MODEL_ID,
    device: runtime.device,
  });
}

export function getKokoroRuntime(
  runtimeId: KokoroRuntimeId,
): KokoroRuntimeOption {
  return (
    KOKORO_RUNTIME_OPTIONS.find((runtime) => runtime.id === runtimeId) ??
    KOKORO_RUNTIME_OPTIONS[0]
  );
}

function setKokoroLoadState(nextState: VoiceModelLoadState): void {
  kokoroLoadState = nextState;
  for (const listener of kokoroLoadListeners) {
    listener(nextState);
  }
}

function releaseObjectUrl(objectUrl: string): void {
  activeObjectUrls.delete(objectUrl);
  URL.revokeObjectURL(objectUrl);
}

async function playRawAudio(
  audio: KokoroRawAudio,
  token: number,
  options: {
    onStart?: () => void;
    onEnd?: () => void;
  } = {},
): Promise<void> {
  throwIfStopped(token);
  const objectUrl = URL.createObjectURL(audio.toBlob());
  activeObjectUrls.add(objectUrl);
  audioElement = new Audio(objectUrl);

  await new Promise<void>((resolve, reject) => {
    const player = audioElement;
    if (!player) {
      reject(new Error("Kokoro audio player could not be created."));
      return;
    }

    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
      releaseObjectUrl(objectUrl);
      if (audioElement === player) audioElement = null;
      if (activePlaybackAbort === abortPlayback) activePlaybackAbort = null;
    };
    const abortPlayback = () => {
      player.pause();
      player.currentTime = 0;
      finish(() => {
        options.onEnd?.();
        reject(new DOMException("Kokoro playback stopped.", "AbortError"));
      });
    };
    activePlaybackAbort = abortPlayback;

    player.onplaying = () => {
      options.onStart?.();
    };
    player.onended = () => {
      finish(() => {
        options.onEnd?.();
        resolve();
      });
    };
    player.onerror = () => {
      finish(() => {
        options.onEnd?.();
        reject(new Error("Kokoro audio playback failed."));
      });
    };
    void player.play().catch((err: unknown) => {
      finish(() => {
        options.onEnd?.();
        reject(err);
      });
    });
  });
}

function beginPlayback(): number {
  stop();
  playbackToken += 1;
  return playbackToken;
}

function throwIfStopped(token: number): void {
  if (token !== playbackToken) {
    throw new DOMException("Kokoro playback stopped.", "AbortError");
  }
}

interface GeneratedAudioChunk {
  audio: KokoroRawAudio;
  chunkIndex: number;
  text: string;
}

class AsyncPromiseQueue<T> {
  private readonly items: Array<Promise<T>> = [];
  private readonly readers: Array<(value: Promise<T> | null) => void> = [];
  private closed = false;
  private failure: unknown = null;

  enqueue(item: Promise<T>): void {
    if (this.closed) return;
    const reader = this.readers.shift();
    if (reader) {
      reader(item);
      return;
    }
    this.items.push(item);
  }

  close(): void {
    this.closed = true;
    while (this.readers.length > 0) {
      this.readers.shift()?.(null);
    }
  }

  fail(error: unknown): void {
    this.failure = error;
    this.close();
  }

  async next(): Promise<T | null> {
    if (this.failure) throw this.failure;
    const item = this.items.shift();
    if (item) return item;
    if (this.closed) return null;

    const nextItem = await new Promise<Promise<T> | null>((resolve) => {
      this.readers.push(resolve);
    });
    if (!nextItem) {
      if (this.failure) throw this.failure;
      return null;
    }
    return nextItem;
  }
}
