"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/shared/card";
import type { SessionLog } from "@/lib/types";
import { getAllSessions } from "@/lib/storage";

export function HistoryView() {
  const [sessions, setSessions] = useState<SessionLog[]>([]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setSessions(getAllSessions());
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-foreground/60 underline-offset-4 hover:text-foreground hover:underline"
        >
          Dashboard
        </Link>
      </div>
      {sessions.length === 0 ? (
        <Card>
          <p className="text-sm text-foreground/60">No sessions yet.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => (
            <li key={s.id}>
              <Card className="py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">
                    {new Date(s.startedAt).toLocaleString()}
                  </span>
                  <span className="text-xs text-foreground/50">
                    {s.completed ? "Completed" : "Incomplete"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-foreground/70">
                  Intensity {s.intensityStart}
                  {s.intensityEnd != null ? ` → ${s.intensityEnd}` : ""} ·{" "}
                  {s.trigger} · med {s.medStatus}
                </p>
                {s.journalNote ? (
                  <p className="mt-2 text-sm italic text-foreground/60">
                    “{s.journalNote}”
                  </p>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
