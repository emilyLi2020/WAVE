import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  sessionLogToInsert,
  sessionRowToLog,
  type SessionRow,
} from "@/lib/supabase-mappers";
import type { SessionLog } from "@/lib/types";
import { z } from "zod";

const sessionLogSchema = z.object({
  id: z.string().uuid(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  intensityStart: z.number(),
  intensityEnd: z.number().nullable(),
  trigger: z.string(),
  medStatus: z.string(),
  medType: z.string(),
  bodyLocation: z.string().nullable(),
  completed: z.boolean(),
  journalNote: z.string().nullable(),
  nextStepChoice: z.string().nullable().optional(),
});

function deviceId(req: Request): string | null {
  return req.headers.get("x-wave-device-id");
}

export async function GET(req: Request) {
  const id = deviceId(req);
  if (!id) {
    return Response.json({ error: "Missing X-Wave-Device-Id header" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("wave_sessions")
    .select("*")
    .eq("device_id", id)
    .gte("started_at", cutoff)
    .order("started_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const sessions = (data ?? []).map((row) => sessionRowToLog(row as SessionRow));

  return Response.json({ sessions } satisfies { sessions: SessionLog[] });
}

export async function POST(req: Request) {
  const id = deviceId(req);
  if (!id) {
    return Response.json({ error: "Missing X-Wave-Device-Id header" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = sessionLogSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid session", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const log = parsed.data as SessionLog;
  const row = sessionLogToInsert(id, log);

  const { error } = await admin.from("wave_sessions").upsert(row, {
    onConflict: "id",
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
