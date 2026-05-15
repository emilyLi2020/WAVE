# `models/mlc/` — MLC web-llm compile runbook

> **This is a runbook, not a scripts directory.** All MLC conversion + compilation goes through the `mlc_llm` Python package's CLI entry points (`python -m mlc_llm convert_weight | gen_config | compile`). There are no project-owned `.py` files for MLC because the pipeline is invocation-only — see [`docs/postmortems/mlc-finetune.md`](../../docs/postmortems/mlc-finetune.md) for why.
>
> Mac-only helper scripts (build-from-source TVM/relax bootstrap, batch compile wrappers, etc.) can land in [`mac/`](mac/) without disturbing the runbook commands here.

## Status

| Path | Status |
|---|---|
| Bundle compile + first-prompt generation | ✅ works for fine-tune, Unsloth base, Google base — ~45 tok/s on Apple M-series WebGPU |
| Multi-prompt / multi-task sessions | ❌ KV-cache state leaks between `chat.completions.create()` calls; documented workaround = full engine reload per task (3-5s × ~7 task switches per WAVE session) |
| Production shipping decision | **Do not ship.** Browser routes at [`/models/mlc-test/*`](../../client/app/models/mlc-test/README.md) kept for re-investigation if upstream `web-llm` fixes `resetKVCache()` |

Why no `.py` files here: the pipeline is `python -m mlc_llm convert_weight | gen_config | compile`. These entry points are exposed by the `mlc_llm` package itself (a dependency, not project code). Adding project-owned wrappers would just shadow upstream behavior without adding logic. If a wrapper genuinely helps (e.g., batching all three Gemma 4 variants in one invocation, or applying the conv_template JSON patch automatically), put it under [`mac/`](mac/) — the entire pipeline only runs on Mac.

## Prerequisites

The `mlc_llm` Python package must be **source-built** against [MLC PR #3485](https://github.com/mlc-ai/mlc-llm/pull/3485) + [relax PR #346](https://github.com/mlc-ai/relax/pull/346). Neither has landed in a release as of this writing — Gemma 4 support in `mlc_llm` lives only in those open PRs.

Full build instructions: [`docs/postmortems/mlc-build.md`](../../docs/postmortems/mlc-build.md). The end state of that doc is `python -m mlc_llm` working on a Mac with the patched source in `/private/tmp/mlc-workspace/mlc-llm-base/`.

A working PEFT-merged base must already exist at `models/runs/merge-peft/`. **Don't use `Maelstrome/lora-wave-session-r32-merged` directly** — Unsloth's `save_pretrained_merged` produced all-pad output for our LoRA. Use [`../finetune/merge_lora_peft.py`](../finetune/merge_lora_peft.py) to re-merge, then verify with [`../finetune/diagnose_merged_base.py`](../finetune/diagnose_merged_base.py) before continuing.

## Runbook

### 1. Convert weights to MLC's q4f16_1 format

Peak RAM ~4.6 GB (streaming), output ~2.5 GB per model.

```bash
uv run --project models python -m mlc_llm convert_weight \
  models/runs/merge-peft \
  --quantization q4f16_1 --device metal:0 \
  --output models/runs/mlc-export-v2
```

Repeat with `--output models/runs/mlc-base-export` against the Unsloth base, and `--output models/runs/mlc-google-it-export` against `google/gemma-4-E2B-it`, if you want the 3-way comparison routes.

### 2. Generate chat config, then patch `conv_template`

```bash
uv run --project models python -m mlc_llm gen_config \
  models/runs/merge-peft \
  --quantization q4f16_1 \
  --conv-template gemma3_instruction \
  --output models/runs/mlc-export-v2
```

`gen_config` doesn't auto-pick a template for `model_type=gemma4`. It WILL accept `gemma3_instruction`, but **that template uses Gemma 3's special tokens** (`<start_of_turn>` 105, `<end_of_turn>` 106) which **are NOT special tokens in Gemma 4's tokenizer**. Result: the prompt gets byte-tokenized into ~14 garbage tokens and the model emits gibberish (PR-default scaling) or silent EOS (with the phantom scaling "fix" that's documented in the postmortem as DON'T do).

After `gen_config` runs, **edit `mlc-export-v2/mlc-chat-config.json`** and replace its `conv_template` field with:

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

No recompile needed — `mlc-chat-config.json` is read at runtime by `web-llm`. The Gemma 4 token IDs (105 = `<|turn>`, 106 = `<turn|>`, 107 = `\n`) are different from Gemma 3 / Gemma 2; do not reuse those configs.

### 3. Compile the WebGPU bundle

~13 min on Apple Silicon.

```bash
MLC_LLM_SOURCE_DIR=/private/tmp/mlc-workspace/mlc-llm-base \
  uv run --project models python -m mlc_llm compile \
  models/runs/mlc-export-v2/mlc-chat-config.json \
  --device webgpu \
  --output models/runs/mlc-export-v2/wave-r32-q4f16_1-webgpu.wasm
```

`MLC_LLM_SOURCE_DIR` (not `MLC_LLM_HOME`) is the env var checked by [`auto_target.py:241`](https://github.com/mlc-ai/mlc-llm/blob/main/python/mlc_llm/support/auto_target.py). Without it, compile fails with `Cannot find library: mlc_wasm_runtime.bc`.

For local Python CLI testing without a browser, swap `--device webgpu --output ...-webgpu.wasm` for `--device metal:0 --output ...-metal.dylib`, then:

```bash
uv run --project models python -m mlc_llm chat models/runs/mlc-export-v2 \
  --model-lib models/runs/mlc-export-v2/wave-r32-q4f16_1-metal.dylib
```

### 4. Stage into `client/public/`

```bash
rsync -a --exclude='resolve' models/runs/mlc-export-v2/ client/public/mlc-export/
```

The `--exclude='resolve'` matters. If a `resolve/main → ..` symlink leaks through, Turbopack hits an infinite filesystem loop walking `public/`. Also, **don't try to symlink** `client/public/mlc-export -> ../../models/runs/mlc-export-v2` to avoid the copy — Turbopack panics with `FileSystemPath("").join("../models/runs/mlc-export-v2") leaves the filesystem root`. Hard-copy each model.

### 5. Wire web-llm's URL pattern

`@mlc-ai/web-llm` constructs HF-style URLs: `${model_url}/resolve/main/${file}`. So a model URL of `/mlc-export/` causes requests to `/mlc-export/resolve/main/params_shard_0.bin`. Resolve via [`client/next.config.ts`](../../client/next.config.ts) rewrite:

```js
{ source: '/mlc-export/resolve/main/:path*', destination: '/mlc-export/:path*' }
```

Repeat for `/mlc-base-export/` and `/mlc-google-it-export/` if you compiled those too. Already wired in the existing `next.config.ts` per commit `3bffc20`.

### 6. Browser test

Visit [`/models/mlc-test`](../../client/app/models/mlc-test/README.md) (fine-tune), [`/models/mlc-test/base`](../../client/app/models/mlc-test/base/page.tsx) (Unsloth base), [`/models/mlc-test/google`](../../client/app/models/mlc-test/google/page.tsx) (Google base), or [`/models/mlc-test/compare-all`](../../client/app/models/mlc-test/compare-all/page.tsx) (3-way side-by-side).

If the page hangs or serves a stale build: `web-llm` caches both the WASM and every weight shard in OPFS keyed by `model_id`. Cache-bust via:
- Open in a fresh Incognito/Private window (separate OPFS storage)
- Or: DevTools → Application → Storage → "Clear site data" → hard reload

## Pitfalls to not re-litigate

1. **`Maelstrome/lora-wave-session-r32-merged` is corrupt.** Unsloth's `save_pretrained_merged(save_method="merged_16bit")` produced all-pad output for our LoRA. Re-merge via [`../merge_lora_peft.py`](../merge_lora_peft.py).
2. **PR #3485's `self.scaling = 1.0` is correct.** Patching it to `1.0 / sqrt(head_dim)` produces silent EOS as the first token because MLC's `op_ext.attention` already applies the sqrt internally. Don't undo it.
3. **`gemma3_instruction` template is wrong for Gemma 4.** Use the `gemma4_turn` JSON in step 2.
4. **`MLC_LLM_SOURCE_DIR`, not `MLC_LLM_HOME`.** The env var was renamed.
5. **Don't symlink into `client/public/`.** Turbopack breaks. Hard-copy with rsync.
6. **`chat.completions.create()` leaks KV-cache state** across calls even with `engine.resetChat()`. Production workaround: `engine.unload()` + `CreateMLCEngine()` per task (3-5 s with OPFS warm). See postmortem §6 for the full diagnosis.

## What lives where

| Path | Purpose |
|---|---|
| [`README.md`](README.md) (this file) | Runbook + status |
| [`mac/`](mac/) | Mac-only helper scripts (none committed yet; this is where build automation lives if you write any) |
| [`../merge_lora_peft.py`](../merge_lora_peft.py) | PEFT-based LoRA merge. Required first step. Run on any platform. |
| [`../diagnose_merged_base.py`](../diagnose_merged_base.py) | 2-prompt PyTorch smoke test on the merged checkpoint. Don't continue if 0/2 prompts pass. |
| [`../../client/app/models/mlc-test/`](../../client/app/models/mlc-test/README.md) | Browser test routes (fine-tune, base, google, compare, compare-all) |
| [`../../docs/postmortems/mlc-finetune.md`](../../docs/postmortems/mlc-finetune.md) | Full fine-tune-in-browser write-up + KV-cache leak diagnosis |
| [`../../docs/postmortems/mlc-build.md`](../../docs/postmortems/mlc-build.md) | TVM/relax source-build + PR #3485 + relax #346 patch chain |
