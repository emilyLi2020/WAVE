# `models/gguf/` — Gemma 4 fine-tune GGUF export pipeline

> **Status**: produces a coherent ~3.2 GB Q4_K_M GGUF that runs in browser via [wllama](https://github.com/ngxson/wllama) on WebGPU/WASM, and via `llama-cli` / Ollama / LM Studio everywhere else. **This is the production shipping path for the fine-tune** (ONNX is parked — see [`../onnx/README.md`](../onnx/README.md)).

## What this directory is

The end-to-end pipeline that turns a verified-coherent PEFT-merged checkpoint into a Q4_K_M GGUF, split for wllama's 2 GB ArrayBuffer ceiling, and published as a subdirectory of the existing adapter repo at [`Maelstrome/lora-wave-session-r32`](https://huggingface.co/Maelstrome/lora-wave-session-r32/tree/main/gguf).

We avoid `unsloth.FastModel.save_pretrained_gguf` because it goes through the same broken internal merge path that produces all-`<pad>` output (the corruption documented in the ONNX postmortem). Instead we call `llama.cpp`'s own `convert_hf_to_gguf.py` directly against the PEFT-merged safetensors. The chat template, special tokens, and Gemma 4 architecture metadata are baked in automatically.

## Quick reference

| Script | Stage |
|---|---|
| [`export.py`](export.py) | Legacy: wraps unsloth's `save_pretrained_gguf`. **Don't use** — produces a potentially-corrupt GGUF via the same broken merge path. Kept only because the May-11 GGUF on HF was built this way. |
| [`bench_wave_prompts.py`](bench_wave_prompts.py) | Drives `llama-cli` with the three production WAVE prompts to verify the GGUF generates coherent schema-compliant output. Reads prompt JSONs from `logs/wave-prompts/` (dumped by [`../../client/scripts/dump-wave-prompts.ts`](../../client/scripts/dump-wave-prompts.ts)). |

The conversion itself uses llama.cpp's official scripts and binaries — there's nothing project-specific in those tools, so they're not vendored here. They live under whatever `llama.cpp` install you have (the unsloth Python env puts them at `~/.unsloth/llama.cpp/`).

## Pipeline (what produces the published artifact)

```
HF/local: Maelstrome/lora-wave-session-r32-merged          ← broken via unsloth save_pretrained_merged
                  ↓                                          (re-merge with ../finetune/merge_lora_peft.py)
Local:    models/runs/merge-peft/                          ← coherent bf16 PEFT-merged base
                  ↓                                          (smoke-tested by ../finetune/diagnose_merged_base.py)
llama.cpp convert_hf_to_gguf.py
                  ↓
models/runs/merge-peft-gguf/gemma-4-e2b-it-peft.f16.gguf   (~8.7 GB)
                  ↓
llama.cpp llama-quantize Q4_K_M
                  ↓
models/runs/merge-peft-gguf/gemma-4-e2b-it-peft.Q4_K_M.gguf (~3.2 GB)
                  ↓
llama.cpp llama-gguf-split --split-max-size 512M
                  ↓
models/runs/merge-peft-gguf/split/
  gemma-4-e2b-it-peft.Q4_K_M-00001-of-00005.gguf            ← load this one; wllama auto-pulls the rest
  gemma-4-e2b-it-peft.Q4_K_M-00002-of-00005.gguf            (~1.93 GB — largest shard, fits 2 GB ArrayBuffer)
  gemma-4-e2b-it-peft.Q4_K_M-00003-of-00005.gguf
  gemma-4-e2b-it-peft.Q4_K_M-00004-of-00005.gguf
  gemma-4-e2b-it-peft.Q4_K_M-00005-of-00005.gguf
                  ↓
hf upload Maelstrome/lora-wave-session-r32 models/runs/merge-peft-gguf/split gguf
                  ↓
Maelstrome/lora-wave-session-r32/gguf/  (5 files, ~3.2 GB)
```

## Reproducing a fresh GGUF build

```powershell
# 1. PEFT-merge the LoRA (only required if runs/merge-peft/ doesn't already exist)
uv run --project models python ../finetune/merge_lora_peft.py `
  --base unsloth/gemma-4-E2B-it `
  --adapter Maelstrome/lora-wave-session-r32 `
  --out-dir runs/merge-peft `
  --device cuda --dtype bfloat16

# 2. Smoke-test the merge (don't continue if it fails)
uv run --project models python ../finetune/diagnose_merged_base.py `
  --source-repo runs/merge-peft `
  --prompts "What is the capital of France? Answer in one sentence." `
            "I'm feeling anxious right now. What's one small thing I can do?" `
  --max-new-tokens 48 --device cuda --dtype bfloat16

# 3. Convert merged safetensors -> f16 GGUF (via llama.cpp, NOT unsloth)
uv run --project models python "$env:USERPROFILE\.unsloth\llama.cpp\convert_hf_to_gguf.py" `
  runs/merge-peft `
  --outfile runs/merge-peft-gguf/gemma-4-e2b-it-peft.f16.gguf `
  --outtype f16

# 4. Quantize f16 -> Q4_K_M
& "$env:USERPROFILE\.unsloth\llama.cpp\build\bin\Release\llama-quantize.exe" `
  runs/merge-peft-gguf/gemma-4-e2b-it-peft.f16.gguf `
  runs/merge-peft-gguf/gemma-4-e2b-it-peft.Q4_K_M.gguf Q4_K_M

# 5. Split into ~512 MB shards for wllama's ArrayBuffer ceiling
& "$env:USERPROFILE\.unsloth\llama.cpp\build\bin\Release\llama-gguf-split.exe" `
  --split-max-size 512M `
  runs/merge-peft-gguf/gemma-4-e2b-it-peft.Q4_K_M.gguf `
  runs/merge-peft-gguf/split/gemma-4-e2b-it-peft.Q4_K_M

# 6. Upload to HF as a subdirectory of the adapter repo
hf upload Maelstrome/lora-wave-session-r32 runs/merge-peft-gguf/split gguf
```

(All `runs/` paths are relative to `models/` since you're invoking `uv` from there.)

## Verifying a build

CPU correctness via `llama-cli` against the production WAVE prompts:

```powershell
# Dump the rendered WAVE prompts to logs/wave-prompts/{phase,checkin,reflection}.json
cd ../../client
pnpm exec tsx scripts/dump-wave-prompts.ts ../logs/wave-prompts

# Then bench the GGUF against them
cd ../models
uv run --project models python gguf/bench_wave_prompts.py `
  runs/merge-peft-gguf/gemma-4-e2b-it-peft.Q4_K_M.gguf
```

> Note: `llama-cli`'s interactive mode is sticky — `-no-cnv` doesn't always disengage it. If the bench hangs at "Capital of France?", check `Get-Process llama-cli` and kill anything stale.

Browser correctness via wllama (the real shipping path):

```powershell
cd ../../client
pnpm dev
# Then open http://localhost:3000/models/wllama-test
# Click Load -> Smoke -> Phase / Check-in / Reflection.
# Default loads from HF. Append ?local=1 to fetch from a local-hf mirror at
# http://localhost:8765/gguf/ (requires `pnpm exec tsx scripts/serve-local-hf.ts`).
```

## Why GGUF over ONNX

The ONNX export path produces a coherent artifact under `onnxruntime-node` (CPU) but emits zero tokens under `onnxruntime-web` + WebGPU for long-context WAVE prompts. The bug is in the WebGPU EP's fp16 numerics for Gemma's decomposed-primitive graph; we documented seven iteration steps (v3 → v7) in [`../onnx/README.md`](../onnx/README.md) that didn't fix it.

The GGUF path goes through `llama.cpp`'s own WebGPU/WASM kernels (via wllama), which don't share that bug — Gemma 4 has been first-class in llama.cpp since launch. The same Q4_K_M build also drops cleanly into Ollama, LM Studio, and llama-cli.

## Related code outside this directory

| Path | Purpose |
|---|---|
| [`../finetune/merge_lora_peft.py`](../finetune/merge_lora_peft.py) | PEFT-based LoRA merge that produces a coherent base. Required first step. |
| [`../finetune/diagnose_merged_base.py`](../finetune/diagnose_merged_base.py) | 2-prompt PyTorch smoke test. Catches broken merges before downstream conversion. |
| [`../../client/scripts/dump-wave-prompts.ts`](../../client/scripts/dump-wave-prompts.ts) | Renders the three production WAVE prompts and writes them as JSON for `bench_wave_prompts.py` to read. |
| [`../../client/lib/wllama/`](../../client/lib/wllama/) | Client-side wllama wrapper used by the browser test page and (eventually) the production runtime. |
| [`../../client/app/models/wllama-test/`](../../client/app/models/wllama-test/) | Browser-side test surface for the GGUF. Loads from HF by default; `?local=1` routes to the local-hf mirror. |
| [`../../docs/wllama.md`](../../docs/wllama.md) | End-to-end design doc: why we ship via wllama, how the pieces fit together, how to extend to production. |
