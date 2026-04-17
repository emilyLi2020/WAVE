# Gemma 4 Integration Plan for WAVE (Gemma Hackathon MVP)

> **Scope:** a single shippable MVP for the Gemma hackathon. **Gemma 4 does every
> inference step. No Claude. No cloud LLM. No server.** The web demo in `clients/`
> runs Gemma 4 in the user's browser; the same prompts will port unchanged to
> LiteRT on the production React Native app later.
>
> **Sources:**
> [Gemma 4 (DeepMind)](https://deepmind.google/models/gemma/gemma-4/) ·
> [ai.google.dev Gemma docs](https://ai.google.dev/gemma/docs) ·
> [Hugging Face: Welcome Gemma 4](https://huggingface.co/blog/gemma4)

---

## 1. MVP in one sentence

A judge opens the WAVE web demo, WebGPU loads a single cached **Gemma 4 E2B-it**
checkpoint once, and every word the patient sees during an urge-surfing session
— the medication acknowledgment, body-scan narration, wave rise/peak/fall
narration, post-session reflection, and the crisis-handoff copy — is generated
by that one Gemma 4 model, fully on-device, with the DevTools Network tab
empty after the model's first-load shards are cached.

## 2. Why this is the right MVP for a Gemma hackathon

- **Gemma end-to-end.** A judge can disable the network after the first load
  and the whole session still works. That's the Gemma story this hackathon
  rewards, and it's also the exact product WAVE is pitching.
- **One model, one runtime, one adapter footprint.** No vendor swap to explain,
  no "well, the mobile version would…" hand-wave. What runs in the browser is
  the same Gemma 4 that will run on-device via LiteRT.
- **Matches WAVE's actual constraints.** `PRD.md > Domain Constraints` already
  requires zero network requests on mobile and treats craving/medication data
  as PHI-adjacent. A Gemma-only MVP is the shortest path to those constraints
  and makes the demo claim honest.

## 3. Model + runtime (one choice)

**Model:** **Gemma 4 E2B-it**, INT4-quantized.
E2B (2.3 B effective / 5.1 B w/ embeddings, 128 k context, text + image + audio)
is the one Gemma 4 size designed for phone-class and browser-class runtimes
([HF blog](https://huggingface.co/blog/gemma4)).

**Runtime:** **`@huggingface/transformers` (transformers.js) + WebGPU** loading
the pre-built Gemma 4 E2B ONNX bundle directly in the browser. No Node server,
no API route, no key.

- First visit: ~1.5 GB of INT4 ONNX shards stream from Hugging Face's CDN and
  are cached in IndexedDB by the library.
- Subsequent visits and the demo itself: **zero network calls for inference.**
- The session page uses a Web Worker + OffscreenCanvas so the Lottie wave
  animation doesn't jank while the model streams tokens.

**What this replaces.** `PRD.md > Backend Routes` currently lists
`POST /api/session/narrate` as a thin proxy to Claude. In this MVP that route
is **deleted**. All narration goes through `clients/lib/gemma/session.ts`
(client-side). Session logs still write to `localStorage` (and to Supabase when
the user is signed in), per the PRD.

**Fallback (one, not three).** If WebGPU is unavailable or model load fails,
the session falls through to a **scripted local narration bank** keyed by
`matType × medicationStatus × phase`. This is the only fallback. No cloud LLM
is ever called.

**Not in the MVP (explicit cuts):**

- Separate E4B, 26B-A4B, or 31B deployments. One model, full stop.
- Any self-hosted server, llama.cpp server, Ollama, or vLLM.
- Fine-tuning. MVP runs on **base Gemma 4 E2B-it** + prompt templates.
- Pattern-insights, prophylactic notifications, medication photo recognition,
  and voice intake. These stay in `PRD.md > Out of Scope` for the hackathon.

---

## 4. Surfaces Gemma 4 E2B covers in the MVP

The MVP covers exactly the five surfaces on the session path from
`PRD.md > Core Flow`. Every one runs through the same `generateJSON<T>(schema,
prompt)` wrapper so the shapes are reviewable as typed data and the
implementation is interchangeable between browser runtime today and LiteRT
tomorrow.

For each surface: **Inputs** (typed, no raw strings at the model boundary),
**Output contract** (Zod-validated JSON), **Prompt strategy**, **Latency
budget** on a 2023+ WebGPU laptop, **Safety rails**, **Fallback**.

JSON mode is enforced by (a) a strict system prompt demanding JSON only, and
(b) Zod re-validation with one retry. If the second attempt still fails, the
scripted fallback runs. Gemma 4 emits clean JSON out of the box in the HF
blog's examples, so this is the conservative belt-and-suspenders path.

### 4.1 Medication-aware acknowledgment (phase 2)

**Inputs**

```ts
type AckInput = {
  intensity: number;            // 1..10
  medicationStatus: "on_time" | "late" | "missed" | "none";
  matType: "buprenorphine" | "naltrexone" | "methadone" | "vivitrol" | "none";
  trigger: "social" | "stress" | "physical" | "unknown" | "other";
  hoursSinceDose?: number;      // 0..48
  localeTimeOfDay: "morning" | "midday" | "evening" | "late_night";
};
```

**Output contract**

```ts
type AckOutput = {
  acknowledgment: string;        // <= 280 chars, 2–3 sentences
  pharmacologyClaim: {
    medication: AckInput["matType"];
    claim: string;               // short factual statement
    citation: "FDA_LABEL" | "SAMHSA_TIP63" | "MBRP_FACILITATOR" | "NONE";
  };
  crisisSignalDetected: boolean; // routes to §4.5 if true
  nextPhase: "body_scan";
};
```

**Prompt strategy.** System prompt bakes in the full medication matrix from
`PRD.md > Medication-Aware Prompt Logic` as canonical examples. User turn
carries the structured `AckInput`. Decoding: temperature 0.3, max 180 tokens,
JSON-only.

**Latency budget:** < 2.5 s to full JSON on a WebGPU laptop.

**Safety rails:**

- Zod-validate. On parse failure → one retry → scripted fallback.
- **Pharmacology allow-list.** Reject and fall back if
  `pharmacologyClaim.claim` contains any of `{increase, decrease, stop, start,
  double, skip}` + `{dose, medication}`. Matches
  `AGENTS.md > Domain Constraints > Not medical advice`.
- Pre-filter user inputs for suicidality / overdose / "already used" keywords
  and force `crisisSignalDetected=true` regardless of model output.

**Fallback.** `clients/lib/prompts/medication-ack-fallback.ts` has one hand-written
line per `(matType, medicationStatus)` cell of the PRD matrix.

### 4.2 Body-scan narration (phase 3)

**Inputs**

```ts
type BodyScanInput = AckInput & {
  bodyLocation: "chest" | "jaw" | "shoulders" | "legs" | "stomach" | "other";
};
```

**Output contract**

```ts
type BodyScanOutput = {
  narration: string;                 // <= 320 chars, 2nd person, grounded
  breathCount: 3 | 4 | 5;
  sensationLabel: "tight" | "warm" | "cold" | "fluttery" | "heavy" | "absent";
};
```

**Latency budget:** < 1.5 s.
**Safety rails:** Must not name any substance. Lexical post-filter + fallback.
**Fallback:** 18 scripted body-scan lines keyed by `bodyLocation`.

### 4.3 Adaptive wave narration (phase 4 — tightest surface)

Gemma only runs at the **three phase transitions** (rise → peak → fall).
In-between slider-driven micro-nudges are rule-based, not model-generated, to
protect the animation budget.

**Inputs** (one call per transition)

```ts
type WaveInput = AckInput & {
  phase: "rise" | "peak" | "fall";
  currentIntensity: number;
  intensityTrendLast60s: "up" | "flat" | "down";
  elapsedSeconds: number;           // 0..480
};
```

**Output contract**

```ts
type WaveOutput = {
  narration: string;                // <= 220 chars
  pacingHint: "slower" | "hold" | "faster";
  encouragement: "grounding" | "normalizing" | "celebrating";
};
```

**Latency budget:** < 1.8 s to full JSON, streamed.
**Safety rails:**

- Reject toxic-positivity lexicon (`"you got this"`, `"stay strong"`,
  `"don't give up"`). Matches `AGENTS.md > Domain Constraints > Trauma-informed tone`.
- `phase === "peak"` narration must be grounding or normalizing, never
  celebrating.

**Fallback:** 3 scripted lines per phase, picked by `(matType, trigger)`.

### 4.4 Post-session reflection (phase 5)

**Inputs**

```ts
type ReflectionInput = {
  intakeIntensity: number;
  endingIntensity: number;
  durationSeconds: number;
  medicationStatus: AckInput["medicationStatus"];
  matType: AckInput["matType"];
  sessionsCount: number;
  optionalJournalText?: string;     // <= 500 chars
};
```

**Output contract**

```ts
type ReflectionOutput = {
  insightOneLine: string;           // big line on the reflection screen
  journalPromptQuestion: string;
  suggestedNextStep: "call" | "walk" | "water" | "hands" | "rest";
  crisisSignalDetected: boolean;
};
```

**Latency budget:** < 2.0 s. Runs after the wave, not during.
**Safety rails:** `insightOneLine` must include the numeric ending intensity
(string contains check). Journal text tripping the crisis filter → §4.5.

### 4.5 Crisis triage (cross-cutting)

When a pre-filter or any other surface sets `crisisSignalDetected=true`, the
session is paused and Gemma generates the hand-off copy **only** — the routing
is rule-based and never trusted to the model.

**Rule (not model):**

- Suicidality → `routeTo="988"`, `continueSession=false`.
- "Used already" + lethal-dose markers → `routeTo="local_emergency"`,
  `continueSession=false`.
- Otherwise → `routeTo="samhsa_helpline"`, `continueSession=true`.

**Gemma's job:** produce a ≤ 200 char, calm, non-judgmental `copy` string for
the chosen route. Temperature 0.0, greedy, JSON-only.

**Safety rail:** `copy` is post-validated to contain the hotline number
matching `routeTo`. Mismatch → hard-coded canned copy is shown instead.

Matches `AGENTS.md > Domain Constraints > Crisis handoff`.

---

## 5. Summary matrix

| Surface | Model | Runtime | JSON mode | p95 latency | Fallback |
|---|---|---|---|---|---|
| §4.1 Medication ack | Gemma 4 E2B-it | transformers.js + WebGPU | system prompt + Zod retry | 2.5 s | scripted bank by `(matType, status)` |
| §4.2 Body scan | Gemma 4 E2B-it | transformers.js + WebGPU | system prompt + Zod retry | 1.5 s | 18 scripted lines by `bodyLocation` |
| §4.3 Wave narration | Gemma 4 E2B-it | transformers.js + WebGPU | system prompt + Zod retry | 1.8 s | 3 lines × 3 phases |
| §4.4 Reflection | Gemma 4 E2B-it | transformers.js + WebGPU | system prompt + Zod retry | 2.0 s | scripted insight line |
| §4.5 Crisis triage | Gemma 4 E2B-it (T=0) | transformers.js + WebGPU | strict | 1.5 s | canned hotline copy |

**One model. One runtime. One fallback per surface. No backend.**

---

## 6. Fine-tuning (not in the MVP)

The MVP ships on **base Gemma 4 E2B-it** with carefully engineered prompts and
the scripted fallbacks above. Fine-tuning is **not** a hackathon deliverable
for three reasons:

- The HF blog team reports Gemma 4 is "so good out of the box" they struggled
  to write good fine-tuning examples; base + prompt + structured output gets
  us across the line.
- Shipping a LoRA adapter requires a clinician-reviewed synthetic dataset,
  which is a multi-week process, not a hackathon process.
- Any fine-tune drifting the crisis-handoff copy away from the 988/SAMHSA
  rule is a safety regression. Base model + rule-based routing is safer.

If judges ask about fine-tuning, the answer is: "Post-hackathon, a single LoRA
adapter on Gemma 4 E2B-it trained on MBRP facilitator materials, SAMHSA TIP 63,
FDA MAT labels, MI transcripts, and ~2.5 k clinician-reviewed synthetic
dialogues, using Unsloth + TRL + QLoRA. The adapter is ~50 MB and ships inside
the app bundle." That plan is documented here for later but is **out of MVP
scope**.

---

## 7. What ships

Under `clients/`:

- `clients/lib/gemma/session.ts` — the single Gemma wrapper. Exposes
  `generateJSON<T>(schema, system, user): Promise<T>`. Loads E2B once per tab
  and reuses the pipeline across all five surfaces.
- `clients/lib/prompts/schemas.ts` — Zod schemas for §4.1–§4.5.
- `clients/lib/prompts/*.ts` — the five prompt templates and their scripted
  fallbacks, reviewable by a clinician without reading React.
- `clients/app/session/page.tsx` — wires the five surfaces into the existing
  session UI.

Removed:

- `clients/app/api/session/narrate/route.ts` (Claude proxy). The route is
  deleted. No server-side LLM call remains in the repo.
- Any `ANTHROPIC_API_KEY` references in env / docs.

---

## 8. Demo script (what the judges see)

1. Open the WAVE URL in Chrome/Edge with WebGPU.
2. First load streams the Gemma 4 E2B shards; a "Loading WAVE's on-device
   model" screen shows the progress bar. This happens **once**.
3. Judge opens DevTools → Network → toggles **Offline**.
4. Judge taps **7/10**, **"took Suboxone on time"**, **stress**.
5. Gemma 4 generates the Suboxone-on-time acknowledgment, in the browser,
   with DevTools Network showing zero requests.
6. Body scan → wave → reflection all run off the same cached model.
7. Judge sees one coherent story: **"This is a medication-aware urge surfing
   app. The same Gemma 4 model I just watched generate that session in my
   browser is what ships on-device in the mobile build."**

---

## 9. Honest risks

- **WebGPU availability.** Safari's WebGPU support has lagged. Mitigation:
  demo in Chrome/Edge; scripted fallback keeps Safari demo-able without LLM.
- **First-load size.** ~1.5 GB is large for a cold open. Mitigation: the
  landing page pre-warms the download before the user hits "Start a session".
- **Latency variance across laptops.** On a 2020-era integrated GPU the wave
  narration may miss the 1.8 s budget. Mitigation: if the first wave call
  exceeds the budget, lock the rest of the session to scripted narration and
  keep Gemma running only for the reflection copy (where latency doesn't
  matter).
- **Structured output drift.** Without grammar-constrained decoding in the
  browser, we rely on a strict system prompt + Zod retry. If parse-failure
  rate at demo time is > 1 %, we tighten the system prompt and lower
  temperature rather than add a larger model.

---

## 10. Porting to the production mobile app (context, not MVP)

Everything under `clients/lib/prompts/` and the `generateJSON<T>` signature is
identical on React Native with **LiteRT** loading the same Gemma 4 E2B
checkpoint. The only swap is the runtime behind `generateJSON`. That's the
whole point of making the web MVP Gemma-end-to-end: what the judges see **is**
the production plan, not a stand-in.
