# WAVE — Models

> Per-model reference. Every model this app loads, what it is, what it is
> fine-tuned for, where it runs in the product, and what contract it is held
> to.
>
> For the *process* of producing and training these models — synthetic data
> generation, spot-check UI, train/test split, QLoRA recipe, eval harness —
> see [`model-training.md`](./model-training.md). This file is strictly the
> **what**, not the **how**.

---

## Quick overview

WAVE ships **one base model** and **a stack of small LoRA adapters**. One base
is loaded in memory; the Adapter Manager hot-swaps the appropriate LoRA in for
each session phase.

```
                 ┌─────────────────────────────────────────────┐
                 │ Gemma 4 E2B-it (INT4) — one base, in memory  │
                 └─────────────────────────────────────────────┘
                                        │
                 ┌──────────────────────┼────────────────────────┐
                 │                      │                        │
      ┌──────────┴───────┐    ┌─────────┴────────┐   ┌───────────┴──────┐
      │ lora-med-ack     │    │ lora-wave-peak   │ … │ lora-reflection  │
      └──────────────────┘    └──────────────────┘   └──────────────────┘
                                        ▲
                          hot-swapped per phase by the Adapter Manager
```

Base is shared across every surface. Each LoRA targets one clinical situation.
**Crisis triage intentionally has no LoRA** — it runs on the base model with
rule-based routing so no fine-tune can ever drift the hotline hand-off.

Sources for Gemma 4 itself:
- [Gemma 4 — DeepMind](https://deepmind.google/models/gemma/gemma-4/)
- [ai.google.dev Gemma docs](https://ai.google.dev/gemma/docs)
- [Hugging Face: Welcome Gemma 4](https://huggingface.co/blog/gemma4)

---

## Base model

### `google/gemma-4-E2B-it` (INT4)

| Field | Value |
|---|---|
| Parameters | 2.3 B effective / 5.1 B with embeddings |
| Context window | 128 k |
| Modalities | text + image + audio |
| Quantization | INT4 |
| Disk size | ~1.5 GB |
| Fine-tuned? | No (no global fine-tune) |
| Runtime, web demo | `@huggingface/transformers` (transformers.js) + WebGPU |
| Runtime, mobile | LiteRT (post-hackathon port) |
| Loaded | Once per process, pinned in memory, never evicted |

**Why this size.** E2B is the one Gemma 4 size designed for phone-class and
browser-class runtimes. It is the only size that fits WAVE's hard envelope —
zero LLM network requests in the session path, PHI-adjacent data that cannot
leave the device, and session-phase responses within ~2 s.

**Where it is used in the product.** Every LLM call. The LoRAs below ride on
this base. Crisis triage runs on this base **without** a LoRA attached.

**What it is fine-tuned for.** Nothing globally. The base ships unmodified;
all specialization is delivered via LoRA adapters.

---

## LoRA adapters (MVP — ✅ shipping)

Each LoRA in this section is part of the MVP. They cover the session path end
to end. "Where used" names the exact session phase from
`PRD.md > Core Flow` / `PRD.md > User Flow`.

### 1. `lora-med-ack`

| Field | Value |
|---|---|
| Base | `google/gemma-4-E2B-it` (INT4) |
| Rank / alpha / dropout | 16 / 32 / 0.05 |
| Adapter size | ~40 MB |
| Where used in the product | Session page, phase 3 — the 1–2 min medication-aware acknowledgment that runs right after the **intake safety screen** clears (i.e. the patient has answered the two rule-based yes/no safety questions and has not been routed out to the SAMHSA handoff). This LoRA never loads on the safety-exit path. |
| p95 latency budget | 2.5 s to full JSON |

**What it is fine-tuned for.** Generating a pharmacologically-correct,
trauma-informed, 2–3 sentence acknowledgment that is shaped by the patient's
`matType` (Buprenorphine / Suboxone, Naltrexone, Methadone, Vivitrol, none),
their `medicationStatus` (`on_time | late | missed | none`), the craving
`intensity`, the `trigger` category, and time of day. The canonical tone
target per (medication, status) cell is the row of `PRD.md >
Medication-Aware Prompt Logic`. The adapter's job is to make the base model
reliable at hitting that cell's content.

**Input / output contract.**

```ts
type AckInput = {
  intensity: number;            // 1..10
  medicationStatus: "on_time" | "late" | "missed" | "none";
  matType: "buprenorphine" | "naltrexone" | "methadone" | "vivitrol" | "none";
  trigger: "social" | "stress" | "physical" | "unknown" | "other";
  hoursSinceDose?: number;      // 0..48
  localeTimeOfDay: "morning" | "midday" | "evening" | "late_night";
};

type AckOutput = {
  acknowledgment: string;        // <= 280 chars, 2–3 sentences
  pharmacologyClaim: {
    medication: AckInput["matType"];
    claim: string;               // short factual statement
    citation: "FDA_LABEL" | "SAMHSA_TIP63" | "MBRP_FACILITATOR" | "NONE";
  };
  crisisSignalDetected: boolean;
  nextPhase: "body_scan";
};
```

**Hard safety invariants** (enforced by the eval harness — see
`model-training.md`):
- `pharmacologyClaim.medication === input.matType`.
- `pharmacologyClaim.claim` never contains `{increase, decrease, stop, start, double, skip}` × `{dose, medication}` (the "not medical advice" allow-list).
- No toxic-positivity lexicon (`"you got this"`, `"stay strong"`, `"don't give up"`).
- No substance named in the user-facing `acknowledgment`.

**Fallback.** If this LoRA fails to produce valid JSON twice in a row or
WebGPU is unavailable, that surface falls back to a hand-written line per
`(matType, medicationStatus)` cell from the PRD matrix.

---

### 2. `lora-body-scan`

| Field | Value |
|---|---|
| Base | `google/gemma-4-E2B-it` (INT4) |
| Rank / alpha / dropout | 8 / 16 / 0.05 |
| Adapter size | ~25 MB |
| Where used in the product | Session page, phase 4 — the body-scan narration after the patient taps the body region where the craving sits (chest / jaw / shoulders / legs / stomach / other) |
| p95 latency budget | 1.5 s |

**What it is fine-tuned for.** Generating a ≤ 320 char second-person
grounded narration that acknowledges the specific `bodyLocation` the patient
tapped, a `breathCount` pacing hint (3 / 4 / 5), and a single-word
`sensationLabel` from a closed vocabulary. Tone is shorter and more
somatic than `lora-med-ack`.

**Input / output contract.**

```ts
type BodyScanInput = AckInput & {
  bodyLocation: "chest" | "jaw" | "shoulders" | "legs" | "stomach" | "other";
};

type BodyScanOutput = {
  narration: string;                 // <= 320 chars, 2nd person, grounded
  breathCount: 3 | 4 | 5;
  sensationLabel: "tight" | "warm" | "cold" | "fluttery" | "heavy" | "absent";
};
```

**Hard safety invariants.**
- No substance named in `narration`.
- `sensationLabel` is always one of the closed vocabulary values.

**Fallback.** 18 hand-written body-scan lines keyed by `bodyLocation`.

---

### 3. `lora-wave-rise`

| Field | Value |
|---|---|
| Base | `google/gemma-4-E2B-it` (INT4) |
| Rank / alpha / dropout | 8 / 16 / 0.05 |
| Adapter size | ~25 MB |
| Where used in the product | Session page, phase 5a — narration at the **rise** phase transition of the 5–8 min wave animation |
| p95 latency budget | 1.8 s |

**What it is fine-tuned for.** Short, directive, "ride the build" narration
for the rising phase of the MBRP urge-surfing wave. Must respect the patient's
live `intensityTrendLast60s`. In-between slider micro-nudges during the rise
are rule-based, not model-generated — this LoRA only runs at the rise
transition.

**Input / output contract.** (same `WaveInput` / `WaveOutput` for all three
wave LoRAs)

```ts
type WaveInput = AckInput & {
  phase: "rise" | "peak" | "fall";
  currentIntensity: number;
  intensityTrendLast60s: "up" | "flat" | "down";
  elapsedSeconds: number;           // 0..480
};

type WaveOutput = {
  narration: string;                // <= 220 chars
  pacingHint: "slower" | "hold" | "faster";
  encouragement: "grounding" | "normalizing" | "celebrating";
};
```

**Hard safety invariants.**
- Never shaming.
- Never names a substance.

**Fallback.** Three hand-written rise lines per `(matType, trigger)` cell.

---

### 4. `lora-wave-peak`

| Field | Value |
|---|---|
| Base | `google/gemma-4-E2B-it` (INT4) |
| Rank / alpha / dropout | 8 / 16 / 0.05 |
| Adapter size | ~30 MB |
| Where used in the product | Session page, phase 5b — narration at the **peak** transition of the wave animation |
| p95 latency budget | 1.8 s |

**What it is fine-tuned for.** The most grounding of the three wave LoRAs.
Copy is calm, present-tense, and normalizing. The peak is where the wave
feels the worst; this is the most clinically sensitive LoRA in the session.

**Hard safety invariants.**
- `encouragement` is **never** `"celebrating"` at peak.
- Never shaming.
- Never names a substance.

**Fallback.** Three hand-written peak lines per `(matType, trigger)` cell.

---

### 5. `lora-wave-fall`

| Field | Value |
|---|---|
| Base | `google/gemma-4-E2B-it` (INT4) |
| Rank / alpha / dropout | 8 / 16 / 0.05 |
| Adapter size | ~25 MB |
| Where used in the product | Session page, phase 5c — narration at the **fall** transition of the wave animation |
| p95 latency budget | 1.8 s |

**What it is fine-tuned for.** Normalizing narration for the falling phase
of the wave. Unlike peak, a limited amount of celebration is acceptable
here (the patient has surfed a real drop in intensity). Must respect the
intensity trend — no "rising" framing when `intensityTrendLast60s === "down"`.

**Hard safety invariants.**
- Never names a substance.
- Trend-respecting: does not describe the wave as rising when it is falling.

**Fallback.** Three hand-written fall lines per `(matType, trigger)` cell.

---

### 6. `lora-reflection`

| Field | Value |
|---|---|
| Base | `google/gemma-4-E2B-it` (INT4) |
| Rank / alpha / dropout | 16 / 32 / 0.05 |
| Adapter size | ~40 MB |
| Where used in the product | Session page, phase 6 — the post-session reflection screen that shows the patient their drop and invites a one-line journal |
| p95 latency budget | 2.0 s |

**What it is fine-tuned for.** Generating the "You surfed a 7 down to 2."
one-liner the patient sees at the end of a session, plus a journal prompt
question and a suggested 10-minute next step from a closed vocabulary. Must
weave in the numeric drop and longitudinal context (session count,
medication-vs-no-medication delta) when available. When the
`usedSubstanceToday` flag is `true` — meaning the patient answered "yes"
to Q1 of the intake safety screen but cleared Q2 and chose to surf a
craving after using — the reflection may acknowledge that fact in a
trauma-informed, non-shaming way. This is clinically meaningful: the
patient actively chose coping over re-using, and the reflection is the
one surface allowed to name it.

**Input / output contract.**

```ts
type ReflectionInput = {
  intakeIntensity: number;
  endingIntensity: number;
  durationSeconds: number;
  medicationStatus: AckInput["medicationStatus"];
  matType: AckInput["matType"];
  sessionsCount: number;
  usedSubstanceToday: boolean;      // captured at the intake safety screen
  optionalJournalText?: string;     // <= 500 chars
};

type ReflectionOutput = {
  insightOneLine: string;
  journalPromptQuestion: string;
  suggestedNextStep: "call" | "walk" | "water" | "hands" | "rest";
  crisisSignalDetected: boolean;
};
```

**Hard safety invariants.**
- `insightOneLine` **must** contain the numeric `endingIntensity`.
- If `optionalJournalText` trips the crisis lexical filter, `crisisSignalDetected` is `true` and the session routes through crisis triage before rendering the reflection.
- When `usedSubstanceToday === true`, the reflection copy must never shame, must never imply failure, and must never frame the decision to use as a relapse event. The allowed framing is that the patient chose to surf a craving and completed the session — that is the clinical win being captured.

**Fallback.** One hand-written insight line per `(medicationStatus, dropBucket)` cell.

---

## LoRA adapters (stretch — build if time allows)

These exist in the design but are out of the MVP scope. If we build them, they
go through the same pipeline (`model-training.md`) as the MVP LoRAs.

### 7. `lora-notification` *(stretch)*

| Field | Value |
|---|---|
| Base | `google/gemma-4-E2B-it` (INT4) |
| Rank / alpha / dropout | 8 / 16 / 0.05 |
| Adapter size | ~20 MB |
| Where used in the product | Background scheduler that fires prophylactic notifications 15 min before a predicted risk window |
| p95 latency budget | 1.0 s |

**What it is fine-tuned for.** Short (≤ 40 char title, ≤ 120 char body)
push-notification copy that references the predicted window without
prescribing and without shaming. Never names a substance. Tone is
down-weighted when `ignoredWindowCount >= 3` — a rule layer, not the LoRA,
forces `title` in that case.

---

### 8. `lora-insights` *(stretch)*

| Field | Value |
|---|---|
| Base | `google/gemma-4-E2B-it` (INT4) |
| Rank / alpha / dropout | 16 / 32 / 0.05 |
| Adapter size | ~50 MB |
| Where used in the product | Weekly background job that reads session history and writes one or two plain-English pattern statements plus one actionable suggestion to the `/insights` page |
| p95 latency budget | 8 s (off-path; not time-critical) |

**What it is fine-tuned for.** Summarizing a patient's session history into
plain-English patterns tagged by `kind` (time-of-day, trigger frequency,
medication correlation, body location) with a `confidence` level, plus one
actionable suggestion with an optional target window. Descriptive, not
prescriptive — never tells the patient to change medication.

---

## Not fine-tuned — base model only

### Crisis triage surface

| Field | Value |
|---|---|
| Base | `google/gemma-4-E2B-it` (INT4) |
| LoRA | **None** (intentional) |
| Where used in the product | Any surface that sets `crisisSignalDetected=true`, or any user input that trips the suicidality / overdose / "already used lethal amount" lexical pre-filter |
| p95 latency budget | 1.5 s |

**Why no LoRA.** Crisis triage must always route the patient to the right
hotline. The routing rule is:

- Suicidality → 988 Suicide & Crisis Lifeline, pause session.
- "Used already" + lethal-dose markers → local emergency, pause session.
- Otherwise → SAMHSA National Helpline 1-800-662-HELP, continue session.

**Routing is picked by code, not by the model.** The LLM's only job is to
generate a ≤ 200 char, calm, non-judgmental `copy` string for the already-
chosen route. A fine-tune on synthetic data — however well-intentioned —
could drift the model's notion of which hotline fits which signal. That is
an unacceptable regression. Keeping this surface on the base with
rule-based routing makes the safety boundary **explicit in the type
system**: the Adapter Manager is called with `loraId: null` for crisis
triage, and `null` is the only legal value for that surface.

If someone adds a `lora-crisis` in a future PR, this document is the
reason to reject it.

### Intake safety screen (earliest possible crisis route)

| Field | Value |
|---|---|
| Base | *not used* — this surface is **pure rule-based code** |
| LoRA | **None** (intentional) |
| Where used in the product | Session page, phase 2 — runs immediately after the three-tap intake and **before** `lora-med-ack` is loaded |
| p95 latency budget | N/A (no model call) |

**Why this surface exists.** Before this screen was added, the earliest
point at which the app could detect a patient in acute physical distress
was a lexical keyword scan on `optionalJournalText` in the reflection
phase — i.e. 5–8 minutes into the session, *after* the wave animation,
and only if the patient chose to write a journal entry (it is optional).
That is clinically unacceptable: a patient who opens WAVE while already
experiencing overdose-adjacent symptoms would be walked through the
entire urge-surfing protocol before the app had any chance to route them
out.

**The screen is two sequential yes/no taps:**

1. *"Have you used any substances today?"* — Yes / No.
   - **No** → Q2 is skipped. Session proceeds to `lora-med-ack` with
     `usedSubstanceToday: false`.
   - **Yes** → show Q2.
2. *"Are you feeling physically unwell, dizzy, or having trouble breathing right now?"* — Yes / No.
   - **No** → log `usedSubstanceToday: true` on the session row for
     clinical context and proceed to `lora-med-ack`. The reflection
     phase (see `lora-reflection`) may reference this flag in a
     trauma-informed way.
   - **Yes** → **skip the session entirely.** Render the safety
     handoff screen:
     - **SAMHSA National Helpline: 1-800-662-HELP (1-800-662-4357)**
     - "If you have a therapist or social worker, reach out to them now."

     Write a session row with `outcome: safety_exited`. No LoRA is
     loaded, no model call is made, no wave animation plays.

**Why no LoRA, no LLM at all.** The routing table is three cells and is
fully expressible in code. A language model is not needed to pick the
right cell, and introducing one would only add a failure mode (JSON
parse error, tone drift, latency spike) on a path that must never fail.
The copy on the safety handoff screen is static, verbatim, and
committed to the repo; it is the one string in the session path that is
**not** generated.

**Relationship to the `lora-reflection` contract.** The
`usedSubstanceToday` boolean captured at this screen is an input field
on `ReflectionInput`. When it is `true`, the reflection LoRA's hard
safety invariants require non-shaming framing — see the `lora-reflection`
entry above.

If someone proposes moving this screen into an LLM call in a future PR,
this section is the reason to reject it.

---

## Adapter manifest

The shipped app includes a typed, versioned, signed manifest. The entries
here correspond one-to-one with the LoRAs above.

```ts
// client/lib/gemma/adapter-manifest.ts
type AdapterManifest = {
  baseModel: {
    id: "google/gemma-4-E2B-it";
    quantization: "int4";
    sha256: string;
  };
  adapters: Array<{
    loraId: LoRAId;
    version: string;            // semver
    sha256: string;             // content hash for cache invalidation
    url: string;                // same-origin static asset
    sizeBytes: number;
    synthetixRunId: string;     // points at client/synthetix/runs/<lora-id>/<run-id>/
    spotCheckPassed: true;      // literal true; false never ships
    evalPassed: true;           // literal true; harness passed on the test split
    approvedBy: string;         // clinician initials on the clean spot-check
  }>;
};

type LoRAId =
  | "lora-med-ack"
  | "lora-body-scan"
  | "lora-wave-rise"
  | "lora-wave-peak"
  | "lora-wave-fall"
  | "lora-reflection"
  | "lora-notification"
  | "lora-insights";
```

Updating a single LoRA bumps only its `sha256`; base stays cached. Any PR
that adds or updates an adapter must satisfy the gates documented in
`model-training.md > Ship gates`.

---

## Alignment with the rest of the repo

- `PRD.md > Medication-Aware Prompt Logic` is the canonical clinical matrix
  every LoRA's training data has to respect.
- `PRD.md > Core Flow` enumerates the session phases each LoRA maps to.
- `AGENTS.md > Domain Constraints` is the tone + safety contract every
  LoRA is held to.
- `model-training.md` is the "how": data collection, Synthetix pipeline,
  spot-check, split, training, eval, ship gates.
- `client/lib/gemma/adapter-manager.ts` (future) is the runtime contract
  the Adapter Manager implements.
- `client/synthetix/` (future) is the developer-only pipeline that
  produces the training data for every LoRA in this document.
