# WAVE

Monorepo-style layout: **Cursor skills** under `.agents/skills/`, the **WAVE web app** under `web/` (Next.js + TypeScript + Tailwind + Claude API + localStorage MVP).

## Run the app

```bash
cd web
cp .env.example .env.local
# Add ANTHROPIC_API_KEY to .env.local

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Complete onboarding, then use **Dashboard**, **Session**, and **History** from the nav.

## Docs

- **`DOMAIN_SPEC.md`** — high-level product notes (repo root).
- **`web/PRD.md`** — product doc for the web scaffold.
- **`web/AGENTS.md`** — agent context (commands, stack, file map).
