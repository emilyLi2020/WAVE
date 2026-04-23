/**
 * Per-LoRA training-data form specs for the dev-only /training UI.
 * One entry per LoRA documented in docs/models.md.
 *
 * Adding a 9th LoRA: extend LORA_IDS in ./types.ts and add a new entry
 * to LORA_SPECS below. The on-disk JSON file at
 * <repo-root>/data/training-seeds/<lora-id>.json is created lazily on
 * the first save.
 *
 * Each spec is the source of truth for:
 *   - the form the doctor fills out (inputFields + outputFields)
 *   - the Zod validators the API route checks before insert
 *   - the voice-scenario checklist on the LoRA index page
 *   - the clinical rationale + invariant reminders rendered alongside
 *
 * "Voice not coverage" — see docs/model-training.md §1. The doctor's
 * job is to demonstrate clinical *postures*, not enumerate every input
 * combination. Synthetix expands the seed set across stack axes.
 */

import { z } from "zod";

import {
  BODY_LOCATIONS,
  CITATIONS,
  INSIGHT_CONFIDENCE,
  INSIGHT_KINDS,
  LORA_IDS,
  MAT_TYPES,
  MEDICATION_STATUSES,
  REFLECTION_NEXT_STEPS,
  SENSATION_LABELS,
  TIME_OF_DAY,
  TRIGGER_CATEGORIES,
  WAVE_ENCOURAGEMENT,
  WAVE_PACING,
  WAVE_PHASES,
  WAVE_TRENDS,
  type LoRAId,
  type LoraFormSpec,
  type VoiceScenario,
} from "./types";

const INTAKE_INPUT_FIELDS = [
  {
    key: "intensity",
    kind: "number",
    label: "Craving intensity (1–10)",
    min: 1,
    max: 10,
    integer: true,
    help: "What the patient tapped on the slider at intake.",
  },
  {
    key: "matType",
    kind: "enum",
    label: "Medication for SUD",
    options: MAT_TYPES,
    optionLabels: {
      buprenorphine: "Buprenorphine (generic)",
      naltrexone: "Naltrexone (oral)",
      methadone: "Methadone",
      vivitrol: "Vivitrol (extended-release naltrexone)",
      none: "Not on MAT",
    },
  },
  {
    key: "medicationStatus",
    kind: "enum",
    label: "Medication status",
    options: MEDICATION_STATUSES,
    optionLabels: {
      on_time: "Took on time",
      late: "Took late",
      missed: "Missed dose",
      none: "Not on MAT",
    },
  },
  {
    key: "trigger",
    kind: "enum",
    label: "Trigger category",
    options: TRIGGER_CATEGORIES,
  },
  {
    key: "hoursSinceDose",
    kind: "number",
    label: "Hours since dose",
    min: 0,
    max: 48,
    optional: true,
    help: "Leave blank if matType is none.",
  },
  {
    key: "localeTimeOfDay",
    kind: "enum",
    label: "Time of day",
    options: TIME_OF_DAY,
  },
] as const;

const intakeInputSchema = z.object({
  intensity: z.number().int().min(1).max(10),
  matType: z.enum(MAT_TYPES),
  medicationStatus: z.enum(MEDICATION_STATUSES),
  trigger: z.enum(TRIGGER_CATEGORIES),
  hoursSinceDose: z.number().min(0).max(48).optional(),
  localeTimeOfDay: z.enum(TIME_OF_DAY),
});

// ---------------------------------------------------------------------------
// Voice-scenario helpers
// ---------------------------------------------------------------------------

const num = (input: Record<string, unknown>, key: string): number | null => {
  const value = input[key];
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const str = (input: Record<string, unknown>, key: string): string | null => {
  const value = input[key];
  return typeof value === "string" ? value : null;
};

const bool = (input: Record<string, unknown>, key: string): boolean => {
  return Boolean(input[key]);
};

// ---------------------------------------------------------------------------
// LoRA: med-ack
// ---------------------------------------------------------------------------

const medAckScenarios: readonly VoiceScenario[] = [
  {
    id: "missed-dose",
    label: "Missed-dose framing",
    description:
      "Acknowledgment when medicationStatus is 'missed' — non-shaming, names the gap, never directive.",
    match: (i) => str(i, "medicationStatus") === "missed",
  },
  {
    id: "on-time-positive",
    label: "On-time pharmacology framing",
    description:
      "Acknowledgment when medicationStatus is 'on_time' — invokes the medication doing its job without celebrating.",
    match: (i) => str(i, "medicationStatus") === "on_time",
  },
  {
    id: "no-mat",
    label: "No-MAT framing",
    description:
      "Acknowledgment when matType is 'none' — works without invoking pharmacology.",
    match: (i) => str(i, "matType") === "none",
  },
  {
    id: "high-intensity",
    label: "High-intensity acknowledgment (≥ 8)",
    description:
      "Tone shift toward extra grounding when intensity is at the top of the scale.",
    match: (i) => (num(i, "intensity") ?? 0) >= 8,
  },
  {
    id: "low-intensity",
    label: "Low-intensity acknowledgment (≤ 3)",
    description:
      "Lighter touch when intensity is low — don't over-medicalize a small craving.",
    match: (i) => (num(i, "intensity") ?? 99) <= 3,
  },
];

const medAck: LoraFormSpec = {
  loraId: "lora-med-ack",
  title: "lora-med-ack — medication-aware acknowledgment",
  shortTitle: "Med-ack",
  whereUsed:
    "Session phase 3 — the 1–2 min acknowledgment that runs right after the intake safety screen clears.",
  clinicalRationale:
    "Only LoRA whose output cites pharmacology. The actual pharmacology paragraph is a lookup (client/lib/clinical/pharmacology.ts), so the fine-tune is teaching the trauma-informed framing around it, not the facts themselves.",
  invariants: [
    "pharmacologyClaim.medication must equal input.matType.",
    "Acknowledgment must never name a substance (no \"opioid\", \"alcohol\", \"fentanyl\", etc.).",
    "No pharmacology directives: never say increase / decrease / start / stop / double / skip dose or medication.",
    "No toxic-positivity (\"you got this\", \"stay strong\", \"don't give up\").",
    "Trauma-informed and non-shaming, even when medicationStatus is missed.",
  ],
  citationPrompt:
    "The pharmacology paragraph is supplied by the clinical lookup table. Your acknowledgment is the framing around it; cite the same source.",
  targetCount: 15,
  isStretch: false,
  inputFields: INTAKE_INPUT_FIELDS,
  outputFields: [
    {
      key: "acknowledgment",
      kind: "text",
      label: "Acknowledgment (≤ 280 chars)",
      multiline: true,
      minLength: 20,
      maxLength: 280,
      help: "2–3 sentences, second-person, trauma-informed. The pharmacology fact is provided to the model from a lookup; you are teaching how to frame it humanely.",
    },
    {
      key: "pharmacologyClaim",
      kind: "object",
      label: "Pharmacology claim",
      help: "Pre-filled from the clinical lookup once you set matType + medicationStatus. Edit only if you genuinely disagree with the canonical text.",
      fields: [
        {
          key: "medication",
          kind: "enum",
          label: "Medication",
          options: MAT_TYPES,
          help: "Must match the input matType field.",
        },
        {
          key: "claim",
          kind: "text",
          label: "Claim",
          multiline: true,
          minLength: 8,
          maxLength: 320,
          help: "Auto-filled from client/lib/clinical/pharmacology.ts.",
        },
        {
          key: "citation",
          kind: "enum",
          label: "Citation",
          options: CITATIONS,
        },
      ],
    },
    {
      key: "crisisSignalDetected",
      kind: "boolean",
      label: "Crisis signal detected?",
      help: "True only if the intake fields imply suicidality, overdose risk, or already-used-lethal-amount.",
    },
    {
      key: "nextPhase",
      kind: "const",
      label: "Next phase",
      value: "body_scan",
    },
  ],
  inputSchema: intakeInputSchema,
  outputSchema: z.object({
    acknowledgment: z.string().min(20).max(280),
    pharmacologyClaim: z.object({
      medication: z.enum(MAT_TYPES),
      claim: z.string().min(8).max(320),
      citation: z.enum(CITATIONS),
    }),
    crisisSignalDetected: z.boolean(),
    nextPhase: z.literal("body_scan"),
  }),
  voiceScenarios: medAckScenarios,
};

// ---------------------------------------------------------------------------
// LoRA: body-scan
// ---------------------------------------------------------------------------

const bodyScanInputSchema = intakeInputSchema.extend({
  bodyLocation: z.enum(BODY_LOCATIONS),
});

const bodyScanScenarios: readonly VoiceScenario[] = [
  {
    id: "common-location",
    label: "Common location (chest/jaw)",
    description: "Body scan when the patient taps a common somatic site.",
    match: (i) => {
      const loc = str(i, "bodyLocation");
      return loc === "chest" || loc === "jaw";
    },
  },
  {
    id: "uncommon-location",
    label: "Uncommon location (legs/stomach)",
    description: "Body scan when the patient taps a less-typical region.",
    match: (i) => {
      const loc = str(i, "bodyLocation");
      return loc === "legs" || loc === "stomach";
    },
  },
  {
    id: "absent-sensation",
    label: "Absent / unsure sensation",
    description:
      "Body scan when the patient picks 'other' — the model must normalize not knowing where the craving sits.",
    match: (i) => str(i, "bodyLocation") === "other",
  },
  {
    id: "high-intensity-scan",
    label: "High-intensity scan (≥ 8)",
    description: "Firmer grounding tone when the craving is at the top.",
    match: (i) => (num(i, "intensity") ?? 0) >= 8,
  },
];

const bodyScan: LoraFormSpec = {
  loraId: "lora-body-scan",
  title: "lora-body-scan — somatic narration",
  shortTitle: "Body-scan",
  whereUsed:
    "Session phase 4 — the body-scan narration after the patient taps the body region where the craving sits.",
  clinicalRationale:
    "Only somatic / interoceptive surface in the session. The body scan is grounding INTO sensation; the wave is surfing OVER it. Different therapeutic moves with different vocabularies.",
  invariants: [
    "Narration is second person, present tense, and grounded.",
    "Never names a substance.",
    "sensationLabel must come from the closed vocabulary (no free-text sensations).",
    "breathCount is one of 3 / 4 / 5 — never higher.",
  ],
  targetCount: 15,
  isStretch: false,
  inputFields: [
    ...INTAKE_INPUT_FIELDS,
    {
      key: "bodyLocation",
      kind: "enum",
      label: "Body location the patient tapped",
      options: BODY_LOCATIONS,
    },
  ],
  outputFields: [
    {
      key: "narration",
      kind: "text",
      label: "Narration (≤ 320 chars)",
      multiline: true,
      minLength: 20,
      maxLength: 320,
      help: "Second-person, grounded, references the body location.",
    },
    {
      key: "breathCount",
      kind: "enum",
      label: "Breath count",
      options: ["3", "4", "5"],
      optionLabels: { "3": "3 breaths", "4": "4 breaths", "5": "5 breaths" },
    },
    {
      key: "sensationLabel",
      kind: "enum",
      label: "Sensation label",
      options: SENSATION_LABELS,
    },
  ],
  inputSchema: bodyScanInputSchema,
  outputSchema: z.object({
    narration: z.string().min(20).max(320),
    breathCount: z.union([z.literal(3), z.literal(4), z.literal(5)]),
    sensationLabel: z.enum(SENSATION_LABELS),
  }),
  voiceScenarios: bodyScanScenarios,
};

// ---------------------------------------------------------------------------
// LoRA: wave (rise / peak / fall) — shared shape
// ---------------------------------------------------------------------------

const waveInputSchema = bodyScanInputSchema.extend({
  phase: z.enum(WAVE_PHASES),
  currentIntensity: z.number().int().min(1).max(10),
  intensityTrendLast60s: z.enum(WAVE_TRENDS),
  elapsedSeconds: z.number().int().min(0).max(480),
});

function waveInputFields(
  fixedPhase: (typeof WAVE_PHASES)[number],
): readonly import("./types").FieldSpec[] {
  return [
    ...INTAKE_INPUT_FIELDS,
    {
      key: "bodyLocation",
      kind: "enum",
      label: "Body location",
      options: BODY_LOCATIONS,
    },
    { key: "phase", kind: "const", label: "Wave phase", value: fixedPhase },
    {
      key: "currentIntensity",
      kind: "number",
      label: "Current intensity (1–10)",
      min: 1,
      max: 10,
      integer: true,
      help: "Patient's most recent slider reading at this transition.",
    },
    {
      key: "intensityTrendLast60s",
      kind: "enum",
      label: "Intensity trend (last 60 s)",
      options: WAVE_TRENDS,
    },
    {
      key: "elapsedSeconds",
      kind: "number",
      label: "Elapsed seconds in wave",
      min: 0,
      max: 480,
      integer: true,
    },
  ];
}

const waveOutputSchema = z.object({
  narration: z.string().min(10).max(220),
  pacingHint: z.enum(WAVE_PACING),
  encouragement: z.enum(WAVE_ENCOURAGEMENT),
});

const waveOutputFields = (
  encouragementHelp: string,
): readonly import("./types").FieldSpec[] => [
  {
    key: "narration",
    kind: "text",
    label: "Narration (≤ 220 chars)",
    multiline: true,
    minLength: 10,
    maxLength: 220,
  },
  {
    key: "pacingHint",
    kind: "enum",
    label: "Pacing hint",
    options: WAVE_PACING,
  },
  {
    key: "encouragement",
    kind: "enum",
    label: "Encouragement style",
    options: WAVE_ENCOURAGEMENT,
    help: encouragementHelp,
  },
];

const waveRiseScenarios: readonly VoiceScenario[] = [
  {
    id: "early-rise",
    label: "Early rise (intensity ≤ 5, climbing)",
    description: "Low-intensity climb — short, directive build language.",
    match: (i) =>
      (num(i, "currentIntensity") ?? 0) <= 5 &&
      str(i, "intensityTrendLast60s") === "up",
  },
  {
    id: "late-rise",
    label: "Late rise (intensity ≥ 7, climbing)",
    description: "Already-high climb where the patient may bail.",
    match: (i) =>
      (num(i, "currentIntensity") ?? 0) >= 7 &&
      str(i, "intensityTrendLast60s") === "up",
  },
  {
    id: "rise-after-missed",
    label: "Rise after a missed dose",
    description:
      "The build framed honestly when the medication gap is part of the picture.",
    match: (i) => str(i, "medicationStatus") === "missed",
  },
];

const waveRise: LoraFormSpec = {
  loraId: "lora-wave-rise",
  title: "lora-wave-rise — rise-phase narration",
  shortTitle: "Wave rise",
  whereUsed: "Session phase 5a — narration at the rise transition of the wave.",
  clinicalRationale:
    "The only phase where activating language is clinically correct. Therapeutic move is to keep the patient engaged with the build, not to suppress it (the literal MBRP \"surfing\" metaphor).",
  invariants: [
    "Short, directive, \"ride the build\" tone.",
    "Never shaming, never names a substance.",
    "Don't describe the wave as falling while it's rising.",
  ],
  targetCount: 15,
  isStretch: false,
  inputFields: waveInputFields("rise"),
  outputFields: waveOutputFields(
    "Rise allows activating tone; \"grounding\" or \"normalizing\" both fit.",
  ),
  inputSchema: waveInputSchema,
  outputSchema: waveOutputSchema,
  voiceScenarios: waveRiseScenarios,
};

const wavePeakScenarios: readonly VoiceScenario[] = [
  {
    id: "peak-7-8",
    label: "Peak at 7–8",
    description: "High-but-typical peak.",
    match: (i) => {
      const v = num(i, "currentIntensity") ?? 0;
      return v >= 7 && v <= 8;
    },
  },
  {
    id: "peak-9-10",
    label: "Peak at 9–10 (highest dropout risk)",
    description:
      "Top-of-scale peak. Most clinically sensitive — pure grounding, no celebrating.",
    match: (i) => (num(i, "currentIntensity") ?? 0) >= 9,
  },
  {
    id: "peak-flat",
    label: "Peak with trend = flat (stuck)",
    description:
      "Patient is parked at the top of the wave; never imply the urge will end soon.",
    match: (i) => str(i, "intensityTrendLast60s") === "flat",
  },
  {
    id: "peak-after-missed",
    label: "Peak after a missed dose",
    description: "Honest framing of a peak that lines up with a medication gap.",
    match: (i) => str(i, "medicationStatus") === "missed",
  },
];

const wavePeak: LoraFormSpec = {
  loraId: "lora-wave-peak",
  title: "lora-wave-peak — peak-phase narration",
  shortTitle: "Wave peak",
  whereUsed: "Session phase 5b — narration at the peak transition of the wave.",
  clinicalRationale:
    "Most clinically sensitive surface in the session. Maximum urge intensity = maximum dropout / use risk. Therapeutic move is pure grounding and normalizing — celebration would feel mocking. This LoRA is separate so fall-phase celebration patterns can never leak in.",
  invariants: [
    "encouragement is NEVER \"celebrating\" at peak.",
    "Calm, present-tense, normalizing tone.",
    "Never shaming, never names a substance.",
    "Don't promise the urge will end soon — it might not.",
  ],
  targetCount: 15,
  isStretch: false,
  inputFields: waveInputFields("peak"),
  outputFields: waveOutputFields(
    "MUST be \"grounding\" or \"normalizing\" — never \"celebrating\" at peak.",
  ),
  inputSchema: waveInputSchema,
  outputSchema: waveOutputSchema.refine(
    (output) => output.encouragement !== "celebrating",
    { message: "encouragement must not be 'celebrating' at peak", path: ["encouragement"] },
  ),
  voiceScenarios: wavePeakScenarios,
};

const waveFallScenarios: readonly VoiceScenario[] = [
  {
    id: "modest-drop",
    label: "Modest drop, trend down",
    description: "Intensity 4–6 with a downward trend; reserved acknowledgment.",
    match: (i) => {
      const v = num(i, "currentIntensity") ?? 0;
      return v >= 4 && v <= 6 && str(i, "intensityTrendLast60s") === "down";
    },
  },
  {
    id: "big-drop",
    label: "Big drop (≤ 3, trend down)",
    description: "Dropped to the bottom of the scale; modest celebration.",
    match: (i) =>
      (num(i, "currentIntensity") ?? 99) <= 3 &&
      str(i, "intensityTrendLast60s") === "down",
  },
  {
    id: "still-high-not-falling",
    label: "Still high (≥ 7) and trend not down",
    description:
      "Trend-respecting check — the model must NOT frame this as falling.",
    match: (i) =>
      (num(i, "currentIntensity") ?? 0) >= 7 &&
      str(i, "intensityTrendLast60s") !== "down",
  },
];

const waveFall: LoraFormSpec = {
  loraId: "lora-wave-fall",
  title: "lora-wave-fall — fall-phase narration",
  shortTitle: "Wave fall",
  whereUsed: "Session phase 5c — narration at the fall transition of the wave.",
  clinicalRationale:
    "Only in-session LoRA where some celebration is clinically appropriate — the patient just rode an urge down. But the framing must respect the trend: never describe the wave as rising when it is falling, which would gaslight the patient about their interoceptive experience.",
  invariants: [
    "Trend-respecting: never frame as rising when intensityTrendLast60s is \"down\".",
    "Limited celebration is OK; tone stays modest, not triumphant.",
    "Never names a substance.",
  ],
  targetCount: 15,
  isStretch: false,
  inputFields: waveInputFields("fall"),
  outputFields: waveOutputFields(
    "Fall allows \"celebrating\" when the trend is genuinely down; otherwise prefer \"normalizing\".",
  ),
  inputSchema: waveInputSchema,
  outputSchema: waveOutputSchema,
  voiceScenarios: waveFallScenarios,
};

// ---------------------------------------------------------------------------
// LoRA: reflection
// ---------------------------------------------------------------------------

const reflectionInputSchema = z.object({
  intakeIntensity: z.number().int().min(1).max(10),
  endingIntensity: z.number().int().min(1).max(10),
  durationSeconds: z.number().int().min(30).max(60 * 60),
  medicationStatus: z.enum(MEDICATION_STATUSES),
  matType: z.enum(MAT_TYPES),
  sessionsCount: z.number().int().min(1).max(10000),
  usedSubstanceToday: z.boolean(),
  optionalJournalText: z.string().max(500).optional(),
});

const reflectionScenarios: readonly VoiceScenario[] = [
  {
    id: "big-drop",
    label: "Big drop (≥ 5 points)",
    description: "Intake well above ending — celebrate the surf, modestly.",
    match: (i) => {
      const start = num(i, "intakeIntensity") ?? 0;
      const end = num(i, "endingIntensity") ?? 0;
      return start - end >= 5;
    },
  },
  {
    id: "minimal-change",
    label: "Minimal change or stayed flat",
    description:
      "Validate the work without inflating a result that didn't happen.",
    match: (i) => {
      const start = num(i, "intakeIntensity") ?? 0;
      const end = num(i, "endingIntensity") ?? 0;
      return Math.abs(start - end) <= 1;
    },
  },
  {
    id: "use-day",
    label: "Use-day reflection (usedSubstanceToday = true)",
    description:
      "Patient chose to surf a craving AFTER using; non-shaming, normalize, redirect. The most sensitive scenario.",
    match: (i) => bool(i, "usedSubstanceToday"),
  },
  {
    id: "first-session",
    label: "First session (sessionsCount = 1)",
    description: "Welcome / encouragement framing.",
    match: (i) => (num(i, "sessionsCount") ?? 0) === 1,
  },
  {
    id: "longitudinal",
    label: "Longitudinal (sessionsCount ≥ 30)",
    description:
      "References the pattern across many sessions, not just this one.",
    match: (i) => (num(i, "sessionsCount") ?? 0) >= 30,
  },
];

const reflection: LoraFormSpec = {
  loraId: "lora-reflection",
  title: "lora-reflection — post-session reflection",
  shortTitle: "Reflection",
  whereUsed:
    "Session phase 6 — the post-session screen that shows the patient their drop and invites a one-line journal.",
  clinicalRationale:
    "Only longitudinal LoRA — sees session count and the usedSubstanceToday flag from intake. The use-day case requires unique non-shaming framing (the patient chose to surf a craving AFTER using; that is the clinical win). No other LoRA encounters this disclosure.",
  invariants: [
    "insightOneLine MUST contain the numeric endingIntensity.",
    "When usedSubstanceToday is true: never shame, never imply failure, never frame the decision to use as a relapse event.",
    "suggestedNextStep is one of the closed vocabulary values.",
    "If optionalJournalText trips the crisis lexical filter, set crisisSignalDetected = true.",
  ],
  targetCount: 15,
  isStretch: false,
  inputFields: [
    {
      key: "intakeIntensity",
      kind: "number",
      label: "Intake intensity (1–10)",
      min: 1,
      max: 10,
      integer: true,
    },
    {
      key: "endingIntensity",
      kind: "number",
      label: "Ending intensity (1–10)",
      min: 1,
      max: 10,
      integer: true,
    },
    {
      key: "durationSeconds",
      kind: "number",
      label: "Session duration (seconds)",
      min: 30,
      max: 60 * 60,
      integer: true,
    },
    {
      key: "medicationStatus",
      kind: "enum",
      label: "Medication status",
      options: MEDICATION_STATUSES,
    },
    {
      key: "matType",
      kind: "enum",
      label: "MAT type",
      options: MAT_TYPES,
    },
    {
      key: "sessionsCount",
      kind: "number",
      label: "Total sessions to date",
      min: 1,
      max: 10000,
      integer: true,
      help: "Used for longitudinal framing in the insight line.",
    },
    {
      key: "usedSubstanceToday",
      kind: "boolean",
      label: "usedSubstanceToday flag",
      help: "Captured at the intake safety screen. True means the patient said yes to Q1 but cleared Q2.",
    },
    {
      key: "optionalJournalText",
      kind: "text",
      label: "Optional journal text (≤ 500 chars)",
      multiline: true,
      maxLength: 500,
      optional: true,
    },
  ],
  outputFields: [
    {
      key: "insightOneLine",
      kind: "text",
      label: "Insight one-liner",
      multiline: true,
      minLength: 10,
      maxLength: 200,
      help: "Must include the numeric ending intensity, e.g. \"You surfed a 7 down to 2.\"",
    },
    {
      key: "journalPromptQuestion",
      kind: "text",
      label: "Journal prompt question",
      multiline: true,
      minLength: 10,
      maxLength: 200,
    },
    {
      key: "suggestedNextStep",
      kind: "enum",
      label: "Suggested next step (10 min)",
      options: REFLECTION_NEXT_STEPS,
    },
    {
      key: "crisisSignalDetected",
      kind: "boolean",
      label: "Crisis signal detected?",
    },
  ],
  inputSchema: reflectionInputSchema,
  outputSchema: z
    .object({
      insightOneLine: z.string().min(10).max(200),
      journalPromptQuestion: z.string().min(10).max(200),
      suggestedNextStep: z.enum(REFLECTION_NEXT_STEPS),
      crisisSignalDetected: z.boolean(),
    })
    .superRefine((output, ctx) => {
      if (!/\d/.test(output.insightOneLine)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["insightOneLine"],
          message:
            "Must contain the numeric ending intensity (e.g. \"down to 2\"). The eval harness will fail this row otherwise.",
        });
      }
    }),
  voiceScenarios: reflectionScenarios,
};

// ---------------------------------------------------------------------------
// LoRA: notification (stretch)
// ---------------------------------------------------------------------------

const notificationInputSchema = z.object({
  matType: z.enum(MAT_TYPES),
  medicationStatus: z.enum(MEDICATION_STATUSES),
  predictedWindowStart: z
    .string()
    .min(1)
    .max(40)
    .describe("ISO datetime or HH:mm of the predicted high-risk window start"),
  windowConfidence: z.enum(["low", "medium", "high"]),
  ignoredWindowCount: z.number().int().min(0).max(50),
  localeTimeOfDay: z.enum(TIME_OF_DAY),
});

const notificationScenarios: readonly VoiceScenario[] = [
  {
    id: "high-confidence",
    label: "High-confidence prediction",
    description: "Direct nudge when the model is sure.",
    match: (i) => str(i, "windowConfidence") === "high",
  },
  {
    id: "low-confidence",
    label: "Low-confidence prediction",
    description: "Hedged language; patient may not be craving yet.",
    match: (i) => str(i, "windowConfidence") === "low",
  },
  {
    id: "many-ignored",
    label: "Patient has ignored ≥ 3 recently",
    description: "Softer, less directive — respect the no.",
    match: (i) => (num(i, "ignoredWindowCount") ?? 0) >= 3,
  },
];

const notification: LoraFormSpec = {
  loraId: "lora-notification",
  title: "lora-notification — prophylactic push (stretch)",
  shortTitle: "Notification",
  whereUsed:
    "Background scheduler. Fires 15 min before a predicted high-risk window.",
  clinicalRationale:
    "Anticipation phase, not coping phase. Patient may not be craving yet — tone is a gentle nudge that respects prediction uncertainty without prescribing. Tone down-weights when ignored repeatedly.",
  invariants: [
    "Title ≤ 40 chars, body ≤ 120 chars.",
    "Never names a substance.",
    "Never prescribes (no \"take your dose\", \"go to a meeting now\").",
    "When ignoredWindowCount ≥ 3, body must be softer / less directive.",
  ],
  targetCount: 10,
  isStretch: true,
  inputFields: [
    {
      key: "matType",
      kind: "enum",
      label: "MAT type",
      options: MAT_TYPES,
    },
    {
      key: "medicationStatus",
      kind: "enum",
      label: "Medication status (today)",
      options: MEDICATION_STATUSES,
    },
    {
      key: "predictedWindowStart",
      kind: "text",
      label: "Predicted window start",
      placeholder: "e.g. 2026-04-22T18:30 or \"Friday 6:30 pm\"",
      maxLength: 40,
    },
    {
      key: "windowConfidence",
      kind: "enum",
      label: "Window confidence",
      options: ["low", "medium", "high"],
    },
    {
      key: "ignoredWindowCount",
      kind: "number",
      label: "Ignored windows in last 7 days",
      min: 0,
      max: 50,
      integer: true,
    },
    {
      key: "localeTimeOfDay",
      kind: "enum",
      label: "Time of day",
      options: TIME_OF_DAY,
    },
  ],
  outputFields: [
    {
      key: "title",
      kind: "text",
      label: "Title (≤ 40 chars)",
      minLength: 4,
      maxLength: 40,
    },
    {
      key: "body",
      kind: "text",
      label: "Body (≤ 120 chars)",
      multiline: true,
      minLength: 10,
      maxLength: 120,
    },
  ],
  inputSchema: notificationInputSchema,
  outputSchema: z.object({
    title: z.string().min(4).max(40),
    body: z.string().min(10).max(120),
  }),
  voiceScenarios: notificationScenarios,
};

// ---------------------------------------------------------------------------
// LoRA: insights (stretch)
// ---------------------------------------------------------------------------

const insightsInputSchema = z.object({
  matType: z.enum(MAT_TYPES),
  weeksObserved: z.number().int().min(1).max(52),
  sessionsCount: z.number().int().min(1).max(10000),
  topTrigger: z.enum(TRIGGER_CATEGORIES),
  topBodyLocation: z.enum(BODY_LOCATIONS),
  medicationDayDelta: z
    .number()
    .min(-10)
    .max(10)
    .describe(
      "Average ending-intensity drop on medication days minus on non-medication days.",
    ),
});

const insightsScenarios: readonly VoiceScenario[] = [
  {
    id: "strong-medication-correlation",
    label: "Strong medication correlation (delta ≥ 1.5)",
    description: "Big difference on med-days vs non-med-days.",
    match: (i) => (num(i, "medicationDayDelta") ?? 0) >= 1.5,
  },
  {
    id: "weak-data",
    label: "Weak data (≤ 2 weeks)",
    description: "Honest, low-confidence statement when data is thin.",
    match: (i) => (num(i, "weeksObserved") ?? 99) <= 2,
  },
  {
    id: "no-correlation",
    label: "No correlation (|delta| < 0.5)",
    description: "Statement when medication isn't the dominant variable.",
    match: (i) => Math.abs(num(i, "medicationDayDelta") ?? 0) < 0.5,
  },
];

const insights: LoraFormSpec = {
  loraId: "lora-insights",
  title: "lora-insights — weekly pattern summary (stretch)",
  shortTitle: "Insights",
  whereUsed:
    "Weekly background job that writes plain-English patterns + one suggestion to /insights.",
  clinicalRationale:
    "Descriptive, not prescriptive — the only LoRA whose voice is closer to a clinician case review than to in-session narration. Sharing weights with any in-session LoRA risks \"do this next\" copy bleeding into a surface that should stop at observation.",
  invariants: [
    "Statements are descriptive, never prescriptive.",
    "Never tells the patient to start, stop, or change a medication.",
    "Confidence levels are honest — \"high\" only with weeks of data.",
  ],
  targetCount: 10,
  isStretch: true,
  inputFields: [
    { key: "matType", kind: "enum", label: "MAT type", options: MAT_TYPES },
    {
      key: "weeksObserved",
      kind: "number",
      label: "Weeks of session history",
      min: 1,
      max: 52,
      integer: true,
    },
    {
      key: "sessionsCount",
      kind: "number",
      label: "Sessions in window",
      min: 1,
      max: 10000,
      integer: true,
    },
    {
      key: "topTrigger",
      kind: "enum",
      label: "Most frequent trigger",
      options: TRIGGER_CATEGORIES,
    },
    {
      key: "topBodyLocation",
      kind: "enum",
      label: "Most frequent body location",
      options: BODY_LOCATIONS,
    },
    {
      key: "medicationDayDelta",
      kind: "number",
      label: "Average drop on med-days minus non-med-days",
      min: -10,
      max: 10,
      step: 0.1,
      help: "Positive = bigger drops on medication days. Range -10 to +10.",
    },
  ],
  outputFields: [
    {
      key: "patternStatement",
      kind: "text",
      label: "Pattern statement",
      multiline: true,
      minLength: 20,
      maxLength: 280,
      help: "Plain-English observation, e.g. \"Cravings tend to peak Friday evenings.\"",
    },
    {
      key: "patternKind",
      kind: "enum",
      label: "Pattern kind",
      options: INSIGHT_KINDS,
    },
    {
      key: "confidence",
      kind: "enum",
      label: "Confidence",
      options: INSIGHT_CONFIDENCE,
    },
    {
      key: "actionableSuggestion",
      kind: "text",
      label: "Actionable suggestion",
      multiline: true,
      minLength: 20,
      maxLength: 280,
      help: "One concrete, non-prescriptive next step.",
    },
  ],
  inputSchema: insightsInputSchema,
  outputSchema: z.object({
    patternStatement: z.string().min(20).max(280),
    patternKind: z.enum(INSIGHT_KINDS),
    confidence: z.enum(INSIGHT_CONFIDENCE),
    actionableSuggestion: z.string().min(20).max(280),
  }),
  voiceScenarios: insightsScenarios,
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const LORA_SPECS: Record<LoRAId, LoraFormSpec> = {
  "lora-med-ack": medAck,
  "lora-body-scan": bodyScan,
  "lora-wave-rise": waveRise,
  "lora-wave-peak": wavePeak,
  "lora-wave-fall": waveFall,
  "lora-reflection": reflection,
  "lora-notification": notification,
  "lora-insights": insights,
};

export const LORA_SPEC_LIST: readonly LoraFormSpec[] = LORA_IDS.map(
  (id) => LORA_SPECS[id],
);

export function getSpec(loraId: LoRAId): LoraFormSpec {
  return LORA_SPECS[loraId];
}

export function isLoraId(value: string): value is LoRAId {
  return (LORA_IDS as readonly string[]).includes(value);
}
