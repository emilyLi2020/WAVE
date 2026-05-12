"""Merge a trained LoRA adapter into the Gemma 4 E2B base and save as 16-bit safetensors.

Usage:
  uv run python merge_lora_adapter.py --adapter-dir <path> --out-dir <path>
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adapter-dir", required=True, type=Path,
                        help="Path containing adapter_config.json + adapter_model.safetensors")
    parser.add_argument("--out-dir", required=True, type=Path,
                        help="Output directory for merged 16-bit model")
    parser.add_argument("--base-model", default="unsloth/gemma-4-E2B-it",
                        help="Base model repo id")
    parser.add_argument("--max-seq-length", type=int, default=3072)
    parser.add_argument("--save-method", default="merged_16bit",
                        choices=["merged_16bit", "merged_4bit_forced", "lora"])
    args = parser.parse_args()

    adapter_dir = args.adapter_dir.resolve()
    out_dir = args.out_dir.resolve()

    if not (adapter_dir / "adapter_config.json").exists():
        sys.exit(f"missing adapter_config.json in {adapter_dir}")

    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"adapter : {adapter_dir}")
    print(f"base    : {args.base_model}")
    print(f"out     : {out_dir}")
    print(f"method  : {args.save_method}")

    print("Importing Unsloth...", flush=True)
    from unsloth import FastModel  # noqa: E402

    print(f"Loading base model in 16-bit (this dequantizes if needed)...", flush=True)
    model, tokenizer = FastModel.from_pretrained(
        model_name=str(adapter_dir),
        max_seq_length=args.max_seq_length,
        load_in_4bit=False,
        dtype=None,
    )

    print("Saving merged model...", flush=True)
    model.save_pretrained_merged(str(out_dir), tokenizer, save_method=args.save_method)

    manifest = {
        "baseModel": args.base_model,
        "adapterDir": str(adapter_dir),
        "outDir": str(out_dir),
        "saveMethod": args.save_method,
        "maxSeqLength": args.max_seq_length,
    }
    (out_dir / "merge-manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"Wrote {out_dir / 'merge-manifest.json'}")
    print("Done.")


if __name__ == "__main__":
    main()
