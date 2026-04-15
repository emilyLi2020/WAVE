import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Core feature",
  description: "Placeholder for the main Wave workflow.",
};

export default function FeaturePage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Core feature</h1>
      <p className="leading-relaxed text-foreground/75">
        This route is ready for your real product flow. Update{" "}
        <code className="rounded bg-foreground/10 px-1.5 py-0.5 text-sm">
          DOMAIN_SPEC.md
        </code>{" "}
        at the repo root and{" "}
        <code className="rounded bg-foreground/10 px-1.5 py-0.5 text-sm">
          PRD.md
        </code>{" "}
        here, then replace this page with inputs, validation, and outputs that
        match your MVP.
      </p>
    </div>
  );
}
