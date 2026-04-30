# WAVE Client

Next.js 16 web demo for WAVE, an offline-first, medication-aware urge surfing companion.

## Getting Started

Install dependencies and run the development server:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Current Runtime Shape

- The session uses five scripted meditation chunks from `lib/prompts/fallback-bank.ts`.
- The adaptive check-in chat, reflection screen, and `/insights` regenerate flow call Gemma 4 E2B-it locally through `@huggingface/transformers`.
- Model weights are cached by the browser after first load; WebGPU is used when available.
- The final target adds LoRA adapters on top of this local Gemma boundary, with no LLM network calls during inference.

Copy `.env.local.example` to `.env.local` and set `NEXT_PUBLIC_TRAINING_ENABLED=true` only when you want the developer training UI visible.

## Useful Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm exec tsc --noEmit
```

See the root `README.md`, `AGENTS.md`, `PRD.md`, and `docs/models.md` for the product and model contracts.
