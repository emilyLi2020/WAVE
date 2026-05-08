# Training seeds

This directory holds the (input, output) seed examples a clinician
collects through the dev-only `/training` UI in `client/`. One JSON file
per LoRA is created on the first save:

- `lora-phase-narration.json`
- `lora-check-in-1.json`
- `lora-check-in-2.json`
- `lora-check-in-3.json`
- `lora-check-in-4.json`
- `lora-check-in-5.json`
- `lora-reflection.json`

Each file is a JSON array of seed records:

```json
[
  {
    "id": "<uuid>",
    "loraId": "lora-check-in-1",
    "input": { "...": "..." },
    "output": { "...": "..." },
    "authorInitials": "RM",
    "notes": null,
    "status": "ready",
    "createdAt": "2026-04-22T15:04:00.000Z",
    "updatedAt": "2026-04-22T15:04:00.000Z"
  }
]
```

These files are the specialized source sets. The export page can download them
individually for demonstration adapters or combine them into
`lora-wave-session.jsonl` for the browser demo fine-tune. Commit them so the
engineer running the QLoRA pipeline (`docs/model-training.md`) can pull them.

The Next.js dev server reads from and writes to this directory via
`client/lib/training/storage.ts` (which resolves `client/data/training-seeds`
from the app root and walks upward from `cwd` for monorepo layouts). Override
with `WAVE_TRAINING_DATA_DIR` if you need a custom absolute path.
