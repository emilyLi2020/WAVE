/**
 * Canonical pharmacology snippets for the medication-aware
 * acknowledgment surface (`lora-med-ack`).
 *
 * **Why this is a lookup table, not training signal.**
 *
 * Pharmacology is *factual*. The half-life of buprenorphine is the
 * half-life of buprenorphine; we don't need to teach the model that via
 * fine-tuning. We need the model to take a fact (provided in the
 * prompt) and *frame it* in a trauma-informed voice. Voice is the
 * learned behavior; the fact is data.
 *
 * Each entry is an FDA / SAMHSA-cited snippet keyed by (matType,
 * medicationStatus). The med-ack route injects the snippet into the
 * prompt as a slot; the doctor's seed examples in /training only need
 * to demonstrate the *framing* around the snippet, not the snippet
 * itself.
 *
 * Sources:
 * - Suboxone (buprenorphine/naloxone) FDA label, §12.3 Pharmacokinetics
 * - Vivitrol (extended-release naltrexone) FDA label, §12.2 Pharmacodynamics
 * - SAMHSA TIP 63: Medications for Opioid Use Disorder
 * - Methadone hydrochloride FDA label
 *
 * Copy below is a paraphrase calibrated for plain-English in-app use,
 * not a quote. Any change must cite the underlying source.
 */

import type { MatType, MedicationStatus } from "@/types/models";

export type PharmacologyCitation =
  | "FDA_LABEL"
  | "SAMHSA_TIP63"
  | "MBRP_FACILITATOR"
  | "NONE";

export interface PharmacologySnippet {
  /** Stable id for logging + spec validation. */
  id: string;
  matType: MatType;
  medicationStatus: MedicationStatus;
  /** Plain-English paragraph the prompt injects as a fact slot. */
  claim: string;
  /** Source the snippet is calibrated against. */
  citation: PharmacologyCitation;
  /** Free-text source pointer for clinician review. */
  citationDetail: string;
}

const SNIPPETS: PharmacologySnippet[] = [
  // ---------- Buprenorphine ----------
  {
    id: "bup-on-time",
    matType: "buprenorphine",
    medicationStatus: "on_time",
    claim:
      "Your buprenorphine is on board. It is occupying your mu-opioid receptors right now and will keep doing so for roughly the next 24 to 72 hours, which is why what you are feeling at this intensity would be sharper without it.",
    citation: "FDA_LABEL",
    citationDetail:
      "Suboxone FDA label §12.3 (long elimination half-life, 24–72 h receptor occupancy)",
  },
  {
    id: "bup-late",
    matType: "buprenorphine",
    medicationStatus: "late",
    claim:
      "A late dose still gives you partial coverage. Buprenorphine has a long half-life, so receptor occupancy from your last dose has not dropped to zero, even if it feels like it has.",
    citation: "FDA_LABEL",
    citationDetail: "Suboxone FDA label §12.3",
  },
  {
    id: "bup-missed",
    matType: "buprenorphine",
    medicationStatus: "missed",
    claim:
      "You have less buprenorphine on board than usual today. The craving you are feeling is real, and part of what you are feeling is the gap your normal dose would have covered. Your next dose will start to close that gap again.",
    citation: "SAMHSA_TIP63",
    citationDetail:
      "SAMHSA TIP 63 — missed-dose framing for buprenorphine maintenance",
  },

  // ---------- Methadone ----------
  {
    id: "meth-on-time",
    matType: "methadone",
    medicationStatus: "on_time",
    claim:
      "Your methadone is working. The half-life is long — roughly 24 to 36 hours — so a single dose provides receptor coverage for at least a full day.",
    citation: "FDA_LABEL",
    citationDetail: "Methadone FDA label §12.3",
  },
  {
    id: "meth-late",
    matType: "methadone",
    medicationStatus: "late",
    claim:
      "A late methadone dose still gives you coverage. The long half-life means yesterday's dose has not fully cleared, even at the trough.",
    citation: "FDA_LABEL",
    citationDetail: "Methadone FDA label §12.3",
  },
  {
    id: "meth-missed",
    matType: "methadone",
    medicationStatus: "missed",
    claim:
      "You have less methadone on board than usual. The craving you are feeling is partly the gap from a missed dose. Your prescriber is the right person to ask about how to restart safely; for right now, we will work with what you have.",
    citation: "SAMHSA_TIP63",
    citationDetail:
      "SAMHSA TIP 63 — methadone missed-dose guidance (re-induction may be required after multiple missed doses)",
  },

  // ---------- Naltrexone (oral) ----------
  {
    id: "nal-on-time",
    matType: "naltrexone",
    medicationStatus: "on_time",
    claim:
      "Your naltrexone is active. It is occupying the opioid receptors a use right now would target, which means the high your brain is anticipating is not available the way it expects.",
    citation: "FDA_LABEL",
    citationDetail: "Naltrexone HCl FDA label §12.2",
  },
  {
    id: "nal-late",
    matType: "naltrexone",
    medicationStatus: "late",
    claim:
      "A late dose of oral naltrexone still gives you partial blockade from yesterday's dose. The protection is not zero.",
    citation: "FDA_LABEL",
    citationDetail: "Naltrexone HCl FDA label §12.3",
  },
  {
    id: "nal-missed",
    matType: "naltrexone",
    medicationStatus: "missed",
    claim:
      "Without today's naltrexone, you have less receptor blockade than usual. The craving feels louder partly because the medication that quiets it is not on board.",
    citation: "SAMHSA_TIP63",
    citationDetail: "SAMHSA TIP 63 — oral naltrexone adherence",
  },

  // ---------- Vivitrol (extended-release naltrexone) ----------
  {
    id: "viv-on-time",
    matType: "vivitrol",
    medicationStatus: "on_time",
    claim:
      "Your Vivitrol injection is active. A single dose blocks opioid receptors for about 28 to 30 days, so the medication is doing its job right now whether or not you can feel it.",
    citation: "FDA_LABEL",
    citationDetail: "Vivitrol FDA label §12.2 (28–30 day duration)",
  },
  {
    id: "viv-late",
    matType: "vivitrol",
    medicationStatus: "late",
    claim:
      "A late Vivitrol injection still gives you carryover from your previous one. Receptor blockade from the prior dose has not cleared, even past the 28-day mark.",
    citation: "FDA_LABEL",
    citationDetail: "Vivitrol FDA label §12.3",
  },
  {
    id: "viv-missed",
    matType: "vivitrol",
    medicationStatus: "missed",
    claim:
      "Without your scheduled Vivitrol injection, you have less blockade than usual today. The craving you are feeling is real, and so is the gap.",
    citation: "SAMHSA_TIP63",
    citationDetail: "SAMHSA TIP 63 — extended-release naltrexone non-adherence",
  },

  // ---------- No MAT ----------
  {
    id: "none-baseline",
    matType: "none",
    medicationStatus: "none",
    claim:
      "You are working with what your body has, without MAT support today.",
    citation: "MBRP_FACILITATOR",
    citationDetail:
      "MBRP facilitator manual — non-pharmacology craving framing",
  },
];

const KEY = (matType: MatType, status: MedicationStatus) =>
  `${matType}::${status}`;

const SNIPPET_INDEX: ReadonlyMap<string, PharmacologySnippet> = new Map(
  SNIPPETS.map((snippet) => [
    KEY(snippet.matType, snippet.medicationStatus),
    snippet,
  ]),
);

/**
 * Look up the canonical pharmacology snippet for a (matType, status)
 * pair. Returns `null` for combinations that don't have a calibrated
 * snippet (the med-ack route is expected to fall back to a no-claim
 * acknowledgment in that case).
 */
export function getPharmacologySnippet(
  matType: MatType,
  medicationStatus: MedicationStatus,
): PharmacologySnippet | null {
  return SNIPPET_INDEX.get(KEY(matType, medicationStatus)) ?? null;
}

export function listPharmacologySnippets(): readonly PharmacologySnippet[] {
  return SNIPPETS;
}
