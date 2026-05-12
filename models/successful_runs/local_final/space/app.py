"""Gradio demo for Maelstrome/lora-wave-session.

Loads the Q4_K_M GGUF via llama-cpp-python, exposes a small UI with surface
presets and example prompts. Runs on a free CPU Basic Space.
"""

from __future__ import annotations

import json
import os
import textwrap

import gradio as gr
from huggingface_hub import hf_hub_download
from llama_cpp import Llama

GGUF_REPO = "Maelstrome/lora-wave-session-gguf"
GGUF_FILE = "gemma-4-e2b-it.Q4_K_M.gguf"
ADAPTER_REPO = "https://huggingface.co/Maelstrome/lora-wave-session"
DATASET_REPO = "https://huggingface.co/datasets/Maelstrome/lora-wave-session-dataset"

SYSTEM_PROMPT = (
    "You are WAVE, an on-device urge surfing companion for people in Substance Use Disorder recovery.\n\n"
    "Write patient-facing support for a structured urge surfing session.\n"
    "The tone is trauma-informed, calm, concrete, nonjudgmental, and unhurried.\n"
    "Do not prescribe medication. Do not tell the patient to stop or start any substance.\n"
    "Output strict JSON only — no markdown, no analysis, no explanations."
)

EXAMPLES = {
    "check_in": {
        "max_new_tokens": 96,
        "user": textwrap.dedent("""\
            <surface>
            check_in
            </surface>

            <specialized_surface>
            lora-check-in-1
            </specialized_surface>

            <patient_context>
            {"intakeIntensity":7,"matType":"buprenorphine","medicationStatus":"on_time","trigger":"stress","usedSubstanceToday":false}
            </patient_context>

            <task>
            Open turn 1 of check-in 1. Ask the patient to rate their current urge intensity on a 1-10 scale.
            Return only strict JSON. Schema: {"reply":"...","endConversation":null}.
            </task>"""),
    },
    "phase_narration": {
        "max_new_tokens": 256,
        "user": textwrap.dedent("""\
            <surface>
            phase_narration
            </surface>

            <chunk>
            Number 5 of 5 - Close
            Purpose: Invite comparison to the start, normalize any outcome, and prepare for a final check-in.
            </chunk>

            <patient_context>
            {"chunkNumber":5,"matType":"none","medicationStatus":"none","startingIntensityBand":"1-6","surface":"phase_narration","trigger":"unknown","usedSubstanceToday":false}
            </patient_context>

            <task>
            Generate exactly 6 patient-facing narration lines.
            Each line is one short meditation beat.
            Return only strict JSON. No markdown, no analysis, no explanations.
            Schema: {"lines":["line 1","line 2","line 3","line 4","line 5","line 6"]}
            </task>"""),
    },
    "reflection": {
        "max_new_tokens": 192,
        "user": textwrap.dedent("""\
            <surface>
            reflection
            </surface>

            <patient_context>
            {"durationSeconds":780,"endingIntensity":2,"intakeIntensity":7,"matType":"buprenorphine","medicationStatus":"on_time","scoreHistorySummary":"Intake 7; check-in arc stepped down to ending 2; on-time buprenorphine; stress trigger.","sessionsCount":12,"surface":"reflection","trigger":"stress","usedSubstanceToday":false}
            </patient_context>

            <task>
            Write the post-session reflection card.
            The insight must include the numeric endingIntensity as a digit.
            The journalPromptQuestion is one gentle question.
            The nextSteps object must contain four concrete short suggestions.
            Return only strict JSON. Schema: {"insight":"...","journalPromptQuestion":"...","nextSteps":{"a":"...","b":"...","c":"...","d":"..."}}
            </task>"""),
    },
}


def load_model() -> Llama:
    print(f"Downloading {GGUF_FILE} from {GGUF_REPO}...", flush=True)
    path = hf_hub_download(repo_id=GGUF_REPO, filename=GGUF_FILE)
    print(f"Loading {path}...", flush=True)
    llm = Llama(
        model_path=path,
        n_ctx=4096,
        n_threads=int(os.environ.get("LLAMA_THREADS", "2")),
        chat_format="gemma",
        verbose=False,
    )
    print("Model loaded.", flush=True)
    return llm


LLM = load_model()


def generate(surface: str, user_prompt: str, max_new_tokens: int, temperature: float) -> tuple[str, str]:
    messages = [
        {"role": "user", "content": f"{SYSTEM_PROMPT}\n\n{user_prompt}"},
    ]
    out = LLM.create_chat_completion(
        messages=messages,
        max_tokens=int(max_new_tokens),
        temperature=float(temperature),
        top_p=0.95,
        top_k=64,
    )
    raw = out["choices"][0]["message"]["content"].strip()
    pretty = raw
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
        Backed by the [Q4_K_M GGUF]({ADAPTER_REPO}-gguf) on a free CPU Space (~5-10 tok/s).

        Pick a **surface**, the example prompt for it loads automatically, then **Generate**.
        Output should be strict JSON.

        - 📦 [Adapter]({ADAPTER_REPO})
        - 🗄️ [GGUF]({ADAPTER_REPO}-gguf)
        - 📊 [Dataset]({DATASET_REPO})
        """
    )

    with gr.Row():
        surface = gr.Dropdown(
            choices=list(EXAMPLES.keys()),
            value="phase_narration",
            label="Surface",
        )
        max_new_tokens = gr.Slider(
            minimum=32, maximum=512, value=256, step=8,
            label="Max new tokens",
        )
        temperature = gr.Slider(
            minimum=0.0, maximum=1.5, value=1.0, step=0.05,
            label="Temperature",
        )

    user_prompt = gr.Textbox(
        value=EXAMPLES["phase_narration"]["user"],
        lines=14,
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
    demo.launch()
