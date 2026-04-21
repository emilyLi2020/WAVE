"use client";

import { type ReactNode } from "react";

interface Props {
  title: string;
  badge: string;
  loading: boolean;
  source?: "model" | "fallback";
  children?: ReactNode;
  footer?: ReactNode;
}

export function NarrationCard({
  title,
  badge,
  loading,
  source,
  children,
  footer,
}: Props) {
  return (
    <article className="rounded-2xl border border-border bg-surface p-6">
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          {source === "fallback" ? (
            <span className="text-[10px] uppercase tracking-wide rounded-full border border-warn/40 bg-warn-soft px-2 py-0.5 text-warn">
              Offline narration
            </span>
          ) : null}
          <span className="text-xs uppercase tracking-wide text-foreground/50">
            {badge}
          </span>
        </div>
      </header>

      <div className="mt-4 min-h-[5rem] text-foreground/90 leading-relaxed">
        {loading ? (
          <p className="flex items-center gap-2 text-foreground/60">
            <span
              aria-hidden
              className="inline-block size-2 rounded-full bg-accent animate-pulse"
            />
            WAVE is writing your narration…
          </p>
        ) : (
          children
        )}
      </div>

      {footer ? <div className="mt-6">{footer}</div> : null}
    </article>
  );
}
