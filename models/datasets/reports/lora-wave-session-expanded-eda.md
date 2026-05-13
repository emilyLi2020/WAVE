# WAVE Session LoRA EDA

Generated: 2026-05-12T07:25:00.084512+00:00

## High-Level Findings

- Raw outputs contain dash punctuation in 245 rows; normalization replaces those because the app strips em/en dashes.
- 1574 normalized examples come from draft source rows. This is acceptable for the experiment but should be named clearly in results.

## Normalized Dataset

- Rows: 4277
- By surface: `{"check_in": 1534, "phase_narration": 1553, "reflection": 1190}`
- By source LoRA: `{"lora-check-in-1": 288, "lora-check-in-2": 336, "lora-check-in-3": 335, "lora-check-in-4": 335, "lora-check-in-5": 240, "lora-phase-narration": 1553, "lora-reflection": 1190}`
- By source status: `{"draft": 1574, "ready": 58, "synthetic_draft": 2645}`
- Split-key count: 320
- Prompt length stats (words): `{"count": 4277, "max": 1315.0, "mean": 377.00303951367783, "median": 95.0, "min": 86.0, "p25": 89.0, "p75": 778.0, "p95": 1038.0}`
- Output length stats (chars): `{"count": 4277, "max": 1109.0, "mean": 519.7381342062193, "median": 568.0, "min": 75.0, "p25": 215.0, "p75": 712.0, "p95": 939.0}`

## Raw Source Dataset

- Rows: 338
- By LoRA: `{"lora-check-in-1": 48, "lora-check-in-2": 48, "lora-check-in-3": 48, "lora-check-in-4": 48, "lora-check-in-5": 48, "lora-phase-narration": 50, "lora-reflection": 48}`
- By status: `{"draft": 280, "ready": 58}`
- Raw issue counts: `{"dash_chars": 245}`

## Cleanup Notes

`{"filled missing phase input matType=none": 10, "filled missing phase input medicationStatus=none": 10, "filled missing phase input trigger=unknown": 10, "filled missing phase input usedSubstanceToday=False": 10, "mapped trigger unknown_or_other to unknown": 396, "replaced \\u2013 in text": 1534, "replaced \\u2014 in text": 1539}`

## Split Readiness

- Largest split keys: `{"surface=reflection|source=lora-reflection|chunk=none|med=late|trigger=other|kind=synthetic_reflection|turn=single": 63, "surface=reflection|source=lora-reflection|chunk=none|med=late|trigger=physical|kind=synthetic_reflection|turn=single": 61, "surface=reflection|source=lora-reflection|chunk=none|med=late|trigger=social|kind=synthetic_reflection|turn=single": 62, "surface=reflection|source=lora-reflection|chunk=none|med=late|trigger=stress|kind=synthetic_reflection|turn=single": 57, "surface=reflection|source=lora-reflection|chunk=none|med=late|trigger=unknown|kind=synthetic_reflection|turn=single": 57, "surface=reflection|source=lora-reflection|chunk=none|med=missed|trigger=other|kind=synthetic_reflection|turn=single": 75, "surface=reflection|source=lora-reflection|chunk=none|med=missed|trigger=physical|kind=synthetic_reflection|turn=single": 65, "surface=reflection|source=lora-reflection|chunk=none|med=missed|trigger=social|kind=synthetic_reflection|turn=single": 58, "surface=reflection|source=lora-reflection|chunk=none|med=missed|trigger=stress|kind=synthetic_reflection|turn=single": 38, "surface=reflection|source=lora-reflection|chunk=none|med=missed|trigger=unknown|kind=synthetic_reflection|turn=single": 50, "surface=reflection|source=lora-reflection|chunk=none|med=none|trigger=other|kind=synthetic_reflection|turn=single": 64, "surface=reflection|source=lora-reflection|chunk=none|med=none|trigger=physical|kind=synthetic_reflection|turn=single": 58, "surface=reflection|source=lora-reflection|chunk=none|med=none|trigger=social|kind=synthetic_reflection|turn=single": 57, "surface=reflection|source=lora-reflection|chunk=none|med=none|trigger=stress|kind=synthetic_reflection|turn=single": 38, "surface=reflection|source=lora-reflection|chunk=none|med=none|trigger=unknown|kind=synthetic_reflection|turn=single": 38, "surface=reflection|source=lora-reflection|chunk=none|med=on_time|trigger=other|kind=synthetic_reflection|turn=single": 77, "surface=reflection|source=lora-reflection|chunk=none|med=on_time|trigger=physical|kind=synthetic_reflection|turn=single": 66, "surface=reflection|source=lora-reflection|chunk=none|med=on_time|trigger=social|kind=synthetic_reflection|turn=single": 60, "surface=reflection|source=lora-reflection|chunk=none|med=on_time|trigger=stress|kind=synthetic_reflection|turn=single": 60, "surface=reflection|source=lora-reflection|chunk=none|med=on_time|trigger=unknown|kind=synthetic_reflection|turn=single": 38}`
- Smallest split keys: `{"surface=check_in|source=lora-check-in-3|chunk=3|med=on_time|trigger=social|kind=check_in_turn|turn=final": 2, "surface=check_in|source=lora-check-in-4|chunk=4|med=on_time|trigger=social|kind=check_in_turn|turn=final": 2, "surface=check_in|source=lora-check-in-5|chunk=5|med=on_time|trigger=social|kind=check_in_turn|turn=final": 2, "surface=phase_narration|source=lora-phase-narration|chunk=1|med=late|trigger=stress|kind=phase_narration_row|turn=single": 2, "surface=phase_narration|source=lora-phase-narration|chunk=1|med=missed|trigger=stress|kind=phase_narration_row|turn=single": 2, "surface=phase_narration|source=lora-phase-narration|chunk=1|med=none|trigger=unknown|kind=phase_narration_row|turn=single": 2, "surface=phase_narration|source=lora-phase-narration|chunk=1|med=on_time|trigger=stress|kind=phase_narration_row|turn=single": 2, "surface=phase_narration|source=lora-phase-narration|chunk=2|med=late|trigger=other|kind=phase_narration_row|turn=single": 2, "surface=phase_narration|source=lora-phase-narration|chunk=2|med=missed|trigger=other|kind=phase_narration_row|turn=single": 2, "surface=phase_narration|source=lora-phase-narration|chunk=2|med=none|trigger=other|kind=phase_narration_row|turn=single": 2, "surface=phase_narration|source=lora-phase-narration|chunk=2|med=none|trigger=unknown|kind=phase_narration_row|turn=single": 2, "surface=phase_narration|source=lora-phase-narration|chunk=3|med=missed|trigger=physical|kind=phase_narration_row|turn=single": 2, "surface=phase_narration|source=lora-phase-narration|chunk=3|med=none|trigger=physical|kind=phase_narration_row|turn=single": 2, "surface=phase_narration|source=lora-phase-narration|chunk=3|med=none|trigger=unknown|kind=phase_narration_row|turn=single": 2, "surface=phase_narration|source=lora-phase-narration|chunk=4|med=none|trigger=social|kind=phase_narration_row|turn=single": 2, "surface=phase_narration|source=lora-phase-narration|chunk=4|med=none|trigger=unknown|kind=phase_narration_row|turn=single": 2, "surface=phase_narration|source=lora-phase-narration|chunk=4|med=on_time|trigger=social|kind=phase_narration_row|turn=single": 2, "surface=phase_narration|source=lora-phase-narration|chunk=5|med=late|trigger=unknown|kind=phase_narration_row|turn=single": 2, "surface=phase_narration|source=lora-phase-narration|chunk=5|med=on_time|trigger=unknown|kind=phase_narration_row|turn=single": 2, "surface=reflection|source=lora-reflection|chunk=none|med=on_time|trigger=social|kind=reflection_row|turn=single": 2}`

The full machine-readable report is in `datasets/lora-wave-session-eda.json`.