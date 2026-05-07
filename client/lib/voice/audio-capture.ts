import type {
  AudioCaptureResult,
  VoiceRuntimeCapabilities,
} from "@/lib/voice/types";

const TARGET_SAMPLE_RATE = 16_000;
const LEVEL_POLL_MS = 80;
const DEFAULT_SILENCE_THRESHOLD = 0.025;
const DEFAULT_SILENCE_TIMEOUT_MS = 1000;

export interface AudioCaptureLevel {
  rms: number;
  peak: number;
  speaking: boolean;
}

export interface AudioCaptureOptions {
  autoStopOnSilence?: boolean;
  silenceThreshold?: number;
  silenceTimeoutMs?: number;
  onLevel?: (level: AudioCaptureLevel) => void;
  onSpeechStart?: () => void;
  onSilence?: () => void;
}

export interface AudioCaptureController {
  stop(): Promise<AudioCaptureResult>;
  cancel(): void;
}

export function getVoiceRuntimeCapabilities(): VoiceRuntimeCapabilities {
  const hasWindow = typeof window !== "undefined";
  const hasNavigator = typeof navigator !== "undefined";
  return {
    hasWindow,
    hasNavigator,
    hasMicrophoneApi: Boolean(
      hasNavigator && navigator.mediaDevices?.getUserMedia,
    ),
    hasMediaRecorder: typeof MediaRecorder !== "undefined",
    hasSpeechSynthesis: hasWindow && "speechSynthesis" in window,
    hasWebGpu: hasNavigator && "gpu" in navigator,
    isSecureContext: hasWindow && window.isSecureContext,
    crossOriginIsolated:
      typeof globalThis !== "undefined" && globalThis.crossOriginIsolated,
  };
}

export async function startAudioCapture(
  options: AudioCaptureOptions = {},
): Promise<AudioCaptureController> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone capture is not available in this browser.");
  }
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not available in this browser.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const recorder = new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  const startedAt = performance.now();
  const levelBuffer = new Float32Array(analyser.fftSize);
  const silenceThreshold =
    options.silenceThreshold ?? DEFAULT_SILENCE_THRESHOLD;
  const silenceTimeoutMs =
    options.silenceTimeoutMs ?? DEFAULT_SILENCE_TIMEOUT_MS;

  let peakLevel = 0;
  let sawSpeech = false;
  let lastSpeechAt = performance.now();
  let stopped = false;
  let cancelled = false;
  let stopPromise: Promise<AudioCaptureResult> | null = null;

  const levelTimer = window.setInterval(() => {
    analyser.getFloatTimeDomainData(levelBuffer);
    const level = computeLevel(levelBuffer);
    peakLevel = Math.max(peakLevel, level.peak);
    const speaking = level.rms >= silenceThreshold;

    if (speaking) {
      if (!sawSpeech) options.onSpeechStart?.();
      sawSpeech = true;
      lastSpeechAt = performance.now();
    }

    options.onLevel?.({ ...level, speaking });

    if (
      options.autoStopOnSilence &&
      sawSpeech &&
      performance.now() - lastSpeechAt >= silenceTimeoutMs
    ) {
      options.onSilence?.();
      void stop();
    }
  }, LEVEL_POLL_MS);

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();

  async function stop(): Promise<AudioCaptureResult> {
    if (stopPromise) return stopPromise;
    stopped = true;
    stopPromise = new Promise<AudioCaptureResult>((resolve, reject) => {
      recorder.onstop = () => {
        cleanup();
        if (cancelled) {
          reject(new DOMException("Capture cancelled.", "AbortError"));
          return;
        }

        const blob = new Blob(chunks, {
          type: recorder.mimeType || "audio/webm",
        });

        void decodeAndResampleAudio(blob, TARGET_SAMPLE_RATE)
          .then((audio) => {
            resolve({
              audio,
              sampleRate: TARGET_SAMPLE_RATE,
              durationMs: Math.round(performance.now() - startedAt),
              peakLevel,
            });
          })
          .catch(reject);
      };

      if (recorder.state === "inactive") {
        recorder.onstop?.(new Event("stop"));
        return;
      }
      recorder.stop();
    });

    return stopPromise;
  }

  function cancel(): void {
    cancelled = true;
    if (!stopped && recorder.state !== "inactive") {
      recorder.stop();
    }
    cleanup();
  }

  function cleanup(): void {
    window.clearInterval(levelTimer);
    source.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    void audioContext.close().catch(() => undefined);
  }

  return { stop, cancel };
}

async function decodeAndResampleAudio(
  blob: Blob,
  targetSampleRate: number,
): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const decodeContext = new AudioContext();
  const audioBuffer = await decodeContext.decodeAudioData(arrayBuffer);
  await decodeContext.close();

  const monoAudio = mixToMono(audioBuffer);
  if (audioBuffer.sampleRate === targetSampleRate) return monoAudio;
  return resampleLinear(monoAudio, audioBuffer.sampleRate, targetSampleRate);
}

function mixToMono(audioBuffer: AudioBuffer): Float32Array {
  const output = new Float32Array(audioBuffer.length);
  const channels = audioBuffer.numberOfChannels;

  for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
    const channelData = audioBuffer.getChannelData(channelIndex);
    for (let sampleIndex = 0; sampleIndex < channelData.length; sampleIndex += 1) {
      output[sampleIndex] += channelData[sampleIndex] / channels;
    }
  }

  return output;
}

function resampleLinear(
  input: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number,
): Float32Array {
  const outputLength = Math.max(
    1,
    Math.round((input.length * outputSampleRate) / inputSampleRate),
  );
  const output = new Float32Array(outputLength);
  const ratio = inputSampleRate / outputSampleRate;

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const sourceIndex = outputIndex * ratio;
    const lowerIndex = Math.floor(sourceIndex);
    const upperIndex = Math.min(lowerIndex + 1, input.length - 1);
    const weight = sourceIndex - lowerIndex;
    output[outputIndex] =
      input[lowerIndex] * (1 - weight) + input[upperIndex] * weight;
  }

  return output;
}

function computeLevel(samples: Float32Array): { rms: number; peak: number } {
  let sumSquares = 0;
  let peak = 0;

  for (const sample of samples) {
    const magnitude = Math.abs(sample);
    peak = Math.max(peak, magnitude);
    sumSquares += sample * sample;
  }

  return {
    rms: Math.sqrt(sumSquares / samples.length),
    peak,
  };
}
