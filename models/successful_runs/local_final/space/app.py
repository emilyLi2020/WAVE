"""Gradio demo for Maelstrome/lora-wave-session.

Loads Gemma 4 E2B base + PEFT adapter in fp16 via transformers. Runs on a
free CPU Basic Space. Inference is slow (~1-3 tok/s) — this is meant as a
correctness demo, not a production endpoint.
"""

from __future__ import annotations

import json
import textwrap

import gradio as gr
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, TextStreamer

BASE_MODEL = "google/gemma-4-E2B-it"
ADAPTER = "Maelstrome/lora-wave-session"

ADAPTER_REPO = f"https://huggingface.co/{ADAPTER}"
GGUF_REPO = "https://huggingface.co/Maelstrome/lora-wave-session-gguf"
DATASET_REPO = "https://huggingface.co/datasets/Maelstrome/lora-wave-session-dataset"

SYSTEM_PROMPT = (
    "You are WAVE, an on-device urge surfing companion for people in Substance Use Disorder recovery.\n\n"
    "Write patient-facing support for a structured urge surfing session.\n"
    "The tone is trauma-informed, calm, concrete, nonjudgmental, and unhurried.\n"
    "Do not prescribe medication. Do not tell the patient to stop or start any substance.\n"
    "Output strict JSON only — no markdown, no analysis, no explanations."
)

EXAMPLES = {
    "phase_narration": {
        "max_new_tokens": 256,
        "user": textwrap.dedent("""\
            <surface>phase_narration</surface>
            <chunk>Number 5 of 5 - Close. Purpose: invite comparison to the start, normalize any outcome, prepare for a final check-in.</chunk>
            <patient_context>{"chunkNumber":5,"matType":"none","medicationStatus":"none","startingIntensityBand":"1-6","trigger":"unknown","usedSubstanceToday":false}</patient_context>
            <task>Generate exactly 6 patient-facing narration lines. Return strict JSON. Schema: {"lines":["line 1","line 2","line 3","line 4","line 5","line 6"]}</task>"""),
    },
    "reflection": {
        "max_new_tokens": 192,
        "user": textwrap.dedent("""\
            <surface>reflection</surface>
            <patient_context>{"durationSeconds":780,"endingIntensity":2,"intakeIntensity":7,"matType":"buprenorphine","medicationStatus":"on_time","sessionsCount":12,"trigger":"stress","usedSubstanceToday":false}</patient_context>
            <task>Write the post-session reflection card. Return strict JSON. Schema: {"insight":"...","journalPromptQuestion":"...","nextSteps":{"a":"...","b":"...","c":"...","d":"..."}}</task>"""),
    },
    "check_in": {
        "max_new_tokens": 96,
        "user": textwrap.dedent("""\
            <surface>check_in</surface>
            <specialized_surface>lora-check-in-1</specialized_surface>
            <patient_context>{"intakeIntensity":7,"matType":"buprenorphine","trigger":"stress"}</patient_context>
            <task>Open turn 1: ask the patient to rate their current urge intensity 1-10. Schema: {"reply":"...","endConversation":null}</task>"""),
    },
}


def load_model():
    print(f"Loading tokenizer from {BASE_MODEL}...", flush=True)
    tok = AutoTokenizer.from_pretrained(BASE_MODEL)
    print(f"Loading base model in fp16...", flush=True)
    base = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        torch_dtype=torch.float16,
        device_map="cpu",
        low_cpu_mem_usage=True,
    )
    print(f"Applying adapter {ADAPTER}...", flush=True)
    model = PeftModel.from_pretrained(base, ADAPTER)
    model.eval()
    print("Model ready.", flush=True)
    return model, tok


MODEL, TOK = load_model()


def generate(surface: str, user_prompt: str, max_new_tokens: int, temperature: float) -> tuple[str, str]:
    messages = [
        {"role": "user", "content": f"{SYSTEM_PROMPT}\n\n{user_prompt}"},
    ]
    inputs = TOK.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt", return_dict=True)
    with torch.no_grad():
        out = MODEL.generate(
            **inputs,
            max_new_tokens=int(max_new_tokens),
            do_sample=float(temperature) > 0.01,
            temperature=max(float(temperature), 0.01),
            top_p=0.95,
            top_k=64,
            pad_token_id=TOK.eos_token_id,
        )
    raw = TOK.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()
    valid = "Not valid JSON"
    try:
        parsed = json.loads(raw)
        pretty = json.dumps(parsed, indent=2, ensure_ascii=False)
        valid = "Valid JSON"
    except Exception as exc:
        pretty = f"{raw}\n\n--- parse error ---\n{exc}"
    return pretty, valid


def fill_example(surface: str) -> tuple[str, int]:
    ex = EXAMPLES[surface]
    return ex["user"], ex["max_new_tokens"]


with gr.Blocks(title="lora-wave-session demo") as demo:
    gr.Markdown(
        f"""
        # 🌊 lora-wave-session demo

        Gemma 4 E2B fine-tuned for three structured-output surfaces in the WAVE wellness/companion app.
        Running on a free CPU Space in fp16 — **inference is slow (~1-3 tok/s)**, so generation may take ~30 sec to several minutes.

        Pick a **surface**, the example prompt for it loads automatically, then **Generate**.

        - 📦 [Adapter]({ADAPTER_REPO})
        - 🗄️ [GGUF (faster, llama.cpp / Ollama / LM Studio)]({GGUF_REPO})
        - 📊 [Dataset]({DATASET_REPO})
        """
    )

    with gr.Row():
        surface = gr.Dropdown(
            choices=list(EXAMPLES.keys()),
            value="reflection",
            label="Surface",
        )
        max_new_tokens = gr.Slider(
            minimum=32, maximum=512, value=192, step=8,
            label="Max new tokens",
        )
        temperature = gr.Slider(
            minimum=0.0, maximum=1.5, value=1.0, step=0.05,
            label="Temperature",
        )

    user_prompt = gr.Textbox(
        value=EXAMPLES["reflection"]["user"],
        lines=10,
        label="User prompt (the system prompt is auto-prepended)",
    )

    btn = gr.Button("Generate", variant="primary")

    output = gr.Code(label="Model output", language="json", lines=14)
    status = gr.Markdown()

    surface.change(fn=fill_example, inputs=surface, outputs=[user_prompt, max_new_tokens])
    btn.click(fn=generate, inputs=[surface, user_prompt, max_new_tokens, temperature], outputs=[output, status])

    gr.Markdown(
        "**Wellness scope only.** Not a medical device, not clinical decision support, "
        "not a substitute for professional advice."
    )


if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)
