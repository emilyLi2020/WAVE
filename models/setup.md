# Training environment setup (local and remote)

This guide gets you to a **fully working** WAVE model training stack: Gemma 4 E2B-it, Unsloth (or PEFT fallback), and the unified session LoRA trainer. It complements [`README.md`](./README.md) (dependency installation) with **where to train**, **which files to use**, and **problems we already hit**.

For product ship gates and adapter manifest rules, see [`../docs/model-training.md`](../docs/model-training.md). A concrete successful local run is summarized in [`successful_runs/local_final/REPORT.md`](./successful_runs/local_final/REPORT.md).

---

## What to run

| Purpose | Script | Notes |
|--------|--------|--------|
| Unified session LoRA (check-ins 1–5, phase narration, reflection) | [`train_wave_session_lora.py`](./train_wave_session_lora.py) | Default backend: **Unsloth** QLoRA. Default base model: `unsloth/gemma-4-E2B-it`. |
| Phase-only LoRA (legacy / narrower) | [`train_phase_narration_lora.py`](./train_phase_narration_lora.py) | Separate dataset and eval contract. |

Dataset preparation (when you are regenerating training rows, not just training):

- **Clinician sources** checked into the repo: [`datasets/clinician-seeds/`](./datasets/clinician-seeds/) (check-in 1–5, reflection, phase expanded JSONL). `prepare_wave_session_dataset.py` uses these paths by default (`DEFAULT_SOURCE_FILES`); override with repeated `--source` if you add new files.
- [`prepare_wave_session_dataset.py`](./prepare_wave_session_dataset.py) writes `datasets/lora-wave-session-normalized.jsonl` by default (see `DEFAULT_OUTPUT` in that file).

**`--data` default vs this repo:** `train_wave_session_lora.py` defaults `--data` to the same path as `prepare_wave_session_dataset.DEFAULT_OUTPUT` (`datasets/lora-wave-session-normalized.jsonl`). The checked-in tree often only has **`datasets/lora-wave-session-expanded.jsonl`**; in that case pass it explicitly:

```bash
cd models
uv run python train_wave_session_lora.py --data datasets/lora-wave-session-expanded.jsonl --dry-run
```

---

## Common prerequisites (local and remote)

1. **Python 3.11 + deps** — from repo root, `cd models` then either:
   - `uv sync` (recommended), or
   - `conda env create -f environment.yml` and `conda activate wave-models`  
   Details: [`README.md`](./README.md) (single source of truth: `pyproject.toml`; never hand-edit `environment.yml`).

2. **CUDA PyTorch (GPU training)** — `uv sync` may install a CPU torch build. For NVIDIA GPUs, install a CUDA build that matches your driver (see README “GPU (optional)” for index URLs). Unsloth needs **importable `torch` with CUDA** before training.

3. **Hugging Face gated models** — Accept the license for [google/gemma-4-E2B-it](https://huggingface.co/google/gemma-4-E2B-it), then `huggingface-cli login` (or set `HF_TOKEN` in the environment). Do not commit tokens.

4. **Disk** — First Gemma download is large; ensure enough space under your HF cache (often `~/.cache/huggingface` on Linux, `%USERPROFILE%\.cache\huggingface` on Windows).

---

## Local training (Windows and Linux)

### Recommended path: repo `uv` environment + trainer script

```bash
cd models
uv sync
uv run python train_wave_session_lora.py --data datasets/lora-wave-session-expanded.jsonl --dry-run
```

Remove `--dry-run` to train. Artifacts go under `runs/lora-wave-session/<timestamp>/` (adapter, frozen splits, eval, config copies).

**Useful trainer flags** (defaults reflect lessons from long runs; see `parse_args()` in `train_wave_session_lora.py`):

| Flag | Default | Why it matters |
|------|---------|----------------|
| `--backend` | `unsloth` | `peft` is a fallback if Unsloth is unusable on the machine. |
| `--max-seq-length` | `3072` | Safer on ~16 GB cards than 4096; matches token stats in REPORT (p99 ~2.1k tokens). |
| `--save-steps` / `--save-total-limit` | `50` / `5` | Avoid losing work on Windows CUDA crashes mid-epoch. |
| `--resume-from-checkpoint` | — | Point at a saved checkpoint directory to continue. |
| `--final-eval-mode` | `completion` | Faster, stable base-vs-LoRA NLL on the frozen test split. |
| `--validation-eval-mode` | `completion` | Same idea during training / sweeps. |
| `--skip-generation-eval` | not set | When passed, skips post-training eval (adapter still saves from training). Omit for normal eval. After `--hparam-search`, completion final eval may require a **single** follow-up run without `--hparam-search` so the best model stays in memory (see trainer `RuntimeError` messages in code). |
| `--generation-eval-limit` | `0` (all) | Cap test examples for smoke runs. |
| `--allow-truncation` | off | Preflight fails if any row exceeds `--max-seq-length`; keep off unless you intentionally accept truncation. |

**Windows note (TRL / UTF-8):** On Windows, TRL can crash importing chat templates under legacy code pages. The phase trainer and unified trainer mitigate UTF-8 issues; if you see `UnicodeDecodeError` / `cp1252` during import, run Python in UTF-8 mode (see README phase narration section).

### Optional: Unsloth Studio (GUI)

- Studio is installed separately (Unsloth installer) and is **not** the same environment as `models/.venv` unless you deliberately align them. For reproducible competition runs, prefer **`uv run python train_wave_session_lora.py`**.

**Studio dataset gotcha:** Unsloth Studio’s preview expects a **single consistent row schema**. The raw expanded JSONL mixes different `output` shapes (check-in vs phase vs reflection). Use the ChatML / ShareGPT export:

- [`datasets/lora-wave-session-studio-sharegpt.jsonl`](./datasets/lora-wave-session-studio-sharegpt.jsonl)

Register that file in Studio as **chatml** / `messages` style data.

### Model size: E2B, not E4B (for this repo)

WAVE’s shipped target is **Gemma 4 E2B-it** + `lora-wave-session`. E4B LoRA is VRAM-heavier (~17 GB in Unsloth’s guidance); on a **16 GB** consumer GPU, E2B QLoRA is the stable choice and matches [`../docs/models.md`](../docs/models.md).

### Windows + Triton

Unsloth on Windows expects **Triton**; the repo pins **`triton-windows`** in `pyproject.toml` so `uv sync` gets a working import stack. If `import unsloth` fails mentioning Triton, reinstall from the lockfile rather than ad-hoc pip mixing.

---

## Remote training (Linux GPU VM)

Use a remote box when you need **stable full-generation eval**, faster iteration without WDDM quirks, or more VRAM than a local laptop GPU.

### Bring the repo, not the venv

- Upload or `git clone` the **`models/`** tree (or whole repo) **without** `models/.venv` and without huge HF caches. Clinician seeds ship under [`datasets/clinician-seeds/`](./datasets/clinician-seeds/); override `prepare_wave_session_dataset.py` with repeated `--source` only if you add custom paths on the VM.
- On the VM: `cd models && uv sync` (or conda per README), then `huggingface-cli login`, then run the same trainer commands as locally.

### Caches and ephemeral disks

Some providers mount fast **ephemeral** storage (e.g. `/ephemeral`). On some images it is **not writable** by the default `ubuntu` user; if `permission denied`, keep HF and pip caches under **`$HOME`** (or chown the ephemeral mount per provider docs).

### SSH keys (e.g. Thunder Compute)

Managed GPU services often issue a **provider SSH key** (`ssh -i … root@host -p …`). Your personal `~/.ssh/id_ed25519` may be rejected until you **add your public key to the instance** through the provider UI/API. After that, `scp`/`ssh` with your own key matches what you expect for file transfer.

### Optional: xFormers and FlashAttention 2

- **xFormers:** Often installable via a **wheel** matched to your `torch` + CUDA build; Unsloth can use it as an attention backend when FlashAttention is absent.
- **FlashAttention 2:** Frequently **no prebuilt wheel** for your exact Python + torch + CUDA combo → **source build**, which needs a real **`nvcc`** (full CUDA toolkit, not only `ptxas` from a small pip meta-package). Builds can take tens of minutes.
- **A100-only compile:** FlashAttention’s build defaults can target multiple SMs (`80;90;100;120`). For a single A100, restrict architectures (e.g. environment variable **`FLASH_ATTN_CUDA_ARCHS=80`**) so the compile finishes in reasonable time.

**Reality check:** Even with FA2 installed, Gemma 4 paths may still fall back to SDPA for some head sizes; do not assume FA2 alone guarantees a speedup. See root [`AGENTS.md`](../AGENTS.md) (models / training notes).

### Automation and long installs

- HTTP gateways and MCP runners often **time out** on long `pip install` / `flash-attn` compiles while the job **still runs** on the VM — poll `nvidia-smi`, process list, or log files instead of assuming failure on timeout.
- **Multi-line heredocs** over brittle SSH wrappers often break quoting; prefer **one-liner** commands or writing files via **base64 decode** on the remote side.

### `ldconfig` / CUDA loader warnings

If Unsloth or `torch` prints a CUDA library path warning on Linux, fixing library visibility (`ldconfig` or `LD_LIBRARY_PATH` per distro docs) before long runs reduces “mystery” import/runtime failures.

---

## Utilities (EDA, post-train eval, packaging)

These scripts are not the main trainer but are part of the same workflow.

| Script | Purpose |
|--------|---------|
| [`analyze_wave_session_dataset.py`](./analyze_wave_session_dataset.py) | Raw + normalized EDA → [`datasets/lora-wave-session-expanded-eda.json`](./datasets/lora-wave-session-expanded-eda.json) and [`.md`](./datasets/lora-wave-session-expanded-eda.md). Uses the same default sources as `prepare_wave_session_dataset.py` unless you pass `--source` repeatedly. |
| [`run_generation_eval_from_adapter.py`](./run_generation_eval_from_adapter.py) | Generation eval from a finished `runs/lora-wave-session/<id>/` directory (expects `adapter/` and `test.jsonl`). |
| [`run_generation_eval_phase_only.py`](./run_generation_eval_phase_only.py) | Phase-narration-only generation eval from a saved run dir. |
| [`regen_phase_failures.py`](./regen_phase_failures.py) | Regenerate specific `example_id` rows for debugging / reproducibility checks. |
| [`merge_lora_adapter.py`](./merge_lora_adapter.py) | Merge a saved LoRA into the base model → merged weights (`--adapter-dir`, `--out-dir`; see `--help`). |
| [`export_gguf.py`](./export_gguf.py) | Export **merged** full weights to GGUF. Point `--adapter-dir` at the directory produced by `merge_lora_adapter.py` (Unsloth loads it as a full model). |

**Generated cache:** Unsloth may write compiled kernels under `models/unsloth_compiled_cache/` — local build output; do not edit by hand. The repo [`.gitignore`](../.gitignore) ignores this directory.

---

## Gotchas we solved (reference)

| Area | Symptom | What worked |
|------|---------|-------------|
| Unsloth vs PyPI stack | Import errors such as missing `trl.trainer.utils.ConstantLengthDataset`, or `datasets` version conflicts | Pin the **Unsloth-supported** TRL / `datasets` / `torch` stack; use the repo **`uv.lock`**, not random latest PyPI Unsloth alone. |
| Torch companion libs | `torchvision::nms` or operator mismatch after upgrades | Install **matching** `torch` + `torchvision` builds for the same CUDA channel. |
| Windows | `import unsloth` fails (Triton) | **`triton-windows`** in project deps; `uv sync` from the repo lockfile. |
| Windows | TRL template load `UnicodeDecodeError` / `cp1252` | UTF-8 mode / Windows console fixes (see README). |
| TRL 0.24 evaluate API | Crash when passing a raw eval dataset where TRL expects the trainer’s processed dataset | Call **`trainer.evaluate()`** without incompatible `eval_dataset=` overrides. |
| Windows VRAM | In-process hyperparameter sweep: second load does not release CUDA fully | Run **one candidate per Python process** (fresh process per search point). |
| Windows eval | CUDA illegal memory / instability during **`generate`** on Gemma 4 + Unsloth cache path | Prefer **`--final-eval-mode completion`** / **`--validation-eval-mode completion`** for selection; run **full generation eval on Linux** when you need JSON/schema gate metrics at scale. |
| Gemma tokenizer | Processor-style tokenizer wants `text=` keyword args | Trainer-side helpers normalize encode/decode paths. |
| Windows long runs | `torch.AcceleratorError: CUDA error: unknown error` near VRAM limit with long context | Reduce **`--max-seq-length`** (3072 or 2048); rely on **`--save-steps`** checkpoints and **`--resume-from-checkpoint`**. |
| Training format | Duplicate `<bos>` or wrong chat template | Strip leading `<bos>` from rendered training text; use **`gemma-4`** (non-thinking) template for small E2B JSON work, per [Unsloth Gemma 4 fine-tuning](https://unsloth.ai/docs/models/gemma-4/train). |
| Response-only masking | Regex / marker escaping drops **all** training rows | Audit response-only filters so valid assistant spans are not zeroed out. |
| Dataset layout | `prepare` defaulted to Windows `Downloads\…` paths | **Clinician seeds** live under [`datasets/clinician-seeds/`](./datasets/clinician-seeds/) with repo-relative paths in `DEFAULT_SOURCE_FILES`. |
| Unsloth Studio | HF `datasets` error in preview on raw expanded JSONl | Use **`lora-wave-session-studio-sharegpt.jsonl`**. |
| Import order | Odd Unsloth warnings if `peft` is imported before Unsloth in helper scripts | Initialize **Unsloth first** in any eval-only helper that mirrors the trainer. |

---

## Unsloth Gemma 4 docs (official)

- [Gemma 4 fine-tuning](https://unsloth.ai/docs/models/gemma-4/train) — BOS handling, multimodal vs text-only flags, known Gemma 4 training quirks (loss scale, cache / shared KV notes, gradient accumulation).

---

## Quick checklist

- [ ] `cd models && uv sync` (or conda env from `environment.yml`)
- [ ] CUDA `torch` matches GPU driver
- [ ] `huggingface-cli login` and Gemma license accepted
- [ ] `--data` points at an existing JSONL (expanded or prepared normalized)
- [ ] `uv run python train_wave_session_lora.py … --dry-run` passes
- [ ] For Studio: use `lora-wave-session-studio-sharegpt.jsonl`, not raw expanded preview
- [ ] Clinician seeds present under `datasets/clinician-seeds/` (defaults for `prepare_wave_session_dataset.py`)
- [ ] For remote: no `.venv` in the bundle; caches on writable disk; SSH key access sorted
