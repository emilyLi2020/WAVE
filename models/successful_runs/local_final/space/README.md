---
title: lora-wave-session demo
emoji: 🌊
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: gemma
short_description: WAVE wellness LoRA on Gemma 4 E2B
models:
- Maelstrome/lora-wave-session
- Maelstrome/lora-wave-session-gguf
datasets:
- Maelstrome/lora-wave-session-dataset
---

# lora-wave-session demo

Interactive demo of [`Maelstrome/lora-wave-session`](https://huggingface.co/Maelstrome/lora-wave-session), a Gemma 4 E2B fine-tune for the WAVE wellness/companion app. Three surfaces:

- **`check_in`** — multi-turn patient check-in with structured turn sequencing
- **`phase_narration`** — six-line patient-facing phase narration
- **`reflection`** — reflection plan with a concrete next step

All three emit strict JSON with no markdown.

Backed by the [Q4_K_M GGUF](https://huggingface.co/Maelstrome/lora-wave-session-gguf) running on `llama-cpp-python` (CPU, ~5-10 tok/s on a free-tier Space). Pick a surface, edit the prompt, hit Generate.

For the underlying [training run details](https://huggingface.co/Maelstrome/lora-wave-session#training), evaluation, and limitations, see the model card.

**Wellness scope only.** Not a medical device, not clinical decision support, not a substitute for professional advice.
