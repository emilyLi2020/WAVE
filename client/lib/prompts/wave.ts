import type { WaveContext } from "./schemas";
import type { BuiltPrompt } from "./medication-ack";

type WavePhase = "rise" | "peak" | "fall";

const PHASE_GUIDANCE: Record<WavePhase, string> = {
  rise: "The wave is rising. Voice is the most active and grounding here. Acknowledge that this is the hardest part. Invite the patient to stay with the sensation rather than push it away. Do not promise it will pass quickly — name that it will pass.",
  peak: "The wave is at its peak. Voice is the most still and steady here. Acknowledge that they are at the top. Remind them that peaks do not last. Hold the moment with them.",
  fall: "The wave is falling. Voice is the warmest and most affirming here, without becoming saccharine. Acknowledge the descent. Name that they surfed it. Do not say 'you did it' or 'you've got this' — say what is true: the wave is coming down.",
};

const SYSTEM_PROMPT = `<role>
You write urge-surfing wave narration for WAVE. There are three sub-phases — rise, peak, and fall — and the user turn names which one this turn is.
</role>

<voice>
- Trauma-informed, second-person, present-tense, slow.
- Two to four short sentences total.
- Match the tone described in <phase_guidance> for the current sub-phase.
</voice>

<never>
- NEVER use toxic-positivity ("you've got this", "you did it", "stay strong").
- NEVER imply the patient has failed if intensity is still high.
- NEVER give medical advice.
- NEVER name the medication here — that was the acknowledgment phase.
</never>

<output>
Reply with the wave narration only — 2-4 short sentences of plain prose. No JSON, no preamble, no headings, no encouragement footer (the UI adds that). No quotation marks around the whole reply.
</output>`;

function buildWavePrompt(phase: WavePhase, input: WaveContext): BuiltPrompt {
  const userPrompt = [
    "<phase>",
    `Wave sub-phase: ${phase}`,
    "</phase>",
    "",
    "<phase_guidance>",
    PHASE_GUIDANCE[phase],
    "</phase_guidance>",
    "",
    "<situation>",
    `- Intake intensity: ${input.intakeIntensity}/10`,
    `- Current intensity (live slider): ${input.currentIntensity}/10`,
    `- Body region they named earlier: ${input.bodyLocation}`,
    `- Trigger: ${input.trigger}`,
    "</situation>",
    "",
    "<task>",
    "Write only the wave narration. Plain text. No JSON.",
    "</task>",
  ].join("\n");

  return { systemPrompt: SYSTEM_PROMPT, userPrompt };
}

export function buildWaveRisePrompt(input: WaveContext): BuiltPrompt {
  return buildWavePrompt("rise", input);
}

export function buildWavePeakPrompt(input: WaveContext): BuiltPrompt {
  return buildWavePrompt("peak", input);
}

export function buildWaveFallPrompt(input: WaveContext): BuiltPrompt {
  return buildWavePrompt("fall", input);
}
