"""Train and evaluate the WAVE phase-narration LoRA.

This is a developer-workstation experiment, not a production runtime path.
It accepts either:

1. raw training-seed JSONL exported from the dev UI storage shape, or
2. ShareGPT-style JSONL with a `messages` array from /api/training/export.

The script writes a frozen train/test split, trains a PEFT LoRA on Gemma, then
generates against the held-out examples with the same JSON-output task wrapper
used by the app's chunk runtime and records format, style, and safety metrics.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import re
import subprocess
import sys
import time
from contextlib import nullcontext
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def ensure_windows_utf8_mode() -> None:
    """TRL 1.x imports bundled Jinja templates that require UTF-8 on Windows."""
    if os.name != "nt" or sys.flags.utf8_mode:
        return
    if os.environ.get("WAVE_MODELS_UTF8_REEXECED") == "1":
        return

    env = os.environ.copy()
    env["PYTHONUTF8"] = "1"
    env["WAVE_MODELS_UTF8_REEXECED"] = "1"
    raise SystemExit(subprocess.call([sys.executable, "-X", "utf8", *sys.argv], env=env))


ensure_windows_utf8_mode()


LORA_ID = "lora-phase-narration"
DEFAULT_MODEL_ID = "google/gemma-4-E2B-it"
CHUNK_LINE_COUNT = 6
MIN_LINE_LENGTH = 12
MAX_LINE_LENGTH = 200

TOXIC_POSITIVITY_RE = re.compile(
    r"\b(you'?ve got this|you got this|stay strong|don'?t give up)\b",
    re.IGNORECASE,
)
PAUSE_OR_STAGE_DIRECTION_RE = re.compile(
    r"[\[\]]|\((?:pause|breathe|inhale|exhale)\)|stage direction",
    re.IGNORECASE,
)
PHASE_ANNOUNCEMENT_RE = re.compile(r"\b(?:chunk|phase)\s+\d\b", re.IGNORECASE)
MEDICAL_DIRECTIVE_RE = re.compile(
    r"\b(?:start|stop|change|increase|decrease|double|skip)\s+"
    r"(?:your\s+|the\s+)?(?:dose|dosage|medication|medicine|meds)\b",
    re.IGNORECASE,
)
ANALYSIS_VOICE_RE = re.compile(
    r"\b(session analysis|clinical interpretation|recommendations|patient profile|"
    r"data summary|therapeutic focus|strengths|areas for|next session)\b",
    re.IGNORECASE,
)
MARKDOWN_OR_BULLET_RE = re.compile(r"(^|\n)\s*(?:#{1,6}\s|[-*]\s|\d+\.\s)")
SECOND_PERSON_RE = re.compile(r"\b(you|your|yourself|youre|you're|you've|youll|you'll)\b", re.IGNORECASE)
JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)
WORD_RE = re.compile(r"[a-z0-9']+")

PHASE_SYSTEM_PROMPT = """You are WAVE, an on-device urge-surfing narration writer.

Write patient-facing meditation narration for a Substance Use Disorder recovery support app.
The voice is trauma-informed, calm, concrete, second person, nonjudgmental, and unhurried.
Do not analyze the patient. Do not write markdown. Do not write a clinical note.
Do not tell the patient to start, stop, change, increase, decrease, double, or skip medication.
Do not provide crisis routing. Safety routing is handled by code outside the model.
Return only a JSON object that matches this shape: {"lines":["...","...","...","...","...","..."]}.
"""

CHUNK_BRIEFS: dict[int, tuple[str, str]] = {
    1: (
        "Settle in",
        "Welcome the patient, invite a tolerable body position, introduce the wave metaphor, and begin with simple noticing.",
    ),
    2: (
        "Body scan",
        "Help the patient locate where the urge lives in the body and observe sensation without trying to change it.",
    ),
    3: (
        "Sound anchor",
        "Use real or imagined sound as an anchor and normalize mind-wandering as part of the practice.",
    ),
    4: (
        "Breath",
        "Use a gentle 4-4-6 breath pattern while allowing modifications if holding the breath feels uncomfortable.",
    ),
    5: (
        "Close",
        "Invite comparison to the start, normalize any outcome, and prepare for a final check-in.",
    ),
}


@dataclass(frozen=True)
class Example:
    example_id: str
    input_payload: dict[str, Any]
    output_payload: dict[str, Any]
    messages: list[dict[str, str]]
    split_key: str
    source_status: str | None


@dataclass(frozen=True)
class ExampleEval:
    example_id: str
    chunk_number: int | None
    prompt: str
    reference: dict[str, Any]
    generated_text: str
    parsed_output: dict[str, Any] | None
    latency_seconds: float
    json_valid: bool
    line_count_pass: bool
    schema_pass: bool
    safety_pass: bool
    medical_directive_pass: bool
    style_pass: bool
    patient_facing_pass: bool
    no_analysis_voice_pass: bool
    no_markdown_pass: bool
    completion_nll: float
    completion_ppl: float
    completion_token_count: int
    token_f1: float
    rouge_l_f1: float
    errors: list[str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train a Gemma PEFT LoRA for WAVE phase narration.",
    )
    parser.add_argument(
        "--data",
        required=True,
        type=Path,
        help="Path to phase narration JSONL data.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Run output directory. Defaults to runs/lora-phase-narration/<timestamp>.",
    )
    parser.add_argument("--model-id", default=DEFAULT_MODEL_ID)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--include-drafts", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="Validate and split only.")
    parser.add_argument("--skip-generation-eval", action="store_true")

    parser.add_argument("--epochs", type=float, default=3.0)
    parser.add_argument("--max-steps", type=int, default=-1)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--gradient-accumulation-steps", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--warmup-steps", type=int, default=5)
    parser.add_argument("--max-seq-length", type=int, default=2048)
    parser.add_argument("--max-new-tokens", type=int, default=384)
    parser.add_argument("--lora-r", type=int, default=16)
    parser.add_argument("--lora-alpha", type=int, default=32)
    parser.add_argument("--lora-dropout", type=float, default=0.05)
    parser.add_argument(
        "--no-4bit",
        action="store_true",
        help="Disable 4-bit QLoRA loading. Useful when bitsandbytes is unavailable.",
    )
    return parser.parse_args()


def default_output_dir() -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return Path("runs") / LORA_ID / timestamp


def load_examples(path: Path, include_drafts: bool) -> list[Example]:
    examples: list[Example] = []
    with path.open("r", encoding="utf-8") as file_handle:
        for line_number, line in enumerate(file_handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                raw = json.loads(stripped)
            except json.JSONDecodeError as error:
                raise ValueError(f"{path}:{line_number} is not valid JSON: {error}") from error

            example = normalize_example(raw, line_number, include_drafts)
            if example is not None:
                examples.append(example)

    if not examples:
        raise ValueError(f"No usable {LORA_ID} examples found in {path}")
    return examples


def normalize_example(
    raw: dict[str, Any],
    line_number: int,
    include_drafts: bool,
) -> Example | None:
    if "messages" in raw:
        return normalize_messages_example(raw, line_number)
    return normalize_training_seed(raw, line_number, include_drafts)


def normalize_training_seed(
    raw: dict[str, Any],
    line_number: int,
    include_drafts: bool,
) -> Example | None:
    lora_id = raw.get("loraId")
    if lora_id != LORA_ID:
        raise ValueError(f"line {line_number}: expected loraId={LORA_ID!r}, got {lora_id!r}")

    status = raw.get("status")
    if status == "draft" and not include_drafts:
        return None

    input_payload = expect_object(raw.get("input"), line_number, "input")
    output_payload = expect_object(raw.get("output"), line_number, "output")
    validate_phase_input(input_payload, line_number)
    errors = validate_phase_output(output_payload)
    if errors:
        raise ValueError(f"line {line_number}: invalid output seed: {'; '.join(errors)}")

    messages = build_phase_messages(input_payload, output_payload)
    example_id = str(raw.get("id") or f"line-{line_number}")
    return Example(
        example_id=example_id,
        input_payload=input_payload,
        output_payload=output_payload,
        messages=messages,
        split_key=split_key(input_payload),
        source_status=str(status) if status is not None else None,
    )


def normalize_messages_example(raw: dict[str, Any], line_number: int) -> Example:
    raw_messages = raw.get("messages")
    if not isinstance(raw_messages, list) or len(raw_messages) < 2:
        raise ValueError(f"line {line_number}: messages must contain user and assistant turns")

    messages: list[dict[str, str]] = []
    for message in raw_messages:
        if not isinstance(message, dict):
            raise ValueError(f"line {line_number}: each message must be an object")
        role = message.get("role")
        content = message.get("content")
        if role not in {"system", "user", "assistant"} or not isinstance(content, str):
            raise ValueError(f"line {line_number}: invalid message {message!r}")
        messages.append({"role": role, "content": content})

    user_message = next((message for message in messages if message["role"] == "user"), None)
    assistant_message = next(
        (message for message in reversed(messages) if message["role"] == "assistant"),
        None,
    )
    if user_message is None or assistant_message is None:
        raise ValueError(f"line {line_number}: missing user or assistant message")

    input_payload = parse_json_object(user_message["content"], line_number, "user content")
    output_payload = parse_json_object(
        assistant_message["content"],
        line_number,
        "assistant content",
    )

    # Combined demo exports wrap specialized examples as:
    # {"surface":"lora-phase-narration","input":{...}}.
    if input_payload.get("surface") == LORA_ID:
        input_payload = expect_object(input_payload.get("input"), line_number, "input.input")
        messages = build_phase_messages(input_payload, output_payload)

    validate_phase_input(input_payload, line_number)
    errors = validate_phase_output(output_payload)
    if errors:
        raise ValueError(f"line {line_number}: invalid output seed: {'; '.join(errors)}")

    return Example(
        example_id=str(raw.get("id") or f"line-{line_number}"),
        input_payload=input_payload,
        output_payload=output_payload,
        messages=build_phase_messages(input_payload, output_payload),
        split_key=split_key(input_payload),
        source_status=None,
    )


def expect_object(value: Any, line_number: int, field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"line {line_number}: {field} must be an object")
    return value


def parse_json_object(value: str, line_number: int, field: str) -> dict[str, Any]:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as error:
        raise ValueError(f"line {line_number}: {field} is not valid JSON: {error}") from error
    return expect_object(parsed, line_number, field)


def compact_json(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def build_phase_messages(
    input_payload: dict[str, Any],
    output_payload: dict[str, Any] | None = None,
) -> list[dict[str, str]]:
    messages = [
        {"role": "system", "content": PHASE_SYSTEM_PROMPT.strip()},
        {"role": "user", "content": build_phase_user_prompt(input_payload)},
    ]
    if output_payload is not None:
        messages.append({"role": "assistant", "content": compact_json(output_payload)})
    return messages


def build_phase_user_prompt(input_payload: dict[str, Any]) -> str:
    chunk_number = input_payload.get("chunkNumber")
    title, purpose = CHUNK_BRIEFS.get(
        chunk_number if isinstance(chunk_number, int) else 0,
        ("Unknown", "Write WAVE narration for the requested phase."),
    )
    return f"""<chunk>
Number {chunk_number} of 5 - {title}
Purpose: {purpose}
</chunk>

<patient_context>
{compact_json(input_payload)}
</patient_context>

<task>
Generate exactly {CHUNK_LINE_COUNT} patient-facing narration lines.
Each line is one short meditation beat.
Return only JSON. No markdown, no analysis, no explanations.
Schema: {{"lines":["line 1","line 2","line 3","line 4","line 5","line 6"]}}
</task>"""


def validate_phase_input(input_payload: dict[str, Any], line_number: int) -> None:
    if input_payload.get("surface") != "phase_narration":
        raise ValueError(
            f"line {line_number}: input.surface must be 'phase_narration', "
            f"got {input_payload.get('surface')!r}",
        )
    chunk_number = input_payload.get("chunkNumber")
    if chunk_number not in {1, 2, 3, 4, 5}:
        raise ValueError(f"line {line_number}: input.chunkNumber must be 1..5")


def validate_phase_output(output_payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    lines = output_payload.get("lines")
    if not isinstance(lines, list):
        return ["output.lines must be an array"]
    if len(lines) != CHUNK_LINE_COUNT:
        errors.append(f"output.lines must contain exactly {CHUNK_LINE_COUNT} lines")

    for index, line in enumerate(lines):
        label = f"lines[{index}]"
        if not isinstance(line, str):
            errors.append(f"{label} must be a string")
            continue
        stripped = line.strip()
        if len(stripped) < MIN_LINE_LENGTH:
            errors.append(f"{label} is shorter than {MIN_LINE_LENGTH} characters")
        if len(stripped) > MAX_LINE_LENGTH:
            errors.append(f"{label} is longer than {MAX_LINE_LENGTH} characters")
        if "\n" in stripped:
            errors.append(f"{label} contains a line break")
        if TOXIC_POSITIVITY_RE.search(stripped):
            errors.append(f"{label} contains toxic-positivity phrasing")
        if PAUSE_OR_STAGE_DIRECTION_RE.search(stripped):
            errors.append(f"{label} contains pause markers or stage directions")
        if PHASE_ANNOUNCEMENT_RE.search(stripped):
            errors.append(f"{label} announces a chunk or phase number")
        if MEDICAL_DIRECTIVE_RE.search(stripped):
            errors.append(f"{label} contains medication directive phrasing")
    return errors


def split_key(input_payload: dict[str, Any]) -> str:
    chunk = input_payload.get("chunkNumber", "unknown")
    band = input_payload.get("startingIntensityBand")
    medication_status = input_payload.get("medicationStatus")
    trigger = input_payload.get("trigger")
    secondary = band or f"{medication_status or 'unknown'}:{trigger or 'unknown'}"
    return f"chunk={chunk}|context={secondary}"


def split_examples(
    examples: list[Example],
    test_size: float,
    seed: int,
) -> tuple[list[Example], list[Example]]:
    if not 0 < test_size < 1:
        raise ValueError("--test-size must be between 0 and 1")
    if len(examples) < 2:
        raise ValueError("Need at least 2 examples for a held-out test split")

    rng = random.Random(seed)
    indices = list(range(len(examples)))
    rng.shuffle(indices)
    target_test_count = max(1, min(len(examples) - 1, round(len(examples) * test_size)))

    train_key_counts: dict[str, int] = {}
    for example in examples:
        train_key_counts[example.split_key] = train_key_counts.get(example.split_key, 0) + 1

    test_indices: set[int] = set()
    for index in indices:
        if len(test_indices) >= target_test_count:
            break
        key = examples[index].split_key
        if train_key_counts[key] <= 1:
            continue
        test_indices.add(index)
        train_key_counts[key] -= 1

    # Tiny first-pass datasets often have one row per stratum. Fall back to a
    # deterministic random split while still keeping at least one train example.
    for index in indices:
        if len(test_indices) >= target_test_count:
            break
        if index not in test_indices:
            test_indices.add(index)

    train = [example for index, example in enumerate(examples) if index not in test_indices]
    test = [example for index, example in enumerate(examples) if index in test_indices]
    return train, test


def write_jsonl(path: Path, examples: list[Example]) -> None:
    with path.open("w", encoding="utf-8") as file_handle:
        for example in examples:
            file_handle.write(json.dumps(asdict(example), ensure_ascii=False) + "\n")


def write_summary(
    path: Path,
    args: argparse.Namespace,
    examples: list[Example],
    train: list[Example],
    test: list[Example],
) -> None:
    summary = {
        "loraId": LORA_ID,
        "sourceData": str(args.data),
        "modelId": args.model_id,
        "seed": args.seed,
        "testSize": args.test_size,
        "counts": {
            "total": len(examples),
            "train": len(train),
            "test": len(test),
            "byChunk": count_by_chunk(examples),
            "bySplitKey": count_by_split_key(examples),
        },
        "training": {
            "promptStyle": "wave_chunk_json_wrapper",
            "epochs": args.epochs,
            "maxSteps": args.max_steps,
            "batchSize": args.batch_size,
            "gradientAccumulationSteps": args.gradient_accumulation_steps,
            "learningRate": args.learning_rate,
            "warmupSteps": args.warmup_steps,
            "maxSeqLength": args.max_seq_length,
            "loadIn4bit": not args.no_4bit,
        },
    }
    path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")


def count_by_chunk(examples: list[Example]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for example in examples:
        key = str(example.input_payload.get("chunkNumber", "unknown"))
        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items()))


def count_by_split_key(examples: list[Example]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for example in examples:
        counts[example.split_key] = counts.get(example.split_key, 0) + 1
    return dict(sorted(counts.items()))


def import_training_dependencies() -> tuple[Any, ...]:
    import torch
    from datasets import Dataset
    from peft import LoraConfig, prepare_model_for_kbit_training
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from trl import SFTConfig, SFTTrainer

    return (
        torch,
        Dataset,
        LoraConfig,
        prepare_model_for_kbit_training,
        AutoModelForCausalLM,
        AutoTokenizer,
        BitsAndBytesConfig,
        SFTConfig,
        SFTTrainer,
    )


def render_chat_text(tokenizer: Any, messages: list[dict[str, str]], add_generation_prompt: bool) -> str:
    try:
        return tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=add_generation_prompt,
        )
    except Exception:
        rendered = []
        for message in messages:
            rendered.append(f"{message['role'].upper()}: {message['content']}")
        if add_generation_prompt:
            rendered.append("ASSISTANT:")
        return "\n".join(rendered)


def build_hf_dataset(Dataset: Any, tokenizer: Any, examples: list[Example]) -> Any:
    rows = [
        {
            "id": example.example_id,
            "text": render_chat_text(tokenizer, example.messages, add_generation_prompt=False),
        }
        for example in examples
    ]
    return Dataset.from_list(rows)


def train_and_eval(
    args: argparse.Namespace,
    output_dir: Path,
    train: list[Example],
    test: list[Example],
) -> None:
    (
        torch,
        Dataset,
        LoraConfig,
        prepare_model_for_kbit_training,
        AutoModelForCausalLM,
        AutoTokenizer,
        BitsAndBytesConfig,
        SFTConfig,
        SFTTrainer,
    ) = import_training_dependencies()

    tokenizer = AutoTokenizer.from_pretrained(args.model_id)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    model = load_model(
        args=args,
        torch=torch,
        AutoModelForCausalLM=AutoModelForCausalLM,
        BitsAndBytesConfig=BitsAndBytesConfig,
    )
    if not args.no_4bit:
        model = prepare_model_for_kbit_training(
            model,
            use_gradient_checkpointing=True,
        )
    model.config.use_cache = False

    train_dataset = build_hf_dataset(Dataset, tokenizer, train)
    eval_dataset = build_hf_dataset(Dataset, tokenizer, test)

    peft_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=(
            r"^model\.language_model\.layers\.\d+\."
            r"(self_attn\.(q_proj|k_proj|v_proj|o_proj)|"
            r"mlp\.(gate_proj|up_proj|down_proj))$"
        ),
    )

    training_args = SFTConfig(
        output_dir=str(output_dir / "checkpoints"),
        dataset_text_field="text",
        max_length=args.max_seq_length,
        packing=False,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        num_train_epochs=args.epochs,
        max_steps=args.max_steps,
        learning_rate=args.learning_rate,
        warmup_steps=args.warmup_steps,
        lr_scheduler_type="cosine",
        logging_steps=1,
        save_strategy="no",
        eval_strategy="no",
        report_to=[],
        optim="paged_adamw_8bit" if not args.no_4bit else "adamw_torch",
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
    )

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        peft_config=peft_config,
        processing_class=tokenizer,
    )
    trainer.train()

    adapter_dir = output_dir / "adapter"
    trainer.save_model(str(adapter_dir))
    tokenizer.save_pretrained(str(adapter_dir))

    if not args.skip_generation_eval:
        eval_report = run_generation_eval(args, trainer.model, tokenizer, test, torch)
        (output_dir / "eval.json").write_text(
            json.dumps(eval_report, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )


def load_model(
    args: argparse.Namespace,
    torch: Any,
    AutoModelForCausalLM: Any,
    BitsAndBytesConfig: Any,
) -> Any:
    has_cuda = torch.cuda.is_available()
    if has_cuda and torch.cuda.is_bf16_supported():
        compute_dtype = torch.bfloat16
    elif has_cuda:
        compute_dtype = torch.float16
    else:
        compute_dtype = torch.float32

    model_kwargs: dict[str, Any] = {
        "torch_dtype": compute_dtype,
    }
    if has_cuda:
        model_kwargs["device_map"] = "auto"

    if not args.no_4bit:
        if not has_cuda:
            raise RuntimeError(
                "4-bit QLoRA requires CUDA for this experiment. Re-run with --no-4bit "
                "for a non-quantized CPU/MPS smoke test, or use an NVIDIA GPU.",
            )
        model_kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=compute_dtype,
            bnb_4bit_use_double_quant=True,
        )

    return AutoModelForCausalLM.from_pretrained(args.model_id, **model_kwargs)


def run_generation_eval(
    args: argparse.Namespace,
    model: Any,
    tokenizer: Any,
    test: list[Example],
    torch: Any,
) -> dict[str, Any]:
    lora_report = evaluate_model_on_examples(
        args=args,
        model=model,
        tokenizer=tokenizer,
        test=test,
        torch=torch,
        label="lora",
    )

    with adapter_disabled_context(model):
        base_report = evaluate_model_on_examples(
            args=args,
            model=model,
            tokenizer=tokenizer,
            test=test,
            torch=torch,
            label="base",
        )

    comparison = compare_eval_reports(base_report, lora_report)
    return {
        "loraId": LORA_ID,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "metrics": lora_report["metrics"],
        "comparison": comparison,
        "base": base_report,
        "lora": lora_report,
        "notes": [
            "Base and LoRA are evaluated on the same held-out prompts.",
            "Completion NLL/perplexity are the closest LLM analogs to traditional ML loss; lower is better.",
            "JSON/schema/style/safety rates verify the app's structured-output and clinical-behavior contract.",
            "Token F1 and ROUGE-L are reference-similarity diagnostics, not clinical approval.",
        ],
    }


def adapter_disabled_context(model: Any) -> Any:
    disable_adapter = getattr(model, "disable_adapter", None)
    if callable(disable_adapter):
        return disable_adapter()
    return nullcontext()


def evaluate_model_on_examples(
    args: argparse.Namespace,
    model: Any,
    tokenizer: Any,
    test: list[Example],
    torch: Any,
    label: str,
) -> dict[str, Any]:
    model.eval()
    results: list[ExampleEval] = []
    for example in test:
        completion_nll, completion_ppl, completion_token_count = compute_completion_loss(
            model=model,
            tokenizer=tokenizer,
            example=example,
            torch=torch,
        )
        prompt = build_phase_user_prompt(example.input_payload)
        prompt_messages = build_phase_messages(example.input_payload)
        prompt_text = render_chat_text(tokenizer, prompt_messages, add_generation_prompt=True)
        device = next(model.parameters()).device
        inputs = tokenizer(prompt_text, return_tensors="pt").to(device)

        start = time.perf_counter()
        with torch.no_grad():
            output_ids = model.generate(
                **inputs,
                max_new_tokens=args.max_new_tokens,
                do_sample=False,
                pad_token_id=tokenizer.pad_token_id,
                eos_token_id=tokenizer.eos_token_id,
            )
        latency_seconds = time.perf_counter() - start

        generated_ids = output_ids[0][inputs["input_ids"].shape[-1] :]
        generated_text = tokenizer.decode(generated_ids, skip_special_tokens=True).strip()
        parsed_output, parse_errors = extract_json_object(generated_text)
        validation_errors = validate_phase_output(parsed_output) if parsed_output else []

        raw_generated_lines = parsed_output.get("lines", []) if parsed_output else []
        generated_lines = raw_generated_lines if isinstance(raw_generated_lines, list) else []
        raw_reference_lines = example.output_payload.get("lines", [])
        reference_lines = raw_reference_lines if isinstance(raw_reference_lines, list) else []
        generated_style_text = join_lines(generated_lines) if generated_lines else generated_text
        token_f1 = bag_of_words_f1(join_lines(generated_lines), join_lines(reference_lines))
        rouge_l_f1 = rouge_l(join_lines(generated_lines), join_lines(reference_lines))
        medical_pass = not MEDICAL_DIRECTIVE_RE.search(generated_style_text)
        safety_pass = not any(
            TOXIC_POSITIVITY_RE.search(line)
            or PAUSE_OR_STAGE_DIRECTION_RE.search(line)
            or PHASE_ANNOUNCEMENT_RE.search(line)
            for line in (generated_lines if generated_lines else [generated_text])
            if isinstance(line, str)
        )
        patient_facing_pass = bool(SECOND_PERSON_RE.search(generated_style_text))
        no_analysis_voice_pass = not ANALYSIS_VOICE_RE.search(generated_style_text)
        no_markdown_pass = not MARKDOWN_OR_BULLET_RE.search(generated_style_text)
        style_pass = patient_facing_pass and no_analysis_voice_pass and no_markdown_pass

        results.append(
            ExampleEval(
                example_id=example.example_id,
                chunk_number=example.input_payload.get("chunkNumber")
                if isinstance(example.input_payload.get("chunkNumber"), int)
                else None,
                prompt=prompt,
                reference=example.output_payload,
                generated_text=generated_text,
                parsed_output=parsed_output,
                latency_seconds=latency_seconds,
                json_valid=parsed_output is not None,
                line_count_pass=isinstance(generated_lines, list)
                and len(generated_lines) == CHUNK_LINE_COUNT,
                schema_pass=parsed_output is not None and not validation_errors,
                safety_pass=safety_pass,
                medical_directive_pass=medical_pass,
                style_pass=style_pass,
                patient_facing_pass=patient_facing_pass,
                no_analysis_voice_pass=no_analysis_voice_pass,
                no_markdown_pass=no_markdown_pass,
                completion_nll=completion_nll,
                completion_ppl=completion_ppl,
                completion_token_count=completion_token_count,
                token_f1=token_f1,
                rouge_l_f1=rouge_l_f1,
                errors=[*parse_errors, *validation_errors],
            )
        )

    return aggregate_eval(results, label=label)


def compute_completion_loss(
    model: Any,
    tokenizer: Any,
    example: Example,
    torch: Any,
) -> tuple[float, float, int]:
    prompt_messages = build_phase_messages(example.input_payload)
    full_messages = build_phase_messages(example.input_payload, example.output_payload)
    prompt_text = render_chat_text(tokenizer, prompt_messages, add_generation_prompt=True)
    full_text = render_chat_text(tokenizer, full_messages, add_generation_prompt=False)

    prompt_ids = tokenizer(prompt_text, add_special_tokens=False)["input_ids"]
    encoded = tokenizer(full_text, return_tensors="pt", add_special_tokens=False)
    device = next(model.parameters()).device
    encoded = encoded.to(device)

    labels = encoded["input_ids"].clone()
    prompt_len = min(len(prompt_ids), labels.shape[-1])
    labels[:, :prompt_len] = -100
    token_count = int((labels != -100).sum().item())
    if token_count == 0:
        return float("nan"), float("nan"), 0

    with torch.no_grad():
        output = model(**encoded, labels=labels)
    nll = float(output.loss.detach().cpu().item())
    ppl = math.exp(min(nll, 20.0))
    return nll, ppl, token_count


def extract_json_object(text: str) -> tuple[dict[str, Any] | None, list[str]]:
    cleaned = JSON_FENCE_RE.sub("", text).strip()
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed, []
        return None, ["generated JSON was not an object"]
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None, ["no JSON object found in generated text"]
    try:
        parsed = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as error:
        return None, [f"generated JSON parse error: {error}"]
    if not isinstance(parsed, dict):
        return None, ["generated JSON was not an object"]
    return parsed, []


def join_lines(value: Any) -> str:
    if isinstance(value, list):
        return " ".join(item for item in value if isinstance(item, str))
    return ""


def tokenize_words(text: str) -> list[str]:
    return WORD_RE.findall(text.lower())


def bag_of_words_f1(generated: str, reference: str) -> float:
    generated_tokens = tokenize_words(generated)
    reference_tokens = tokenize_words(reference)
    if not generated_tokens or not reference_tokens:
        return 0.0

    generated_counts: dict[str, int] = {}
    reference_counts: dict[str, int] = {}
    for token in generated_tokens:
        generated_counts[token] = generated_counts.get(token, 0) + 1
    for token in reference_tokens:
        reference_counts[token] = reference_counts.get(token, 0) + 1

    overlap = sum(
        min(count, reference_counts.get(token, 0))
        for token, count in generated_counts.items()
    )
    precision = overlap / len(generated_tokens)
    recall = overlap / len(reference_tokens)
    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def rouge_l(generated: str, reference: str) -> float:
    generated_tokens = tokenize_words(generated)
    reference_tokens = tokenize_words(reference)
    if not generated_tokens or not reference_tokens:
        return 0.0

    lcs = longest_common_subsequence_length(generated_tokens, reference_tokens)
    precision = lcs / len(generated_tokens)
    recall = lcs / len(reference_tokens)
    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def longest_common_subsequence_length(left: list[str], right: list[str]) -> int:
    previous = [0] * (len(right) + 1)
    for left_token in left:
        current = [0]
        for index, right_token in enumerate(right, start=1):
            if left_token == right_token:
                current.append(previous[index - 1] + 1)
            else:
                current.append(max(previous[index], current[-1]))
        previous = current
    return previous[-1]


def aggregate_eval(results: list[ExampleEval], label: str) -> dict[str, Any]:
    count = len(results)
    latencies = sorted(result.latency_seconds for result in results)
    metrics = {
        "exampleCount": count,
        "completionNll": weighted_mean(
            (result.completion_nll, result.completion_token_count)
            for result in results
        ),
        "completionPpl": safe_exp(
            weighted_mean(
                (result.completion_nll, result.completion_token_count)
                for result in results
            )
        ),
        "jsonValidityRate": mean_bool(result.json_valid for result in results),
        "lineCountAccuracy": mean_bool(result.line_count_pass for result in results),
        "schemaPassRate": mean_bool(result.schema_pass for result in results),
        "safetyPassRate": mean_bool(result.safety_pass for result in results),
        "medicalDirectivePassRate": mean_bool(
            result.medical_directive_pass for result in results
        ),
        "stylePassRate": mean_bool(result.style_pass for result in results),
        "patientFacingRate": mean_bool(result.patient_facing_pass for result in results),
        "noAnalysisVoiceRate": mean_bool(
            result.no_analysis_voice_pass for result in results
        ),
        "noMarkdownRate": mean_bool(result.no_markdown_pass for result in results),
        "meanTokenF1": mean_float(result.token_f1 for result in results),
        "meanRougeLF1": mean_float(result.rouge_l_f1 for result in results),
        "meanLatencySeconds": mean_float(result.latency_seconds for result in results),
        "p95LatencySeconds": percentile(latencies, 0.95),
    }
    metrics["pass"] = (
        metrics["jsonValidityRate"] >= 0.98
        and metrics["schemaPassRate"] == 1.0
        and metrics["safetyPassRate"] == 1.0
        and metrics["medicalDirectivePassRate"] == 1.0
        and metrics["stylePassRate"] == 1.0
    )
    return {
        "label": label,
        "loraId": LORA_ID,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "metrics": metrics,
        "examples": [asdict(result) for result in results],
        "notes": [
            "JSON/schema/safety rates verify the structured-output pipeline used by the app runtime.",
            "Style pass means patient-facing second-person narration with no analysis voice or markdown.",
            "Token F1 and ROUGE-L are reference-similarity diagnostics, not clinical approval.",
            "Tiny first-pass datasets make the held-out numbers noisy; use them as a smoke test until the seed set is larger.",
        ],
    }


def compare_eval_reports(base_report: dict[str, Any], lora_report: dict[str, Any]) -> dict[str, Any]:
    base_metrics = base_report["metrics"]
    lora_metrics = lora_report["metrics"]
    deltas: dict[str, float] = {}
    for key, lora_value in lora_metrics.items():
        base_value = base_metrics.get(key)
        if (
            isinstance(lora_value, (int, float))
            and isinstance(base_value, (int, float))
            and not isinstance(lora_value, bool)
            and not isinstance(base_value, bool)
        ):
            deltas[key] = float(lora_value) - float(base_value)

    base_nll = float(base_metrics.get("completionNll", float("nan")))
    lora_nll = float(lora_metrics.get("completionNll", float("nan")))
    if math.isfinite(base_nll) and base_nll > 0 and math.isfinite(lora_nll):
        nll_improvement_rate = (base_nll - lora_nll) / base_nll
    else:
        nll_improvement_rate = 0.0

    lora_quality_score = compute_wave_lora_score(lora_metrics, nll_improvement_rate)
    base_quality_score = compute_wave_lora_score(base_metrics, 0.0)

    return {
        "baseLabel": base_report["label"],
        "loraLabel": lora_report["label"],
        "metricDeltas": deltas,
        "completionNllImprovementRate": nll_improvement_rate,
        "baseWaveScore": base_quality_score,
        "loraWaveScore": lora_quality_score,
        "waveScoreDelta": lora_quality_score - base_quality_score,
        "betterThanBase": lora_quality_score > base_quality_score,
        "scoreWeights": {
            "completionNllImprovement": 25,
            "jsonValidity": 10,
            "schemaPass": 15,
            "stylePass": 20,
            "safetyAndMedication": 20,
            "referenceSimilarity": 10,
        },
    }


def compute_wave_lora_score(metrics: dict[str, Any], nll_improvement_rate: float) -> float:
    similarity = (
        float(metrics.get("meanTokenF1", 0.0)) + float(metrics.get("meanRougeLF1", 0.0))
    ) / 2
    safety_combo = (
        float(metrics.get("safetyPassRate", 0.0))
        + float(metrics.get("medicalDirectivePassRate", 0.0))
    ) / 2
    score = (
        25.0 * clamp_float(nll_improvement_rate / 0.10, 0.0, 1.0)
        + 10.0 * float(metrics.get("jsonValidityRate", 0.0))
        + 15.0 * float(metrics.get("schemaPassRate", 0.0))
        + 20.0 * float(metrics.get("stylePassRate", 0.0))
        + 20.0 * safety_combo
        + 10.0 * clamp_float(similarity, 0.0, 1.0)
    )
    return round(score, 2)


def mean_bool(values: Any) -> float:
    items = list(values)
    if not items:
        return 0.0
    return sum(1 for item in items if item) / len(items)


def mean_float(values: Any) -> float:
    items = list(values)
    if not items:
        return 0.0
    return sum(float(item) for item in items) / len(items)


def weighted_mean(values: Any) -> float:
    items = [(float(value), int(weight)) for value, weight in values if int(weight) > 0]
    total_weight = sum(weight for _, weight in items)
    if total_weight == 0:
        return float("nan")
    return sum(value * weight for value, weight in items) / total_weight


def safe_exp(value: float) -> float:
    if not math.isfinite(value):
        return float("nan")
    return math.exp(min(value, 20.0))


def clamp_float(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def percentile(sorted_values: list[float], q: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return sorted_values[0]
    position = (len(sorted_values) - 1) * q
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return sorted_values[lower]
    weight = position - lower
    return sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight


def main() -> None:
    args = parse_args()
    output_dir = args.output_dir or default_output_dir()
    output_dir.mkdir(parents=True, exist_ok=True)

    examples = load_examples(args.data, include_drafts=args.include_drafts)
    train, test = split_examples(examples, test_size=args.test_size, seed=args.seed)

    write_jsonl(output_dir / "train.jsonl", train)
    write_jsonl(output_dir / "test.jsonl", test)
    write_summary(output_dir / "run-config.json", args, examples, train, test)

    print(f"Loaded {len(examples)} examples: {len(train)} train / {len(test)} test")
    print(f"Wrote split and config to {output_dir}")

    if args.dry_run:
        print("Dry run complete; skipping model load, training, and generation eval.")
        return

    train_and_eval(args, output_dir, train, test)
    print(f"Saved adapter and eval artifacts under {output_dir}")


if __name__ == "__main__":
    main()
