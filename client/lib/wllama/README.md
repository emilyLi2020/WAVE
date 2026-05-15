# `client/lib/wllama/` — browser GGUF runtime wrapper

Thin wrapper around [`@wllama/wllama`](https://github.com/ngxson/wllama) that loads the WAVE fine-tune Q4_K_M GGUF in-browser via WebGPU (falls back to WASM SIMD). The page at [`../../app/models/wllama-test/`](../../app/models/wllama-test/) imports from here, and the production runtime ([`../gemma/local-runtime.ts`](../gemma/local-runtime.ts)) will too once the swap from transformers.js+ONNX → wllama+GGUF lands.

## Files

| File | What |
|---|---|
| [`config.ts`](./config.ts) | Single source of truth: HF repo + filename, local-hf mirror URL, default `n_ctx`, WASM asset path. |
| [`client.ts`](./client.ts) | `loadWaveWllama()` + `describeWaveWllamaSource()`. Lazy-imports the wllama module (keeps WASM out of the SSR bundle). |
| [`index.ts`](./index.ts) | Public surface. Always import from `@/lib/wllama`, not the inner files. |

## Usage

```ts
import { loadWaveWllama, describeWaveWllamaSource } from "@/lib/wllama";

const wllama = await loadWaveWllama({
  // useLocalMirror: true,   // <- set true to fetch from localhost:8765
  // nCtx: 16384,            // <- override the default 8192
  onProgress: ({ percent }) => console.log(`load ${percent}%`),
});

const out = await wllama.createChatCompletion({
  messages: [
    { role: "system", content: WAVE_SYSTEM_PROMPT },
    { role: "user", content: "..." },
  ],
  max_tokens: 320,
  temperature: 0,
  top_k: 1,
});
console.log(out.choices[0].message.content);
```

## Why a separate wrapper

- **One place to change the model identity.** When we publish a new GGUF (e.g., a different quant or a re-trained adapter), only `config.ts` updates. Test page + production runtime both pick it up automatically.
- **Lazy WASM import.** `import("@wllama/wllama/esm/index.js")` is dynamic; the binding never enters the SSR bundle. Avoids "wllama.wasm not available during server render" failure modes.
- **Turbopack workaround.** The wllama package's `main: "index.js"` points at a non-existent file at the package root; Turbopack falls back to `index.ts` and chokes. The dynamic import uses the explicit `esm/index.js` subpath, which is the compiled JS output their README also recommends.
- **HF vs. localhost branching in one place.** The test page exposes `?local=1` for fast iteration; production will always use HF. Both call the same loader.

## When to use the local mirror

Pass `useLocalMirror: true` when you're iterating on the GGUF itself and don't want to round-trip through HF Hub. Start the mirror first:

```powershell
cd client
pnpm exec tsx scripts/serve-local-hf.ts
```

That script exposes three mounts on `localhost:8765`: HF-style at `/<repo>/resolve/main/...`, MediaPipe at `/mediapipe/...`, and **GGUF at `/gguf/...`** — reading from `models/runs/merge-peft-gguf/split/` on disk. Drop a new build there and the page will pick it up without an upload.

## See also

- [`docs/wllama.md`](../../../docs/wllama.md) — end-to-end design doc: why wllama over ONNX, how the file structure fits together, how to extend to production.
- [`models/gguf/README.md`](../../../models/gguf/README.md) — Python-side conversion pipeline that produces the GGUF this lib loads.
- [`client/public/wllama/wllama.wasm`](../../public/wllama/wllama.wasm) — the WASM binary served at `/wllama/wllama.wasm`. Copied from `node_modules/@wllama/wllama/esm/wasm/wllama.wasm` after `pnpm install`.
