from __future__ import annotations

import argparse
import json
import sys
from dataclasses import fields
from pathlib import Path

import train_wave_session_lora as trainer


def main() -> None:
    parser = argparse.ArgumentParser(description="Regenerate specific example IDs (reproducibility check).")
    parser.add_argument("--run-dir", required=True, type=Path)
    parser.add_argument("--example-ids", required=True, help="Comma-separated full example_id values to regenerate.")
    parser.add_argument("--repeats", type=int, default=2, help="How many times to re-run each example.")
    parser.add_argument("--load-mode", default="4bit", choices=["4bit", "bf16"])
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--max-seq-length", type=int, default=4096)
    parser.add_argument("--max-new-tokens", type=int, default=512)
    parser.add_argument("--phase-max-new-tokens", type=int, default=384)
    parser.add_argument("--model-id", default="google/gemma-4-E2B-it")
    parser.add_argument("--out", default="phase-regen-check.json")
    cli = parser.parse_args()

    run_dir: Path = cli.run_dir.resolve()
    adapter_dir = run_dir / "adapter"
    test_path = run_dir / "test.jsonl"
    out_path = run_dir / cli.out

    if not adapter_dir.exists():
        sys.exit(f"missing adapter dir: {adapter_dir}")
    if not test_path.exists():
        sys.exit(f"missing test split: {test_path}")

    target_ids = {x.strip() for x in cli.example_ids.split(",") if x.strip()}
    print(f"Targets ({len(target_ids)}): {sorted(target_ids)}", flush=True)

    print("Importing trainer deps...", flush=True)
    torch, _Dataset, FastModel, get_chat_template, *_rest = trainer.import_training_dependencies()

    args = argparse.Namespace(
        model_id=cli.model_id,
        max_seq_length=cli.max_seq_length,
        max_new_tokens=cli.max_new_tokens,
        no_4bit=False,
        seed=cli.seed,
        generation_eval_limit=len(target_ids) * cli.repeats,
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

    examples_by_id: dict[str, trainer.Example] = {}
    with test_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            ex = trainer.Example(**json.loads(line))
            if ex.example_id in target_ids:
                examples_by_id[ex.example_id] = ex
    missing = target_ids - set(examples_by_id)
    if missing:
        print(f"WARNING: missing example IDs in test.jsonl: {sorted(missing)}", flush=True)

    selected_config = _build_selected_config(run_dir)

    # Build the eval list: each target id repeated `repeats` times.
    eval_examples: list[trainer.Example] = []
    for ex_id in sorted(examples_by_id):
        for _ in range(cli.repeats):
            eval_examples.append(examples_by_id[ex_id])
    print(f"Eval list size: {len(eval_examples)} ({len(examples_by_id)} unique x {cli.repeats} repeats)", flush=True)

    regen_out_dir = run_dir / "phase-regen-check"
    regen_out_dir.mkdir(exist_ok=True)
    print(f"Running regen eval (phase_max_new_tokens={cli.phase_max_new_tokens})...", flush=True)
    report = trainer.run_generation_eval(
        args=args,
        model=model,
        tokenizer=tokenizer,
        test=eval_examples,
        torch=torch,
        selected_config=selected_config,
        output_dir=regen_out_dir,
    )

    progress = regen_out_dir / "generation-eval-progress.jsonl"
    rows = [json.loads(l) for l in progress.open()] if progress.exists() else []
    by_target: dict[str, list[dict]] = {}
    for r in rows:
        by_target.setdefault(r.get("example_id", "?"), []).append(r)

    summary = {
        "perTarget": {},
        "overall": {
            "rows": len(rows),
            "jsonValidCount": sum(1 for r in rows if r.get("json_valid")),
            "schemaPassCount": sum(1 for r in rows if r.get("schema_pass")),
            "safetyPassCount": sum(1 for r in rows if r.get("safety_pass")),
            "phaseSixLinePassCount": sum(1 for r in rows if r.get("phase_six_line_pass")),
        },
    }
    for ex_id, rs in by_target.items():
        summary["perTarget"][ex_id] = {
            "n": len(rs),
            "jsonValidCount": sum(1 for r in rs if r.get("json_valid")),
            "schemaPassCount": sum(1 for r in rs if r.get("schema_pass")),
            "safetyPassCount": sum(1 for r in rs if r.get("safety_pass")),
            "phaseSixLinePassCount": sum(1 for r in rs if r.get("phase_six_line_pass")),
            "generatedTokenCounts": [r.get("generated_token_count") for r in rs],
            "generatedTails": [(r.get("generated_text") or "")[-120:] for r in rs],
        }

    out_path.write_text(json.dumps({"report": report, "summary": summary}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out_path}", flush=True)
    print("--- summary ---", flush=True)
    print(json.dumps(summary, indent=2, ensure_ascii=False), flush=True)


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
