"use client";

import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";

type Props = {
  intensity: number;
  text: string | null;
  loading: boolean;
  onContinue: () => void;
};

export function MedAckScreen({
  intensity,
  text,
  loading,
  onContinue,
}: Props) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-foreground/50">
          Intensity
        </span>
        <span className="rounded-full bg-foreground/10 px-3 py-1 text-sm font-semibold tabular-nums">
          {intensity} / 10
        </span>
      </div>
      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <div className="h-4 w-full animate-pulse rounded bg-foreground/10" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-foreground/10" />
          <div className="h-4 w-full animate-pulse rounded bg-foreground/10" />
        </div>
      ) : (
        <div className="max-w-none text-sm leading-relaxed text-foreground/90">
          {text?.split("\n\n").map((para, i) => (
            <p key={i} className="mb-3 last:mb-0">
              {para}
            </p>
          ))}
        </div>
      )}
      <div className="mt-8">
        <Button
          variant="primary"
          className="w-full"
          disabled={loading || !text}
          onClick={onContinue}
        >
          Continue to body scan
        </Button>
      </div>
    </Card>
  );
}
