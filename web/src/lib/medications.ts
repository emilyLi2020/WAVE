import type { MedType } from "@/lib/types";

const LABELS: Record<MedType, string> = {
  buprenorphine: "Buprenorphine (e.g. Suboxone, Subutex)",
  naltrexone_oral: "Oral naltrexone (daily)",
  naltrexone_vivitrol: "Vivitrol (monthly injection)",
  methadone: "Methadone",
  none: "Not on medication / prefer not to say",
};

export function medTypeLabel(medType: MedType): string {
  return LABELS[medType];
}

export const MED_TYPES: MedType[] = [
  "buprenorphine",
  "naltrexone_oral",
  "naltrexone_vivitrol",
  "methadone",
  "none",
];
