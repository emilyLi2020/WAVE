# `app/models/mlc-test/` — MLC web-llm in-browser test routes

> **Status**: not the shipping path. These routes loaded a Gemma 4 fine-tune (+ Unsloth base + Google official base) via `@mlc-ai/web-llm` compiled with [MLC PR #3485](https://github.com/mlc-ai/mlc-llm/pull/3485) + [relax PR #346](https://github.com/mlc-ai/relax/pull/346). Generation worked for the first prompt of any session at ~45 tok/s on Apple Silicon, but **`chat.completions.create()` leaks KV-cache state between calls**, contaminating multi-turn use. The workaround (engine reload per task call, 3-5 s each × ~7 task switches per WAVE session) was deemed unshippable.
>
> See [`docs/postmortems/mlc-finetune.md`](../../../../docs/postmortems/mlc-finetune.md) for the full diagnosis. The routes are kept as runnable artifacts in case the upstream `web-llm` `resetKVCache()` bug gets fixed and we want to revisit.

## Current loading state

All four routes expect compiled MLC bundles in `client/public/`:

| Public path expected | What it held |
|---|---|
| `/mlc-export/` | Our fine-tune (PEFT-merged LoRA on `unsloth/gemma-4-E2B-it`, ~2.5 GB) |
| `/mlc-base-export/` | Unsloth's `unsloth/gemma-4-E2B-it` base, unchanged |
| `/mlc-google-it-export/` | `google/gemma-4-E2B-it` official base |

**These directories were deleted** after the team decided not to ship MLC. The routes will 404 on load until you regenerate the bundles (see "Reproducing the bundles" below) or wire each route at a different source.

## Routes

| Route | Client component | Purpose |
|---|---|---|
| [`/models/mlc-test`](page.tsx) | [`mlc-test-client.tsx`](mlc-test-client.tsx) | Single-model interactive test of the **fine-tune**. The original sanity-check page. |
| [`/models/mlc-test/base`](base/page.tsx) | [`base-test-client.tsx`](base-test-client.tsx) | Single-model test of the **Unsloth base port**. Used to confirm the conv_template + scaling fixes worked on a model we hadn't fine-tuned. |
| [`/models/mlc-test/google`](google/page.tsx) | [`google-test-client.tsx`](google-test-client.tsx) | Single-model test of the **Google official base**. Used to rule out any Unsloth-fork drift. |
| [`/models/mlc-test/compare`](compare/page.tsx) | [`compare-client.tsx`](compare-client.tsx) | 2-way side-by-side. Earlier iteration of the compare flow. |
| [`/models/mlc-test/compare-all`](compare-all/page.tsx) | [`compare-all-client.tsx`](compare-all/compare-all-client.tsx) | 3-way: fine-tune × Unsloth base × Google base, identical engine settings, identical conv_template, identical 4-prompt suite. **This is the page that surfaced the KV-cache state-leak bug.** See `docs/postmortems/mlc-finetune.md` §4–6. |

All five clients use the same shape: `CreateMLCEngine(model_id, { appConfig: { model_list: [{ model, model_id, model_lib }] }, initProgressCallback })`. The conv_template patches (§1.3 of the postmortem) live in each bundle's `mlc-chat-config.json` and aren't re-asserted client-side — so if you rebuild the bundles, **don't forget to apply the `gemma4_turn` template patch** before serving.

## Reproducing the bundles

Compile runbook lives at [`models/mlc/README.md`](../../../../models/mlc/README.md) — full commands, conv_template patch, gotchas. Short version (from [`docs/postmortems/mlc-finetune.md`](../../../../docs/postmortems/mlc-finetune.md) §2):

```bash
# 1. Convert weights (Mac; ~4.6 GB peak RAM, 2.5 GB output per model)
uv run --project models python -m mlc_llm convert_weight \
  models/runs/merge-peft \
  --quantization q4f16_1 --device metal:0 \
  --output models/runs/mlc-export-v2

# 2. Generate chat config, THEN patch conv_template (see postmortem §1.3 for the exact JSON)
uv run --project models python -m mlc_llm gen_config \
  models/runs/merge-peft \
  --quantization q4f16_1 \
  --conv-template gemma3_instruction \
  --output models/runs/mlc-export-v2

# 3. Compile WebGPU bundle (~13 min on Apple Silicon)
MLC_LLM_SOURCE_DIR=/private/tmp/mlc-workspace/mlc-llm-base \
  uv run --project models python -m mlc_llm compile \
  models/runs/mlc-export-v2/mlc-chat-config.json \
  --device webgpu \
  --output models/runs/mlc-export-v2/wave-r32-q4f16_1-webgpu.wasm

# 4. Copy into client/public/ (rsync excludes a `resolve/` symlink that breaks Turbopack)
rsync -a --exclude='resolve' models/runs/mlc-export-v2/ client/public/mlc-export/
```

Repeat for `mlc-base-export/` (source = `unsloth/gemma-4-E2B-it`) and `mlc-google-it-export/` (source = `google/gemma-4-E2B-it`).

Don't symlink `client/public/mlc-export -> ../../models/runs/mlc-export-v2` — Turbopack panics walking outside the project root.

## Why these aren't the shipping path

From the postmortem §6, the blocker is unfixed:

> `engine.chat.completions.create({messages: [{role: "user", content: prompt}]})` is supposed to be stateless per the OpenAI-compat spec. Empirically it isn't. The first prompt of any session is clean; subsequent prompts are contaminated. Reordering prompts confirms this — whichever prompt runs first is fine, later ones degenerate.

`engine.resetChat()` was tried between every prompt — no change. The conversation-mismatch branch in `web-llm/lib/index.js:12971` claims to call `pipeline.resetKVCache()` but the cache leak persists.

The documented workaround is `engine.unload()` + `CreateMLCEngine(...)` before each prompt. With OPFS warm that's ~3-5 s per reload. WAVE makes ~7 distinct task calls per session (5 chunk narrations + check-in + reflection + insights), so the overhead is ~25-35 s of pure reload time per user session. Not viable for an interactive flow.

## What's still useful here

- The `compare-all/` route is the cleanest 3-way test harness we have for any new browser runtime. If you wire it for a new backend (GGUF + llama.cpp WASM, LiteRT, etc.), reuse the prompt suite + engine-isolation pattern.
- The conv_template patch in each bundle's `mlc-chat-config.json` documents what Gemma 4's actual special tokens are (`<|turn>` 105, `<turn|>` 106, `\n` 107) vs. what the gemma3_instruction template assumes (`<start_of_turn>`, `<end_of_turn>`). The same token IDs apply to non-MLC runtimes.
- The OPFS-clearing instructions in the postmortem (`Application → Storage → Clear site data` or Incognito) apply to any browser-cached LLM runtime, not just web-llm.

## Related

- [`models/mlc/README.md`](../../../../models/mlc/README.md) — compile runbook (convert / gen_config / patch / compile / rsync) with all the gotchas.
- [`docs/postmortems/mlc-finetune.md`](../../../../docs/postmortems/mlc-finetune.md) — full diagnosis including the conv_template fix, the phantom scaling-bug detour, and the KV-cache leak workaround attempts.
- [`docs/postmortems/mlc-build.md`](../../../../docs/postmortems/mlc-build.md) — source build of TVM/relax + the MLC PR #3485 patch chain that made `python -m mlc_llm` work for Gemma 4 in the first place.
- [`client/lib/gemma/local-runtime.ts`](../../../lib/gemma/local-runtime.ts) — production runtime; currently points at `onnx-community/gemma-4-E2B-it-ONNX` (upstream base, not fine-tune). MLC would replace this if the state-leak bug ever gets resolved.
