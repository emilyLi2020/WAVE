# Four Runtimes, Four Dead Ends: Shipping a Fine-tuned Gemma 4 to the Browser

> A case study in bleeding-edge browser ML, May 2026. Over five weeks we tried to ship a fine-tuned Gemma 4 E2B (2.5B effective, 5.1B total parameters) as an on-device LLM in a web browser. We tried four different runtimes. Each failed for a structurally different reason. This is the story of how we discovered the on-device-browser-LLM space is a graveyard of "you got 90% of the way" failures — and what we shipped instead.
>
> If you only read one document about this project, read this one.

---

## Why we cared

WAVE is a guided-breathwork app for people in acute anxiety. The model writes the prose for the body-scan, the back-and-forth check-in, and a structured JSON reflection at the end. It runs entirely on the user's device. There's no server inference; the hackathon's medical-use-case constraint forbids it.

So the question on the table was simple: **can a 2.5B-effective fine-tuned Gemma 4 run in a browser tab in 2026?**

It turns out the answer is *almost*. Four different ways.

---

## The scoreboard

| Runtime | Conversion | Browser load | Coherent output | Multi-turn safe | iOS Safari | Verdict |
|---|---|---|---|---|---|---|
| **ONNX + transformers.js** | ✅ (hand-rolled, 10 iterations) | ✅ | ✅ on Node CPU; ❌ `len=0` on WebGPU | n/a | ❌ | fp16 overflow inside `onnxruntime-web` |
| **MLC + web-llm** | ✅ (PR #3485 source build) | ✅ | ✅ first prompt | ❌ KV-cache state leaks | ❌ | Workaround is 3–5 s engine reload per call |
| **MediaPipe + tasks-genai** | ✅ (litert-torch `LITERTLM`) | ❌ `No model format matched` | n/a | n/a | ❌ | No browser SDK reads what the converter writes |
| **wllama + GGUF** | ✅ (llama.cpp `convert_hf_to_gguf`) | ✅ on Chromium/Firefox | ✅ 60 tok/s on Blackwell | ✅ | ❌ Memory64 unsupported | Ships on desktop; dies on iOS at the WebKit layer |

We shipped wllama on desktop. We pivoted to React Native for iOS. Every other path is parked.

The four failures are different enough to be educational on their own; what's interesting is what they share.

---

## Runtime #1 — ONNX: the size story, then the overflow story

ONNX is the path Hugging Face docs point you at first. `optimum-cli export onnx`, drop it into `transformers.js`, ship to the browser. So we tried that.

**Hard stop, version one.** Optimum 2.1.0's `TasksManager` has no `gemma4` entry. It pins to transformers 4.57.6; Gemma 4 needs 5.5+. There's an open optimum-onnx PR (#121) called "transformers 5.2 support" that's been pending since February 2026. So the documented path doesn't move.

We hand-rolled `torch.onnx.export` against `Gemma4TextForCausalLM` instead. Ten iterations of head-banging later, we had a working export script:

> *"`'Gemma4Config' object has no attribute 'num_hidden_layers'`. `treespec.unflatten(leaves): leaves has length 73 but spec holds 4 items`. `IndexError: tuple index out of range` deep in transformers' mask code. `DynamicCache.from_legacy_cache` removed in transformers 5.5. `Expected 256 in dimension 3 but got 512 for tensor number 1`."*

That last one is interesting. Gemma 4 has **two head dimensions**: 256 for the 28 sliding-attention layers and 512 for the 7 full-attention layers (every fifth). Most export tooling assumes a uniform `head_dim`. We had to build per-layer head-dim metadata from `text_config.layer_types` and construct example past tensors with the right dim per layer.

After the iteration, we had a 7 GB bundle.

That's where the size story started.

### The PLE problem

Gemma 4 has a weight tensor that Gemma 1/2/3 don't: **Per-Layer Embeddings (PLE)**. Each of the 35 layers gets its own `vocab_size × hidden_size_per_layer` lookup table. The math:

```
35 layers × 262,144 vocab × 256 hidden = 2.35 B parameters
```

Half the file is PLE. And our quantizer (`MatMulNBitsQuantizer`) only touches `MatMul` ops — PLE tables are `Gather` ops, so they stayed at fp16. That's the entire 4 GB gap between our 7 GB output and the upstream `onnx-community/gemma-4-E2B-it-ONNX` reference at 3.1 GB.

The upstream repo exists, so *someone* has a recipe for packing 4-bit `Gather`. But it lives outside any public PR; we checked Optimum, optimum-onnx, transformers.js, and onnxruntime-genai. Microsoft has an open issue ([onnxruntime-genai #2062](https://github.com/microsoft/onnxruntime-genai/issues/2062)) describing exactly our PLE/variable-head-dim/KV-cache-sharing blockers. No maintainer reply.

Lesson #1 surfacing already: **the size of an LLM on disk is governed by whatever weight tensor your quantizer doesn't recognize.** For Gemma 4, that's PLE. For other models it'll be something else. Always check the effective-vs-total parameter ratio.

We tried `onnxsim`, `onnxoptimizer`, and ORT's `optimize_model` in `bert` mode to close the gap. `onnxsim` and `onnxoptimizer` hit the 2 GB single-protobuf-message ceiling and crashed. ORT's `bert`-mode optimizer ran cleanly but *added* 200 MB — Gemma 4's interleaved sliding/full attention doesn't match BERT fusion patterns.

So we had a 7 GB bundle (2× upstream), but it worked on Node CPU.

### The overflow story

When we loaded it in the browser, every WAVE prompt returned `len=0` — zero tokens. The model predicts a stop token on the first decode step.

Same bundle on `onnxruntime-node` CPU: coherent JSON, ~20 tok/s, schema-compliant on all three production prompts.

That's the divergence we spent the next two weeks chasing.

**The bug class is fp16 overflow inside `onnxruntime-web`'s WebGPU EP.** Our hand-rolled export emits decomposed primitives — `Mul(x,x) + ReduceMean + Add(eps) + Pow(-0.5)` for RMSNorm, manual `Q@K^T + masked Softmax + V@_` for attention. On Node CPU, those compute in fp32 implicitly; on WebGPU, they accumulate in fp16 and overflow at long contexts.

Upstream avoids this with **fused contrib ops**: `SimplifiedLayerNormalization` (which has a `stash_type=1` flag that forces fp32 internal accumulation), `GroupQueryAttention`, `RotaryEmbedding`, `FastGelu`. Their decoder is 1289 nodes. Ours was 3497.

We chased the divergence through five more export variants:

| Variant | Patch | Browser WebGPU |
|---|---|---|
| v3 | Original export | `len=0` |
| v4 | ORT `optimize_model(model_type="gpt2")` fused 70 `Tanh` chains → `FastGelu` | `len=0` |
| v5 | Rewrote 242 `Pow(x, 2.0)` → `Mul(x, x)` (WebGPU's `Pow` is `exp(x·ln(y))`, NaN for y≤0) | `len=0` |
| v6 | Pattern-fused 227 of 242 RMSNorms into `SimplifiedLayerNormalization(stash_type=1)` | `len=0` |
| v7 | Wrapped the remaining 15 variance chains with explicit `Cast(fp32)` pairs | `len=0` |

Each variant closed one overflow site. CPU output stayed coherent on each. Browser WebGPU stayed at `len=0` on each. The overflow we hadn't patched yet was always sufficient on its own to kill long-context generation.

The remaining surface after v7: 35 manual attention paths (`Q@K^T + mask-add + Softmax + @V`), 35 manual RoPE applications, the attention mask's `-inf` saturating to `-65504` in fp16. To close those, we'd need to rewrite the export wrapper so PyTorch emits the idioms ORT's pattern matchers recognize as `GroupQueryAttention` and `RotaryEmbedding`. That's reverse-engineering the optimizer's pattern code. Days of work with no guarantee.

**We stopped at v7.** It was the day we asked Unsloth's team for their blessed ONNX export path for Gemma 4. The answer:

> *No. We have no ONNX/WebGPU story for Gemma 4. Our PyTorch fix for the same fp16 overflow class is RMSNorm upcast to fp32 — exactly what your v6/v7 does. If you need browser shipping, GGUF + llama.cpp WASM.*

### What ONNX taught us

- **Per-Layer Embeddings change the storage math.** MatMul-only quantizers leave the biggest weight blob untouched. We left ~3.5 GB of PLE on the floor before we even knew PLE existed.
- **`onnxsim` and `onnxoptimizer` have a 2 GB ceiling.** Their in-memory round-trip through a single protobuf message can't handle LLM-scale graphs.
- **`onnxruntime-web` and `onnxruntime-node` are not the same runtime.** They share an op registry but use entirely different kernels. fp16 stability that's free on CPU is a 6-rewriter project on WebGPU.
- **The HF ecosystem's main blocker for new model architectures is `transformers` version compatibility, not the runtime.** Optimum's "transformers 5.2 support" PR has been open three months. Until it lands, Gemma 4 ONNX won't land in Optimum.

→ Full detail: [`onnx-export.md`](./onnx-export.md), [`onnx-finetune.md`](./onnx-finetune.md)

---

## Runtime #2 — MLC: the almost-working story

After ONNX hit the size wall, MLC-LLM looked like the path home.

MLC has a Gemma-aware quantization step (`Gemma4SplitScaledEmbedding`) that *does* pack the PLE tables to 4-bit. The headline math: ONNX gave us 7 GB; MLC gave us **2.5 GB**. The fine-tune intact, WebGPU-tuned, KV-cache-sharing enabled (20 of 35 layers share cache pairs). Better than upstream ONNX on every axis.

The catch: getting there required compiling MLC's experimental PR #3485 against a parallel TVM/relax PR #346. Neither was merged. The PR author's submodule layout assumed mlc-llm at `3rdparty/tvm` pointing to their patched relax — but `git submodule update --init --recursive` doesn't traverse into a path that's a symlink. We worked around it with a swap-symlink-to-empty-dir-then-restore dance. The published `mlc-llm-nightly-cpu` wheel ships split TVM dylibs that don't match the source build's unified `libtvm.dylib`. The WebGPU compile needs `mlc_wasm_runtime.bc`, which needs `emcc`, which needs an emscripten install on top of LLVM, CMake, Ninja, and Apple Clang.

Sixty to ninety minutes of toolchain pain on Apple Silicon, and we had a working compile. The artifact: 2.45 GB of weight shards, a 9.4 MB WebGPU WASM kernel library, 3.66 GB runtime memory before KV cache.

Then we tried to run it.

### Three things had to be diagnosed before anything else worked

**Bug 1: the LoRA-merged checkpoint on HF was corrupt.** Plain PyTorch on `Maelstrome/lora-wave-session-r32-merged` (the Unsloth-built merge) generates 100% `<pad>` tokens. Independent of MLC. Discovered by running a tiny PyTorch generation script *before* sinking time into conversion. The fix: re-merge the LoRA via PEFT (not Unsloth's `save_pretrained_merged`).

**Bug 2: a phantom attention-scaling bug we created.** Looking at MLC PR #3485's `gemma4_model.py`:

```python
self.scaling = 1.0
```

It "looks wrong." Anyone used to softmax pre-scaling expects `1/sqrt(head_dim)`. We patched it. Things got significantly worse — every model went from coherent-or-gibberish to silent 0-token output. The model predicts EOS as the first token.

Cause: MLC's `op_ext.attention` already applies `1/sqrt(head_dim)` internally. `sm_scale=...` is an *additional* multiplier. The PR default of `1.0` is correct. Double-applying the scale collapsed logits to nearly uniform.

This is the kind of bug that costs a day. The PR is right; trust it.

**Bug 3: the real PR #3485 gap — no Gemma-4 conv_template.** PR #3485 adds the `gemma4` architecture but doesn't ship a matching conversation template. The shipped `gemma_instruction` template uses Gemma 1/2 tokens. The `gemma3_instruction` template uses Gemma 3 tokens. Neither matches Gemma 4's prompt format.

| Token ID | Gemma 3 template assumes | Gemma 4 tokenizer actually has |
|---|---|---|
| 105 | `<start_of_turn>` | `<\|turn>` |
| 106 | `<end_of_turn>` | `<turn\|>` |

So `gen_config` happily generates a chat template using Gemma 3's tokens. The tokenizer byte-tokenizes `<start_of_turn>` into ~14 random tokens. The model sees a malformed prompt. Output is garbage.

We hand-patched each model's `mlc-chat-config.json` to use Gemma 4's actual tokens (`<|turn>user`, `<turn|>`, stop_token_ids `[1, 106]`). After that, all three models we tested produced coherent first-prompt output — our fine-tune, Unsloth's base, and Google's official release.

### The blocker we couldn't work around: KV-cache state leakage

`engine.chat.completions.create({messages: [...]})` is supposed to be stateless per the OpenAI-compat spec. Pass new messages each time, get a fresh completion. **Empirically it isn't.** Run four prompts sequentially in the same engine:

| Order | Our fine-tune | Unsloth base |
|---|---|---|
| #1 "Count to 5" | `1, 2, 3, 4, 5` ✓ | `1, 2, 3, 4, 5` ✓ |
| #2 "I'm feeling anxious..." | `(0 tokens)` ✗ | `(0 tokens)` ✗ |
| #3 "Capital of France?" | "Please provide the sentence or question..." ✗ | "Please provide a clear question..." ✗ |
| #4 "Haiku about waves" | `wave deep wave deep` ✗ | `**ocean** **ocean** **ocean**` ✗ |

The first prompt of any session is clean. Subsequent prompts are contaminated. Reordering confirms it — whichever prompt runs first is fine, later ones degenerate.

`engine.resetChat()` exists; it calls `pipeline.resetKVCache()` internally. We inserted it between every prompt — no behavioral change. The web-llm prefill path documents that *"if the new Conversation object matches the current one loaded, it means we are performing multi-round chatting, so we do not reset, hence reusing KV cache."* Either the conversation-match check is over-eager, or `resetKVCache()` isn't fully clearing the paged cache. Either way, it's an upstream bug we can't fix from the application layer.

### The workaround, and why it doesn't ship

Full engine reload between each call works. `engine.unload() + CreateMLCEngine(...)` — 3–5 seconds per call with OPFS warm. All four prompts produce coherent output.

WAVE makes ~7 distinct model calls per user session: check-in chat (several turns), chunk generation, reflection, insights. Reloading 7 times = 21–35 seconds of dead air spread across an experience that's supposed to feel calming. The fix is technically correct and operationally untenable.

### What MLC taught us

- **MLC ≠ HF Optimum ergonomics.** Source builds, env vars, submodule dances, multiple PR branches required. The HF ecosystem hides toolchain complexity; MLC exposes it.
- **The relax PR was the gate, not the mlc-llm PR.** PR #3485 is mostly Python (~1500 lines). The TVM/C++ changes in relax PR #346 are what required the source build.
- **Git submodule + symlink is genuinely incompatible.** No `--force`, no `git config` works. The swap-to-empty-dir dance is the only path.
- **A draft PR can be technically correct and shipping-blocked.** The PR author's "clean-room WebGPU validation" claim held up — convert/compile produces viable artifacts. The blocker for *us* is in web-llm's KV cache, not in #3485.

→ Full detail: [`mlc-build.md`](./mlc-build.md), [`mlc-finetune.md`](./mlc-finetune.md)

---

## Runtime #3 — MediaPipe: the no-public-consumer story

By this point the strategy was changing. ONNX was a fp16-overflow bug; MLC was a state-leak bug. Both were runtime correctness issues. Maybe MediaPipe's `tasks-genai` — Google's own SDK — would be cleaner.

The Mac-side conversion is well-documented. `litert-torch export_hf` takes the PEFT-merged checkpoint, applies a chat-template override, and emits a bundle. On `litert-torch-nightly==0.10.0.dev20260514`:

```bash
litert-torch export_hf \
  --model=models/runs/merge-peft \
  --output_dir=models/runs/litertlm-finetune \
  --externalize_embedder \
  --jinja_chat_template_override=litert-community/gemma-4-E2B-it-litert-lm
```

Out: 4.7 GB of bytes. We uploaded them. Wired up a test page. Pointed `@mediapipe/tasks-genai` at the URL.

```
Error: No model format matched.
    at genai_bundle.mjs:1:53616
```

That's the punchline. Let's unpack it.

### The decisive evidence: magic bytes

```
$ xxd -l 64 model.litertlm
00000000: 4c49 5445 5254 4c4d 0100 ...  LITERTLM........
```

Compare to the working base model the same SDK happily loads (Google's prebuilt `gemma-4-E2B-it-web.task`):

```
$ xxd -l 64 gemma-4-E2B-it-web.task
00000000: 1c00 0000 5446 4c33 0000 ...  ....TFL3........
```

Two different magic numbers. Different container formats. Then grep the SDK bundle for the matchers it registers:

```
$ grep -oE "(LITERTLM|TFL3)" /tmp/genai-stable.mjs | sort -u
TFL3
$ grep -oE "(LITERTLM|TFL3)" /tmp/genai-nightly.mjs | sort -u
TFL3
```

Both the stable `0.10.27` SDK and the nightly `0.10.36-rc.20260514` register **one** matcher: `TFL3`. The converter's default output is now `LITERTLM`. The converter and the consumer no longer speak the same protocol. Neither side documents this.

The dispatch logic in the SDK:

```js
if(0===r.length)throw Error("No model format matched.");
```

— `r` is the list of format matchers that accepted the file. `LITERTLM`-magic matches zero of them. The dispatch is **in JavaScript**, not WASM, so swapping the WASM URL has no effect.

### Things we tried before giving up

1. **Rename `.litertlm` → `.task` on disk via hardlink.** Same bytes, different extension. Content-sniff rejects it identically.
2. **Pin both WASM and JS to nightly `0.10.36-rc.20260514`** (released the day of this work). Same error, slightly different bundle offset. Nightly hasn't added LITERTLM support.
3. **Search the JS for an opt-in flag** — `LlmInference.createFromOptions`, `FilesetResolver.forGenAiTasks`, `BaseOptions`. No undocumented format flag.
4. **Search the `litert-torch export_hf` CLI** for a `--output_format=task` / `--web` / `--no_externalize_embedder` switch. The LITERTLM container is the converter's default output, not a side-effect of one flag.

### What the public record says

This is the part where it stops being a bug and starts being a strategy. Across ten community threads:

- **[google-ai-edge/LiteRT-LM #2150](https://github.com/google-ai-edge/LiteRT-LM/issues/2150)** — different developer, same SDK version, same `TFL3`-only matcher, same blocker. Google staff: *"It's definitely something we're looking into."* Still open.

- **[HF litert-community/TranslateGemma-4B-IT discussion #1](https://huggingface.co/litert-community/TranslateGemma-4B-IT/discussions/1)** — Google staff confirms the gap verbatim:

  > *"The pre-converted models we have so far are '-web.task' format, which we don't have any fine-tuning notebooks or colabs for, and probably won't be able to make any time soon. Note that most of the documentation on our website for model conversion will point you to a different converter which will not work for this purpose."*

- **[google-ai-edge/litert-torch #1005](https://github.com/google-ai-edge/litert-torch/issues/1005)** — the upstream tooling is literally missing the `case 'gemma4':` arm in `litert_lm_builder.py`.

- **[google-ai-edge/mediapipe #6270](https://github.com/google-ai-edge/mediapipe/issues/6270)** — even Google's own prebuilt `gemma-4-E2B-it-web.task` (the base file the SDK *does* load) crashes on Apple M4 Macs.

There is no third-party converter. There is no community-discovered flag. There is no workaround. The recipe exists, internally, at Google. It is not coming out.

### Why we did not iterate

The ONNX postmortem catalogs seven export iterations because every iteration killed one overflow site and we could measure progress on Node-CPU (coherent) vs browser-WebGPU (`len=0`). The iteration was diagnostically productive even when the bug was unfixable.

This case has **no iteration surface**. There is no overflow to chase, no kernel to rewrite. The bug is structural: the bytes we produce aren't a format any browser SDK reads. Six more conversion runs would still produce a container with no consumer.

### What MediaPipe taught us

The lesson here is cheap to state and expensive to learn:

> **When a runtime path depends on a converter–consumer pair maintained by the same vendor, verify that both halves of the pair are public before doing the conversion work.**

The earliest signal that would have caught this was `grep -oE "(LITERTLM|TFL3)" genai_bundle.mjs` **before** running the conversion. Two seconds of work. It would have saved a full pivot.

Operationally: when a vendor's docs say *"we publish artifacts but no recipe,"* that's a hard stop, not a "we'll figure it out." Trust the silence.

→ Full detail: [`mediapipe-finetune.md`](./mediapipe-finetune.md)

---

## Runtime #4 — wllama: the works-on-desktop story

After three structural dead-ends, we did the thing we should have done earlier: ask the model's authors what they recommend.

Unsloth's answer: GGUF + llama.cpp.

`llama.cpp` has had Gemma 4 as first-class since launch. The Q4_K_M quantization handles PLE correctly (it's been a `llama.cpp`-native concept since Gemma 4 dropped). And [wllama](https://github.com/ngxson/wllama) compiles llama.cpp to WASM + WebGPU and exposes a clean TypeScript API.

The pipeline is short:

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

It just worked. Within a day we had the fine-tune running in Chrome, coherent on all three production prompts, with KV cache that *actually clears* between calls.

### The performance numbers (Windows 11 / Chrome / Blackwell)

3 runs per scenario. The ONNX base ships at the size we measure against; the wllama fine-tune ships at the size *and* fidelity we wanted from the start.

| Scenario | Metric | ONNX base (q4f16) | wllama fine-tune (Q4_K_M) | wllama advantage |
|---|---|---|---|---|
| Phase narration | Decode | 6.8 tok/s | **60.1 tok/s** | **8.8×** |
| Phase narration | TTFT | 203 ms | **42 ms** | **4.8×** |
| Phase narration | Total (~65 tok) | 9.45 s | **1.16 s** | **8.1×** |
| Check-in turn | Decode | 6.6 tok/s | **59.0 tok/s** | **8.9×** |
| Check-in turn | TTFT | 295 ms | **152 ms** | **1.9×** |

For a guided-breathwork app, **1.16 s** to a 65-token phase narration is the difference between "the app feels alive" and "the user is staring at a spinner during their panic attack." This is the headline that goes on the slide.

It also handles multi-turn correctly out of the box. No KV-cache leaks. No engine reload between calls. The chat template uses Gemma 4's actual tokens, because llama.cpp's Gemma 4 implementation was written by people who had the tokenizer in front of them.

### Then we plugged in an iPhone

```
ggml_webgpu: adapter_info: vendor_id: 0 | vendor: apple | architecture: apple-gpu …
llama_kv_cache_iswa: using full-size SWA cache
…
TypeError: Conversion from BigInt to number is not allowed
```

The model never reaches the chat-completion stage. The error fires during `wllama.loadModelFromHF()`. Same error in iOS Safari 26, iOS Chrome (which is also WebKit, per App Store rule 2.5.6), and on the WASM-only path with `nGpuLayers: 0`. So it's not WebGPU-specific. It's engine-wide.

### Root cause: Memory64

From the wllama README, at HEAD as of 2026-05-15:

> *"Memory64 is now a requirement, which drops support for Safari."*

[Memory64](https://github.com/WebAssembly/memory64) is a WebAssembly proposal that uses 64-bit memory addressing instead of WASM 1.0's 32-bit ceiling (4 GiB linear memory). On the JS side, 64-bit pointers cross the boundary as `BigInt` values. Any arithmetic mixing `BigInt` with `Number` throws the runtime error above.

Chrome, Edge, and Firefox shipped Memory64 enabled-by-default in 2024. The WebKit row on caniuse still says "not supported." There is no public timeline.

The wllama maintainer's call for contributors to write a Safari-compatible build guide ([wllama #210](https://github.com/ngxson/wllama/issues/210)) has been open since v3.0 with no merged fix. And here's the thing: even if a 32-bit fallback shipped tomorrow, our Q4_K_M GGUF is 3.2 GB *compressed*. KV cache at `n_ctx=4096` adds ~400 MiB. Plus runtime overhead. We'd be sitting right at the 4 GiB WebKit ceiling on this exact model. The fix unblocks loading, then OOMs on KV growth.

### Why every iOS browser is the same browser

Apple's App Store Review Guidelines §2.5.6 require third-party browsers on iOS to use WebKit as their rendering and JavaScript engine. Chrome iOS, Firefox iOS, Brave iOS, Edge iOS — all WebKit underneath. Different chrome UI, same engine ceiling.

The EU's Digital Markets Act technically allows alternative engines in the EU since iOS 17.4. As of May 2026, neither Google nor Mozilla has shipped a non-WebKit engine on iOS. So in practice, **iOS browser = WebKit, everywhere on Earth, today.**

"Try a different browser" is not a workaround.

### What wllama taught us

- **The default LLM browser runtime in 2026 is wllama.** It works, it's fast, the chat template is correct, llama.cpp gets first-class support for new models on launch day.
- **Before committing to a runtime, `caniuse` every WebAssembly proposal in its build flags.** Memory64 status on Safari was discoverable in two minutes. We didn't check.
- **The iOS browser surface for a 4B-Q4 LLM in 2026 is fragile** by something like three independent factors: (a) Safari hasn't shipped Memory64, (b) the runtimes that use Memory64 don't ship 32-bit fallbacks, (c) even if they did, the model footprint compounds with KV growth right up against the 4 GiB ceiling. Browser-first iOS LLMs are a 2027+ bet, contingent on all three closing.

→ Full detail: [`docs/wllama.md`](../wllama.md), [`ios-safari-browser.md`](./ios-safari-browser.md)

---

## What all four taught us, together

Four pivots, four different shapes of failure. The synthesis is more useful than any one of them in isolation.

### 1. New model architectures travel through the ecosystem at the speed of `transformers` version compatibility

We hit this with ONNX (Optimum pinned to `transformers<4.58`, Gemma 4 needs 5.5+; their bridge PR open three months) and again with MediaPipe (`litert_lm_builder.py` literally missing the `case 'gemma4':` arm). The graph is: HF Transformers ships a new architecture → Optimum needs to catch up → onnx-community needs a recipe → onnxruntime-genai needs PLE-aware quantization → transformers.js needs a working ONNX layout. Any link in the chain not yet caught-up turns into a months-long blocker.

llama.cpp is the exception. It ships Gemma 4 support on day zero because the people writing the GGUF converter are the same people who care about it running in the wild. **That is the difference.**

### 2. Vendor-pair compatibility is checkable in two seconds, before any conversion

The MediaPipe failure was a `grep "TFL3" genai_bundle.mjs` away from being preventable. We didn't run the grep. Now we have a rule: when shipping path is `vendor's converter → vendor's consumer`, verify the byte format match *before* the conversion job, not after.

This generalizes. When a path has multiple required components from different sources, identify the weakest link and verify that one *first*. We're now codifying this as an explicit pre-conversion checklist for any future model pivot — start with the consumer, find its magic-byte / format / op-set requirements, then check the converter produces those.

### 3. The same fp16 overflow shows up in different costumes across runtimes

- **ONNX/WebGPU:** `len=0` because the first decoded logits are NaN
- **MLC** (if you misapply the scale fix): every token is EOS
- **PyTorch** with Gemma 3/4: documented overflow in vision tower ([vllm #40290](https://github.com/vllm-project/vllm/issues/40290))

The root cause is the same: small attention denominators, large activations, RMSNorm's `mean(x²)` over 1536-dim vectors. Anywhere a runtime accumulates in fp16, Gemma's PLE-aware architecture finds the overflow. **The fix is always the same**: force fp32 accumulation in the variance computation and inside softmax. Different runtimes spell it differently:

- llama.cpp: it's built in
- ONNX upstream: `SimplifiedLayerNormalization(stash_type=1)` + `GroupQueryAttention`
- MLC: `f16_acc=False` in attention ops
- Unsloth PyTorch fix: explicit `.float()` casts in modeling code

If you're picking a runtime, **ask first whether it has a Gemma-class numerical-stability story**. If the answer is "we'll find out when you run it," your runtime hasn't been validated for this model class.

### 4. "Almost working" is its own category of failure, and it's the most expensive one

The MediaPipe failure was cheap because it announced itself immediately — no consumer means no consumer, you stop and pivot. The ONNX failure was medium-expensive because we *almost* got there and kept iterating. The MLC failure was the most expensive because it produces coherent output on the first prompt: you ship a demo, hand it to a user, watch the second prompt degenerate, and only then discover the state-leak. The 80/20 here is *not* 80% of the work for 20% of the value. It's 80% of the work for 0% of the value with a misleading interim signal.

When evaluating a runtime, the right benchmark is "multi-turn correctness across cold + warm KV state," not "first prompt looks reasonable."

### 5. The browser is downstream of three platforms with different velocity

| Layer | Velocity | Examples |
|---|---|---|
| Model architecture (PyTorch) | Days | Gemma 4 released, training works the same day via Unsloth |
| Runtime kernels | Months | ONNX contrib ops, MLC PR #3485, wllama llama.cpp updates |
| Browser engine (Chromium, WebKit) | Years | WebGPU, Memory64, fp16 stability in shader compilers |

A new model architecture flows down this stack at the speed of its slowest layer. For iOS, the bottom layer is *Apple WebKit Memory64 ship date* — which is an engine team's roadmap, on engine-team timelines. We are not unblocking that from the application layer.

This is why the pivot is React Native, not "wait for Safari." The model architecture is done; the runtime kernels exist on iOS; the *browser engine* is the thing we're routing around.

---

## Where we landed

After five weeks of pivots, the actual shipping plan is two surfaces:

### Desktop browser (Windows / macOS / Linux, Chrome / Edge / Firefox)

**wllama + Q4_K_M GGUF.** 60 tok/s decode on Blackwell, sub-second TTFT, correct multi-turn, correct chat template, ~3.2 GB cold-load amortized into OPFS. Ships in `client/lib/wllama/`. This is the primary submission surface.

### iOS (and Android, eventually)

**React Native + `llama.rn` (native llama.cpp + Metal).** Same Q4_K_M GGUF, no model-side rework. WhisperKit for STT, AVSpeechSynthesizer for TTS. We also evaluate `react-native-litert-lm` against the LITERTLM bundle that the MediaPipe-browser path produced but couldn't deploy — that bundle now finds a consumer on mobile native. Two hackathon tracks, one app.

The cloud-fallback that would be standard for non-medical apps (iOS user → server inference) is explicitly disallowed by the hackathon's medical use case constraint. On-device or nothing.

### What stays parked

- **ONNX fine-tune** at `Maelstrome/lora-wave-session-r32-onnx` — correct on Node CPU, dead on browser WebGPU. Kept as a CPU-only fallback if anyone ever wants to run the fine-tune in a Node service.
- **MLC export** at `models/runs/mlc-export-v2/` — works for first prompt, blocked on the web-llm KV state leak. Ready to ship the moment that bug closes upstream.
- **MediaPipe LITERTLM bundle** at `Maelstrome/lora-wave-session-r32/mediapipe/` — ready to ship the moment `@mediapipe/tasks-genai` registers a `LITERTLM` matcher. Used by `react-native-litert-lm` on mobile in the meantime.

If any of those four upstream bugs closes between now and ship, we can flip a URL and add a runtime. The Mac-side conversion work, the build scripts, the test pages, the bench scaffolding — all of it stays as scaffolding for the day the upstream catches up.

---

## A note on the postmortem culture

We wrote five long-form postmortems alongside this case study. They live next to this file:

- [`onnx-export.md`](./onnx-export.md) — original Mac ONNX export
- [`onnx-finetune.md`](./onnx-finetune.md) — Windows handoff + seven v3–v7 iterations
- [`mlc-build.md`](./mlc-build.md) — source build of MLC PR #3485 + relax PR #346
- [`mlc-finetune.md`](./mlc-finetune.md) — in-browser fine-tune + KV state-leak diagnosis
- [`mediapipe-finetune.md`](./mediapipe-finetune.md) — LITERTLM-vs-TFL3 container mismatch
- [`ios-safari-browser.md`](./ios-safari-browser.md) — Memory64 + WebKit cross-cutting analysis

Each is specific. Each cites version numbers, error messages, file paths, line numbers, public GitHub issues, and quotes Google / Microsoft / Unsloth staff on the record where relevant. The reason we wrote them: the next team that tries to ship a fine-tuned Gemma 4 in a browser is going to hit some subset of these same bugs in some unknown order, and we'd like them to find this work and skip the dead ends we already mapped.

This case study is the front door. The postmortems are the basement, where the wiring diagrams live.

---

## Things we would tell our past selves on day 1

1. **Grep the browser SDK for magic bytes before running the converter.** Two seconds saves a pivot.
2. **Ask the model authors what runtime they bless** before picking one yourself. We asked Unsloth in week 4. The answer was "GGUF." We could have asked in week 1.
3. **For any new model architecture, the question isn't "does Optimum support it?" — it's "does llama.cpp support it?"** If yes, that's your runtime. If no, you're early.
4. **Multi-turn correctness is the real benchmark.** First-prompt coherence is not.
5. **`caniuse` every WASM proposal in your runtime's build flags before picking the runtime.** Memory64. SharedArrayBuffer. Threads. SIMD. Five minutes of due diligence.
6. **If a vendor publishes artifacts but no recipe, that means there is no recipe coming.** Don't wait for one.
7. **`onnxruntime-web` and `onnxruntime-node` are not the same runtime.** Bench the actual browser surface, not the easier Node surface that pretends to be it.
8. **The fine-tune is fine.** It will not be the bug. When everything is broken, suspect the runtime first, the conversion second, the model never.

---

*Compiled 2026-05-15 from work spanning 2026-04-10 through 2026-05-14. Five distinct postmortems, one case study, four runtimes, one shipping path.*
