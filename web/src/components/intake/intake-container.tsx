"use client";

import { useState } from "react";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { IntakeCravingSlider } from "@/components/intake/intake-craving-slider";
import { IntakeMedStatus } from "@/components/intake/intake-med-status";
import { IntakeTriggerPicker } from "@/components/intake/intake-trigger-picker";
import type { MedStatus, TriggerCategory } from "@/lib/types";

type Props = {
  medTypeLabel: string;
  onSubmit: (payload: {
    intensity: number;
    trigger: TriggerCategory;
    medStatus: MedStatus;
  }) => void;
};

export function IntakeContainer({ medTypeLabel, onSubmit }: Props) {
  const [intensity, setIntensity] = useState(5);
  const [trigger, setTrigger] = useState<TriggerCategory | null>(null);
  const [medStatus, setMedStatus] = useState<MedStatus | null>(null);

  const canSubmit = trigger != null && medStatus != null;

  return (
    <Card>
      <div className="space-y-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">
            Medication profile
          </p>
          <p className="mt-1 text-sm text-foreground/70">{medTypeLabel}</p>
        </div>
        <IntakeCravingSlider value={intensity} onChange={setIntensity} />
        <IntakeMedStatus value={medStatus} onChange={setMedStatus} />
        <IntakeTriggerPicker value={trigger} onChange={setTrigger} />
        <Button
          className="w-full"
          disabled={!canSubmit}
          onClick={() => {
            if (trigger == null || medStatus == null) return;
            onSubmit({ intensity, trigger, medStatus });
          }}
        >
          Start with acknowledgment
        </Button>
      </div>
    </Card>
  );
}
