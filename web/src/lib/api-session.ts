import type { IntakeData, SessionApiStep, SessionLog } from "@/lib/types";

export type SessionExtra = {
  bodyLocation?: string;
  phase?: "rising" | "peak" | "falling";
  currentIntensity?: number;
  intensityEnd?: number;
};

export async function postSessionStep(
  step: SessionApiStep,
  intake: IntakeData,
  sessionHistory: SessionLog[],
  extra: SessionExtra = {},
): Promise<string> {
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step, intake, sessionHistory, extra }),
  });
  const data = (await res.json()) as { text?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "Session API request failed");
  }
  if (!data.text) {
    throw new Error("Empty response from session API");
  }
  return data.text;
}
