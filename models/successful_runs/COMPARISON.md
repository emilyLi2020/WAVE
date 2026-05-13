# `local_final` vs `remote_final` — head-to-head

Two WAVE-session LoRA fine-tunes of `unsloth/gemma-4-E2B-it`, trained against the **same** source dataset (`models/datasets/lora-wave-session-expanded.jsonl`) with the **same** stratification seed (`7`). Test-split `example_id`s are byte-identical (428 examples, same 144/147/137 surface counts; the only file-level diff is CRLF vs LF in the JSONLs).

The two runs differ in hardware and a few hyperparameters. This file is the head-to-head; for the full per-run details see:

- [`local_final/REPORT.md`](./local_final/REPORT.md) — RTX 5080, r=16, 3 epochs
- [`remote_final/REPORT.md`](./remote_final/REPORT.md) — A100 80 GB, r=32, 1 epoch (§10 of that doc is the source of this file)

---

## Recipes

| | `local_final` | `remote_final` |
|---|---|---|
| Hardware | RTX 5080 (Windows, local) | A100 80 GB SXM4 (Linux, Thunder Compute) |
| LoRA rank | 16 | **32** |
| LoRA alpha | 32 | 32 |
| Epochs | **3** (1,152 steps) | 1 (428 steps) |
| Warmup | 64 steps | 21 steps |
| LR / schedule / batch / accum / wd / grad-norm | same: 2e-4 cosine, 1×8, 0.001, 0.3 | same |

---

## Quantitative — full 428-row held-out test split

| | `local_final` | `remote_final` |
|---|---|---|
| LoRA completion NLL | 4.7149 | **4.5576** |
| LoRA perplexity | 111.59 | **95.35** |
| Paired wins vs base | 386 / 428 (90.2%) | **428 / 428 (100%)** |
| Mean NLL Δ vs base | 0.327 nats | **0.508 nats** |
| Sign-test p-value | 9.5 × 10⁻⁷¹ | **2.9 × 10⁻¹²⁹** |

**`remote_final` is stronger on every probability metric.** Higher rank captured the WAVE distribution more decisively in fewer steps; the effect size is 55% larger and the win rate is perfect (no test prompt was worse than base) vs ~10% losses for the local run.

---

## Generation eval — apples-to-apples on the 6 overlapping `example_id`s

`local_final` only ran an 8-example smoke; `remote_final` ran 60. Overlap = 6.

| ID | Surface | Local | Remote | Notes |
|---|---|---|---|---|
| `15f8662e` | check_in | ✓ json+schema+safety, F1=1.000 | ✓ json+schema+safety, F1=1.000 | **Identical** reply to reference — only whitespace differs |
| `2bf8ec4f` | check_in | ✓ F1=1.000 | ✓ F1=1.000 | Both identical to reference |
| `2510fd56` | phase | ✓ F1=0.483 | ✓ F1=**0.512** | Remote slightly closer to reference |
| `30b744c4` | phase | ✓ json+schema+safety, **183 tok** | ✗ json fail, 160 tok (**truncated by cap**) | Local won by having a bigger token budget at gen time, not a model difference |
| `afedb9b7` | reflection | ✓ F1=**0.429** | ✓ F1=0.355 | Local slightly closer to reference |
| `ec718a0e` | reflection | ✓ F1=0.423 | ✓ F1=0.416, ROUGE-L=**0.315** | Tie on F1; remote slightly better ROUGE-L |

Pass rates on overlap: local **6/6**, remote **5/6** (the one miss is a 160-token cap artifact — when we raised the cap to 384 for the phase rerun, remote cleared most of the phase failures too).

---

## Verdict

- **Both models are clinically equivalent** on identical prompts. Word choice differs but pose, safety, structure, and JSON shape are the same.
- **`remote_final` is the better adapter for the WAVE distribution** — stronger NLL evidence, perfect paired-win rate, smaller p-value, and a more recent (post-`local_final`) eval/repair pipeline.
- Recommend shipping `remote_final/adapter/` (or its merged/GGUF derivatives) with `--phase-max-new-tokens ≥ 256` plus the JSON-repair post-process described in `remote_final/REPORT.md §9.2` to close the residual phase-close defect.

---

## Artifact layout (mirrors are byte-exact within each run)

| | `local_final/` | `remote_final/` |
|---|---|---|
| `adapter/adapter_model.safetensors` | 202,775,888 B (r=16) | 202,775,888 B (r=32, different content) |
| `merged-16bit/model.safetensors` | 10,246,621,886 B | 10,246,621,886 B |
| `gguf/gemma-4-e2b-it.Q4_K_M.gguf` | 3,427,878,240 B | 3,427,878,240 B |
| `gguf/gemma-4-e2b-it.BF16-mmproj.gguf` | 986,833,280 B | 986,833,280 B |
| `train.jsonl` / `validation.jsonl` / `test.jsonl` | same example_ids | same example_ids |
| `REPORT.md` | full run report | full run report |

(File **sizes** are identical for the merged/GGUF/mmproj because both are the same base + tokenizer at the same quantization; the **content** differs because the embedded adapter is different.)
