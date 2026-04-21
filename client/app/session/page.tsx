import Link from "next/link";

import { SessionMachine } from "./_components/session-machine";

export default function SessionPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <nav aria-label="Breadcrumb" className="text-sm text-foreground/60">
        <Link href="/" className="hover:text-accent">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span>Session</span>
      </nav>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight">
        You&apos;re here. That&apos;s the hardest part.
      </h1>
      <p className="mt-2 text-foreground/70">
        Tap a few answers to start. The session adapts to what you pick. No
        typing.
      </p>

      <div className="mt-10">
        <SessionMachine />
      </div>
    </section>
  );
}
