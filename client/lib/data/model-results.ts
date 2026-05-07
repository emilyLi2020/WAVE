export const MODEL_RESULT = {
  loraId: "lora-phase-narration",
  baseModel: "google/gemma-4-E2B-it",
  adapter: "Phase narration LoRA",
  claim:
    "Fine-tuning improved held-out completion likelihood and reference similarity while preserving WAVE's structured-output, style, and safety gates.",
  badges: [
    "Gemma 4 E2B-it",
    "QLoRA",
    "50 examples",
    "10 held-out evals",
    "RTX 5080",
  ],
  dataset: {
    totalExamples: 50,
    trainExamples: 40,
    heldOutExamples: 10,
    split: "80 / 20",
    seed: 7,
    source:
      "10 clinician seed rows plus 40 deterministic synthetic draft rows.",
  },
  training: {
    method: "PEFT LoRA / QLoRA with TRL SFTTrainer",
    epochs: "0.5 requested, 0.6 effective",
    optimizerSteps: 3,
    learningRate: "5e-5",
    loraRank: 8,
    loraAlpha: 16,
    quantization: "4-bit NF4",
    target:
      "Language-model attention and MLP projections only, excluding the vision tower.",
  },
  adapterCheck: {
    label: "Adapter changed",
    value: "lora_B nonzero",
    detail: "B_total_norm 0.8851 across 410 adapter tensors",
  },
} as const;

export const SCORE_CARDS = [
  {
    label: "Completion NLL",
    base: "4.7676",
    lora: "4.7097",
    delta: "-0.0579",
    interpretation:
      "Lower is better. This is the closest language-model equivalent to a traditional ML loss.",
  },
  {
    label: "Perplexity",
    base: "117.63",
    lora: "111.02",
    delta: "-6.61",
    interpretation:
      "Lower means the desired WAVE narration was more likely under the model.",
  },
  {
    label: "WAVE score",
    base: "67.29",
    lora: "70.44",
    delta: "+3.15",
    interpretation:
      "Composite score combining loss improvement, format, style, safety, and reference similarity.",
  },
  {
    label: "Token F1",
    base: "0.2924",
    lora: "0.3052",
    delta: "+0.0128",
    interpretation:
      "The LoRA output had more token overlap with held-out reference narration.",
  },
  {
    label: "ROUGE-L",
    base: "0.1651",
    lora: "0.1765",
    delta: "+0.0114",
    interpretation:
      "The LoRA output was slightly closer to reference sequence structure.",
  },
] as const;

export const QUALITY_GATES = [
  {
    label: "JSON validity",
    base: "100%",
    lora: "100%",
    description: "Output parsed cleanly as JSON.",
  },
  {
    label: "Schema pass",
    base: "100%",
    lora: "100%",
    description: "Output contained exactly six valid narration lines.",
  },
  {
    label: "Patient-facing style",
    base: "100%",
    lora: "100%",
    description: "Second-person narration, no clinical-note voice.",
  },
  {
    label: "Safety pass",
    base: "100%",
    lora: "100%",
    description: "No toxic positivity, pause markers, or phase announcements.",
  },
  {
    label: "Medication safety",
    base: "100%",
    lora: "100%",
    description: "No advice to start, stop, change, or skip medication.",
  },
] as const;

export const SCORE_WEIGHTS = [
  { label: "NLL improvement", value: 25 },
  { label: "JSON validity", value: 10 },
  { label: "Schema pass", value: 15 },
  { label: "Style pass", value: 20 },
  { label: "Safety + medication", value: 20 },
  { label: "Reference similarity", value: 10 },
] as const;

export const EXAMPLE_COMPARISON = {
  promptSummary:
    "Chunk 1 settle-in narration for a patient starting at 4/10 intensity, on-time naltrexone, stress trigger, and no substance use today.",
  baseLines: [
    "Settle into your seat right now",
    "Feel your body where you are",
    "Notice the weight of your body",
    "Allow the breath to be gentle",
    "We are just here",
    "This moment is safe",
  ],
  loraLines: [
    "Find a place where you can feel supported right now",
    "Allow your body to settle into the chair or the floor",
    "Notice the weight of your body against the surface beneath you",
    "Feel the air around you, just as it is",
    "Breathe in, and breathe out",
    "Rest in this moment",
  ],
} as const;

export const CAVEATS = [
  "This is a contest proof-of-concept, not a production clinical validation.",
  "The held-out set has 10 examples, so the result is useful but not statistically strong.",
  "Synthetic draft rows should be clinician-reviewed before clinical claims.",
  "The checked-in web demo still uses local Gemma plus the clinician-reviewed fallback bank.",
] as const;
