"""Prepare the unified WAVE session LoRA dataset.

This normalizes the clinician seed files for the hackathon `lora-wave-session`
adapter into one input/output JSON-mode contract:

    {"input": {"prompt": "...", "metadata": {...}}, "output": {...}}

Check-in transcripts are expanded into one supervised example per agent turn.
That is the standard next-turn instruction-tuning shape for conversations: the
prompt contains the surface rules, patient context, and prior dialogue; the
target is only the next agent turn as strict JSON.
"""

from __future__ import annotations

import argparse
import json
import re
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEMO_LORA_ID = "lora-wave-session"
DEFAULT_OUTPUT = Path("datasets/lora-wave-session-normalized.jsonl")
DEFAULT_SUMMARY_OUTPUT = Path("datasets/lora-wave-session-normalized-summary.json")

DEFAULT_SOURCE_FILES = [
    Path(r"C:\Users\Bill\Downloads\lora-check-in-1-clinician.jsonl"),
    Path(r"C:\Users\Bill\Downloads\lora-check-in-2-clinician (1).jsonl"),
    Path(r"C:\Users\Bill\Downloads\lora-check-in-3-clinician (1).jsonl"),
    Path(r"C:\Users\Bill\Downloads\lora-check-in-4-clinician.jsonl"),
    Path(r"C:\Users\Bill\Downloads\lora-check-in-5-clinician.jsonl"),
    Path(r"C:\Users\Bill\Downloads\lora-reflection-clinician.jsonl"),
    Path("datasets/lora-phase-narration-expanded.jsonl"),
]

CHECK_IN_LORA_IDS = {
    "lora-check-in-1",
    "lora-check-in-2",
    "lora-check-in-3",
    "lora-check-in-4",
    "lora-check-in-5",
}
SUPPORTED_LORA_IDS = {
    "lora-phase-narration",
    *CHECK_IN_LORA_IDS,
    "lora-reflection",
}
MAT_TYPES = {"buprenorphine", "naltrexone", "methadone", "vivitrol", "none"}
MEDICATION_STATUSES = {"on_time", "late", "missed", "none"}
TRIGGERS = {"social", "stress", "physical", "unknown", "other"}
OBSTACLE_CATEGORIES = {
    "cannot_visualize",
    "mind_wandering",
    "urge_overwhelming",
    "breath_tight",
    "breath_anxiety",
    "gave_in",
    "guilt_failure",
    "physical_discomfort",
    "sleepiness",
}
SCORE_TRENDS = {"not_started", "rising", "flat", "falling", "mixed"}

CHUNK_LINE_COUNT = 6
MIN_LINE_LENGTH = 12
MAX_LINE_LENGTH = 200
CHECK_IN_MAX_REPLY_LENGTH = 900

TOXIC_POSITIVITY_RE = re.compile(
    r"\b(you'?ve got this|you got this|stay strong|don'?t give up)\b",
    re.IGNORECASE,
)
STAGE_DIRECTION_RE = re.compile(
    r"[\[\]]|\((?:pause|breathe|inhale|exhale)\)|stage direction",
    re.IGNORECASE,
)
PHASE_ANNOUNCEMENT_RE = re.compile(r"\b(?:chunk|phase)\s+\d\b", re.IGNORECASE)
MEDICAL_DIRECTIVE_RE = re.compile(
    r"\b(?:start|stop|change|increase|decrease|double|skip)\s+"
    r"(?:your\s+|the\s+)?(?:dose|dosage|medication|medicine|meds)\b",
    re.IGNORECASE,
)
MARKDOWN_OR_BULLET_RE = re.compile(r"(^|\n)\s*(?:#{1,6}\s|[-*]\s|\d+\.\s)")

WAVE_JSON_SYSTEM_PROMPT = """You are WAVE, an on-device urge surfing companion for people in Substance Use Disorder recovery.

Write patient-facing support for a structured urge surfing session.
The tone is trauma-informed, calm, concrete, nonjudgmental, and unhurried.
Do not prescribe medication. Do not tell the patient to start, stop, change, increase, decrease, double, or skip a dose.
Do not provide crisis routing. Safety routing is handled by code outside the model.
Return only strict JSON matching the output schema requested in the user prompt.
No markdown, no analysis, no clinical note, no extra keys."""

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
class PreparedExample:
    row: dict[str, Any]
    cleanup_notes: list[str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Normalize WAVE clinician JSONL files into lora-wave-session training rows.",
    )
    parser.add_argument(
        "--source",
        action="append",
        type=Path,
        default=None,
        help="Source JSONL path. Repeat to override the default source list.",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--summary-output", type=Path, default=DEFAULT_SUMMARY_OUTPUT)
    parser.add_argument(
        "--exclude-drafts",
        action="store_true",
        help="Drop rows with status=draft. Defaults to including drafts for the hackathon experiment.",
    )
    return parser.parse_args()


def compact_json(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sanitize_text(value: str, cleanup_notes: list[str]) -> str:
    sanitized = value
    replacements = {
        "\u2013": ",",
        "\u2014": ",",
        "\ufffd": "'",
        "\u00a0": " ",
    }
    for old, new in replacements.items():
        if old in sanitized:
            cleanup_notes.append(f"replaced {old.encode('unicode_escape').decode()} in text")
            sanitized = sanitized.replace(old, new)
    sanitized = re.sub(r"\s+([,.;:?])", r"\1", sanitized)
    sanitized = re.sub(r"[ \t]+", " ", sanitized)
    return sanitized.strip()


def sanitize_value(value: Any, cleanup_notes: list[str]) -> Any:
    if isinstance(value, str):
        return sanitize_text(value, cleanup_notes)
    if isinstance(value, list):
        return [sanitize_value(item, cleanup_notes) for item in value]
    if isinstance(value, dict):
        return {key: sanitize_value(entry, cleanup_notes) for key, entry in value.items()}
    return value


def normalize_trigger(input_payload: dict[str, Any], cleanup_notes: list[str]) -> None:
    trigger = input_payload.get("trigger")
    if trigger == "unknown_or_other":
        input_payload["trigger"] = "unknown"
        cleanup_notes.append("mapped trigger unknown_or_other to unknown")


def normalize_common_input(input_payload: dict[str, Any], cleanup_notes: list[str]) -> None:
    normalize_trigger(input_payload, cleanup_notes)
    medication_status = input_payload.get("medicationStatus")
    mat_type = input_payload.get("matType")
    trigger = input_payload.get("trigger")

    if medication_status not in MEDICATION_STATUSES:
        raise ValueError(f"invalid medicationStatus {medication_status!r}")
    if mat_type is not None and mat_type not in MAT_TYPES:
        raise ValueError(f"invalid matType {mat_type!r}")
    if trigger is not None and trigger not in TRIGGERS:
        raise ValueError(f"invalid trigger {trigger!r}")


def stable_example_id(source_id: str, suffix: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"wave:{DEMO_LORA_ID}:{source_id}:{suffix}"))


def source_metadata(
    *,
    row: dict[str, Any],
    source_path: Path,
    line_number: int,
    lora_id: str,
    input_payload: dict[str, Any],
    cleanup_notes: list[str],
    derived_kind: str,
) -> dict[str, Any]:
    return {
        "sourceFile": str(source_path),
        "sourceLine": line_number,
        "sourceRowId": str(row.get("id") or f"{source_path.name}:{line_number}"),
        "sourceLoraId": lora_id,
        "sourceStatus": row.get("status"),
        "derivedKind": derived_kind,
        "chunkNumber": input_payload.get("chunkNumber"),
        "medicationStatus": input_payload.get("medicationStatus"),
        "trigger": input_payload.get("trigger"),
        "cleanupNotes": sorted(set(cleanup_notes)),
    }


def build_prepared_row(
    *,
    example_id: str,
    surface: str,
    prompt: str,
    output_payload: dict[str, Any],
    metadata: dict[str, Any],
    split_key: str,
) -> dict[str, Any]:
    input_payload = {
        "surface": surface,
        "prompt": prompt,
        "metadata": metadata,
    }
    return {
        "id": example_id,
        "loraId": DEMO_LORA_ID,
        "input": input_payload,
        "output": output_payload,
        "messages": [
            {"role": "system", "content": WAVE_JSON_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": compact_json(output_payload)},
        ],
        "splitKey": split_key,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }


def build_phase_prompt(input_payload: dict[str, Any]) -> str:
    chunk_number = input_payload.get("chunkNumber")
    title, purpose = CHUNK_BRIEFS.get(
        chunk_number if isinstance(chunk_number, int) else 0,
        ("Unknown", "Write WAVE narration for the requested phase."),
    )
    return f"""<surface>
phase_narration
</surface>

<chunk>
Number {chunk_number} of 5 - {title}
Purpose: {purpose}
</chunk>

<patient_context>
{compact_json(input_payload)}
</patient_context>

<task>
Generate exactly {CHUNK_LINE_COUNT} patient-facing narration lines.
Each line is one short meditation beat.
Return only strict JSON. No markdown, no analysis, no explanations.
Schema: {{"lines":["line 1","line 2","line 3","line 4","line 5","line 6"]}}
</task>"""


def build_reflection_prompt(input_payload: dict[str, Any]) -> str:
    return f"""<surface>
reflection
</surface>

<patient_context>
{compact_json(input_payload)}
</patient_context>

<task>
Write the post-session reflection card.
The insight must include the numeric endingIntensity as a digit.
The journalPromptQuestion is one gentle question.
The nextSteps object must contain four concrete low-burden action chips.
Return only strict JSON matching the schema.
</task>

<output_schema>
{{"insight":"string","journalPromptQuestion":"string","nextSteps":{{"one":"string","two":"string","three":"string","four":"string"}}}}
</output_schema>"""


def build_check_in_prompt(
    *,
    lora_id: str,
    input_payload: dict[str, Any],
    clinician_instructions: str,
    prior_turns: list[dict[str, str]],
    agent_turn_number: int,
) -> str:
    return f"""<surface>
check_in
</surface>

<specialized_surface>
{lora_id}
</specialized_surface>

<clinician_instructions>
{clinician_instructions.strip()}
</clinician_instructions>

<patient_context>
{compact_json(input_payload)}
</patient_context>

<dialogue_so_far>
{compact_json({"turns": prior_turns})}
</dialogue_so_far>

<task>
Write agent turn #{agent_turn_number} only.
Return strict JSON with exactly two top-level keys: reply and endConversation.
For intermediate turns, endConversation must be null.
For the final hand-off turn, endConversation must be an object:
{{"action":"end","cravingScore":<integer 1-10>,"obstacleCategory":"<allowed obstacle or null>"}}
No markdown, no extra commentary, no extra keys.
</task>"""


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
        if STAGE_DIRECTION_RE.search(stripped):
            errors.append(f"{label} contains pause markers or stage directions")
        if PHASE_ANNOUNCEMENT_RE.search(stripped):
            errors.append(f"{label} announces a chunk or phase number")
        if MEDICAL_DIRECTIVE_RE.search(stripped):
            errors.append(f"{label} contains medication directive phrasing")
    return errors


def validate_reflection_output(output_payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    insight = output_payload.get("insight")
    question = output_payload.get("journalPromptQuestion")
    next_steps = output_payload.get("nextSteps")
    if not isinstance(insight, str) or not 10 <= len(insight) <= 500:
        errors.append("reflection insight must be 10-500 characters")
    elif not re.search(r"\d", insight):
        errors.append("reflection insight must include a numeric ending intensity")
    if not isinstance(question, str) or not 10 <= len(question) <= 200:
        errors.append("journalPromptQuestion must be 10-200 characters")
    if not isinstance(next_steps, dict):
        errors.append("nextSteps must be an object")
    else:
        for key in ("one", "two", "three", "four"):
            value = next_steps.get(key)
            if not isinstance(value, str) or not 3 <= len(value) <= 80:
                errors.append(f"nextSteps.{key} must be 3-80 characters")
    return errors


def validate_check_in_output(output_payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    reply = output_payload.get("reply")
    end_conversation = output_payload.get("endConversation")
    if not isinstance(reply, str) or not 1 <= len(reply) <= CHECK_IN_MAX_REPLY_LENGTH:
        errors.append(
            f"check-in reply must be 1-{CHECK_IN_MAX_REPLY_LENGTH} characters"
        )
    elif TOXIC_POSITIVITY_RE.search(reply):
        errors.append("check-in reply contains toxic positivity")
    if end_conversation is not None:
        if not isinstance(end_conversation, dict):
            errors.append("endConversation must be null or an object")
        else:
            if end_conversation.get("action") != "end":
                errors.append("endConversation.action must be end")
            score = end_conversation.get("cravingScore")
            if not isinstance(score, int) or not 1 <= score <= 10:
                errors.append("endConversation.cravingScore must be an integer 1-10")
            obstacle = end_conversation.get("obstacleCategory")
            if obstacle is not None and obstacle not in OBSTACLE_CATEGORIES:
                errors.append("endConversation.obstacleCategory is invalid")
    if isinstance(reply, str) and MEDICAL_DIRECTIVE_RE.search(reply):
        errors.append("check-in reply contains medication directive phrasing")
    return errors


def text_for_style_checks(output_payload: dict[str, Any]) -> str:
    parts: list[str] = []
    for value in output_payload.values():
        if isinstance(value, str):
            parts.append(value)
        elif isinstance(value, list):
            parts.extend(item for item in value if isinstance(item, str))
        elif isinstance(value, dict):
            parts.extend(str(item) for item in value.values() if isinstance(item, str))
    return " ".join(parts)


def validate_common_output(output_payload: dict[str, Any]) -> list[str]:
    text = text_for_style_checks(output_payload)
    errors: list[str] = []
    if TOXIC_POSITIVITY_RE.search(text):
        errors.append("output contains toxic positivity")
    if MEDICAL_DIRECTIVE_RE.search(text):
        errors.append("output contains medication directive phrasing")
    if MARKDOWN_OR_BULLET_RE.search(text):
        errors.append("output contains markdown or bullet formatting")
    return errors


def prepare_phase_row(
    row: dict[str, Any],
    source_path: Path,
    line_number: int,
) -> list[PreparedExample]:
    cleanup_notes: list[str] = []
    input_payload = sanitize_value(dict(row["input"]), cleanup_notes)
    output_payload = sanitize_value(dict(row["output"]), cleanup_notes)
    fill_phase_input_defaults(input_payload, cleanup_notes)
    normalize_common_input(input_payload, cleanup_notes)

    if input_payload.get("surface") != "phase_narration":
        raise ValueError("phase row input.surface must be phase_narration")
    if input_payload.get("chunkNumber") not in {1, 2, 3, 4, 5}:
        raise ValueError("phase row chunkNumber must be 1..5")
    errors = [*validate_phase_output(output_payload), *validate_common_output(output_payload)]
    if errors:
        raise ValueError("; ".join(errors))

    source_id = str(row.get("id") or f"{source_path.name}:{line_number}")
    metadata = source_metadata(
        row=row,
        source_path=source_path,
        line_number=line_number,
        lora_id="lora-phase-narration",
        input_payload=input_payload,
        cleanup_notes=cleanup_notes,
        derived_kind="phase_narration_row",
    )
    prompt = build_phase_prompt(input_payload)
    split_key = build_split_key("phase_narration", metadata)
    return [
        PreparedExample(
            row=build_prepared_row(
                example_id=stable_example_id(source_id, "phase"),
                surface="phase_narration",
                prompt=prompt,
                output_payload=output_payload,
                metadata=metadata,
                split_key=split_key,
            ),
            cleanup_notes=cleanup_notes,
        )
    ]


def fill_phase_input_defaults(input_payload: dict[str, Any], cleanup_notes: list[str]) -> None:
    defaults: dict[str, Any] = {
        "matType": "none",
        "medicationStatus": "none",
        "trigger": "unknown",
        "usedSubstanceToday": False,
    }
    for key, value in defaults.items():
        if key not in input_payload:
            input_payload[key] = value
            cleanup_notes.append(f"filled missing phase input {key}={value}")


def prepare_reflection_row(
    row: dict[str, Any],
    source_path: Path,
    line_number: int,
) -> list[PreparedExample]:
    cleanup_notes: list[str] = []
    input_payload = sanitize_value(dict(row["input"]), cleanup_notes)
    output_payload = sanitize_value(dict(row["output"]), cleanup_notes)
    normalize_common_input(input_payload, cleanup_notes)

    if input_payload.get("surface") != "reflection":
        raise ValueError("reflection row input.surface must be reflection")
    errors = [*validate_reflection_output(output_payload), *validate_common_output(output_payload)]
    if errors:
        raise ValueError("; ".join(errors))

    source_id = str(row.get("id") or f"{source_path.name}:{line_number}")
    metadata = source_metadata(
        row=row,
        source_path=source_path,
        line_number=line_number,
        lora_id="lora-reflection",
        input_payload=input_payload,
        cleanup_notes=cleanup_notes,
        derived_kind="reflection_row",
    )
    prompt = build_reflection_prompt(input_payload)
    split_key = build_split_key("reflection", metadata)
    return [
        PreparedExample(
            row=build_prepared_row(
                example_id=stable_example_id(source_id, "reflection"),
                surface="reflection",
                prompt=prompt,
                output_payload=output_payload,
                metadata=metadata,
                split_key=split_key,
            ),
            cleanup_notes=cleanup_notes,
        )
    ]


def prepare_check_in_row(
    row: dict[str, Any],
    source_path: Path,
    line_number: int,
) -> list[PreparedExample]:
    cleanup_notes: list[str] = []
    lora_id = str(row["loraId"])
    input_payload = sanitize_value(dict(row["input"]), cleanup_notes)
    output_payload = sanitize_value(dict(row["output"]), cleanup_notes)
    clinician_instructions = sanitize_text(
        str(row.get("clinicianLlmInstructions") or ""),
        cleanup_notes,
    )
    normalize_common_input(input_payload, cleanup_notes)

    if input_payload.get("surface") != "check_in":
        raise ValueError("check-in row input.surface must be check_in")
    chunk_number = input_payload.get("chunkNumber")
    if chunk_number not in {1, 2, 3, 4, 5}:
        raise ValueError("check-in chunkNumber must be 1..5")
    if input_payload.get("medicationStatus") not in MEDICATION_STATUSES:
        raise ValueError("check-in medicationStatus is invalid")
    if input_payload.get("scoreTrend") not in SCORE_TRENDS:
        raise ValueError("check-in scoreTrend is invalid")

    turns = output_payload.get("dialogueTurns")
    if not isinstance(turns, list) or len(turns) < 2:
        raise ValueError("check-in output.dialogueTurns must contain a transcript")

    prepared: list[PreparedExample] = []
    source_id = str(row.get("id") or f"{source_path.name}:{line_number}")
    prior_turns: list[dict[str, str]] = []
    agent_turn_number = 0
    final_agent_index = max(
        index
        for index, turn in enumerate(turns)
        if isinstance(turn, dict) and turn.get("role") == "agent"
    )

    for turn_index, turn in enumerate(turns):
        if not isinstance(turn, dict):
            raise ValueError(f"dialogue turn {turn_index} must be an object")
        role = turn.get("role")
        content = turn.get("content")
        if role not in {"agent", "patient"} or not isinstance(content, str):
            raise ValueError(f"dialogue turn {turn_index} has invalid role/content")

        content = sanitize_text(content, cleanup_notes)
        if role == "patient":
            prior_turns.append({"role": "patient", "content": content})
            continue

        agent_turn_number += 1
        is_final_agent_turn = turn_index == final_agent_index
        end_signal = output_payload.get("endConversation") if is_final_agent_turn else None
        turn_output = {
            "reply": content,
            "endConversation": normalize_end_signal(end_signal, cleanup_notes),
        }
        errors = [*validate_check_in_output(turn_output), *validate_common_output(turn_output)]
        if errors:
            raise ValueError(f"turn {turn_index}: {'; '.join(errors)}")

        turn_notes = list(cleanup_notes)
        metadata = source_metadata(
            row=row,
            source_path=source_path,
            line_number=line_number,
            lora_id=lora_id,
            input_payload=input_payload,
            cleanup_notes=turn_notes,
            derived_kind="check_in_turn",
        )
        metadata["agentTurnNumber"] = agent_turn_number
        metadata["sourceDialogueTurnIndex"] = turn_index
        metadata["isFinalAgentTurn"] = is_final_agent_turn

        prompt = build_check_in_prompt(
            lora_id=lora_id,
            input_payload=input_payload,
            clinician_instructions=clinician_instructions,
            prior_turns=prior_turns,
            agent_turn_number=agent_turn_number,
        )
        split_key = build_split_key("check_in", metadata)
        prepared.append(
            PreparedExample(
                row=build_prepared_row(
                    example_id=stable_example_id(source_id, f"turn-{turn_index}"),
                    surface="check_in",
                    prompt=prompt,
                    output_payload=turn_output,
                    metadata=metadata,
                    split_key=split_key,
                ),
                cleanup_notes=turn_notes,
            )
        )
        prior_turns.append({"role": "agent", "content": content})

    return prepared


def normalize_end_signal(value: Any, cleanup_notes: list[str]) -> dict[str, Any] | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("endConversation must be an object when present")
    obstacle = value.get("obstacleCategory")
    if obstacle == "none":
        obstacle = None
        cleanup_notes.append("mapped endConversation obstacleCategory none to null")
    return {
        "action": value.get("action"),
        "cravingScore": value.get("cravingScore"),
        "obstacleCategory": obstacle,
    }


def build_split_key(surface: str, metadata: dict[str, Any]) -> str:
    chunk = metadata.get("chunkNumber") or "none"
    medication_status = metadata.get("medicationStatus") or "unknown"
    trigger = metadata.get("trigger") or "unknown"
    source_lora_id = metadata.get("sourceLoraId") or surface
    derived_kind = metadata.get("derivedKind") or "row"
    turn_bucket = "final" if metadata.get("isFinalAgentTurn") else "intermediate"
    if surface != "check_in":
        turn_bucket = "single"
    return (
        f"surface={surface}|source={source_lora_id}|chunk={chunk}|"
        f"med={medication_status}|trigger={trigger}|kind={derived_kind}|turn={turn_bucket}"
    )


def prepare_row(row: dict[str, Any], source_path: Path, line_number: int) -> list[PreparedExample]:
    lora_id = row.get("loraId")
    if lora_id not in SUPPORTED_LORA_IDS:
        raise ValueError(f"unsupported loraId {lora_id!r}")
    if not isinstance(row.get("input"), dict) or not isinstance(row.get("output"), dict):
        raise ValueError("row input and output must be objects")
    if lora_id == "lora-phase-narration":
        return prepare_phase_row(row, source_path, line_number)
    if lora_id == "lora-reflection":
        return prepare_reflection_row(row, source_path, line_number)
    return prepare_check_in_row(row, source_path, line_number)


def load_source_rows(path: Path, exclude_drafts: bool) -> tuple[list[PreparedExample], list[str]]:
    prepared: list[PreparedExample] = []
    errors: list[str] = []
    with path.open("r", encoding="utf-8") as file_handle:
        for line_number, line in enumerate(file_handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                row = json.loads(stripped)
                if exclude_drafts and row.get("status") == "draft":
                    continue
                prepared.extend(prepare_row(row, path, line_number))
            except Exception as error:
                errors.append(f"{path}:{line_number}: {error}")
    return prepared, errors


def assert_no_duplicate_ids(rows: list[dict[str, Any]]) -> None:
    counts = Counter(str(row.get("id")) for row in rows)
    duplicates = [row_id for row_id, count in counts.items() if count > 1]
    if duplicates:
        raise ValueError(f"duplicate prepared ids: {duplicates[:5]}")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file_handle:
        for row in rows:
            file_handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")))
            file_handle.write("\n")


def summarize(rows: list[dict[str, Any]], errors: list[str]) -> dict[str, Any]:
    by_surface = Counter(row["input"]["surface"] for row in rows)
    by_source = Counter(row["input"]["metadata"]["sourceLoraId"] for row in rows)
    by_status = Counter(str(row["input"]["metadata"].get("sourceStatus")) for row in rows)
    by_split_key = Counter(row["splitKey"] for row in rows)
    cleanup_notes = Counter(
        note
        for row in rows
        for note in row["input"]["metadata"].get("cleanupNotes", [])
    )
    return {
        "loraId": DEMO_LORA_ID,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "counts": {
            "totalPreparedExamples": len(rows),
            "bySurface": dict(sorted(by_surface.items())),
            "bySourceLoraId": dict(sorted(by_source.items())),
            "bySourceStatus": dict(sorted(by_status.items())),
            "splitKeyCount": len(by_split_key),
        },
        "topCleanupNotes": dict(cleanup_notes.most_common(20)),
        "errors": errors,
    }


def main() -> None:
    args = parse_args()
    source_files = args.source or DEFAULT_SOURCE_FILES
    all_examples: list[PreparedExample] = []
    errors: list[str] = []

    for source_path in source_files:
        prepared, source_errors = load_source_rows(source_path, exclude_drafts=args.exclude_drafts)
        all_examples.extend(prepared)
        errors.extend(source_errors)

    if errors:
        for error in errors[:20]:
            print(error)
        raise SystemExit(f"Failed to normalize {len(errors)} source rows")

    rows = [example.row for example in all_examples]
    assert_no_duplicate_ids(rows)
    write_jsonl(args.output, rows)
    summary = summarize(rows, errors)
    args.summary_output.parent.mkdir(parents=True, exist_ok=True)
    args.summary_output.write_text(
        json.dumps(summary, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"Wrote {len(rows)} prepared examples to {args.output}")
    print(f"Wrote summary to {args.summary_output}")
    print(json.dumps(summary["counts"], indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
