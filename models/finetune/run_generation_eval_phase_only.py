from __future__ import annotations

import argparse
import json
import sys
from dataclasses import fields
from pathlib import Path

import train_wave_session_lora as trainer


def main() -> None:
    parser = argparse.ArgumentParser(description="Phase-only generation eval from saved adapter.")
    parser.add_argument("--run-dir", required=True, type=Path)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--load-mode", default="4bit", choices=["4bit", "bf16"])
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--max-seq-length", type=int, default=4096)
    parser.add_argument("--max-new-tokens", type=int, default=512)
    parser.add_argument("--phase-max-new-tokens", type=int, default=384)
    parser.add_argument("--model-id", default="google/gemma-4-E2B-it")
    parser.add_argument("--out", default="generation-eval-phase-384.json")
    cli = parser.parse_args()

    run_dir: Path = cli.run_dir.resolve()
    adapter_dir = run_dir / "adapter"
    test_path = run_dir / "test.jsonl"
    out_path = run_dir / cli.out

    if not adapter_dir.exists():
        sys.exit(f"missing adapter dir: {adapter_dir}")
    if not test_path.exists():
        sys.exit(f"missing test split: {test_path}")

    print("Importing trainer deps...", flush=True)
    torch, _Dataset, FastModel, get_chat_template, *_rest = trainer.import_training_dependencies()

    args = argparse.Namespace(
        model_id=cli.model_id,
        max_seq_length=cli.max_seq_length,
        max_new_tokens=cli.max_new_tokens,
        no_4bit=False,
        seed=cli.seed,
        generation_eval_limit=cli.limit,
        generation_eval_include_base=False,
        generation_eval_include_completion_loss=False,
        generation_eval_load_mode=cli.load_mode,
        generation_eval_check_in_max_new_tokens=96,
        generation_eval_phase_max_new_tokens=cli.phase_max_new_tokens,
        generation_eval_reflection_max_new_tokens=192,
    )

    print(f"Loading adapter {adapter_dir} (mode={cli.load_mode})...", flush=True)
    model, tokenizer, actual_mode = trainer.load_unsloth_generation_model(
        args, adapter_dir, FastModel, get_chat_template, torch
    )
    args.generation_eval_load_mode = actual_mode
    print(f"Adapter loaded. Effective load mode: {actual_mode}", flush=True)

    examples: list[trainer.Example] = []
    with test_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            examples.append(trainer.Example(**json.loads(line)))
    phase_examples = [e for e in examples if e.surface == "phase_narration"]
    print(f"Test split: {len(examples)} total; phase_narration: {len(phase_examples)}", flush=True)

    selected_config = _build_selected_config(run_dir)

    # Use a phase-only output dir so we don't overwrite the original progress JSONL.
    phase_out_dir = run_dir / "phase-rerun-384"
    phase_out_dir.mkdir(exist_ok=True)
    print(f"Running phase-only generation eval (limit={cli.limit}, phase_max_new_tokens={cli.phase_max_new_tokens})...", flush=True)
    report = trainer.run_generation_eval(
        args=args,
        model=model,
        tokenizer=tokenizer,
        test=phase_examples,
        torch=torch,
        selected_config=selected_config,
        output_dir=phase_out_dir,
    )
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out_path}", flush=True)
    metrics = report.get("metrics", {})
    print("--- metrics ---", flush=True)
    print(json.dumps(metrics, indent=2, ensure_ascii=False), flush=True)


def _build_selected_config(run_dir: Path) -> trainer.TrainConfig:
    eval_path = run_dir / "eval.json"
    field_names = {f.name for f in fields(trainer.TrainConfig)}
    raw: dict = {}
    if eval_path.exists():
        try:
            top = json.loads(eval_path.read_text(encoding="utf-8"))
            raw = top.get("selectedConfig", {}) or {}
        except Exception:
            raw = {}
    clean = {k: v for k, v in raw.items() if k in field_names}
    clean.setdefault("label", "primary")
    clean.setdefault("epochs", 1.0)
    clean.setdefault("max_steps", -1)
    clean.setdefault("batch_size", 1)
    clean.setdefault("gradient_accumulation_steps", 8)
    clean.setdefault("learning_rate", 2e-4)
    clean.setdefault("warmup_steps", 0)
    clean.setdefault("lora_r", 32)
    clean.setdefault("lora_alpha", 32)
    clean.setdefault("lora_dropout", 0.0)
    return trainer.TrainConfig(**clean)


if __name__ == "__main__":
    main()
