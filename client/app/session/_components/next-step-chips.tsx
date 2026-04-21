"use client";

import { useState } from "react";

interface Props {
  options: readonly string[];
  onPick: (choice: string) => void;
}

export function NextStepChips({ options, onPick }: Props) {
  const [picked, setPicked] = useState<string | null>(null);

  function handlePick(choice: string) {
    setPicked(choice);
    onPick(choice);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => handlePick(option)}
          aria-pressed={picked === option}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
            picked === option
              ? "border-accent bg-accent text-accent-foreground"
              : "border-border bg-surface-muted hover:border-accent hover:text-accent"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
