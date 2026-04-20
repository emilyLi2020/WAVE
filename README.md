# WAVE

An offline-first, medication-aware urge surfing companion for SUD recovery.

- **Cursor / Claude Code skills** live under `.agents/skills/` and `.claude/skills/`.
- **WAVE web demo** lives under `clients/` (Next.js 16 + TypeScript + Tailwind v4).
- **Specs** live at the repo root — see `AGENTS.md` (agent instructions, tech stack, code style, domain constraints) and `PRD.md` (user flow, pages, data model, medication-aware prompt logic).

## Run the web demo

```bash
cd clients
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Navigate between **Home**, **Onboarding**, **Session**, **Dashboard**, **History**, and **Insights** from the top nav.

The scaffold is intentionally a stub — each page renders its PRD-defined layout with placeholder content. Flesh out features one at a time using the `feature-builder` skill. The medication-aware prompt assembler (`PRD.md > Medication-Aware Prompt Logic`) is the clinical core and the recommended first feature.

## Docs

- **`AGENTS.md`** — shared instructions every AI coding tool (Cursor, Claude Code, Codex, Copilot, etc.) reads automatically.
- **`PRD.md`** — source of truth for what to build. Every scaffold, route, and prompt is derived from it.
- **`docs/models.md`** — per-model reference: the Gemma 4 base, every LoRA adapter, what each one is fine-tuned for, where it is used in the product, and its input/output contract.
- **`docs/model-training.md`** — how we produce every LoRA: data collection, Synthetix synthetic-data pipeline, clinician spot-check, train/test split, QLoRA training recipe, eval harness, and ship gates.
- **`clients/.cursor/rules/frontend-guardrails.mdc`** — frontend guardrails scoped to `clients/`.
