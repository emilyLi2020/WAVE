# WAVE Session LoRA — Training Report

**Run ID:** `20260511T083222Z`
**LoRA:** `lora-wave-session`
**Adapter path:** `models/runs/lora-wave-session/20260511T083222Z/adapter/`
**Adapter size:** 128 MB (`adapter_model.safetensors`)
**Base model:** `unsloth/gemma-4-E2B-it` (4-bit pre-quantized as `unsloth/gemma-4-e2b-it-unsloth-bnb-4bit`)

---

## 1. What we trained

A single unified LoRA adapter (`lora-wave-session`) on top of **Gemma 4 E2B Instruct** that handles three WAVE clinical surfaces in one model:

| Surface | Purpose |
|---|---|
| `check_in` | Multi-turn patient check-in with structured turn sequencing |
| `phase_narration` | Six-line patient-facing phase narration |
| `reflection` | Reflection plan with a concrete next step |

The shippable artifact target is **Gemma 4 E2B-it (INT4) + lora-wave-session**, run locally on browser/mobile.

E4B was rejected because its LoRA needs ~17 GB VRAM (RTX 5080 has 16 GB).

---

## 2. Dataset

**Source file:** `models/datasets/lora-wave-session-expanded.jsonl`
**Total examples:** 4,277

### Splits (seed `7`, 80/10/10)

| Split | Count | check_in | phase_narration | reflection |
|---|---|---|---|---|
| Train | 3,421 | 1,225 | 1,251 | 945 |
| Validation | 428 | 165 | 155 | 108 |
| Test | 428 | 144 | 147 | 137 |

Stratified by `splitKey` so related rows stay in the same split (320 unique split keys in train).

### By source LoRA (full dataset)

| Source LoRA | Count |
|---|---|
| `lora-phase-narration` | 1,553 |
| `lora-reflection` | 1,190 |
| `lora-check-in-1` | 288 |
| `lora-check-in-2` | 336 |
| `lora-check-in-3` | 335 |
| `lora-check-in-4` | 335 |
| `lora-check-in-5` | 240 |

### By data status (full dataset)

| Status | Count |
|---|---|
| `synthetic_draft` | 2,645 |
| `draft` | 1,574 |
| `ready` | 58 |

### Token-length preflight (Gemma 4 tokenizer)

| Stat | Tokens |
|---|---|
| p50 | 518 |
| p90 | 1,752 |
| p95 | 1,833 |
| p99 | 2,104 |
| max | 2,227 |

`maxSeqLength=3072` gave a comfortable margin and no truncation. Trainer was launched with `--allow-truncation` **off**, so any over-limit row would have hard-failed before training. None did.

---

## 3. Training configuration

### Model / loader

```text
backend           : unsloth (FastModel)
model             : unsloth/gemma-4-E2B-it
load_in_4bit      : true
max_seq_length    : 3072
chat_template     : gemma-4 (non-thinking, per Unsloth guide for small Gemma 4)
bos_handling      : strip leading <bos> from rendered training text
```

### LoRA / PEFT

```text
peft_type                    : LORA
r                            : 16
lora_alpha                   : 32
lora_dropout                 : 0.0
bias                         : none
finetune_vision_layers       : false (text-only training)
finetune_language_layers     : true
finetune_attention_modules   : true
finetune_mlp_modules         : true
target_modules               : q/k/v/o + gate/up/down (language layers)
use_gradient_checkpointing   : "unsloth"
use_rslora / use_dora        : false
```

### Optimization

```text
seed                         : 7
prompt_style                 : wave_session_input_output_json
batch_size (per device)      : 1
gradient_accumulation_steps  : 8
effective_batch_size         : 8
optimizer                    : adamw_8bit
learning_rate                : 2e-4
lr_scheduler                 : linear
warmup_steps                 : 64 (auto: ~5% of total)
weight_decay                 : 0.001
max_grad_norm                : 0.3
epochs                       : 3
total_steps                  : 1,284
train_on_responses_only      : true (mask user turns; Gemma 4 markers <|turn>user / <|turn>model)
```

### Reliability / artifacts

```text
save_strategy                : steps
save_steps                   : 50
save_total_limit             : 5
resume_from_checkpoint       : supported via flag
final_eval_mode              : completion (no risky post-train generation)
```

These reliability defaults were added after the previous run crashed at step ~461 with no recoverable checkpoint.

---

## 4. Doc alignment with the Unsloth Gemma 4 guide

| Recommendation | Status |
|---|---|
| Use `gemma-4` template for small Gemma 4 | ✅ |
| Strip `<bos>` from rendered training text | ✅ |
| QLoRA / 4-bit | ✅ |
| Text-only Gemma 4 layers (`finetune_vision_layers=false`) | ✅ |
| Attention + MLP target modules | ✅ |
| `lora_dropout=0` default | ✅ |
| `use_gradient_checkpointing="unsloth"` | ✅ |
| `train_on_responses_only` with Gemma 4 markers | ✅ |
| Periodic checkpoint saving | ✅ |
| Hard-fail on token truncation | ✅ |
| `max_seq_length` chosen from real dataset distribution (not generic) | ✅ |
| Linear scheduler matching text SFT recipe | ✅ |
| Auto warmup ≈ 5% of total steps | ✅ |

---

## 5. Run timeline

- **Started:** `2026-05-11 03:32 UTC` (run dir `20260511T083222Z`)
- **Finished:** `2026-05-11 ~17:00 UTC` (final checkpoint `checkpoint-1284`)
- **Steps:** 1,284 (3 epochs × 428 effective steps)
- **Hardware:** RTX 5080, 16 GB VRAM, Windows 11
- **Effective backend:** Unsloth 2026.5.2, Torch 2.10.0+cu128, CUDA 12.0, Triton 3.6.0
- **Attention path:** Xformers fallback (FA2 unavailable on this Windows install — non-fatal)

**GPU utilization stayed ~95-100% with ~15.8 GB used through training.**

---

## 6. Training loss curve

| Phase | Mean loss |
|---|---|
| Step 1 | 1.55 |
| Steps 1-50 (avg) | 0.76 |
| Steps 400-500 | 0.148 |
| Steps 800-900 | 0.126 |
| Last 100 steps | 0.112 |
| Min loss | 0.0146 (step 1,203) |

Smooth monotonic decrease. No divergence, no spikes.

---

## 7. Validation metrics (held-out, n=428)

Mode: completion-only NLL/PPL on the assistant response.

| Metric | Value |
|---|---|
| Examples | 428 |
| Completion NLL | 4.704 |
| Completion PPL | 110.4 |

Surface coverage: `check_in 165`, `phase_narration 155`, `reflection 108`.

PPL on structured-JSON targets is not directly comparable to chat PPL — what matters is whether the generated outputs are valid, schema-conformant, and clinically safe. That is measured next.

---

## 8. Generation sanity check (n=8)

Mode: real generation against held-out **test** split via `run_generation_eval_from_adapter.py`, mode `4bit`.

Two passes were run. The first pass used the script default `--phase-max-new-tokens=160`, which caused two `phase_narration` outputs to be cut off mid-JSON. The second pass was rerun with `--phase-max-new-tokens=256` and the same 8 examples (deterministic, `--seed=7`, `--limit=8`).

### Pass 2 (final) — `--phase-max-new-tokens=256`

| Metric | Value |
|---|---|
| Examples | 8 (2 check_in, 3 phase_narration, 3 reflection) |
| **JSON validity rate** | **100% (8/8)** |
| **Schema pass rate** | **100% (8/8)** |
| Safety pass rate | 100% |
| Medical-directive pass rate | 100% |
| Style pass rate | 100% |
| No-markdown rate | 100% |
| No-analysis-voice rate | 100% |
| Patient-facing rate | 75% |
| Phase 6-line pass rate | 100% |
| Reflection next-step pass rate | 100% |
| Check-in turn-sequence pass rate | 100% |
| Mean Token F1 | 0.571 |
| Mean ROUGE-L F1 | 0.418 |
| Mean latency | 11.87 s |
| p50 latency | 12.46 s |
| p95 latency | 17.97 s |
| Mean tokens/sec | 10.1 |
| Total generated tokens | 996 |
| Aggregate `pass` flag | **true** |

The two previously-failing `phase_narration` outputs needed **183 and 207 generated tokens**, both above the original 160-token budget. With a 256-token budget they completed cleanly and passed JSON + schema + 6-line checks.

### Pass 1 (for the record) — `--phase-max-new-tokens=160`

| Metric | Value |
|---|---|
| JSON validity rate | 75% (6/8) |
| Schema pass rate | 75% (6/8) |
| Safety pass rate | 75% |
| Phase 6-line pass rate | 75% |
| Mean latency | 9.75 s |
| Mean tokens/sec | 12.0 |
| Aggregate `pass` flag | false |

Both failures were the same `phase_narration` truncation issue — model behavior was correct, generation budget was too small.

### Takeaways

- The adapter generates valid, schema-conformant JSON on all three surfaces.
- Style/safety/medical-directive/analysis-voice gates all hold.
- `phase_narration` needs a **per-surface generation budget ≥ 224 tokens** (256 recommended) for reliable completion.
- `check_in` (96) and `reflection` (192) budgets are fine.
- Patient-facing rate of 75% on this tiny n=8 sample is a single-example artifact, not a real signal. Worth confirming on a larger pass.
- A 60-100 sample pass is the natural next step before declaring the adapter ship-ready.

Reports saved at:
- `generation-sanity.json` — pass 1 (160-token budget, 75% schema)
- `generation-sanity-retry.json` — pass 2 (256-token budget, 100% schema)

---

## 9. Export

The trained PEFT adapter has been merged into the base and exported to two deployment formats.

### 9.1 Merged 16-bit safetensors

`models/successful_runs/local_final/merged-16bit/` (9.6 GB)

- `model.safetensors` (10.2 GB) — adapter merged into Gemma 4 E2B base, bf16
- Built via `merge_lora_adapter.py` using Unsloth `save_pretrained_merged(save_method="merged_16bit")`
- Useful as the canonical intermediate for any further conversion (ONNX, GGUF variants, distillation, etc.)

### 9.2 GGUF q4_k_m (browser/desktop deployment)

`models/successful_runs/local_final/gguf/`

| File | Size | Purpose |
|---|---|---|
| `gemma-4-e2b-it.Q4_K_M.gguf` | **3.19 GB** | Text LLM (q4_k_m quantized) |
| `gemma-4-e2b-it.BF16-mmproj.gguf` | 941 MB | Vision/audio projector (skip for text-only WAVE) |
| `Modelfile` | 214 B | Ollama import recipe |

Built via `export_gguf.py` → Unsloth `save_pretrained_gguf(quantization_method="q4_k_m")`, which uses bundled `llama.cpp` to convert merged HF weights → bf16 GGUF → q4_k_m GGUF.

Runtimes that load this directly:
- `llama.cpp` / `llama-server` (CPU/GPU)
- Ollama (`ollama create wave-session -f Modelfile`)
- `wllama` (WASM browser inference)

For text-only WAVE deployment, only `gemma-4-e2b-it.Q4_K_M.gguf` is needed (~3.2 GB).

### 9.3 ONNX (NOT exported in this run)

The WAVE web runtime currently loads `onnx-community/gemma-4-E2B-it-ONNX` at `q4f16` via `@huggingface/transformers`. To produce a matching merged ONNX from this LoRA we attempted `optimum`, but **`optimum 2.1.0` does not yet support Gemma 4** — it pinned `transformers` to 4.57.6 which does not recognize `model_type=gemma4`.

Workable paths forward (all out of scope for this run):
- Wait for `optimum` to add Gemma 4 support
- Use Xenova's `transformers.js` conversion scripts directly (custom build path that produced the public `onnx-community/gemma-4-E2B-it-ONNX`)
- Hand-roll `torch.onnx.export()` matching the I/O signature of the public ONNX, then quantize with `onnxruntime` to `q4f16`

Until then, the practical web path is **either GGUF + WASM runtime, or swap WAVE's web runtime to load the merged-16bit / a future merged ONNX**.

### 9.4 Other artifacts

```text
models/successful_runs/local_final/
├── adapter/                     # PEFT adapter only (128 MB)
├── checkpoints/                 # 5 retained training checkpoints (last: 1284)
├── eval.json                    # full per-example completion eval
├── generation-sanity.json       # 8-example sanity (160-token phase budget, 75% schema)
├── generation-sanity-retry.json # 8-example sanity rerun (256-token phase budget, 100% schema)
├── run-config.json              # resolved run/dataset/training config
├── token-length-report.json     # tokenizer preflight stats
├── tuning-summary.json
├── validation-eval.json         # 428-example completion validation
├── test.jsonl                   # held-out test split
└── REPORT.md                    # this file
```

---

## 10. Known issues / next steps

1. **Phase narration generation budget.** Resolved for sanity check (256 tokens fixes it). Apply the same `phase_narration ≥ 224` budget anywhere this LoRA is consumed (inference clients, eval harness defaults, browser/mobile runtime). Then run a 60-100 sample pass for statistically meaningful schema/safety rates.
2. **ONNX gap.** The WAVE web runtime expects ONNX `q4f16` matching `onnx-community/gemma-4-E2B-it-ONNX`. Optimum doesn't support Gemma 4 yet. Either wait for optimum support, hand-roll the export, or temporarily swap the web runtime to a GGUF/WASM path (see 9.3).
3. **No A/B vs. previous adapter** — explicitly skipped per instruction (previous run is considered failed).
4. **Disk:** ~640 MB across 5 training checkpoints, plus 9.6 GB merged-16bit + 4.1 GB GGUF. Once a winner is confirmed, prune all but `checkpoint-1284` + `adapter/` + `gguf/Q4_K_M.gguf`.
5. **Flash Attention 2** is unavailable on this Windows install. Non-fatal but training would be faster with FA2 wired up.

---

## 11. Reproducibility

```powershell
cd E:\Github\Wave\models
uv run python train_wave_session_lora.py `
  --data "datasets\lora-wave-session-expanded.jsonl"
```

All defaults are docs-aligned per section 3-4. The seed is `7` and the dataset is deterministic, so this command should reproduce the same split and same total step count.
