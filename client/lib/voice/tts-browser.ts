import type {
  BrowserVoiceInfo,
  TextToSpeechEngine,
  TextToSpeechOptions,
  TextToSpeechResult,
} from "@/lib/voice/types";

const VOICE_LOAD_TIMEOUT_MS = 1200;
let activeSpeechAbort: (() => void) | null = null;

export function createBrowserTextToSpeechEngine(): TextToSpeechEngine {
  return {
    getVoices,
    speak,
    stop,
  };
}

export async function getVoices(): Promise<BrowserVoiceInfo[]> {
  if (!hasSpeechSynthesis()) return [];

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) return voices.map(toVoiceInfo);

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve(window.speechSynthesis.getVoices().map(toVoiceInfo));
    }, VOICE_LOAD_TIMEOUT_MS);

    function handleVoicesChanged() {
      cleanup();
      resolve(window.speechSynthesis.getVoices().map(toVoiceInfo));
    }

    function cleanup() {
      window.clearTimeout(timeout);
      window.speechSynthesis.removeEventListener(
        "voiceschanged",
        handleVoicesChanged,
      );
    }

    window.speechSynthesis.addEventListener(
      "voiceschanged",
      handleVoicesChanged,
    );
  });
}

export async function speak(
  text: string,
  preferredVoiceURI?: string,
  options: TextToSpeechOptions = {},
): Promise<TextToSpeechResult> {
  if (!hasSpeechSynthesis()) {
    return {
      elapsedMs: 0,
      backend: "browser-speech",
      playbackMode: "full-response",
      voice: null,
      kokoroVoice: null,
      usedLocalVoice: false,
      warning: "Browser speech synthesis is unavailable; showing text only.",
      firstAudioMs: null,
      chunkCount: 0,
    };
  }

  const cleanText = text.trim();
  if (cleanText.length === 0) {
    return {
      elapsedMs: 0,
      backend: "browser-speech",
      playbackMode: "full-response",
      voice: null,
      kokoroVoice: null,
      usedLocalVoice: false,
      warning: "No response text was available to speak.",
      firstAudioMs: null,
      chunkCount: 0,
    };
  }

  const voices = window.speechSynthesis.getVoices();
  const selectedVoice = selectLocalVoice(voices, preferredVoiceURI);
  if (!selectedVoice) {
    return {
      elapsedMs: 0,
      backend: "browser-speech",
      playbackMode: "full-response",
      voice: null,
      kokoroVoice: null,
      usedLocalVoice: false,
      warning:
        "No confirmed local browser voice is available; remote TTS was not used.",
      firstAudioMs: null,
      chunkCount: 0,
    };
  }

  stop();

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.voice = selectedVoice;
  utterance.rate = 0.94;
  utterance.pitch = 1;
  utterance.volume = 1;

  const startedAt = performance.now();

  return new Promise((resolve, reject) => {
    let settled = false;
    const abortSpeech = () => {
      if (settled) return;
      settled = true;
      activeSpeechAbort = null;
      options.onPlaybackEvent?.({
        status: "end",
        backend: "browser-speech",
        chunkIndex: 1,
        text: cleanText,
      });
      reject(new DOMException("Browser speech stopped.", "AbortError"));
    };
    activeSpeechAbort = abortSpeech;

    utterance.onstart = () => {
      options.onPlaybackEvent?.({
        status: "start",
        backend: "browser-speech",
        chunkIndex: 1,
        text: cleanText,
      });
    };

    utterance.onend = () => {
      if (settled) return;
      settled = true;
      activeSpeechAbort = null;
      options.onPlaybackEvent?.({
        status: "end",
        backend: "browser-speech",
        chunkIndex: 1,
        text: cleanText,
      });
      resolve({
        elapsedMs: Math.round(performance.now() - startedAt),
        backend: "browser-speech",
        playbackMode: "full-response",
        voice: toVoiceInfo(selectedVoice),
        kokoroVoice: null,
        usedLocalVoice: selectedVoice.localService,
        warning: null,
        firstAudioMs: null,
        chunkCount: 1,
      });
    };

    utterance.onerror = (event) => {
      if (settled) return;
      settled = true;
      activeSpeechAbort = null;
      options.onPlaybackEvent?.({
        status: "end",
        backend: "browser-speech",
        chunkIndex: 1,
        text: cleanText,
      });
      resolve({
        elapsedMs: Math.round(performance.now() - startedAt),
        backend: "browser-speech",
        playbackMode: "full-response",
        voice: toVoiceInfo(selectedVoice),
        kokoroVoice: null,
        usedLocalVoice: selectedVoice.localService,
        warning: `Speech synthesis stopped: ${event.error}.`,
        firstAudioMs: null,
        chunkCount: 1,
      });
    };

    window.speechSynthesis.speak(utterance);
  });
}

export function stop(): void {
  if (!hasSpeechSynthesis()) return;
  activeSpeechAbort?.();
  activeSpeechAbort = null;
  window.speechSynthesis.cancel();
}

function selectLocalVoice(
  voices: readonly SpeechSynthesisVoice[],
  preferredVoiceURI?: string,
): SpeechSynthesisVoice | null {
  const localVoices = voices.filter((voice) => voice.localService);
  if (preferredVoiceURI) {
    const selectedVoice = localVoices.find(
      (voice) => voice.voiceURI === preferredVoiceURI,
    );
    if (selectedVoice) return selectedVoice;
  }

  return (
    localVoices.find((voice) => voice.default) ??
    localVoices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
    localVoices[0] ??
    null
  );
}

function toVoiceInfo(voice: SpeechSynthesisVoice): BrowserVoiceInfo {
  return {
    name: voice.name,
    lang: voice.lang,
    voiceURI: voice.voiceURI,
    localService: voice.localService,
    default: voice.default,
  };
}

function hasSpeechSynthesis(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}
