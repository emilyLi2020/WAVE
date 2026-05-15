// Thin wllama wrapper: configures the WASM path once and loads the WAVE GGUF
// either from HF (default, works in dev/preview/prod) or from a local-hf
// mirror at localhost:8765 (faster iteration when working on the GGUF
// itself; requires `pnpm exec tsx scripts/serve-local-hf.ts` running).
//
// The wllama package ships a non-existent `index.js` at its package root
// (`main` field in its package.json), which makes Turbopack fall back to
// the `index.ts` source file and fail to compile it as a module of unknown
// type. We import from the explicit `esm/index.js` subpath to sidestep that.

import {
  LOCAL_GGUF_FIRST_SHARD,
  LOCAL_GGUF_HOST,
  WAVE_GGUF_DEFAULT_N_CTX,
  WAVE_GGUF_FILE,
  WAVE_GGUF_REPO,
  WLLAMA_WASM_URL,
} from "./config";

type WllamaModule = typeof import("@wllama/wllama/esm/index.js");
export type WllamaInstance = InstanceType<WllamaModule["Wllama"]>;

/** Lazy-load the wllama module. Keeps the WASM binding out of the SSR bundle. */
async function importWllama(): Promise<WllamaModule> {
  return import("@wllama/wllama/esm/index.js");
}

export interface LoadWaveWllamaOptions {
  /**
   * Override the context window the model is loaded with. Default
   * {@link WAVE_GGUF_DEFAULT_N_CTX} = 8192, which covers all three WAVE
   * surfaces (phase / check_in / reflection) with response headroom.
   */
  nCtx?: number;

  /**
   * If true, fetch the GGUF from a local-hf mirror at
   * {@link LOCAL_GGUF_HOST}{@link LOCAL_GGUF_FIRST_SHARD} instead of HF.
   * Defaults to false. Set true via `?local=1` in test pages.
   */
  useLocalMirror?: boolean;

  /**
   * Override the local-hf mirror host. Only consulted when
   * {@link useLocalMirror} is true. Defaults to {@link LOCAL_GGUF_HOST}.
   */
  localHost?: string;

  /**
   * Optional progress callback fired during shard download(s). Called with
   * cumulative `loaded` / `total` byte counts and a derived `percent`.
   */
  onProgress?: (info: {
    loaded: number;
    total: number;
    percent: number;
  }) => void;
}

/**
 * Load the WAVE fine-tune GGUF into a fresh wllama instance and return it.
 *
 * - Default: fetches from `Maelstrome/lora-wave-session-r32/gguf/...-00001-of-00005.gguf`
 *   on HF. wllama auto-discovers the 4 remaining shards from the first.
 * - With `useLocalMirror: true`: fetches from `localhost:8765/gguf/...`
 *   served by `client/scripts/serve-local-hf.ts`.
 */
export async function loadWaveWllama(
  options: LoadWaveWllamaOptions = {},
): Promise<WllamaInstance> {
  const nCtx = options.nCtx ?? WAVE_GGUF_DEFAULT_N_CTX;
  const useLocal = options.useLocalMirror ?? false;
  const localHost = options.localHost ?? LOCAL_GGUF_HOST;

  const mod = await importWllama();
  const wllama = new mod.Wllama({
    default: WLLAMA_WASM_URL,
    "single-thread/wllama.wasm": WLLAMA_WASM_URL,
  });

  const progressCallback = options.onProgress
    ? ({ loaded, total }: { loaded: number; total: number }) => {
        const percent = total ? Math.round((loaded / total) * 100) : 0;
        options.onProgress?.({ loaded, total, percent });
      }
    : undefined;

  // log_level=3 (WARN) suppresses llama.cpp's chatty INFO logs about the
  // slot/server prompt-cache (update_slots, create_check, restored/erased
  // checkpoint). Those messages are useful diagnostics but Chrome surfaces
  // them as console.warn since llama.cpp writes them to stderr inside WASM.
  //
  // swa_full=true makes Gemma 4's sliding-window-attention cache cover the
  // full context rather than just the 512-token window. We need this because
  // the WAVE prompts (1800-3300 tokens) far exceed the SWA window, and
  // llama.cpp's slot/server harness has a known crashing bug
  // (server-context.cpp:2848, https://github.com/ggml-org/llama.cpp/pull/20277)
  // when prefill exceeds the SWA window on the first createChatCompletion.
  // Costs ~250 MiB extra KV cache memory at n_ctx=8192, in exchange for
  // generation that actually completes.
  const loadParams = {
    n_ctx: nCtx,
    swa_full: true,
    log_level: 3 as const, // LogLevel.WARN; keeps real warnings + errors only.
    progressCallback,
  };

  if (useLocal) {
    const url = `${localHost}${LOCAL_GGUF_FIRST_SHARD}`;
    await wllama.loadModelFromUrl(url, loadParams);
  } else {
    await wllama.loadModelFromHF(
      { repo: WAVE_GGUF_REPO, file: WAVE_GGUF_FILE },
      loadParams,
    );
  }

  return wllama;
}

/**
 * Helper that returns the URL the model will be fetched from, given the
 * same options. Useful for display strings and progress messages without
 * duplicating the local-vs-HF branch in callers.
 */
export function describeWaveWllamaSource(
  options: Pick<LoadWaveWllamaOptions, "useLocalMirror" | "localHost"> = {},
): string {
  const useLocal = options.useLocalMirror ?? false;
  const localHost = options.localHost ?? LOCAL_GGUF_HOST;
  return useLocal
    ? `${localHost}${LOCAL_GGUF_FIRST_SHARD}`
    : `https://huggingface.co/${WAVE_GGUF_REPO}/blob/main/${WAVE_GGUF_FILE}`;
}
