// Kokoro TTS service — one shared streaming engine + PCM player, reused
// across the chunk player, the check-in voice loop, and reflection.
//
// Lifted verbatim from the proven KokoroTestScreen path (kokoro-en-v0_19
// fp32, CoreML, sherpa's native PCM player). Lazy-imported so Metro
// never resolves the native bindings on web/dev.
//
// IMPORTANT (deploy.md audio pitfall): never call
// setAudioModeAsync({ allowsRecording: true }) while a phrase is
// playing — sherpa's startPcmPlayer owns the session during playback.

import { setAudioModeAsync } from "expo-audio";

type StreamingTtsEngine = {
  generateSpeechStream: (
    text: string,
    opts: unknown,
    handlers: {
      onChunk?: (c: { samples: number[]; sampleRate: number; isFinal: boolean }) => void;
      onEnd?: (e: { cancelled: boolean }) => void;
      onError?: (e: { message: string }) => void;
    },
  ) => Promise<{ cancel: () => Promise<void> }>;
  cancelSpeechStream: () => Promise<void>;
  startPcmPlayer: (sampleRate: number, channels: number) => Promise<void>;
  writePcmChunk: (samples: number[]) => Promise<void>;
  stopPcmPlayer: () => Promise<void>;
  destroy: () => Promise<void>;
};

const KOKORO_MODEL_ID = "kokoro-en-v0_19";

let enginePromise: Promise<StreamingTtsEngine> | null = null;
let playerActive = false;
let speaking = false;

export type TtsProgress = (pct: number) => void;

export function ensureKokoro(onProgress?: TtsProgress): Promise<StreamingTtsEngine> {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const tag = "[wave][kokoro]";
    try {
      await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
      const dl: any = await import("react-native-sherpa-onnx/download");
      const ttsMod: any = await import("react-native-sherpa-onnx/tts");
      console.log(`${tag} ensure model ${KOKORO_MODEL_ID}`);
      await dl.refreshModelsByCategory(dl.ModelCategory.Tts);
      const res = await dl.ensureModelByCategory(dl.ModelCategory.Tts, KOKORO_MODEL_ID, {
        onProgress: (p: { percent: number }) => {
          console.log(`${tag} download ${Math.round(p.percent)}%`);
          onProgress?.(p.percent / 100);
        },
      });
      console.log(`${tag} createStreamingTTS`);
      const tts = (await ttsMod.createStreamingTTS({
        modelPath: { type: "file", path: res.localPath },
        modelType: "kokoro",
        providers: ["CoreMLExecutionProvider"],
      })) as StreamingTtsEngine;
      console.log(`${tag} ready`);
      return tts;
    } catch (err) {
      enginePromise = null;
      console.error("[wave][kokoro] init failed:", err instanceof Error ? err.message : err);
      throw err;
    }
  })();
  return enginePromise;
}

/**
 * Speak one phrase. Resolves when synthesis ends (a short tail covers
 * the final buffer still draining through the native player). The PCM
 * player stays resident across calls — call stopSpeaking() when leaving
 * the surface to release it. Rejects on engine error; callers fall back
 * to a timed beat so a TTS failure never strands the flow.
 */
export async function speak(text: string): Promise<void> {
  const phrase = text.trim();
  if (!phrase) return;
  const engine = await ensureKokoro();
  speaking = true;
  await new Promise<void>((resolve, reject) => {
    let firstChunk = true;
    let chain: Promise<unknown> = Promise.resolve();
    let totalSamples = 0;
    let sr = 24_000;
    let playbackStartedAt = 0;
    engine
      .generateSpeechStream(phrase, undefined, {
        onChunk: (c) => {
          if (firstChunk) {
            firstChunk = false;
            sr = c.sampleRate;
            // Real playback begins ~when the first PCM enters the player.
            playbackStartedAt = Date.now();
            if (!playerActive) {
              playerActive = true;
              chain = engine
                .startPcmPlayer(c.sampleRate, 1)
                .then(() => engine.writePcmChunk(c.samples))
                .catch(() => {});
              totalSamples += c.samples.length;
              return;
            }
          }
          totalSamples += c.samples.length;
          chain = chain.then(() => engine.writePcmChunk(c.samples).catch(() => {}));
        },
        onEnd: () => {
          // onEnd = SYNTHESIS done (fast). The PCM player is still
          // draining real-time audio. Resolving now (the old flat 450ms)
          // returned before the phrase finished — so the opener got cut
          // / the turn passed before WAVE spoke, and replies were
          // truncated when finalize() navigated away. Wait for the
          // ACTUAL remaining audio duration (CombinedVoiceTestScreen's
          // proven drain calc) + a margin for the player's scheduling.
          const audioMs = (totalSamples / (sr || 24_000)) * 1000;
          const elapsed = playbackStartedAt ? Date.now() - playbackStartedAt : 0;
          const drainMs = Math.max(0, audioMs - elapsed) + 600;
          setTimeout(resolve, drainMs);
        },
        onError: (e) => reject(new Error(e.message)),
      })
      .catch(reject);
  }).finally(() => {
    speaking = false;
  });
}

export function isSpeaking(): boolean {
  return speaking;
}

/** Stop playback + cancel any in-flight synthesis and release the player. */
export async function stopSpeaking(): Promise<void> {
  const engine = enginePromise ? await enginePromise.catch(() => null) : null;
  if (!engine) return;
  try {
    await engine.cancelSpeechStream();
  } catch {
    /* nothing in flight */
  }
  if (playerActive) {
    playerActive = false;
    try {
      await engine.stopPcmPlayer();
    } catch {
      /* already stopped */
    }
  }
  speaking = false;
}
