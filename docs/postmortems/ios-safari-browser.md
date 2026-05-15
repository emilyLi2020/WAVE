# Running the WAVE fine-tune in any iOS browser: the WebKit ceiling is below us

> Sibling to [`onnx-finetune.md`](./onnx-finetune.md) (7 ONNX iterations, `len=0` on browser WebGPU), [`mlc-finetune.md`](./mlc-finetune.md) (MLC web-llm, KV cache leaks between calls), and [`mediapipe-finetune.md`](./mediapipe-finetune.md) (LITERTLM container with no public browser consumer). Each of those documented a *specific* runtime failing on our specific fine-tune. This document covers the cross-cutting problem: every browser runtime we've evaluated fails on iOS, and not for runtime-specific reasons. The blocker is the WebKit JavaScript/WASM engine that every iOS browser is forced to use, regardless of vendor.
>
> Resulting state on 2026-05-15: wllama, the runtime that ships to desktop (per [`client/docs/wllama.md`](../../client/docs/wllama.md)), aborts during model load on iOS Safari 26 with `Conversion from BigInt to number is not allowed`. The cause is upstream: wllama 3.x's bundled llama.cpp WASM build requires the `Memory64` proposal, which Safari does not implement. No other runtime in our evaluation works for Gemma 4 either ([`mlc-finetune.md`](./mlc-finetune.md), [`mediapipe-finetune.md`](./mediapipe-finetune.md), [`onnx-finetune.md`](./onnx-finetune.md) — same model, three separate dead ends). **No browser-shipped on-device path to Gemma 4 E2B exists on iOS today.**

## TL;DR

| Runtime | Desktop browser | iOS Safari 26 | Why iOS fails |
|---|---|---|---|
| wllama 3.1.1 + Q4_K_M GGUF | ✅ 60 tok/s decode on Windows/Blackwell | ❌ `Conversion from BigInt to number is not allowed` during `loadModel` | wllama 3.x's WASM build requires Memory64 (BigInt-typed pointers); WebKit doesn't ship Memory64 |
| MLC web-llm | ❌ KV cache leak ([sibling postmortem](./mlc-finetune.md)) | ❌ same, plus no Gemma 4 in MLC's compiled model list | Upstream MLC gap, not WebKit-specific |
| MediaPipe `@mediapipe/tasks-genai` | ❌ no Gemma 4 fine-tune path ([sibling postmortem](./mediapipe-finetune.md)) | ❌ same | Upstream tooling gap, not WebKit-specific |
| transformers.js + ORT WebGPU | ❌ fp16 overflow ([sibling postmortem](./onnx-finetune.md)) | ❌ same, plus iOS Safari 26 WebGPU is partial | Upstream ORT gap, not WebKit-specific |
| Cloud inference fallback | n/a | n/a | **Ruled out**: medical use case, no third-party model hosting permitted |
| Native iOS app (llama.cpp Swift / WhisperKit / AVSpeechSynthesizer) | n/a | ✅ runs our existing GGUF unchanged via Metal backend | Different distribution channel, but the actual on-device-LLM path Apple supports |

The combination "WAVE fine-tune + on-device + iOS browser" has no green cell. Three of the four runtimes are blocked by model-side issues we already documented; the fourth (wllama, which actually works on our model) is blocked by a platform-side issue we cannot fix from the application layer.

## The decisive evidence

### The error, verbatim from iOS Safari 26 console

```
ggml_webgpu: adapter_info: vendor_id: 0 | vendor: apple | architecture: apple-gpu …
llama_kv_cache_iswa: using full-size SWA cache
…
TypeError: Conversion from BigInt to number is not allowed
```

The error fires during `wllama.loadModelFromHF()` — the model never reaches the chat-completion stage. Reproduced on:

- iOS Safari 26 over LAN-tunneled `next dev` (the WebKit-rendered surface)
- iOS Chrome over the same tunnel (Chrome on iOS uses WebKit per Apple's App Store rule, so this is the same engine wearing a different UI)
- Confirmed against both load paths: `n_gpu_layers: undefined` (WebGPU) and `n_gpu_layers: 0` (WASM-only via the "Force WASM" toggle in `client/app/models/wllama-test/wllama-test-client.tsx`). Both abort with the same BigInt error during load.

So the bug is not WebGPU-specific. It is engine-wide.

### Root cause: WASM Memory64 + WebKit non-support

Quoted directly from [wllama README](https://github.com/ngxson/wllama) at HEAD as of 2026-05-15:

> Memory64 is now a requirement, which drops support for Safari. Please follow this issue for more info.

The linked issue, [ngxson/wllama#210](https://github.com/ngxson/wllama/issues/210), is titled *"[Call for contributors] Add guide for compiling Safari-compatible version"* and remains open. The maintainer's position: llama.cpp's WASM build defaults to Memory64 enabled, wllama inherits that, and there is no maintained Safari-compatible bundle. Status: open, no timeline, no first-party fix planned.

Memory64 is a WebAssembly proposal that uses 64-bit memory addressing (vs. WASM 1.0's 32-bit ceiling of 4 GiB linear memory). On the JS side, 64-bit pointers cross the boundary as `BigInt` values. Application code that does any arithmetic mixing `BigInt` with regular `Number` triggers the runtime error above. WebKit doesn't enable Memory64 yet, so wllama's compiled glue throws on the first BigInt-vs-Number coercion during model load.

### Why every iOS browser is the same browser

Apple's App Store guidelines (since the App Store opened) require third-party browsers on iOS to use WebKit as their rendering and JavaScript engine. Chrome iOS, Firefox iOS, Brave iOS, Edge iOS, DuckDuckGo iOS — all WebKit underneath. Different chrome UI, same JS/WASM ceiling.

The EU's Digital Markets Act technically allows alternative engines in the EU since iOS 17.4. Neither Google nor Mozilla has actually shipped a non-WebKit engine on iOS as of 2026-05. So in practice, **iOS browser = WebKit engine, everywhere on Earth, today.**

Therefore "try a different browser" is not a workaround. The Memory64 gap is at the engine level, not the browser-chrome level.

## What we tried before giving up

1. **Force WASM-only execution.** Added `nGpuLayers: 0` to `LoadWaveWllamaOptions` in [`client/lib/wllama/client.ts`](../../client/lib/wllama/client.ts) and a corresponding UI checkbox in [`client/app/models/wllama-test/wllama-test-client.tsx`](../../client/app/models/wllama-test/wllama-test-client.tsx). Verified WebGPU is not the trigger — WASM-only path aborts with the identical BigInt error during `loadModel`. The Memory64 dependency is in the WASM build itself, not the WebGPU backend.
2. **WebGPU-conditional mobile preset.** Probe `navigator.gpu.requestAdapter()` at load time and only apply the quantized-KV mobile preset (q8_0 + flash_attn) when WebGPU is absent. Done in `loadWaveWllama`. Did not help on iOS — WebGPU is reachable in Safari 26 but the underlying WASM module still aborts before any GPU code runs.
3. **`@vercel/toolbar` and dev-mode runtime injections.** Initially suspected the Vercel preview-feedback widget or Next.js dev runtime of breaking interactivity on iOS Safari. Gated COOP/COEP headers behind `process.env.NODE_ENV === "production"` in [`client/next.config.ts`](../../client/next.config.ts) to rule it out. Buttons became tappable in `next dev` but the BigInt error appeared as soon as Load was clicked — confirming the platform issue, not a dev-server issue.
4. **Inspected `node_modules/@wllama/wllama/esm/index.js`** for our own BigInt misuse. Only one obvious BigInt call site (mmproj header parse at line 765 via `getBigUint64`) and it's not on the model-load path for our non-mmproj GGUF. The BigInt errors fire from inside the WASM-imported glue, where llama.cpp's 64-bit pointers cross into JS as BigInts and meet code that expects Number. Not patchable from the wrapper layer.
5. **Confirmed identical failure on iOS Chrome.** Same ngrok URL, same time window, same error. Rules out anything browser-vendor-specific.

Failure mode is reproducible on demand. The instrumentation work was diagnostic, not iterative — no path forward from the application side surfaced.

## What the public record says

Researched community-side reports across the wllama repo, WebKit bug tracker, WebAssembly proposal status pages, and the Apple Developer Forums. Picture is consistent:

- **[ngxson/wllama#210](https://github.com/ngxson/wllama/issues/210)** — canonical issue. Maintainer (ngxson) acknowledges Memory64 default broke Safari, calls for community to write a build guide for a Memory64-disabled bundle. Status: open since v3.0 release, no contributor has merged a fix.
- **[wllama README](https://github.com/ngxson/wllama)** — explicit "drops support for Safari" line. Not a regression, an intentional trade-off for desktop-class memory addressing.
- **[WebKit bug tracker — Memory64 implementation](https://bugs.webkit.org/buglist.cgi?quicksearch=memory64)** — Memory64 is a Stage-4 WebAssembly proposal as of 2025 but WebKit has not landed an implementation. No public timeline.
- **[caniuse: WebAssembly Memory64](https://caniuse.com/?search=memory64)** — Chrome/Edge/Firefox shipped enabled-by-default in 2024. Safari row remains "not supported".
- **[Apple App Store Review Guidelines §2.5.6](https://developer.apple.com/app-store/review/guidelines/#2.5.6)** — explicit prohibition on shipping a competing JavaScript engine within an iOS browser. EU DMA carve-out exists but no major vendor has shipped against it as of 2026-05.

There is no expectation in any of these threads that the Safari Memory64 gap closes on a known timeline. There is also no third-party-built Safari-compatible wllama on npm or HF.

## Why the upstream gap is genuine, not a documentation hole

The MediaPipe and ONNX postmortems both had the shape *"public converter, public consumer, but the two don't speak the same protocol — vendor knows."* You could imagine a future commit that fixes the misalignment.

This one is different. The Memory64 requirement is a deliberate engineering choice on the wllama / llama.cpp side: 64-bit addressing lets WASM heaps exceed 4 GiB, which the larger llama.cpp targets need. The Safari engine team would have to ship Memory64 to close the gap, and engine-level WASM proposals ship on Safari timescales (years, not weeks). Even if wllama added a 32-bit fallback bundle tomorrow, the model size compounds: our Q4_K_M GGUF is 3.2 GB *compressed*, KV cache at `n_ctx=4096` adds ~400 MiB, plus wllama runtime overhead and intermediate buffers — that's right at WebKit's 4 GiB linear-memory ceiling. A 32-bit Safari build of wllama might OOM mid-load on this specific model even if BigInt errors were gone.

So even the optimistic version of "wait for wllama #210 to land" leaves us within a Q4-quantization headroom of the iOS WASM ceiling. The architecturally honest answer is that iOS browsers are not the right surface for a 4B-parameter local LLM in 2026, regardless of which runtime we choose.

## Why other runtimes are not the answer either

The four browser-runtime postmortems are linked at the top. To summarize the iOS angle specifically:

- **MLC web-llm** can in principle ship Safari-compatible WASM bundles (its build process doesn't auto-default to Memory64 the way llama.cpp does), and MLC has working iOS Safari demos for the models it supports (Llama 3.2 1B, Phi-3, etc.). But MLC requires per-architecture compilation via `mlc_llm compile`, and Gemma 4 is not in MLC's supported model list as of 2026-05-15. Adding it would be a multi-week upstream contribution. Even if we did the work, the [MLC KV-cache leak](./mlc-finetune.md) is a separate blocker.
- **MediaPipe `tasks-genai`** runs in iOS Safari via the same WebKit engine. The blocker is upstream: there is no public converter that produces a `TFL3`-magic `.task` file from a fine-tuned Gemma 4 ([mediapipe-finetune.md](./mediapipe-finetune.md) §"What the public record says"). Fixing iOS-browser support would not change that — we still couldn't produce a loadable file.
- **transformers.js + onnxruntime-web** runs in iOS Safari with WASM (no WebGPU offload — Safari 26 WebGPU is "partial" and ORT's WebGPU EP is unstable there). But our ONNX export of Gemma 4 has the fp16-overflow correctness bug on every WebGPU runtime including ORT's ([onnx-finetune.md](./onnx-finetune.md)). The WASM-only Safari path would inherit the same bug class.

None of the three is a wllama-replacement candidate for iOS *while still hitting the Gemma 4 hackathon constraint.* The model architecture is locked; the runtimes that can't compile Gemma 4 stay blocked regardless of platform.

## Lesson

When evaluating a browser LLM runtime, **check `caniuse` for every WebAssembly proposal in the runtime's build flags before committing to it**. Memory64 status on Safari was discoverable in two minutes and would have established the iOS ceiling before the wllama integration cost was sunk. The wllama maintainer is upfront about the trade-off in the README; we didn't read past the desktop performance numbers.

Operationally: the iOS browser surface for any model in the 1-4B Q4 size range in 2026 is fragile. The path that consistently works for on-device LLMs at this scale is the native-app path that Apple actually supports — Metal-backed runtimes (`llama.cpp`, MLX), CoreML-accelerated tokenizers (WhisperKit), and the App Store distribution model. Browser-first iOS LLMs are a 2027+ bet, contingent on Safari shipping Memory64 *and* the runtimes shipping Safari-compatible 32-bit fallback builds *and* model footprints staying inside 4 GiB linear memory.

## What ships instead

**For the hackathon submission**, two parallel surfaces:

1. **Desktop browser** — Chrome / Edge on Windows, macOS, Linux. Already working via wllama at the perf numbers documented in [`client/docs/wllama.md`](../../client/docs/wllama.md). This is the primary submission surface.
2. **Native iOS app via `llama.cpp/examples/llama.swiftui`** — same `gemma-4-e2b-it-peft.Q4_K_M.gguf` shards (after `llama-gguf-split --merge` to combine into a single file), loaded natively, decode via Metal. STT via WhisperKit. TTS via `AVSpeechSynthesizer` for the demo (Kokoro via ONNX Runtime Swift is the post-hackathon upgrade). No model-side rework — our existing GGUF, prompts, and chat template work unchanged.

The cloud-fallback option that would be standard for non-medical applications (iOS user → server-side inference) is explicitly disallowed by the hackathon's medical use case constraint. On-device or nothing.

**Post-hackathon**, the iOS native app becomes the long-term iOS plan and the iOS-browser path stays parked. If WebKit ships Memory64 in iOS 28 or 29 and wllama has a stable Safari-compatible bundle by then, we revisit; until both happen, the native app *is* the iOS roadmap.

## File references

- The error reproduction surface: [`client/app/models/wllama-test/wllama-test-client.tsx`](../../client/app/models/wllama-test/wllama-test-client.tsx)
- The wllama wrapper (where `nGpuLayers` and the WebGPU probe live): [`client/lib/wllama/client.ts`](../../client/lib/wllama/client.ts)
- Production COOP/COEP gating (dev-mode tap-event fix that surfaced this): [`client/next.config.ts`](../../client/next.config.ts)
- Sibling browser-runtime postmortems: [`onnx-finetune.md`](./onnx-finetune.md), [`mlc-finetune.md`](./mlc-finetune.md), [`mediapipe-finetune.md`](./mediapipe-finetune.md), [`mlc-build.md`](./mlc-build.md)
- The currently-shipping desktop browser runtime: [`client/docs/wllama.md`](../../client/docs/wllama.md)
- Canonical upstream issue: [ngxson/wllama#210](https://github.com/ngxson/wllama/issues/210)
- Memory64 proposal status: [WebAssembly/memory64](https://github.com/WebAssembly/memory64), [caniuse](https://caniuse.com/?search=memory64)
- Apple WebKit-only browser policy: [App Store Review Guidelines §2.5.6](https://developer.apple.com/app-store/review/guidelines/#2.5.6)
