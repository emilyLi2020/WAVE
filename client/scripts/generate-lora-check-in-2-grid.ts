/**
 * Writes client/data/training-seeds/lora-check-in-2.json with 48 draft seeds:
 * 16 medicationStatus × trigger cells × 3 matType-rotated variants (same grid as
 * check-in 1). Check-in 2 follows PRD: Turn 1 is CHECK_IN_CHUNK2_SCORE_PROMPT;
 * after the score, WAVE uses score reflection vs the prior check-in score, then
 * CHECK_IN_CHUNK2_LANDING_SECTION_PROMPT only; after the patient answers, WAVE says
 * Great or validates, then CHECK_IN_BODY_URGE_LOCATION_OBSERVE_PROMPT; then
 * validate → consent → coping bridge → readiness for the sound anchor.
 *
 * Run: cd client && pnpm exec tsx scripts/generate-lora-check-in-2-grid.ts
 */

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { fillScoreReflection } from "../lib/session/score-tracking";
import {
  CHECK_IN_BODY_URGE_LOCATION_OBSERVE_PROMPT,
  CHECK_IN_CHUNK2_LANDING_SECTION_PROMPT,
  CHECK_IN_CHUNK2_READINESS_PROMPT,
  CHECK_IN_CHUNK2_SCORE_PROMPT,
  CHECK_IN_COPING_BRIDGE_OPENER,
  CHECK_IN_COPING_CONSENT_PROMPT,
} from "../lib/training/check-in-dialogue";
import { getSpec } from "../lib/training/lora-specs";
import type { LoRAId, TrainingSeed } from "../lib/training/types";

const LORA_ID = "lora-check-in-2" as LoRAId;
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
  /** Patient answers whether they could locate the urge in the body (Turn 2 opener path). */
  bodyLocatePatient: string;
  /** WAVE validates somatic/struggle content only—no techniques here. */
  validateBody: string;
  /** After the patient agrees: bridge + this body + closing check-in question (see generator). */
  copingTechnique: string;
  /** Same order as matTriple(medicationStatus, trigger). */
  intensities: [IntensityPair, IntensityPair, IntensityPair];
}

function intensityTriple(
  pair: IntensityPair,
  variantIndex: number,
): {
  intakeIntensity: number;
  priorCheckInScore: number;
  currentIntensity: number;
} {
  const priorCheckInScore = pair.currentIntensity;
  const bump = variantIndex === 0 ? 0 : variantIndex === 1 ? 1 : -1;
  const currentIntensity = Math.min(
    10,
    Math.max(1, priorCheckInScore + bump),
  );
  return {
    intakeIntensity: pair.intakeIntensity,
    priorCheckInScore,
    currentIntensity,
  };
}

function scoreTrendForTraining(
  prior: number,
  current: number,
): "rising" | "falling" | "flat" | "mixed" {
  if (current < prior) return "falling";
  if (current > prior) return "rising";
  if (current === prior) return "flat";
  return "mixed";
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

const LANDING_ALL_CLEAR_PHRASES = [
  "No concerns, it felt steady enough.",
  "No, nothing major, it landed fine.",
  "Fine, no real questions.",
] as const;

const LANDING_FRICTION_BY_OBSTACLE: Record<
  ObstacleCat,
  { patient: string; agentLead: string }
> = {
  cannot_visualize: {
    patient: "I could not really picture the last part, it went fuzzy.",
    agentLead:
      "When imagery drops out near the close, that is a normal nervous system move, not a failure.",
  },
  mind_wandering: {
    patient: "My mind kept wandering in the last minutes of the scan.",
    agentLead:
      "Mind wandering near the close is really common, and it does not erase what you already practiced.",
  },
  urge_overwhelming: {
    patient: "The urge spiked right as the guidance slowed down at the end.",
    agentLead:
      "A late spike can show up when the pacing shifts; you are still allowed to stay curious instead of fighting it.",
  },
  breath_tight: {
    patient: "My chest felt tight during the landing lines.",
    agentLead:
      "Chest tightness at the end of a scan is something a lot of people notice; you do not have to force calm.",
  },
  breath_anxiety: {
    patient: "Focusing on the close made my breath feel jumpy.",
    agentLead:
      "Breath anxiety at the tail of a practice is real, and you can keep the next step gentle.",
  },
  gave_in: {
    patient: "I almost checked out completely for the last bit.",
    agentLead:
      "Checking out for a slice of the close still counts as staying in the room with yourself.",
  },
  guilt_failure: {
    patient: "I felt like I messed up the ending because I was not perfect.",
    agentLead:
      "Perfection is not the goal here; shame voice is loud for a lot of people at the close.",
  },
  physical_discomfort: {
    patient: "My body felt restless and achy as it wrapped up.",
    agentLead:
      "Restlessness at the wrap-up is information, not proof you did it wrong.",
  },
  sleepiness: {
    patient: "I got heavy and foggy right at the end.",
    agentLead:
      "Sleepy-heavy near the close happens often; your system may be down-shifting.",
  },
};

function buildDialogueTurns(row: CellRow, variantIndex: number): Turn[] {
  const triple = intensityTriple(row.intensities[variantIndex], variantIndex);
  const { priorCheckInScore: prior, currentIntensity: current } = triple;

  const scoreClause = fillScoreReflection(
    "[score reflection]",
    [prior, current],
    2,
  ).trim();

  const landingClear = variantIndex % 2 === 0;
  const patientLandingReply = landingClear
    ? LANDING_ALL_CLEAR_PHRASES[variantIndex % LANDING_ALL_CLEAR_PHRASES.length]
    : LANDING_FRICTION_BY_OBSTACLE[row.obstacleCategory].patient;

  const agentAfterLanding = landingClear
    ? `Great. ${CHECK_IN_BODY_URGE_LOCATION_OBSERVE_PROMPT}`
    : `${LANDING_FRICTION_BY_OBSTACLE[row.obstacleCategory].agentLead} ${CHECK_IN_BODY_URGE_LOCATION_OBSERVE_PROMPT}`;

  const agentLandingOnly =
    `Thanks for naming that. ${scoreClause} ${CHECK_IN_CHUNK2_LANDING_SECTION_PROMPT}`;

  const agentValidateAndAskConsent = `${row.validateBody} ${CHECK_IN_COPING_CONSENT_PROMPT}`;

  const patientAfterTechnique =
    "A little—not gone, but a small notch down. Enough that I could imagine the next step.";

  const agentCheckSkill =
    "Does that shift feel big enough to try moving on, or do you want one more slow exhale here before we go any further?";

  const patientMoveOn = "Enough to try moving on.";

  const patientYes = "Yes, I am ready.";

  return [
    { role: "agent", content: CHECK_IN_CHUNK2_SCORE_PROMPT },
    { role: "patient", content: patientCurrentScoreOnly(current, variantIndex) },
    { role: "agent", content: agentLandingOnly },
    { role: "patient", content: patientLandingReply },
    { role: "agent", content: agentAfterLanding },
    { role: "patient", content: row.bodyLocatePatient },
    { role: "agent", content: agentValidateAndAskConsent },
    { role: "patient", content: patientConsentToCoping(variantIndex) },
    { role: "agent", content: agentCopingAfterConsent(row.copingTechnique) },
    { role: "patient", content: patientAfterTechnique },
    { role: "agent", content: agentCheckSkill },
    { role: "patient", content: patientMoveOn },
    { role: "agent", content: CHECK_IN_CHUNK2_READINESS_PROMPT },
    { role: "patient", content: patientYes },
  ];
}

const GRID: CellRow[] = [
  {
    medicationStatus: "on_time",
    trigger: "social",
    triggerOther: null,
    priorSummary:
      "The body scan moved slowly from feet upward, invited soft noticing of contact and weight, and asked where the urge felt strongest.",
    obstacleCategory: "mind_wandering",
    bodyLocatePatient:
      "Partly—in my jaw and upper chest, but my mind kept replaying lunch and I kept losing the thread of the scan.",
    validateBody:
      "When social stress meets a body scan, attention can skip between face heat and replay thoughts—that is a normal split focus.",
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
      "The body scan helped you settle through the legs and belly, soften your gaze, and begin noticing the urge without fighting it.",
    obstacleCategory: "mind_wandering",
    bodyLocatePatient:
      "Stress hooked a money text I have not answered—my mind kept drafting replies instead of staying with the body scan.",
    validateBody:
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
      "The body scan invited slowing from the ground up, a first slow breath, and gentle curiosity about where the urge lives in the body.",
    obstacleCategory: "physical_discomfort",
    bodyLocatePatient:
      "Restless legs and sweating—I could not tell if it was urge or just my body revved.",
    validateBody:
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
      "The body scan offered grounding through contact points, a simple breath, and language about riding the wave rather than wrestling it.",
    obstacleCategory: "mind_wandering",
    bodyLocatePatient:
      "Racing thoughts before bed—many threads, I could not catch a single one long enough to stay with the body scan.",
    validateBody:
      "Nighttime racing thoughts are real, and they can drown out slow somatic guidance.",
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
      "The body scan offered a gentle welcome, guidance to feel weight and contact, and an invitation to stay curious about the urge in the torso.",
    obstacleCategory: "guilt_failure",
    bodyLocatePatient:
      "A general hum of not belonging—inner critic loud, like everyone can tell I am off.",
    validateBody:
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
      "The body scan supported a slower breath, soft attention along the midline, and noticing thoughts without chasing them.",
    obstacleCategory: "breath_tight",
    bodyLocatePatient:
      "Future worry about bills—chest tight, face hot, I could not get a full inhale.",
    validateBody:
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
      "The body scan invited you to notice the urge as something you can observe in the chest and belly, not something you have to win against.",
    obstacleCategory: "physical_discomfort",
    bodyLocatePatient:
      "Restlessness and sweating—the ache got sharper when I focused on it, then my mind bounced away.",
    validateBody:
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
      "You were guided to settle through the hips and back, breathe once with care, and begin watching the urge like a wave in the body.",
    obstacleCategory: "sleepiness",
    bodyLocatePatient:
      "Heavy and a little buzzy—static feeling, hard to explain, and I kept drifting off the scan.",
    validateBody:
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
      "The body scan offered welcome, grounding, and language about curiosity toward sensation as you moved upward.",
    obstacleCategory: "urge_overwhelming",
    bodyLocatePatient:
      "Judgment spike—like everyone can tell—and the urge volume jumped while someone asked me a question.",
    validateBody:
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
      "The body scan encouraged staying present, slowing the breath once, and noticing without forcing change.",
    obstacleCategory: "mind_wandering",
    bodyLocatePatient:
      "Long-running overload—chest like a vise, mind drafting worst cases instead of staying with the body scan.",
    validateBody:
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
      "The body scan framed the urge as something you can watch move through the torso and limbs, like a wave, without obeying it.",
    obstacleCategory: "physical_discomfort",
    bodyLocatePatient:
      "Nausea and fatigue tied together—I could not tell craving from feeling sick.",
    validateBody:
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
      "The body scan supported settling, one slow exhale, and gentle attention to thoughts and sensations.",
    obstacleCategory: "guilt_failure",
    bodyLocatePatient:
      "Anniversary tension with grief underneath—intrusive memories kept pulling me off the scan.",
    validateBody:
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
      "The body scan welcomed you, offered a simple breath, and invited you to stay with the urge as an observer in the body.",
    obstacleCategory: "mind_wandering",
    bodyLocatePatient:
      "Flooded in the room—comparison thoughts, face hot, mind blank when I tried to listen.",
    validateBody:
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
      "You were guided to soften effort, notice the breath once, and watch the urge without wrestling it as attention moved through the body.",
    obstacleCategory: "breath_tight",
    bodyLocatePatient:
      "Thoughts first, then my stomach dropped—overload snapped back after a half-step of distance.",
    validateBody:
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
      "The body scan offered grounding language, one slow breath, and curiosity toward sensation from feet to shoulders.",
    obstacleCategory: "physical_discomfort",
    bodyLocatePatient:
      "Sensation jumped—chest then legs—craving and achy mixed, and I argued with the guidance.",
    validateBody:
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
      "The body scan invited settling, a breath, and watching thoughts without chasing every thread.",
    obstacleCategory: "mind_wandering",
    bodyLocatePatient:
      "Isolation even when I am not alone—heaviness, foggy focus, shame thoughts pulling me away from the words.",
    validateBody:
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
    for (let i = 0; i < 3; i += 1) {
      const turns = buildDialogueTurns(row, i);
      if (turns[0]?.role !== "agent") throw new Error("First turn must be WAVE");
      if (turns[1]?.role !== "patient") throw new Error("Second turn must be patient");
    }
  }
}

function assertOutputs(spec: ReturnType<typeof getSpec>) {
  for (const row of GRID) {
    for (let variantIndex = 0; variantIndex < 3; variantIndex += 1) {
      const triple = intensityTriple(row.intensities[variantIndex], variantIndex);
      const { currentIntensity } = triple;
      const turns = buildDialogueTurns(row, variantIndex);
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
      const triple = intensityTriple(row.intensities[variantIndex], variantIndex);
      const { intakeIntensity, currentIntensity } = triple;
      const turns = buildDialogueTurns(row, variantIndex);
      const reply = lastAgentReply(turns);

      const input = {
        surface: "check_in" as const,
        chunkNumber: 2 as const,
        intakeIntensity,
        matType,
        medicationStatus: row.medicationStatus,
        trigger: row.trigger,
        ...(row.triggerOther ? { triggerOther: row.triggerOther } : {}),
        usedSubstanceToday: false,
        currentIntensity,
        scoreTrend: scoreTrendForTraining(
          triple.priorCheckInScore,
          triple.currentIntensity,
        ),
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
          "Draft grid: check-in 2 after body scan; score reflection; landing question then body observe in separate WAVE turns; 14-turn arc; every WAVE line ends with ?; coping bridge after consent; ends on patient readiness. 3 mat rotations per cell. Clinician review before promotion.",
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
