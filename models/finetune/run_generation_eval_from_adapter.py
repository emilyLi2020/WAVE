from __future__ import annotations

import argparse
import json
import sys
from dataclasses import fields
from pathlib import Path

import train_wave_session_lora as trainer


def main() -> None:
    parser = argparse.ArgumentParser(description="Run generation eval from a saved LoRA adapter.")
    parser.add_argument("--run-dir", required=True, type=Path)
    parser.add_argument("--limit", type=int, default=60)
    parser.add_argument("--load-mode", default="4bit", choices=["4bit", "bf16"])
    parser.add_argument("--include-base", action="store_true")
    parser.add_argument("--include-completion-loss", action="store_true")
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--max-seq-length", type=int, default=4096)
    parser.add_argument("--max-new-tokens", type=int, default=256)
    parser.add_argument("--check-in-max-new-tokens", type=int, default=96)
    parser.add_argument("--phase-max-new-tokens", type=int, default=160)
    parser.add_argument("--reflection-max-new-tokens", type=int, default=192)
    parser.add_argument("--model-id", default="google/gemma-4-E2B-it")
    parser.add_argument("--out", default="generation-eval.json")
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
        generation_eval_include_base=cli.include_base,
        generation_eval_include_completion_loss=cli.include_completion_loss,
        generation_eval_load_mode=cli.load_mode,
        generation_eval_check_in_max_new_tokens=cli.check_in_max_new_tokens,
        generation_eval_phase_max_new_tokens=cli.phase_max_new_tokens,
        generation_eval_reflection_max_new_tokens=cli.reflection_max_new_tokens,
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
    print(f"Test split: {len(examples)} examples; limit={cli.limit}", flush=True)

    selected_config = _build_selected_config(run_dir)

    print("Running generation eval...", flush=True)
    report = trainer.run_generation_eval(
        args=args,
        model=model,
        tokenizer=tokenizer,
        test=examples,
        torch=torch,
        selected_config=selected_config,
        output_dir=run_dir,
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
    if not raw:
        run_cfg = run_dir / "run-config.json"
        if run_cfg.exists():
            try:
                rc = json.loads(run_cfg.read_text(encoding="utf-8"))
                raw = (
                    rc.get("trainingConfig")
                    or rc.get("resolvedTraining")
                    or {}
                )
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
