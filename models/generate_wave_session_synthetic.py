"""Generate and vet synthetic draft rows for the WAVE session LoRA.

The OpenAI model is only a draft generator. This script owns the acceptance
rules: coverage planning, deterministic duplicate rejection, schema/safety
validation, quality scoring, and audit artifacts.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import time
import urllib.error
import urllib.request
import uuid
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from prepare_wave_session_dataset import (
    CHECK_IN_LORA_IDS,
    DEFAULT_OUTPUT,
    DEMO_LORA_ID,
    MAT_TYPES,
    MEDICATION_STATUSES,
    OBSTACLE_CATEGORIES,
    TRIGGERS,
    WAVE_JSON_SYSTEM_PROMPT,
    build_check_in_prompt,
    build_phase_prompt,
    build_prepared_row,
    build_reflection_prompt,
    build_split_key,
    compact_json,
    validate_check_in_output,
    validate_common_output,
    validate_phase_output,
    validate_reflection_output,
)


DEFAULT_COVERAGE_PLAN = Path("datasets/reports/lora-wave-session-coverage-plan.json")
DEFAULT_SYNTHETIC_DRAFT = Path("datasets/synthetic/lora-wave-session-synthetic-draft.jsonl")
DEFAULT_EXPANDED = Path("datasets/lora-wave-session-expanded.jsonl")
DEFAULT_REPORT = Path("datasets/synthetic/lora-wave-session-synthetic-report.json")
DEFAULT_QUALITY_AUDIT = Path("datasets/synthetic/lora-wave-session-synthetic-quality-audit.md")
DEFAULT_CACHE = Path("datasets/.wave-session-synthetic-cache.json")
DEFAULT_ENV_PATH = Path("../client/.env.local")

GENERATOR_SYSTEM_PROMPT = """You generate synthetic training drafts for WAVE, a clinical-adjacent urge surfing companion.

You must preserve WAVE's clinician-reviewed style:
- trauma-informed, grounded, second person, plain language
- no shame, no toxic positivity, no medication instructions
- no crisis routing or emergency advice
- no hallucinated pharmacology
- strict JSON only

These drafts are not final clinical content. They will be validated, deduplicated, and reviewed before training."""

WORD_RE = re.compile(r"[a-z0-9']+")
PUNCT_RE = re.compile(r"[^a-z0-9\s']")
GENERIC_PHRASES_RE = re.compile(
    r"\b(you are not alone|take a deep breath|just relax|everything happens for a reason|"
    r"believe in yourself|stay positive)\b",
    re.IGNORECASE,
)
SHAME_RE = re.compile(r"\b(failed|failure|weak|bad choice|should have known|relapse)\b", re.IGNORECASE)
CRISIS_ROUTING_RE = re.compile(r"\b(988|911|emergency room|samsha|samhsa|helpline)\b", re.IGNORECASE)


@dataclass(frozen=True)
class CoverageGap:
    gap_id: str
    surface: str
    source_lora_id: str
    chunk_number: int | None
    medication_status: str
    trigger: str
    final_turn: bool | None
    current_count: int
    target_count: int
    requested_count: int


@dataclass(frozen=True)
class CandidateDecision:
    accepted: bool
    reason: str
    rubric_score: int
    row: dict[str, Any] | None
    duplicate_metrics: dict[str, Any]
    quality_metrics: dict[str, Any]


@dataclass(frozen=True)
class GenerationJob:
    job_id: str
    gap: CoverageGap
    scenario_seeds: list[dict[str, Any]]
    prompt: str
    prompt_hash: str
    cache_key: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate synthetic WAVE session LoRA drafts with dedup and quality gates.",
    )
    parser.add_argument("--data", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--coverage-plan-output", type=Path, default=DEFAULT_COVERAGE_PLAN)
    parser.add_argument("--synthetic-output", type=Path, default=DEFAULT_SYNTHETIC_DRAFT)
    parser.add_argument("--expanded-output", type=Path, default=DEFAULT_EXPANDED)
    parser.add_argument("--report-output", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--quality-audit-output", type=Path, default=DEFAULT_QUALITY_AUDIT)
    parser.add_argument("--cache-path", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--env-path", type=Path, default=DEFAULT_ENV_PATH)
    parser.add_argument("--model", default="gpt-5-mini")
    parser.add_argument(
        "--reasoning-effort",
        default="minimal",
        choices=["none", "low", "medium", "high", "xhigh"],
        help="Chat Completions reasoning_effort for models that support it.",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=1.0,
        help="Sampling temperature. gpt-5.5 chat completions only supports the default value.",
    )
    parser.add_argument("--batch-size", type=int, default=20)
    parser.add_argument(
        "--concurrency",
        type=int,
        default=50,
        help="Maximum concurrent OpenAI generation requests.",
    )
    parser.add_argument("--oversample", type=float, default=1.5)
    parser.add_argument("--target-phase", type=int, default=1534)
    parser.add_argument("--target-reflection", type=int, default=1534)
    parser.add_argument(
        "--target-check-in-final-per-stratum",
        type=int,
        default=0,
        help="Optional target per check-in final-turn med/trigger stratum. 0 disables check-in generation.",
    )
    parser.add_argument("--max-accepted", type=int, default=0)
    parser.add_argument(
        "--generate",
        action="store_true",
        help="Call OpenAI. Without this flag, only coverage/audit artifacts are written.",
    )
    parser.add_argument("--max-retries", type=int, default=5)
    parser.add_argument("--request-timeout", type=int, default=60)
    parser.add_argument("--min-rubric-score", type=int, default=85)
    parser.add_argument("--ngram-threshold-short", type=float, default=0.65)
    parser.add_argument("--ngram-threshold-long", type=float, default=0.55)
    parser.add_argument("--rouge-threshold", type=float, default=0.72)
    return parser.parse_args()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as file_handle:
        for line in file_handle:
            stripped = line.strip()
            if stripped:
                rows.append(json.loads(stripped))
    return rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file_handle:
        for row in rows:
            file_handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")))
            file_handle.write("\n")


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")


def build_coverage_plan(rows: list[dict[str, Any]], args: argparse.Namespace) -> list[CoverageGap]:
    counts = Counter()
    for row in rows:
        input_payload = row.get("input", {})
        metadata = input_payload.get("metadata", {})
        surface = input_payload.get("surface")
        source_lora_id = metadata.get("sourceLoraId")
        chunk = metadata.get("chunkNumber")
        medication = metadata.get("medicationStatus")
        trigger = metadata.get("trigger")
        final_turn = metadata.get("isFinalAgentTurn")
        key = (surface, source_lora_id, chunk, medication, trigger, final_turn)
        counts[key] += 1

    gaps: list[CoverageGap] = []
    phase_target_per_stratum = max(
        1,
        math.ceil(args.target_phase / (5 * len(MEDICATION_STATUSES) * len(TRIGGERS))),
    )
    for chunk in range(1, 6):
        for medication in sorted(MEDICATION_STATUSES):
            for trigger in sorted(TRIGGERS):
                key = (
                    "phase_narration",
                    "lora-phase-narration",
                    chunk,
                    medication,
                    trigger,
                    None,
                )
                append_gap(gaps, key, counts[key], phase_target_per_stratum)

    reflection_target_per_stratum = max(
        1,
        math.ceil(args.target_reflection / (len(MEDICATION_STATUSES) * len(TRIGGERS))),
    )
    for medication in sorted(MEDICATION_STATUSES):
        for trigger in sorted(TRIGGERS):
            key = ("reflection", "lora-reflection", None, medication, trigger, None)
            append_gap(gaps, key, counts[key], reflection_target_per_stratum)

    if args.target_check_in_final_per_stratum > 0:
        for source_lora_id in sorted(CHECK_IN_LORA_IDS):
            chunk = int(source_lora_id.rsplit("-", 1)[-1])
            for medication in sorted(MEDICATION_STATUSES):
                for trigger in sorted(TRIGGERS):
                    key = (
                        "check_in",
                        source_lora_id,
                        chunk,
                        medication,
                        trigger,
                        True,
                    )
                    append_gap(gaps, key, counts[key], args.target_check_in_final_per_stratum)

    surface_counts = Counter()
    for row in rows:
        surface_counts[row.get("input", {}).get("surface")] += 1
    surface_targets = {
        "phase_narration": args.target_phase,
        "reflection": args.target_reflection,
        "check_in": float("inf"),
    }
    gaps.sort(
        key=lambda gap: (
            surface_counts.get(gap.surface, 0) / float(surface_targets.get(gap.surface, 1)),
            gap.surface,
            gap.chunk_number or 0,
            gap.medication_status,
            gap.trigger,
        )
    )
    return gaps


def append_gap(
    gaps: list[CoverageGap],
    key: tuple[Any, ...],
    current_count: int,
    target_count: int,
) -> None:
    if current_count >= target_count:
        return
    surface, source_lora_id, chunk, medication, trigger, final_turn = key
    gap_id = stable_hash(
        {
            "surface": surface,
            "sourceLoraId": source_lora_id,
            "chunkNumber": chunk,
            "medicationStatus": medication,
            "trigger": trigger,
            "finalTurn": final_turn,
        }
    )[:12]
    gaps.append(
        CoverageGap(
            gap_id=gap_id,
            surface=str(surface),
            source_lora_id=str(source_lora_id),
            chunk_number=chunk if isinstance(chunk, int) else None,
            medication_status=str(medication),
            trigger=str(trigger),
            final_turn=final_turn if isinstance(final_turn, bool) else None,
            current_count=current_count,
            target_count=target_count,
            requested_count=target_count - current_count,
        )
    )


def coverage_plan_json(gaps: list[CoverageGap], args: argparse.Namespace) -> dict[str, Any]:
    return {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "sourceData": str(args.data),
        "targets": {
            "targetPhase": args.target_phase,
            "targetReflection": args.target_reflection,
            "targetCheckInFinalPerStratum": args.target_check_in_final_per_stratum,
        },
        "gapCount": len(gaps),
        "totalRequested": sum(gap.requested_count for gap in gaps),
        "gaps": [gap.__dict__ for gap in gaps],
    }


def load_api_key(env_path: Path) -> str | None:
    for key, value in os.environ.items():
        if is_openai_key_name(key) and value:
            return value
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or "=" not in stripped:
            continue
        if stripped.startswith("#"):
            stripped = stripped.lstrip("#").strip()
        key, value = stripped.split("=", 1)
        if is_openai_key_name(key.strip()):
            return value.strip().strip('"').strip("'")
    return None


def is_openai_key_name(name: str) -> bool:
    normalized = name.upper()
    return "OPENAI" in normalized and "API" in normalized and "KEY" in normalized


def load_cache(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def save_cache(path: Path, cache: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")


class DedupIndex:
    def __init__(self, rows: list[dict[str, Any]], args: argparse.Namespace) -> None:
        self.args = args
        self.canonical_hashes: set[str] = set()
        self.normalized_text_hashes: set[str] = set()
        self.scenario_hashes: set[str] = set()
        self.surface_ngrams: dict[str, list[set[str]]] = defaultdict(list)
        self.surface_tokens: dict[str, list[list[str]]] = defaultdict(list)
        for row in rows:
            self.add_existing(row)

    def add_existing(self, row: dict[str, Any]) -> None:
        input_payload = row.get("input", {})
        surface = str(input_payload.get("surface"))
        output = row.get("output", {})
        self.canonical_hashes.add(canonical_json_hash(input_payload, output))
        text = output_text(output)
        self.normalized_text_hashes.add(normalized_text_hash(text))
        tokens = tokenize(text)
        self.surface_ngrams[surface].append(ngrams(tokens, 5))
        self.surface_tokens[surface].append(tokens)
        scenario_seed = input_payload.get("metadata", {}).get("scenarioSeed")
        if scenario_seed:
            self.scenario_hashes.add(stable_hash(scenario_seed))

    def check(self, row: dict[str, Any]) -> dict[str, Any]:
        input_payload = row.get("input", {})
        surface = str(input_payload.get("surface"))
        output = row.get("output", {})
        text = output_text(output)
        canonical_hash = canonical_json_hash(input_payload, output)
        text_hash = normalized_text_hash(text)
        scenario_hash = stable_hash(input_payload.get("metadata", {}).get("scenarioSeed"))
        tokens = tokenize(text)
        candidate_ngrams = ngrams(tokens, 5)
        max_jaccard = 0.0
        for existing_ngrams in self.surface_ngrams.get(surface, []):
            max_jaccard = max(max_jaccard, jaccard(candidate_ngrams, existing_ngrams))
        max_rouge = 0.0
        for existing_tokens in self.surface_tokens.get(surface, []):
            max_rouge = max(max_rouge, rouge_l_tokens(tokens, existing_tokens))
        threshold = (
            self.args.ngram_threshold_short
            if len(tokens) < 80
            else self.args.ngram_threshold_long
        )
        return {
            "canonicalHash": canonical_hash,
            "normalizedTextHash": text_hash,
            "scenarioHash": scenario_hash,
            "exactDuplicate": canonical_hash in self.canonical_hashes,
            "textDuplicate": text_hash in self.normalized_text_hashes,
            "scenarioDuplicate": scenario_hash in self.scenario_hashes,
            "maxNgramJaccard": max_jaccard,
            "maxRougeL": max_rouge,
            "ngramThreshold": threshold,
            "rougeThreshold": self.args.rouge_threshold,
            "nearDuplicate": max_jaccard > threshold or max_rouge > self.args.rouge_threshold,
        }

    def add_accepted(self, row: dict[str, Any]) -> None:
        self.add_existing(row)


def generate_synthetic_rows(
    rows: list[dict[str, Any]],
    gaps: list[CoverageGap],
    args: argparse.Namespace,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    accepted: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    if not args.generate or args.max_accepted <= 0:
        return accepted, rejected

    api_key = load_api_key(args.env_path)
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY was not found in environment or env file")

    cache = load_cache(args.cache_path)
    dedup_index = DedupIndex(rows, args)
    exemplar_index = build_exemplar_index(rows)
    jobs = build_generation_jobs(gaps, args, exemplar_index)
    responses: dict[str, dict[str, Any]] = {}
    uncached_jobs: list[GenerationJob] = []

    for job in jobs:
        if job.cache_key in cache:
            responses[job.job_id] = cache[job.cache_key]
        else:
            uncached_jobs.append(job)

    if uncached_jobs:
        print(
            f"Submitting {len(uncached_jobs)} uncached generation requests "
            f"with concurrency={args.concurrency}, batch_size={args.batch_size}",
            flush=True,
        )
        with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as executor:
            future_to_job = {
                executor.submit(
                    call_openai_json,
                    api_key=api_key,
                    model=args.model,
                    reasoning_effort=args.reasoning_effort,
                    temperature=args.temperature,
                    prompt=job.prompt,
                    max_retries=args.max_retries,
                    timeout_seconds=args.request_timeout,
                ): job
                for job in uncached_jobs
            }
            completed = 0
            for future in as_completed(future_to_job):
                job = future_to_job[future]
                completed += 1
                try:
                    response_json = future.result()
                    responses[job.job_id] = response_json
                    cache[job.cache_key] = response_json
                except Exception as error:
                    rejected.append(
                        {
                            "gapId": job.gap.gap_id,
                            "reason": "generator_request_failed",
                            "error": str(error),
                        }
                    )
                if completed % 10 == 0 or completed == len(uncached_jobs):
                    save_cache(args.cache_path, cache)
                    print(
                        f"Completed {completed}/{len(uncached_jobs)} uncached generation requests"
                    )
        save_cache(args.cache_path, cache)

    accepted_by_gap: Counter[str] = Counter()
    for job in jobs:
        if len(accepted) >= args.max_accepted:
            break
        response_json = responses.get(job.job_id)
        if response_json is None:
            continue
        candidates = response_json.get("candidates")
        if not isinstance(candidates, list):
            rejected.append(
                {
                    "gapId": job.gap.gap_id,
                    "reason": "generator_response_missing_candidates",
                    "responseKeys": sorted(response_json.keys()),
                }
            )
            continue
        for index, candidate in enumerate(candidates):
            if len(accepted) >= args.max_accepted:
                break
            if accepted_by_gap[job.gap.gap_id] >= job.gap.requested_count:
                break
            scenario_seed = job.scenario_seeds[index % len(job.scenario_seeds)]
            decision = vet_candidate(
                candidate=candidate,
                gap=job.gap,
                scenario_seed=scenario_seed,
                generator_model=args.model,
                generator_prompt_hash=job.prompt_hash,
                rows=rows,
                dedup_index=dedup_index,
                args=args,
            )
            if decision.accepted and decision.row is not None:
                accepted.append(decision.row)
                accepted_by_gap[job.gap.gap_id] += 1
                dedup_index.add_accepted(decision.row)
            else:
                rejected.append(
                    {
                        "gapId": job.gap.gap_id,
                        "reason": decision.reason,
                        "rubricScore": decision.rubric_score,
                        "duplicateMetrics": decision.duplicate_metrics,
                        "qualityMetrics": decision.quality_metrics,
                    }
                )
    return accepted, rejected


def build_generation_jobs(
    gaps: list[CoverageGap],
    args: argparse.Namespace,
    exemplar_index: dict[str, list[dict[str, Any]]],
) -> list[GenerationJob]:
    jobs: list[GenerationJob] = []
    accepted_capacity = args.max_accepted
    for gap in gaps:
        if accepted_capacity <= 0:
            break
        remaining_for_gap = gap.requested_count
        seed_offset = gap.current_count
        while remaining_for_gap > 0 and accepted_capacity > 0:
            intended_accept_count = min(args.batch_size, remaining_for_gap, accepted_capacity)
            request_count = min(
                args.batch_size,
                math.ceil(intended_accept_count * args.oversample),
            )
            if request_count <= 0:
                break
            scenario_seeds = [
                build_scenario_seed(gap, sequence=seed_offset + index)
                for index in range(request_count)
            ]
            prompt = build_generation_prompt(gap, scenario_seeds, exemplar_index)
            prompt_hash = stable_hash({"model": args.model, "prompt": prompt})
            cache_key = f"{args.model}:{prompt_hash}"
            jobs.append(
                GenerationJob(
                    job_id=f"{gap.gap_id}:{seed_offset}:{len(jobs)}",
                    gap=gap,
                    scenario_seeds=scenario_seeds,
                    prompt=prompt,
                    prompt_hash=prompt_hash,
                    cache_key=cache_key,
                )
            )
            remaining_for_gap -= intended_accept_count
            accepted_capacity -= intended_accept_count
            seed_offset += request_count

    return jobs


def build_exemplar_index(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    index: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        surface = row.get("input", {}).get("surface")
        source = row.get("input", {}).get("metadata", {}).get("sourceLoraId")
        index[str(surface)].append(row)
        index[f"{surface}:{source}"].append(row)
    return index


def build_scenario_seed(gap: CoverageGap, sequence: int) -> dict[str, Any]:
    seed_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{gap.gap_id}:{sequence}"))
    base = {
        "scenarioId": seed_id,
        "surface": gap.surface,
        "sourceLoraId": gap.source_lora_id,
        "chunkNumber": gap.chunk_number,
        "medicationStatus": gap.medication_status,
        "trigger": gap.trigger,
        "finalTurn": gap.final_turn,
        "sequence": sequence,
    }
    if gap.surface == "reflection":
        intake = 4 + (sequence % 6)
        ending = max(1, intake - (1 + sequence % 4))
        base.update(
            {
                "intakeIntensity": intake,
                "endingIntensity": ending,
                "durationSeconds": 360 + 45 * (sequence % 8),
                "sessionsCount": 2 + sequence % 20,
                "usedSubstanceToday": sequence % 9 == 0,
            }
        )
    elif gap.surface == "phase_narration":
        base.update(
            {
                "intakeIntensity": 3 + (sequence % 7),
                "latestCravingScore": 2 + (sequence % 8),
                "usedSubstanceToday": sequence % 11 == 0,
            }
        )
    elif gap.surface == "check_in":
        base.update(
            {
                "currentIntensity": 3 + (sequence % 8),
                "scoreTrend": ["rising", "flat", "falling", "mixed"][sequence % 4],
                "obstacleCategory": sorted(OBSTACLE_CATEGORIES)[sequence % len(OBSTACLE_CATEGORIES)],
            }
        )
    return base


def build_generation_prompt(
    gap: CoverageGap,
    scenario_seeds: list[dict[str, Any]],
    exemplar_index: dict[str, list[dict[str, Any]]],
) -> str:
    exemplar_key = f"{gap.surface}:{gap.source_lora_id}"
    exemplars = exemplar_index.get(exemplar_key) or exemplar_index.get(gap.surface, [])
    exemplar_payloads = [
        {
            "input": {
                "surface": row.get("input", {}).get("surface"),
                "metadata": row.get("input", {}).get("metadata", {}),
            },
            "output": row.get("output", {}),
        }
        for row in exemplars[:4]
    ]
    return f"""Generate synthetic draft candidates for WAVE.

<coverage_gap>
{json.dumps(gap.__dict__, ensure_ascii=False, indent=2)}
</coverage_gap>

<scenario_seeds>
{json.dumps(scenario_seeds, ensure_ascii=False, indent=2)}
</scenario_seeds>

<source_exemplars>
{json.dumps(exemplar_payloads, ensure_ascii=False, indent=2)}
</source_exemplars>

<rules>
- Return JSON only with a top-level "candidates" array.
- Create one candidate per scenario seed.
- Do not copy exemplar wording. Keep WAVE's clinical voice.
- No toxic positivity. No shame. No medical advice. No crisis routing.
- The candidate input must match the scenario seed and the output must match the surface schema.
</rules>

<candidate_shapes>
phase_narration: {{"input":{{"surface":"phase_narration","chunkNumber":1,"intakeIntensity":7,"matType":"none","medicationStatus":"none","trigger":"stress","usedSubstanceToday":false}},"output":{{"lines":["... six strings ..."]}}}}
reflection: {{"input":{{"surface":"reflection","intakeIntensity":7,"endingIntensity":3,"durationSeconds":420,"medicationStatus":"on_time","matType":"buprenorphine","trigger":"stress","sessionsCount":4,"usedSubstanceToday":false,"scoreHistorySummary":"..."}},"output":{{"insight":"...","journalPromptQuestion":"...","nextSteps":{{"one":"...","two":"...","three":"...","four":"..."}}}}}}
check_in: {{"input":{{"surface":"check_in","chunkNumber":5,"intakeIntensity":7,"currentIntensity":4,"matType":"none","medicationStatus":"none","trigger":"stress","usedSubstanceToday":false,"scoreTrend":"falling","priorChunkSummary":"...","priorTranscript":"..."}},"priorTurns":[{{"role":"patient","content":"4"}}],"agentTurnNumber":1,"output":{{"reply":"...","endConversation":null}}}}
</candidate_shapes>"""


def call_openai_json(
    *,
    api_key: str,
    model: str,
    reasoning_effort: str,
    temperature: float,
    prompt: str,
    max_retries: int,
    timeout_seconds: int,
) -> dict[str, Any]:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": GENERATOR_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "response_format": {"type": "json_object"},
    }
    if temperature != 1.0:
        payload["temperature"] = temperature
    if reasoning_effort:
        payload["reasoning_effort"] = reasoning_effort
    request = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    last_error: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                raw = json.loads(response.read().decode("utf-8"))
            content = raw["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            if isinstance(parsed, dict):
                return parsed
            raise ValueError("OpenAI response JSON was not an object")
        except urllib.error.HTTPError as error:
            last_error = error
            body = error.read().decode("utf-8", errors="replace")[:1000]
            last_error = RuntimeError(f"HTTP {error.code}: {body}")
            if attempt >= max_retries:
                break
            retry_after = error.headers.get("Retry-After")
            if retry_after:
                try:
                    sleep_seconds = float(retry_after)
                except ValueError:
                    sleep_seconds = 2.0 * (attempt + 1)
            else:
                sleep_seconds = min(30.0, 2.0 * (attempt + 1))
            time.sleep(sleep_seconds)
        except (urllib.error.URLError, json.JSONDecodeError, KeyError, ValueError) as error:
            last_error = error
            if attempt >= max_retries:
                break
            time.sleep(min(30.0, 2.0 * (attempt + 1)))
    raise RuntimeError(f"OpenAI generation failed after retries: {last_error}")


def vet_candidate(
    *,
    candidate: Any,
    gap: CoverageGap,
    scenario_seed: dict[str, Any],
    generator_model: str,
    generator_prompt_hash: str,
    rows: list[dict[str, Any]],
    dedup_index: DedupIndex,
    args: argparse.Namespace,
) -> CandidateDecision:
    if not isinstance(candidate, dict):
        return reject("candidate_not_object")
    try:
        row = normalize_candidate_row(
            candidate=candidate,
            gap=gap,
            scenario_seed=scenario_seed,
            generator_model=generator_model,
            generator_prompt_hash=generator_prompt_hash,
        )
    except Exception as error:
        return reject(f"normalization_failed:{error}")

    duplicate_metrics = dedup_index.check(row)
    if (
        duplicate_metrics["exactDuplicate"]
        or duplicate_metrics["textDuplicate"]
        or duplicate_metrics["scenarioDuplicate"]
        or duplicate_metrics["nearDuplicate"]
    ):
        return CandidateDecision(
            accepted=False,
            reason="duplicate_or_near_duplicate",
            rubric_score=0,
            row=None,
            duplicate_metrics=duplicate_metrics,
            quality_metrics={},
        )

    quality_metrics = score_quality(row, rows)
    if quality_metrics["errors"]:
        return CandidateDecision(
            accepted=False,
            reason="quality_errors",
            rubric_score=quality_metrics["rubricScore"],
            row=None,
            duplicate_metrics=duplicate_metrics,
            quality_metrics=quality_metrics,
        )
    if quality_metrics["rubricScore"] < args.min_rubric_score:
        return CandidateDecision(
            accepted=False,
            reason="rubric_score_below_threshold",
            rubric_score=quality_metrics["rubricScore"],
            row=None,
            duplicate_metrics=duplicate_metrics,
            quality_metrics=quality_metrics,
        )
    return CandidateDecision(
        accepted=True,
        reason="accepted",
        rubric_score=quality_metrics["rubricScore"],
        row=row,
        duplicate_metrics=duplicate_metrics,
        quality_metrics=quality_metrics,
    )


def reject(reason: str) -> CandidateDecision:
    return CandidateDecision(
        accepted=False,
        reason=reason,
        rubric_score=0,
        row=None,
        duplicate_metrics={},
        quality_metrics={},
    )


def normalize_candidate_row(
    *,
    candidate: dict[str, Any],
    gap: CoverageGap,
    scenario_seed: dict[str, Any],
    generator_model: str,
    generator_prompt_hash: str,
) -> dict[str, Any]:
    input_payload = candidate.get("input")
    output_payload = candidate.get("output")
    if not isinstance(input_payload, dict) or not isinstance(output_payload, dict):
        raise ValueError("candidate input/output must be objects")
    input_payload = dict(input_payload)
    output_payload = dict(output_payload)
    input_payload["surface"] = gap.surface
    input_payload["medicationStatus"] = gap.medication_status
    input_payload["trigger"] = gap.trigger
    input_payload["matType"] = mat_type_for_medication(gap.medication_status)
    input_payload.setdefault("usedSubstanceToday", bool(scenario_seed.get("usedSubstanceToday", False)))
    if gap.chunk_number is not None:
        input_payload["chunkNumber"] = gap.chunk_number

    metadata = {
        "sourceFile": "synthetic",
        "sourceLine": None,
        "sourceRowId": scenario_seed["scenarioId"],
        "sourceLoraId": gap.source_lora_id,
        "sourceStatus": "synthetic_draft",
        "derivedKind": f"synthetic_{gap.surface}",
        "chunkNumber": gap.chunk_number,
        "medicationStatus": gap.medication_status,
        "trigger": gap.trigger,
        "cleanupNotes": [],
        "scenarioSeed": scenario_seed,
        "sourceCoverageGap": gap.__dict__,
        "generatorModel": generator_model,
        "generatorPromptHash": generator_prompt_hash,
    }

    if gap.surface == "phase_narration":
        input_payload.setdefault("intakeIntensity", scenario_seed.get("intakeIntensity", 7))
        prompt = build_phase_prompt(input_payload)
    elif gap.surface == "reflection":
        input_payload.setdefault("intakeIntensity", scenario_seed.get("intakeIntensity", 7))
        input_payload.setdefault("endingIntensity", scenario_seed.get("endingIntensity", 3))
        input_payload.setdefault("durationSeconds", scenario_seed.get("durationSeconds", 420))
        input_payload.setdefault("sessionsCount", scenario_seed.get("sessionsCount", 3))
        input_payload.setdefault(
            "scoreHistorySummary",
            f"intake {input_payload['intakeIntensity']}, ending {input_payload['endingIntensity']}.",
        )
        prompt = build_reflection_prompt(input_payload)
    elif gap.surface == "check_in":
        input_payload.setdefault("intakeIntensity", 7)
        input_payload.setdefault("currentIntensity", scenario_seed.get("currentIntensity", 5))
        input_payload.setdefault("scoreTrend", scenario_seed.get("scoreTrend", "flat"))
        input_payload.setdefault("priorChunkSummary", "The prior chunk invited observing the urge without forcing it to change.")
        prior_turns = candidate.get("priorTurns")
        if not isinstance(prior_turns, list):
            prior_turns = [{"role": "patient", "content": str(input_payload.get("currentIntensity", 5))}]
        agent_turn_number = int(candidate.get("agentTurnNumber") or 1)
        metadata["agentTurnNumber"] = agent_turn_number
        metadata["isFinalAgentTurn"] = bool(gap.final_turn)
        metadata["sourceDialogueTurnIndex"] = None
        prompt = build_check_in_prompt(
            lora_id=gap.source_lora_id,
            input_payload=input_payload,
            clinician_instructions="Synthetic draft must preserve WAVE check-in protocol and avoid medication directives.",
            prior_turns=prior_turns,
            agent_turn_number=agent_turn_number,
        )
    else:
        raise ValueError(f"unsupported surface {gap.surface}")

    split_key = build_split_key(gap.surface, metadata)
    return build_prepared_row(
        example_id=stable_uuid({"scenarioSeed": scenario_seed, "output": output_payload}),
        surface=gap.surface,
        prompt=prompt,
        output_payload=output_payload,
        metadata=metadata,
        split_key=split_key,
    )


def mat_type_for_medication(status: str) -> str:
    if status == "none":
        return "none"
    return "buprenorphine"


def score_quality(row: dict[str, Any], original_rows: list[dict[str, Any]]) -> dict[str, Any]:
    input_payload = row.get("input", {})
    surface = input_payload.get("surface")
    metadata = input_payload.get("metadata", {})
    output = row.get("output", {})
    errors: list[str] = []
    if surface == "phase_narration":
        errors.extend(validate_phase_output(output))
    elif surface == "reflection":
        errors.extend(validate_reflection_output(output))
    elif surface == "check_in":
        errors.extend(validate_check_in_output(output))
        final_turn = bool(metadata.get("isFinalAgentTurn"))
        if final_turn and not isinstance(output.get("endConversation"), dict):
            errors.append("final synthetic check-in turn must include endConversation")
        if not final_turn and output.get("endConversation") is not None:
            errors.append("intermediate synthetic check-in turn must not end conversation")
    else:
        errors.append(f"unsupported surface {surface}")
    errors.extend(validate_common_output(output))
    text = output_text(output)
    if GENERIC_PHRASES_RE.search(text):
        errors.append("generic unsupported phrase detected")
    if SHAME_RE.search(text):
        errors.append("shame or relapse framing detected")
    if CRISIS_ROUTING_RE.search(text):
        errors.append("crisis routing appeared in synthetic row")

    original_lengths = [
        len(output_text(original.get("output", {})))
        for original in original_rows
        if original.get("input", {}).get("surface") == surface
    ]
    candidate_length = len(text)
    distribution_pass = distribution_length_pass(candidate_length, original_lengths)
    if not distribution_pass:
        errors.append("output length drifted outside original surface tolerance")

    rubric_score = 100
    rubric_score -= 35 if errors else 0
    rubric_score -= 15 if not distribution_pass else 0
    rubric_score -= 10 if not re.search(r"\b(you|your|yourself|you're|you've|you'll)\b", text, re.I) else 0
    rubric_score = max(0, rubric_score)
    return {
        "rubricScore": rubric_score,
        "errors": errors,
        "candidateOutputLength": candidate_length,
        "surfaceLengthStats": describe_numbers(original_lengths),
        "distributionLengthPass": distribution_pass,
        "adversarialSafetyFlags": [error for error in errors if "crisis" in error or "shame" in error or "generic" in error],
    }


def distribution_length_pass(candidate_length: int, original_lengths: list[int]) -> bool:
    if not original_lengths:
        return True
    stats = describe_numbers(original_lengths)
    lower = max(20, stats["p5"] * 0.5)
    upper = stats["p95"] * 1.5
    return lower <= candidate_length <= upper


def output_text(output: dict[str, Any]) -> str:
    parts: list[str] = []
    for value in output.values():
        if isinstance(value, str):
            parts.append(value)
        elif isinstance(value, list):
            parts.extend(item for item in value if isinstance(item, str))
        elif isinstance(value, dict):
            parts.extend(str(item) for item in value.values() if isinstance(item, str))
    return " ".join(parts)


def canonical_json_hash(input_payload: dict[str, Any], output_payload: dict[str, Any]) -> str:
    metadata = dict(input_payload.get("metadata", {}))
    for volatile_key in (
        "sourceFile",
        "sourceLine",
        "sourceRowId",
        "createdAt",
        "generatorPromptHash",
    ):
        metadata.pop(volatile_key, None)
    stable_payload = {
        "surface": input_payload.get("surface"),
        "metadata": metadata,
        "output": output_payload,
    }
    return stable_hash(stable_payload)


def normalized_text_hash(text: str) -> str:
    normalized = PUNCT_RE.sub(" ", text.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def stable_hash(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def stable_uuid(value: Any) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, stable_hash(value)))


def tokenize(text: str) -> list[str]:
    return WORD_RE.findall(text.lower())


def ngrams(tokens: list[str], size: int) -> set[str]:
    if len(tokens) < size:
        return {" ".join(tokens)} if tokens else set()
    return {" ".join(tokens[index : index + size]) for index in range(len(tokens) - size + 1)}


def jaccard(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def rouge_l_tokens(left: list[str], right: list[str]) -> float:
    if not left or not right:
        return 0.0
    lcs = lcs_length(left, right)
    precision = lcs / len(left)
    recall = lcs / len(right)
    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def lcs_length(left: list[str], right: list[str]) -> int:
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


def describe_numbers(values: list[int]) -> dict[str, float]:
    if not values:
        return {"count": 0, "min": 0, "p5": 0, "median": 0, "p95": 0, "max": 0, "mean": 0}
    sorted_values = sorted(float(value) for value in values)
    return {
        "count": len(sorted_values),
        "min": sorted_values[0],
        "p5": percentile(sorted_values, 0.05),
        "median": percentile(sorted_values, 0.5),
        "p95": percentile(sorted_values, 0.95),
        "max": sorted_values[-1],
        "mean": sum(sorted_values) / len(sorted_values),
    }


def percentile(sorted_values: list[float], q: float) -> float:
    if len(sorted_values) == 1:
        return sorted_values[0]
    position = (len(sorted_values) - 1) * q
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return sorted_values[lower]
    weight = position - lower
    return sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight


def build_report(
    *,
    rows: list[dict[str, Any]],
    gaps: list[CoverageGap],
    accepted: list[dict[str, Any]],
    rejected: list[dict[str, Any]],
    args: argparse.Namespace,
) -> dict[str, Any]:
    return {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "sourceData": str(args.data),
        "generatorModel": args.model,
        "generationCalled": bool(args.generate and args.max_accepted > 0),
        "counts": {
            "originalRows": len(rows),
            "coverageGaps": len(gaps),
            "totalRequestedByCoveragePlan": sum(gap.requested_count for gap in gaps),
            "acceptedSyntheticRows": len(accepted),
            "rejectedCandidates": len(rejected),
            "expandedRows": len(rows) + len(accepted),
        },
        "acceptedBySurface": dict(
            sorted(Counter(row.get("input", {}).get("surface") for row in accepted).items())
        ),
        "rejectionReasons": dict(sorted(Counter(item.get("reason") for item in rejected).items())),
        "sampleRejections": rejected[:10],
        "qualityThresholds": {
            "minRubricScore": args.min_rubric_score,
            "ngramThresholdShort": args.ngram_threshold_short,
            "ngramThresholdLong": args.ngram_threshold_long,
            "rougeThreshold": args.rouge_threshold,
        },
        "limitations": [
            "Synthetic rows are clinical-adjacent drafts, not clinician-approved content.",
            "Uniqueness is enforced by exact and near-duplicate gates, but semantic uniqueness cannot be proven absolutely.",
            "The frozen final test split should remain clinician-source only where possible.",
        ],
    }


def write_quality_audit(
    path: Path,
    report: dict[str, Any],
    gaps: list[CoverageGap],
) -> None:
    lines = [
        "# WAVE Synthetic Data Quality Audit",
        "",
        f"Generated: {report['createdAt']}",
        "",
        "## Purpose",
        "",
        "This document records how synthetic WAVE training rows are generated, filtered, and labeled. Synthetic rows are not treated as clinician-authored data.",
        "",
        "## Medical-Quality Matching Method",
        "",
        "- Source-grounded prompts include same-surface examples, WAVE tone rules, medication boundaries, and output schemas.",
        "- Deterministic validators enforce schema, safety, medication-directive, and surface-invariant rules.",
        "- Duplicate gates reject exact JSON duplicates, normalized text duplicates, scenario duplicates, high n-gram overlap, and high ROUGE-L overlap.",
        "- Rubric scoring requires trauma-informed voice, no shame, no toxic positivity, no medical advice, no crisis routing, and distributional length fit.",
        "- Synthetic rows remain `synthetic_draft` and must be disclosed separately in training reports.",
        "",
        "## Thresholds",
        "",
        f"- Minimum rubric score: `{report['qualityThresholds']['minRubricScore']}`",
        f"- Short n-gram Jaccard threshold: `{report['qualityThresholds']['ngramThresholdShort']}`",
        f"- Long n-gram Jaccard threshold: `{report['qualityThresholds']['ngramThresholdLong']}`",
        f"- ROUGE-L threshold: `{report['qualityThresholds']['rougeThreshold']}`",
        "",
        "## Counts",
        "",
        f"- Original rows: `{report['counts']['originalRows']}`",
        f"- Coverage gaps: `{report['counts']['coverageGaps']}`",
        f"- Requested by coverage plan: `{report['counts']['totalRequestedByCoveragePlan']}`",
        f"- Accepted synthetic rows: `{report['counts']['acceptedSyntheticRows']}`",
        f"- Rejected candidates: `{report['counts']['rejectedCandidates']}`",
        f"- Expanded rows: `{report['counts']['expandedRows']}`",
        "",
        "## Accepted By Surface",
        "",
        f"`{json.dumps(report['acceptedBySurface'], sort_keys=True)}`",
        "",
        "## Rejection Reasons",
        "",
        f"`{json.dumps(report['rejectionReasons'], sort_keys=True)}`",
        "",
        "## Coverage Plan Snapshot",
        "",
        f"- First 20 gaps: `{json.dumps([gap.__dict__ for gap in gaps[:20]], sort_keys=True)}`",
        "",
        "## Limitations",
        "",
    ]
    lines.extend(f"- {item}" for item in report["limitations"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    args = parse_args()
    rows = read_jsonl(args.data)
    gaps = build_coverage_plan(rows, args)
    write_json(args.coverage_plan_output, coverage_plan_json(gaps, args))

    accepted, rejected = generate_synthetic_rows(rows, gaps, args)
    write_jsonl(args.synthetic_output, accepted)
    expanded_rows = [*rows, *accepted]
    write_jsonl(args.expanded_output, expanded_rows)
    report = build_report(rows=rows, gaps=gaps, accepted=accepted, rejected=rejected, args=args)
    write_json(args.report_output, report)
    write_quality_audit(args.quality_audit_output, report, gaps)

    print(f"Wrote coverage plan to {args.coverage_plan_output}")
    print(f"Wrote {len(accepted)} accepted synthetic rows to {args.synthetic_output}")
    print(f"Wrote expanded dataset with {len(expanded_rows)} rows to {args.expanded_output}")
    print(f"Wrote report to {args.report_output}")
    print(f"Wrote quality audit to {args.quality_audit_output}")


if __name__ == "__main__":
    main()
