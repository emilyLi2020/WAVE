import { notFound } from "next/navigation";

/**
 * Single env-flag gate for the entire /training surface.
 *
 * Every route under client/app/training/ and every Route Handler under
 * client/app/api/training/ must call this first. If the flag is anything
 * other than the literal string "true", the request 404s as if the route
 * doesn't exist — which is the "remove before deploy" knob.
 *
 * NEXT_PUBLIC_TRAINING_ENABLED is intentionally NEXT_PUBLIC so the Server
 * Components can read it directly. The value itself isn't a secret; it's
 * a kill switch.
 */
export function assertTrainingEnabled(): void {
  if (process.env.NEXT_PUBLIC_TRAINING_ENABLED !== "true") {
    notFound();
  }
}

export function isTrainingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TRAINING_ENABLED === "true";
}
