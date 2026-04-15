"use client";

import type { BodyRegion } from "@/lib/types";

const REGIONS: { id: BodyRegion; label: string; cx: number; cy: number; r: number }[] = [
  { id: "chest", label: "Chest", cx: 100, cy: 95, r: 18 },
  { id: "stomach", label: "Stomach", cx: 100, cy: 135, r: 18 },
  { id: "throat", label: "Throat", cx: 100, cy: 48, r: 14 },
  { id: "shoulders", label: "Shoulders", cx: 70, cy: 78, r: 14 },
  { id: "jaw", label: "Jaw", cx: 100, cy: 58, r: 12 },
  { id: "hands", label: "Hands", cx: 52, cy: 175, r: 12 },
  { id: "legs", label: "Legs", cx: 100, cy: 205, r: 20 },
];

type Props = {
  selected: BodyRegion | null;
  onSelect: (region: BodyRegion) => void;
};

export function BodyDiagramSvg({ selected, onSelect }: Props) {
  return (
    <div className="mx-auto max-w-xs">
      <p className="mb-3 text-center text-sm text-foreground/70">
        Tap where you feel the urge most.
      </p>
      <svg
        viewBox="0 0 200 260"
        className="w-full overflow-visible"
        role="img"
        aria-label="Body map for selecting sensation location"
      >
        <path
          d="M100 20 C 78 20 65 38 65 58 C 65 78 55 95 55 115 L 55 175 C 55 195 70 215 100 235 C 130 215 145 195 145 175 L 145 115 C 145 95 135 78 135 58 C 135 38 122 20 100 20 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-foreground/25"
        />
        {REGIONS.map((r) => {
          const isSel = selected === r.id;
          return (
            <g key={r.id}>
              <circle
                cx={r.cx}
                cy={r.cy}
                r={r.r}
                onClick={() => onSelect(r.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(r.id);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Select ${r.label}`}
                className={`cursor-pointer transition-colors ${
                  isSel
                    ? "fill-foreground/30 stroke-foreground"
                    : "fill-foreground/5 stroke-foreground/30 hover:fill-foreground/15"
                }`}
                strokeWidth="1.5"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
