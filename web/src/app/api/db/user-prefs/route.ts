import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { UserPrefs } from "@/lib/types";
import { z } from "zod";

const prefsSchema = z.object({
  name: z.string().optional(),
  usualDoseTime: z.string().optional(),
  timezone: z.string(),
  notificationPrefs: z.object({
    inAppRemindersEnabled: z.boolean(),
  }),
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

  const { data, error } = await admin
    .from("wave_user_prefs")
    .select("prefs")
    .eq("device_id", id)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const prefs = (data?.prefs ?? null) as UserPrefs | null;
  return Response.json({ prefs });
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

  const parsed = prefsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid prefs", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const prefs = parsed.data as UserPrefs;

  const { error } = await admin.from("wave_user_prefs").upsert(
    {
      device_id: id,
      prefs,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "device_id" },
  );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
