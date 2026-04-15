"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/shared/card";
import type {
  MedCorrelationResult,
  RiskWindow,
  SessionLog,
  TriggerStat,
} from "@/lib/types";
import { loadSessions } from "@/lib/wave-storage";
import { useUserStore } from "@/store/userStore";

type Insights = {
  highRiskWindows: RiskWindow[];
  medCorrelation: MedCorrelationResult;
  topTriggers: TriggerStat[];
  streakData: { currentStreak: number };
};

export function DashboardView() {
  const medProfile = useUserStore((s) => s.medProfile);
  const hydrate = useUserStore((s) => s.hydrate);
  const [sessions, setSessions] = useState<SessionLog[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const load = async () => {
      const list = await loadSessions();
      try {
        const res = await fetch("/api/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessions: list }),
        });
        const data = (await res.json()) as Insights;
        if (res.ok) {
          setInsights(data);
          setSessions(list);
        }
      } catch {
        setInsights(null);
        setSessions(list);
      }
    };
    void load();
  }, []);

  const last14 = [...sessions]
    .filter((s) => s.completed && s.intensityEnd != null)
    .slice(0, 14)
    .reverse()
    .map((s, i) => ({
      name: `#${i + 1}`,
      start: s.intensityStart,
      end: s.intensityEnd ?? s.intensityStart,
    }));

  const med = insights?.medCorrelation;
  const windows = insights?.highRiskWindows ?? [];
  const triggers = insights?.topTriggers ?? [];
  const streak = insights?.streakData.currentStreak ?? 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">
            WAVE
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          {medProfile ? (
            <p className="mt-1 text-sm text-foreground/60">
              Dose reminder: around {medProfile.usualDoseTime} · stay with your
              clinical plan.
            </p>
          ) : null}
        </div>
        <Link
          href="/session"
          className="inline-flex h-12 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-90 sm:self-start"
        >
          Start session
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-xs text-foreground/50">Streak</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{streak}</p>
          <p className="mt-1 text-xs text-foreground/50">
            Completed sessions in a row
          </p>
        </Card>
        <Card>
          <p className="text-xs text-foreground/50">Total completed</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {sessions.filter((s) => s.completed).length}
          </p>
          <p className="mt-1 text-xs text-foreground/50">Stored on this device</p>
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-semibold">Craving start → end (last 14)</h2>
        <div className="mt-4 h-48 w-full">
          {last14.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={last14}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="start" stroke="#64748b" name="Start" />
                <Line type="monotone" dataKey="end" stroke="#38bdf8" name="End" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-foreground/50">
              Complete a session to see your line chart.
            </p>
          )}
        </div>
      </Card>

      {med?.meaningful ? (
        <Card>
          <h2 className="text-sm font-semibold">Medication vs intensity drop</h2>
          <p className="mt-2 text-sm text-foreground/70">
            Avg drop when dose taken/on time path:{" "}
            <span className="font-medium text-foreground">
              {med.avgDropWhenTaken?.toFixed(1) ?? "—"}
            </span>
            . When missed:{" "}
            <span className="font-medium text-foreground">
              {med.avgDropWhenMissed?.toFixed(1) ?? "—"}
            </span>
            . Difference:{" "}
            <span className="font-medium text-foreground">
              {med.difference?.toFixed(1) ?? "—"}
            </span>
            .
          </p>
        </Card>
      ) : (
        <Card>
          <h2 className="text-sm font-semibold">Medication correlation</h2>
          <p className="mt-2 text-sm text-foreground/60">
            After at least three completed sessions in both “taken” and “missed”
            groups, WAVE estimates whether medication timing lines up with how
            much intensity eases.
          </p>
        </Card>
      )}

      <Card>
        <h2 className="text-sm font-semibold">Triggers</h2>
        <div className="mt-4 h-44 w-full">
          {triggers.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={triggers}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="trigger" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#94a3b8" name="Sessions" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-foreground/50">No trigger data yet.</p>
          )}
        </div>
      </Card>

      {windows.length ? (
        <Card>
          <h2 className="text-sm font-semibold">High-risk windows</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {windows.map((w) => (
              <li
                key={w.label}
                className="flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2 text-amber-100"
              >
                <span>{w.label}</span>
                <span className="tabular-nums text-xs">{w.count} hits</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Link
        href="/history"
        className="text-center text-sm font-medium text-foreground/60 underline-offset-4 hover:text-foreground hover:underline"
      >
        Full history
      </Link>
    </div>
  );
}
