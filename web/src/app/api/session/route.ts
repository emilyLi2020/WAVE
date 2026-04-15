import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  WAVE_SYSTEM_PROMPT,
  buildPromptForStep,
  extractTextContent,
} from "@/lib/prompts";
import type { BodyRegion, IntakeData, SessionLog } from "@/lib/types";

const MODEL = "claude-sonnet-4-20250514";

const triggerEnum = z.enum([
  "stress_emotions",
  "social",
  "physical",
  "unknown",
  "other",
]);

const medStatusEnum = z.enum([
  "taken_on_time",
  "taken_late",
  "missed",
  "not_applicable",
]);

const medTypeEnum = z.enum([
  "buprenorphine",
  "naltrexone_oral",
  "naltrexone_vivitrol",
  "methadone",
  "none",
]);

const intakeSchema = z.object({
  intensity: z.number().int().min(1).max(10),
  trigger: triggerEnum,
  medStatus: medStatusEnum,
  medType: medTypeEnum,
});

const sessionLogSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  intensityStart: z.number(),
  intensityEnd: z.number().nullable(),
  trigger: triggerEnum,
  medStatus: medStatusEnum,
  medType: medTypeEnum,
  bodyLocation: z.string().nullable(),
  completed: z.boolean(),
  journalNote: z.string().nullable(),
  nextStepChoice: z.string().nullable().optional(),
});

const requestSchema = z.object({
  step: z.enum(["med_ack", "body_scan", "wave_phase", "reflection"]),
  intake: intakeSchema,
  sessionHistory: z.array(sessionLogSchema).optional().default([]),
  extra: z
    .object({
      bodyLocation: z.string().optional(),
      phase: z.enum(["rising", "peak", "falling"]).optional(),
      currentIntensity: z.number().optional(),
      intensityEnd: z.number().optional(),
    })
    .optional()
    .default({}),
});

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Missing ANTHROPIC_API_KEY in environment." },
      { status: 500 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { step, intake, sessionHistory, extra } = parsed.data;
  const intakeData = intake as IntakeData;
  const history = sessionHistory as SessionLog[];

  let userPrompt: string;
  try {
    userPrompt = buildPromptForStep(step, intakeData, history, {
      bodyLocation: extra.bodyLocation as BodyRegion | undefined,
      phase: extra.phase,
      currentIntensity: extra.currentIntensity,
      intensityEnd: extra.intensityEnd,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid prompt extras";
    return Response.json({ error: message }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey });

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: step === "wave_phase" ? 700 : 600,
    system: WAVE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = extractTextContent(
    msg.content as { type: string; text?: string }[],
  );

  return Response.json({ text });
}
