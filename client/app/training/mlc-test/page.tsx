import { assertTrainingEnabled } from "@/lib/training/guard";

import { MlcTestClient } from "./mlc-test-client";

export const dynamic = "force-dynamic";

export default function MlcTestPage() {
  assertTrainingEnabled();
  return <MlcTestClient />;
}
