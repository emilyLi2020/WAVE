# Training seeds

This directory holds the (input, output) seed examples a clinician
collects through the dev-only `/training` UI in `client/`. One JSON file
per LoRA is created on the first save:

- `lora-med-ack.json`
- `lora-body-scan.json`
- `lora-wave-rise.json`
- `lora-wave-peak.json`
- `lora-wave-fall.json`
- `lora-reflection.json`
- `lora-notification.json`
- `lora-insights.json`

Each file is a JSON array of seed records:

```json
[
  {
    "id": "<uuid>",
    "loraId": "lora-med-ack",
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

These files **are** the training dataset — commit them so the engineer
running the QLoRA pipeline (`docs/model-training.md`) can pull them.

The Next.js dev server reads from and writes to this directory via
`client/lib/training/storage.ts`. Override the location with
`WAVE_TRAINING_DATA_DIR` if you run `pnpm dev` from somewhere other
than `client/`.
