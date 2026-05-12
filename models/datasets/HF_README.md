---
license: cc-by-4.0
language:
- en
size_categories:
- 1K<n<10K
task_categories:
- text-generation
tags:
- clinical
- wellness
- structured-output
- json
- gemma-4
- synthetic
- reflection
- check-in
pretty_name: WAVE Session — unified check-in / phase narration / reflection
---

# lora-wave-session-dataset

Training data for [`Maelstrome/lora-wave-session`](https://huggingface.co/Maelstrome/lora-wave-session) — a Gemma 4 E2B fine-tune for the WAVE wellness/companion app. Three structured-output surfaces unified into one dataset.

## Surfaces

| Surface | Examples | What it does |
|---|---|---|
| `check_in` | 1,534 | Multi-turn patient check-in with structured turn sequencing |
| `phase_narration` | 1,553 | Six-line patient-facing phase narration |
| `reflection` | 1,190 | Reflection plan with a concrete next step |
| **Total** | **4,277** | |

All three surfaces emit strict JSON, no markdown, no analysis voice, in patient-facing tone.

## Structure

Each row is a JSON object with:

```json
{
  "id": "<uuid>",
  "splitKey": "<group key for stratification>",
  "surface": "check_in | phase_narration | reflection",
  "sourceLoraId": "lora-check-in-1 | lora-check-in-2 | ... | lora-phase-narration | lora-reflection",
  "sourceStatus": "draft | ready | synthetic_draft",
  "input": { ... },
  "output": { ... }
}
```

The `input`/`output` schemas are surface-specific; the LoRA learns to map `input` → JSON-stringified `output` per the `gemma-4` chat template.

## Splits

The training run uses an 80/10/10 stratified split (seed `7`, stratified by `splitKey`):

| Split | Count | check_in | phase_narration | reflection |
|---|---|---|---|---|
| Train | 3,421 | 1,225 | 1,251 | 945 |
| Validation | 428 | 165 | 155 | 108 |
| Test | 428 | 144 | 147 | 137 |

This is computed at training time, not pre-baked in the file. To reproduce, use the same seed and stratification key.

## Source LoRAs

Earlier WAVE iterations had per-surface LoRAs (`lora-check-in-1` through `lora-check-in-5`, `lora-phase-narration`, `lora-reflection`). This dataset unifies their training data so a single adapter can serve all surfaces.

| Source LoRA | Count |
|---|---|
| `lora-phase-narration` | 1,553 |
| `lora-reflection` | 1,190 |
| `lora-check-in-1` | 288 |
| `lora-check-in-2` | 336 |
| `lora-check-in-3` | 335 |
| `lora-check-in-4` | 335 |
| `lora-check-in-5` | 240 |

## Status mix

| Status | Count | Note |
|---|---|---|
| `synthetic_draft` | 2,645 | Synthetic, model-generated draft data |
| `draft` | 1,574 | Human-drafted but not clinician-validated |
| `ready` | 58 | Clinician-validated |

## Token-length stats (Gemma 4 tokenizer)

| Stat | Tokens |
|---|---|
| p50 | 518 |
| p90 | 1,752 |
| p95 | 1,833 |
| p99 | 2,104 |
| max | 2,227 |

`max_seq_length=3072` is comfortable; `2048` would truncate the longest ~5%.

## Provenance and intended use

Synthetic and draft training data assembled for the WAVE app, a wellness/reflection tool. **No real PHI.** Not a clinical dataset, not validated for medical decision-support, not a substitute for professional advice.

## Limitations

- Mostly synthetic and draft-status data. Only ~1% is clinician-reviewed.
- English only.
- The structured JSON schemas are WAVE-specific; consumers should expect to either accept those schemas or transform them.
- Wellness scope only — see model card for downstream use limitations.

## License

CC-BY-4.0. The fine-tuned model derived from this data is governed by the [Gemma Terms of Use](https://ai.google.dev/gemma/terms).
