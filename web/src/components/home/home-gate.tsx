"use client";

import { useEffect } from "react";
import Link from "next/link";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { Card } from "@/components/shared/card";
import { useUserStore } from "@/store/userStore";

export function HomeGate() {
  const { hydrated, medProfile, hydrate } = useUserStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-20">
        <p className="text-sm text-foreground/50">Loading…</p>
      </div>
    );
  }

  if (!medProfile) {
    return (
      <div className="mx-auto flex max-w-lg flex-1 flex-col justify-center px-4 py-12">
        <OnboardingFlow />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-1 flex-col justify-center gap-6 px-4 py-12">
      <Card>
        <h1 className="text-2xl font-semibold tracking-tight">You are set up</h1>
        <p className="mt-2 text-sm leading-relaxed text-foreground/70">
          When a craving shows up, start a guided session. Your history stays in
          this browser until you connect a backend.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/dashboard"
            className="inline-flex h-12 items-center justify-center rounded-full bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Open dashboard
          </Link>
          <Link
            href="/session"
            className="inline-flex h-12 items-center justify-center rounded-full border border-foreground/20 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
          >
            Start a session now
          </Link>
        </div>
      </Card>
    </div>
  );
}
