/**
 * Serializable projection of LoraFormSpec for passing to client
 * components. Strips the Zod schemas, which can't cross the
 * server → client serialization boundary.
 */

import type { LoraFormSpec } from "./types";

export type ClientLoraFormSpec = Omit<
  LoraFormSpec,
  "inputSchema" | "outputSchema"
>;

export function toClientSpec(spec: LoraFormSpec): ClientLoraFormSpec {
  const { inputSchema: _i, outputSchema: _o, ...rest } = spec;
  void _i;
  void _o;
  return rest;
}
