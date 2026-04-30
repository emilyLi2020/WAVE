"use client";

import type { ReflectionTitle } from "@/lib/gemma/session";

import { NarrationCard } from "./narration-card";

interface Props {
  /**
   * Local Gemma progress titles in arrival order. The latest item is
   * shown as "active" and earlier items collapse to "done". Stable key
   * is `index`, not array position.
   */
  titles: ReadonlyArray<ReflectionTitle>;
}

/**
 * Loading state for the reflection phase. While the model is
 * synthesising the closing insight, we surface small milestones as an
 * animated checklist so the patient sees progress instead of staring
 * at a static spinner.
 *
 * Pure presentation — no fetching. The parent
 * (`session-machine.tsx > ReflectionPhaseBlock`) drives the title list
 * via `generateReflection`'s onTitle callback and swaps this component
 * out for the regular `NarrationCard` once the structured payload
 * resolves.
 */
export function ReflectionProgress({ titles }: Props) {
  const lastIndex = titles.length - 1;

  return (
    <NarrationCard
      title="Reflection"
      badge="Phase 5 of 5"
      loading={false}
    >
      {titles.length === 0 ? (
        <p className="flex items-center gap-2 text-foreground/60">
          <span
            aria-hidden
            className="inline-block size-2 rounded-full bg-accent animate-pulse"
          />
          Thinking through your session…
        </p>
      ) : (
        <ol
          className="space-y-2"
          aria-live="polite"
          aria-label="Reflection in progress"
        >
          {titles.map((title, position) => {
            const isActive = position === lastIndex;
            return (
              <li
                key={title.index}
                className="flex items-start gap-3 text-sm leading-snug animate-fade-in-up"
              >
                <span
                  aria-hidden
                  className={
                    isActive
                      ? "mt-1.5 inline-block size-2 rounded-full bg-accent animate-pulse"
                      : "mt-1.5 inline-block size-2 rounded-full bg-accent/40"
                  }
                />
                <span
                  className={
                    isActive ? "text-foreground/90" : "text-foreground/55"
                  }
                >
                  {title.text}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </NarrationCard>
  );
}
