# WAVE Synthetic Data Quality Audit

Generated: 2026-05-10T13:29:47.170380+00:00

## Purpose

This document records how synthetic WAVE training rows are generated, filtered, and labeled. Synthetic rows are not treated as clinician-authored data.

## Medical-Quality Matching Method

- Source-grounded prompts include same-surface examples, WAVE tone rules, medication boundaries, and output schemas.
- Deterministic validators enforce schema, safety, medication-directive, and surface-invariant rules.
- Duplicate gates reject exact JSON duplicates, normalized text duplicates, scenario duplicates, high n-gram overlap, and high ROUGE-L overlap.
- Rubric scoring requires trauma-informed voice, no shame, no toxic positivity, no medical advice, no crisis routing, and distributional length fit.
- Synthetic rows remain `synthetic_draft` and must be disclosed separately in training reports.

## Thresholds

- Minimum rubric score: `85`
- Short n-gram Jaccard threshold: `0.65`
- Long n-gram Jaccard threshold: `0.55`
- ROUGE-L threshold: `0.72`

## Counts

- Expanded dataset rows: `4277`
- User-provided / source rows: `1632`
- Accepted synthetic draft rows: `2645`
- User-provided source rows by status: `{"draft": 1574, "ready": 58}`

## Final Dataset Composition

| Surface | User-provided rows | Synthetic rows | Total rows |
| --- | ---: | ---: | ---: |
| `check_in` | 1534 | 0 | 1534 |
| `phase_narration` | 50 | 1503 | 1553 |
| `reflection` | 48 | 1142 | 1190 |

## Last Generation Pass

- Original rows entering last pass: `3757`
- Coverage gaps in last pass: `86`
- Requested by last coverage plan: `917`
- Accepted synthetic rows in last pass: `175`
- Rejected candidates in last pass: `45`
- Accepted by surface in last pass: `{"phase_narration": 175}`

## Rejection Reasons

`{"duplicate_or_near_duplicate": 27, "quality_errors": 18}`

## Coverage Plan Snapshot

- First 20 gaps: `[{"chunk_number": 1, "current_count": 15, "final_turn": null, "gap_id": "91c9a3dbaf6e", "medication_status": "late", "requested_count": 1, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "physical"}, {"chunk_number": 1, "current_count": 15, "final_turn": null, "gap_id": "1c590f93a57e", "medication_status": "late", "requested_count": 1, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "stress"}, {"chunk_number": 1, "current_count": 15, "final_turn": null, "gap_id": "d42138a6a901", "medication_status": "late", "requested_count": 1, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "unknown"}, {"chunk_number": 1, "current_count": 15, "final_turn": null, "gap_id": "f74c0f1fa61c", "medication_status": "missed", "requested_count": 1, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "other"}, {"chunk_number": 1, "current_count": 15, "final_turn": null, "gap_id": "6823a753b3ed", "medication_status": "missed", "requested_count": 1, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "social"}, {"chunk_number": 1, "current_count": 14, "final_turn": null, "gap_id": "8ca849c83073", "medication_status": "missed", "requested_count": 2, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "stress"}, {"chunk_number": 1, "current_count": 14, "final_turn": null, "gap_id": "b0e2d13c32eb", "medication_status": "none", "requested_count": 2, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "other"}, {"chunk_number": 1, "current_count": 15, "final_turn": null, "gap_id": "344d41e8ba7f", "medication_status": "none", "requested_count": 1, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "physical"}, {"chunk_number": 1, "current_count": 15, "final_turn": null, "gap_id": "4cde9e88e131", "medication_status": "none", "requested_count": 1, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "unknown"}, {"chunk_number": 2, "current_count": 13, "final_turn": null, "gap_id": "9403d501b309", "medication_status": "late", "requested_count": 3, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "other"}, {"chunk_number": 2, "current_count": 15, "final_turn": null, "gap_id": "74b7d3a6c77b", "medication_status": "late", "requested_count": 1, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "physical"}, {"chunk_number": 2, "current_count": 14, "final_turn": null, "gap_id": "cb773c2d0369", "medication_status": "late", "requested_count": 2, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "social"}, {"chunk_number": 2, "current_count": 15, "final_turn": null, "gap_id": "891e122ad75b", "medication_status": "late", "requested_count": 1, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "stress"}, {"chunk_number": 2, "current_count": 14, "final_turn": null, "gap_id": "c43b55d8f6ef", "medication_status": "none", "requested_count": 2, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "social"}, {"chunk_number": 2, "current_count": 15, "final_turn": null, "gap_id": "86bd3c271886", "medication_status": "none", "requested_count": 1, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "stress"}, {"chunk_number": 3, "current_count": 15, "final_turn": null, "gap_id": "72008992e504", "medication_status": "late", "requested_count": 1, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "other"}, {"chunk_number": 3, "current_count": 14, "final_turn": null, "gap_id": "f816d2974515", "medication_status": "missed", "requested_count": 2, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "other"}, {"chunk_number": 3, "current_count": 10, "final_turn": null, "gap_id": "c760ea9947d7", "medication_status": "none", "requested_count": 6, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "other"}, {"chunk_number": 3, "current_count": 8, "final_turn": null, "gap_id": "1049fa666790", "medication_status": "none", "requested_count": 8, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "physical"}, {"chunk_number": 3, "current_count": 6, "final_turn": null, "gap_id": "d477da935b7f", "medication_status": "none", "requested_count": 10, "source_lora_id": "lora-phase-narration", "surface": "phase_narration", "target_count": 16, "trigger": "social"}]`

## Limitations

- Synthetic rows are clinical-adjacent drafts, not clinician-approved content.
- Uniqueness is enforced by exact and near-duplicate gates, but semantic uniqueness cannot be proven absolutely.
- The frozen final test split should remain clinician-source only where possible.