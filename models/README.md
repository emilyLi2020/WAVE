# models/

Ad-hoc model experiments and smoke tests for WAVE. **Nothing in this folder ships to users** — the production session path runs Gemma 4 E2B-it via `transformers.js` + WebGPU in the browser (web demo) or LiteRT on-device (mobile, post-hackathon). For the per-model contract see [`../docs/models.md`](../docs/models.md); for the training/eval pipeline see [`../docs/model-training.md`](../docs/model-training.md).

## Setup (conda + pip)

This folder uses a dedicated conda env so the experiment deps stay isolated from `client/`. Conda only owns Python itself; everything heavy (PyTorch, transformers, jupyter) is installed via pip inside the env. This avoids conda's slow classic SAT solver when mixing the `pytorch` and `conda-forge` channels.

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
jupyter lab                              # or: jupyter notebook
```

If you change `environment.yml` later:

```bash
conda env update -f environment.yml --prune
```

If you ever need to start over:

```bash
conda env remove -n wave-models
```

### Hugging Face auth

Gemma weights are gated — accept the license at <https://huggingface.co/google/gemma-4-E2B-it> once and either run `huggingface-cli login` in your shell or paste a token in the notebook's auth cell.

## Notebooks

- `01_gemma4_smoke_test.ipynb` — downloads the smallest Gemma 4 (`google/gemma-4-E2B-it`) and runs one generic and one WAVE-style prompt to confirm the base model works on this machine before any LoRA work begins.
