import { assertTrainingEnabled } from "@/lib/training/guard";

import { VoiceTestClient } from "./voice-test-client";

export const dynamic = "force-dynamic";

export default function VoiceTestPage() {
  assertTrainingEnabled();
  return <VoiceTestClient />;
}
