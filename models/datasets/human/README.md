# Clinician seed JSONL (unified `lora-wave-session` inputs)

These files are the **portable, repo-relative** sources for
`prepare_wave_session_dataset.py` (default `--source` list). They replace older
`C:\Users\…\Downloads\…` paths so macOS, Linux, and Windows clones match.

| File | Role |
|------|------|
| `lora-check-in-{1..5}-clinician.jsonl` | Check-in clinician seeds per chunk |
| `lora-reflection-clinician.jsonl` | End-of-session reflection seeds |
| `lora-phase-narration-expanded.jsonl` | Phase narration: 10 `ready` + 40 `draft` synthetic rows |
| `lora-phase-narration-clinician.jsonl` | Phase narration: **10 `ready` rows only** — input template for `generate_phase_narration_synthetic.py` |

Regenerate the expanded phase file (drafts + clinician rows):

```bash
cd models
uv run python generate_phase_narration_synthetic.py
```

Then rebuild the unified normalized dataset (see [`../README.md`](../README.md) and `prepare_wave_session_dataset.py --help`).
