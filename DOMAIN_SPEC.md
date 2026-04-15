# Wave — Domain to Spec

This spec was generated as a **starter baseline** because no profession-specific domain was provided yet. Replace the bracketed or generic sections with your real domain before serious feature work.

## 1. One-Sentence Summary

Wave is a small web app that introduces the project, links to the core experience, and gives you a place to grow a hackathon MVP without a blank canvas.

## 2. Target User

You (the builder) and teammates during the hackathon: you need a visible running app, clear navigation, and agent-friendly docs (`AGENTS.md`, `PRD.md`) so iteration stays fast.

## 3. Domain Constraints

- No medical, legal, or financial advice unless you later encode real rules with expert review.
- Do not store sensitive personal data until you define compliance needs.
- Prefer plain, honest copy over claiming features that are not implemented.

## 4. Core Flow

```
INPUT: Visitor opens the site and optionally clicks through to the core page.
  |
PROCESS: Static and server-rendered UI; future steps can add forms, APIs, and persistence.
  |
OUTPUT: Clear value proposition, working navigation, and a placeholder area for the main product flow.
```

## 5. Data Model (plain English)

For this MVP: none required. Later: users, sessions, or domain entities you define in `PRD.md`.

## 6. Risk Areas

1. **Scope creep** — adding backend/auth before the core loop is proven.
2. **Vague requirements** — building features before updating this spec and the PRD.
3. **Deployment gaps** — env vars and secrets mishandled under time pressure.

## 7. MVP Scope (first week)

- Next.js app with landing page, core feature page, shared layout and nav.
- `AGENTS.md` and `PRD.md` at the app root for agents and humans.
- Repo README pointing to how to run the app.

## 8. Out of Scope (later)

- Authentication, payments, and production-grade compliance until specified.
- Mobile native apps (use responsive web first unless you pivot).

## Domain ↔ software mapping (when you specialize)

| Your domain concept | Software direction |
|---------------------|--------------------|
| Form or checklist | Validated forms (e.g. Zod) |
| Decision tree | Wizard / step flow |
| Reference library | Searchable content or RAG later |
| Report | Generated page or export |

When you know your real domain, paste: *“I’m a {role} building a tool to {outcome}”* into chat and revise this file with regulations, top errors, users, and success criteria.
