# Postmortems

Long-form technical narratives of failed and successful attempts. Two rules:

1. Be specific. Cite version numbers, error messages, file paths.
2. Capture the *lesson*, not just the timeline.

**Start here**: [`case-study.md`](./case-study.md) — consolidated front-door narrative of all four runtime pivots, written for a reader who hasn't seen the project. The five files below are the technical detail behind that case study.

| File | Topic | Status |
|---|---|---|
| [`case-study.md`](./case-study.md) | **Four Runtimes, Four Dead Ends.** Consolidated case study: ONNX, MLC, MediaPipe, wllama — what we tried, what broke, what we shipped. | Front door |
| [`onnx-export.md`](./onnx-export.md) | Hand-rolled ONNX export of fine-tuned Gemma 4 E2B via `torch.onnx.export` + `MatMulNBitsQuantizer`. Got to ~7 GB; PLE Gather tables couldn't be 4-bit packed. | Functional, abandoned in favor of MLC |
| [`onnx-finetune.md`](./onnx-finetune.md) | Seven v3–v7 export iterations chasing fp16 overflow in `onnxruntime-web`'s WebGPU EP. Coherent on Node CPU; `len=0` on browser WebGPU across every variant. | Dead end; ships via wllama/GGUF instead |
| [`mlc-build.md`](./mlc-build.md) | Source build of mlc-llm PR #3485 + relax PR #346 against Gemma 4 E2B. Got to 2.5 GB total, q4f16_1, WebGPU-compiled, fine-tune preserved. | Working as of 2026-05-13 |
| [`mlc-finetune.md`](./mlc-finetune.md) | Getting the fine-tune (and base models) actually generating coherent text in-browser via `@mlc-ai/web-llm`. Includes the broken-merge root cause, the phantom scaling fix, and the real Gemma 4 conv_template gap. | All three models work for prompt #1; KV state leakage between sequential calls is the open blocker for multi-turn shipping. |
| [`mediapipe-finetune.md`](./mediapipe-finetune.md) | Mac-side conversion of the fine-tune via `litert-torch export_hf` produced a 4.7 GB `LITERTLM`-magic bundle. `@mediapipe/tasks-genai` (stable + nightly) only registers a `TFL3` matcher; no browser consumer for `LITERTLM` exists. Google staff confirmed publicly there is no Gemma 4 fine-tune → web-`.task` recipe. | Dead end. Page parked at `/models/mediapipe-finetune-test`; ships via wllama/GGUF instead. |
| [`ios-safari-browser.md`](./ios-safari-browser.md) | Cross-cutting analysis: every browser runtime fails on iOS, and not for runtime-specific reasons. wllama 3.x requires WASM Memory64; WebKit doesn't ship Memory64. Engine-wide ceiling, not per-runtime. | Pivots iOS surface to React Native + native llama.cpp |
