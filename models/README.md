# models/

Model training, eval, and export tooling for WAVE. **Nothing in this folder ships to users** — the production session path runs the Gemma 4 E2B-it fine-tune via wllama + WebGPU/WASM in the browser. For the per-model contract see [`../docs/models.md`](../docs/models.md); for the training/eval pipeline see [`../docs/model-training.md`](../docs/model-training.md).

## Directory layout

| Subdir | Purpose | Doc |
|---|---|---|
| [`finetune/`](finetune/) | Fine-tune the LoRA on Gemma 4 E2B-it: dataset prep, training, eval, merging, synthetic data. **Start here.** | [`finetune/README.md`](finetune/README.md) |
| [`gguf/`](gguf/) | Production export path — turns the PEFT-merged base into a Q4_K_M GGUF for wllama / Ollama / llama-cli. | [`gguf/README.md`](gguf/README.md) |
| [`onnx/`](onnx/) | ONNX export pipeline. Parked — fp16 WebGPU divergence is unfixable in onnxruntime-web. Kept for the postmortem. | [`onnx/README.md`](onnx/README.md) |
| [`mediapipe/`](mediapipe/) | LiteRT `.task` bundle for mobile (post-hackathon path). | — |
| `datasets/` | Clinician seeds (`datasets/human/`), expanded training JSONL, EDA reports. | [`datasets/HF_README.md`](datasets/HF_README.md) |
| `runs/` | Training and conversion outputs (gitignored). |

Everything in this folder shares one Python env (`pyproject.toml` / `uv.lock` / `environment.yml`). The setup instructions below apply to **all** subdirs.

## Setup

This folder supports **two interchangeable workflows** — pick whichever you already have installed:

- **uv** (recommended, fastest) — uses `pyproject.toml` + `.python-version`, auto-downloads Python 3.11, installs into `models/.venv`.
- **conda** — uses `environment.yml`, creates a `wave-models` env in your conda installation.

Both produce the same Python 3.11 environment with the same package versions.

### Single source of truth: `pyproject.toml`

`pyproject.toml` is the source of truth for the dependency list. `environment.yml` is auto-generated from it by `sync_env.py` and carries an `# AUTO-GENERATED` header to make that obvious. **Never edit `environment.yml` by hand** — your changes will be overwritten the next time someone runs the sync script.

When you add or change a dependency:

1. Edit `[project].dependencies` in `pyproject.toml`.
2. Run the sync script (works from either env):
   ```bash
   uv run python sync_env.py     # if you use uv
   python sync_env.py            # if you use conda (any Python 3.11+ works)
   ```
3. Commit `pyproject.toml`, `uv.lock`, and `environment.yml` together.

The script has zero third-party deps, so it runs from a bare conda env or a fresh uv venv.

## Setup (uv)

[uv](https://docs.astral.sh/uv/) reads `pyproject.toml` + `.python-version`, downloads the right CPython if missing, and installs everything into `models/.venv` in one step.

If you don't have `uv` yet:

```powershell
# Windows (PowerShell)
irm https://astral.sh/uv/install.ps1 | iex
```

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Create the env

```bash
cd models
uv sync                       # creates .venv, installs torch + transformers + jupyter
```

`uv sync` will auto-download CPython 3.11 the first time. Subsequent runs are near-instant when nothing changed.

### Run the notebook

You don't need to manually `activate` the venv — `uv run` does it for you:

```bash
uv run jupyter lab            # or: uv run jupyter notebook
```

If you prefer an activated shell:

```powershell
# Windows (PowerShell)
.venv\Scripts\Activate.ps1
jupyter lab
```

```bash
# macOS / Linux
source .venv/bin/activate
jupyter lab
```

### GPU (optional)

`uv sync` installs the CPU build of PyTorch from PyPI, which is fine for the smoke test. If you have an NVIDIA GPU and want CUDA, swap the wheel after the first sync (pick the index URL that matches your CUDA toolkit — `cu124`, `cu121`, etc.):

```bash
uv pip install --index-url https://download.pytorch.org/whl/cu124 --upgrade torch
```

### Updating deps

Edit `pyproject.toml`, then:

```bash
uv sync
```

To start over:

```bash
# remove .venv and reinstall
rm -rf .venv && uv sync       # PowerShell: Remove-Item -Recurse -Force .venv; uv sync
```

## Setup (conda)

For collaborators who already have conda set up. Conda only owns Python itself; everything heavy (PyTorch, transformers, jupyter) is installed via pip inside the env.

### One-time: switch conda to the libmamba solver

If you haven't already, swap conda's default solver to `libmamba`. It's 10–100× faster than the classic solver and is the default in newer conda installs anyway:

```bash
conda install -n base conda-libmamba-solver -y
conda config --set solver libmamba
```

### Create and activate the env

```bash
cd models
conda env create -f environment.yml      # creates the `wave-models` env (~2 min)
conda activate wave-models
jupyter lab
```

If `environment.yml` changed since you last set up:

```bash
conda env update -f environment.yml --prune
```

If you ever need to start over:

```bash
conda env remove -n wave-models
```

> Reminder: `environment.yml` is generated from `pyproject.toml`. If you need to add or change a package, edit `pyproject.toml` and run `python sync_env.py` (see *Single source of truth* above) — don't edit `environment.yml` directly.

### Hugging Face auth

Gemma weights are gated — accept the license at <https://huggingface.co/google/gemma-4-E2B-it> once and either run `huggingface-cli login` in your shell or paste a token in the notebook's auth cell.

## Next steps

Pick the subdir that matches what you want to do:

- **Train a new LoRA** or re-run eval against the existing one → [`finetune/README.md`](finetune/README.md).
- **Rebuild the shipping GGUF** from a merged base → [`gguf/README.md`](gguf/README.md).
- **Read the ONNX postmortem** → [`onnx/README.md`](onnx/README.md) and [`../client/docs/onnx-webgpu-divergence.md`](../client/docs/onnx-webgpu-divergence.md).
