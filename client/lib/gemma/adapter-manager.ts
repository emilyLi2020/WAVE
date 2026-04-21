/**
 * Adapter Manager — runtime-agnostic contract named in AGENTS.md
 * (`client/lib/gemma/adapter-manager.ts`). Today it returns the
 * prompt-template id for a given session phase. When the in-browser
 * Gemma 4 + LoRA stack lands, it returns the LoRA id to hot-swap into
 * the base model. Call sites in `lib/gemma/session.ts` do not change.
 *
 * TODO:replace-with-gemma — switch the return value from a prompt-template
 * id to the LoRA adapter id (e.g. `lora-med-ack`, `lora-body-scan`,
 * `lora-wave-rise|peak|fall`, `lora-reflection`) once the LoRA stack ships.
 * Keep the function signature and the phase keys stable.
 */

import type { NarrationPhase } from "@/lib/prompts/schemas";

const ADAPTER_BY_PHASE: Record<NarrationPhase, string> = {
  "med-ack": "prompt-med-ack",
  "body-scan": "prompt-body-scan",
  "wave-rise": "prompt-wave-rise",
  "wave-peak": "prompt-wave-peak",
  "wave-fall": "prompt-wave-fall",
  reflection: "prompt-reflection",
};

export function pickAdapter(phase: NarrationPhase): string {
  return ADAPTER_BY_PHASE[phase];
}
