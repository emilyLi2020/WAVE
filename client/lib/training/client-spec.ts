/**
 * Serializable projection of LoraFormSpec for passing to client
 * components. Strips the Zod schemas and the VoiceScenario.match
 * predicates, neither of which can cross the server → client
 * serialization boundary.
 */

import type { LoraFormSpec, VoiceScenario } from "./types";

export type ClientVoiceScenario = Omit<VoiceScenario, "match">;

export type ClientLoraFormSpec = Omit<
  LoraFormSpec,
  "inputSchema" | "outputSchema" | "voiceScenarios"
> & {
  voiceScenarios: readonly ClientVoiceScenario[];
};

export function toClientSpec(spec: LoraFormSpec): ClientLoraFormSpec {
  const { inputSchema: _i, outputSchema: _o, voiceScenarios, ...rest } = spec;
  void _i;
  void _o;
  return {
    ...rest,
    voiceScenarios: voiceScenarios.map(({ match: _m, ...scenario }) => {
      void _m;
      return scenario;
    }),
  };
}
