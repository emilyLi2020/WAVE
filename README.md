# WAVE

Monorepo-style layout: **Cursor skills** under `.agents/skills/`, the **WAVE web app** under `web/` (Next.js + TypeScript + Tailwind + Claude API + localStorage MVP).

## Run the app

```bash
cd web
cp .env.example .env.local
# Set ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SECRET_KEY in .env.local
# Run supabase/migrations/001_wave_tables.sql in the Supabase SQL editor once.

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Complete onboarding, then use **Dashboard**, **Session**, and **History** from the nav.

## Docs

- **`DOMAIN_SPEC.md`** — high-level product notes (repo root).
- **`web/PRD.md`** — product doc for the web scaffold.
- **`web/AGENTS.md`** — agent context (commands, stack, file map).
