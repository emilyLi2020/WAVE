<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md — WAVE web

## Project overview

WAVE is a trauma-informed urge-surfing companion (MBRP-style) for people in recovery. This **web MVP** uses **Claude** (`claude-sonnet-4-20250514`) via `POST /api/session`, **localStorage** for session logs and med profile, **Zustand** for live session UI state, **Framer Motion** for the wave SVG, and **Recharts** on the dashboard.

## Setup

- Copy `web/.env.example` to `web/.env.local` and set `ANTHROPIC_API_KEY`.
- From `web/`: `npm install`, `npm run dev`, open http://localhost:3000
- `npm run lint` · `npm run build`

## Key paths

- `src/lib/types.ts` — shared domain types
- `src/lib/prompts.ts` — system prompt + medication-aware user prompts
- `src/lib/storage.ts` — localStorage (sessions, med profile, prefs)
- `src/lib/patterns.ts` — streak, triggers, med correlation, high-risk windows
- `src/app/api/session/route.ts` — Anthropic Messages API
- `src/app/api/insights/route.ts` — pattern JSON for dashboard
- `src/store/sessionStore.ts` — in-session UI state
- `src/components/session/session-flow.tsx` — intake → med ack → body scan → wave → reflection

## Conventions

- Server-only secrets: never expose `ANTHROPIC_API_KEY` to the client.
- Default export page components; colocate feature UI under `src/components/`.
- Prefer extending `SessionLog` / `IntakeData` in `types.ts` before ad-hoc shapes.

## Safety

- Copy is supportive, not medical advice. Crisis line: **988** (US).
- Do not commit `.env.local`.
