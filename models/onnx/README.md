# `models/onnx/` — Gemma 4 fine-tune ONNX export pipeline

> **Status**: the export pipeline produces a correct artifact for `onnxruntime-node` (CPU) but fails on browser WebGPU at long contexts. **Do not point production runtime here.** See [`docs/postmortems/onnx-finetune.md`](../../docs/postmortems/onnx-finetune.md) for the full story and rationale.
>
> Everything here is kept for reproducibility, for the next person who wants to attempt structural fixes (RoPE / attention fusion), and as the documented record of what was tried.

## What this directory is

A hand-rolled `torch.onnx.export` pipeline for the WAVE fine-tune of Gemma 4 E2B. It produces a 2.7 GB q4f16 ONNX artifact whose I/O signature (`inputs_embeds + per_layer_inputs + 15 KV pairs`) matches `onnx-community/gemma-4-E2B-it-ONNX` so transformers.js v4 can drive it.

We hand-rolled because no Gemma 4 ONNX exporter exists today:
- `optimum-onnx` needs `transformers < 4.58.0`; Gemma 4 needs `≥ 5.5.0`. PRs [#114](https://github.com/huggingface/optimum-onnx/pull/114) / [#121](https://github.com/huggingface/optimum-onnx/pull/121) try to bridge but neither is merged.
- `transformers.js`'s `scripts/convert.py` was removed in v3+ and the README now points back to optimum-onnx.
- `onnxruntime-genai` has [open issue #2062](https://github.com/microsoft/onnxruntime-genai/issues/2062) noting Gemma 4 isn't supported.
- Xenova produced `onnx-community/gemma-4-E2B-it-ONNX` with internal tooling that isn't public ([discussion #3 on the model card](https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/discussions/3) has multiple users blocked on this).

## Quick reference

| Script | Stage | Lives where on disk |
|---|---|---|
| [`export.py`](export.py) | End-to-end driver: torch → ONNX → fp16 → q4 MatMul → q4 PLE Gather → fusion | `models/runs/onnx-export-vN/` |
| [`cast_fp16.py`](cast_fp16.py) | fp32 → fp16 cast (streams initializers; doesn't peak at 30 GB like `onnxconverter_common`) | called by `export.py` as subprocess |
| [`quantize_gather.py`](quantize_gather.py) | Asymmetric uint4+zp packing for PLE Gather tables → `com.microsoft.GatherBlockQuantized` | called by `finish_export.py` |
| [`finish_export.py`](finish_export.py) | Resume-from-fp16 helper: q4 quant + Gather rewrite + manifest | for partial-pipeline replays |
| [`fuse_rmsnorm.py`](fuse_rmsnorm.py) | **v6 rewriter**: pattern-fuse decomposed RMSNorm → `SimplifiedLayerNormalization(stash_type=1)` | post-export rewrite |
| [`rewrite_pow_to_mul.py`](rewrite_pow_to_mul.py) | **v5 rewriter**: `Pow(x, 2.0)` → `Mul(x, x)` (avoids WebGPU's NaN-prone `exp(y·ln(x))` Pow kernel) | post-export rewrite |
| [`cast_rmsnorm_fp32.py`](cast_rmsnorm_fp32.py) | **v7 rewriter**: insert `Cast(fp32)` around unweighted variance chains the fuser couldn't match | post-export rewrite |
| [`restage_decoder.py`](restage_decoder.py) | Rename ORT optimizer's `.onnx.data` external-data sidecar to transformers.js-expected `.onnx_data` | post-fusion fixup |
| [`inspect_gbq.py`](inspect_gbq.py) | Byte-diff two `GatherBlockQuantized` initializers (proves our PLE packing matches upstream) | diagnostic |
| [`inspect_decoder.py`](inspect_decoder.py) | Op-count + I/O-signature diff between two decoder ONNX files | diagnostic |
| [`try_fuse_decoder.py`](try_fuse_decoder.py) | Sweep `model_type` for `optimize_model`; only `gpt2` matches (produces FastGelu fusion) | diagnostic |
| [`try_fuse_decoder_v2.py`](try_fuse_decoder_v2.py) | Sweep `opt_level` for `optimize_model`; `opt_level=0` is the winner | diagnostic |

## Pipeline (what produces v3, the published artifact)

```
HF/local: lora-wave-session-r32-merged          ← Maelstrome/lora-wave-session-r32-merged is broken
                  ↓                                (unsloth save_pretrained_merged produces all-pad output;
                                                    use ../merge_lora_peft.py to re-merge via PEFT)
Local:    models/runs/merge-peft/               ← coherent fp16 PEFT-merged base, smoke-tested by
                  ↓                                ../diagnose_merged_base.py
export.py
   │
   ├─ torch.onnx.export(dynamo=True)  ────►  models/runs/onnx-export-v3/onnx/decoder_model_merged.onnx
   │   (MergedDecoderWrapper(text_model + lm_head),
   │    use_cache=True, inputs_embeds + per_layer_inputs +
   │    15 KV pairs, num_kv_shared_layers=20)
   │   plus _export_embed_tokens → embed_tokens.onnx
   │
   ├─ cast_fp16.py subprocess  ────►  *_fp16.onnx (~9 GB)
   │   (streams initializers to avoid 30 GB peak)
   │
   ├─ _quantize_q4f16 (in export.py)  ────►  *_q4f16.onnx (~6 GB)
   │   (MatMulNBitsQuantizer, block_size=32)
   │
   ├─ _optimize_graph (in export.py)  ────►  fuses 70 FastGelu in the decoder
   │   (onnxruntime.transformers.optimizer.optimize_model
   │    model_type="gpt2", opt_level=0)
   │
   └─ copy_runtime_configs  ────►  tokenizer + chat_template + generation_config
```

Then a separate pass via `finish_export.py` (or invoked directly) runs `quantize_gather.py` over `models/runs/onnx-export-v3/onnx/*.onnx`, replacing large fp16 Gather initializers with `com.microsoft.GatherBlockQuantized` int4 nodes.

Result on disk:
- `decoder_model_merged_q4f16.onnx` + `.onnx_data` ≈ 1.2 GB
- `embed_tokens_q4f16.onnx` + `.onnx_data` ≈ 1.5 GB
- Total bundle ≈ 2.7 GB at [`Maelstrome/lora-wave-session-r32-onnx`](https://huggingface.co/Maelstrome/lora-wave-session-r32-onnx)

## Version history

These are post-export rewriters applied on top of v3 to try to fix the browser-WebGPU `len=0` failure. **None of them fix the browser bug**; the postmortem explains why.

| Version | What changed | CPU coherent? | Browser WebGPU? |
|---|---|---|---|
| **v3** | Original export from `export.py` end-to-end | ✅ ~20 tok/s | ❌ `len=0` |
| **v4** | + ORT optimizer (gpt2 / opt_level=0) fuses 70 Tanh chains → 70 FastGelu | ✅ ~2× faster on CPU | ❌ `len=0` |
| **v5** | + `rewrite_pow_to_mul.py` rewrites 242 `Pow(x, 2.0)` → `Mul(x, x)` | ✅ unchanged | ❌ `len=0` |
| **v6** | + `fuse_rmsnorm.py` fuses 227 of 242 RMSNorm 6-tuples → `SimplifiedLayerNormalization(stash_type=1)` | ✅ unchanged | ❌ `len=0` |
| **v7** | + `cast_rmsnorm_fp32.py` inserts `Cast(fp32)` around the remaining 15 unweighted variance chains | ✅ unchanged | ❌ `len=0` |

Iteration artifacts live at `models/runs/onnx-export-vN-<descriptor>/`. Each one is the previous version's full bundle with the additional rewriter applied to the decoder. The embed_tokens graph is byte-identical across all versions (PEFT/LoRA doesn't touch embed tables; upstream's bytes are already optimal).

## Reproducing a fresh export

```powershell
# 1. PEFT-merge the LoRA (NOT unsloth's save_pretrained_merged — produces all-pad)
uv run --project models python ../merge_lora_peft.py `
  --base unsloth/gemma-4-E2B-it `
  --adapter Maelstrome/lora-wave-session-r32 `
  --out-dir runs/merge-peft `
  --device cuda --dtype bfloat16

# 2. Smoke test the merge (don't continue if 0/2 prompts pass)
uv run --project models python ../diagnose_merged_base.py `
  --source-repo runs/merge-peft `
  --prompts "What is the capital of France? Answer in one sentence." `
            "I'm feeling anxious right now. What's one small thing I can do?" `
  --max-new-tokens 48 --device cuda --dtype bfloat16

# 3. Run the end-to-end export pipeline → runs/onnx-export-v3 by default
uv run --project models python export.py `
  --source-repo runs/merge-peft `
  --out-dir runs/onnx-export-v3 `
  --track b

# 4. Apply the PLE int4 Gather rewrite
uv run --project models python quantize_gather.py runs/onnx-export-v3/onnx
```

(All `runs/` paths are relative to `models/` since `export.py` lives in `models/onnx/`.)

## Reproducing only the post-export rewriters (v3 → v4 → v5 → v6 → v7)

Stage each iteration into its own directory so they can be A/B'd against each other:

```powershell
# v3 → v4: gpt2-mode fusion (FastGelu)
# Already happens automatically inside export.py's _optimize_graph step.

# v4 → v5: Pow(x, 2.0) → Mul(x, x)
uv run --project models python rewrite_pow_to_mul.py `
  runs/onnx-export-v4-fused/onnx/decoder_model_merged_q4f16.onnx `
  runs/onnx-export-v5-pow2mul/onnx/decoder_model_merged_q4f16.onnx

# v5 → v6: RMSNorm fusion (227 of 242 chains)
uv run --project models python fuse_rmsnorm.py `
  runs/onnx-export-v5-pow2mul/onnx/decoder_model_merged_q4f16.onnx `
  runs/onnx-export-v6-rmsnorm/onnx/decoder_model_merged_q4f16.onnx

# v6 → v7: Cast(fp32) around remaining 15 unweighted variance chains
uv run --project models python cast_rmsnorm_fp32.py `
  runs/onnx-export-v6-rmsnorm/onnx/decoder_model_merged_q4f16.onnx `
  runs/onnx-export-v7-castfp32/onnx/decoder_model_merged_q4f16.onnx
```

After each step, `embed_tokens_q4f16.onnx*` + the tokenizer/config files are copied across (already done in the existing `runs/` directories; if you regenerate from scratch you'll need to copy them too).

## Verifying an export

CPU correctness via Node:
```powershell
cd ../../client
MODEL_ID=onnx-export-vN-<descriptor> pnpm exec tsx scripts/bench-onnx-wave-prompts.ts
```

Expected output: all three WAVE prompts (phase / check-in turn 1 / reflection) produce coherent schema-compliant text. Failure here means the export broke; failure only in browser WebGPU means we hit the same fp16-overflow class of bug we've documented.

Browser verification with a local model (no HF upload required):
```powershell
cd ../../client
$env:EXPORT_DIR="onnx-export-vN-<descriptor>"; pnpm exec tsx scripts/serve-local-hf.ts
# Then open http://localhost:3000/models/onnx-test/compare?local=1 in the browser,
# clear site data to drop transformers.js IndexedDB cache, load fine-tune, run all 3 tasks.
```

## What doesn't work, and won't, without significant additional work

If you want to push past v7, the remaining decomposed-vs-fused divergences vs upstream are:

| Site | What we emit | What upstream emits | What fixing it would take |
|---|---|---|---|
| Attention | manual `Q@K^T → +mask → Softmax → @V` (35 chains) | `GroupQueryAttention` contrib op (12 of 35 layers) | Rewrite `MergedDecoderWrapper.forward` in `export.py` to use `torch.nn.functional.scaled_dot_product_attention` with the exact attention mask + KV-sharing layout the ORT optimizer's GQA fusion expects. Days of work, no guarantee. |
| RoPE | manual `Cos/Sin/Mul/Add` interleave (50 cos/sin pairs) | `RotaryEmbedding` contrib op | Same shape of problem — rewrite the rotary application in the wrapper so the optimizer's pattern matcher recognizes it. |
| Mask `-inf` | Likely emits `-65504` as fp16 saturation point | Probably uses fp32 mask casts | Audit `_preprocess_mask_arguments` callsite in the wrapper and force fp32 for mask additions. |

See the [postmortem §"What we tried that doesn't work"](../../docs/postmortems/onnx-finetune.md#what-we-tried-that-doesnt-work) for things to NOT re-litigate.

## Related code outside this directory

| Path | Purpose |
|---|---|
| [`../merge_lora_peft.py`](../merge_lora_peft.py) | PEFT-based LoRA merge that produces a coherent fp16 base. Required first step. |
| [`../diagnose_merged_base.py`](../diagnose_merged_base.py) | 2-prompt PyTorch smoke test. Catches broken merges before downstream conversion. |
| [`../../client/scripts/bench-onnx.ts`](../../client/scripts/bench-onnx.ts) | Original CPU bench (simple chat prompts). Doesn't catch the long-context bug. |
| [`../../client/scripts/bench-onnx-wave-prompts.ts`](../../client/scripts/bench-onnx-wave-prompts.ts) | CPU bench against production WAVE prompts. **This is the bench that proved CPU-vs-WebGPU divergence.** |
| [`../../client/scripts/serve-local-hf.ts`](../../client/scripts/serve-local-hf.ts) | Static-file server mirroring HF Hub's URL layout. Lets you test local exports under browser WebGPU without uploading. |
| [`../../client/app/models/onnx-test/compare/page.tsx`](../../client/app/models/onnx-test/compare/page.tsx) | Browser-side A/B page; `?local=1` routes the fine-tune slot to localhost. |

## Postmortems / external context

- [`docs/postmortems/onnx-finetune.md`](../../docs/postmortems/onnx-finetune.md) — the canonical write-up of why v3 through v7 all fail on browser WebGPU.
- [`docs/postmortems/onnx-export.md`](../../docs/postmortems/onnx-export.md) — the original Mac export postmortem (predates the Windows handoff and the WebGPU divergence finding; export-time details only).
- [`client/docs/onnx-webgpu-divergence.md`](../../client/docs/onnx-webgpu-divergence.md) — earlier write-up of the divergence finding; superseded by the postmortem.
- [`client/docs/transformers-js-gemma4-perf.md`](../../client/docs/transformers-js-gemma4-perf.md) — orthogonal `num_logits_to_keep` patch for transformers.js v4.2.0. Still applies; nothing in this directory changes it.
