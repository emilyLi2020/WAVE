import type { MedProfile, SessionLog, UserPrefs } from "@/lib/types";

const SESSIONS_KEY = "wave_sessions";
const MED_PROFILE_KEY = "wave_med_profile";
const USER_PREFS_KEY = "wave_user_prefs";
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

function trimSessions(sessions: SessionLog[]): SessionLog[] {
  const cutoff = Date.now() - RETENTION_MS;
  return sessions.filter((s) => new Date(s.startedAt).getTime() >= cutoff);
}

export function saveSession(log: SessionLog): void {
  if (typeof window === "undefined") return;
  const existing = getAllSessions();
  const next = trimSessions([log, ...existing.filter((s) => s.id !== log.id)]);
  window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
}

export function getAllSessions(): SessionLog[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SessionLog[];
    if (!Array.isArray(parsed)) return [];
    return parsed.sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  } catch {
    return [];
  }
}

export function saveMedProfile(profile: MedProfile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MED_PROFILE_KEY, JSON.stringify(profile));
}

export function getMedProfile(): MedProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MED_PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MedProfile;
  } catch {
    return null;
  }
}

const defaultPrefs = (): UserPrefs => ({
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
  notificationPrefs: { inAppRemindersEnabled: true },
});

export function saveUserPrefs(prefs: UserPrefs): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_PREFS_KEY, JSON.stringify(prefs));
}

export function getUserPrefs(): UserPrefs {
  if (typeof window === "undefined") return defaultPrefs();
  try {
    const raw = window.localStorage.getItem(USER_PREFS_KEY);
    if (!raw) return defaultPrefs();
    const parsed = JSON.parse(raw) as UserPrefs;
    return {
      ...defaultPrefs(),
      ...parsed,
      notificationPrefs: {
        ...defaultPrefs().notificationPrefs,
        ...parsed.notificationPrefs,
      },
    };
  } catch {
    return defaultPrefs();
  }
}
