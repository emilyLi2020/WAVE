---
license: gemma
base_model: unsloth/gemma-4-E2B-it
library_name: peft
tags:
- gemma
- gemma-4
- lora
- peft
- unsloth
- clinical
- wellness
- structured-output
- json
- sft
- trl
language:
- en
datasets:
- Maelstrome/lora-wave-session-dataset
pipeline_tag: text-generation
---

# lora-wave-session-r32

A unified LoRA adapter on top of **Gemma 4 E2B Instruct** that handles three structured-output surfaces for the WAVE wellness/companion app:

- **`check_in`** — multi-turn patient check-in with structured turn sequencing
- **`phase_narration`** — six-line patient-facing phase narration
- **`reflection`** — reflection plan with a concrete next step

All three surfaces emit strict JSON, no markdown, no analysis voice, in patient-facing tone.

## Sibling runs

This is the **rank-32 / 1-epoch A100** training of the same WAVE corpus. The rank-16 / 3-epoch RTX 5080 sibling lives at [`Maelstrome/lora-wave-session`](https://huggingface.co/Maelstrome/lora-wave-session).

On the same frozen 428-row test split, this rank-32 run is measurably stronger on every probability metric:

| | rank-16 (sibling) | **rank-32 (this run)** |
|---|---|---|
| LoRA completion NLL | 4.7149 | **4.5576** |
| LoRA perplexity | 111.59 | **95.35** |
| Paired wins vs base | 386 / 428 (90.2%) | **428 / 428 (100%)** |
| Mean NLL Δ vs base | 0.327 nats | **0.508 nats** |
| Sign-test p-value | 9.5 × 10⁻⁷¹ | **2.9 × 10⁻¹²⁹** |

See [`Maelstrome/lora-wave-session-r32-report`](https://huggingface.co/Maelstrome/lora-wave-session-r32-report) for the full head-to-head report (recipes, generation eval, reproducibility check).

## Provenance and intended use

Trained for the WAVE app, a wellness/reflection tool — not a medical device, not clinical decision support, not a substitute for professional advice. Use under the [Gemma Terms of Use](https://ai.google.dev/gemma/terms).

## Quickstart (PEFT + Unsloth)

```python
from unsloth import FastModel

model, tokenizer = FastModel.from_pretrained(
    model_name="Maelstrome/lora-wave-session-r32",  # PEFT auto-loads base
    max_seq_length=4096,
    load_in_4bit=True,
)
```

Or with vanilla PEFT:

```python
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

base = AutoModelForCausalLM.from_pretrained("unsloth/gemma-4-E2B-it")
tok = AutoTokenizer.from_pretrained("unsloth/gemma-4-E2B-it")
model = PeftModel.from_pretrained(base, "Maelstrome/lora-wave-session-r32")
```

For a one-file 4-bit GGUF deployable with llama.cpp / Ollama / wllama, see [`Maelstrome/lora-wave-session-r32-gguf`](https://huggingface.co/Maelstrome/lora-wave-session-r32-gguf). For a merged bf16 `safetensors` ready for `transformers` / vLLM directly, see [`Maelstrome/lora-wave-session-r32-merged`](https://huggingface.co/Maelstrome/lora-wave-session-r32-merged).

## Example prompts

The model expects a system prompt establishing it as **WAVE**, plus a per-surface user prompt with `<surface>`, `<patient_context>`, and `<task>` blocks. Output is strict JSON.

### `phase_narration` (six-line meditation)

```
<surface>phase_narration</surface>
<chunk>Number 5 of 5 - Close. Purpose: invite comparison to the start, normalize any outcome, and prepare for a final check-in.</chunk>
<patient_context>{"chunkNumber":5,"matType":"none","medicationStatus":"none","startingIntensityBand":"1-6","trigger":"unknown","usedSubstanceToday":false}</patient_context>
<task>Generate exactly 6 patient-facing narration lines. Return only strict JSON. Schema: {"lines":["...", ...]}</task>
```

Expected output (use `--phase-max-new-tokens >= 384`):

```json
{"lines":["You've made it to the end of this practice.","Check in with your urge now — has anything shifted?","...","...","...","..."]}
```

### `reflection` (post-session card)

```
<surface>reflection</surface>
<patient_context>{"durationSeconds":780,"endingIntensity":2,"intakeIntensity":7,"matType":"buprenorphine","medicationStatus":"on_time","sessionsCount":12,"trigger":"stress","usedSubstanceToday":false}</patient_context>
<task>Write the post-session reflection card. Return only strict JSON. Schema: {"insight":"...","journalPromptQuestion":"...","nextSteps":{"a":"...","b":"...","c":"...","d":"..."}}</task>
```

### `check_in` (multi-turn)

```
<surface>check_in</surface>
<specialized_surface>lora-check-in-1</specialized_surface>
<patient_context>{"intakeIntensity":7,"matType":"buprenorphine","trigger":"stress"}</patient_context>
<task>Open turn 1: ask the patient to rate their current urge intensity 1-10. Schema: {"reply":"...","endConversation":null}</task>
```

## Training

| | |
|---|---|
| Base | `unsloth/gemma-4-E2B-it` |
| Method | QLoRA (4-bit) via Unsloth `FastModel` |
| Adapter rank / alpha / dropout | **32 / 32 / 0** |
| Target modules | All language + attention + MLP layers (vision/audio frozen) |
| Trainable parameters | 25.3 M |
| Optimizer | `adamw_8bit` |
| LR | 2e-4, cosine schedule |
| Warmup | 21 steps (3% of 428 total) |
| Weight decay | 0.001 |
| Max grad norm | 0.3 |
| Batch / grad-accum | 1 / 8 (effective 8) |
| Max sequence length | 4096 (preflight max = 2,227, no truncation) |
| Epochs | 1 (428 steps) |
| Chat template | `gemma-4` (non-thinking, leading `<bos>` stripped) |
| Response masking | `train_on_responses_only` (Gemma 4 markers) |
| Hardware | NVIDIA A100 80 GB SXM4 (Thunder Compute) |
| Backend | Unsloth 2026.5.2 + Torch 2.11.0 + CUDA 13.0 |
| Wall clock | ~2h 26m train + ~1h 15m eval |

Final training loss: **0.241**.

## Evaluation

### Held-out completion eval (n=428, full test split)

| Metric | Base Gemma 4 E2B | This adapter | Delta |
|---|---|---|---|
| Completion NLL | 4.9312 | **4.5576** | **−0.374** |
| Completion perplexity | 138.55 | **95.35** | **−43.20** |
| Paired wins (LoRA assigned higher prob to reference) | — | **428 / 428** | **100% win rate** |
| Mean per-example NLL Δ | — | **0.508** nats | 95% bootstrap CI [0.477, 0.537] |
| Sign-test p-value | — | **2.89 × 10⁻¹²⁹** | overwhelming |

Surface coverage on test split: `check_in 144`, `phase_narration 147`, `reflection 137`.

### Generation gate eval (n=60 balanced, LoRA-only, 4bit)

| Gate | All 60 | check_in (20) | phase_narration (20) | reflection (20) |
|---|---|---|---|---|
| Style pass | **100%** | 100% | 100% | 100% |
| Medical-directive pass | **100%** | — | — | — |
| No-markdown / no-analysis-voice | **100%** | — | — | — |
| JSON validity (160-tok cap) | 75% | 100% | 25% | 100% |
| JSON validity (**384-tok cap on phase**) | **~95%** | 100% | 85% | 100% |
| Schema pass (384-tok cap on phase) | **~90%** | 90% | 80% | 100% |

> **Generation-time tip:** `phase_narration` needs **`max_new_tokens ≥ 384`** — the original 160-token cap truncated the JSON close on most phase prompts. `check_in` is fine at 96, `reflection` at 192.

### Residual phase-close defect (transparent)

After raising the phase budget to 384 tokens, 4/20 phase examples still emit `"}` (missing `]`) instead of `"]}`. A reproducibility re-run on those 4 IDs produced **byte-identical** outputs (8/8 matched the originals exactly), confirming this is a deterministic learned defect on a small subset of phase prompts — not sampling noise.

**Recommended fix** at inference time: a deterministic JSON-repair pass that detects an unclosed `lines` array and inserts the missing `]`. The fix is described in the [r32 report](https://huggingface.co/Maelstrome/lora-wave-session-r32-report).

## Dataset

[`Maelstrome/lora-wave-session-dataset`](https://huggingface.co/datasets/Maelstrome/lora-wave-session-dataset) — 4,277 examples across three surfaces, stratified 80/10/10 by `splitKey` (seed `7`).

Status mix: 62% `synthetic_draft`, 37% `draft`, 1% `ready`. No real PHI.

## Limitations

- **Wellness scope only.** Do not use for medical diagnosis, crisis triage, or clinical decision support.
- Trained mostly on synthetic and draft-status data, not clinician-validated production data.
- Outputs are constrained-format JSON. The model is not optimized for open-ended chat.
- Training data is English; multilingual behavior was not measured.
- Phase narration needs `max_new_tokens ≥ 384`. A small subset (~5% of phase prompts) also exhibits a deterministic JSON-close defect that should be fixed with an inference-time post-process — see the [report](https://huggingface.co/Maelstrome/lora-wave-session-r32-report) for the patch.

## License

Gemma Terms of Use. See [https://ai.google.dev/gemma/terms](https://ai.google.dev/gemma/terms).

### Framework versions

- PEFT 0.19.1
- Unsloth 2026.5.2
- Transformers 5.5.0
- Torch 2.11.0+cu130
