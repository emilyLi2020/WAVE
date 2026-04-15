"use client";

import type { MedStatus } from "@/lib/types";

const OPTIONS: { value: MedStatus; label: string }[] = [
  { value: "taken_on_time", label: "On time" },
  { value: "taken_late", label: "Late" },
  { value: "missed", label: "Missed" },
  { value: "not_applicable", label: "N/A" },
];

type Props = {
  value: MedStatus | null;
  onChange: (value: MedStatus) => void;
};

export function IntakeMedStatus({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">
        Medication today (MOUD / naltrexone)
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`min-h-12 rounded-xl border px-2 py-3 text-sm font-medium transition-colors ${
                selected
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/15 bg-background text-foreground hover:border-foreground/30"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
