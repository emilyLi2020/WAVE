# AGENTS.md

## Project Overview

WAVE is an AI-powered urge surfing companion for people in Substance Use Disorder (SUD) recovery. It guides patients through evidence-based urge surfing sessions (Marlatt's Mindfulness-Based Relapse Prevention protocol), personalized in real time by the patient's **current medication status**, **craving intensity**, and **trigger**. Over time it learns each patient's personal high-risk windows and fires **prophylactic notifications 15 minutes before a predicted craving**, intervening during the anticipation phase when patients still have executive function.

The production vision is a **React Native mobile app** that runs **Gemma 4 entirely on-device** with all data stored locally (encrypted SQLite). The hackathon deliverable is a **Next.js web demo** in `web/` that showcases the session UX, medication-aware prompting, and pattern dashboard. Both surfaces read from the same PRD in `PRD.md`.

## Repo Layout

- `web/` — Next.js 15 (App Router) + TypeScript + Tailwind v4 web demo. This is the active hackathon surface and what `pnpm dev` / `npm run dev` runs. Includes `src/app` routes, API Route Handlers that proxy Claude, and Supabase client wiring.
- `supabase/migrations/` — SQL migrations for the demo's Supabase project (session logs, medication logs, journal entries). Production mobile app replaces this with encrypted on-device SQLite.
- `.agents/skills/`, `.claude/skills/` — Cursor / Claude Code agent skills (`domain-to-spec`, `scaffold-frontend`, `scaffold-backend`, `v0-prompt-crafter`, `demo-prep`, etc.). Do not edit these during feature work.
- `frontend/`, `backend/` — Empty legacy folders. Do not use. The live app is in `web/`.
- `AGENTS.md` — This file. Shared instructions for every AI agent working in the repo.
- `PRD.md` — Product Requirements Document. The source of truth for what to build and the medication-aware prompt logic.
- `DOMAIN_SPEC.md` — Legacy starter spec, superseded by `PRD.md`. Safe to ignore.
- `README.md` — Human-facing quickstart.

## Setup Commands

### Web demo (`web/`)

- Install: `cd web && npm install`
- Dev: `cd web && npm run dev` (http://localhost:3000)
- Build: `cd web && npm run build`
- Lint: `cd web && npm run lint`
- Env: copy `web/.env.example` to `web/.env.local` and set `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`.
- Database: run `supabase/migrations/001_wave_tables.sql` once in the Supabase SQL editor (or via the Supabase CLI).

### Mobile (future, not in this repo yet)

- React Native + Expo, Gemma 4 E2B via LiteRT, SQLite with SQLCipher. See `PRD.md > Tech Stack (Production)`.

## Tech Stack

**Hackathon web demo (what runs today):**
- Next.js 15 (App Router), TypeScript strict, Tailwind CSS v4
- Anthropic Claude API (stand-in for Gemma 4) via Route Handlers
- Supabase Postgres (stand-in for encrypted on-device SQLite) for session/medication/journal logs
- Lottie for the wave animation
- localStorage fallback for fully offline demos

**Production mobile (roadmap):**
- React Native (iOS + Android), Expo
- Gemma 4 E2B via LiteRT (on-device LLM)
- Gemma 4 multimodal (on-device medication photo identification)
- SQLite with SQLCipher (encrypted local DB)
- iOS/Android local notification schedulers
- Unsloth + QLoRA fine-tuning on MBRP facilitator materials, MI transcripts, SAMHSA MAT guides, and synthetic clinical dialogues.

## Code Style

- TypeScript strict mode across `web/`. No `any` without a justification comment.
- Functional React components with hooks. No class components.
- Server components by default in the App Router; add `"use client"` only for interactivity (intake forms, wave animation, intensity slider, body-scan tap targets).
- kebab-case for filenames, PascalCase for components, camelCase for functions and variables.
- Validate all user input with Zod at every API boundary.
- **Clinical copy lives in data, not in components.** Medication-aware prompts (`AGENTS.md > Domain Constraints`) must be stored as structured prompt templates in `web/src/lib/prompts/` so a clinician can review them without reading React code.
- No single-letter variable names. No unexplained abbreviations.
- Every craving-rating, medication-status, and trigger field must be typed with a narrow union (not `string`).

## Testing Instructions

- Lint and type-check before committing: `cd web && npm run lint && npx tsc --noEmit`.
- Add a manual test path to every PR that touches the session flow. Example format:
  1. Go to `/session`
  2. Tap 7/10, "took on time", "stress"
  3. Expect medication-acknowledgment text that references Suboxone working
  4. Drag slider to 2
  5. Expect post-session reflection citing the drop
- Do not add automated tests that hit the Anthropic API in CI. Mock the Route Handler response.

## Security Considerations

- **Never store or log raw medication photos.** In the production mobile app the photo must be processed in-memory by on-device vision and discarded. In the web demo, do not upload photos to Supabase — if a demo photo feature is added, process it client-side only.
- Never hardcode API keys. `ANTHROPIC_API_KEY` and `SUPABASE_SECRET_KEY` live only in `web/.env.local`. `.env.local` is in `.gitignore`.
- Craving logs, medication logs, and journal entries are **protected-health-information-adjacent**. Treat them as PHI-like even though the app is not a covered entity: no third-party analytics, no error-tracking payloads containing user text, no shipping logs off-device without explicit opt-in.
- The web demo's Supabase tables must enable Row Level Security and scope every row to the authenticated user. See `.claude/skills/supabase-postgres-best-practices/SKILL.md`.
- Ask the user before destructive database operations, large refactors of the session flow, or adding any new network request to the session experience. **The session path must stay zero-network on mobile; keep the web demo's session network surface minimal.**

## PR Instructions

- Title format: `[feature|fix|chore|clinical] Short description`. Use `clinical` for changes to prompt templates, medication logic, or session copy.
- Run lint and typecheck before committing. Fix any errors you introduced.
- Keep diffs small and focused. Split prompt-copy changes from code changes where possible so clinicians can review prompt PRs without noise.
- Every PR that changes session prompts must link the MBRP / SAMHSA / FDA source that justifies the new copy, or cite the synthetic clinical dialogue in the training set.
- Include a manual test path in the PR description (see Testing Instructions).

## Domain Constraints

- **MBRP fidelity**: Session structure must preserve Marlatt's Mindfulness-Based Relapse Prevention flow — intake, acknowledgment, body scan, wave (rise / peak / fall), reflection, next-step prompt. Do not collapse or reorder these phases without clinical review.
- **Trauma-informed, non-judgmental tone**: Never use toxic-positivity phrasing ("You've got this!", "Stay strong!") and never imply the patient has failed. If the patient missed a dose or used, the response must normalize and redirect, never shame.
- **Medication accuracy**: All pharmacology statements (half-lives, trough windows, receptor effects) must match FDA labels and SAMHSA MAT guidance. The canonical medication→prompt logic map lives in `PRD.md > Medication-Aware Prompt Logic`. Any change to medication copy requires a citation.
- **Not medical advice**: The app is a support tool, not a prescriber. Never tell a patient to start, stop, or change a medication. "Take your medication if available" is acceptable; "You should increase your dose" is not.
- **Crisis handoff**: If a patient indicates active suicidality, overdose risk, or that they have already used a potentially lethal amount, the app must surface the 988 Suicide & Crisis Lifeline and SAMHSA's National Helpline (1-800-662-HELP) before continuing the session.
- **Offline-first (production)**: In the mobile product, the session path must make **zero network requests**. The web demo may call Claude via a Route Handler but must degrade gracefully to a scripted local fallback if the network fails.
- **Privacy floor**: No account required to use the app. No third-party analytics in the session flow. Opt-in only for any data export to a clinician, and exports must be local files (PDF/JSON) the patient chooses to share.
