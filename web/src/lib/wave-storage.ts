import { getWaveDeviceId } from "@/lib/device-id";
import * as local from "@/lib/storage-local";
import type { MedProfile, SessionLog, UserPrefs } from "@/lib/types";

const defaultPrefs = (): UserPrefs => ({
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
  notificationPrefs: { inAppRemindersEnabled: true },
});

function deviceHeaderOnly(): HeadersInit {
  return { "X-Wave-Device-Id": getWaveDeviceId() };
}

function deviceHeadersJson(): HeadersInit {
  return {
    "X-Wave-Device-Id": getWaveDeviceId(),
    "Content-Type": "application/json",
  };
}

export async function loadSessions(): Promise<SessionLog[]> {
  if (typeof window === "undefined") return [];
  const res = await fetch("/api/db/sessions", {
    method: "GET",
    headers: deviceHeaderOnly(),
  });
  if (res.status === 503) return local.getAllSessionsLocal();
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "Failed to load sessions");
  }
  const data = (await res.json()) as { sessions: SessionLog[] };
  return data.sessions ?? [];
}

export async function persistSession(log: SessionLog): Promise<void> {
  if (typeof window === "undefined") return;
  const res = await fetch("/api/db/sessions", {
    method: "POST",
    headers: deviceHeadersJson(),
    body: JSON.stringify(log),
  });
  if (res.status === 503) {
    local.saveSessionLocal(log);
    return;
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "Failed to save session");
  }
}

export async function loadMedProfile(): Promise<MedProfile | null> {
  if (typeof window === "undefined") return null;
  const res = await fetch("/api/db/med-profile", {
    method: "GET",
    headers: deviceHeaderOnly(),
  });
  if (res.status === 503) return local.getMedProfileLocal();
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "Failed to load med profile");
  }
  const data = (await res.json()) as { profile: MedProfile | null };
  return data.profile ?? null;
}

export async function persistMedProfile(profile: MedProfile): Promise<void> {
  if (typeof window === "undefined") return;
  const res = await fetch("/api/db/med-profile", {
    method: "POST",
    headers: deviceHeadersJson(),
    body: JSON.stringify(profile),
  });
  if (res.status === 503) {
    local.saveMedProfileLocal(profile);
    return;
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "Failed to save med profile");
  }
}

export async function loadUserPrefs(): Promise<UserPrefs> {
  if (typeof window === "undefined") return defaultPrefs();
  const res = await fetch("/api/db/user-prefs", {
    method: "GET",
    headers: deviceHeaderOnly(),
  });
  if (res.status === 503) return local.getUserPrefsLocal();
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "Failed to load prefs");
  }
  const data = (await res.json()) as { prefs: UserPrefs | null };
  if (!data.prefs) return defaultPrefs();
  return {
    ...defaultPrefs(),
    ...data.prefs,
    notificationPrefs: {
      ...defaultPrefs().notificationPrefs,
      ...data.prefs.notificationPrefs,
    },
  };
}

export async function persistUserPrefs(prefs: UserPrefs): Promise<void> {
  if (typeof window === "undefined") return;
  const res = await fetch("/api/db/user-prefs", {
    method: "POST",
    headers: deviceHeadersJson(),
    body: JSON.stringify(prefs),
  });
  if (res.status === 503) {
    local.saveUserPrefsLocal(prefs);
    return;
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "Failed to save prefs");
  }
}
