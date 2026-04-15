"use client";

import { Activity, Heart, HelpCircle, MoreHorizontal, Users } from "lucide-react";
import type { TriggerCategory } from "@/lib/types";

const TRIGGERS: {
  value: TriggerCategory;
  label: string;
  Icon: typeof Heart;
}[] = [
  { value: "stress_emotions", label: "Stress / emotions", Icon: Heart },
  { value: "social", label: "Social", Icon: Users },
  { value: "physical", label: "Physical", Icon: Activity },
  { value: "unknown", label: "Not sure", Icon: HelpCircle },
  { value: "other", label: "Other", Icon: MoreHorizontal },
];

type Props = {
  value: TriggerCategory | null;
  onChange: (value: TriggerCategory) => void;
};

export function IntakeTriggerPicker({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">What is up right now?</p>
      <div className="flex flex-wrap gap-2">
        {TRIGGERS.map(({ value: v, label, Icon }) => {
          const selected = value === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              className={`flex min-w-[6.5rem] flex-1 flex-col items-center gap-1 rounded-xl border px-3 py-3 text-center text-xs font-medium transition-colors sm:flex-none ${
                selected
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/15 bg-background text-foreground hover:border-foreground/30"
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
