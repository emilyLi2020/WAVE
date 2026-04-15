"use client";

type Props = {
  value: number;
  onChange: (value: number) => void;
};

export function WaveIntensitySlider({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="font-medium">Live intensity</span>
        <span className="tabular-nums text-foreground/70">{value} / 10</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-3 w-full cursor-pointer accent-sky-500"
        aria-label="Update craving intensity during the wave"
      />
    </div>
  );
}
