// SessionProvider — the single source of truth for a run.
//
// Wraps the pure reducer (session-machine.ts) in React state and adds
// `demoMode`, a pre-intake toggle the Home screen flips (demo = 2
// chunks/2 check-ins/final reflection; off = the standard 5). The toggle
// is folded into IntakeAnswers when intake is submitted, which is what
// sets `state.totalChunks` in the reducer.
//
// The flow screens (intake → safety → chunk → check-in → reflection)
// read `state` and `dispatch` from here instead of navigating with ad-hoc
// router state. Model/voice wiring (tasks ①–④) plugs into the same
// dispatch surface.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";

import {
  initialState,
  reducer,
  type Action,
  type State,
} from "@/session/session-machine";
import {
  MEDICATION_LABEL,
  OUTCOME_LABEL,
  TRIGGER_LABEL,
  formatSessionDate,
  type RecentSessionRow,
} from "@/data/mock-sessions";

// Build a History row from the just-completed run (demo: the History
// page shows this as the most-recent entry, overwritten each finish).
function rowFromState(state: State): RecentSessionRow {
  const intake = state.intake;
  const scores = state.checkIns.map((c) => c.cravingScore);
  const start = intake?.intakeIntensity ?? 5;
  const end = scores.length ? scores[scores.length - 1] : start;
  return {
    id: "s-live",
    date: formatSessionDate(state.startedAt),
    start,
    end,
    trigger: TRIGGER_LABEL[intake?.trigger ?? "unknown_or_other"],
    medication: MEDICATION_LABEL[intake?.medicationStatus ?? "none"],
    outcome: OUTCOME_LABEL[state.outcome ?? "completed"],
  };
}

// A reset action layered on top of the ported pure machine (whose
// closed Action union deliberately has no reset). Kept local so
// session-machine.ts stays untouched in that respect.
type RootAction = Action | { type: "__reset" };

function rootReducer(state: State, action: RootAction): State {
  if (action.type === "__reset") return initialState();
  return reducer(state, action);
}

interface SessionContextValue {
  state: State;
  dispatch: (action: Action) => void;
  /** Pre-intake toggle from Home; folded into IntakeAnswers.demoMode. */
  demoMode: boolean;
  setDemoMode: (value: boolean) => void;
  /** Reset to a fresh run. */
  resetSession: () => void;
  /** Most-recent completed run (demo: top of the History page). */
  lastSession: RecentSessionRow | null;
  /** Snapshot the current run as lastSession — call BEFORE resetSession. */
  commitLastSession: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(rootReducer, undefined, initialState);
  const [demoMode, setDemoMode] = useState(false);
  const [lastSession, setLastSession] = useState<RecentSessionRow | null>(null);

  const dispatch = useCallback((action: Action) => rawDispatch(action), []);
  const resetSession = useCallback(() => rawDispatch({ type: "__reset" }), []);
  // Captures the live reducer state (closure) — call before resetSession.
  const commitLastSession = useCallback(
    () => setLastSession(rowFromState(state)),
    [state],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      dispatch,
      demoMode,
      setDemoMode,
      resetSession,
      lastSession,
      commitLastSession,
    }),
    [state, dispatch, demoMode, resetSession, lastSession, commitLastSession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within <SessionProvider>");
  }
  return ctx;
}
