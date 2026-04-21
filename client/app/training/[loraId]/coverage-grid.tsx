import type { StackAxes } from "@/lib/training/types";
import type { StackCoverage } from "@/lib/training/storage";

interface Props {
  axes: StackAxes;
  coverage: StackCoverage;
}

function shadeFor(count: number): string {
  if (count === 0) return "bg-surface-muted text-foreground/40";
  if (count === 1) return "bg-accent-soft/50 text-foreground/80";
  if (count === 2) return "bg-accent-soft text-foreground";
  return "bg-accent text-accent-foreground font-semibold";
}

export function CoverageGrid({ axes, coverage }: Props) {
  const totalCells = axes.rowOptions.length * axes.colOptions.length;
  let filled = 0;
  for (const row of axes.rowOptions) {
    for (const col of axes.colOptions) {
      if ((coverage[row]?.[col] ?? 0) > 0) filled += 1;
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Stratification coverage</h2>
        <p className="text-xs text-foreground/55">
          {filled}/{totalCells} cells covered ·{" "}
          {axes.rowLabel.toLowerCase()} × {axes.colLabel.toLowerCase()}
        </p>
      </div>
      <p className="mt-1 text-xs text-foreground/55">
        Aim for at least one ready example per cell. Empty cells will under-
        represent that group in the train/test split (docs/model-training.md
        §5).
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="p-1.5 text-left font-medium text-foreground/60">
                {axes.rowLabel} ↓ / {axes.colLabel} →
              </th>
              {axes.colOptions.map((col) => (
                <th
                  key={col}
                  className="p-1.5 text-left font-medium text-foreground/60 whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {axes.rowOptions.map((row) => (
              <tr key={row}>
                <th className="p-1.5 text-left font-medium text-foreground/60 whitespace-nowrap">
                  {row}
                </th>
                {axes.colOptions.map((col) => {
                  const count = coverage[row]?.[col] ?? 0;
                  return (
                    <td key={col} className="p-1">
                      <div
                        className={`min-w-10 h-9 rounded-md flex items-center justify-center text-xs ${shadeFor(count)}`}
                        title={`${row} × ${col}: ${count} example${count === 1 ? "" : "s"}`}
                      >
                        {count}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
