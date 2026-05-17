# Plan — can we re-export Gemma 4 E2B at a larger compiled cache?

> Investigation plan for raising the stock LiteRT context ceiling beyond
> 2048. Companion to `docs/postmortems/gemma4-litert-stock-limits-research.md`,
> the runbook `docs/runbooks/stock-litert-working-config.md`, and
> [`Wave#14`](https://github.com/emilyLi2020/Wave/issues/14).

## Goal

Determine whether a Gemma 4 **E2B** `.litertlm` re-exported with a larger
compiled `cache_length` (target **4096**) (a) loads on our
`react-native-litert-lm-wave` fork and (b) lets WAVE chunks 2–5 and
>256-token outputs run on the iPhone 17 Pro — or definitively rule it out
so we commit to the hybrid (llama.rn/GGUF for phase generation).

## What the research already settled (don't re-litigate)

- **2048 is compiled into the bundle, not a runtime knob.** Official: "the
  value for maxTokens must match the context size built into the model."
  Our test matrix: engine > compiled → `failed to invoke the compiled model`.
- **Not a Gemma 4 limit.** Arch supports 32K; 2048 is the published
  `litert-community` bundle's export choice. No larger Gemma 4 LiteRT-LM
  bundle is published anywhere.
- **Re-export is the only lever.** Flag chain (WAVE fine-tune used it):
  `python -m litert_torch.generative.export_hf <model> <out> --bundle_litert_lm=True --externalize_embedder=True --quantization_recipe=dynamic_wi4_afp32 --use_jinja_template=True --cache_length=4096 --prefill_lengths=[512,1024]`.
- **Hard iOS ceiling ≈ 4096.** [LiteRT #6765](https://github.com/google-ai-edge/LiteRT/issues/6765)
  (E4B, opened 2026-04-07, unresolved): 4096 stable, 8192 returns nil,
  16384 SIGSEGV in `reshape::Eval` during prefill on iOS arm64. **Target
  4096, never 8192+.** Note the reporter only got ~700-token prompts
  working at 4096 — a yellow flag to validate for E2B.
- **Converter risk is the dominant unknown.** `litert-torch` Gemma 4
  metadata builder is a TODO ([#1005/#1001] → exports as `generic_model`);
  [#994] Gemma exports load but emit only `<pad>`; [#998] unresolved.
  These are architecture-level → they bite a **stock** E2B re-export too,
  not just fine-tunes.
- **Consumer risk.** Our fork is pristine `0.3.6` → loads the v0.10.2-era
  container. A fresh `litert-torch` export likely targets a newer schema
  (= the litert-lm-v3 / `Wave#13` skew). Loading is the make-or-break gate.
- **Memory.** KV cache grows with cache_length ([litert-torch #729]:
  KV-cached LLMs are memory-heavy). E2B 2048→4096 ≈ +a few hundred MB;
  iPhone 17 Pro 8 GB + `increased-memory-limit` entitlement (already set)
  should absorb it — but measure.

## Phase 0 — Cheapest gate first: does the compact prompt remove the need?

Before any re-export, measure on device with `WAVE_SYSTEM_PROMPT_STOCK_COMPACT`
(~450–510 tok vs canonical ~900–1000). chunk-1 input drops ~1846 → ~1400,
leaving ~650 tok under 2048.

- **Action:** wire the stock path to the compact prompt; on iPhone 17 Pro
  run chunk-1..4 (with realistic history) + a reflection at the upper end.
- **Gate 0:** if chunks 1–4 fit and generate within 256 output, **stop —
  re-export is unnecessary for the demo/most surfaces.** Only chunk-5
  (max history) and intentionally-long outputs would still need more.
- Cost: ~30 min, no toolchain. Highest ROI; do this first.

## Phase 1 — Re-export experiment (only if Phase 0 insufficient)

Cheap (~$0.20 vast.ai or local GPU/CPU, ~15 min export).

1. Provision a box; `pip install litert-torch` (try **latest** and the
   `0.10.0 @44d606e` commit WAVE's earlier work used — record versions).
2. Export **stock** `google/gemma-4-E2B-it` (NOT a LoRA — sidesteps merge
   bugs) with `--cache_length=4096 --prefill_lengths=[512,1024]
   --externalize_embedder
   --jinja_chat_template_override=litert-community/gemma-4-E2B-it-litert-lm`.
3. Inspect the bundle WITHOUT a phone: magic bytes + section schema vs the
   working stock 2048 bundle; dump `LlmMetadata` — **is `model_type ==
   gemma4` or `generic_model`?** (the #1005 TODO tell).
- **Gate A:** `generic_model` or schema diverges hard from the working
  stock bundle → loading on the fork is very unlikely. Options: (i) patch
  `metadata_builder.py` to force the gemma4 path locally and re-export;
  (ii) abandon → Phase 3 fallback. Record either way.

## Phase 2 — Load + correctness on the fork (iPhone 17 Pro)

1. Upload the 4096 bundle to HF; add a temp manifest entry / test screen
   pointing at it; reuse the verified local build+sign flow (runbook).
2. **Gate B (load):** engine creates? `failed to create engine` →
   converter↔consumer skew confirmed → Phase 3 fallback.
3. **Gate C (correctness):** generates coherent text, not `<pad>` (cf
   #994)? Run chunk-2 (with history) and a deliberately >256-token output.

## Phase 3 — Limits + memory sweep (if it loads & generates)

- Sweep `engineMaxTokens` ∈ {1024, 2048, 3072, 4096} × prompt sizes
  {700, 1400, 1846, 2400, 3000}. Confirm/deny the #6765 "only ~700 tok
  usable at 4096" flag for **E2B**.
- Record RAM (wrapper memory tracking), decode tok/s, TTFT per point.
- **Gate D:** chunks 2–5 + reflection all fit and generate within the
  memory budget on device → adopt 4096 bundle for the stock path
  (update the runbook + pin the bundle). Else → hybrid.

## Decision matrix

| Outcome | Action |
|---|---|
| Phase 0 suffices | Ship compact-prompt stock path; no re-export. **Most likely acceptable for demo + reflection/check-in/chunk-1..4.** |
| Re-export loads + 4096 usable for E2B | Adopt 4096 stock bundle; covers full session on LiteRT. Best case. |
| Export `generic_model` / won't load / `<pad>` / E2B capped ~700 like #6765 | **Hybrid:** stock LiteRT (compact, prize demo + short surfaces) + **llama.rn + GGUF** for full phase generation (load-time context, no compile cap — the postmortem's standing recommendation). |

## Effort / honest expectation

~half a day. Evidence (the #994/#998/#1005 cluster + the v0.10.2 consumer
skew + #6765's iOS ceiling) points to **Phase 0 carrying most of the
value** and the re-export likely stalling at Gate A/B — the same wall as
the parked `Wave#12/#13`. Run Phase 0 now; treat Phase 1–3 as a
time-boxed (~½ day) definitive go/no-go, not open-ended.

## Sources

- [Gemma 4 — Google AI Edge / LiteRT-LM](https://ai.google.dev/edge/litert-lm/models/gemma-4)
- [litert-community/gemma-4-E2B-it-litert-lm](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm)
- [LiteRT #6765 — max_num_tokens >4096 SIGSEGV on iOS arm64](https://github.com/google-ai-edge/LiteRT/issues/6765)
- [litert-torch #994 — Gemma export emits only pad tokens](https://github.com/google-ai-edge/litert-torch/issues/994)
- [litert-torch #998 — convert Gemma-4 safetensors to LiteRT-LM](https://github.com/google-ai-edge/litert-torch/issues/998)
- [litert-torch #995 — Add Gemma-4 support](https://github.com/google-ai-edge/litert-torch/issues/995)
- [litert-torch #729 — KV-cached LLMs consume too much memory](https://github.com/google-ai-edge/litert-torch/issues/729)
