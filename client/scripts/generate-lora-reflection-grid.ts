/**
 * Writes client/data/training-seeds/lora-reflection.json with 48 ready seeds:
 * one handcrafted row (fixed id) plus 47 grid rows (16 medicationStatus × trigger
 * cells × 3 matType-rotated variants), mirroring check-in stratification.
 *
 * Run: cd client && pnpm exec tsx scripts/generate-lora-reflection-grid.ts
 */

import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { getSpec } from "../lib/training/lora-specs";
import type { LoRAId, TrainingSeed } from "../lib/training/types";
import {
  MEDICATION_STATUSES,
  TRIGGER_CATEGORIES,
} from "../lib/training/types";

const LORA_ID = "lora-reflection" as LoRAId;
const OUT = path.resolve(
  path.join(__dirname, "..", "data", "training-seeds", `${LORA_ID}.json`),
);

type Med = "buprenorphine" | "methadone" | "naltrexone" | "vivitrol" | "none";
type MedStatus = (typeof MEDICATION_STATUSES)[number];
type Trg = (typeof TRIGGER_CATEGORIES)[number];

function undashedId(): string {
  return randomBytes(16).toString("hex");
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

function matLabel(matType: Med): string {
  const labels: Record<Med, string> = {
    buprenorphine: "buprenorphine",
    methadone: "methadone",
    naltrexone: "naltrexone",
    vivitrol: "Vivitrol",
    none: "MAT",
  };
  return labels[matType];
}

function medStatusPhrase(status: MedStatus): string {
  switch (status) {
    case "on_time":
      return "on-time medication";
    case "late":
      return "late dose today";
    case "missed":
      return "a missed dose in the picture";
    case "none":
      return "no MAT in the picture";
    default:
      return "medication context";
  }
}

function triggerPhrase(trigger: Trg): string {
  switch (trigger) {
    case "social":
      return "social pull";
    case "stress":
      return "stress";
    case "physical":
      return "body cues";
    case "unknown_or_other":
      return "mixed triggers";
    default:
      return "this trigger";
  }
}

function intakeEndingForCell(
  flatIndex: number,
  variantIndex: number,
): { intake: number; ending: number } {
  const cycle = flatIndex % 3;
  const base = 4 + (flatIndex % 5);
  const intake = Math.min(10, Math.max(3, base + (variantIndex === 1 ? 1 : 0)));
  let ending: number;
  if (cycle === 0) {
    ending = Math.max(1, intake - 2 - (variantIndex % 2));
  } else if (cycle === 1) {
    ending = intake;
  } else {
    ending = Math.min(10, intake + 1 + (variantIndex % 2));
  }
  return { intake, ending };
}

function durationSecondsFor(flatIndex: number): number {
  return 360 + ((flatIndex * 47) % 540);
}

function sessionsCountFor(flatIndex: number): number {
  return 1 + ((flatIndex * 5) % 48);
}

function usedSubstanceFor(flatIndex: number, variantIndex: number): boolean {
  return flatIndex % 8 === 0 && variantIndex === 1;
}

const JOURNAL_QUESTIONS: readonly string[] = [
  "What is one small sign from today you could notice again when the urge returns?",
  "Where did you feel the urge soften first, even a little?",
  "What helped you stay with the practice when your mind wanted to bail?",
  "What would you tell a friend who just finished the same session?",
  "What is one word for how your body feels now compared to the start?",
  "What is one thing you did today that counts as care, even if it was quiet?",
];

const CHIP_SETS: ReadonlyArray<readonly [string, string, string, string]> = [
  [
    "Drink a glass of water",
    "Walk one block outside",
    "Text someone safe",
    "Rest quietly 10 minutes",
  ],
  [
    "Splash cool water on wrists",
    "Step outside for fresh air",
    "Call your sponsor",
    "Sit and breathe slowly",
  ],
  [
    "Drink warm tea slowly",
    "Stretch neck and shoulders",
    "Message a trusted person",
    "Lie down with eyes closed",
  ],
  [
    "Eat a small snack",
    "Walk to the mailbox",
    "Hum a slow tune",
    "Journal one sentence",
  ],
];

function buildInsight(params: {
  intake: number;
  ending: number;
  matType: Med;
  medicationStatus: MedStatus;
  trigger: Trg;
  sessionsCount: number;
  usedSubstanceToday: boolean;
  durationMinutes: number;
}): string {
  const drop = params.intake - params.ending;
  const mat = matLabel(params.matType);
  const med = medStatusPhrase(params.medicationStatus);
  const tr = triggerPhrase(params.trigger);
  let arc: string;
  if (drop > 0) {
    arc = `You surfed a ${params.intake} down to a ${params.ending} in about ${params.durationMinutes} minutes.`;
  } else if (drop === 0) {
    arc = `You stayed near ${params.ending} from start to finish this time, about ${params.durationMinutes} minutes on the clock.`;
  } else {
    arc = `You started at ${params.intake} and ended at ${params.ending}, about ${params.durationMinutes} minutes in the practice.`;
  }
  const context = `${tr} was in the room, and your ${med} context with ${mat} still matters for how this lands.`;
  const sessionN =
    params.sessionsCount === 1
      ? "This is an early session in the habit."
      : `This is session ${params.sessionsCount} for you, and practice adds up in uneven steps.`;
  let tail = `${context} ${sessionN}`;
  if (params.usedSubstanceToday) {
    tail +=
      " You still chose to surf a craving today; that choice is allowed to sit next to everything else you are holding.";
  }
  return `${arc} ${tail}`;
}

function scoreHistorySummary(params: {
  intake: number;
  ending: number;
  medicationStatus: MedStatus;
  matType: Med;
  trigger: Trg;
}): string {
  return `Intake ${params.intake}; ending ${params.ending}; ${params.medicationStatus} ${matLabel(params.matType)}; ${params.trigger}.`;
}

function assertOutputs(spec: ReturnType<typeof getSpec>): void {
  if (spec.loraId !== LORA_ID) {
    throw new Error(`Expected spec ${LORA_ID}`);
  }
}

function buildHandcraftedSeed(): TrainingSeed {
  const now = new Date().toISOString();
  const spec = getSpec(LORA_ID);
  assertOutputs(spec);

  const input = {
    surface: "reflection" as const,
    intakeIntensity: 7,
    endingIntensity: 2,
    durationSeconds: 780,
    medicationStatus: "on_time" as const,
    matType: "buprenorphine" as const,
    trigger: "stress" as const,
    sessionsCount: 12,
    usedSubstanceToday: false,
    scoreHistorySummary:
      "Intake 7; check-in arc stepped down to ending 2; on-time buprenorphine; stress trigger.",
  };
  const output = {
    insight:
      "You surfed a 7 down to a 2 in about 13 minutes. Stress was loud when you started, and you still stayed with the wave instead of arguing with it. This is your 12th session, not a straight line every time, but today's numbers show the practice can move with you when you stay close.",
    journalPromptQuestion:
      "What is one small sign from today that you could notice again the next time stress spikes?",
    nextSteps: {
      one: "Drink a full glass of water",
      two: "Walk one block outside",
      three: "Text someone you trust for 2 minutes",
      four: "Rest quietly for 10 minutes",
    },
  };

  const inputCheck = spec.inputSchema.safeParse(input);
  if (!inputCheck.success) {
    throw new Error(`Handcrafted input: ${JSON.stringify(inputCheck.error.issues)}`);
  }
  const outputCheck = spec.outputSchema.safeParse(output);
  if (!outputCheck.success) {
    throw new Error(`Handcrafted output: ${JSON.stringify(outputCheck.error.issues)}`);
  }

  return {
    id: "b2c3d4e5f6a74890b1c2d3e4f5a6b7c8",
    loraId: LORA_ID,
    input: inputCheck.data as Record<string, unknown>,
    output: outputCheck.data as Record<string, unknown>,
    authorInitials: null,
    notes:
      "Handcrafted anchor row. Plan-first UX in product; four backup chips after 'No ideas'. Clinician review before promotion.",
    status: "ready",
    createdAt: "2026-05-07T22:30:00.000Z",
    updatedAt: now,
  };
}

function buildGridSeeds(): TrainingSeed[] {
  const now = new Date().toISOString();
  const spec = getSpec(LORA_ID);
  assertOutputs(spec);

  const seeds: TrainingSeed[] = [];
  let flatIndex = 0;

  for (const medicationStatus of MEDICATION_STATUSES) {
    for (const trigger of TRIGGER_CATEGORIES) {
      const expectedMats = matTriple(medicationStatus, trigger);
      for (let variantIndex = 0; variantIndex < 3; variantIndex += 1) {
        const matType = expectedMats[variantIndex];
        const { intake, ending } = intakeEndingForCell(flatIndex, variantIndex);
        const durationSeconds = durationSecondsFor(flatIndex);
        const sessionsCount = sessionsCountFor(flatIndex);
        const usedSubstanceToday = usedSubstanceFor(flatIndex, variantIndex);
        const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));

        const input = {
          surface: "reflection" as const,
          intakeIntensity: intake,
          endingIntensity: ending,
          durationSeconds,
          medicationStatus,
          matType,
          trigger,
          sessionsCount,
          usedSubstanceToday,
          scoreHistorySummary: scoreHistorySummary({
            intake,
            ending,
            medicationStatus,
            matType,
            trigger,
          }),
        };

        const insight = buildInsight({
          intake,
          ending,
          matType,
          medicationStatus,
          trigger,
          sessionsCount,
          usedSubstanceToday,
          durationMinutes,
        });
        const journalPromptQuestion =
          JOURNAL_QUESTIONS[flatIndex % JOURNAL_QUESTIONS.length] ?? JOURNAL_QUESTIONS[0];
        const chips = CHIP_SETS[flatIndex % CHIP_SETS.length] ?? CHIP_SETS[0];
        const output = {
          insight,
          journalPromptQuestion,
          nextSteps: {
            one: chips[0],
            two: chips[1],
            three: chips[2],
            four: chips[3],
          },
        };

        const inputCheck = spec.inputSchema.safeParse(input);
        if (!inputCheck.success) {
          throw new Error(
            `Grid input invalid: ${JSON.stringify(inputCheck.error.issues)}`,
          );
        }
        const outputCheck = spec.outputSchema.safeParse(output);
        if (!outputCheck.success) {
          throw new Error(
            `Grid output invalid: ${JSON.stringify(outputCheck.error.issues)}`,
          );
        }

        seeds.push({
          id: undashedId(),
          loraId: LORA_ID,
          input: inputCheck.data as Record<string, unknown>,
          output: outputCheck.data as Record<string, unknown>,
          authorInitials: null,
          notes:
            "Synthetic grid: 16 medStatus × trigger × 3 mat variants; plan-first product, four backup chips in training JSON. Clinician review before promotion.",
          status: "ready",
          createdAt: now,
          updatedAt: now,
        });

        flatIndex += 1;
      }
    }
  }

  if (seeds.length !== 48) {
    throw new Error(`Expected 48 grid seeds, got ${seeds.length}`);
  }
  return seeds;
}

const gridSeeds = buildGridSeeds();
const handcrafted = buildHandcraftedSeed();
const merged: TrainingSeed[] = [handcrafted, ...gridSeeds.slice(1)];

writeFileSync(OUT, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
console.log(
  `Wrote ${merged.length} seeds (handcrafted + ${merged.length - 1} grid), all ready → ${OUT}`,
);
