"use client";

/**
 * Multi-turn check-in chat surface.
 *
 * The LLM drives every agent turn. There are no scripted openers any
 * more — the chat begins with the patient's craving-score reply
 * (sent via the slider composer) and from there the LLM responds to
 * each free-text message until it judges the conversation is over,
 * at which point it calls the `endConversation` tool. The chat
 * surface listens for that tool-call signal (surfaced by
 * `streamCheckInTurn` as `onEndConversation`) and finalizes the
 * check-in.
 *
 * Composer rules
 *   - Turn 1 (no patient turns yet): the score grid is the composer.
 *     Sending fills `cravingScore` and dispatches the first patient
 *     turn so the LLM can produce its opening reply.
 *   - Turn 2+ : free-text composer only. The slider never reappears
 *     within a single check-in.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import {
  streamCheckInTurn,
  type CheckInChatTurnPayload,
  type EndConversationSignal,
} from "@/lib/gemma/checkin";
import type {
  CheckInContextPayload,
  SessionHistoryEntry,
} from "@/lib/prompts/schemas";
import type {
  CheckIn,
  CheckInTurn,
  ChunkNumber,
  ObstacleCategory,
  SessionUserProfile,
} from "@/types/session";

interface Props {
  chunkNumber: ChunkNumber;
  /** Scores collected at prior check-ins, oldest → most recent. */
  priorScores: number[];
  intakeIntensity: number;
  profile: SessionUserProfile;
  /**
   * Every prior chunk + check-in this session. Forwarded to the LLM
   * so each new agent turn can ground itself in what the patient has
   * already heard and said.
   */
  sessionHistory: readonly SessionHistoryEntry[];
  onComplete: (checkIn: CheckIn) => void;
}

interface InternalTurn extends CheckInTurn {
  /** True while the agent text is still streaming. */
  streaming?: boolean;
}

const SCORE_BUTTONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function CheckInChat({
  chunkNumber,
  priorScores,
  intakeIntensity,
  profile,
  sessionHistory,
  onComplete,
}: Props) {
  const startedAtRef = useRef(Date.now());
  const completedRef = useRef(false);
  const endSignalRef = useRef<EndConversationSignal | null>(null);

  const [turns, setTurns] = useState<InternalTurn[]>([]);
  const [cravingScore, setCravingScore] = useState<number | null>(null);
  const [pendingScore, setPendingScore] = useState<number | null>(null);
  const [composerText, setComposerText] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns.length, turns[turns.length - 1]?.content.length]);

  const patientTurnCount = turns.filter((t) => t.role === "patient").length;
  const onTurn1 = patientTurnCount === 0;

  function buildContext(activeScore: number): CheckInContextPayload {
    return {
      chunkNumber,
      cravingScore: activeScore,
      scoreHistory: priorScores,
      obstacleHint: null,
      profile: {
        matType: profile.matType,
        medicationStatus: profile.medicationStatus,
        trigger: profile.trigger,
        triggerOther: profile.triggerOther,
        usedSubstanceToday: profile.usedSubstanceToday,
      },
      intakeIntensity,
      sessionHistory: [...sessionHistory],
    };
  }

  async function streamAgentReply(
    historyForLLM: CheckInChatTurnPayload[],
    activeScore: number,
  ) {
    setAgentBusy(true);

    setTurns((prev) => [
      ...prev,
      {
        index: prev.length + 1,
        role: "agent",
        content: "",
        via: "lora",
        streaming: true,
      },
    ]);

    const context = buildContext(activeScore);
    const startedAt = performance.now();

    try {
      const result = await streamCheckInTurn({
        history: historyForLLM,
        context,
        onDelta: (accumulated) => {
          setTurns((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "agent") {
              next[next.length - 1] = { ...last, content: accumulated };
            }
            return next;
          });
        },
        onEndConversation: (signal) => {
          endSignalRef.current = signal;
        },
      });

      setTurns((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "agent") {
          // If the model only produced a tool call (no text), drop
          // the empty placeholder so the chat doesn't render an
          // empty bubble.
          if (result.text.trim().length === 0) {
            next.pop();
          } else {
            next[next.length - 1] = {
              ...last,
              content: result.text,
              via: result.source === "model" ? "lora" : "fallback",
              streaming: false,
              atLatencyMs: Math.round(performance.now() - startedAt),
            };
          }
        }
        return next;
      });

      // If the model called endConversation during this turn,
      // finalize the check-in. Use the latest snapshot of `turns`
      // via a setTurns callback so we don't race with the streaming
      // updates above.
      if (endSignalRef.current) {
        const signal = endSignalRef.current;
        setTurns((prev) => {
          finalizeCheckIn(prev, activeScore, signal);
          return prev;
        });
      }
    } finally {
      setAgentBusy(false);
    }
  }

  async function handleSendScore() {
    if (
      pendingScore === null ||
      agentBusy ||
      completedRef.current
    ) {
      return;
    }

    const score = pendingScore;
    setCravingScore(score);

    const patientTurn: InternalTurn = {
      index: turns.length + 1,
      role: "patient",
      content: `${score}/10`,
      via: "patient",
    };
    const newTurns = [...turns, patientTurn];
    setTurns(newTurns);

    const llmHistory: CheckInChatTurnPayload[] = newTurns.map((t) => ({
      role: t.role,
      content: t.content,
    }));
    await streamAgentReply(llmHistory, score);
  }

  async function handleSendText() {
    if (agentBusy || completedRef.current) return;
    const trimmed = composerText.trim();
    if (trimmed.length === 0) return;
    if (cravingScore === null) return;

    const newPatientTurn: InternalTurn = {
      index: turns.length + 1,
      role: "patient",
      content: trimmed,
      via: "patient",
    };
    const newTurns = [...turns, newPatientTurn];
    setTurns(newTurns);
    setComposerText("");

    const llmHistory: CheckInChatTurnPayload[] = newTurns.map((t) => ({
      role: t.role,
      content: t.content,
    }));
    await streamAgentReply(llmHistory, cravingScore);
  }

  function finalizeCheckIn(
    finalTurns: InternalTurn[],
    activeScore: number,
    signal: EndConversationSignal,
  ) {
    if (completedRef.current) return;
    completedRef.current = true;

    const obstacleCategory: ObstacleCategory | null = signal.obstacleCategory;

    const checkIn: CheckIn = {
      chunkNumber,
      cravingScore: activeScore,
      turns: finalTurns.map(
        (t, idx): CheckInTurn => ({
          index: idx + 1,
          role: t.role,
          content: t.content,
          via: t.via,
          atLatencyMs: t.atLatencyMs,
        }),
      ),
      obstacleCategory,
      readyToContinue: chunkNumber === 5 ? null : true,
      startedAt: startedAtRef.current,
      endedAt: Date.now(),
    };

    onComplete(checkIn);
  }

  const lastTurnIsStreamingPlaceholder = useMemo(() => {
    const last = turns[turns.length - 1];
    return Boolean(last?.streaming && last.content.length === 0);
  }, [turns]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Check-in {chunkNumber} of 5
        </h2>
      </header>

      <div
        ref={containerRef}
        className="max-h-[420px] min-h-[280px] space-y-3 overflow-y-auto rounded-2xl border border-border bg-surface p-4"
      >
        {turns.length === 0 ? (
          <p className="text-sm text-foreground/50">
            Tap a number below — your craving right now, 1 to 10.
          </p>
        ) : null}
        {turns.map((turn) => (
          <ChatBubble key={turn.index} turn={turn} />
        ))}
        {lastTurnIsStreamingPlaceholder ? <ShimmerLine /> : null}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        {onTurn1 ? (
          <ScoreComposer
            value={pendingScore}
            onChange={setPendingScore}
            onSend={handleSendScore}
            disabled={agentBusy || pendingScore === null}
          />
        ) : (
          <TextComposer
            value={composerText}
            onChange={setComposerText}
            onSend={handleSendText}
            disabled={agentBusy || completedRef.current}
          />
        )}
      </div>
    </div>
  );
}

function ChatBubble({ turn }: { turn: InternalTurn }) {
  const isAgent = turn.role === "agent";
  return (
    <div
      className={`flex ${isAgent ? "justify-start" : "justify-end"} animate-fade-in-up`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isAgent
            ? "rounded-tl-sm bg-surface-muted text-foreground/90"
            : "rounded-tr-sm bg-accent text-accent-foreground"
        }`}
      >
        {turn.content || (turn.streaming ? <ShimmerLine inline /> : null)}
      </div>
    </div>
  );
}

function ShimmerLine({ inline = false }: { inline?: boolean }) {
  return (
    <span
      className={`${inline ? "inline-flex" : "flex"} items-center gap-1 text-xs text-foreground/50 animate-shimmer`}
      aria-live="polite"
    >
      <span className="h-1 w-1 rounded-full bg-foreground/40" />
      <span className="h-1 w-1 rounded-full bg-foreground/40" />
      <span className="h-1 w-1 rounded-full bg-foreground/40" />
      <span className="ml-1">still with you...</span>
    </span>
  );
}

function ScoreComposer({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: number | null;
  onChange: (next: number) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-wide text-foreground/50">
        Tap a number — that&apos;s your reply.
      </p>
      <div className="grid grid-cols-10 gap-1.5">
        {SCORE_BUTTONS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={value === n}
            className={`rounded-md border py-2 text-sm font-semibold tabular-nums transition ${
              value === n
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-surface-muted text-foreground/70 hover:border-accent hover:text-accent"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-foreground/50">
        <span>1 = barely there</span>
        <span>10 = unbearable</span>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onSend}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function TextComposer({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-end gap-3">
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        rows={2}
        placeholder="Type your reply…"
        className="flex-1 resize-none rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm text-foreground/90 placeholder:text-foreground/40 focus:border-accent focus:outline-none"
      />
      <button
        type="button"
        onClick={onSend}
        disabled={disabled || value.trim().length === 0}
        className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Send
      </button>
    </div>
  );
}
