/**
 * Writes data/training-seeds/lora-check-in-4.json with 48 draft seeds (or merges
 * when the file already has exactly one seed: keeps it and appends 47 grid rows).
 *
 * Mirrors check-in-3 stratification: 16 medicationStatus × trigger cells × 3
 * matType-rotated variants. Check-in 4: Turn 1 = CHECK_IN_CHUNK4_SCORE_PROMPT;
 * first post-score WAVE = score reflection vs prior check-in + CHECK_IN_CHUNK4_LANDING_SECTION_PROMPT
 * only; after landing reply, Great./validate + CHECK_IN_CHUNK4_BREATHING_FOLLOW_UP_PROMPT verbatim;
 * validate → consent → coping bridge → CHECK_IN_CHUNK4_READINESS_PROMPT.
 *
 * Run: cd client && pnpm exec tsx scripts/generate-lora-check-in-4-grid.ts
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { fillScoreReflection } from "../lib/session/score-tracking";
import {
  CHECK_IN_CHUNK4_BREATHING_FOLLOW_UP_PROMPT,
  CHECK_IN_CHUNK4_LANDING_SECTION_PROMPT,
  CHECK_IN_CHUNK4_READINESS_PROMPT,
  CHECK_IN_CHUNK4_SCORE_PROMPT,
  CHECK_IN_COPING_BRIDGE_OPENER,
  CHECK_IN_COPING_CONSENT_PROMPT,
} from "../lib/training/check-in-dialogue";
import { getSpec } from "../lib/training/lora-specs";
import type { LoRAId, TrainingSeed } from "../lib/training/types";

const LORA_ID = "lora-check-in-4" as LoRAId;
const OUT = path.resolve(
  path.join(__dirname, "..", "..", "data", "training-seeds", `${LORA_ID}.json`),
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
  /** Patient reply after CHECK_IN_CHUNK4_BREATHING_FOLLOW_UP_PROMPT (post-landing path). */
  breathingFollowPatient: string;
  /** WAVE validates breathing struggle—no techniques here. */
  validateBreathing: string;
  /** After consent: concrete micro-skill (often real-sound or labeling; PRD obstacle library). */
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
  "No concerns, the landing lines about easing out of the counts felt clear enough.",
  "No major questions—the wrap-up of the breathing chunk landed fine for me.",
  "Fine, the closing guidance about returning to the room made sense.",
] as const;

const LANDING_FRICTION_BY_OBSTACLE: Record<
  ObstacleCat,
  { patient: string; agentLead: string }
> = {
  cannot_visualize: {
    patient:
      "The picture of the exhale as a wave went fuzzy in the landing—I could not really follow the last imagery lines.",
    agentLead:
      "When imagery thins out at the end of breath work, that is a normal nervous system move, not a failure.",
  },
  mind_wandering: {
    patient:
      "My mind kept wandering during the landing section while the voice slowed the counts.",
    agentLead:
      "Mind wandering near the close of breathing is really common, and it does not erase what you already practiced.",
  },
  urge_overwhelming: {
    patient:
      "The urge spiked right as the guidance moved into the longer exhale and the landing slowed down.",
    agentLead:
      "A late spike can show up when breath pacing shifts; you are still allowed to stay curious instead of fighting it.",
  },
  breath_tight: {
    patient: "My chest felt tight during the landing lines right after the guided holds.",
    agentLead:
      "Chest tightness at the end of breath practice is something a lot of people notice; you do not have to force the full pattern.",
  },
  breath_anxiety: {
    patient: "Focusing on the landing counts made my breath feel jumpy and hard to trust.",
    agentLead:
      "Breath anxiety at the tail of a practice is real, and you can keep the next step gentle.",
  },
  gave_in: {
    patient: "I almost checked out completely for the last bit of the guided breathing wrap-up.",
    agentLead:
      "Checking out for a slice of the close still counts as staying in the room with yourself.",
  },
  guilt_failure: {
    patient:
      "I felt like I messed up the ending because I could not match the exhale length.",
    agentLead:
      "Perfection is not the goal here; shame voice is loud for a lot of people at the close.",
  },
  physical_discomfort: {
    patient: "My body felt restless and achy as the breathing chunk wrapped up.",
    agentLead:
      "Restlessness at the wrap-up is information, not proof you did it wrong.",
  },
  sleepiness: {
    patient: "I got heavy and foggy right at the end of the breathing guidance.",
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
    4,
  ).trim();

  const landingClear = variantIndex % 2 === 0;
  const patientLandingReply = landingClear
    ? LANDING_ALL_CLEAR_PHRASES[variantIndex % LANDING_ALL_CLEAR_PHRASES.length]
    : LANDING_FRICTION_BY_OBSTACLE[row.obstacleCategory].patient;

  const agentAfterLanding = landingClear
    ? `Great. ${CHECK_IN_CHUNK4_BREATHING_FOLLOW_UP_PROMPT}`
    : `${LANDING_FRICTION_BY_OBSTACLE[row.obstacleCategory].agentLead} ${CHECK_IN_CHUNK4_BREATHING_FOLLOW_UP_PROMPT}`;

  const agentLandingOnly = `Thanks for naming that. ${scoreClause} ${CHECK_IN_CHUNK4_LANDING_SECTION_PROMPT}`;

  const agentValidateAndAskConsent = `${row.validateBreathing} ${CHECK_IN_COPING_CONSENT_PROMPT}`;

  const patientAfterTechnique =
    "A little—not gone, but a small notch down. Enough that I could imagine the next step.";

  const agentCheckSkill =
    "Does that shift feel steady enough to move into the closing reflection together, or do you want one more unmeasured exhale here first?";

  const patientMoveOn = "Enough to try moving on.";

  const patientYes = "Yes, I am ready.";

  return [
    { role: "agent", content: CHECK_IN_CHUNK4_SCORE_PROMPT },
    { role: "patient", content: patientCurrentScoreOnly(current, variantIndex) },
    { role: "agent", content: agentLandingOnly },
    { role: "patient", content: patientLandingReply },
    { role: "agent", content: agentAfterLanding },
    { role: "patient", content: row.breathingFollowPatient },
    { role: "agent", content: agentValidateAndAskConsent },
    { role: "patient", content: patientConsentToCoping(variantIndex) },
    { role: "agent", content: agentCopingAfterConsent(row.copingTechnique) },
    { role: "patient", content: patientAfterTechnique },
    { role: "agent", content: agentCheckSkill },
    { role: "patient", content: patientMoveOn },
    { role: "agent", content: CHECK_IN_CHUNK4_READINESS_PROMPT },
    { role: "patient", content: patientYes },
  ];
}

const GRID: CellRow[] = [
  {
    medicationStatus: "on_time",
    trigger: "social",
    triggerOther: null,
    priorSummary:
      "The breathing chunk guided 4-4-6 cycles, invited a softer exhale than inhale, then a few rounds on the patient's own count while the wave rose and fell with each phase.",
    obstacleCategory: "mind_wandering",
    breathingFollowPatient:
      "I could follow the first rounds, but my mind kept replaying lunch and I kept losing the thread of the counts.",
    validateBreathing:
      "When social stress meets paced breathing, attention can skip between face heat and replay thoughts—that is a normal split focus.",
    copingTechnique:
      "For three breaths, drop the hold entirely: inhale gently through your nose, then let the exhale leave a little longer through your mouth without measuring seconds. When commentary shows up, silently label it as thinking and return to the exhale length only.",
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
      "The breathing section used inhale-hold-exhale framing, normalized shorter counts if needed, and tied each phase to the wave metaphor.",
    obstacleCategory: "mind_wandering",
    breathingFollowPatient:
      "Stress hooked a money text I have not answered—my mind kept drafting replies instead of staying with the breath count.",
    validateBreathing:
      "Money stress can glue attention to problem-solving when your nervous system is already full.",
    copingTechnique:
      "Keep your eyes softly open if it helps. Try two rounds of exhale-longer-only—no numbers if they feel like pressure—while you feel contact where your body meets the chair or floor.",
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
      "The chunk introduced 4-4-6 pacing, encouraged noticing chest and belly without fixing, and offered permission to shorten the pattern.",
    obstacleCategory: "physical_discomfort",
    breathingFollowPatient:
      "Restless legs and sweating—the urge buzzed and the counts felt slippery, like I could not land on the exhale.",
    validateBreathing:
      "When sensation and urge tangle, a pacing target can feel unfair; that mismatch is common, not proof you failed.",
    copingTechnique:
      "Place both feet flat and press gently into the floor for three breaths—light pressure, not a workout. Let the next exhale finish without measuring, then notice one neutral sensation at the backs of your hands.",
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
      "The breathing segment offered guided counts, then invited your own rhythm, with language about riding the exhale down without forcing calm.",
    obstacleCategory: "mind_wandering",
    breathingFollowPatient:
      "Racing thoughts before bed—many threads, I could not keep the inhale-hold pattern in front long enough.",
    validateBreathing:
      "Nighttime racing thoughts are real, and they can drown out slow breath guidance.",
    copingTechnique:
      "Try labeling thoughts as background noise, then two slow exhales through the nose or mouth—whatever is gentler—without holding at the top. Return to exhale length whenever the mind races.",
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
      "The breathing chunk walked inhale, hold, and longer exhale, then eased into self-paced breaths aligned with the wave animation.",
    obstacleCategory: "guilt_failure",
    breathingFollowPatient:
      "I kept judging whether I was matching the counts right—inner critic loud, like everyone can tell I am off.",
    validateBreathing:
      "Shame voice loves to yell during social urges, and it is not a moral verdict on you.",
    copingTechnique:
      "Soften your gaze or let vision go slightly wide for a few seconds—less laser focus. Take two breaths where only the exhale matters, hand lightly on ribs if you want; when the critic speaks, note it as thinking and return.",
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
      "The section used 4-4-6 as a template, repeated that slower exhales can downshift arousal, and invited curiosity if the hold felt edgy.",
    obstacleCategory: "breath_tight",
    breathingFollowPatient:
      "Future worry about bills—chest tight, and the hold for four made me feel like I had to pull for air I did not trust.",
    validateBreathing:
      "Chest tightness with stress is common here, and you do not have to force the full hold to still be practicing.",
    copingTechnique:
      "Drop the hold for three breaths: easy inhale, slightly longer exhale through nose or pursed lips—smaller volume on purpose. Keep shoulders soft; no deeper breaths than you can complete comfortably.",
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
      "The chunk described the exhale as riding the fall of the wave, offered shorter alternatives if the pattern felt rigid, and normalized wobble.",
    obstacleCategory: "physical_discomfort",
    breathingFollowPatient:
      "Restlessness and sweating—the ache got sharper when I tried to lock onto the four-count, then my mind bounced away.",
    validateBreathing:
      "Turning toward sensation and breath targets together can feel like too much for a moment—that is data, not failure.",
    copingTechnique:
      "For three breaths, name silently where your feet meet the floor—heels, toes, sides—without changing posture. Let exhale leave a little slower than inhale without counting if counting spikes you.",
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
      "The breathing guidance finished with a gentle landing: easing counts, orienting to the room, and permission to stop forcing symmetry.",
    obstacleCategory: "sleepiness",
    breathingFollowPatient:
      "Heavy and a little buzzy—static feeling, hard to explain, and I kept losing the end of the exhale guidance.",
    validateBreathing:
      "Vague off feelings still deserve respect, and drifting attention is a normal nervous system move.",
    copingTechnique:
      "Open and close your hands slowly twice, feeling contact at the palms. Then two easy breaths—no hold—letting the out-breath be the main event, without fighting sleepiness.",
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
      "The breathing practice cycled 4-4-6, then shifted to your own count while naming the urge as something observable, not a command.",
    obstacleCategory: "urge_overwhelming",
    breathingFollowPatient:
      "Judgment spike—like everyone can tell—and the urge volume jumped while the exhale instructions felt far away.",
    validateBreathing:
      "A sharp social spike can flood attention fast; breath guidance feeling distant in that moment is a common mismatch.",
    copingTechnique:
      "Ground contact: press feet gently, notice seat or floor support, and add one slow exhale longer than the inhale—two cycles only, small volume. If counting spikes you, drop numbers and keep only exhale-longer.",
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
      "The chunk framed longer exhales as riding the fall of the wave, offered shorter counts if the pattern felt tight, and normalized breath anxiety.",
    obstacleCategory: "mind_wandering",
    breathingFollowPatient:
      "Long-running overload—chest like a vise, mind drafting worst cases instead of staying with the breath pattern.",
    validateBreathing:
      "Overload narrows the window on purpose; your mind tries to solve everything at once.",
    copingTechnique:
      "Try 5-4-3-2-1 outward: name five things you can see, then four you can touch, then three sounds, two smells, one slow exhale—no forced inhale depth. Label planning thoughts as thinking when they hook you.",
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
      "The breathing segment invited noticing chest and belly motion, shortened holds when edgy, and tied each phase to gentle wave motion.",
    obstacleCategory: "physical_discomfort",
    breathingFollowPatient:
      "Nausea and fatigue tied together—I could not tell craving from feeling sick, and the counted breaths felt irritating.",
    validateBreathing:
      "When nausea and urge tangle, paced breathing can feel irritating; small sensory shifts help without arguing with the body.",
    copingTechnique:
      "Notice cool air at the nostrils on inhale, warmer on exhale—three breaths, smaller volume. If even that feels like too much, feel the weight of your head supported and let the shoulders drop a millimeter.",
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
      "The 4-4-6 guidance ended with a soft landing back to the room, emphasizing you could abandon the hold whenever it felt like pressure.",
    obstacleCategory: "guilt_failure",
    breathingFollowPatient:
      "Anniversary tension with grief underneath—intrusive memories kept pulling me off the counts.",
    validateBreathing:
      "Anniversaries can braid grief with craving cues, and that is not weakness.",
    copingTechnique:
      "Place one palm over your sternum, light contact, and take two breaths where only the exhale lengthens a little—no rigid inhale. After each memory surge, feel feet on the floor once, then return to the next gentle exhale.",
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
      "The breathing chunk offered guided timing, then your own rhythm, and reminded you that wobble still counts as practice.",
    obstacleCategory: "mind_wandering",
    breathingFollowPatient:
      "Flooded in the room—comparison thoughts, face hot, mind blank when I tried to follow the exhale cue.",
    validateBreathing:
      "Flooded is an accurate word, and comparison thoughts are a common hijack.",
    copingTechnique:
      "Let your vision soften slightly—less detail, more periphery—for a few seconds. Two breaths with exhale longer than inhale, hand on belly optional; when comparison shows up, label it and return to the out-breath.",
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
      "The section used 4-4-6 as scaffolding, then freed the pace while keeping exhale-heavy framing for downshifting arousal.",
    obstacleCategory: "breath_tight",
    breathingFollowPatient:
      "Thoughts first, then my stomach dropped—the counts felt like they demanded a breath I could not take.",
    validateBreathing:
      "Snap-back still happens in real practice; it does not erase the half-step, and breath work does not require big volume.",
    copingTechnique:
      "Try inhale for three, exhale for four—two rounds only—smaller than you think you need. Keep one hand lightly on the chest just to feel motion, not to fix it; drop the hold entirely.",
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
      "The breathing guidance paired wave visuals with inhale, hold, and slow exhale, then invited a few self-paced rounds.",
    obstacleCategory: "physical_discomfort",
    breathingFollowPatient:
      "Sensation jumped—chest then legs—craving and achy mixed, and I argued with the numbers in my head.",
    validateBreathing:
      "Mixed body signals can argue with a breath pattern; that reaction is information, not proof the practice failed.",
    copingTechnique:
      "Trace an imaginary line from crown to tailbone as a slow inner scan—no fixing, just noticing contact with chair or floor. Add two exhales that finish fully without measuring seconds.",
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
      "The chunk closed the breath sequence with re-orientation to the room and permission to shorten every phase if the urge was loud.",
    obstacleCategory: "mind_wandering",
    breathingFollowPatient:
      "Isolation even when I am not alone—heaviness, foggy focus, shame thoughts pulling me away from the breath.",
    validateBreathing:
      "Loneliness can sit in the body like weight, and shame thoughts are not the truth of who you are.",
    copingTechnique:
      "Hand-on-heart, gentle pressure, and two breaths where exhale leaves a little slower. Silently name one texture you can touch nearby, then return to the next easy exhale without forcing depth.",
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
      for (const line of turns) {
        if (
          line.role === "agent" &&
          !line.content.trim().endsWith("?")
        ) {
          throw new Error(
            `Agent line must end with ?: ${line.content.slice(0, 80)}…`,
          );
        }
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

function buildGridSeeds(): TrainingSeed[] {
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
        chunkNumber: 4 as const,
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
          "Draft grid: check-in 4 after 4-4-6 breathing; score reflection vs prior check-in (variants cover flat, rise, drop); landing split; verbatim breathing follow-up; consent + coping bridge; readiness for closing reflection. 3 mat rotations per cell. Clinician review before promotion.",
        status: "draft",
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return seeds;
}

function loadSingleExistingSeed(): TrainingSeed | null {
  if (!existsSync(OUT)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(OUT, "utf8")) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 1) return null;
  const only = parsed[0] as TrainingSeed;
  if (only.loraId !== LORA_ID) return null;
  return only;
}

const gridSeeds = buildGridSeeds();
const handcrafted = loadSingleExistingSeed();
const merged: TrainingSeed[] = handcrafted
  ? [handcrafted, ...gridSeeds.slice(1)]
  : gridSeeds;

writeFileSync(OUT, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
console.log(
  handcrafted
    ? `Merged 1 existing + ${merged.length - 1} grid seeds (${merged.length} total) → ${OUT}`
    : `Wrote ${merged.length} seeds to ${OUT}`,
);
