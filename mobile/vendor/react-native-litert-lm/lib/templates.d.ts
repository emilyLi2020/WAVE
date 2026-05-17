/**
 * Prompt template utilities for different LLM families.
 *
 * LiteRT-LM's Conversation API may handle templates internally for some models,
 * but these utilities give developers explicit control for custom workflows
 * or when using models with different template formats.
 *
 * @example
 * ```typescript
 * import { applyGemmaTemplate, ChatMessage } from 'react-native-litert-lm';
 *
 * const history: ChatMessage[] = [
 *   { role: 'user', content: 'What is React Native?' },
 *   { role: 'model', content: 'React Native is a framework for building...' },
 *   { role: 'user', content: 'How do I use hooks?' }
 * ];
 *
 * const prompt = applyGemmaTemplate(history, 'You are a helpful coding assistant.');
 * ```
 */
/**
 * A message in a conversation.
 */
export type ChatMessage = {
    role: "user" | "model" | "system";
    content: string;
};
/**
 * Apply Gemma chat template (Gemma 2, Gemma 3, Gemma 3n).
 *
 * @param history Array of previous messages
 * @param systemPrompt Optional system prompt
 * @returns Formatted prompt string
 */
export declare function applyGemmaTemplate(history: ChatMessage[], systemPrompt?: string): string;
/**
 * Apply Phi chat template (Phi-3, Phi-4).
 *
 * @param history Array of previous messages
 * @param systemPrompt Optional system prompt
 * @returns Formatted prompt string
 */
export declare function applyPhiTemplate(history: ChatMessage[], systemPrompt?: string): string;
/**
 * Apply Llama 3 chat template.
 *
 * @param history Array of previous messages
 * @param systemPrompt Optional system prompt
 * @returns Formatted prompt string
 */
export declare function applyLlamaTemplate(history: ChatMessage[], systemPrompt?: string): string;
