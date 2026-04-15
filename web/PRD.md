# Product Requirements Document — Wave

## What Is This?

An app that helps hackathon builders **ship a visible MVP quickly** by providing a landing page, navigation, a placeholder core route, and clear docs for the next iteration.

## Who Is It For?

You and teammates during a time-boxed build: you want something running in the browser, a obvious place for the main workflow, and files (`DOMAIN_SPEC.md`, this PRD) that stay aligned with what you actually implement.

## Core Features (MVP)

1. **Landing** — Explains Wave in one screen with a single primary action to the core route.
2. **Navigation** — Header links between home and the core feature page.
3. **Core feature page** — Placeholder route ready to become your real input → process → output flow.

## What This Is NOT

- Not a hosted SaaS with accounts until you add auth and data policies.
- Does not include backend persistence or payments in the starter scaffold.
- V1 does not include native mobile apps.

## User Flow

1. User opens the app and sees the Wave landing copy and call to action.
2. User clicks **Open core feature** (or uses the nav) to go to `/feature`.
3. The system shows the placeholder core page until you replace it with real behavior.
4. User can return home via the Wave brand link or **Home** in the nav.

## Pages / Screens

| Page        | Purpose                         | Key elements                          |
| ----------- | ------------------------------- | ------------------------------------- |
| Landing `/` | First impression, explains Wave | Heading, subtitle, CTA to `/feature` |
| Core `/feature` | Main workflow (placeholder) | Title, guidance to update PRD/spec |

## Success Criteria

- [ ] User can open the home page and understand the project in under 30 seconds.
- [ ] User can navigate to `/feature` and back without broken links.
- [ ] `npm run dev` serves the app locally with no errors.
- [ ] App builds with `npm run build`.

## Domain Constraints

Replace this section when you specialize the product (regulated industries, PII, etc.). Until then: no claims of professional advice; no collection of sensitive data without a defined policy.

## Out of Scope (Save for Later)

- Authentication and user profiles
- Database and server APIs
- Analytics, A/B testing, and email
- Internationalization
