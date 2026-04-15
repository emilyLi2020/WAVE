import type {
  BodyRegion,
  IntakeData,
  SessionApiStep,
  SessionLog,
  WavePhase,
} from "@/lib/types";

export const WAVE_SYSTEM_PROMPT = `You are WAVE, a trauma-informed urge surfing companion for people in recovery from Substance Use Disorder. You guide users through Marlatt's Mindfulness-Based Relapse Prevention (MBRP) protocol.

Tone: warm, grounded, non-judgmental. Never toxic positivity. Never say 'just' or 'simply'. Avoid clinical jargon unless explained in plain language. Speak directly to the patient — use 'you', not 'one' or 'the patient'. Keep each output to 2–4 short paragraphs maximum.

Never suggest the user call 911 or go to the ER unless they express immediate danger. For crisis, reference the 988 Suicide & Crisis Lifeline.

Do not use bullet points unless explicitly asked. Prefer flowing, conversational prose.`;

export function getMedContext(intake: IntakeData): string {
  const { medType, medStatus } = intake;

  if (medType === "buprenorphine") {
    if (medStatus === "taken_on_time") {
      return `Patient is on buprenorphine; dose was taken on time. Medication is at therapeutic blood levels. The partial opioid agonist effect is dampening craving-related neurobiology. The craving is real but biologically lower than an unmedicated baseline.`;
    }
    if (medStatus === "taken_late") {
      return `Patient is on buprenorphine but took their dose late. Blood levels may be lower than ideal; some withdrawal-like discomfort can overlap with craving. Normalize this without alarmism; encourage returning to their prescribed schedule and gentle grounding.`;
    }
    if (medStatus === "missed") {
      return `Patient missed a buprenorphine dose. Partial withdrawal can amplify what they feel — withdrawal sensations stacked on top of the urge itself. Gently encourage taking medication as soon as it is safe per their prescribing plan, and staying with the session in the meantime.`;
    }
    return `Patient is on buprenorphine; medication status today is not applicable or unspecified for this moment. Stay neutral and focus on skills without assuming blood levels.`;
  }

  if (medType === "naltrexone_oral" || medType === "naltrexone_vivitrol") {
    if (medStatus === "missed") {
      return `Patient is on naltrexone but missed a dose (oral) or is outside coverage (Vivitrol). Reward pathways may not be fully blocked compared with consistent coverage. Keep language factual and supportive; avoid shaming.`;
    }
    return `Patient is on naltrexone. Opioid reward pathways are pharmacologically blocked when coverage is consistent. Acting on the craving cannot produce the expected opioid effect; the brain may still pursue a blocked reward — it can recalibrate with time and skills.`;
  }

  if (medType === "methadone") {
    if (medStatus === "taken_on_time") {
      return `Patient is on methadone with on-time dosing. Full mu-opioid agonist maintenance supports stability; cravings can still occur from context and conditioning.`;
    }
    if (medStatus === "missed") {
      return `Patient missed methadone. Withdrawal risk is serious; encourage contacting their clinic or prescriber as soon as possible for medical guidance, while staying with grounding steps in this app.`;
    }
    if (medStatus === "taken_late") {
      return `Patient took methadone late; levels may be uneven. Validate discomfort and keep focus on present-moment regulation alongside their clinical plan.`;
    }
    return `Patient is on methadone; medication timing context is mixed or not applicable for narration — stay skills-forward.`;
  }

  return `Patient indicated no MOUD/naltrexone for this profile, or prefers not to frame the session around medication. Center mindfulness, values, and safety without inventing pharmacology.`;
}

export function buildMedAcknowledgmentPrompt(intake: IntakeData): string {
  const medContext = getMedContext(intake);
  return `The patient just started a craving session with these details:
- Craving intensity: ${intake.intensity}/10
- Trigger category: ${intake.trigger}
- Medication type: ${intake.medType}
- Medication status today: ${intake.medStatus}

${medContext}

Write a medication-aware acknowledgment (2–3 short paragraphs) that:
1. Names what their medication is doing right now pharmacologically, in plain language.
2. Reframes the craving intensity in light of their medication status without minimizing their experience.
3. Ends with a gentle transition into the body scan.

Do not use bullet points. Write in flowing, conversational prose.`;
}

export function buildBodyScanPrompt(
  intake: IntakeData,
  bodyLocation: BodyRegion,
): string {
  const medContext = getMedContext(intake);
  return `The patient selected this body region for attention: ${bodyLocation}.

Session context:
- Starting intensity: ${intake.intensity}/10
- Trigger: ${intake.trigger}
- Medication: ${intake.medType}, status: ${intake.medStatus}

${medContext}

Write 2–3 short paragraphs of guided attention for that region: breath, sensation labels, and permission to notice without fixing. Use the region name naturally. No bullet points.`;
}

export function buildWavePhasePrompt(
  intake: IntakeData,
  phase: WavePhase,
  currentIntensity: number,
): string {
  const medContext = getMedContext(intake);
  const phaseLine =
    phase === "rising"
      ? "The urge is building — the wave is rising."
      : phase === "peak"
        ? "The patient is at the peak of the wave."
        : "The wave is falling; intensity may soften.";

  return `You are narrating a live urge-surfing moment.

Phase: ${phase}. ${phaseLine}
Their live intensity slider reads ${currentIntensity}/10 (started at ${intake.intensity}/10).
Trigger: ${intake.trigger}. Medication: ${intake.medType}, status: ${intake.medStatus}.

${medContext}

Write 2–3 short paragraphs of in-the-moment coaching: breath, curiosity toward sensations, and riding the wave without fighting it. No bullet points.`;
}

export function buildReflectionPrompt(
  intake: IntakeData,
  sessions: SessionLog[],
  intensityEnd: number,
): string {
  const recent = [...sessions]
    .filter((s) => s.completed && s.intensityEnd != null)
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )
    .slice(0, 30);

  const lines = recent.map((s, i) => {
    return `${i + 1}. ${s.startedAt.slice(0, 10)} start ${s.intensityStart}→end ${s.intensityEnd} trigger ${s.trigger} med ${s.medStatus}`;
  });

  const summary =
    recent.length >= 5
      ? `There are at least five past sessions; you may note any medication–craving patterns you see in the list, cautiously and without overclaiming.`
      : `There are fewer than five past sessions; avoid strong statistical claims.`;

  return `Today's session started at intensity ${intake.intensity}/10 and ended around ${intensityEnd}/10. Trigger: ${intake.trigger}. Medication today: ${intake.medStatus} (${intake.medType}).

Recent completed sessions (most recent first):
${lines.length ? lines.join("\n") : "No prior completed sessions logged."}

${summary}

Write a warm closing reflection (2–4 short paragraphs): celebrate effort, name one pattern worth noticing if appropriate, and offer one concrete next action for the next hour. No bullet points.`;
}

export type SessionPromptExtra = {
  bodyLocation?: BodyRegion;
  phase?: WavePhase;
  currentIntensity?: number;
  intensityEnd?: number;
};

export function buildPromptForStep(
  step: SessionApiStep,
  intake: IntakeData,
  sessionHistory: SessionLog[],
  extra: SessionPromptExtra,
): string {
  switch (step) {
    case "med_ack":
      return buildMedAcknowledgmentPrompt(intake);
    case "body_scan": {
      if (!extra.bodyLocation) {
        throw new Error("body_scan requires bodyLocation");
      }
      return buildBodyScanPrompt(intake, extra.bodyLocation);
    }
    case "wave_phase": {
      if (!extra.phase || extra.currentIntensity == null) {
        throw new Error("wave_phase requires phase and currentIntensity");
      }
      return buildWavePhasePrompt(
        intake,
        extra.phase,
        extra.currentIntensity,
      );
    }
    case "reflection": {
      const end = extra.intensityEnd ?? intake.intensity;
      return buildReflectionPrompt(intake, sessionHistory, end);
    }
    default: {
      const _exhaustive: never = step;
      return _exhaustive;
    }
  }
}

export function extractTextContent(
  content: { type: string; text?: string }[],
): string {
  const block = content.find((c) => c.type === "text");
  return block && "text" in block && typeof block.text === "string"
    ? block.text
    : "";
}
