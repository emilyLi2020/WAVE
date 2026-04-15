import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-foreground/10 bg-background/80 p-5 shadow-sm ${className}`.trim()}
    >
      {children}
    </div>
  );
}
