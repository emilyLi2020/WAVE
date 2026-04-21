"use client";

import Link from "next/link";

/**
 * Terminal screen for the both-yes path on the intake safety screen.
 * No LoRA loaded; no model call made (PRD.md > Domain Constraints >
 * Crisis handoff > point 1).
 */
export function SafetyHandoff() {
  return (
    <article className="rounded-2xl border border-danger/40 bg-danger-soft p-8">
      <h2 className="text-xl font-semibold">
        Please reach out to a person right now.
      </h2>
      <p className="mt-3 text-foreground/80">
        Based on what you just told us, the right step is a real person, not
        an app session.
      </p>

      <div className="mt-6 space-y-4">
        <div className="rounded-xl bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-foreground/60">
            SAMHSA National Helpline
          </p>
          <p className="mt-1 text-2xl font-semibold">
            <a href="tel:18006624357" className="hover:text-accent">
              1-800-662-HELP (1-800-662-4357)
            </a>
          </p>
          <p className="mt-2 text-sm text-foreground/70">
            Free, confidential, 24/7. Treatment referral and information for
            substance use disorders.
          </p>
        </div>

        <div className="rounded-xl bg-surface p-5">
          <p className="text-sm">
            If you have a therapist or social worker, reach out to them now.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm hover:border-accent hover:text-accent"
        >
          ← Back to home
        </Link>
      </div>
    </article>
  );
}
