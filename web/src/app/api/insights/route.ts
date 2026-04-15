import { z } from "zod";
import {
  getCurrentStreak,
  getHighRiskWindows,
  getMedCorrelation,
  getTopTriggers,
} from "@/lib/patterns";
import type { SessionLog } from "@/lib/types";

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
  sessions: z.array(sessionLogSchema),
});

export async function POST(req: Request) {
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

  const sessions = parsed.data.sessions as SessionLog[];

  return Response.json({
    highRiskWindows: getHighRiskWindows(sessions),
    medCorrelation: getMedCorrelation(sessions),
    topTriggers: getTopTriggers(sessions),
    streakData: { currentStreak: getCurrentStreak(sessions) },
  });
}
