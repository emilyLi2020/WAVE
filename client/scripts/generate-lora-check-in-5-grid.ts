/**
 * Writes client/data/training-seeds/lora-check-in-5.json with 48 draft seeds (or merges
 * when the file already has exactly one seed: replaces it with the scripted
 * handcrafted row and appends 47 grid rows).
 *
 * Check-in 5: CHECK_IN_CHUNK5_SCORE_PROMPT → first WAVE weaves baseline + check-in 4
 * comparison, optional flat/up vs baseline validation + optional 9–10 therapist/doctor
 * prompt, fillScoreReflection on CHECK_IN_CHUNK5_NOTICE_OPENER_TEMPLATE, then
 * reflection turns → verbatim CHECK_IN_CHUNK5_CARRY_FORWARD_PROMPT; ends on patient.
 *
 * Run: cd client && pnpm exec tsx scripts/generate-lora-check-in-5-grid.ts
 */

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { fillScoreReflection } from "../lib/session/score-tracking";
import {
  CHECK_IN_CHUNK5_CARRY_FORWARD_PROMPT,
  CHECK_IN_CHUNK5_NOTICE_OPENER_TEMPLATE,
  CHECK_IN_CHUNK5_SCORE_PROMPT,
} from "../lib/training/check-in-dialogue";
import { getSpec } from "../lib/training/lora-specs";
import type { LoRAId, TrainingSeed } from "../lib/training/types";

const LORA_ID = "lora-check-in-5" as LoRAId;
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
  priorChunkSummary: string;
  obstacleCategory: ObstacleCat;
  noticedPatient: string;
  agentReflect: string;
  bodyPatient: string;
  agentForward: string;
  truthPatient: string;
  carryPatient: string;
  intensities: [IntensityPair, IntensityPair, IntensityPair];
}

function clamp(n: number): number {
  return Math.min(10, Math.max(1, n));
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
  const currentIntensity = clamp(priorCheckInScore + bump);
  return {
    intakeIntensity: pair.intakeIntensity,
    priorCheckInScore,
    currentIntensity,
  };
}

function expandPathFour(s1: number, s4: number): [number, number, number, number] {
  if (s1 === s4) return [s1, s1, s1, s4];
  const s2 = Math.round(s1 + (s4 - s1) / 3);
  const s3 = Math.round(s1 + ((2 * (s4 - s1)) / 3));
  return [s1, clamp(s2), clamp(s3), s4];
}

function ci5Bump(variantIndex: number): number {
  if (variantIndex === 0) return 0;
  if (variantIndex === 1) return 1;
  return -1;
}

function fullScoreHistory(
  triple: ReturnType<typeof intensityTriple>,
  variantIndex: number,
): [number, number, number, number, number] {
  const s1 = triple.intakeIntensity;
  const s4 = triple.currentIntensity;
  const s5 = clamp(s4 + ci5Bump(variantIndex));
  const [a, b, c, d] = expandPathFour(s1, s4);
  if (d !== s4) throw new Error("expandPathFour drift");
  return [a, b, c, d, s5];
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
  if (mod === 0) return String(current);
  if (mod === 1) return `About a ${current}.`;
  return `Maybe ${current}.`;
}

function firstWaveAfterScore(
  scores: readonly [number, number, number, number, number],
): string {
  const s1 = scores[0];
  const s4 = scores[3];
  const s5 = scores[4];
  const thanks = "Thanks for naming that.";
  const dual = `You started this session at ${s1}, and you are at ${s5} now. From check-in four you were at ${s4} before this number.`;

  let mid = "";
  if (s5 >= s1) {
    mid +=
      " If this number feels heavy because it is not down from where you began, that frustration makes sense, and thank you for staying in the practice anyway. Healing is often uneven, and change may show up between sessions as much as in this moment—bringing the practice back when the urge appears can help over time, without any straight-line promise.";
  }
  if (s5 >= 9) {
    mid +=
      " With a craving this high on the scale, would you consider reaching out to your therapist or doctor soon for extra support? That is not a medication change from me—just a gentle option so you are not holding it all alone.";
  }

  const tail = fillScoreReflection(
    CHECK_IN_CHUNK5_NOTICE_OPENER_TEMPLATE,
    scores,
    5,
  );
  return `${thanks} ${dual}${mid} ${tail}`.replace(/\s{2,}/g, " ").trim();
}

function buildDialogueTurns(row: CellRow, variantIndex: number): Turn[] {
  const triple = intensityTriple(row.intensities[variantIndex], variantIndex);
  const scores = fullScoreHistory(triple, variantIndex);
  const s5 = scores[4];

  return [
    { role: "agent", content: CHECK_IN_CHUNK5_SCORE_PROMPT },
    { role: "patient", content: patientCurrentScoreOnly(s5, variantIndex) },
    { role: "agent", content: firstWaveAfterScore(scores) },
    { role: "patient", content: row.noticedPatient },
    { role: "agent", content: row.agentReflect },
    { role: "patient", content: row.bodyPatient },
    { role: "agent", content: row.agentForward },
    { role: "patient", content: row.truthPatient },
    { role: "agent", content: CHECK_IN_CHUNK5_CARRY_FORWARD_PROMPT },
    { role: "patient", content: row.carryPatient },
  ];
}

/** Same 16 × 3 intensity stratification as check-in 4 grid; dialogue is closing-check-in themed. */
const GRID: CellRow[] = [
  {
    medicationStatus: "on_time",
    trigger: "social",
    triggerOther: null,
    priorChunkSummary:
      "The closing chunk affirmed riding the full wave, re-oriented gently to the room, and offered a steady last word before handoff.",
    obstacleCategory: "mind_wandering",
    noticedPatient:
      "I noticed my mind kept replaying a social moment and I still finished the close without bailing.",
    agentReflect:
      "Staying through replay thoughts without making that mean you failed is real work. Where did you feel the urge most during that last stretch, even if it shifted?",
    bodyPatient:
      "Jaw and upper chest—hot, then a little looser by the end.",
    agentForward:
      "A looser notch without a perfect story still counts; healing rarely moves in one straight line. What is one small way you want to treat yourself in the next hour if the replay shows up again?",
    truthPatient:
      "I can let the scene replay without obeying the urge.",
    carryPatient:
      "Naming the replay as background noise, not a command.",
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
    priorChunkSummary:
      "The final narration thanked you for staying with the practice, invited a slow breath, and framed the wave as something you watched rather than fought.",
    obstacleCategory: "mind_wandering",
    noticedPatient:
      "I noticed stress kept pulling me into planning, but I came back to the close a few times.",
    agentReflect:
      "Returning even once when stress wants a spreadsheet brain is not trivial. What did your breath feel like in those last minutes—tight, shallow, or something else?",
    bodyPatient:
      "Shallow at first, then a little longer on the exhale by the end.",
    agentForward:
      "Longer exhale without a perfect arc is still nervous system practice. What would it look like to offer yourself one minute of that exhale-heavy pacing later tonight without judging the score?",
    truthPatient:
      "I do not have to solve the whole week in one sitting.",
    carryPatient:
      "One unforced exhale before I answer any texts.",
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
    priorChunkSummary:
      "Chunk five slowed the language, named completion without perfection, and eased attention back toward contact with the chair and floor.",
    obstacleCategory: "physical_discomfort",
    noticedPatient:
      "I noticed my legs buzzed and I still let the close be slow instead of fighting it.",
    agentReflect:
      "Buzzing legs and a slow close can coexist; you are allowed both. If you scan from feet to shoulders for a second, what is one area that softened even a little?",
    bodyPatient:
      "Shoulders dropped a fraction; legs still restless but less argued with.",
    agentForward:
      "Softening without erasing restlessness is still a form of steadiness. What is a compassionate label you could use for your body tonight if the buzz returns?",
    truthPatient:
      "Restless is not the same as doomed.",
    carryPatient:
      "Shoulder drop check-in before I stand up.",
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
    priorChunkSummary:
      "The ending lines normalized a busy mind, suggested gentleness for nighttime edges, and invited one last orienting breath.",
    obstacleCategory: "mind_wandering",
    noticedPatient:
      "I noticed racing thoughts before bed still showed up, but I did not chase every thread.",
    agentReflect:
      "Night rumble is real, and you still practiced containment. When the thoughts raced, what happened in your chest or belly—tight, fluttery, quiet?",
    bodyPatient:
      "Chest fluttery, belly a little knotted, then slightly quieter.",
    agentForward:
      "A small quiet is still data, not a grade. What is one low-effort wind-down signal you could repeat later that does not depend on silencing your mind?",
    truthPatient:
      "I can wind down without winning the thought battle.",
    carryPatient:
      "Dim lights + one slow exhale before screens.",
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
    priorChunkSummary:
      "The close affirmed courage to stay present, offered gratitude for the effort, and guided attention to sound and touch in the real room.",
    obstacleCategory: "guilt_failure",
    noticedPatient:
      "I noticed shame tried to tell me I performed badly for others, and I still stayed through the ending.",
    agentReflect:
      "Shame voice is loud in social urges, and you kept your seat. Where do you feel that shame physically—throat, gut, heat in the face?",
    bodyPatient:
      "Throat tight, face hot, stomach dropped.",
    agentForward:
      "Heat and drop can be signals, not verdicts. What is one sentence you could say to yourself later that sounds like a friend, not a judge?",
    truthPatient:
      "I am not my worst moment in a room.",
    carryPatient:
      "Hand on chest + one kind sentence out loud.",
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
    priorChunkSummary:
      "The closing section named that urges spike and fall, thanked you for riding with the wave, and invited a final soft exhale into the day ahead.",
    obstacleCategory: "breath_tight",
    noticedPatient:
      "I noticed my chest grabbed during the last guidance and I did not force a hero breath.",
    agentReflect:
      "Chest grab under stress is common; skipping the hero breath is wisdom. What shifted, even a little, when you let the exhale be smaller?",
    bodyPatient:
      "Less fighting, still tight but I stopped measuring myself against a perfect inhale.",
    agentForward:
      "Choosing smaller breaths when tight is still practice. What is one cue you want to remember the next time your chest says no to a big breath?",
    truthPatient:
      "Small breaths still count.",
    carryPatient:
      "Drop the hold—exhale-first for two rounds.",
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
    priorChunkSummary:
      "The finale spoke about integration, encouraged noticing the room again, and reminded you the session can end without fixing everything.",
    obstacleCategory: "physical_discomfort",
    noticedPatient:
      "I noticed ache and craving tangled, and I still listened to the close instead of escaping.",
    agentReflect:
      "Tangled signals ask a lot of attention; listening anyway matters. If you track one channel only—temperature or pressure—which is easiest to name right now?",
    bodyPatient:
      "Pressure behind my eyes and a dull ache in my legs.",
    agentForward:
      "Naming one channel can shrink the overwhelm a notch. What is a gentle next step for your body in the next ten minutes that is not a fix, just care?",
    truthPatient:
      "Care can be tiny and still real.",
    carryPatient:
      "Water + slow walk to the kitchen.",
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
    priorChunkSummary:
      "The last lines offered permission to feel foggy, suggested soft eyes open if helpful, and thanked you for staying through an uneven practice.",
    obstacleCategory: "sleepiness",
    noticedPatient:
      "I noticed I felt buzzy and off, and the close did not demand I explain it perfectly.",
    agentReflect:
      "Foggy-off feelings deserve respect; you do not owe a clean label. When the voice slowed, did anything in your body feel even one degree heavier toward rest?",
    bodyPatient:
      "Eyelids heavy, shoulders sank a little.",
    agentForward:
      "Leaning toward rest without shame is allowed. What is a non-judgmental plan for the next thirty minutes that honors heavy lids?",
    truthPatient:
      "Off does not mean broken.",
    carryPatient:
      "Low light and no extra tasks before sleep.",
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
    priorChunkSummary:
      "The ending honored that social spikes are loud, normalized not liking the feeling, and brought attention back to grounded contact points.",
    obstacleCategory: "urge_overwhelming",
    noticedPatient:
      "I noticed the judgment spike tried to flood me, and I still heard the last lines about staying with the wave.",
    agentReflect:
      "Hearing guidance while flooded is not small. Where did you feel the spike most—skin, gut, throat?",
    bodyPatient:
      "Skin crawly, gut clenched, throat tight.",
    agentForward:
      "Those layers are a lot to hold; you held them with support in the room. What is one grounding move you could repeat after this that does not depend on the urge vanishing?",
    truthPatient:
      "I can ground while the spike is still talking.",
    carryPatient:
      "Feet flat + press into floor for three breaths.",
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
    priorChunkSummary:
      "The close named overload without insult, thanked you for not quitting, and suggested one orienting detail in the room before stopping.",
    obstacleCategory: "mind_wandering",
    noticedPatient:
      "I noticed my mind kept drafting worst cases, but I let the session end without fixing every scenario.",
    agentReflect:
      "Overload narrows the window on purpose; you still chose an ending breath. What did your shoulders do in the last minute—climb or soften?",
    bodyPatient:
      "They climbed, then softened a little on the last exhale cue.",
    agentForward:
      "A micro-soften still signals your system heard something kind. What is one boundary you could protect tonight so your mind gets a smaller pile?",
    truthPatient:
      "I can close the laptop without solving everything.",
    carryPatient:
      "One task off the mental list until tomorrow.",
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
    priorChunkSummary:
      "The final narration spoke gently about nausea and fatigue, affirmed staying present, and invited a slow return to neutral posture.",
    obstacleCategory: "physical_discomfort",
    noticedPatient:
      "I noticed nausea and urge tangled, and I still stayed for the closing words.",
    agentReflect:
      "Nausea plus craving is brutal; you stayed anyway. If you pick one neutral anchor—cool cup, fabric, feet—what is easiest to access right now?",
    bodyPatient:
      "Cool glass edge at my fingers helped a little.",
    agentForward:
      "A little help still counts. What is a small comfort you could offer your body after this that is not about forcing appetite?",
    truthPatient:
      "I can sip and pause without debating myself.",
    carryPatient:
      "Small sips of water, no pressure to eat.",
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
    priorChunkSummary:
      "The ending acknowledged grief can ride alongside craving, offered steadiness without fixing the date, and thanked you for staying.",
    obstacleCategory: "guilt_failure",
    noticedPatient:
      "I noticed anniversary grief pulled hard, and I still let the session land instead of running.",
    agentReflect:
      "Grief and craving together is heavy; landing matters. Where did you feel the grief most—chest, throat, heaviness in limbs?",
    bodyPatient:
      "Chest hollow, throat thick, arms heavy.",
    agentForward:
      "Heavy limbs can be grief doing its job, not failure. What is one compassionate check-in you could schedule with a safe person after today?",
    truthPatient:
      "I can ask for company without explaining everything.",
    carryPatient:
      "Text one safe person a short check-in.",
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
    priorChunkSummary:
      "The close thanked you for courage in the room, normalized comparison thoughts, and guided one last orienting breath before finishing.",
    obstacleCategory: "mind_wandering",
    noticedPatient:
      "I noticed comparison thoughts flooded me, and I still finished the practice.",
    agentReflect:
      "Flooded and finished can coexist. What did you feel in your face or chest when comparison was loudest?",
    bodyPatient:
      "Face hot, chest tight, then a notch cooler at the end.",
    agentForward:
      "A notch cooler is still a shift you participated in. What is one way you want to step out of the room without rehearsing the comparison on repeat?",
    truthPatient:
      "I can leave without replaying the scoreboard.",
    carryPatient:
      "Name three neutral objects in the hallway before I talk to anyone.",
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
    priorChunkSummary:
      "The finale framed the exhale as a place to land, thanked you for imperfect practice, and invited eyes open softly if that felt safer.",
    obstacleCategory: "breath_tight",
    noticedPatient:
      "I noticed my stomach dropped and the close still asked for gentleness, not force.",
    agentReflect:
      "Gentleness after a drop is nervous system care. What happened to your inhale when you stopped demanding depth?",
    bodyPatient:
      "It got smaller but steadier; less dizzy.",
    agentForward:
      "Smaller and steadier is a valid win. What is one reminder you want before the next stressful task so breath does not turn into a fight?",
    truthPatient:
      "I can keep breath small on purpose.",
    carryPatient:
      "Sticky note: exhale-first, no hero inhale.",
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
    priorChunkSummary:
      "The last segment spoke about mixed signals in the body, thanked you for curiosity, and eased attention to weight and contact.",
    obstacleCategory: "physical_discomfort",
    noticedPatient:
      "I noticed sensation jumped between chest and legs, and I still stayed curious at the close.",
    agentReflect:
      "Curiosity while jumping is advanced beginner work. Which jump was easier to watch without fixing—chest or legs?",
    bodyPatient:
      "Legs were easier to watch; chest wanted a fight.",
    agentForward:
      "Choosing one channel to watch is enough. What is a tiny movement break you could take soon that respects ache without debating it?",
    truthPatient:
      "I can move without punishing the ache.",
    carryPatient:
      "Two slow laps of the room, no headphones.",
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
    priorChunkSummary:
      "The closing honored loneliness as real body weight, offered warmth without fixing isolation, and thanked you for staying through the last lines.",
    obstacleCategory: "mind_wandering",
    noticedPatient:
      "I noticed loneliness sat heavy even though I am not literally alone, and I still heard the thank-you at the end.",
    agentReflect:
      "Loneliness in a room of people is common; your heaviness makes sense. Where do you feel the weight most—chest, stomach, limbs?",
    bodyPatient:
      "Chest heavy, arms numb-light, stomach quiet.",
    agentForward:
      "Quiet stomach can be exhaustion, not absence of care. What is one connection that would feel low-pressure to try later today?",
    truthPatient:
      "Low-pressure counts as reaching out.",
    carryPatient:
      "Send one short check-in voice memo to a safe person.",
    intensities: [
      { intakeIntensity: 7, currentIntensity: 5 },
      { intakeIntensity: 7, currentIntensity: 6 },
      { intakeIntensity: 6, currentIntensity: 5 },
    ],
  },
];

function assertNoReadyToContinue(turns: Turn[]) {
  const blob = turns.map((t) => t.content).join(" ");
  if (/ready to continue|next chunk|body scan|sound anchor|breathing section/i.test(blob)) {
    throw new Error("Check-in 5 transcript must not suggest continuing chunks");
  }
}

function assertAgentQuestions(turns: Turn[]) {
  for (const line of turns) {
    if (line.role === "agent" && !line.content.trim().endsWith("?")) {
      throw new Error(`Agent line must end with ?: ${line.content.slice(0, 90)}`);
    }
  }
}

function assertOutputs(spec: ReturnType<typeof getSpec>) {
  for (const row of GRID) {
    for (let variantIndex = 0; variantIndex < 3; variantIndex += 1) {
      const triple = intensityTriple(row.intensities[variantIndex], variantIndex);
      const scores = fullScoreHistory(triple, variantIndex);
      const turns = buildDialogueTurns(row, variantIndex);
      assertAgentQuestions(turns);
      assertNoReadyToContinue(turns);
      const reply = lastAgentReply(turns);
      if (reply !== CHECK_IN_CHUNK5_CARRY_FORWARD_PROMPT) {
        throw new Error("Last agent line must be carry-forward prompt");
      }
      const output = {
        reply,
        endConversation: {
          action: "end" as const,
          cravingScore: scores[4],
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

function buildHandcraftedSeed(): TrainingSeed {
  const scores: [number, number, number, number, number] = [7, 6, 5, 5, 3];
  const turns: Turn[] = [
    { role: "agent", content: CHECK_IN_CHUNK5_SCORE_PROMPT },
    { role: "patient", content: "3" },
    { role: "agent", content: firstWaveAfterScore(scores) },
    {
      role: "patient",
      content:
        "I noticed I could stay curious about the urge instead of trying to argue it away.",
    },
    {
      role: "agent",
      content:
        "Curiosity without wrestling the urge is a real part of surfing, especially when stress is loud. What showed up in your body when you tried that, even in small ways?",
    },
    {
      role: "patient",
      content:
        "My chest still felt wired, but I did not spend the whole time trying to fix it.",
    },
    {
      role: "agent",
      content:
        "Letting the wired feeling be there without making yourself wrong for it is a kind of steadiness—change is rarely a straight line, and you still moved from where you started. What feels most true about that for you right now?",
    },
    {
      role: "patient",
      content: "That showing up counts even when the feeling does not vanish.",
    },
    { role: "agent", content: CHECK_IN_CHUNK5_CARRY_FORWARD_PROMPT },
    {
      role: "patient",
      content:
        "Maybe the slower exhale and treating the urge like weather, not a command.",
    },
  ];
  assertAgentQuestions(turns);
  assertNoReadyToContinue(turns);
  const now = new Date().toISOString();
  return {
    id: "c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f",
    loraId: LORA_ID,
    input: {
      surface: "check_in",
      chunkNumber: 5,
      intakeIntensity: 7,
      matType: "buprenorphine",
      medicationStatus: "on_time",
      trigger: "stress",
      usedSubstanceToday: false,
      currentIntensity: 3,
      scoreTrend: "falling",
      priorChunkSummary:
        "The closing chunk affirmed riding the full wave, invited a gentle body and room re-orientation, and offered a final word of steadiness before the session handoff.",
    },
    output: {
      reply: CHECK_IN_CHUNK5_CARRY_FORWARD_PROMPT,
      endConversation: {
        action: "end",
        cravingScore: 3,
        obstacleCategory: "mind_wandering",
      },
      dialogueTurns: turns,
    },
    authorInitials: null,
    notes:
      "Updated handcrafted: dual baseline + check-in-4 framing, full score history [7,6,5,5,3] for fillScoreReflection (step-down vs check-in 4 without stays-low misfire); no flat/up vs baseline block (final below intake); no 9–10 contact line; closing arc + verbatim carry-forward. Clinician review before promotion.",
    status: "draft",
    createdAt: "2026-05-06T21:00:00.000Z",
    updatedAt: now,
  };
}

function buildGridSeeds(): TrainingSeed[] {
  const now = new Date().toISOString();
  const spec = getSpec(LORA_ID);
  assertOutputs(spec);

  const seeds: TrainingSeed[] = [];
  for (const row of GRID) {
    const expectedMats = matTriple(row.medicationStatus, row.trigger);
    for (let variantIndex = 0; variantIndex < 3; variantIndex += 1) {
      const matType = expectedMats[variantIndex];
      const triple = intensityTriple(row.intensities[variantIndex], variantIndex);
      const scores = fullScoreHistory(triple, variantIndex);
      const turns = buildDialogueTurns(row, variantIndex);
      const reply = lastAgentReply(turns);

      const input = {
        surface: "check_in" as const,
        chunkNumber: 5 as const,
        intakeIntensity: triple.intakeIntensity,
        matType,
        medicationStatus: row.medicationStatus,
        trigger: row.trigger,
        ...(row.triggerOther ? { triggerOther: row.triggerOther } : {}),
        usedSubstanceToday: false,
        currentIntensity: scores[4],
        scoreTrend: scoreTrendForTraining(scores[3], scores[4]),
        priorChunkSummary: row.priorChunkSummary,
      };

      const output = {
        reply,
        endConversation: {
          action: "end" as const,
          cravingScore: scores[4],
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
          "Draft grid: check-in 5 closing; baseline + check-in-4 dual framing; optional flat/up vs baseline + optional 9–10 therapist/doctor prompt; fillScoreReflection on full history; verbatim carry-forward; variants cover CI5 score flat/rise/drop after CI4. Clinician review before promotion.",
        status: "draft",
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return seeds;
}

const gridSeeds = buildGridSeeds();
const handcrafted = buildHandcraftedSeed();
const merged: TrainingSeed[] = [handcrafted, ...gridSeeds.slice(1)];

writeFileSync(OUT, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
console.log(
  `Wrote ${merged.length} seeds (handcrafted + ${merged.length - 1} grid rows) → ${OUT}`,
);
