# Four runtimes, four dead ends: shipping a fine-tuned Gemma 4 to the browser

> A field report from five weeks of trying to run a fine-tuned Gemma 4 E2B (2.5B effective, 5.1B total) on-device in a web browser. We tried four runtimes. Each broke in a different way, for different reasons, at different points in the pipeline. This is what happened, and what we ended up shipping instead.
>
> If you read one doc about this project, read this one.

---

## Why we cared

WAVE is a guided-breathwork app for people in acute anxiety. The model writes the body-scan narration, holds the check-in dialogue, and emits a structured JSON reflection at the end. All of it runs on the user's device. The hackathon's medical-use-case rule forbids server inference, so cloud isn't a fallback. It's not an option at all.

The question was simple. Can a 2.5B-effective fine-tuned Gemma 4 actually run in a browser tab in 2026?

Almost. Four different ways.

---

## Scoreboard

| Runtime | Conversion | Browser load | Coherent output | Multi-turn safe | iOS Safari | Verdict |
|---|---|---|---|---|---|---|
| ONNX + transformers.js | ✅ hand-rolled, 10 iterations | ✅ | ⚠️ Node CPU only; `len=0` on WebGPU | n/a | ❌ | **dead** — fp16 overflow in `onnxruntime-web` |
| MLC + web-llm | ✅ PR #3485 source build | ✅ | ⚠️ first prompt only | ❌ KV-cache state leaks | ❌ | **dead** — 3–5 s engine reload per call to work around |
| MediaPipe + tasks-genai | ✅ litert-torch `LITERTLM` | ❌ `No model format matched` | n/a | n/a | ❌ | **dead** — no browser SDK reads the converter's output |
| wllama + GGUF | ✅ llama.cpp `convert_hf_to_gguf` | ✅ Chromium/Firefox | ✅ **60 tok/s on Blackwell** | ✅ | ❌ Memory64 unsupported | **ships** on desktop; dies on iOS at the WebKit layer |

We shipped wllama on desktop. We pivoted to React Native for iOS. Everything else is parked.

The four failures broke at four different layers of the stack, for reasons that share almost nothing in common. The cross-cutting lessons are at the bottom of this doc; the individual war stories come first.

---

## Runtime #1: ONNX, the size story, then the overflow story

Hugging Face's docs point you at ONNX first. `optimum-cli export onnx`, drop the artifact into `transformers.js`, ship to the browser. We tried that on day one.

Hard stop. Optimum 2.1.0's `TasksManager` has no `gemma4` entry. It pins transformers to 4.57.6; Gemma 4 needs 5.5+. The optimum-onnx bridge PR titled "transformers 5.2 support" has been open since February 2026 with no movement. The documented path didn't move because the documented path is broken.

So we hand-rolled `torch.onnx.export` against `Gemma4TextForCausalLM`. Ten iterations of head-banging later, we had a working script. The errors along the way read like a tour of every place transformers' internals had quietly shifted between 5.4 and 5.5:

> `'Gemma4Config' object has no attribute 'num_hidden_layers'`. `treespec.unflatten(leaves): leaves has length 73 but spec holds 4 items`. `IndexError: tuple index out of range` deep in `masking_utils._preprocess_mask_arguments`. `DynamicCache.from_legacy_cache` removed in transformers 5.5. `Expected 256 in dimension 3 but got 512 for tensor number 1`.

That last one is worth dwelling on. Gemma 4 has two head dimensions. 256 for the 28 sliding-attention layers, 512 for the 7 full-attention layers that show up every fifth position. Most export tooling assumes a uniform `head_dim` and crashes on the first full-attention concat. We had to read `text_config.layer_types`, build per-layer head-dim metadata, and construct example past tensors with the right dim per layer. Nobody documents this; we found it by reading the model config after the export crashed.

After all that, we had a 7 GB bundle. Which is when the actual problem started.

### The PLE problem

Gemma 4 has a tensor that Gemma 1, 2, and 3 don't: Per-Layer Embeddings. Each of the 35 layers gets its own `vocab_size × hidden_size_per_layer` lookup table. The math:

```
35 layers × 262,144 vocab × 256 hidden = 2.35 B parameters
```

That's nearly half the file. Our quantizer (`MatMulNBitsQuantizer`) only touches `MatMul` ops. PLE tables are `Gather` ops, so they stayed at fp16. That's the entire 4 GB gap between our 7 GB output and the upstream `onnx-community/gemma-4-E2B-it-ONNX` reference at 3.1 GB.

The upstream repo exists, so somebody has a recipe for 4-bit `Gather`. It lives outside any public PR. We checked Optimum, optimum-onnx, transformers.js, and onnxruntime-genai. Microsoft has an open issue ([onnxruntime-genai #2062](https://github.com/microsoft/onnxruntime-genai/issues/2062)) that names our exact blockers: PLE, variable head dims, KV-cache sharing. No maintainer reply.

First lesson, surfacing this early: the size of an LLM on disk is governed by whatever weight tensor your quantizer doesn't recognize. For Gemma 4, that tensor is PLE. For your next model it'll be something else. Check the effective-vs-total parameter ratio before you trust the quantizer's output size.

We tried `onnxsim`, `onnxoptimizer`, and ORT's `optimize_model` in `bert` mode to close the gap. `onnxsim` and `onnxoptimizer` both crashed on the 2 GB single-protobuf-message ceiling. ORT's `bert`-mode optimizer ran cleanly and *added* 200 MB, because Gemma 4's interleaved sliding/full attention doesn't match BERT fusion patterns and ORT helpfully wrapped a bunch of nodes in Casts that did nothing.

So we had a 7 GB bundle, 2× upstream, and it worked on Node CPU.

### The overflow story

Loaded it in the browser. Every WAVE prompt returned `len=0`. Zero tokens. The model predicts a stop token on the first decode step.

Same bundle on `onnxruntime-node` CPU: coherent JSON, ~20 tok/s, schema-compliant on all three production prompts. Whatever was wrong wasn't wrong everywhere.

That divergence is what we spent the next two weeks chasing.

The bug class is fp16 overflow inside `onnxruntime-web`'s WebGPU EP. Our export emits decomposed primitives: `Mul(x,x) + ReduceMean + Add(eps) + Pow(-0.5)` for RMSNorm, manual `Q@K^T + masked Softmax + V@_` for attention. On Node CPU those compute in fp32 implicitly. On WebGPU they accumulate in fp16 and overflow at long context.

Upstream avoids this by using fused contrib ops: `SimplifiedLayerNormalization` (with a `stash_type=1` flag that forces fp32 internal accumulation), `GroupQueryAttention`, `RotaryEmbedding`, `FastGelu`. Their decoder is 1289 nodes. Ours was 3497. The gap isn't bug-vs-feature, it's "the upstream graph was authored by someone who knew about fp16 stability."

Five rewriter variants chased the gap:

| Variant | Patch | Browser WebGPU |
|---|---|---|
| v3 | Original export | ❌ `len=0` |
| v4 | ORT `optimize_model(model_type="gpt2")` fused 70 `Tanh` chains into `FastGelu` | ❌ `len=0` |
| v5 | Rewrote 242 `Pow(x, 2.0)` to `Mul(x, x)` because WebGPU implements `Pow(y, x)` as `exp(x · ln(y))` and that's NaN for y ≤ 0 | ❌ `len=0` |
| v6 | Pattern-fused 227 of 242 RMSNorms into `SimplifiedLayerNormalization(stash_type=1)` | ❌ `len=0` |
| v7 | Wrapped the remaining 15 variance chains with explicit `Cast(fp32)` pairs | ❌ `len=0` |

Every variant closed one overflow site. CPU output stayed coherent on every one. Browser WebGPU stayed at `len=0` on every one. Whatever overflow we hadn't patched yet was sufficient on its own to kill long-context generation.

After v7, the remaining surface was 35 manual attention paths, 35 manual RoPE applications, and the attention mask's `-inf` saturating to `-65504` in fp16. Closing those means rewriting the export wrapper so PyTorch emits the idioms ORT's pattern matchers recognize as `GroupQueryAttention` and `RotaryEmbedding`. Which is reverse-engineering the optimizer's pattern code. Days of work, no guarantee.

We stopped at v7 the day we asked Unsloth what their blessed ONNX export looks like for Gemma 4. The answer:

> No. We have no ONNX/WebGPU story for Gemma 4. Our PyTorch fix for the same fp16 overflow class is RMSNorm upcast to fp32, exactly what your v6/v7 does. If you need browser shipping, GGUF + llama.cpp WASM.

### What ONNX taught us

- Per-Layer Embeddings change the storage math. MatMul-only quantizers leave the biggest weight blob untouched. We left ~3.5 GB of PLE on the floor before we knew PLE existed.
- `onnxsim` and `onnxoptimizer` choke at 2 GB because they round-trip through a single protobuf message. They can't handle LLM-scale graphs at all.
- `onnxruntime-web` and `onnxruntime-node` share an op registry, not their kernels. fp16 stability that's free on CPU is a six-rewriter project on WebGPU.
- The Hugging Face ecosystem's main blocker for new architectures isn't the runtime, it's transformers version compatibility. The Optimum "transformers 5.2 support" PR has been open three months. Until it lands, Gemma 4 ONNX won't land in Optimum.

→ Full detail: [`onnx-export.md`](./onnx-export.md), [`onnx-finetune.md`](./onnx-finetune.md)

---

## Runtime #2: MLC, the almost-working story

After ONNX hit the size wall, MLC looked like the path home.

MLC has a Gemma-aware quantization step (`Gemma4SplitScaledEmbedding`) that does pack PLE tables to 4-bit. ONNX gave us 7 GB; MLC gave us 2.5 GB. Fine-tune intact, WebGPU-tuned, KV-cache sharing on (20 of 35 layers share cache pairs). Better than upstream ONNX on every axis we cared about.

The catch was getting there. MLC's Gemma 4 support lives in an experimental PR (#3485) that compiles against a parallel TVM/relax PR (#346). Neither is merged. The PR author's submodule layout assumed `mlc-llm/3rdparty/tvm` pointed at their patched relax, but `git submodule update --init --recursive` refuses to traverse a path that's a symlink:

```
error: expected submodule path '3rdparty/tvm' not to be a symbolic link
```

We worked around it by swapping the symlink for an empty directory, running submodule init for everything *except* `3rdparty/tvm`, then putting the symlink back. The published `mlc-llm-nightly-cpu` wheel ships a split TVM dylib layout that doesn't match the source build's unified `libtvm.dylib`, so we couldn't use the wheel either. The WebGPU compile needs `mlc_wasm_runtime.bc`, which needs `emcc`, which needs an emscripten install layered on top of LLVM, CMake, Ninja, and Apple Clang.

Sixty to ninety minutes of toolchain pain on Apple Silicon and we had a working compile. The artifact: 2.45 GB of weight shards, a 9.4 MB WebGPU WASM kernel library, 3.66 GB runtime memory before the KV cache.

Then we tried to run it.

### Three things had to be diagnosed before anything else worked

Bug 1 was that the HF-hosted LoRA-merged checkpoint was corrupt. `Maelstrome/lora-wave-session-r32-merged`, built with Unsloth's `save_pretrained_merged(save_method="merged_16bit")` on a Linux training box, generates 100% `<pad>` tokens in plain PyTorch. No MLC involved. We caught this by running a tiny generation script directly against the merge before sinking time into conversion. Fix: re-merge the LoRA via PEFT, which is Mac-compatible and doesn't go through Unsloth's broken merge path.

Bug 2 was a phantom we created ourselves. PR #3485 sets attention scaling to `self.scaling = 1.0`. That looks wrong if you're used to softmax pre-scaling. We patched it to `1.0 / math.sqrt(self.local_head_dim)`, recompiled, and made everything worse. Every model dropped from coherent-or-gibberish to silent 0-token output, predicting EOS as the first decode.

The cause: MLC's `op_ext.attention` already applies `1/sqrt(head_dim)` internally. The `sm_scale=...` argument is an additional multiplier. The PR's default of `1.0` is correct. Double-applying the scale collapsed the logits to nearly uniform. The PR is right. Trust it. That bug cost a day.

Bug 3 is the real PR #3485 gap, and the one that mattered: PR #3485 adds the `gemma4` architecture but doesn't ship a matching conversation template. The shipped `gemma_instruction` template uses Gemma 1/2 tokens. `gemma3_instruction` uses Gemma 3 tokens. Neither matches Gemma 4's actual prompt format.

| Token ID | Gemma 3 template assumes | Gemma 4 tokenizer actually has |
|---|---|---|
| 105 | `<start_of_turn>` | `<\|turn>` |
| 106 | `<end_of_turn>` | `<turn\|>` |

So `gen_config` produces a chat template using Gemma 3's tokens. The Gemma 4 tokenizer byte-tokenizes `<start_of_turn>` into ~14 random tokens. The model sees a malformed prompt. Output is garbage. We'd been calling it a model bug.

We hand-patched each model's `mlc-chat-config.json` to use Gemma 4's real tokens (`<|turn>user`, `<turn|>`, `stop_token_ids: [1, 106]`). After that, all three models we tested (our fine-tune, Unsloth's base, Google's official release) produced coherent first-prompt output.

### The blocker we couldn't work around

`engine.chat.completions.create({messages: [...]})` is meant to be stateless per the OpenAI-compat spec. Pass new messages, get a fresh completion. It isn't. Run four prompts sequentially in the same engine and the second one onwards comes back contaminated:

| Order | Our fine-tune | Unsloth base |
|---|---|---|
| #1 "Count to 5" | ✅ `1, 2, 3, 4, 5` | ✅ `1, 2, 3, 4, 5` |
| #2 "I'm feeling anxious..." | ❌ `(0 tokens)` | ❌ `(0 tokens)` |
| #3 "Capital of France?" | ❌ *"Please provide the sentence or question..."* | ❌ *"Please provide a clear question..."* |
| #4 "Haiku about waves" | ❌ `wave deep wave deep` | ❌ `**ocean** **ocean** **ocean**` |

Reorder the prompts and whichever runs first comes out clean. The KV cache is leaking between calls.

`engine.resetChat()` exists. It calls `pipeline.resetKVCache()` internally. We inserted it between every prompt. No behavioral change. The web-llm prefill path explicitly says: *"if the new Conversation object matches the current one loaded, it means we are performing multi-round chatting, so we do not reset, hence reusing KV cache."* So either the conversation-match check is over-eager, or `resetKVCache()` doesn't fully clear the paged cache, or both. Either way, it's an upstream bug we can't fix from the application layer.

### The workaround, and why it doesn't ship

Full engine reload between every call works. `engine.unload() + CreateMLCEngine(...)`. With OPFS warm, that's 3–5 seconds per call. All four prompts come back coherent.

WAVE makes roughly seven distinct model calls per session: check-in across several turns, chunk generation, reflection, insights. Reloading seven times costs 21–35 seconds of dead air spread across an experience whose entire job is to feel calming. The fix is correct in principle and unusable in practice.

### What MLC taught us

- MLC and the Hugging Face ecosystem are different cultures. Optimum hides toolchain complexity; MLC exposes it. Source builds, environment variables, submodule dances, multiple PR branches. None of it documented in one place.
- The relax PR was the real gate, not the mlc-llm PR. PR #3485 is ~1500 lines of Python you can apply as an overlay. The TVM/C++ changes in relax PR #346 are what required the source build.
- Git submodules and symlinks are genuinely incompatible. No `--force` flag, no `git config` setting works. The swap-to-empty-dir dance is the only path.
- A draft PR can be technically correct and shipping-blocked at the same time. PR #3485's WebGPU validation held up. Our blocker is web-llm's KV cache, not the PR.

→ Full detail: [`mlc-build.md`](./mlc-build.md), [`mlc-finetune.md`](./mlc-finetune.md)

---

## Runtime #3: MediaPipe, the no-public-consumer story

By this point the diagnosis pattern was clear. ONNX was an fp16 overflow. MLC was a KV state leak. Both were runtime correctness bugs. MediaPipe's `tasks-genai` is Google's first-party browser SDK for Gemma. Surely Google reads what Google writes.

The Mac-side conversion is well-documented. `litert-torch export_hf` takes the PEFT-merged checkpoint, applies a chat-template override, emits a bundle. On `litert-torch-nightly==0.10.0.dev20260514`:

```bash
litert-torch export_hf \
  --model=models/runs/merge-peft \
  --output_dir=models/runs/litertlm-finetune \
  --externalize_embedder \
  --jinja_chat_template_override=litert-community/gemma-4-E2B-it-litert-lm
```

Output: 4.7 GB of bytes. We uploaded them, wired up a test page, pointed `@mediapipe/tasks-genai` at the URL.

```
Error: No model format matched.
    at genai_bundle.mjs:1:53616
```

### Magic bytes

```
$ xxd -l 64 model.litertlm
00000000: 4c49 5445 5254 4c4d 0100 ...  LITERTLM........
```

Compare to the base model the same SDK loads happily, Google's prebuilt `gemma-4-E2B-it-web.task`:

```
$ xxd -l 64 gemma-4-E2B-it-web.task
00000000: 1c00 0000 5446 4c33 0000 ...  ....TFL3........
```

Two different magic numbers, two different container formats. Then grep the SDK for what it actually parses:

```
$ grep -oE "(LITERTLM|TFL3)" /tmp/genai-stable.mjs | sort -u
TFL3
$ grep -oE "(LITERTLM|TFL3)" /tmp/genai-nightly.mjs | sort -u
TFL3
```

Both the stable `0.10.27` SDK and the nightly `0.10.36-rc.20260514` register one matcher: `TFL3`. The converter's default output is now `LITERTLM`. The converter and the consumer don't speak the same protocol. Neither side documents this.

The dispatch lives in JavaScript, not WASM:

```js
if(0===r.length)throw Error("No model format matched.");
```

So swapping the WASM URL changes nothing. The check fires before any WASM code runs.

### Things we tried before giving up

We renamed `.litertlm` to `.task` via hardlink. Same bytes, different extension. The content-sniff rejects it identically. We pinned both WASM and JS to nightly (released the day of this work). Same error, slightly different bundle offset. We searched the JS for an opt-in flag: `LlmInference.createFromOptions`, `FilesetResolver.forGenAiTasks`, `BaseOptions`. No undocumented format switch exists. We searched `litert-torch export_hf` for a `--web` or `--output_format=task` flag. The LITERTLM container is the converter's default output now, not a side-effect of one flag we set.

### What the public record says

At a certain point this stopped reading like a bug and started reading like a deliberate posture. Across roughly ten community threads, every developer who tried this hit the same wall:

[google-ai-edge/LiteRT-LM #2150](https://github.com/google-ai-edge/LiteRT-LM/issues/2150) is the canonical issue. Different developer, same SDK version, same `TFL3`-only matcher. Google staff response: *"It's definitely something we're looking into."* Still open.

[HF litert-community/TranslateGemma-4B-IT discussion #1](https://huggingface.co/litert-community/TranslateGemma-4B-IT/discussions/1) is where Google staff (tylermullen) put it in writing:

> The pre-converted models we have so far are '-web.task' format, which we don't have any fine-tuning notebooks or colabs for, and probably won't be able to make any time soon. Note that most of the documentation on our website for model conversion will point you to a different converter which will not work for this purpose.

[google-ai-edge/litert-torch #1005](https://github.com/google-ai-edge/litert-torch/issues/1005) reports that the upstream tooling is literally missing the `case 'gemma4':` arm in `litert_lm_builder.py`. The model architecture isn't even routed.

[google-ai-edge/mediapipe #6270](https://github.com/google-ai-edge/mediapipe/issues/6270) goes further: Google's own prebuilt `gemma-4-E2B-it-web.task`, the base file the SDK *does* load, crashes on Apple M4 Macs.

There's no third-party converter. No community-discovered flag. No workaround. The recipe exists at Google, internally, and isn't coming out.

### Why we did not iterate

The ONNX postmortem documents seven export iterations because every one killed an overflow site, and we could measure progress on Node CPU (coherent) versus browser WebGPU (`len=0`). The iteration was diagnostically productive even when the bug wasn't yet fixed.

This case has no iteration surface at all. No overflow to chase, no kernel to rewrite. The bytes we produce aren't a format any browser SDK reads. Six more conversion runs with different flag permutations would still produce a container with no consumer.

### What MediaPipe taught us

The lesson is easy to state and expensive to learn:

> When a runtime path depends on a converter–consumer pair maintained by the same vendor, verify that both halves of the pair are public before doing the conversion work.

A two-second `grep` against `genai_bundle.mjs` for `LITERTLM` would have caught this *before* we ran the conversion. We didn't run it. Now we have a rule.

Operationally: when a vendor's docs say "we publish artifacts but no recipe," that's a hard stop, not a "they'll figure it out." Trust the silence.

→ Full detail: [`mediapipe-finetune.md`](./mediapipe-finetune.md)

---

## Runtime #4: wllama, the works-on-desktop story

After three structural dead-ends, we did what we should have done in week one. We asked the model's authors what they recommend.

Unsloth's answer was one line: GGUF, llama.cpp.

`llama.cpp` has had Gemma 4 first-class since launch day. Q4_K_M handles PLE correctly because PLE has been a native concept in `llama.cpp` since Gemma 4 dropped. [wllama](https://github.com/ngxson/wllama) compiles llama.cpp to WASM + WebGPU and exposes a clean TypeScript API around it. The pipeline:

```
PyTorch merged base (bf16, 10 GB)
        ↓ convert_hf_to_gguf.py
f16 GGUF (~8.7 GB)
        ↓ llama-quantize Q4_K_M
Q4_K_M GGUF (3.2 GB)
        ↓ llama-gguf-split --split-max-size 512M
5 shards (43M + 1.93G + 510M + 509M + 438M)
        ↓ HF upload
Maelstrome/lora-wave-session-r32/gguf/
        ↓ wllama auto-discovery from shard 0
Browser: wllama instance, WebGPU-backed, n_ctx=8192
```

Within a day we had the fine-tune running in Chrome, coherent on all three production prompts, and (this is the part that mattered most) with a KV cache that actually clears between calls.

### Performance numbers, Windows 11 + Chrome + Blackwell

Three runs per scenario, temperature 0, greedy decode. Both ONNX and wllama running on WebGPU. Apples to apples.

| Scenario | Metric | ONNX base (q4f16) | wllama fine-tune (Q4_K_M) | wllama advantage |
|---|---|---|---|---|
| Phase narration | Decode | 6.8 tok/s | **60.1 tok/s** | 🚀 **8.8×** |
| Phase narration | TTFT | 203 ms | **42 ms** | **4.8×** |
| Phase narration | Total (~65 tok) | 9.45 s | **1.16 s** | 🚀 **8.1×** |
| Check-in turn | Decode | 6.6 tok/s | **59.0 tok/s** | 🚀 **8.9×** |
| Check-in turn | TTFT | 295 ms | **152 ms** | **1.9×** |

For a guided-breathwork app, 1.16 seconds to deliver a 65-token phase narration is the difference between an app that feels alive and a user staring at a spinner during a panic attack.

Multi-turn worked out of the box. No KV cache leaks. No engine reload between calls. The chat template uses Gemma 4's actual tokens, because llama.cpp's Gemma 4 implementation was written by people who had the tokenizer open while they coded.

### Then we plugged in an iPhone

```
ggml_webgpu: adapter_info: vendor_id: 0 | vendor: apple | architecture: apple-gpu …
llama_kv_cache_iswa: using full-size SWA cache
…
TypeError: Conversion from BigInt to number is not allowed
```

The model never reaches the chat-completion stage. The error fires inside `wllama.loadModelFromHF()`. Same error in iOS Safari 26, iOS Chrome (which is also WebKit, per App Store rule 2.5.6), and on the WASM-only path with `nGpuLayers: 0`. It's not WebGPU-specific. It's engine-wide.

### Root cause: Memory64

From the wllama README, HEAD as of 2026-05-15:

> Memory64 is now a requirement, which drops support for Safari.

[Memory64](https://github.com/WebAssembly/memory64) is a WebAssembly proposal for 64-bit memory addressing, lifting WASM 1.0's 4 GiB linear-memory ceiling. On the JS side, 64-bit pointers cross the boundary as `BigInt` values. Any arithmetic mixing `BigInt` with `Number` throws the runtime error above.

Chrome, Edge, and Firefox shipped Memory64 enabled-by-default in 2024. WebKit hasn't. No public timeline.

The wllama maintainer has an open call for contributors to write a Safari-compatible build guide ([wllama #210](https://github.com/ngxson/wllama/issues/210)), open since v3.0 with no merged fix. And honestly, even if a 32-bit fallback shipped tomorrow, our Q4_K_M GGUF is 3.2 GB compressed. KV cache at `n_ctx=4096` adds ~400 MiB. Plus runtime overhead. We'd sit right at the 4 GiB WebKit ceiling on this exact model. Fix the BigInt error and we'd OOM during KV growth instead.

### Every iOS browser is the same browser

Apple's App Store Review Guidelines §2.5.6 require third-party iOS browsers to use WebKit as their JS and rendering engine. Chrome iOS, Firefox iOS, Brave iOS, Edge iOS, all WebKit under the hood. Different chrome, same engine, same ceiling.

The EU's Digital Markets Act technically allows alternative engines in the EU since iOS 17.4. As of May 2026, neither Google nor Mozilla has shipped a non-WebKit engine on iOS. So in practice: iOS browser = WebKit, everywhere on earth, today.

"Try a different browser" is not a workaround.

### What wllama taught us

- The default browser LLM runtime in 2026 is wllama. It works, it's fast, the chat template is right, llama.cpp gets first-class support for new architectures on launch day.
- Before committing to a runtime, `caniuse` every WASM proposal in its build flags. Memory64 status on Safari was a two-minute lookup. We didn't do it.
- The iOS browser surface for a 4B-Q4 model in 2026 is fragile across three independent dimensions: Safari hasn't shipped Memory64, the runtimes that need it don't ship 32-bit fallbacks, and even a fallback wouldn't fit under the 4 GiB ceiling on a model this size. Browser-first iOS LLMs at this scale are a 2027+ bet, contingent on all three closing.

→ Full detail: [`client/docs/wllama.md`](../../client/docs/wllama.md), [`ios-safari-browser.md`](./ios-safari-browser.md)

---

## What all four taught us together

The four failures are different enough that the cross-cutting lessons aren't obvious from any single postmortem. They are obvious when you line all four up.

### New architectures move through the ecosystem at the speed of transformers compatibility

We hit this with ONNX (Optimum pinned to `transformers<4.58`; Gemma 4 needs 5.5+; bridge PR three months stale) and again with MediaPipe (`litert_lm_builder.py` literally missing the `case 'gemma4':` arm). The dependency graph is: HF Transformers ships a new architecture → Optimum needs to catch up → onnx-community needs a recipe → onnxruntime-genai needs PLE-aware quantization → transformers.js needs a working ONNX layout. Any link that hasn't caught up turns into a months-long blocker.

llama.cpp is the exception. It shipped Gemma 4 on day zero because the people writing the GGUF converter are the same people running it on their own hardware. The architecture support and the deployment story live in one repo, written by the same hands.

### Vendor-pair byte format is checkable in two seconds, before any conversion

The MediaPipe failure was a `grep "TFL3" genai_bundle.mjs` away from being preventable. We didn't run the grep, and we ate a full pivot. The rule going forward: when a shipping path is "vendor A's converter → vendor A's consumer," verify the magic-byte or op-set match *before* the conversion job, not after. This generalizes to any multi-component pipeline. Start with the consumer, find its actual format requirements, then verify the producer satisfies them.

### The same fp16 overflow shows up in different costumes across runtimes

- ONNX on WebGPU: `len=0` because the first decoded logits are NaN.
- MLC (if you misapply the scale fix): every token is EOS.
- PyTorch with Gemma 3/4: documented overflow in the vision tower ([vllm #40290](https://github.com/vllm-project/vllm/issues/40290)).

Same root cause everywhere: small attention denominators, large activations, RMSNorm's `mean(x²)` over 1536-dim vectors. Anywhere a runtime accumulates in fp16, Gemma's PLE-shaped architecture finds the overflow. The fix is always the same. Force fp32 accumulation in the variance computation and inside softmax. Different runtimes spell that differently:

- llama.cpp: built in.
- ONNX upstream: `SimplifiedLayerNormalization(stash_type=1)` plus `GroupQueryAttention`.
- MLC: `f16_acc=False` in attention ops.
- Unsloth's PyTorch fix: explicit `.float()` casts in modeling code.

If you're picking a runtime, ask first whether it has a Gemma-class numerical-stability story. If the answer is "we'll find out when you run it," your runtime hasn't been validated for this model class.

### "Almost working" is its own failure mode, and the most expensive one

MediaPipe was cheap because it announced itself immediately. No consumer means no path forward, and you pivot the same afternoon. ONNX was medium-expensive because every iteration looked like progress on the CPU benchmark and the browser bench never caught up. MLC was the most expensive of all, because it produces coherent output on the first prompt. You hand a demo to a user, they ask a second question, and only then do the wheels fall off. That isn't 80% of the work for 20% of the value. It's 80% of the work for 0% of the value with a misleading interim signal that keeps you going.

When evaluating a runtime, the real benchmark is "multi-turn correctness with cold and warm KV state." Not "first prompt looks plausible."

### The browser is downstream of three platforms with different velocities

| Layer | Velocity | Examples |
|---|---|---|
| Model architecture (PyTorch) | ⚡ days | Gemma 4 released, training works the same day via Unsloth |
| Runtime kernels | ⏳ months | ONNX contrib ops, MLC PR #3485, wllama llama.cpp updates |
| Browser engine (Chromium, WebKit) | 🐢 **years** | WebGPU, Memory64, fp16 stability in shader compilers |

A new model architecture flows down this stack at the speed of its slowest layer. For iOS, the slowest layer is Apple's WebKit team's roadmap, on Apple's timelines. We aren't unblocking that from the application layer.

That's why we pivoted to React Native instead of waiting for Safari. The model is done. The kernels exist on iOS. The browser engine is the thing we have to route around.

---

## Where we landed

Five weeks of pivots, two shipping surfaces.

### Desktop browser (Windows, macOS, Linux on Chrome/Edge/Firefox)

wllama + Q4_K_M GGUF. 60 tok/s decode on Blackwell, sub-second TTFT, correct multi-turn, correct chat template, ~3.2 GB cold-load amortized into OPFS. Ships from `client/lib/wllama/`. This is the primary submission surface.

### iOS (and Android, eventually)

React Native + `llama.rn`, which is native llama.cpp with a Metal backend. Same Q4_K_M GGUF, zero model-side rework. WhisperKit for STT, AVSpeechSynthesizer for TTS. We also evaluate `react-native-litert-lm` against the LITERTLM bundle that the MediaPipe browser path produced and couldn't deploy. On mobile native, that bundle finally finds a consumer. Two hackathon tracks, one app.

The cloud-fallback option that would be standard for non-medical apps is disallowed by the hackathon's medical use case constraint, so an on-device path has to exist on every shipping surface.

### What stays parked, ready to ship if upstream catches up

- ONNX fine-tune at `Maelstrome/lora-wave-session-r32-onnx`. Coherent on Node CPU. `len=0` on browser WebGPU. Kept as a CPU-only fallback if anyone ever wants the fine-tune in a Node service.
- MLC export at `models/runs/mlc-export-v2/`. Works for the first prompt. Blocked on web-llm's KV state leak. Flips on the moment that bug closes upstream.
- MediaPipe LITERTLM bundle at `Maelstrome/lora-wave-session-r32/mediapipe/`. Flips on the moment `@mediapipe/tasks-genai` registers a `LITERTLM` matcher. In the meantime, used by `react-native-litert-lm` on mobile.

If any of those upstream bugs closes between now and ship, we flip a URL and gain a runtime. The Mac-side conversion work, build scripts, test pages, and bench scaffolding stay in place for the day the upstream catches up.

---

## A note on the postmortem culture

There are five long-form postmortems behind this case study:

- [`onnx-export.md`](./onnx-export.md) — the original Mac ONNX export.
- [`onnx-finetune.md`](./onnx-finetune.md) — Windows handoff plus the v3–v7 iteration sequence.
- [`mlc-build.md`](./mlc-build.md) — source build of MLC PR #3485 against relax PR #346.
- [`mlc-finetune.md`](./mlc-finetune.md) — in-browser fine-tune and KV state-leak diagnosis.
- [`mediapipe-finetune.md`](./mediapipe-finetune.md) — LITERTLM-vs-TFL3 container mismatch.
- [`ios-safari-browser.md`](./ios-safari-browser.md) — Memory64 and WebKit, cross-cutting.

Every one cites version numbers, error messages, file paths, line numbers, GitHub issue links, and direct quotes from Google, Microsoft, and Unsloth staff where they exist. We wrote them so the next team trying to ship a fine-tuned Gemma 4 in a browser can find this work and skip the dead ends we already mapped.

This case study is the front door. The postmortems are the basement, where the wiring diagrams are.

---

## Things we'd tell our past selves on day 1

1. Grep the browser SDK for magic bytes *before* running the converter. Two seconds saves a pivot.
2. Ask the model authors which runtime they bless before picking one. We asked Unsloth in week four. The answer was "GGUF." We could have asked in week one.
3. For any new model architecture, the question isn't "does Optimum support it?" The question is "does llama.cpp support it?" If yes, that's your runtime. If no, you're early.
4. Multi-turn correctness is the benchmark. First-prompt coherence is not.
5. `caniuse` every WASM proposal in your runtime's build flags before picking the runtime. Memory64, SharedArrayBuffer, threads, SIMD. Five minutes of due diligence saves weeks.
6. If a vendor publishes artifacts but no recipe, no recipe is coming. Don't wait.
7. `onnxruntime-web` and `onnxruntime-node` are not the same runtime. Bench the actual browser surface, not the Node surface that pretends to be it.
8. The fine-tune is fine. It will not be the bug. When everything is broken, suspect the runtime first, the conversion second, the model never.

---

*Compiled 2026-05-15. Work spans 2026-04-10 to 2026-05-14. Five postmortems, one case study, four runtimes, one shipping path.*
