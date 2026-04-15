import type {
  MedCorrelationResult,
  RiskWindow,
  SessionLog,
  TriggerCategory,
  TriggerStat,
} from "@/lib/types";

function intensityDrop(s: SessionLog): number | null {
  if (s.intensityEnd == null || !s.completed) return null;
  return s.intensityStart - s.intensityEnd;
}

export function getHighRiskWindows(sessions: SessionLog[]): RiskWindow[] {
  const completed = sessions.filter((s) => s.completed);
  type Key = string;
  const buckets = new Map<Key, { count: number; hour: number; dow: number | null }>();

  for (const s of completed) {
    const d = new Date(s.startedAt);
    const hour = d.getHours();
    const dow = d.getDay();
    const blockStart = Math.floor(hour / 2) * 2;
    const key = `${dow}-${blockStart}`;
    const prev = buckets.get(key);
    if (prev) {
      prev.count += 1;
    } else {
      buckets.set(key, { count: 1, hour: blockStart, dow });
    }
  }

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const windows: RiskWindow[] = [];
  for (const [, v] of buckets) {
    if (v.count >= 3) {
      windows.push({
        label: `${days[v.dow ?? 0]} ${v.hour}:00–${v.hour + 2}:00`,
        count: v.count,
        hourStart: v.hour,
        hourEnd: v.hour + 2,
        dayOfWeek: v.dow,
      });
    }
  }
  return windows.sort((a, b) => b.count - a.count).slice(0, 3);
}

export function getMedCorrelation(sessions: SessionLog[]): MedCorrelationResult {
  const completed = sessions.filter(
    (s) => s.completed && s.intensityEnd != null && s.medStatus !== "not_applicable",
  );
  const taken = completed.filter(
    (s) => s.medStatus === "taken_on_time" || s.medStatus === "taken_late",
  );
  const missed = completed.filter((s) => s.medStatus === "missed");

  const dropsTaken = taken
    .map(intensityDrop)
    .filter((n): n is number => n != null);
  const dropsMissed = missed
    .map(intensityDrop)
    .filter((n): n is number => n != null);

  const meaningful = dropsTaken.length >= 3 && dropsMissed.length >= 3;
  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  const avgTaken = avg(dropsTaken);
  const avgMissed = avg(dropsMissed);
  const difference =
    avgTaken != null && avgMissed != null ? avgTaken - avgMissed : null;

  return {
    avgDropWhenTaken: avgTaken,
    avgDropWhenMissed: avgMissed,
    difference,
    sampleTaken: dropsTaken.length,
    sampleMissed: dropsMissed.length,
    meaningful,
  };
}

export function getTopTriggers(sessions: SessionLog[]): TriggerStat[] {
  const completed = sessions.filter((s) => s.completed);
  const total = completed.length;
  if (!total) return [];
  const counts = new Map<TriggerCategory, number>();
  for (const s of completed) {
    counts.set(s.trigger, (counts.get(s.trigger) ?? 0) + 1);
  }
  const stats: TriggerStat[] = [];
  for (const [trigger, count] of counts) {
    stats.push({
      trigger,
      count,
      percentage: Math.round((count / total) * 1000) / 10,
    });
  }
  return stats.sort((a, b) => b.count - a.count);
}

export function getCurrentStreak(sessions: SessionLog[]): number {
  const sorted = [...sessions].sort(
    (a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
  let streak = 0;
  for (const s of sorted) {
    if (s.completed) streak += 1;
    else break;
  }
  return streak;
}
