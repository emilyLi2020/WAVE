# `models/finetune/` — Gemma 4 E2B-it WAVE fine-tune pipeline

> **Status**: ships the LoRA at [`Maelstrome/lora-wave-session-r32`](https://huggingface.co/Maelstrome/lora-wave-session-r32). All training, eval, merging, and synthetic-data tooling for the WAVE fine-tune lives here. The merged base + adapter feed the export pipelines under [`../gguf/`](../gguf/) (production browser path via wllama) and [`../onnx/`](../onnx/) (parked).

## What this directory is

Everything required to turn the checked-in clinician seed JSONL under [`../datasets/human/`](../datasets/human/) into:

1. A normalized prompt + strict-JSON-output training dataset.
2. A QLoRA adapter on Gemma 4 E2B-it.
3. Generation-quality eval against a frozen held-out split (JSON validity, schema, style, safety, base-vs-LoRA NLL).
4. A coherent PEFT-merged 16-bit checkpoint that downstream conversion (GGUF / ONNX / MediaPipe) can consume without hitting the all-`<pad>` corruption from `unsloth.save_pretrained_merged`.

Nothing in this folder ships to users. The production session path runs Gemma 4 E2B-it via wllama + WebGPU/WASM in the browser; see [`../../docs/models.md`](../../docs/models.md) for the per-surface contract and [`../../docs/model-training.md`](../../docs/model-training.md) for ship gates.

## Quick reference

| Script | Purpose |
|---|---|
| [`prepare_wave_session_dataset.py`](prepare_wave_session_dataset.py) | Normalize check-in / phase / reflection clinician JSONL into the unified `{input, output}` shape. Writes `datasets/lora-wave-session-normalized.jsonl` by default. Source of `build_*_prompt` / `validate_*_output` reused by the synthetic pipeline. |
| [`analyze_wave_session_dataset.py`](analyze_wave_session_dataset.py) | EDA over raw + normalized rows; emits `datasets/lora-wave-session-expanded-eda.{json,md}`. Use to spot coverage gaps before deciding whether to generate synthetics. |
| [`generate_phase_narration_synthetic.py`](generate_phase_narration_synthetic.py) | Deterministic template-based expansion of the phase narration JSONL. No API calls. Reproducible with `--seed`. |
| [`generate_wave_session_synthetic.py`](generate_wave_session_synthetic.py) | Gap-driven synthetic gap-fill for the unified dataset. OpenAI `gpt-5-mini` proposes; **local** validators + dedup gate every accepted row. |
| [`train_wave_session_lora.py`](train_wave_session_lora.py) | **Active trainer.** Unified session LoRA (check-ins 1–5 + reflection + phase narration). Unsloth QLoRA by default, PEFT fallback. Writes adapter, frozen splits, eval, run config under `runs/lora-wave-session/<timestamp>/`. |
| [`train_phase_narration_lora.py`](train_phase_narration_lora.py) | Older phase-only trainer. Separate dataset, separate eval contract. Kept for the contest-results comparison; new work should use the unified trainer. |
| [`run_generation_eval_from_adapter.py`](run_generation_eval_from_adapter.py) | Re-run generation eval against `runs/lora-wave-session/<id>/test.jsonl` without retraining. Loads the saved adapter and reuses the trainer's eval code path. |
| [`run_generation_eval_phase_only.py`](run_generation_eval_phase_only.py) | Same idea for the phase-only trainer's saved run dirs. |
| [`regen_phase_failures.py`](regen_phase_failures.py) | Re-generate specific `example_id` rows to debug or reproduce a single failure. |
| [`merge_lora_adapter.py`](merge_lora_adapter.py) | **Unsloth-based** merge → merged 16-bit safetensors. Convenient when the unsloth env is already loaded. **Warning:** on our LoRA this path has produced all-`<pad>` output downstream; verify with `diagnose_merged_base.py` and prefer `merge_lora_peft.py` if you hit that. |
| [`merge_lora_peft.py`](merge_lora_peft.py) | **PEFT-based** merge (no unsloth). Required because `unsloth.save_pretrained_merged` produced 100% `<pad>` tokens for our adapter. This is the merge that feeds the GGUF and ONNX export pipelines. |
| [`diagnose_merged_base.py`](diagnose_merged_base.py) | 2-prompt PyTorch smoke test on any merged checkpoint. **Run this between merge and conversion.** If it prints garbage / pad-only, stop — the merge is broken, don't waste hours on downstream conversion. |
| [`inspect_task_file.py`](inspect_task_file.py) | Inspect a `.task` MediaPipe bundle file. |
| [`01_gemma4_smoke_test.ipynb`](01_gemma4_smoke_test.ipynb) | First-machine smoke test: downloads `google/gemma-4-E2B-it`, runs one generic + one WAVE prompt. Use to confirm the base model works on your hardware before touching the trainer. |

Detailed docs:

- [`SYNTHETIC_DATA.md`](SYNTHETIC_DATA.md) — commands, API key handling, disclosure checklist for `generate_wave_session_synthetic.py`.
- [`SYNTHETIC_DATASET_GENERATION.md`](SYNTHETIC_DATASET_GENERATION.md) — narrative on both synthetic paths (deterministic phase templates vs gap-driven session) and how clinical safeguards are layered.

## End-to-end pipeline

```
datasets/human/  (clinician seed JSONL — check-in 1–5, reflection, phase)
        │
        │  prepare_wave_session_dataset.py
        ▼
datasets/lora-wave-session-normalized.jsonl   ← unified {input, output} shape
        │
        │  analyze_wave_session_dataset.py  ──►  datasets/lora-wave-session-expanded-eda.{json,md}
        │
        │  (optional, only if EDA shows coverage gaps)
        │  generate_wave_session_synthetic.py --generate
        │  generate_phase_narration_synthetic.py
        ▼
datasets/lora-wave-session-expanded.jsonl     ← normalized + accepted synthetic drafts
        │
        │  train_wave_session_lora.py
        ▼
runs/lora-wave-session/<timestamp>/
  ├─ adapter/                  ← PEFT LoRA + tokenizer
  ├─ train.jsonl / test.jsonl  ← frozen splits
  ├─ eval.json                 ← generation metrics + base-vs-LoRA NLL/perplexity/composite score
  └─ run-config.json           ← model, seed, hyperparameters
        │
        │  merge_lora_peft.py  (PEFT, not unsloth — see merge section)
        ▼
runs/merge-peft/               ← coherent bf16 merged base (~9.5 GB)
        │
        │  diagnose_merged_base.py  ←  ALWAYS run this between merge and any conversion
        ▼
   feeds ../gguf/ and ../onnx/ export pipelines
```

All `runs/` and `datasets/` paths in the scripts are **relative to `models/`**, not to `models/finetune/`. Always invoke commands from `models/`.

## Setup

For Python env (`uv` or `conda`), Gemma license + `huggingface-cli login`, and the `pyproject.toml`-as-source-of-truth rule, see [`../README.md`](../README.md). Below are only the fine-tune-specific bits.

### Hardware

| Path | Min VRAM | Notes |
|---|---|---|
| Unsloth QLoRA on E2B-it (default) | 16 GB | What we ship on. `--max-seq-length 3072` is the safe ceiling on a 16 GB consumer card. |
| Unsloth QLoRA on E4B-it | ~17 GB | VRAM-heavier per Unsloth guidance. Out of scope for this repo. |
| PEFT fallback (`--backend peft`) | similar | Use when Unsloth is unusable on the host (rare Windows / Triton failures). |
| CPU training | — | Not supported in practice. The smoke notebook works on CPU; the trainer does not. |

### GPU PyTorch

`uv sync` may install CPU torch. Before training, install a CUDA wheel that matches your driver (see [`../README.md`](../README.md) → "GPU (optional)" for the right index URL). Unsloth requires importable `torch` with CUDA before training will start.

### Windows / Triton

Unsloth on Windows expects **Triton**. The repo pins `triton-windows` in `pyproject.toml` so `uv sync` gets a working import stack. If `import unsloth` fails mentioning Triton, reinstall from the lockfile rather than ad-hoc pip mixing.

## Step 1 — Prepare the dataset

```powershell
cd models
uv run python finetune/prepare_wave_session_dataset.py
```

Defaults read clinician seed JSONL from [`../datasets/human/`](../datasets/human/) (`DEFAULT_SOURCE_FILES` in [`prepare_wave_session_dataset.py`](prepare_wave_session_dataset.py)) and write `datasets/lora-wave-session-normalized.jsonl`. Override with repeated `--source` if you add new files; override the output path with `--output`.

Each row uses the unified shape that matches the app's JSON-mode contract:

```json
{
  "input":  { "surface": "phase_narration", "prompt": "...", "metadata": { "...": "..." } },
  "output": { "...": "..." }
}
```

The same `build_*_prompt` / `validate_*_output` functions used here are reused by `generate_wave_session_synthetic.py`, so synthetic rows can't sneak in with a looser schema than a normalized one.

### EDA

```powershell
uv run python finetune/analyze_wave_session_dataset.py
```

Writes `datasets/lora-wave-session-expanded-eda.{json,md}`. Look at it before deciding whether to generate synthetics — only fill specific coverage gaps, not just to make the dataset larger.

## Step 2 — (Optional) Synthetic expansion

Only run after EDA shows a meaningful imbalance. Current check-in coverage is dense (~1,534 rows) and `phase_narration` / `reflection` are sparse — that's what the synthetic pipeline targets.

**Deterministic phase template expansion** (no API):

```powershell
uv run python finetune/generate_phase_narration_synthetic.py
```

**Gap-driven session synthetics** (OpenAI proposes, local validators gate):

```powershell
$env:OPENAI_API_KEY="..."
uv run python finetune/generate_wave_session_synthetic.py --generate --max-accepted 20
```

See [`SYNTHETIC_DATA.md`](SYNTHETIC_DATA.md) for commands, API key handling, disclosure checklist; [`SYNTHETIC_DATASET_GENERATION.md`](SYNTHETIC_DATASET_GENERATION.md) for the layered safeguards (shared validators, dedup thresholds, rubric scoring, length distribution checks).

## Step 3 — Train

The active trainer is [`train_wave_session_lora.py`](train_wave_session_lora.py). It applies the explicit `gemma-4` chat template, strips the leading `<bos>` from rendered SFT text, trains on assistant responses only, and writes a token-length preflight that hard-fails truncation unless `--allow-truncation` is passed.

**Always dry-run first** — it validates the dataset and the split without loading Gemma:

```powershell
cd models
uv run python finetune/train_wave_session_lora.py `
  --data datasets/lora-wave-session-expanded.jsonl `
  --dry-run
```

Remove `--dry-run` to train. Artifacts land under `runs/lora-wave-session/<timestamp>/`.

### Useful trainer flags

Defaults reflect lessons from long runs (see `parse_args()` in the trainer for the full list):

| Flag | Default | Why it matters |
|---|---|---|
| `--backend` | `unsloth` | `peft` is the fallback when Unsloth is unusable on the host. |
| `--max-seq-length` | `3072` | Safer on ~16 GB cards than 4096; matches token stats from the contest run (p99 ~2.1k). |
| `--save-steps` / `--save-total-limit` | `50` / `5` | Periodic checkpoints so a Windows CUDA crash mid-epoch doesn't wipe the run. |
| `--resume-from-checkpoint <path>` | — | Continue from a saved checkpoint directory. |
| `--final-eval-mode` | `completion` | Faster, stable base-vs-LoRA NLL on the frozen test split. Generation eval on Windows is flaky on Gemma 4 + Unsloth cache path. |
| `--validation-eval-mode` | `completion` | Same idea during training / hparam sweeps. |
| `--skip-generation-eval` | off | When passed, skips post-training generation eval (the adapter still saves). After `--hparam-search`, completion final eval may require a single follow-up run *without* `--hparam-search` so the best model stays loaded in memory. |
| `--generation-eval-limit` | `0` (all) | Cap test examples for smoke runs. |
| `--allow-truncation` | off | Preflight fails if any row exceeds `--max-seq-length`. Keep off unless truncation is intentional. |

### Phase-only trainer (legacy)

```powershell
uv run python finetune/train_phase_narration_lora.py `
  --data datasets/human/lora-phase-narration-clinician.jsonl `
  --dry-run
```

Same JSON-output contract, separate dataset, separate eval gates. The contest result under [`../contest-results/phase-narration-lora/`](../contest-results/phase-narration-lora/) came from this trainer.

## Step 4 — Evaluate

Two paths:

```powershell
# Re-run generation eval from a saved run dir (no retraining)
uv run python finetune/run_generation_eval_from_adapter.py `
  --run-dir runs/lora-wave-session/<timestamp>

# Same, phase-only trainer
uv run python finetune/run_generation_eval_phase_only.py `
  --run-dir runs/lora-phase-narration/<timestamp>
```

The eval reports JSON validity, six-line schema pass rate, patient-facing style pass rate, safety pass rate, medication-directive pass rate, p95 latency, token F1, ROUGE-L, base-vs-LoRA completion NLL / perplexity / schema-style-safety deltas, and a composite `loraWaveScore` out of 100.

To re-run a specific failed row for debugging:

```powershell
uv run python finetune/regen_phase_failures.py `
  --run-dir runs/lora-phase-narration/<timestamp> `
  --example-ids ex_001 ex_042
```

## Step 5 — Merge LoRA into the base

You need a merged 16-bit checkpoint to feed [`../gguf/`](../gguf/) or [`../onnx/`](../onnx/) conversion. **Two scripts, pick the right one:**

| Script | Backend | When to use |
|---|---|---|
| [`merge_lora_adapter.py`](merge_lora_adapter.py) | Unsloth (`save_pretrained_merged`) | Only if you've verified it produces coherent output via `diagnose_merged_base.py` afterwards. **Has produced all-`<pad>` output on our adapter** — that's why the GGUF/ONNX pipelines require the PEFT merge. |
| [`merge_lora_peft.py`](merge_lora_peft.py) | `peft.merge_and_unload` (no unsloth) | **Default.** Mac, Windows, and Linux compatible. Required for the GGUF and ONNX export paths. |

Recommended path:

```powershell
cd models

# 1. PEFT merge (produces coherent merged base)
uv run python finetune/merge_lora_peft.py `
  --base unsloth/gemma-4-E2B-it `
  --adapter Maelstrome/lora-wave-session-r32 `
  --out-dir runs/merge-peft `
  --device cuda --dtype bfloat16

# 2. Smoke-test the merge BEFORE feeding it to any converter
uv run python finetune/diagnose_merged_base.py `
  --source-repo runs/merge-peft `
  --prompts "What is the capital of France? Answer in one sentence." `
            "I'm feeling anxious right now. What's one small thing I can do?" `
  --max-new-tokens 48 --device cuda --dtype bfloat16
```

If `diagnose_merged_base.py` prints garbage or pad-only output, stop. The merge itself is broken — don't sink time into ONNX/MLC/GGUF conversion until you have a coherent merged base.

After a passing smoke-test, hand off to:

- [`../gguf/README.md`](../gguf/README.md) — production browser path via wllama (`convert_hf_to_gguf.py` → quantize Q4_K_M → split for the 2 GB ArrayBuffer ceiling).
- [`../onnx/README.md`](../onnx/README.md) — parked; documented for the postmortem.

## Local vs remote training

### Local (Windows / Linux, 16 GB GPU)

`uv sync` + a CUDA torch wheel + `huggingface-cli login` is enough. The trainer's defaults are tuned for this case. Use `--final-eval-mode completion` because full-generation eval on Windows + Gemma 4 + Unsloth is unstable (CUDA illegal memory near the VRAM ceiling).

### Remote (Linux GPU VM)

Use a remote box when you need stable full-generation eval, faster iteration without WDDM quirks, or more VRAM than a laptop GPU. A few things bite repeatedly:

- **Bring the repo, not the venv.** Upload the `models/` tree without `.venv/` or HF caches. On the VM run `cd models && uv sync` and `huggingface-cli login`.
- **Ephemeral disks.** Some providers mount fast `/ephemeral` storage that the default user can't write to. Keep HF and pip caches under `$HOME` (or `chown` the mount per provider docs).
- **Provider SSH keys.** Managed GPU services often issue their own key — your personal `id_ed25519` may be rejected until you add your public key to the instance.
- **FlashAttention 2.** Often no prebuilt wheel for your exact Python + torch + CUDA combo → source build, which needs a real `nvcc` (full CUDA toolkit, not just `ptxas`). On an A100, restrict architectures with `FLASH_ATTN_CUDA_ARCHS=80` so the compile finishes in tens of minutes instead of hours. Even with FA2 installed, Gemma 4 may still fall back to SDPA for some head sizes — don't treat FA2 presence as proof the run is accelerated.
- **Long installs vs HTTP gateways.** Some MCP / SSH wrappers time out on `flash-attn` compile while the job still runs on the VM. Poll `nvidia-smi`, the process list, or log files rather than assuming failure on timeout.
- **`ldconfig`.** Fix CUDA library visibility (`ldconfig` / `LD_LIBRARY_PATH` per distro) before long runs — saves "mystery" import failures.

## Gotchas we already solved

| Area | Symptom | Fix |
|---|---|---|
| Unsloth-merged checkpoint | Plain PyTorch inference outputs 100% `<pad>` tokens | Re-merge with `merge_lora_peft.py` (no unsloth). Verify with `diagnose_merged_base.py` *before* downstream conversion. |
| Unsloth vs PyPI stack | `trl.trainer.utils.ConstantLengthDataset` missing, `datasets` version conflicts | Pin from the repo `uv.lock`. Don't `pip install unsloth` alone. |
| Torch companion libs | `torchvision::nms` operator mismatch after upgrades | Install matching `torch` + `torchvision` builds for the same CUDA channel. |
| Windows | `import unsloth` fails citing Triton | `triton-windows` is in `pyproject.toml`; `uv sync` from the lockfile. |
| Windows | TRL chat-template load `UnicodeDecodeError` / `cp1252` | Both trainers auto-relaunch in Python UTF-8 mode before importing TRL. |
| TRL 0.24 evaluate API | Crash when passing a raw eval dataset where TRL wants the trainer-processed one | Call `trainer.evaluate()` without incompatible `eval_dataset=` overrides. |
| Windows VRAM | In-process hparam sweep — second load doesn't fully release CUDA | One candidate per Python process. |
| Windows eval | CUDA illegal memory during `generate` on Gemma 4 + Unsloth cache path | Prefer `--final-eval-mode completion` / `--validation-eval-mode completion` for selection; run full generation eval on Linux. |
| Gemma tokenizer | Processor-style tokenizer wants `text=` keyword | Trainer-side helpers normalize encode/decode paths. |
| Long runs near VRAM limit | `torch.AcceleratorError: CUDA error: unknown error` | Reduce `--max-seq-length` (3072 or 2048); rely on `--save-steps` + `--resume-from-checkpoint`. |
| Training format | Duplicate `<bos>` or wrong chat template | Trainer strips leading `<bos>` from rendered SFT text; uses `gemma-4` (non-thinking) template, per [Unsloth Gemma 4 docs](https://unsloth.ai/docs/models/gemma-4/train). |
| Response-only masking | Regex marker escaping drops all training rows | Audit response-only filters so valid assistant spans aren't zeroed out. |
| Unsloth Studio | HF `datasets` error on raw expanded JSONL | Register `datasets/lora-wave-session-studio-sharegpt.jsonl` as ChatML / `messages`. |
| Import order | Odd Unsloth warnings when `peft` is imported before Unsloth | Initialize Unsloth first in any eval helper that mirrors the trainer. |

## Generated artifacts (gitignored)

- `runs/` — every training run lands under `runs/lora-wave-session/<timestamp>/` or `runs/lora-phase-narration/<timestamp>/`.
- `runs/merge-peft/` — the PEFT-merged base that feeds conversion.
- `runs/merge-peft-gguf/` — llama.cpp conversion + quantization output (see [`../gguf/`](../gguf/)).
- `../unsloth_compiled_cache/` — Unsloth's compiled kernels.

All ignored via the repo [`.gitignore`](../../.gitignore).

## Related code outside this directory

| Path | Purpose |
|---|---|
| [`../datasets/human/`](../datasets/human/) | Clinician seed JSONL (check-in 1–5, reflection, phase). Source of truth for `prepare_wave_session_dataset.py` defaults. |
| [`../datasets/HF_README.md`](../datasets/HF_README.md) | Hugging Face dataset card for publishing the unified JSONL. |
| [`../gguf/`](../gguf/) | Production export path — turns the PEFT-merged base into a Q4_K_M GGUF for wllama / Ollama / llama-cli. |
| [`../onnx/`](../onnx/) | Parked ONNX export path (fp16 WebGPU divergence). See [`../../docs/onnx-webgpu-divergence.md`](../../docs/onnx-webgpu-divergence.md). |
| [`../contest-results/`](../contest-results/) | Frozen artifacts from the phase-narration contest run. |
| [`../../docs/model-training.md`](../../docs/model-training.md) | Product ship gates and adapter manifest rules. |
| [`../../docs/models.md`](../../docs/models.md) | Per-surface model contract (which adapter is used where, base-only crisis behavior). |

## Unsloth official docs

- [Gemma 4 fine-tuning](https://unsloth.ai/docs/models/gemma-4/train) — BOS handling, multimodal vs text-only flags, loss-scale and cache / shared-KV notes.
