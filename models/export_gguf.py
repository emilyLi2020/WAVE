"""Export a merged Gemma 4 model to GGUF q4_k_m.

Usage:
  uv run python export_gguf.py --adapter-dir <path> --out-dir <path> [--quant q4_k_m]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adapter-dir", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--quant", default="q4_k_m",
                        choices=["q4_k_m", "q5_k_m", "q8_0", "f16"])
    parser.add_argument("--max-seq-length", type=int, default=3072)
    args = parser.parse_args()

    adapter_dir = args.adapter_dir.resolve()
    out_dir = args.out_dir.resolve()

    if not (adapter_dir / "adapter_config.json").exists():
        sys.exit(f"missing adapter_config.json in {adapter_dir}")

    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"adapter : {adapter_dir}")
    print(f"out     : {out_dir}")
    print(f"quant   : {args.quant}")

    print("Importing Unsloth...", flush=True)
    from unsloth import FastModel  # noqa: E402

    print("Loading model in 16-bit...", flush=True)
    model, tokenizer = FastModel.from_pretrained(
        model_name=str(adapter_dir),
        max_seq_length=args.max_seq_length,
        load_in_4bit=False,
        dtype=None,
    )

    print("Saving to GGUF (this builds llama.cpp if not cached)...", flush=True)
    model.save_pretrained_gguf(str(out_dir), tokenizer, quantization_method=args.quant)
    print(f"Done. Output: {out_dir}")


if __name__ == "__main__":
    main()
