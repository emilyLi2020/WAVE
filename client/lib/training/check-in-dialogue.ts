/**
 * Canonical copy for check-in training transcripts and form scaffolding.
 * Intake (baseline) lives in structured context only; the patient names the
 * current score in reply to this prompt.
 */
export const CHECK_IN_CURRENT_URGE_SCALE_PROMPT =
  "On a scale of 1 to 10, how intense is the craving or urge right now?";

/**
 * Check-in 2 — Turn 1 only (after body-scan chunk). Matches
 * `CHECK_IN_OPENERS[2].turn1` in `client/lib/prompts/check-in-openers.ts`.
 */
export const CHECK_IN_CHUNK2_SCORE_PROMPT =
  "Craving score right now, 1 to 10?";

/**
 * Check-in 2 — body-awareness question (Turn 2 opener). Must appear verbatim on
 * the first WAVE turn after the patient gives their score; it follows the
 * score-reflection clause per PRD.
 */
export const CHECK_IN_BODY_URGE_LOCATION_PROMPT =
  "Were you able to locate where the urge lives in your body?";

/**
 * Readiness ask before Chunk 3 (sound anchor). Matches `CHECK_IN_OPENERS[2].turn5`.
 */
export const CHECK_IN_CHUNK2_READINESS_PROMPT =
  "Ready to continue with the next part, the sound anchor, and see if it helps?";

/** Asked after validating the obstacle; before any coping instructions. */
export const CHECK_IN_COPING_CONSENT_PROMPT =
  "Would you like to try some coping strategies together to see if it helps?";

/**
 * First clause of WAVE’s turn immediately after the patient agrees to coping—keeps
 * continuity before concrete instructions (see `lora-check-in-1` training rules).
 */
export const CHECK_IN_COPING_BRIDGE_OPENER = "Great, let's try this together.";
