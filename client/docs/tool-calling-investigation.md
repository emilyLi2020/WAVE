# Tool-calling investigation: base passes, LoRA fails

**Date filed**: 2026-05-15
**Status**: production check-in stays on strict `json_schema`. Re-training to restore native tool calls is delegated via [`docs/handoffs/restore-tool-calls-handoff.md`](../../docs/handoffs/restore-tool-calls-handoff.md).
**Affected surface**: [`generateWllamaCheckIn`](../lib/gemma/wllama-generators.ts) — the `endConversation` signal for the voice check-in.

## TL;DR

Base `unsloth/gemma-4-E2B-it` emits Gemma 4's native function-call tokens (`<|tool_call>...<tool_call|>`) cleanly. Applying our LoRA `Maelstrome/lora-wave-session-r32` suppresses the capability completely — pure narration, zero tool tokens, even when the prompt explicitly asks for them.

The cause is upstream of any runtime: training data wrapped every assistant turn in a JSON schema (`{"endConversation": ..., "reply": "..."}`) and never showed the model native tool tokens. Over thousands of gradient steps the tool-emission logits were suppressed at the relevant positions. wllama, llama.cpp, and `apply_chat_template(..., tools=...)` all behave correctly; the model itself has lost the capability.

Production keeps strict `response_format: { type: "json_schema" }` for all three surfaces (chunk / check-in / reflection) — verified working via [`/models/wllama-schema-probe`](../app/models/wllama-schema-probe/). The browser-side rewiring to a streaming + native-tool-parsing path is reversibly gated on the new LoRA landing.

## What we tried (wllama-schema-probe)

[`client/app/models/wllama-schema-probe/probe-client.tsx`](../app/models/wllama-schema-probe/probe-client.tsx) exposes five buttons that exercise the same wllama instance against four different output paths:

| Probe | Path | Result |
|---|---|---|
| 1. Chunk JSON schema (strict) | `response_format: { type: "json_schema", strict: true, json_schema: chunkLinesJsonSchema }` | **PASS** — coherent JSON every run |
| 2. Reflection JSON schema (strict) | Same with `reflectionJsonSchema` | **PASS** |
| 3a. Tools (batch) | `tools: [endConversationTool]`, `tool_choice: "auto"` | **FAIL** — model emits narration, no tool call |
| 3b. Tools (stream) | Same, streaming | **FAIL** |
| 4. Raw `createCompletion` with explicit native instruction | Plain prompt asking for `<|tool_call>...<tool_call|>` after the closing message | **FAIL** — model emits the closing text but no tool tokens |

Probe 4 was load-bearing: it ruled out wllama's tools-API plumbing and proved the model genuinely cannot produce the special tokens given a chat template that's structurally identical to the base's.

## Isolating it (Python transformers)

[`models/finetune/test_tool_calling.py`](../../models/finetune/test_tool_calling.py) loads the same checkpoints through HF transformers, applies `processor.apply_chat_template(..., tools=[END_CONVERSATION_TOOL], add_generation_prompt=True)`, and dumps raw + per-token output.

```bash
# Control run: base only, no LoRA
uv run --project models python models/finetune/test_tool_calling.py

# LoRA run: base + Maelstrome/lora-wave-session-r32 via PEFT.merge_and_unload()
uv run --project models python models/finetune/test_tool_calling.py \
    --adapter Maelstrome/lora-wave-session-r32
```

**Control run output** (truncated, special tokens preserved):

```
<|tool_call>call:endConversation{cravingScore:6,obstacleCategory:<|"|>none<|"|>}<tool_call|>Thank you for sharing your experience today. I hope this practice brings you peace.<turn|>
```

Per-token decode confirmed `<|tool_call>` and `<tool_call|>` are single vocab tokens; `<|"|>` is the dedicated Gemma 4 quote token for tool-call string args. Verdict: PASS.

**LoRA run output**: pure narration, no tool tokens at any position. Verdict: FAIL.

This isolates the failure to the model itself — every infrastructure layer (HF transformers, wllama, llama.cpp, the GGUF, the chat template) is identical between the two runs.

## Root cause

Every training row in [`models/datasets/lora-wave-session-expanded.jsonl`](../../models/datasets/lora-wave-session-expanded.jsonl) wraps the assistant turn in a JSON schema:

```json
{
  "role": "assistant",
  "content": "{\"endConversation\":null,\"reply\":\"...\"}"
}
```

For check-in surfaces where the model should call a tool, the assistant content is a JSON object — never the native `<|tool_call>...<tool_call|>` sequence. PEFT trained the LoRA to produce JSON in that token position and suppressed everything else, including the native tool tokens the base model emits freely. Many gradient steps × strong loss gradient against any non-JSON output ≈ capability erasure.

The error class is similar to known PEFT phenomena around catastrophic suppression: when the adapter is given a strong, consistent signal that one shape is right at this surface, it learns to push the alternatives to near-zero logits. Tool-emission survival would have required mixing native examples into the training set; we didn't.

## What we're shipping until the re-train lands

[`generateWllamaCheckIn`](../lib/gemma/wllama-generators.ts) uses:

```ts
response_format: {
  type: "json_schema",
  strict: true,
  json_schema: checkInJsonSchema,  // { reply: string, endConversation: null | {...} }
}
```

llama.cpp compiles the schema to a GBNF grammar and constrains decoding. The fine-tune is already trained to produce this exact shape, so the grammar acts as a safety net rather than a behavioral nudge. End-to-end verified by:

- Schema-probe row 1 and 2 (chunk + reflection) — PASS.
- The check-in equivalent in [`generateWllamaCheckIn`](../lib/gemma/wllama-generators.ts) — same path, same shape.
- Unit tests in [`client/scripts/test-wllama-generators.ts`](../scripts/test-wllama-generators.ts) cover `extractFirstJsonObject`, `parseCheckInJson`, `normalizeEndConversation`, plus the 2-attempt + fallback-bank backstop semantics in [`streamCheckInTurn`](../lib/gemma/checkin.ts).

Loose `response_format: { type: "json_object" }` was also tried (no schema, just "give me JSON"); the model produced malformed JSON in production. Strict `json_schema` is the only path that survives in the browser today.

## Path to fix

[`docs/handoffs/restore-tool-calls-handoff.md`](../../docs/handoffs/restore-tool-calls-handoff.md) delegates the re-training:

1. Transform `lora-wave-session-expanded.jsonl` → `lora-wave-session-toolcall.jsonl`:
   - Phase + reflection rows pass through unchanged (they keep the JSON path).
   - Intermediate check-in rows (`endConversation` null) → plain text, no JSON wrapper.
   - Ending check-in rows (`endConversation` object) → native `<|tool_call>call:endConversation{...}<tool_call|>{reply}` format, mirroring the control-run output byte-for-byte.
2. Re-train with one epoch (`--epochs 1`), all other knobs matching the prior production run.
3. Merge via `merge_lora_peft.py` (not unsloth — its merge produces all-`<pad>`).
4. Re-run `test_tool_calling.py` against the merged checkpoint. Must report PASS before convert-to-GGUF.
5. Push to **new** repo `Maelstrome/lora-wave-session-r32-toolcall` so the working LoRA stays available until the new one is verified browser-side.

After the new LoRA lands, the browser swap is one line in [`client/lib/wllama/config.ts`](../lib/wllama/config.ts) (point `WAVE_GGUF_REPO` at the new repo) plus a rewrite of `generateWllamaCheckIn` from `json_schema` to streaming + native-tool-call parsing. The control-run output is the parser's known-good fixture.

## References

- Probe page: [`client/app/models/wllama-schema-probe/`](../app/models/wllama-schema-probe/)
- Python isolation script: [`models/finetune/test_tool_calling.py`](../../models/finetune/test_tool_calling.py)
- Current generator (json_schema path): [`client/lib/gemma/wllama-generators.ts`](../lib/gemma/wllama-generators.ts)
- Check-in retry + fallback orchestration: [`client/lib/gemma/checkin.ts`](../lib/gemma/checkin.ts)
- Re-training handoff: [`docs/handoffs/restore-tool-calls-handoff.md`](../../docs/handoffs/restore-tool-calls-handoff.md)
- Gemma 4 function-calling docs (the call format we're targeting): [ai.google.dev/gemma/docs/capabilities/function-calling](https://ai.google.dev/gemma/docs/capabilities/function-calling)
