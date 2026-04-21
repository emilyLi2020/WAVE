/**
 * Sticky reminder of the LoRA's hard invariants. Rendered on the
 * new/edit pages so the doctor sees them while writing the example.
 */

interface Props {
  invariants: readonly string[];
  citationPrompt?: string;
}

export function InvariantsCallout({ invariants, citationPrompt }: Props) {
  return (
    <aside className="rounded-2xl border border-warn/40 bg-warn-soft/40 p-5 lg:sticky lg:top-6">
      <h3 className="font-semibold text-warn text-sm">Must obey</h3>
      <ul className="mt-2 space-y-1.5 text-sm text-foreground/85 list-disc pl-5">
        {invariants.map((inv) => (
          <li key={inv}>{inv}</li>
        ))}
      </ul>
      {citationPrompt ? (
        <p className="mt-4 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground/70">
          <strong>Citation:</strong> {citationPrompt}
        </p>
      ) : null}
    </aside>
  );
}
