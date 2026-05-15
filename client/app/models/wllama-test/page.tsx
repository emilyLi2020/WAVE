import { assertModelsEnabled } from "@/lib/models/guard";

import { WllamaTestClient } from "./wllama-test-client";

export const dynamic = "force-dynamic";

export default function WllamaTestPage() {
  assertModelsEnabled();
  return <WllamaTestClient />;
}
