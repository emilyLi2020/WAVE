# WAVE Client

Next.js 16 web demo for WAVE, an offline-first, medication-aware urge surfing companion. All LLM, STT, and TTS inference is on-device.

## Getting Started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.local.example` to `.env.local` and set `NEXT_PUBLIC_TRAINING_ENABLED=true` only when you want the developer training UI visible.

## Current Runtime Shape

The clinical `/session` flow runs three models on-device, all via `@wllama/wllama` (LLM), `@huggingface/transformers` (STT), and `kokoro-js` (TTS):

- **LLM** — fine-tuned Gemma 4 E2B as a 5-shard Q4_K_M GGUF (`Maelstrome/lora-wave-session-r32/gguf/`, ~3.2 GB total). Loaded once via the shared singleton in [`lib/wllama/wave-instance.ts`](lib/wllama/wave-instance.ts); reused for chunk narration, check-in turns, and reflection. Phase-chunk and reflection use strict `response_format: { type: "json_schema" }`; check-in uses the same with an `endConversation` signal. See [`docs/wllama.md`](docs/wllama.md) and [`docs/tool-calling-investigation.md`](docs/tool-calling-investigation.md) for why json_schema rather than native tool calls.
- **STT** — Whisper `base.en` via `@huggingface/transformers`, fed 16 kHz mono PCM from Silero VAD.
- **TTS** — Kokoro 82M on WebGPU, default runtime `fp32-webgpu` (fp16 is silent on some NVIDIA WebGPU drivers, see [`docs/voice-test.md`](docs/voice-test.md)). The chunk player streams narration sentence-by-sentence; audio-length drives advance to the next line.
- **VAD** — Silero v5 via `@ricky0123/vad-web` for hands-free check-in turn-taking and barge-in detection.

Each chunk's loading phase preloads Whisper + Kokoro in parallel with chunk generation so the voice check-in opens warm. Fallback to clinician-reviewed local copy after two failed LLM attempts ([`lib/prompts/fallback-bank.ts`](lib/prompts/fallback-bank.ts)).

The patient-facing check-in surface is voice-only ([`app/session/_components/voice-check-in.tsx`](app/session/_components/voice-check-in.tsx)); the developer voice-loop test page at `/models/voice-test` is documented in [`docs/voice-test.md`](docs/voice-test.md).

## Useful Commands

```bash
pnpm dev              # start dev server
pnpm build            # production build
pnpm lint
pnpm exec tsc --noEmit
pnpm test             # JSON-schema parsing + score-extraction unit tests
pnpm prepare:vad-assets  # refresh Silero VAD WASM after dependency bumps
```

`pnpm test` runs `tsx scripts/test-extract-craving-score.ts` and `tsx scripts/test-wllama-generators.ts` — they cover the parsing layer in isolation and never touch a real model.

## Performance principles

Measured browser perf numbers (Windows NVIDIA, Mac Apple Silicon) live in [`docs/wllama.md`](docs/wllama.md). On Windows wllama is ~9× faster than `onnxruntime-web` at decode; on Mac the two runtimes are in the same league and the win depends on output length. The principles that still apply on every platform:

- **Pre-warm at app load.** First call pays shader compile + weight upload. wllama compiles WebGPU shaders once and stays warm for the whole session; never call `wllama.exit()` mid-session.
- **Stream into Kokoro at the first sentence boundary.** Perceived latency is gated by TTS start, not full LLM completion. [`lib/voice/sentence-buffer.ts`](lib/voice/sentence-buffer.ts) drives this.
- **Keep prompt context tight.** Gemma 4's sliding-window path is fastest under ~512 tokens; long histories cost KV memory for no quality gain.
- **Different compute paths per model.** Whisper on WASM-SIMD CPU, Gemma on WebGPU via wllama, Kokoro on WebGPU. Putting two models on WebGPU simultaneously context-switches and tanks both.
- **`swa_full: true` is load-bearing.** Set in [`lib/wllama/client.ts`](lib/wllama/client.ts) to dodge a llama.cpp SWA-cache crash on long prompts ([ggml-org/llama.cpp#20277](https://github.com/ggml-org/llama.cpp/pull/20277)). Costs ~250 MiB extra KV memory.
- **Strict `json_schema`, not loose `json_object`.** llama.cpp compiles a strict schema into a GBNF grammar that constrains decoding; loose `json_object` produces malformed JSON on our fine-tune. See [`docs/tool-calling-investigation.md`](docs/tool-calling-investigation.md).

## See also

- [`docs/wllama.md`](docs/wllama.md) — browser GGUF runtime: design doc + measured perf on Windows/Mac/iOS.
- [`docs/voice-test.md`](docs/voice-test.md) — developer voice-stack reference (Whisper + wllama + Kokoro + VAD + interruption detection).
- [`docs/tool-calling-investigation.md`](docs/tool-calling-investigation.md) — why the current LoRA can't emit native Gemma 4 tool tokens, and the path to fix.
- [`docs/onnx-webgpu-divergence.md`](docs/onnx-webgpu-divergence.md), [`docs/transformers-js-gemma4-perf.md`](docs/transformers-js-gemma4-perf.md) — historical browser-runtime debugging records.
- Root [`README.md`](../README.md), [`AGENTS.md`](../AGENTS.md), [`PRD.md`](../PRD.md), [`docs/models.md`](../docs/models.md), [`docs/model-training.md`](../docs/model-training.md) — product spec and model contracts.
