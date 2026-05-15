# Transformers.js Gemma 4 WebGPU perf bug — `num_logits_to_keep=0`

**TL;DR**: Browser Gemma 4 generation through `@huggingface/transformers@4.2.0` is
~10× slower than it should be on every backend because `decoder_forward()`
passes `num_logits_to_keep=0` to the ONNX decoder session, which forces the
decoder to materialize logits over the full prompt sequence (vocab ≈ 262k ×
every prompt token) on every decode step. Fix is merged upstream in
[transformers.js#1681] but **not in any published release** as of this writing.
Until then, the local Wave runtime is stuck on the slow path unless we
manually patch.

## Symptoms

- Browser tok/s ~5–10 on a desktop NVIDIA WebGPU machine where ORT-node on
  CPU reaches ~18 tok/s for the same ONNX export.
- Mac (Apple Silicon, Metal-backed WebGPU) is still relatively fast (~50
  tok/s) because Metal's bandwidth/throughput hides the extra compute; the
  bug is present on Mac too, just not as visible.
- `chrome://gpu` reports WebGPU as "Hardware accelerated"; `nvidia-smi`
  confirms the GPU is actually being used. So it isn't a CPU-fallback
  problem.

## Root cause

`decoder_forward()` in transformers.js 4.2.0 (installed at
[client/node_modules/.pnpm/@huggingface+transformers@4.2.0/node_modules/@huggingface/transformers/dist/transformers.node.cjs:25901-25903](../node_modules/.pnpm/@huggingface+transformers@4.2.0/node_modules/@huggingface/transformers/dist/transformers.node.cjs)):

```js
if (session.inputNames.includes("num_logits_to_keep") && !new_model_inputs.num_logits_to_keep) {
    // Comment says "default is 1" but the code passes 0n.
    new_model_inputs.num_logits_to_keep = new Tensor2("int64", [0n], []);
}
```

`Gemma4ForConditionalGeneration.forward()` calls `decoder_forward()` directly,
so it never goes through `decoder_prepare_inputs_for_generation()` (which
correctly uses `1n`). The model's exported ONNX listens to
`num_logits_to_keep` and computes `seq_len * vocab_size` logits when it's 0
vs `1 * vocab_size` when it's 1. For Gemma 4's 262144-vocab embed table that
is a brutal multiplier on the final `lm_head` MatMul per decode step.

For our 200–500-token framing prompts this is ≈ 200–500× extra arithmetic on
the lm_head step every token. Roughly matches the observed 6 tok/s vs the
~50 tok/s Mac figure.

## Upstream status

- Reported as
  [huggingface/transformers.js#1666](https://github.com/huggingface/transformers.js/issues/1666)
  by RunPod's Wandler team on 2026-04-29 — same Gemma 4 ONNX, same q4f16
  path, observed via memory blowup on a 20k-token prompt (~20 GB of logits).
- Fix merged in
  [huggingface/transformers.js#1681](https://github.com/huggingface/transformers.js/pull/1681)
  on 2026-05-08. One-line change: `0n → 1n`.
- npm registry as of 2026-05-14: latest published is **4.2.0** (2026-04-23,
  pre-fix). No 4.2.1 / 4.3.0-next exists yet. Check
  `npm view @huggingface/transformers versions --json` periodically.

## Workarounds, in order of preference

1. **Wait for 4.2.1+ to be published, then bump `client/package.json`.** No
   patch noise in the repo, no `pnpm patch` chain to maintain. Probably the
   right call unless the perf bites in a demo we can't reschedule.

2. **Vendor the fix with `pnpm patch`.** Persistent across `pnpm install`,
   leaves a clean diff under `patches/`. The change is one line:

   ```
   cd client
   pnpm patch @huggingface/transformers@4.2.0
   # in the printed temp dir, edit dist/transformers.node.cjs and dist/transformers.web.cjs:
   #   new_model_inputs.num_logits_to_keep = new Tensor2("int64", [0n], []);
   #   ->
   #   new_model_inputs.num_logits_to_keep = new Tensor2("int64", [1n], []);
   pnpm patch-commit <temp-dir>
   ```

   Remove the patch when bumping to a fixed release.

3. **Hot-patch `node_modules` directly.** Survives until the next
   `pnpm install`. Useful only for a one-off A/B to confirm the bug really
   is the bottleneck on a given machine.

## How to A/B confirm on a given machine

Load the [/models/onnx-test/compare](../app/models/onnx-test/compare/page.tsx)
page, run all three tasks, note tok/s. Apply workaround 3, reload, re-run.
Expect roughly a 5–10× jump on NVIDIA Windows.

## Related repo work this affects

- The
  [/models/onnx-test/compare](../app/models/onnx-test/compare/page.tsx)
  page surfaces this bug because both upstream and our fine-tune share the
  same `Gemma4ForConditionalGeneration` forward path in transformers.js.
- The "we shipped a slower ONNX than upstream" suspicion was wrong: this is
  a runtime-side issue, not an export-side regression.
- The production runtime in
  [client/lib/gemma/local-runtime.ts](../lib/gemma/local-runtime.ts)
  hits the same code path and is equally affected — including the
  multi-turn check-in, chunk narration, and reflection flows.

[transformers.js#1681]: https://github.com/huggingface/transformers.js/pull/1681
