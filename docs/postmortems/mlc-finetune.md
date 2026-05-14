# MLC fine-tune in-browser: what it took, what tripped us up

> Sibling to [`mlc-build.md`](./mlc-build.md) (source-build of TVM/relax/mlc-llm with [PR #3485](https://github.com/mlc-ai/mlc-llm/pull/3485) + [relax PR #346](https://github.com/mlc-ai/relax/pull/346)). That doc gets you to a working `python -m mlc_llm` CLI. **This doc** is what we then did to actually get a fine-tuned Gemma 4 E2B emitting coherent tokens in the browser via `@mlc-ai/web-llm` — and which dead ends we hit on the way.
>
> Resulting state on 2026-05-13: fine-tune at `models/runs/mlc-export-v2` produces coherent on-topic responses for fresh single-turn prompts (Paris ✓, count-1-to-5 ✓). **One open blocker remains**: `chat.completions.create()` leaks KV-cache state between sequential calls, contaminating multi-turn use. Documented in §6 and being investigated as the immediate follow-up.

## 1. What broke at the start

Three things had to be diagnosed before anything else worked. None of them were "the PR is broken":

### 1.1 The merged fine-tune on HF was corrupt

`Maelstrome/lora-wave-session-r32-merged` (built with `unsloth.save_pretrained_merged(save_method="merged_16bit")` on a Linux training box) generates 100% `<pad>` tokens in plain PyTorch — independent of MLC, ONNX, or anything else. See memory note [`wave-merge-broken-unsloth`](../../.claude/projects/-Users-bill-zhang-Github-Wave/memory/wave-merge-broken-unsloth.md). We discovered this by running a tiny PyTorch generation script ([models/diagnose_merged_base.py](../../models/diagnose_merged_base.py)) before sinking more time into conversion.

**Fix**: re-merge the LoRA adapter via PEFT (Mac-compatible, no unsloth dep):

```bash
uv run --project models python models/merge_lora_peft.py \
  --base unsloth/gemma-4-E2B-it \
  --adapter Maelstrome/lora-wave-session-r32 \
  --out-dir models/runs/merge-peft \
  --device cpu --dtype bfloat16
```

Then verify before continuing — if 0/2 prompts pass, conversion can't save you:

```bash
uv run --project models python models/diagnose_merged_base.py \
  --source-repo models/runs/merge-peft \
  --prompts "What is the capital of France? Answer in one sentence." \
            "I'm feeling anxious right now. What's one small thing I can do?" \
  --max-new-tokens 48 --device cpu --dtype bfloat16
```

### 1.2 Chasing a phantom attention-scaling bug

Looking at [`python/mlc_llm/model/gemma4/gemma4_model.py:430`](file:///private/tmp/mlc-workspace/mlc-llm-base/python/mlc_llm/model/gemma4/gemma4_model.py):

```python
self.scaling = 1.0
```

It "looks wrong" to anyone used to softmax pre-scaling. I patched it to `1.0 / math.sqrt(self.local_head_dim)`, recompiled, and **made things significantly worse** — every model (fine-tune, unsloth, Google) went from coherent-or-gibberish to silent 0-token output. The model predicts EOS as the first token.

Likely explanation: MLC's `op_ext.attention` already applies `1/sqrt(head_dim)` internally. `sm_scale=...` is an *additional* multiplier. Setting it to `1.0` (PR default) is correct — no further scaling. Double-applying the scale collapsed logits to nearly uniform.

**Don't re-litigate.** PR #3485 is correct on this point.

### 1.3 The real PR #3485 gap: no Gemma-4 conv_template

PR #3485 adds a `gemma4` model architecture but doesn't ship a matching conversation template. `mlc-llm/python/mlc_llm/conversation_template/gemma.py` still has only `gemma_instruction` (Gemma 1/2) and `gemma3_instruction` (Gemma 3). Neither matches Gemma 4's prompt format.

When you run `mlc_llm gen_config --model-type gemma4`, gen_config doesn't auto-pick a template — you have to pass `--conv-template <something>`. Picking `gemma3_instruction` (which is what we initially did) sends literal text `<start_of_turn>user\n...` to the model.

But **Gemma 4 doesn't have those tokens**. Verified directly against `google/gemma-4-E2B-it`'s official tokenizer:

| Token ID | Gemma 3 (per gemma3_instruction) | Gemma 4 (actual) |
|---|---|---|
| 105 | `<start_of_turn>` | `<\|turn>` |
| 106 | `<end_of_turn>` | `<turn\|>` |
| 107 | (different) | `\n` |

So `<start_of_turn>` isn't a special token to Gemma 4's tokenizer — it gets byte-tokenized into ~14 random tokens, the model sees a malformed prompt, and outputs garbage (with PR-default scaling) or silent EOS (with my misapplied scaling fix).

**Fix**: patch each model's generated `mlc-chat-config.json` to use Gemma 4's actual tokens. This needs no recompile — `mlc-chat-config.json` is read at runtime by web-llm.

```json
"conv_template": {
  "name": "gemma4_turn",
  "system_template": "{system_message}",
  "system_message": "",
  "system_prefix_token_ids": [2],
  "add_role_after_system_message": true,
  "roles": {
    "user": "<|turn>user",
    "assistant": "<|turn>model"
  },
  "role_templates": {
    "user": "{user_message}",
    "assistant": "{assistant_message}",
    "tool": "{tool_message}"
  },
  "messages": [],
  "seps": ["<turn|>\n"],
  "role_content_sep": "\n",
  "role_empty_sep": "\n",
  "stop_str": ["<turn|>"],
  "stop_token_ids": [1, 106],
  "function_string": "",
  "use_function_calling": false
}
```

With this template applied, **all three models we tested produce coherent prompt-1 output** (Google official, Unsloth port, and our fine-tune). Before this fix, only our fine-tune worked because we'd happened to patch its config first while leaving the others on gemma3_instruction.

The right upstream PR fix is to register a `gemma4_instruction` template in `conversation_template/gemma.py` and either auto-select it for `model_type=gemma4` or document `--conv-template gemma4_instruction` as the expected invocation.

## 2. Working recipe (post-mortem captured commands)

Once §1 is sorted, the actual pipeline is short:

```bash
# 1. Convert weights — peak RAM ~4.6 GB (streaming), output 2.5 GB
uv run --project models python -m mlc_llm convert_weight \
  models/runs/merge-peft \
  --quantization q4f16_1 --device metal:0 \
  --output models/runs/mlc-export-v2

# 2. Generate chat config (then patch conv_template per §1.3 above)
uv run --project models python -m mlc_llm gen_config \
  models/runs/merge-peft \
  --quantization q4f16_1 \
  --conv-template gemma3_instruction \
  --output models/runs/mlc-export-v2
# ... edit mlc-export-v2/mlc-chat-config.json now ...

# 3. Compile WebGPU bundle (~13 min on Apple Silicon)
MLC_LLM_SOURCE_DIR=/private/tmp/mlc-workspace/mlc-llm-base \
  uv run --project models python -m mlc_llm compile \
  models/runs/mlc-export-v2/mlc-chat-config.json \
  --device webgpu \
  --output models/runs/mlc-export-v2/wave-r32-q4f16_1-webgpu.wasm
```

`MLC_LLM_SOURCE_DIR` (not `MLC_LLM_HOME`) is the env var checked by [`auto_target.py:241`](file:///private/tmp/mlc-workspace/mlc-llm-base/python/mlc_llm/support/auto_target.py); without it, compile fails with `Cannot find library: mlc_wasm_runtime.bc`.

For Python CLI testing without a browser, compile a Metal dylib instead by swapping `--device webgpu --output ...-webgpu.wasm` for `--device metal:0 --output ...-metal.dylib`. Then `python -m mlc_llm chat <model-dir> --model-lib <dylib>`.

## 3. Wiring up the Next.js client

### 3.1 `@mlc-ai/web-llm`'s HF-style URL pattern

web-llm constructs fetch URLs as `${model}/resolve/main/${file}` to mimic HuggingFace. So a model URL of `/mlc-export/` causes requests to `/mlc-export/resolve/main/params_shard_0.bin`. Two options to satisfy this:

| Option | Verdict |
|---|---|
| Symlink: `mkdir mlc-export/resolve && ln -sf .. mlc-export/resolve/main` | ❌ Breaks Turbopack (infinite filesystem loop when dev server walks `public/`) |
| Next.js rewrite in [next.config.ts](../../client/next.config.ts): `/mlc-export/resolve/main/:path*` → `/mlc-export/:path*` | ✅ Clean, works in dev + production |

### 3.2 Turbopack chokes on symlinks that escape `client/`

First attempt was symlinking `client/public/mlc-export -> ../../models/runs/mlc-export-v2` (to avoid duplicating 2.5 GB of weights). Turbopack panics with:

```
FileSystemPath("").join("../models/runs/mlc-export-v2") leaves the filesystem root
```

The CSS pipeline walks `public/` and refuses to follow symlinks above the Next.js project root.

**Fix**: hard-copy the artifacts into `client/public/`. Per-model size is ~2.5 GB. Three models = 7.5 GB of dev disk. Worth it.

```bash
rsync -a --exclude='resolve' models/runs/mlc-export-v2/ client/public/mlc-export/
```

The `--exclude='resolve'` matters — if you copy a `resolve/main → ..` symlink from the model dir, Turbopack will hit the infinite-loop case differently (`is a symlink causes that causes an infinite loop!`).

### 3.3 web-llm caches everything in OPFS

The browser caches WASM + every weight shard keyed by `model_id`. Changing the chat config or recompiling the WASM but not bumping `model_id` means the browser keeps serving the old version. To force a fresh fetch:

- **Easiest**: open in a fresh Incognito/Private window (separate OPFS).
  - Caveat: some browsers restrict the Cache API in Incognito (`Failed to execute 'add' on 'Cache': Unexpected internal error`). Use the regular profile with cleared storage if that hits.
- **Otherwise**: DevTools → Application → Storage → "Clear site data" → hard reload.

## 4. The 3-way compare page

[`client/app/training/mlc-test/compare-all/`](../../client/app/training/mlc-test/compare-all) runs the same 4 prompts against three Gemma 4 variants through the same MLC pipeline:

- **Our fine-tune** (PEFT-merged LoRA on `unsloth/gemma-4-E2B-it`) — `client/public/mlc-export/`
- **Unsloth port** (`unsloth/gemma-4-E2B-it` unchanged) — `client/public/mlc-base-export/`
- **Google official** (`google/gemma-4-E2B-it`) — `client/public/mlc-google-it-export/`

All three use IDENTICAL engine settings (temperature=0, max_tokens=60), identical WASM build (PR #3485 + relax #346, no source patches), identical conv_template (the `gemma4_turn` one in §1.3).

Loads one engine at a time, terminating the prior to free WebGPU memory. Designed to attribute observed behavior cleanly: bug in the model? bug in the weights? bug in the conv_template?

## 5. What we verified

- Plain PyTorch on the re-merged fine-tune: coherent fine-tune-voice output ([models/diagnose_merged_base.py](../../models/diagnose_merged_base.py) result preserved in commit message of 339a007).
- MLC on Mac with patched conv_template: "Count from 1 to 5" → `1, 2, 3, 4, 5` for both our fine-tune and unsloth base. Google works too once its config is patched.
- All three models load in ~30 s into the browser via web-llm, decode at ~45 tok/s on Apple M-series WebGPU.

## 6. web-llm batch state leakage — diagnosed, workaround required

> **Status**: Cause confirmed 2026-05-13 by running each prompt through a freshly-reloaded engine. With clean state per call, all three models produce coherent output for all four test prompts. The bug is in `web-llm`'s `resetChat()` path, not in PR #3485, the weights, or the conv_template.

`engine.chat.completions.create({messages: [{role: "user", content: prompt}]})` is supposed to be stateless per the OpenAI-compat spec — pass new messages each time, get a fresh completion. **Empirically it isn't.** Sequential calls in our compare loop:

| Prompt order | Our fine-tune | Unsloth |
|---|---|---|
| #1 "Count from 1 to 5" | `1, 2, 3, 4, 5` ✓ | `1, 2, 3, 4, 5` ✓ |
| #2 "I'm feeling anxious..." | `(0 tokens)` ✗ | `(0 tokens)` ✗ |
| #3 "Capital of France?" | "Please provide the sentence or question you would like me to answer." ✗ | "Please provide a clear question or statement..." ✗ |
| #4 "Write a haiku..." | degenerate `wave deep wave deep` loop ✗ | `**ocean** **ocean** **ocean**` repetition ✗ |

The first prompt of any session is clean; subsequent prompts are contaminated. Reordering prompts confirms this — whichever prompt runs first is fine, later ones degenerate.

`engine.resetChat()` exists on `MLCEngineInterface` and per [`web-llm/lib/engine.js`](../../client/node_modules/@mlc-ai/web-llm/lib/engine.js) calls `pipeline.resetKVCache()` internally. We tried inserting it between every prompt — **no behavioral change**. Either:

1. `resetChat()` clears chat history but the next `chat.completions.create({messages: [...]})` call still treats the saved conversation as a prefix-match for KV-cache reuse (per the prefill docstring at [`engine.d.ts`](../../client/node_modules/@mlc-ai/web-llm/lib/engine.d.ts): _"If the new Conversation object matches the current one loaded, it means we are performing multi-round chatting, so we do not reset, hence reusing KV cache"_).
2. Or there's a flat bug in the prefill path where prior turn state leaks even when conversations are nominally fresh.

This is **non-negotiable** to fix — WAVE makes multiple model calls per user session (check-in → chunk → reflection → insights). Any inter-call bleed is catastrophic.

### Confirmed workaround: full engine reload between calls

Re-tested after wiring `engine.unload()` + `CreateMLCEngine(...)` before each prompt. With OPFS warm, reload takes ~3-5s per call. All four prompts now produce coherent output (Google base shown):

| Prompt | Output |
|---|---|
| Count from 1 to 5. | `1, 2, 3, 4, 5` |
| I'm feeling anxious. What's one small thing I can do? | "It sounds like you're looking for a small, immediate thing to do when you're feeling anxious? Here are a few things you can try: * **deep breathing: Take a few deep breaths…" |
| What is the capital of France? Answer in one sentence. | "The capital of France is Paris." |
| Write a haiku about ocean waves. | "Blue waters crash on sand, Foam whispers soft retreat, Waves sigh to shore…" |

The remaining quality issues (repetition near max_tokens cutoff) are typical of q4f16_1 quantization on small models at temperature=0, not state contamination.

### Production trade-off for WAVE

WAVE's [client/lib/gemma/local-runtime.ts](../../client/lib/gemma/local-runtime.ts) makes several distinct task calls per user session: check-in chat, chunk generation, reflection, insights. These aren't multi-turn within one conversation — they're separate prompts that must be cleanly isolated.

Two viable production patterns given the bug:

1. **Engine reload per task** — add `unload()` + `CreateMLCEngine()` before each task. Cost: 3-5s warm-cache reload per call. Acceptable for non-realtime tasks (chunk, reflection, insights). Marginal for the interactive check-in chat (user-perceptible delay).
2. **One engine per session, full-history passing within session** — keep the engine alive; within a session, pass the full conversation array to `chat.completions.create()` each time. Cache stays "warm" for that conversation. Between sessions, reload. Works because web-llm correctly handles multi-round chatting when conversation history matches (per [`engine.js:12982`](../../client/node_modules/@mlc-ai/web-llm/lib/index.js): _"Multiround chatting, reuse KVCache"_). Caveat: WAVE's tasks ARE separate conversations, so this only buys us "no overhead within a single check-in turn-by-turn chat".

For shipping, we'll likely combine both: option 2 for the in-session check-in chat (cheap multi-turn), option 1 across tasks (correctness over speed).

### Upstream fix worth filing

Minimal repro: in any web-llm session, call `chat.completions.create({messages: [{role: "user", content: "Count to 5"}]})`, await completion, then call again with `{messages: [{role: "user", content: "What is 2+2?"}]}`. The second call's output looks like a continuation of the first conversation despite the engine internally calling `resetChat()` per the conversation-mismatch branch at [`engine.js:12971`](../../client/node_modules/@mlc-ai/web-llm/lib/index.js).

The reset path looks correct (`pipeline.resetChat()` → `resetKVCache()` + `filledKVCacheLength = 0` + `conversation.reset()`). The bug must be in how `resetKVCache()` interacts with the paged KV cache or sliding-window setup. Out of scope for our shipping; worth a separate web-llm issue.

## 7. Why we're not done

Status of the MLC shipping path:

- [x] Weights re-merged correctly via PEFT
- [x] Convert + gen_config + compile pipeline works on Mac
- [x] Conv_template patched to match Gemma 4's actual tokens
- [x] All three models produce coherent prompt-1 output in browser
- [x] Compare page wired up for ongoing testing
- [x] **State leakage diagnosed — workaround: full engine reload per task call**
- [ ] Production wiring in [client/lib/gemma/local-runtime.ts](../../client/lib/gemma/local-runtime.ts) (swap transformers.js for `@mlc-ai/web-llm`, implement reload-per-task pattern)
- [ ] HF push of `mlc-export-v2/` (2.5 GB) so production doesn't need a local Mac build

Now ~1-2 hours of plumbing remains. ONNX-on-Windows ([onnx-windows-handoff.md](../onnx-windows-handoff.md)) is no longer required — kept as a documented fallback only.
