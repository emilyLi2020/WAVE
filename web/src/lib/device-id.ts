const DEVICE_KEY = "wave_device_id";

/** Stable per-browser id for Supabase rows (not authentication). */
export function getWaveDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
