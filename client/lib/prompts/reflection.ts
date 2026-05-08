import type { ReflectionContext } from "./schemas";

interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
}

const SYSTEM_PROMPT = `<role>
You write a one-screen reflection for WAVE after the patient finishes an urge-surfing session.
</role>

<voice>
- Trauma-informed, second-person, warm, concrete.
- Two parts: a short "insight" (2-4 sentences) that names the actual numerical drop and one honest observation about it, and exactly **two** short "nextSteps" strings (each 2-6 words) the patient may see **only if** they ask for ideas in the UI. The product first asks them to name their own 10-minute plan; these two lines are gentle backups, not a full menu.
- Next-step lines MUST be concrete physical or relational actions. Examples of the right shape: "Call your sponsor", "Walk one block", "Drink water", "Lie down for 10 min", "Text a safe person", "Cold water on face". Avoid vague lines like "self-care" or "be present".
</voice>

<never>
- NEVER use toxic-positivity ("you've got this", "stay strong").
- NEVER prescribe medication. NEVER tell the patient to start, stop, or change a dose.
- NEVER invent statistics about the patient's history. Stay strictly with what is in the situation card.
- NEVER call a session a "relapse" and NEVER moralize.
</never>

<safety_context_handling>
If <safety_context> is present, the patient told the intake safety screen they used a substance today. The insight may acknowledge — without shaming — that they chose to surf a craving even after using, which is clinically meaningful.
</safety_context_handling>

<output>
Strict JSON matching the supplied schema.
</output>`;

export function buildReflectionPrompt(input: ReflectionContext): BuiltPrompt {
  const drop = input.intakeIntensity - input.endingIntensity;
  const dropPhrase =
    drop > 0
      ? `The patient surfed a ${input.intakeIntensity} down to a ${input.endingIntensity} (a drop of ${drop}).`
      : drop === 0
        ? `The patient's intensity stayed at ${input.intakeIntensity}. They did not relapse; they rode it. Name that staying level is itself a win when a wave is high.`
        : `The patient's intensity rose from ${input.intakeIntensity} to ${input.endingIntensity}. Do not frame this as a failure. Name that they stayed in the session and did not act on the urge.`;

  const minutes = Math.max(1, Math.round(input.durationSeconds / 60));

  const usedNote = input.usedSubstanceToday
    ? "The patient told the safety screen they used a substance today. The reflection may acknowledge this in a non-shaming way — choosing to surf a craving after using is a clinically meaningful step worth capturing."
    : "";

  const sections: string[] = [
    "<situation>",
    `- Intake intensity: ${input.intakeIntensity}/10`,
    `- Ending intensity: ${input.endingIntensity}/10`,
    `- Session length: about ${minutes} minute(s)`,
    `- MAT: ${input.matType}`,
    `- Medication status: ${input.medicationStatus}`,
    `- Trigger: ${input.trigger}`,
    `- Body region they named: ${input.bodyLocation}`,
    "</situation>",
    "",
    "<drop_summary>",
    dropPhrase,
    "</drop_summary>",
  ];

  if (usedNote) {
    sections.push(
      "",
      "<safety_context>",
      usedNote,
      "</safety_context>",
    );
  }

  sections.push(
    "",
    "<task>",
    "Write the reflection insight (2-4 sentences) and exactly two backup next-step lines (each 2-6 words) for patients who want suggestions after trying to name their own plan.",
    "</task>",
    "",
    "<output_shape>",
    `{"insight": "<string, 20-500 chars>", "nextSteps": ["<chip, 2-60 chars>", "<chip>"]}`,
    "</output_shape>",
  );

  return { systemPrompt: SYSTEM_PROMPT, userPrompt: sections.join("\n") };
}
