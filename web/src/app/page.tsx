import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-20">
      <div className="mx-auto max-w-lg text-center">
        <p className="text-sm font-medium text-foreground/55">Hackathon MVP</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance">
          Welcome to Wave
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-foreground/70 text-balance">
          A visible home for your idea: landing page, navigation, and a dedicated
          space for the workflow you define next.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/feature"
            className="inline-flex h-12 min-w-[12rem] items-center justify-center rounded-full bg-foreground px-8 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Open core feature
          </Link>
        </div>
      </div>
    </div>
  );
}
