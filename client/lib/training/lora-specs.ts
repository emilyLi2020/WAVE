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
 *   - the stack-axis coverage grid on the LoRA index page
 *   - the clinical rationale + invariant reminders rendered alongside
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

const STACK_AXES_BY_MAT_AND_STATUS = {
  rowKey: "matType",
  rowLabel: "MAT",
  rowOptions: MAT_TYPES,
  colKey: "medicationStatus",
  colLabel: "Med status",
  colOptions: MEDICATION_STATUSES,
} as const;

const medAck: LoraFormSpec = {
  loraId: "lora-med-ack",
  title: "lora-med-ack — medication-aware acknowledgment",
  shortTitle: "Med-ack",
  whereUsed:
    "Session phase 3 — the 1-2 min acknowledgment that runs right after the intake safety screen clears.",
  clinicalRationale:
    "Only LoRA that emits medication-specific factual content tied to an FDA / SAMHSA / MBRP citation. Mixing with any other LoRA would dilute pharmacology accuracy or risk a non-pharmacology surface accidentally emitting a dose directive.",
  invariants: [
    "pharmacologyClaim.medication must equal input.matType.",
    "Acknowledgment must never name a substance (no \"opioid\", \"alcohol\", \"fentanyl\", etc.).",
    "No pharmacology directives: never say increase / decrease / start / stop / double / skip dose or medication.",
    "No toxic-positivity (\"you got this\", \"stay strong\", \"don't give up\").",
    "Trauma-informed and non-shaming, even when medicationStatus is missed.",
  ],
  citationPrompt:
    "Cite the FDA label, SAMHSA TIP 63 section, or MBRP facilitator chapter the pharmacology claim is drawn from.",
  targetCount: 30,
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
      help: "2–3 sentences, second-person, trauma-informed.",
    },
    {
      key: "pharmacologyClaim",
      kind: "object",
      label: "Pharmacology claim",
      help: "The factual statement the acknowledgment is built on.",
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
          maxLength: 240,
          help: "Short factual statement, e.g. \"Suboxone occupies your mu-opioid receptors for 24-72 hours.\"",
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
      claim: z.string().min(8).max(240),
      citation: z.enum(CITATIONS),
    }),
    crisisSignalDetected: z.boolean(),
    nextPhase: z.literal("body_scan"),
  }),
  stackAxes: STACK_AXES_BY_MAT_AND_STATUS,
};

const bodyScanInputSchema = intakeInputSchema.extend({
  bodyLocation: z.enum(BODY_LOCATIONS),
});

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
  targetCount: 30,
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
  stackAxes: STACK_AXES_BY_MAT_AND_STATUS,
};

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
  targetCount: 30,
  isStretch: false,
  inputFields: waveInputFields("rise"),
  outputFields: waveOutputFields(
    "Rise allows activating tone; \"grounding\" or \"normalizing\" both fit.",
  ),
  inputSchema: waveInputSchema,
  outputSchema: waveOutputSchema,
  stackAxes: STACK_AXES_BY_MAT_AND_STATUS,
};

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
  targetCount: 30,
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
  stackAxes: STACK_AXES_BY_MAT_AND_STATUS,
};

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
  targetCount: 30,
  isStretch: false,
  inputFields: waveInputFields("fall"),
  outputFields: waveOutputFields(
    "Fall allows \"celebrating\" when the trend is genuinely down; otherwise prefer \"normalizing\".",
  ),
  inputSchema: waveInputSchema,
  outputSchema: waveOutputSchema,
  stackAxes: STACK_AXES_BY_MAT_AND_STATUS,
};

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
  targetCount: 30,
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
  stackAxes: STACK_AXES_BY_MAT_AND_STATUS,
};

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
  targetCount: 25,
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
  stackAxes: STACK_AXES_BY_MAT_AND_STATUS,
};

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
  targetCount: 20,
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
  stackAxes: {
    rowKey: "matType",
    rowLabel: "MAT",
    rowOptions: MAT_TYPES,
    colKey: "topTrigger",
    colLabel: "Top trigger",
    colOptions: TRIGGER_CATEGORIES,
  },
};

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
