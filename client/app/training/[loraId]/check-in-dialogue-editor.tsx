"use client";

import {
  CHECK_IN_BODY_URGE_LOCATION_PROMPT,
  CHECK_IN_CHUNK2_READINESS_PROMPT,
  CHECK_IN_CHUNK2_SCORE_PROMPT,
  CHECK_IN_COPING_BRIDGE_OPENER,
  CHECK_IN_COPING_CONSENT_PROMPT,
  CHECK_IN_CURRENT_URGE_SCALE_PROMPT,
} from "@/lib/training/check-in-dialogue";

export type DialogueTurn = {
  role: "patient" | "agent";
  content: string;
};

export type CheckInDialoguePack = "check-in-1" | "check-in-2";

interface Props {
  turns: DialogueTurn[];
  onChange: (next: DialogueTurn[]) => void;
  /** Which check-in LoRA—changes canonical Turn 1 / body question copy in the tips. */
  dialoguePack?: CheckInDialoguePack;
}

export function CheckInDialogueEditor({
  turns,
  onChange,
  dialoguePack = "check-in-1",
}: Props) {
  function updateLine(index: number, patch: Partial<DialogueTurn>) {
    onChange(
      turns.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    );
  }

  function removeLine(index: number) {
    onChange(turns.filter((_, lineIndex) => lineIndex !== index));
  }

  function insertLine(afterIndex: number, role: DialogueTurn["role"]) {
    const next = [...turns];
    next.splice(afterIndex + 1, 0, { role, content: "" });
    onChange(next);
  }

  return (
    <div className="rounded-2xl border border-accent/25 bg-accent-soft/20 p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Multi-turn dialogue (training)</h3>
        <p className="mt-1 text-xs text-foreground/60 leading-relaxed">
          {dialoguePack === "check-in-1" ? (
            <>
              Turn 1 must be <strong>WAVE</strong> with the standard 1–10 craving prompt
              (see below). Turn 2 is the <strong>patient&apos;s number only</strong>—
              intake (baseline) stays in <strong>input</strong>, not in what the patient
              says. Later WAVE lines can reference intake from that context. Then: obstacle →
              validate the obstacle → ask consent with the standard coping prompt (below) →
              patient agrees → <strong>one</strong> WAVE turn that starts with the coping bridge
              (below), gives the technique, and <strong>ends with a question</strong> → check if
              it helped → WAVE asks readiness for the next chunk →{" "}
              <strong>patient confirms</strong> and the transcript <strong>stops</strong> (no
              WAVE line after that—the app advances). The last WAVE line must match{" "}
              <strong>reply</strong>. <strong>Every</strong> WAVE line must always end with a question
              mark. For a completed check-in use{" "}
              <code className="text-[11px]">endConversation.action = end</code> with{" "}
              <code className="text-[11px]">cravingScore</code>.
            </>
          ) : (
            <>
              Turn 1 must be <strong>WAVE</strong> with the check-in 2 craving prompt (see below).
              Turn 2 is the <strong>patient&apos;s number only</strong>. The next WAVE turn should
              open with a <strong>score reflection</strong> vs the prior check-in score (see PRD /
              <code className="text-[11px]"> score-tracking.ts</code>), then medication + surf
              validation like check-in 1, then include the body-awareness question verbatim (second
              block below). Then validate → consent → coping bridge → technique → readiness for the{" "}
              <strong>sound anchor</strong> (third block). <strong>Every</strong> WAVE line ends with{" "}
              <strong>?</strong>. End on patient readiness; <strong>reply</strong> matches the last WAVE line.
            </>
          )}
        </p>
        <p className="text-[11px] font-mono text-foreground/70 bg-surface border border-border rounded-lg px-3 py-2">
          {dialoguePack === "check-in-1" ?
            CHECK_IN_CURRENT_URGE_SCALE_PROMPT
          : CHECK_IN_CHUNK2_SCORE_PROMPT}
        </p>
        {dialoguePack === "check-in-2" ? (
          <>
            <p className="text-[11px] text-foreground/55 mt-2 mb-1">
              On the first WAVE turn after the score (include verbatim):
            </p>
            <p className="text-[11px] font-mono text-foreground/70 bg-surface border border-border rounded-lg px-3 py-2">
              {CHECK_IN_BODY_URGE_LOCATION_PROMPT}
            </p>
            <p className="text-[11px] text-foreground/55 mt-2 mb-1">
              Readiness before Chunk 3 (sound anchor):
            </p>
            <p className="text-[11px] font-mono text-foreground/70 bg-surface border border-border rounded-lg px-3 py-2">
              {CHECK_IN_CHUNK2_READINESS_PROMPT}
            </p>
          </>
        ) : null}
        <p className="text-[11px] text-foreground/55 mt-2 mb-1">
          After validation, before any coping instructions:
        </p>
        <p className="text-[11px] font-mono text-foreground/70 bg-surface border border-border rounded-lg px-3 py-2">
          {CHECK_IN_COPING_CONSENT_PROMPT}
        </p>
        <p className="text-[11px] text-foreground/55 mt-2 mb-1">
          Immediately after the patient agrees to coping, the next WAVE line opens with:
        </p>
        <p className="text-[11px] font-mono text-foreground/70 bg-surface border border-border rounded-lg px-3 py-2">
          {CHECK_IN_COPING_BRIDGE_OPENER}
        </p>
      </div>

      <ul className="space-y-3">
        {turns.map((line, index) => (
          <li
            key={`${index}-${line.role}`}
            className="rounded-xl border border-border bg-background p-3 space-y-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-foreground/70">
                Turn {index + 1}
                <select
                  value={line.role}
                  onChange={(event) =>
                    updateLine(index, {
                      role: event.target.value as DialogueTurn["role"],
                    })
                  }
                  className="ml-2 rounded-md border border-border bg-surface px-2 py-1 text-xs"
                >
                  <option value="patient">patient</option>
                  <option value="agent">WAVE (agent)</option>
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => insertLine(index, "patient")}
                  className="text-[11px] text-accent hover:underline"
                >
                  + patient after
                </button>
                <button
                  type="button"
                  onClick={() => insertLine(index, "agent")}
                  className="text-[11px] text-accent hover:underline"
                >
                  + WAVE after
                </button>
                <button
                  type="button"
                  onClick={() => removeLine(index)}
                  disabled={turns.length <= 3}
                  className="text-[11px] text-foreground/45 hover:text-warn disabled:opacity-30"
                >
                  Remove
                </button>
              </div>
            </div>
            <textarea
              value={line.content}
              onChange={(event) => updateLine(index, { content: event.target.value })}
              rows={line.role === "agent" ? 4 : 2}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono leading-relaxed focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder={
                line.role === "patient"
                  ? "e.g. 7 or About a 6 (current score only)"
                  : index === 0
                    ? dialoguePack === "check-in-1" ?
                      "Exact 1–10 craving prompt (see text above)"
                    : "Exact check-in 2 craving prompt (see text above)"
                    : "WAVE: validate, then one clear question at the end"
              }
            />
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-foreground/50">
        Tip: after the readiness question, the patient&apos;s yes is the final line—do
        not add a closing WAVE bubble. Affirm medication engagement (on time / late) and
        use surf validation on the trigger, as in the seed examples.
      </p>
    </div>
  );
}
