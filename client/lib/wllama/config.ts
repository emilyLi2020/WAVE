// Canonical configuration for the WAVE fine-tune GGUF served through wllama.
//
// Everything in this file is the single source of truth for "which GGUF
// shard, on which HF repo, with what context budget, fed by which local
// mirror URL". Both the test page (`client/app/models/wllama-test/`) and the
// production runtime (eventually `client/lib/gemma/local-runtime.ts`)
// import these constants instead of hardcoding their own.

/** HF repo that contains the GGUF subdirectory. */
export const WAVE_GGUF_REPO = "Maelstrome/lora-wave-session-r32";

/** Path within the repo to the FIRST shard. wllama auto-discovers the rest. */
export const WAVE_GGUF_FILE =
  "gguf/gemma-4-e2b-it-peft.Q4_K_M-00001-of-00005.gguf";

/**
 * Default localhost path served by `client/scripts/serve-local-hf.ts` under
 * its `/gguf/` mount. Used when the test page is loaded with `?local=1`.
 */
export const LOCAL_GGUF_HOST = "http://localhost:8765";
export const LOCAL_GGUF_FIRST_SHARD =
  "/gguf/gemma-4-e2b-it-peft.Q4_K_M-00001-of-00005.gguf";

/**
 * Context size to load with. WAVE production prompts run 1800–3300 tokens
 * before the response; 8192 covers all three surfaces with headroom for the
 * model's response. Override at load time if you need more (e.g. for longer
 * session histories in `check_in`).
 */
export const WAVE_GGUF_DEFAULT_N_CTX = 8192;

/**
 * Public-folder path where `wllama.wasm` is served. `next dev` and `next
 * build` both copy `client/public/wllama/wllama.wasm` to the static asset
 * root, so this URL resolves on both dev and prod.
 */
export const WLLAMA_WASM_URL = "/wllama/wllama.wasm";
