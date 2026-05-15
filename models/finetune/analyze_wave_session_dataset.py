"""Exploratory data analysis for the unified WAVE session LoRA dataset."""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from prepare_wave_session_dataset import DEFAULT_OUTPUT, DEFAULT_SOURCE_FILES


DEFAULT_JSON_OUTPUT = Path("datasets/lora-wave-session-eda.json")
DEFAULT_MARKDOWN_OUTPUT = Path("datasets/lora-wave-session-eda.md")

TOXIC_POSITIVITY_RE = re.compile(
    r"\b(you'?ve got this|you got this|stay strong|don'?t give up)\b",
    re.IGNORECASE,
)
MEDICAL_DIRECTIVE_RE = re.compile(
    r"\b(?:start|stop|change|increase|decrease|double|skip)\s+"
    r"(?:your\s+|the\s+)?(?:dose|dosage|medication|medicine|meds)\b",
    re.IGNORECASE,
)
DASH_RE = re.compile(r"[\u2013\u2014]")
REPLACEMENT_CHAR_RE = re.compile("\ufffd")
WORD_RE = re.compile(r"[A-Za-z0-9']+")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyze raw and normalized WAVE session LoRA datasets.",
    )
    parser.add_argument(
        "--normalized",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Normalized lora-wave-session JSONL path.",
    )
    parser.add_argument(
        "--source",
        action="append",
        type=Path,
        default=None,
        help="Raw source JSONL path. Repeat to override defaults.",
    )
    parser.add_argument("--json-output", type=Path, default=DEFAULT_JSON_OUTPUT)
    parser.add_argument("--markdown-output", type=Path, default=DEFAULT_MARKDOWN_OUTPUT)
    return parser.parse_args()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as file_handle:
        for line_number, line in enumerate(file_handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                row = json.loads(stripped)
            except json.JSONDecodeError as error:
                raise ValueError(f"{path}:{line_number}: invalid JSON: {error}") from error
            if not isinstance(row, dict):
                raise ValueError(f"{path}:{line_number}: row must be an object")
            rows.append(row)
    return rows


def summarize_raw_sources(source_files: list[Path]) -> dict[str, Any]:
    summaries: dict[str, Any] = {}
    aggregate = {
        "rows": 0,
        "byLoraId": Counter(),
        "byStatus": Counter(),
        "byMedicationStatus": Counter(),
        "byTrigger": Counter(),
        "byChunkNumber": Counter(),
        "dialogueTurnCounts": Counter(),
        "agentReplyLengths": [],
        "phaseLineLengths": [],
        "reflectionInsightLengths": [],
        "issueCounts": Counter(),
    }

    for source_path in source_files:
        rows = read_jsonl(source_path)
        summary = {
            "rows": len(rows),
            "byLoraId": Counter(),
            "byStatus": Counter(),
            "byMedicationStatus": Counter(),
            "byTrigger": Counter(),
            "byChunkNumber": Counter(),
            "dialogueTurnCounts": Counter(),
            "agentReplyLengths": [],
            "phaseLineLengths": [],
            "reflectionInsightLengths": [],
            "issueCounts": Counter(),
            "inputFieldCoverage": Counter(),
            "outputFieldCoverage": Counter(),
        }

        for row in rows:
            lora_id = str(row.get("loraId"))
            status = str(row.get("status"))
            input_payload = row.get("input") if isinstance(row.get("input"), dict) else {}
            output_payload = row.get("output") if isinstance(row.get("output"), dict) else {}

            summary["byLoraId"][lora_id] += 1
            summary["byStatus"][status] += 1
            summary["byMedicationStatus"][str(input_payload.get("medicationStatus"))] += 1
            summary["byTrigger"][str(input_payload.get("trigger"))] += 1
            summary["byChunkNumber"][str(input_payload.get("chunkNumber"))] += 1
            summary["inputFieldCoverage"].update(input_payload.keys())
            summary["outputFieldCoverage"].update(output_payload.keys())

            text = json.dumps(output_payload, ensure_ascii=False)
            if DASH_RE.search(text):
                summary["issueCounts"]["dash_chars"] += 1
            if REPLACEMENT_CHAR_RE.search(text):
                summary["issueCounts"]["replacement_chars"] += 1
            if TOXIC_POSITIVITY_RE.search(text):
                summary["issueCounts"]["toxic_regex"] += 1
            if MEDICAL_DIRECTIVE_RE.search(text):
                summary["issueCounts"]["medical_directive_regex"] += 1

            turns = output_payload.get("dialogueTurns")
            if isinstance(turns, list):
                summary["dialogueTurnCounts"][str(len(turns))] += 1
                for turn in turns:
                    if isinstance(turn, dict) and turn.get("role") == "agent":
                        content = turn.get("content")
                        if isinstance(content, str):
                            summary["agentReplyLengths"].append(len(content))
            lines = output_payload.get("lines")
            if isinstance(lines, list):
                summary["phaseLineLengths"].extend(len(line) for line in lines if isinstance(line, str))
            insight = output_payload.get("insight")
            if isinstance(insight, str):
                summary["reflectionInsightLengths"].append(len(insight))

        for key in (
            "rows",
            "byLoraId",
            "byStatus",
            "byMedicationStatus",
            "byTrigger",
            "byChunkNumber",
            "dialogueTurnCounts",
            "agentReplyLengths",
            "phaseLineLengths",
            "reflectionInsightLengths",
            "issueCounts",
        ):
            merge_aggregate(aggregate, key, summary[key])

        summaries[str(source_path)] = make_json_safe(summary)

    return {
        "aggregate": make_json_safe(aggregate),
        "files": summaries,
    }


def merge_aggregate(target: dict[str, Any], key: str, value: Any) -> None:
    if isinstance(value, Counter):
        target[key].update(value)
    elif isinstance(value, list):
        target[key].extend(value)
    elif isinstance(value, int):
        target[key] += value


def summarize_normalized(rows: list[dict[str, Any]]) -> dict[str, Any]:
    by_surface = Counter()
    by_source_lora = Counter()
    by_status = Counter()
    by_trigger = Counter()
    by_medication = Counter()
    by_chunk = Counter()
    by_derived_kind = Counter()
    by_final_turn = Counter()
    by_split_key = Counter()
    cleanup_notes = Counter()
    prompt_lengths: list[int] = []
    prompt_word_counts: list[int] = []
    output_lengths: list[int] = []
    examples_per_source_row = Counter()
    grid: dict[str, Counter[str]] = defaultdict(Counter)
    schema_shape = Counter()

    for row in rows:
        input_payload = row.get("input") if isinstance(row.get("input"), dict) else {}
        output_payload = row.get("output") if isinstance(row.get("output"), dict) else {}
        metadata = input_payload.get("metadata") if isinstance(input_payload.get("metadata"), dict) else {}
        surface = str(input_payload.get("surface"))
        source_lora = str(metadata.get("sourceLoraId"))
        trigger = str(metadata.get("trigger"))
        medication = str(metadata.get("medicationStatus"))
        chunk = str(metadata.get("chunkNumber"))
        source_row_id = str(metadata.get("sourceRowId"))

        by_surface[surface] += 1
        by_source_lora[source_lora] += 1
        by_status[str(metadata.get("sourceStatus"))] += 1
        by_trigger[trigger] += 1
        by_medication[medication] += 1
        by_chunk[chunk] += 1
        by_derived_kind[str(metadata.get("derivedKind"))] += 1
        by_final_turn[str(metadata.get("isFinalAgentTurn"))] += 1
        by_split_key[str(row.get("splitKey"))] += 1
        grid[source_lora][f"{medication}|{trigger}"] += 1
        examples_per_source_row[f"{source_lora}:{source_row_id}"] += 1
        cleanup_notes.update(metadata.get("cleanupNotes", []))

        prompt = str(input_payload.get("prompt", ""))
        output_text = json.dumps(output_payload, ensure_ascii=False)
        prompt_lengths.append(len(prompt))
        prompt_word_counts.append(len(WORD_RE.findall(prompt)))
        output_lengths.append(len(output_text))
        schema_shape.update(output_payload.keys())

    return {
        "rows": len(rows),
        "bySurface": dict(sorted(by_surface.items())),
        "bySourceLoraId": dict(sorted(by_source_lora.items())),
        "bySourceStatus": dict(sorted(by_status.items())),
        "byMedicationStatus": dict(sorted(by_medication.items())),
        "byTrigger": dict(sorted(by_trigger.items())),
        "byChunkNumber": dict(sorted(by_chunk.items())),
        "byDerivedKind": dict(sorted(by_derived_kind.items())),
        "byFinalTurnFlag": dict(sorted(by_final_turn.items())),
        "splitKeyCount": len(by_split_key),
        "splitKeySizeStats": describe_numbers(list(by_split_key.values())),
        "examplesPerSourceRowStats": describe_numbers(list(examples_per_source_row.values())),
        "promptLengthChars": describe_numbers(prompt_lengths),
        "promptLengthWords": describe_numbers(prompt_word_counts),
        "outputLengthChars": describe_numbers(output_lengths),
        "schemaShapeKeyCounts": dict(sorted(schema_shape.items())),
        "topCleanupNotes": dict(cleanup_notes.most_common(30)),
        "coverageGrid": {key: dict(sorted(value.items())) for key, value in sorted(grid.items())},
        "largestSplitKeys": dict(by_split_key.most_common(20)),
        "smallestSplitKeys": dict(sorted(by_split_key.items(), key=lambda item: item[1])[:20]),
    }


def describe_numbers(values: list[int | float]) -> dict[str, float]:
    if not values:
        return {
            "count": 0,
            "min": 0,
            "p25": 0,
            "median": 0,
            "p75": 0,
            "p95": 0,
            "max": 0,
            "mean": 0,
        }
    sorted_values = sorted(float(value) for value in values)
    return {
        "count": len(sorted_values),
        "min": sorted_values[0],
        "p25": percentile(sorted_values, 0.25),
        "median": percentile(sorted_values, 0.50),
        "p75": percentile(sorted_values, 0.75),
        "p95": percentile(sorted_values, 0.95),
        "max": sorted_values[-1],
        "mean": sum(sorted_values) / len(sorted_values),
    }


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


def make_json_safe(value: Any) -> Any:
    if isinstance(value, Counter):
        return dict(sorted(value.items()))
    if isinstance(value, dict):
        return {str(key): make_json_safe(entry) for key, entry in value.items()}
    if isinstance(value, list):
        if value and all(isinstance(item, (int, float)) for item in value):
            return describe_numbers(value)
        return [make_json_safe(item) for item in value]
    return value


def build_findings(raw_summary: dict[str, Any], normalized_summary: dict[str, Any]) -> list[str]:
    findings: list[str] = []
    normalized_rows = normalized_summary["rows"]
    surface_counts = normalized_summary["bySurface"]
    check_in_count = int(surface_counts.get("check_in", 0))
    if normalized_rows:
        check_in_share = check_in_count / normalized_rows
        if check_in_share > 0.85:
            findings.append(
                f"Check-in turn examples dominate the normalized set ({check_in_count}/{normalized_rows}, {check_in_share:.1%}). Use stratified splitting and consider sampling weights if validation is overly check-in-driven."
            )
    raw_issues = raw_summary["aggregate"].get("issueCounts", {})
    if raw_issues.get("dash_chars", 0):
        findings.append(
            f"Raw outputs contain dash punctuation in {raw_issues['dash_chars']} rows; normalization replaces those because the app strips em/en dashes."
        )
    if raw_issues.get("replacement_chars", 0):
        findings.append(
            f"Raw outputs contain replacement characters in {raw_issues['replacement_chars']} rows; inspect source encoding if generated copy looks odd."
        )
    status_counts = normalized_summary.get("bySourceStatus", {})
    draft_count = int(status_counts.get("draft", 0))
    if draft_count:
        findings.append(
            f"{draft_count} normalized examples come from draft source rows. This is acceptable for the experiment but should be named clearly in results."
        )
    split_key_stats = normalized_summary.get("splitKeySizeStats", {})
    if split_key_stats.get("min") == 1:
        findings.append(
            "Some split strata contain a single example, so the splitter will need a deterministic fallback for tiny strata."
        )
    return findings


def write_markdown(
    path: Path,
    raw_summary: dict[str, Any],
    normalized_summary: dict[str, Any],
    findings: list[str],
) -> None:
    lines = [
        "# WAVE Session LoRA EDA",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "## High-Level Findings",
        "",
    ]
    lines.extend(f"- {finding}" for finding in findings)
    if not findings:
        lines.append("- No major data quality warnings found.")
    lines.extend(
        [
            "",
            "## Normalized Dataset",
            "",
            f"- Rows: {normalized_summary['rows']}",
            f"- By surface: `{json.dumps(normalized_summary['bySurface'], sort_keys=True)}`",
            f"- By source LoRA: `{json.dumps(normalized_summary['bySourceLoraId'], sort_keys=True)}`",
            f"- By source status: `{json.dumps(normalized_summary['bySourceStatus'], sort_keys=True)}`",
            f"- Split-key count: {normalized_summary['splitKeyCount']}",
            f"- Prompt length stats (words): `{json.dumps(normalized_summary['promptLengthWords'], sort_keys=True)}`",
            f"- Output length stats (chars): `{json.dumps(normalized_summary['outputLengthChars'], sort_keys=True)}`",
            "",
            "## Raw Source Dataset",
            "",
            f"- Rows: {raw_summary['aggregate']['rows']}",
            f"- By LoRA: `{json.dumps(raw_summary['aggregate']['byLoraId'], sort_keys=True)}`",
            f"- By status: `{json.dumps(raw_summary['aggregate']['byStatus'], sort_keys=True)}`",
            f"- Raw issue counts: `{json.dumps(raw_summary['aggregate']['issueCounts'], sort_keys=True)}`",
            "",
            "## Cleanup Notes",
            "",
            f"`{json.dumps(normalized_summary['topCleanupNotes'], sort_keys=True)}`",
            "",
            "## Split Readiness",
            "",
            f"- Largest split keys: `{json.dumps(normalized_summary['largestSplitKeys'], sort_keys=True)}`",
            f"- Smallest split keys: `{json.dumps(normalized_summary['smallestSplitKeys'], sort_keys=True)}`",
            "",
            "The full machine-readable report is in `datasets/lora-wave-session-eda.json`.",
        ]
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    args = parse_args()
    source_files = args.source or DEFAULT_SOURCE_FILES
    raw_summary = summarize_raw_sources(source_files)
    normalized_rows = read_jsonl(args.normalized)
    normalized_summary = summarize_normalized(normalized_rows)
    findings = build_findings(raw_summary, normalized_summary)

    report = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "rawSources": raw_summary,
        "normalized": normalized_summary,
        "findings": findings,
    }

    args.json_output.parent.mkdir(parents=True, exist_ok=True)
    args.json_output.write_text(
        json.dumps(report, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    write_markdown(args.markdown_output, raw_summary, normalized_summary, findings)
    print(f"Wrote EDA JSON to {args.json_output}")
    print(f"Wrote EDA summary to {args.markdown_output}")
    for finding in findings:
        print(f"- {finding}")


if __name__ == "__main__":
    main()
