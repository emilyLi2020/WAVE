// Shared surface that the lib/gemma wrappers consume. Re-exports the four
// generator function shapes so swapping primary (LiteRT) ↔ contingency (llama.rn)
// is a one-line import change in mobile/src/gemma/{chunk,session,insights,checkin}.ts.
//
// The shapes mirror client/lib/gemma/wllama-generators.ts so the gemma wrappers
// port across without edits.

import type {
  CheckInContextPayload,
  ChunkGenerationContextPayload,
  ReflectionContext,
} from "@/prompts/schemas";

// Lifted from client/lib/gemma/checkin.ts. Keep in sync until checkin.ts is
// ported in step 3.
export interface EndConversationSignal {
  cravingScore: number;
  obstacleCategory: string | null;
}

export interface CheckInChatTurnPayload {
  role: "agent" | "patient";
  content: string;
}

export interface GenerateOptions {
  maxNewTokens: number;
  signal?: AbortSignal;
  onDelta?: (accumulated: string) => void;
}

export interface LocalChunkResult {
  text: string;
}

export interface LocalCheckInResult {
  text: string;
  endConversation: EndConversationSignal | null;
}

export interface ChunkGenerator {
  (
    context: ChunkGenerationContextPayload,
    options: GenerateOptions,
  ): Promise<LocalChunkResult>;
}

export interface ReflectionGenerator {
  (
    input: ReflectionContext,
    options: GenerateOptions,
  ): Promise<LocalChunkResult>;
}

export interface InsightsGenerator {
  (sessions: readonly unknown[], options: GenerateOptions): Promise<LocalChunkResult>;
}

export interface CheckInGenerator {
  (
    history: readonly CheckInChatTurnPayload[],
    context: CheckInContextPayload,
    options: GenerateOptions,
  ): Promise<LocalCheckInResult>;
}
