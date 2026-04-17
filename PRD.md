# Product Requirements Document

## What Is This?

WAVE is an offline-first, medication-aware urge surfing companion that helps people in SUD recovery ride out cravings in real time — and learns their personal high-risk windows so it can notify them **before** the next craving peaks.

## Target User

Adults in recovery from Substance Use Disorder (opioid, alcohol, or stimulant), many of whom are on Medication-Assisted Treatment (Suboxone / buprenorphine, Naltrexone, Methadone, or Vivitrol). They typically have a counselor or prescriber they see weekly or monthly, but the window between craving onset and acting on it is often under 10 minutes — far shorter than any professional support can respond to. Existing urge-surfing apps treat every craving identically and ignore the patient's medication status entirely, which is clinically wrong: the same 7/10 craving means something very different at hour 4 versus hour 22 post-Suboxone dose. Our user is frustrated that no tool meets them where they actually are, neurobiologically, at the moment the wave builds.

## Core Flow

```
INPUT:   Patient opens WAVE (via proactive notification, lock-screen
         widget, watch complication, or Siri shortcut) and taps three
         answers: craving intensity (1-10), medication status (on-time /
         late / missed / N/A), trigger category (social / stress /
         physical / unknown).

PROCESS: Gemma 4 on-device (web demo: Claude) generates a medication-
         aware session: a 1-2 min medication acknowledgment tuned to
         what they took or missed, a body-scan that locates the craving
         physically, a 5-8 min wave animation with adaptive narration
         through rise / peak / fall phases, and a reflection that shows
         the patient their own longitudinal craving-vs-medication data.

OUTPUT:  Patient rates ending intensity on the slider, sees a one-screen
         insight ("You surfed a 7 down to 2. On medication days you drop
         5.1 points on average; off-medication days 2.8."), picks a next
         action (call someone, walk, water, rest), and the session is
         logged locally to refine future risk-window predictions.
```

## Core Features (MVP)

1. **Three-tap intake** — intensity, medication status, trigger — that fully conditions the rest of the session.
2. **Medication-aware acknowledgment** — Gemma 4 generates pharmacologically correct, trauma-informed copy based on which MAT the patient is on and whether they took today's dose.
3. **Urge surf wave session** — animated wave (Lottie) with adaptive rise / peak / fall narration and a live intensity slider the patient drags as the wave changes.
4. **Longitudinal pattern learning** — after ~7 sessions, the on-device model surfaces high-risk time windows and a medication-vs-craving correlation the patient can see in their own data.
5. **Prophylactic notifications** — local scheduler fires a "the next 2 hours can be challenging" alert 15 minutes before a predicted risk window, plus missed-dose and medication-trough alerts.
6. **Minimum-friction entry points** — lock-screen widget, Apple Watch / Wear OS complication, Siri / Google shortcut, and a clinician-handed physical card with a "text WAVE to yourself" shortcut.

## Pages / Screens

| Page | Purpose | Key Elements |
|------|---------|--------------|
| Landing (`/`) | Explain WAVE to a clinician or patient in 10 seconds; route to onboarding or an in-session demo | Hero, one-sentence value prop, "Start a session" CTA, privacy pledge, demo video link |
| Onboarding (`/onboarding`) | Capture the only three things we need: first name (optional), what MAT if any, usual dose time | 3-step form, Zod validation, written consent checkbox, stored locally (localStorage in web demo, SQLCipher on mobile) |
| Session (`/session`) | The whole urge-surfing protocol — intake → medication ack → body scan → wave → reflection → next step | Intake 3-tap, medication-ack text block, body diagram with tappable regions, Lottie wave animation, live intensity slider, post-session insight card, next-step chips |
| Dashboard (`/dashboard`) | Show the patient their own data so medication adherence feels visible | Sessions count, average drop, medication-vs-no-medication drop delta, high-risk windows heatmap, current streak |
| History (`/history`) | Chronological list of sessions with expandable details and optional journal entries | Session list, filter by outcome / trigger / medication status, "Export for clinician" button (local PDF) |
| Insights (`/insights`) | Plain-English patterns Gemma 4 has noticed, updated weekly | Trigger frequency, time-of-day risk, medication correlation, one-actionable suggestion per week |

## User Flow

1. **Pre-craving**: WAVE's local scheduler fires a notification 15 minutes before a predicted risk window. Patient sees it on the lock screen: "Your history shows the next 2 hours can be challenging. Open WAVE now — before the wave builds." One tap opens the app directly into the intake.
2. **Intake**: Patient taps intensity (e.g. 7/10), medication status (e.g. "took Suboxone on time"), and trigger (e.g. "stress"). No typing. ~30 seconds.
3. **Acknowledgment**: Gemma 4 generates 2-3 sentences specific to "Suboxone + on-time + 7/10 + stress". Patient hears that their medication is already dampening this craving — what they feel at 7 would be a 9 without it.
4. **Body scan**: Patient taps the part of a body diagram where the craving sits (chest / jaw / legs / stomach). The narration acknowledges the specific location.
5. **Wave**: 5-8 minute animated wave. Narration adapts to phase — hardest language at "rising", most grounded at "peak", and celebration at "falling". Patient drags a live intensity slider that logs every 15 seconds.
6. **Reflection**: Post-session screen: "You surfed a 7 down to 2. That's your 12th session. On medication days you drop 5.1 points on average." Optional one-line journal.
7. **Next step**: Patient picks a 10-minute action (call someone / walk / water / hands / rest). Session logs and closes.
8. **Over time**: Notifications get more precise as the pattern model sees more sessions. Dashboard and Insights show the patient their recovery in their own numbers.

## Data Model

All entities are stored **locally on the patient's device** in production (encrypted SQLite). In the hackathon web demo, the same shapes live in Supabase with Row Level Security scoping every row to the authenticated user (or in `localStorage` for the anonymous demo mode).

- **Patient profile** — first name (optional), MAT type (`buprenorphine | naltrexone | methadone | vivitrol | none`), usual dose time, created at. No account, no email required.
- **Session** — id, started at, ended at, intake craving intensity (1-10), ending craving intensity (1-10), medication status at session (`on_time | late | missed | none`), trigger category (`social | stress | physical | unknown | other`), body-scan location (`chest | jaw | shoulders | legs | stomach | other`), outcome (`completed | left_early | used`), optional journal text.
- **Intensity sample** — session id, timestamp, intensity value. Written every 15 seconds during the wave phase so we can show the patient the actual shape of their craving later.
- **Medication log** — id, timestamp, MAT type, dose amount (if known), source (`manual | photo`). Photos are never stored — only the extracted structured fields.
- **Notification event** — id, fired at, type (`prophylactic | missed_dose | trough | reinforcement`), predicted risk window, whether the patient opened the app within 30 minutes.
- **Risk-window model** — derived, rebuilt on-device after every session. Stores predicted high-risk time windows per weekday and a medication-craving correlation coefficient.

## Backend Needed?

**No** — because the production vision is fully on-device (Gemma 4 via LiteRT, encrypted local SQLite, local notification scheduler, on-device vision for medication photos). The hackathon web demo in `web/` already covers its server needs with Next.js Route Handlers (thin proxy to Anthropic's Claude API) and Supabase Postgres for logged-in demo data — no separate Python / FastAPI service is needed.

Do **not** run the `scaffold-backend` skill.

### Backend Routes

N/A. The web demo's server needs are handled inside `web/src/app/api/` as Route Handlers. For reference, the handlers that exist or are planned:

- `POST /api/session/narrate` — accepts intake payload, returns medication-aware narration for the current session phase (proxies Claude in the demo; replaced by on-device Gemma 4 on mobile).
- `POST /api/session` — persist a completed session row to Supabase.
- `GET /api/sessions` — list the authenticated user's sessions for Dashboard and History.
- `POST /api/medication` — log a manual medication entry.
- `POST /api/insights/recompute` — rebuild the risk-window model from session history.

None of these are required for the fully-offline production mobile app; they exist only so the web demo can run on a laptop in front of judges.

## Domain Constraints

- **MBRP fidelity** — the session must follow Marlatt's Mindfulness-Based Relapse Prevention phases in order: intake → medication acknowledgment → body scan → wave (rise / peak / fall) → reflection → next-step prompt. Do not collapse phases.
- **Trauma-informed tone** — warm, grounded, never toxic-positivity. Never imply failure. Missed doses and relapses are normalized and redirected, never shamed.
- **Medication accuracy** — all pharmacology copy must match FDA labels and SAMHSA MAT guidance. See the Medication-Aware Prompt Logic section below for the canonical mapping.
- **Not medical advice** — WAVE never prescribes. "Take your medication if available" is acceptable; "increase your dose" is not.
- **Crisis handoff** — any signal of active suicidality, overdose risk, or lethal-dose use surfaces 988 (Suicide & Crisis Lifeline) and 1-800-662-HELP (SAMHSA National Helpline) before the session continues.
- **Privacy floor** — no account required, no third-party analytics in the session path, opt-in only for any export to a clinician, and exports must be local files the patient chooses to share.
- **Offline-first (production)** — the mobile session path makes zero network requests. The web demo may call Claude via a Route Handler but must have a scripted local fallback when offline.

## Medication-Aware Prompt Logic

This is the clinical core of WAVE and the source of truth for every prompt in `web/src/lib/prompts/`. Any change requires a citation to MBRP, SAMHSA, or an FDA label.

| Medication | Status | Example acknowledgment framing |
|---|---|---|
| Buprenorphine / Suboxone | On-time dose | "Your medication is actively working right now. What you're feeling at a 7 would be a 9 or 10 without it. Let's work with what's left." |
| Buprenorphine / Suboxone | Missed dose | "Part of what you're feeling is partial withdrawal — not just craving. That's why it's more intense. Can you take your medication right now?" |
| Buprenorphine / Suboxone | 16-22h post-dose | "Your medication levels may be dropping. This is a normal trough. If a wave is building, we can surf ahead of it." |
| Naltrexone (oral) | Taken | "The reward pathway is blocked. Your brain is chasing something it physically cannot have tonight. Let's redirect that energy." |
| Vivitrol (injection) | First 2 weeks | "Week 2 on Vivitrol is often the hardest — your brain is recalibrating. This intensity is temporary and expected, not a sign you're failing." |
| Methadone (oral) | Any | "Your methadone peaks about 2-4 hours after you take it. When did you dose today? Let's locate you in that curve." |
| None / not on MAT | — | "Let's work with your body's natural rhythms." (standard MBRP protocol, no pharmacology claims) |

## Success Criteria

- [ ] Patient can complete a full session end-to-end in under 20 minutes from a cold open.
- [ ] Three-tap intake: no typing required to start a session.
- [ ] Every session's medication acknowledgment is different when the medication status changes, and pharmacologically correct in each case.
- [ ] Dashboard shows the patient their medication-vs-no-medication drop delta as soon as they have at least one of each.
- [ ] Prophylactic notifications fire locally in the web demo (service worker or scheduled Supabase job) for at least one simulated risk window.
- [ ] App is deployed to a public Vercel URL and loads with JavaScript disabled far enough to show the value prop and privacy pledge.
- [ ] Judges can open DevTools Network tab during the session phase and see zero new requests after the initial Claude call (or zero total requests in the scripted-fallback demo mode).

## What This Is NOT

- Not a substitute for a counselor, sponsor, prescriber, or crisis line.
- Not a diagnostic tool. It does not diagnose SUD, withdrawal, or overdose.
- Not a medication reminder app in the narrow sense — medication awareness is in service of the urge-surfing session, not a standalone adherence tracker.
- Not a social or peer-support product. No feed, no friends, no sharing.
- Not cloud-backed in production. On mobile, nothing leaves the device.

## Out of Scope (Save for Later)

- Native iOS / Android React Native builds (the hackathon ships the web demo).
- On-device Gemma 4 integration via LiteRT (the web demo uses Claude as a stand-in).
- Apple Watch / Wear OS complications.
- Siri / Google Assistant shortcuts.
- Multimodal medication photo recognition (Gemma Vision on-device).
- Clinician-facing portal for cohort-level insights.
- Multi-language support (English only at MVP).
- Integration with EHR systems (Epic, Cerner) via FHIR.
- Payments / premium features — the app is free.

## Risk Areas

1. **Clinical copy regression** — a well-meaning code change to prompt assembly accidentally strips a medication-specific clause, and a patient on Naltrexone hears generic Suboxone copy. Mitigation: prompt templates live in `web/src/lib/prompts/` as typed, testable data; every prompt PR has a clinical citation.
2. **Notification fatigue** — too many prophylactic alerts turn into noise the patient mutes. Mitigation: cap at one prophylactic + one medication alert per day by default, and let the pattern model down-weight windows the patient ignores repeatedly.
3. **Offline-first promise breaks under demo pressure** — the web demo accidentally ships a session that hard-requires the Claude Route Handler and dies when the conference Wi-Fi drops. Mitigation: scripted local-fallback narration path covering all four medication statuses, exercised in every PR's manual test.
