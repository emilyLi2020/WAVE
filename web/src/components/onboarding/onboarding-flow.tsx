"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { MED_TYPES, medTypeLabel } from "@/lib/medications";
import type { MedProfile, MedType } from "@/lib/types";
import { useUserStore } from "@/store/userStore";

type Step = "welcome" | "med";

export function OnboardingFlow() {
  const router = useRouter();
  const setMedProfile = useUserStore((s) => s.setMedProfile);
  const [step, setStep] = useState<Step>("welcome");
  const [medType, setMedType] = useState<MedType>("buprenorphine");
  const [usualDoseTime, setUsualDoseTime] = useState("08:00");
  const [vivWeek, setVivWeek] = useState<number | null>(null);

  const finish = async () => {
    const profile: MedProfile = {
      medType,
      usualDoseTime,
      onVivitrolWeek: medType === "naltrexone_vivitrol" ? vivWeek : null,
    };
    await setMedProfile(profile);
    router.push("/dashboard");
  };

  if (step === "welcome") {
    return (
      <Card>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to WAVE</h1>
        <p className="mt-3 text-sm leading-relaxed text-foreground/75">
          WAVE is an urge-surfing companion grounded in mindfulness-based relapse
          prevention. This web version stores sessions on{" "}
          <strong>this device only</strong> for the MVP. It does not replace
          medical care, your prescriber, or emergency services. If you are in
          immediate danger, contact{" "}
          <strong>988</strong> (US) or your local crisis line.
        </p>
        <Button className="mt-8 w-full" onClick={() => setStep("med")}>
          Continue
        </Button>
      </Card>
    );
  }

  if (step === "med") {
    return (
      <Card>
        <h2 className="text-lg font-semibold">Medication setup</h2>
        <p className="mt-2 text-sm text-foreground/65">
          This shapes medication-aware language in your sessions. You can change
          it later by clearing browser storage or a future settings screen.
        </p>
        <div className="mt-6 space-y-3">
          <label className="text-xs font-medium uppercase tracking-wide text-foreground/50">
            Medication type
          </label>
          <div className="flex flex-col gap-2">
            {MED_TYPES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMedType(m)}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                  medType === m
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/15 hover:border-foreground/30"
                }`}
              >
                {medTypeLabel(m)}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-6 space-y-2">
          <label
            className="text-xs font-medium uppercase tracking-wide text-foreground/50"
            htmlFor="dose"
          >
            Usual dose time (local)
          </label>
          <input
            id="dose"
            type="time"
            value={usualDoseTime}
            onChange={(e) => setUsualDoseTime(e.target.value)}
            className="w-full rounded-xl border border-foreground/15 bg-background px-3 py-2 text-sm"
          />
        </div>
        {medType === "naltrexone_vivitrol" ? (
          <div className="mt-4 space-y-2">
            <label className="text-xs font-medium text-foreground/50">
              Vivitrol week (1–4) — optional
            </label>
            <select
              value={vivWeek ?? ""}
              onChange={(e) =>
                setVivWeek(e.target.value ? Number(e.target.value) : null)
              }
              className="w-full rounded-xl border border-foreground/15 bg-background px-3 py-2 text-sm"
            >
              <option value="">Not specified</option>
              {[1, 2, 3, 4].map((w) => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Button className="mt-8 w-full" onClick={finish}>
          Save and open dashboard
        </Button>
      </Card>
    );
  }

  return null;
}

