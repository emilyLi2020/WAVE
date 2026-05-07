"use client";

import { useState } from "react";

import type {
  ClinicianLlmInstructionsState,
  LoRAId,
} from "@/lib/training/types";

const MAX_INSTRUCTIONS_CHARS = 64_000;

interface Props {
  loraId: LoRAId;
  loraTitle: string;
  shortTitle: string;
  initialState: ClinicianLlmInstructionsState;
  /** Tighter layout on per-LoRA / form pages */
  compact?: boolean;
}

export function ClinicianLlmInstructionsPanel({
  loraId,
  loraTitle,
  shortTitle,
  initialState,
  compact = false,
}: Props) {
  const [instructionsText, setInstructionsText] = useState(
    initialState.instructionsText,
  );
  const [updatedAt, setUpdatedAt] = useState(initialState.updatedAt);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/training/llm-instructions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loraId, instructionsText }),
      });
      const data = (await response.json()) as unknown;
      if (!response.ok) {
        setMessage({
          kind: "err",
          text:
            typeof data === "object" &&
            data !== null &&
            "error" in data &&
            typeof (data as { error: string }).error === "string"
              ? (data as { error: string }).error
              : "Save failed",
        });
        return;
      }
      const next = data as { instructionsText: string; updatedAt: string | null };
      setInstructionsText(next.instructionsText);
      setUpdatedAt(next.updatedAt);
      setMessage({
        kind: "ok",
        text: "Saved. Exports for this sample set include these instructions.",
      });
    } catch {
      setMessage({ kind: "err", text: "Network error — try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className={
        compact
          ? "rounded-2xl border border-border bg-surface p-5"
          : "rounded-2xl border border-accent/25 bg-accent-soft/25 p-6"
      }
    >
      <p className="text-xs uppercase tracking-wide text-foreground/50">
        This sample set only · {loraId}
      </p>
      <h2 className="mt-2 font-semibold">LLM instructions · {shortTitle}</h2>
      <p className="mt-1 text-sm text-foreground/65 leading-relaxed">
        Detailed guidance for models or reviewers working on{" "}
        <span className="text-foreground/80">{loraTitle}</span>. Included only
        in exports for rows from this LoRA (system message in ShareGPT JSONL;
        fields in clinician JSONL and CSV).
      </p>
      <label className="mt-4 block">
        <span className="sr-only">Instructions for the LLM</span>
        <textarea
          value={instructionsText}
          onChange={(event) => setInstructionsText(event.target.value)}
          rows={compact ? 14 : 18}
          maxLength={MAX_INSTRUCTIONS_CHARS}
          className="mt-1 w-full min-h-[280px] rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground/90 placeholder:text-foreground/40 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent font-mono leading-relaxed"
          placeholder="Line-by-line structure, tone, intensity bands, what to avoid, citation rules…"
        />
      </label>
      <p className="mt-1 text-[11px] text-foreground/45">
        {instructionsText.length.toLocaleString()} / {MAX_INSTRUCTIONS_CHARS.toLocaleString()}{" "}
        characters
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50 transition"
        >
          {saving ? "Saving…" : "Save instructions"}
        </button>
        {updatedAt ? (
          <span className="text-xs text-foreground/50">
            Last saved{" "}
            {new Date(updatedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        ) : (
          <span className="text-xs text-foreground/50">Not saved yet</span>
        )}
      </div>
      {message ? (
        <p
          className={
            message.kind === "ok"
              ? "mt-2 text-xs text-accent"
              : "mt-2 text-xs text-warn"
          }
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
