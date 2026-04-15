"use client";

import { useEffect } from "react";
import { SessionFlow } from "@/components/session/session-flow";
import { useSessionStore } from "@/store/sessionStore";

export default function SessionPage() {
  const resetSession = useSessionStore((s) => s.resetSession);

  useEffect(() => {
    resetSession();
  }, [resetSession]);

  return <SessionFlow />;
}
