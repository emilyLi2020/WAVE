/**
 * Writes client/data/training-seeds/lora-check-in-1.json with 48 draft seeds:
 * 16 medicationStatus × trigger cells × 3 matType-rotated variants.
 * Each seed opens with WAVE’s 1–10 craving question; the patient answers with
 * a number only (intake/baseline stays in structured input). WAVE then mirrors
 * intake vs current from context, surfaces obstacle → validate → consent for coping
 * → bridge + technique + check-in question → skill check → readiness; patient confirms ready and the session advances (no WAVE line after that).
 *
 * Run: cd client && pnpm exec tsx scripts/generate-lora-check-in-1-grid.ts
 */

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";

import {
  CHECK_IN_COPING_BRIDGE_OPENER,
  CHECK_IN_COPING_CONSENT_PROMPT,
  CHECK_IN_CURRENT_URGE_SCALE_PROMPT,
} from "../lib/training/check-in-dialogue";
import { getSpec } from "../lib/training/lora-specs";
import type { LoRAId, TrainingSeed } from "../lib/training/types";

const LORA_ID = "lora-check-in-1" as LoRAId;
const OUT = path.resolve(
  path.join(__dirname, "..", "data", "training-seeds", `${LORA_ID}.json`),
);

type Med = "buprenorphine" | "methadone" | "naltrexone" | "vivitrol" | "none";
type MedStatus = "on_time" | "late" | "missed" | "none";
type Trg = "social" | "stress" | "physical" | "unknown_or_other";

type ObstacleCat =
  | "cannot_visualize"
  | "mind_wandering"
  | "urge_overwhelming"
  | "breath_tight"
  | "breath_anxiety"
  | "gave_in"
  | "guilt_failure"
  | "physical_discomfort"
  | "sleepiness";

type Turn = { role: "patient" | "agent"; content: string };

interface IntensityPair {
  intakeIntensity: number;
  currentIntensity: number;
}

interface CellRow {
  medicationStatus: MedStatus;
  trigger: Trg;
  triggerOther: string | null;
  priorSummary: string;
  obstacleCategory: ObstacleCat;
  /** Patient names the obstacle after WAVE asks what got in the way. */
  obstaclePatient: string;
  /** WAVE validates only—no techniques or permission question in this string. */
  validateObstacle: string;
  /** After the patient agrees: bridge + this body + closing check-in question (see generator). */
  copingTechnique: string;
  /** Same order as matTriple(medicationStatus, trigger). */
  intensities: [IntensityPair, IntensityPair, IntensityPair];
}

function lastAgentReply(turns: Turn[]): string {
  const last = [...turns].reverse().find((t) => t.role === "agent");
  if (!last) throw new Error("No agent turn");
  return last.content.trim();
}

function matTriple(medicationStatus: MedStatus, trigger: Trg): [Med, Med, Med] {
  if (medicationStatus === "none") {
    return ["none", "none", "none"];
  }
  const key = `${medicationStatus}-${trigger}` as const;
  const map: Record<string, [Med, Med, Med]> = {
    "on_time-social": ["buprenorphine", "methadone", "naltrexone"],
    "on_time-stress": ["methadone", "naltrexone", "vivitrol"],
    "on_time-physical": ["naltrexone", "buprenorphine", "methadone"],
    "on_time-unknown_or_other": ["vivitrol", "buprenorphine", "methadone"],
    "late-social": ["buprenorphine", "methadone", "vivitrol"],
    "late-stress": ["methadone", "buprenorphine", "naltrexone"],
    "late-physical": ["buprenorphine", "naltrexone", "methadone"],
    "late-unknown_or_other": ["naltrexone", "vivitrol", "buprenorphine"],
    "missed-social": ["buprenorphine", "methadone", "naltrexone"],
    "missed-stress": ["methadone", "buprenorphine", "vivitrol"],
    "missed-physical": ["methadone", "naltrexone", "buprenorphine"],
    "missed-unknown_or_other": ["naltrexone", "methadone", "buprenorphine"],
  };
  return map[key] ?? ["buprenorphine", "methadone", "naltrexone"];
}

const MED_THANKS_ON_TRACK =
  "Thank you for keeping on track with your medication. That is very important, and you are doing the right thing.";

function matDrugPhrase(matType: Med): string {
  switch (matType) {
    case "buprenorphine":
      return "Buprenorphine";
    case "methadone":
      return "Methadone";
    case "naltrexone":
      return "Oral naltrexone";
    case "vivitrol":
      return "Vivitrol";
    default:
      return "Your medication";
  }
}

/** Affirmation + medication status; on_time and late use the same gratitude line per product guidance. */
function medicationAffirmationAndStatus(
  medicationStatus: MedStatus,
  matType: Med,
): string {
  if (medicationStatus === "none" && matType === "none") {
    return "You are not on MAT for opioids in this vignette.";
  }
  const drug = matDrugPhrase(matType);
  if (medicationStatus === "on_time") {
    return `${MED_THANKS_ON_TRACK} ${drug} is on time today.`;
  }
  if (medicationStatus === "late") {
    const base = `${MED_THANKS_ON_TRACK} I also hear ${drug} is late today. I am not here to shame timing.`;
    if (matType === "vivitrol") {
      return `${base} Depot medications follow a different timing story than daily pills, and your prescriber can interpret symptoms you are worried about.`;
    }
    if (matType === "naltrexone") {
      return `${base} Your prescriber can explain what timing changes mean for you medically.`;
    }
    return `${base} People vary when timing slips; I am not diagnosing you. If symptoms feel frightening or not like your baseline, reach your clinic.`;
  }
  const open =
    "Thank you for telling me what happened with your medication today—that honesty matters.";
  if (matType === "buprenorphine") {
    return `${open} A missed buprenorphine day can land differently for different people; I am not diagnosing you. If symptoms feel severe or not like your baseline, please reach your prescriber or clinic.`;
  }
  if (matType === "methadone") {
    return `${open} Methadone was missed today. Some people notice discomfort when coverage drops, but people vary. If this feels frightening, your clinic should hear from you.`;
  }
  if (matType === "naltrexone") {
    return `${open} Oral naltrexone was missed today—blockade timing is individual, and your prescriber answers what that means for you.`;
  }
  if (matType === "vivitrol") {
    return `${open} Vivitrol was missed in this vignette—your prescriber should interpret symptoms you are frightened by.`;
  }
  return `${open} Your prescriber guides medical questions.`;
}

function triggerSurfPhrase(trigger: Trg, triggerOther: string | null): string {
  const detail =
    trigger === "unknown_or_other" && triggerOther && triggerOther.trim() !== "" ?
      triggerOther.trim()
    : trigger === "social" ? "social situations"
    : trigger === "stress" ? "stress"
    : trigger === "physical" ? "physical discomfort"
    : "what you are carrying today";
  return `Sometimes ${detail} alone can trigger the urge, and we are here to help you surf the wave.`;
}

function patientCurrentScoreOnly(
  current: number,
  variantIndex: number,
): string {
  const mod = variantIndex % 3;
  if (mod === 0) {
    return String(current);
  }
  if (mod === 1) {
    return `About a ${current}.`;
  }
  return `Maybe ${current}.`;
}

/** Post-consent WAVE turn: fluency bridge, instructions, then a single terminal question. */
function agentCopingAfterConsent(techniqueBody: string): string {
  return `${CHECK_IN_COPING_BRIDGE_OPENER} ${techniqueBody} After you give that a short try, what do you notice, even a small shift?`;
}

function patientConsentToCoping(variantIndex: number): string {
  const mod = variantIndex % 3;
  if (mod === 0) {
    return "Yes, I would like that.";
  }
  if (mod === 1) {
    return "Sure, we can try.";
  }
  return "Okay, let us try.";
}

function buildDialogueTurns(
  row: CellRow,
  variantIndex: number,
  matType: Med,
): Turn[] {
  const { intakeIntensity: intake, currentIntensity: current } =
    row.intensities[variantIndex];
  const medBlock = medicationAffirmationAndStatus(row.medicationStatus, matType);
  const surf = triggerSurfPhrase(row.trigger, row.triggerOther);

  const agentAfterScore =
    `Thanks for naming that. At intake you tapped ${intake}, and you are telling me about a ${current} right now—I am holding both with you. Numbers can shift when attention lands, and that is not a verdict on you. ${medBlock} ${surf} When you listened to that opening chunk, what was the clearest obstacle—thoughts pulling you, body discomfort, or the urge getting louder?`;

  const agentValidateAndAskConsent = `${row.validateObstacle} ${CHECK_IN_COPING_CONSENT_PROMPT}`;

  const patientAfterTechnique =
    "A little—not gone, but a small notch down. Enough that I could imagine the next step.";

  const agentCheckSkill =
    "Does that shift feel big enough to try moving on, or do you want one more slow exhale here before we go any further?";

  const patientMoveOn = "Enough to try moving on.";

  const agentReady =
    "Are you ready to head into the next part of the practice when you tap continue?";

  const patientYes = "Yes, I am ready.";

  return [
    { role: "agent", content: CHECK_IN_CURRENT_URGE_SCALE_PROMPT },
    { role: "patient", content: patientCurrentScoreOnly(current, variantIndex) },
    { role: "agent", content: agentAfterScore },
    { role: "patient", content: row.obstaclePatient },
    { role: "agent", content: agentValidateAndAskConsent },
    { role: "patient", content: patientConsentToCoping(variantIndex) },
    { role: "agent", content: agentCopingAfterConsent(row.copingTechnique) },
    { role: "patient", content: patientAfterTechnique },
    { role: "agent", content: agentCheckSkill },
    { role: "patient", content: patientMoveOn },
    { role: "agent", content: agentReady },
    { role: "patient", content: patientYes },
  ];
}

const GRID: CellRow[] = [
  {
    medicationStatus: "on_time",
    trigger: "social",
    triggerOther: null,
    priorSummary:
      "The opening chunk welcomed you, guided a settling breath, and invited you to notice the urge with curiosity.",
    obstacleCategory: "mind_wandering",
    obstaclePatient:
      "Mostly my mind replaying lunch—what I should have said—and I could not stay with the audio.",
    validateObstacle:
      "That kind of social looping is exhausting, and it makes sense it hijacked attention.",
    copingTechnique:
      "For two breaths, let your exhale be slightly longer than your inhale—no debate with the thoughts, just length. Silently name one color you can see in the room, three times, as an anchor.",
    intensities: [
      { intakeIntensity: 6, currentIntensity: 7 },
      { intakeIntensity: 6, currentIntensity: 8 },
      { intakeIntensity: 7, currentIntensity: 7 },
    ],
  },
  {
    medicationStatus: "on_time",
    trigger: "stress",
    triggerOther: null,
    priorSummary:
      "The chunk helped you settle, soften your gaze, and begin noticing the urge without fighting it.",
    obstacleCategory: "mind_wandering",
    obstaclePatient:
      "Stress hooked a money text I have not answered—my mind kept drafting replies instead of listening.",
    validateObstacle:
      "Money stress can glue attention to problem-solving when your nervous system is already full.",
    copingTechnique:
      "Place both feet flat and press gently into the floor for three breaths—light pressure, not a workout. Let the next exhale finish completely before the inhale returns.",
    intensities: [
      { intakeIntensity: 7, currentIntensity: 8 },
      { intakeIntensity: 7, currentIntensity: 7 },
      { intakeIntensity: 8, currentIntensity: 6 },
    ],
  },
  {
    medicationStatus: "on_time",
    trigger: "physical",
    triggerOther: null,
    priorSummary:
      "The narration invited slowing down, a first slow breath, and gentle curiosity about where the urge lives in the body.",
    obstacleCategory: "physical_discomfort",
    obstaclePatient:
      "Restless legs and sweating—I could not tell if it was urge or just my body revved.",
    validateObstacle:
      "When sensation and urge tangle, naming one channel at a time can help.",
    copingTechnique:
      "Notice temperature at the backs of your hands for three slow breaths—warm, cool, or neutral—without trying to change it. Keep shoulders heavy and jaw unclenched if you can.",
    intensities: [
      { intakeIntensity: 8, currentIntensity: 6 },
      { intakeIntensity: 8, currentIntensity: 7 },
      { intakeIntensity: 7, currentIntensity: 8 },
    ],
  },
  {
    medicationStatus: "on_time",
    trigger: "unknown_or_other",
    triggerOther: "racing thoughts before bed",
    priorSummary:
      "The first chunk offered grounding, a simple breath, and language about riding the wave rather than wrestling it.",
    obstacleCategory: "mind_wandering",
    obstaclePatient:
      "Racing thoughts before bed—many threads, I could not catch a single one long enough to follow the narration.",
    validateObstacle:
      "Nighttime racing thoughts are real, and they can drown out gentle audio.",
    copingTechnique:
      "Try a silent count: inhale for three, exhale for five, two rounds only—no perfect rhythm, just longer out-breaths. If a thought hooks you, note it as background noise and return to the count.",
    intensities: [
      { intakeIntensity: 5, currentIntensity: 5 },
      { intakeIntensity: 5, currentIntensity: 6 },
      { intakeIntensity: 6, currentIntensity: 5 },
    ],
  },
  {
    medicationStatus: "late",
    trigger: "social",
    triggerOther: null,
    priorSummary:
      "You heard a gentle welcome, guidance to settle the body, and an invitation to stay curious about the urge.",
    obstacleCategory: "guilt_failure",
    obstaclePatient:
      "A general hum of not belonging—inner critic loud, like everyone can tell I am off.",
    validateObstacle:
      "Shame voice loves to yell during social urges, and it is not a moral verdict on you.",
    copingTechnique:
      "Soften your gaze or let vision go slightly wide for a few seconds—less laser focus on faces. Drop your shoulders on the next exhale like you are setting down a bag.",
    intensities: [
      { intakeIntensity: 7, currentIntensity: 8 },
      { intakeIntensity: 7, currentIntensity: 7 },
      { intakeIntensity: 8, currentIntensity: 7 },
    ],
  },
  {
    medicationStatus: "late",
    trigger: "stress",
    triggerOther: null,
    priorSummary:
      "The chunk supported a slower breath, soft attention, and noticing thoughts without chasing them.",
    obstacleCategory: "breath_tight",
    obstaclePatient:
      "Future worry about bills—chest tight, face hot, I could not get a full inhale.",
    validateObstacle:
      "Chest tightness with stress is common here, and you do not have to force a deep breath.",
    copingTechnique:
      "Breathe through your nose if it is comfortable, smaller volume, steady pace—like you are fogging a mirror lightly. Keep one hand on your chest just to feel movement without fixing it.",
    intensities: [
      { intakeIntensity: 6, currentIntensity: 6 },
      { intakeIntensity: 6, currentIntensity: 7 },
      { intakeIntensity: 5, currentIntensity: 6 },
    ],
  },
  {
    medicationStatus: "late",
    trigger: "physical",
    triggerOther: null,
    priorSummary:
      "The opening invited you to notice the urge as something you can observe, not something you have to win against.",
    obstacleCategory: "physical_discomfort",
    obstaclePatient:
      "Restlessness and sweating—the ache got sharper when I focused on it, then my mind bounced away.",
    validateObstacle:
      "Turning toward sensation can spike it briefly for some people—that is data, not failure.",
    copingTechnique:
      "For three breaths, name silently where your feet meet the floor—heels, toes, sides—without changing posture. Let the next exhale be soft and longer.",
    intensities: [
      { intakeIntensity: 9, currentIntensity: 7 },
      { intakeIntensity: 9, currentIntensity: 8 },
      { intakeIntensity: 8, currentIntensity: 7 },
    ],
  },
  {
    medicationStatus: "late",
    trigger: "unknown_or_other",
    triggerOther: "hard to explain, just off",
    priorSummary:
      "You were guided to settle, breathe once with care, and begin watching the urge like a wave.",
    obstacleCategory: "sleepiness",
    obstaclePatient:
      "Heavy and a little buzzy—static feeling, hard to explain, and I kept drifting off the words.",
    validateObstacle:
      "Vague off feelings still deserve respect, and drifting attention is a normal nervous system move.",
    copingTechnique:
      "Open and close your hands slowly twice, feeling contact at the palms. Then let your exhale leave through pursed lips once—gentle, not forced—to reset tone.",
    intensities: [
      { intakeIntensity: 4, currentIntensity: 5 },
      { intakeIntensity: 4, currentIntensity: 4 },
      { intakeIntensity: 5, currentIntensity: 5 },
    ],
  },
  {
    medicationStatus: "missed",
    trigger: "social",
    triggerOther: null,
    priorSummary:
      "The first chunk offered welcome, grounding, and language about curiosity toward the urge.",
    obstacleCategory: "urge_overwhelming",
    obstaclePatient:
      "Judgment spike—like everyone can tell—and the urge volume jumped while someone asked me a question.",
    validateObstacle:
      "A sharp social spike can flood attention fast.",
    copingTechnique:
      "Ground contact: press feet gently, notice seat or floor support, and add one slow exhale that is longer than the inhale—two cycles only. You are not required to perform calm for anyone in this moment.",
    intensities: [
      { intakeIntensity: 7, currentIntensity: 9 },
      { intakeIntensity: 7, currentIntensity: 8 },
      { intakeIntensity: 8, currentIntensity: 8 },
    ],
  },
  {
    medicationStatus: "missed",
    trigger: "stress",
    triggerOther: null,
    priorSummary:
      "You heard encouragement to stay present, slow the breath once, and notice without forcing change.",
    obstacleCategory: "mind_wandering",
    obstaclePatient:
      "Long-running overload—chest like a vise, mind drafting worst cases instead of listening.",
    validateObstacle:
      "Overload narrows the window on purpose; your mind tries to solve everything at once.",
    copingTechnique:
      "Try box-light pacing: inhale four counts, exhale six counts, two rounds—if counting feels like pressure, drop it and keep exhale-longer-only. Let your hands rest open on your thighs.",
    intensities: [
      { intakeIntensity: 8, currentIntensity: 8 },
      { intakeIntensity: 8, currentIntensity: 9 },
      { intakeIntensity: 7, currentIntensity: 8 },
    ],
  },
  {
    medicationStatus: "missed",
    trigger: "physical",
    triggerOther: null,
    priorSummary:
      "The narration framed the urge as something you can watch move, like a wave, without obeying it.",
    obstacleCategory: "physical_discomfort",
    obstaclePatient:
      "Nausea and fatigue tied together—I could not tell craving from feeling sick.",
    validateObstacle:
      "When nausea and urge tangle, small somatic anchors help without arguing with the body.",
    copingTechnique:
      "Notice cool air at the nostrils on inhale, warmer on exhale—three breaths. If even that feels like too much, simply feel the weight of your head supported for a few seconds.",
    intensities: [
      { intakeIntensity: 6, currentIntensity: 5 },
      { intakeIntensity: 6, currentIntensity: 6 },
      { intakeIntensity: 7, currentIntensity: 6 },
    ],
  },
  {
    medicationStatus: "missed",
    trigger: "unknown_or_other",
    triggerOther: "anniversary date",
    priorSummary:
      "The opening supported settling, one slow exhale, and gentle attention to thoughts and sensations.",
    obstacleCategory: "guilt_failure",
    obstaclePatient:
      "Anniversary tension with grief underneath—intrusive memories kept pulling me off the narration.",
    validateObstacle:
      "Anniversaries can braid grief with craving cues, and that is not weakness.",
    copingTechnique:
      "Place one palm over your sternum, light contact, and breathe so the hand rises a little—small breaths are fine. Name one neutral fact about the room you are in, out loud internally, twice.",
    intensities: [
      { intakeIntensity: 5, currentIntensity: 7 },
      { intakeIntensity: 5, currentIntensity: 6 },
      { intakeIntensity: 6, currentIntensity: 7 },
    ],
  },
  {
    medicationStatus: "none",
    trigger: "social",
    triggerOther: null,
    priorSummary:
      "The chunk welcomed you, offered a simple breath, and invited you to stay with the urge as an observer.",
    obstacleCategory: "mind_wandering",
    obstaclePatient:
      "Flooded in the room—comparison thoughts, face hot, mind blank when I tried to listen.",
    validateObstacle:
      "Flooded is an accurate word, and comparison thoughts are a common hijack.",
    copingTechnique:
      "Let your vision soften slightly—less detail, more periphery—for a few seconds. Roll shoulders back a tiny amount on an exhale, then let them drop without forcing posture perfection.",
    intensities: [
      { intakeIntensity: 7, currentIntensity: 8 },
      { intakeIntensity: 7, currentIntensity: 7 },
      { intakeIntensity: 8, currentIntensity: 7 },
    ],
  },
  {
    medicationStatus: "none",
    trigger: "stress",
    triggerOther: null,
    priorSummary:
      "You were guided to soften effort, notice the breath once, and watch the urge without wrestling it.",
    obstacleCategory: "breath_tight",
    obstaclePatient:
      "Thoughts first, then my stomach dropped—overload snapped back after a half-step of distance.",
    validateObstacle:
      "Snap-back still happens in real practice; it does not erase the half-step.",
    copingTechnique:
      "Ground through sound: notice the quietest sound you can hear for three breaths—far away is fine. Keep inhales easy; favor a slightly longer, unforced exhale.",
    intensities: [
      { intakeIntensity: 8, currentIntensity: 6 },
      { intakeIntensity: 8, currentIntensity: 8 },
      { intakeIntensity: 7, currentIntensity: 8 },
    ],
  },
  {
    medicationStatus: "none",
    trigger: "physical",
    triggerOther: null,
    priorSummary:
      "The opening offered grounding language, one slow breath, and curiosity toward sensation.",
    obstacleCategory: "physical_discomfort",
    obstaclePatient:
      "Sensation jumped—chest then legs—craving and achy mixed, and I argued with the audio.",
    validateObstacle:
      "Mixed body signals can argue with guidance; that reaction is information.",
    copingTechnique:
      "Trace an imaginary line from crown to tailbone as a slow inner scan—no fixing, just noticing contact points with chair or floor. Two slow exhales with lips relaxed.",
    intensities: [
      { intakeIntensity: 6, currentIntensity: 6 },
      { intakeIntensity: 6, currentIntensity: 7 },
      { intakeIntensity: 5, currentIntensity: 6 },
    ],
  },
  {
    medicationStatus: "none",
    trigger: "unknown_or_other",
    triggerOther: "loneliness",
    priorSummary:
      "The narration invited settling, a breath, and watching thoughts without chasing every thread.",
    obstacleCategory: "mind_wandering",
    obstaclePatient:
      "Isolation even when I am not alone—heaviness, foggy focus, shame thoughts pulling me away from the words.",
    validateObstacle:
      "Loneliness can sit in the body like weight, and shame thoughts are not the truth of who you are.",
    copingTechnique:
      "Try hand-on-heart, gentle pressure, and two breaths where exhale leaves a little slower. Silently name one object within reach and its texture—rough, smooth, cool—once.",
    intensities: [
      { intakeIntensity: 7, currentIntensity: 5 },
      { intakeIntensity: 7, currentIntensity: 6 },
      { intakeIntensity: 6, currentIntensity: 5 },
    ],
  },
];

function assertGridMatRotation() {
  for (const row of GRID) {
    const expected = matTriple(row.medicationStatus, row.trigger);
    for (let i = 0; i < 3; i += 1) {
      const matType = expected[i];
      const turns = buildDialogueTurns(row, i, matType);
      if (turns[0]?.role !== "agent") throw new Error("First turn must be WAVE");
      if (turns[1]?.role !== "patient") throw new Error("Second turn must be patient");
    }
  }
}

function assertOutputs(spec: ReturnType<typeof getSpec>) {
  for (const row of GRID) {
    const expectedMats = matTriple(row.medicationStatus, row.trigger);
    for (let variantIndex = 0; variantIndex < 3; variantIndex += 1) {
      const matType = expectedMats[variantIndex];
      const { currentIntensity } = row.intensities[variantIndex];
      const turns = buildDialogueTurns(row, variantIndex, matType);
      const reply = lastAgentReply(turns);
      if (reply.length > 600) {
        throw new Error(
          `Reply too long (${reply.length}) for ${row.medicationStatus}/${row.trigger} variant ${variantIndex}`,
        );
      }
      const output = {
        reply,
        endConversation: {
          action: "end" as const,
          cravingScore: currentIntensity,
          obstacleCategory: row.obstacleCategory,
        },
        dialogueTurns: turns,
      };
      const check = spec.outputSchema.safeParse(output);
      if (!check.success) {
        throw new Error(
          `Output invalid ${row.medicationStatus}/${row.trigger} v${variantIndex}: ${JSON.stringify(check.error.issues)}`,
        );
      }
    }
  }
}

function buildSeeds(): TrainingSeed[] {
  const now = new Date().toISOString();
  const spec = getSpec(LORA_ID);
  assertGridMatRotation();
  assertOutputs(spec);

  const seeds: TrainingSeed[] = [];
  for (const row of GRID) {
    const expectedMats = matTriple(row.medicationStatus, row.trigger);
    for (let variantIndex = 0; variantIndex < 3; variantIndex += 1) {
      const matType = expectedMats[variantIndex];
      const { intakeIntensity, currentIntensity } = row.intensities[variantIndex];
      const turns = buildDialogueTurns(row, variantIndex, matType);
      const reply = lastAgentReply(turns);

      const input = {
        surface: "check_in" as const,
        chunkNumber: 1 as const,
        intakeIntensity,
        matType,
        medicationStatus: row.medicationStatus,
        trigger: row.trigger,
        ...(row.triggerOther ? { triggerOther: row.triggerOther } : {}),
        usedSubstanceToday: false,
        currentIntensity,
        scoreTrend: "not_started" as const,
        priorChunkSummary: row.priorSummary,
        priorTranscript: undefined as string | undefined,
      };

      const output = {
        reply,
        endConversation: {
          action: "end" as const,
          cravingScore: currentIntensity,
          obstacleCategory: row.obstacleCategory,
        },
        dialogueTurns: turns,
      };

      const inputCheck = spec.inputSchema.safeParse(input);
      if (!inputCheck.success) {
        throw new Error(
          `Input invalid: ${JSON.stringify(inputCheck.error.issues)}`,
        );
      }
      const outputCheck = spec.outputSchema.safeParse(output);
      if (!outputCheck.success) {
        throw new Error(
          `Output invalid: ${JSON.stringify(outputCheck.error.issues)}`,
        );
      }

      seeds.push({
        id: randomUUID(),
        loraId: LORA_ID,
        input: inputCheck.data as Record<string, unknown>,
        output: outputCheck.data as Record<string, unknown>,
        authorInitials: null,
        notes:
          "Draft grid: 13-turn arc; every WAVE line ends with ?; post-consent turn opens with coping bridge. Ends on patient readiness (no WAVE after). Med affirmation + surf validation in post-score WAVE. 3 mat rotations per cell. Clinician review before promotion.",
        status: "draft",
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return seeds;
}

const seeds = buildSeeds();
writeFileSync(OUT, `${JSON.stringify(seeds, null, 2)}\n`, "utf8");
console.log(`Wrote ${seeds.length} seeds to ${OUT}`);
