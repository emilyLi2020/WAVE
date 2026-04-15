import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  medProfileToRow,
  medRowToProfile,
  type MedProfileRow,
} from "@/lib/supabase-mappers";
import type { MedProfile } from "@/lib/types";
import { z } from "zod";

const profileSchema = z.object({
  medType: z.enum([
    "buprenorphine",
    "naltrexone_oral",
    "naltrexone_vivitrol",
    "methadone",
    "none",
  ]),
  usualDoseTime: z.string(),
  onVivitrolWeek: z.number().nullable(),
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
    .from("wave_med_profiles")
    .select("*")
    .eq("device_id", id)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return Response.json({ profile: null });
  }

  return Response.json({
    profile: medRowToProfile(data as MedProfileRow),
  });
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

  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid profile", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const profile = parsed.data as MedProfile;
  const row = medProfileToRow(id, profile);

  const { error } = await admin.from("wave_med_profiles").upsert(row, {
    onConflict: "device_id",
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
