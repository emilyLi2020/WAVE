// Pure, dependency-free conversation/turn state for the voice loop.
//
// Deliberately has ZERO React / React Native / audio imports so it can be
// unit-tested off-device (Node 24 runs this .ts directly) — which is the
// whole point: the transcript-overwrite and "2nd turn didn't respond"
// bugs are turn-state bugs, separable from VAD/Whisper/Kokoro. The screen
// owns audio + the real LiteRT instance; it injects `send` (the LLM call)
// and renders `messages`. Tests inject a scripted `send`.

export interface ConvMessage {
  role: "user" | "assistant";
  /** Patient-facing / spoken text (tool call already stripped). */
  text: string;
  /** Parsed endConversation tool call on the assistant turn, if any. */
  tool?: string | null;
  /** True until the assistant reply has been filled in. */
  pending?: boolean;
}

export interface TurnResult {
  reply: string;
  tool: string | null;
  raw: string;
}

/** The LLM call, injected so this module stays pure/testable. */
export type SendFn = (userText: string) => Promise<string>;

export interface TurnHooks {
  /** Fired whenever the message list changes (push a fresh snapshot to UI). */
  onChange?: (messages: readonly ConvMessage[]) => void;
}

// Native Gemma-4 tool-call shape: a plain reply then a literal
// endConversation{...}. Spoken/visible text = reply with that removed.
// Pure (no RN) so it lives here and the screen imports it instead of
// keeping a private copy.
export function extractToolCall(raw: string): {
  reply: string;
  tool: string | null;
} {
  const m = raw.match(/endConversation\s*\{([^}]*)\}/i);
  if (!m) return { reply: raw.trim(), tool: null };
  const args = m[1] ?? "";
  const score = args.match(/cravingScore\s*[:=]\s*(\d+)/i)?.[1] ?? "?";
  const obst =
    args.match(/obstacleCategory\s*[:=]\s*"?([a-zA-Z_]+)"?/i)?.[1] ?? "none";
  return {
    reply: raw.replace(m[0], "").trim(),
    tool: `endConversation{cravingScore:${score},obstacleCategory:${obst}}`,
  };
}

export class ConversationController {
  private _messages: ConvMessage[] = [];
  private busy = false;
  private pending: string | null = null;

  /** Immutable-ish view for rendering. */
  get messages(): readonly ConvMessage[] {
    return this._messages;
  }

  /** Fresh array+object copy so React state identity changes on update. */
  snapshot(): ConvMessage[] {
    return this._messages.map((m) => ({ ...m }));
  }

  reset(): void {
    this._messages = [];
    this.busy = false;
    this.pending = null;
  }

  /**
   * Run one turn: append the user message, call `send`, append the
   * assistant reply (tool call stripped). History ACCUMULATES — turn N
   * never overwrites turn N-1 (the reported bug). If a turn is already
   * in flight, the latest transcript is queued and run after (mirrors
   * the screen's single-resident-LLM serialization). Empty transcripts
   * are skipped. Returns the assistant result, null if skipped/queued.
   */
  async runTurn(
    transcript: string,
    send: SendFn,
    hooks?: TurnHooks,
  ): Promise<TurnResult | null> {
    const text = transcript.trim();
    if (!text) return null;
    if (this.busy) {
      this.pending = transcript; // latest wins
      return null;
    }
    this.busy = true;
    try {
      this._messages.push({ role: "user", text });
      const assistant: ConvMessage = {
        role: "assistant",
        text: "",
        tool: null,
        pending: true,
      };
      this._messages.push(assistant);
      hooks?.onChange?.(this.snapshot());

      const raw = await send(text);
      const { reply, tool } = extractToolCall(raw);
      assistant.text = reply;
      assistant.tool = tool;
      assistant.pending = false;
      hooks?.onChange?.(this.snapshot());

      return { reply, tool, raw };
    } finally {
      this.busy = false;
      const queued = this.pending;
      this.pending = null;
      if (queued != null) {
        await this.runTurn(queued, send, hooks);
      }
    }
  }
}
