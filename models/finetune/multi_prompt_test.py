"""Sequential multi-prompt smoke test on a merged Gemma 4 E2B checkpoint.

Runs the same 4 prompts the MLC web-llm compare page uses, in order, through
the same loaded transformers model. Each call uses a fresh single-message
conversation. Reports per-prompt coherence so we can see if degeneration
patterns the postmortem documented for web-llm (prompt-1 clean, prompts 2-4
degenerate) appear at the weights level too.

This does NOT perfectly reproduce the web-llm bug: transformers.generate()
allocates a fresh KV cache per call, while web-llm reuses one engine across
chat.completions.create() calls. But it's the strongest test we can run on
Windows without source-building mlc_llm.

Usage:
  uv run --project models python finetune/multi_prompt_test.py \\
    --source-repo runs/merge-peft --device cuda --dtype bfloat16
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Same 4 prompts as docs/postmortems/mlc-finetune.md table at line 191
DEFAULT_PROMPTS = [
    "Count from 1 to 5.",
    "I'm feeling anxious right now. What's one small thing I can do?",
    "What is the capital of France? Answer in one sentence.",
    "Write a haiku about ocean waves.",
]


def _load(repo: str, dtype, device_map, cache_dir):
    from transformers import AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(repo, cache_dir=cache_dir)

    last_err = None
    for cls_name in (
        "AutoModelForCausalLM",
        "AutoModelForImageTextToText",
        "Gemma4ForConditionalGeneration",
    ):
        try:
            if cls_name == "AutoModelForCausalLM":
                from transformers import AutoModelForCausalLM as Cls
            elif cls_name == "AutoModelForImageTextToText":
                from transformers import AutoModelForImageTextToText as Cls
            else:
                from transformers import Gemma4ForConditionalGeneration as Cls
            print(f"Trying {cls_name}...", flush=True)
            model = Cls.from_pretrained(
                repo,
                torch_dtype=dtype,
                device_map=device_map,
                cache_dir=cache_dir,
            )
            print(f"Loaded via {cls_name}", flush=True)
            return model, tokenizer
        except Exception as e:
            print(f"{cls_name} failed: {type(e).__name__}: {e}", flush=True)
            last_err = e
    raise RuntimeError(f"All load paths failed; last error: {last_err}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-repo", required=True, type=str)
    parser.add_argument("--prompts", nargs="+", type=str, default=DEFAULT_PROMPTS)
    parser.add_argument("--max-new-tokens", type=int, default=80)
    parser.add_argument("--cache-dir", type=Path, default=None)
    parser.add_argument("--device", type=str, default="auto")
    parser.add_argument("--dtype", type=str, default="bfloat16")
    args = parser.parse_args()

    print("Importing torch + transformers...", flush=True)
    import torch

    if args.device == "auto":
        if torch.cuda.is_available():
            device_map = "cuda"
        elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            device_map = "mps"
        else:
            device_map = "cpu"
    else:
        device_map = args.device

    dtype = {"bfloat16": torch.bfloat16, "float16": torch.float16, "float32": torch.float32}[args.dtype]
    print(f"device_map={device_map}, dtype={dtype}", flush=True)

    print(f"\nLoading {args.source_repo}...", flush=True)
    model, tokenizer = _load(args.source_repo, dtype, device_map, args.cache_dir)
    model.eval()
    print("Model loaded.\n", flush=True)

    pad_id = tokenizer.pad_token_id
    results = []

    for i, prompt in enumerate(args.prompts, 1):
        print(f"=== PROMPT {i}/{len(args.prompts)}: {prompt}", flush=True)
        messages = [{"role": "user", "content": prompt}]
        chat = tokenizer.apply_chat_template(
            messages, add_generation_prompt=True, tokenize=False
        )
        inputs = tokenizer(chat, return_tensors="pt").to(model.device)
        with torch.inference_mode():
            out = model.generate(
                **inputs,
                max_new_tokens=args.max_new_tokens,
                do_sample=False,
            )
        gen_ids = out[0, inputs.input_ids.shape[1]:]
        text_raw = tokenizer.decode(gen_ids, skip_special_tokens=False)
        text_clean = tokenizer.decode(gen_ids, skip_special_tokens=True).strip()
        total = int(gen_ids.numel())
        pad_count = int((gen_ids == pad_id).sum().item()) if pad_id is not None else 0
        pad_ratio = pad_count / max(total, 1)
        empty = total == 0 or not any(c.isalpha() for c in text_clean)
        coherent = pad_ratio < 0.5 and not empty
        status = "OK" if coherent else ("EMPTY" if empty else "DEGENERATE")
        print(f"  tokens: {total} | pad ratio: {pad_ratio:.0%} | status: {status}", flush=True)
        print(f"  cleaned: {text_clean[:300]}", flush=True)
        print(f"  raw    : {text_raw[:300]}\n", flush=True)
        results.append((prompt, status, text_clean))

    print("\n=== SUMMARY ===")
    for i, (p, status, _) in enumerate(results, 1):
        marker = "OK" if status == "OK" else "FAIL"
        print(f"  [{marker}] #{i}: {p[:60]}{'...' if len(p) > 60 else ''}  ->  {status}", flush=True)

    n_pass = sum(1 for _, s, _ in results if s == "OK")
    print(f"\nVerdict: {n_pass}/{len(results)} prompts produced coherent text in sequence.", flush=True)
    if n_pass < len(results):
        sys.exit(2)


if __name__ == "__main__":
    main()
