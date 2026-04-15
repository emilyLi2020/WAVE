"use client";

type Props = {
  value: number;
  onChange: (value: number) => void;
};

export function IntakeCravingSlider({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">Craving strength</span>
        <span className="tabular-nums text-foreground/70">{value} / 10</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-3 w-full cursor-pointer accent-foreground"
        aria-valuemin={1}
        aria-valuemax={10}
        aria-valuenow={value}
        aria-label="Craving intensity from 1 to 10"
      />
      <div className="flex justify-between text-xs text-foreground/50">
        <span>Mild</span>
        <span>Intense</span>
      </div>
    </div>
  );
}
