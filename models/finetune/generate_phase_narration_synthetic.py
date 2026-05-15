"""Generate synthetic WAVE phase-narration seed rows.

The generator is deliberately template-based rather than model-generated. For
clinical-adjacent data, that gives us reproducibility, coverage control, and a
clear audit trail. Rows are marked `draft` until a clinician reviews them.
"""

from __future__ import annotations

import argparse
import json
import random
import re
import uuid
from pathlib import Path
from typing import Any


LORA_ID = "lora-phase-narration"
LORA_TITLE = "lora-phase-narration - five-phase meditation narration"
CHUNK_LINE_COUNT = 6
MIN_LINE_LENGTH = 12
MAX_LINE_LENGTH = 200
DEFAULT_SEED = 23

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

MAT_TYPES = ["buprenorphine", "naltrexone", "methadone", "vivitrol", "none"]
MEDICATION_STATUSES = ["on_time", "late", "missed", "none"]
TRIGGERS = ["social", "stress", "physical", "unknown", "other"]
OBSTACLES = [
    "mind_wandering",
    "urge_overwhelming",
    "breath_tight",
    "physical_discomfort",
    "guilt_failure",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate draft synthetic phase-narration JSONL rows.",
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=Path("datasets/human/lora-phase-narration-clinician.jsonl"),
        help=(
            "Clinician-only phase seed JSONL (e.g. status=ready rows). "
            "Defaults to the checked-in `lora-phase-narration-clinician.jsonl`."
        ),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("datasets/human/lora-phase-narration-expanded.jsonl"),
        help="Where to write source rows plus synthetic draft rows.",
    )
    parser.add_argument(
        "--synthetic-only-output",
        type=Path,
        default=Path("datasets/synthetic/lora-phase-narration-synthetic-draft.jsonl"),
        help="Where to write only the synthetic draft rows.",
    )
    parser.add_argument("--count", type=int, default=40)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument(
        "--created-at",
        default="2026-05-05T04:12:00.000Z",
        help="Timestamp to stamp on generated synthetic rows.",
    )
    return parser.parse_args()


def load_source_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as file_handle:
        for line_number, line in enumerate(file_handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            row = json.loads(stripped)
            validate_source_row(row, f"{path}:{line_number}")
            rows.append(row)
    if not rows:
        raise ValueError(f"No source rows found in {path}")
    return rows


def build_coverage_plan(count: int, rng: random.Random) -> list[dict[str, Any]]:
    plan: list[dict[str, Any]] = []
    for index in range(count):
        chunk_number = (index % 5) + 1
        high_intensity = (index // 5) % 2 == 1
        medication_status = MEDICATION_STATUSES[index % len(MEDICATION_STATUSES)]
        mat_type = MAT_TYPES[(index + chunk_number) % len(MAT_TYPES)]
        if medication_status == "none":
            mat_type = "none"
        elif mat_type == "none":
            mat_type = "buprenorphine"

        trigger = TRIGGERS[(index * 2 + chunk_number) % len(TRIGGERS)]
        intake_intensity = rng.choice([7, 8, 9, 10] if high_intensity else [2, 3, 4, 5, 6])
        latest_score = clamp(
            intake_intensity + rng.choice([-2, -1, 0, 1]),
            minimum=1,
            maximum=10,
        )
        plan.append(
            {
                "chunkNumber": chunk_number,
                "startingIntensityBand": "7-10" if high_intensity else "1-6",
                "intakeIntensity": intake_intensity,
                "latestCravingScore": latest_score,
                "matType": mat_type,
                "medicationStatus": medication_status,
                "trigger": trigger,
                "triggerOther": trigger_other(trigger, index),
                "usedSubstanceToday": index % 11 == 3,
                "obstacleHint": OBSTACLES[index % len(OBSTACLES)] if chunk_number > 1 else None,
            }
        )
    return plan


def trigger_other(trigger: str, index: int) -> str | None:
    if trigger != "other":
        return None
    details = [
        "payday routine felt different",
        "saw an old route home",
        "unexpected free time after work",
        "argument replaying in the evening",
    ]
    return details[index % len(details)]


def clamp(value: int, *, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def generate_rows(
    plan: list[dict[str, Any]],
    source_rows: list[dict[str, Any]],
    seed: int,
    created_at: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, context in enumerate(plan):
        input_payload = build_input(context)
        output_payload = {"lines": build_lines(context)}
        row = {
            "loraId": LORA_ID,
            "loraTitle": LORA_TITLE,
            "id": str(
                uuid.uuid5(
                    uuid.NAMESPACE_URL,
                    f"wave:{LORA_ID}:synthetic:{seed}:{index}:{json.dumps(input_payload, sort_keys=True)}",
                )
            ),
            "status": "draft",
            "authorInitials": "synthetic",
            "notes": (
                "Synthetic draft generated from clinician seed templates for coverage expansion. "
                "Requires clinician review before marking ready or approved."
            ),
            "input": input_payload,
            "output": output_payload,
            "createdAt": created_at,
            "updatedAt": created_at,
        }
        validate_row(row, f"synthetic row {index + 1}")
        rows.append(row)
    assert_no_duplicate_ids([*source_rows, *rows])
    return rows


def build_input(context: dict[str, Any]) -> dict[str, Any]:
    trigger = context["trigger"]
    prior_summary = prior_session_summary(context)
    input_payload: dict[str, Any] = {
        "surface": "phase_narration",
        "chunkNumber": context["chunkNumber"],
        "startingIntensityBand": context["startingIntensityBand"],
        "intakeIntensity": context["intakeIntensity"],
        "matType": context["matType"],
        "medicationStatus": context["medicationStatus"],
        "trigger": trigger,
        "usedSubstanceToday": context["usedSubstanceToday"],
        "latestCravingScore": context["latestCravingScore"],
        "scoreHistorySummary": score_history_summary(context),
        "priorSessionSummary": prior_summary,
    }
    if trigger == "other" and context["triggerOther"]:
        input_payload["triggerOther"] = context["triggerOther"]
    if context["obstacleHint"]:
        input_payload["obstacleHint"] = context["obstacleHint"]
    return input_payload


def score_history_summary(context: dict[str, Any]) -> str:
    if context["chunkNumber"] == 1:
        return f"intake {context['intakeIntensity']}; session is just starting."
    return (
        f"intake {context['intakeIntensity']}; latest check-in "
        f"{context['latestCravingScore']}; trend is being observed without judgment."
    )


def prior_session_summary(context: dict[str, Any]) -> str:
    chunk_number = context["chunkNumber"]
    if chunk_number == 1:
        return "Patient is beginning the session and needs a steady, low-pressure welcome."
    obstacle = context["obstacleHint"] or "noticing the urge"
    return (
        f"Earlier narration invited urge surfing practice. The recent check-in noted "
        f"{obstacle.replace('_', ' ')} and a craving score of {context['latestCravingScore']}."
    )


def build_lines(context: dict[str, Any]) -> list[str]:
    chunk_number = context["chunkNumber"]
    if chunk_number == 1:
        return chunk_one_lines(context)
    if chunk_number == 2:
        return chunk_two_lines(context)
    if chunk_number == 3:
        return chunk_three_lines(context)
    if chunk_number == 4:
        return chunk_four_lines(context)
    if chunk_number == 5:
        return chunk_five_lines(context)
    raise ValueError(f"Unsupported chunk number {chunk_number}")


def context_sentence(context: dict[str, Any]) -> str:
    status = context["medicationStatus"]
    used_today = context["usedSubstanceToday"]
    if used_today:
        return "If use happened today and you are physically okay to continue, there is still no shame here; return to this breath."
    if status == "on_time":
        return "If medication is part of your plan and it was on time today, let that be quiet support in the background."
    if status == "late":
        return "If medication ran late today, notice any worry without turning it into blame or a demand on yourself."
    if status == "missed":
        return "If a dose was missed today, let that be information for your care plan, not a reason to judge this moment."
    return "Whether medication is part of your care or not, this practice can stay with what is happening right now."


def trigger_sentence(context: dict[str, Any]) -> str:
    trigger = context["trigger"]
    if trigger == "stress":
        return "Stress can make the body feel urgent, so start by giving the feeling a little room."
    if trigger == "social":
        return "After a social trigger, your mind may replay moments; you can notice the replay without following it."
    if trigger == "physical":
        return "When the trigger is physical, begin with sensation itself: pressure, heat, motion, or numbness."
    if trigger == "other":
        return "Something specific stirred this up, and you do not have to solve the whole story right now."
    return "Even if the trigger is unclear, the body can still show you what the wave feels like."


def chunk_one_lines(context: dict[str, Any]) -> list[str]:
    return [
        "Thank you for taking this moment to pause. You do not have to do this perfectly; you only have to arrive as you are.",
        "Find a position that your body can tolerate right now, sitting, lying down, or resting against something steady.",
        context_sentence(context),
        trigger_sentence(context),
        "Notice the urge as a wave: it may rise, crest, shift, and fall, and your job is only to observe the next small part.",
        "Take one slow breath in and one easy breath out, letting this be the beginning of the practice.",
    ]


def chunk_two_lines(context: dict[str, Any]) -> list[str]:
    return [
        "Now bring attention to your body, not to fix anything, but to learn where the urge is showing itself.",
        "Start with your feet or the place where your body meets support, and notice pressure, warmth, tingling, or nothing obvious.",
        "Move slowly through your legs, stomach, chest, shoulders, jaw, and hands, letting each area report what it is carrying.",
        context_sentence(context),
        "If one place feels louder than the rest, stay near its edges and notice shape, temperature, pulsing, tightness, or movement.",
        "You are practicing turning toward sensation with care, and that is enough for this part.",
    ]


def chunk_three_lines(context: dict[str, Any]) -> list[str]:
    return [
        "Let sound become the anchor now. You can listen to the room, the audio, or the imagined rhythm of water moving in and out.",
        "There is nothing you need to picture clearly; hearing and feeling the rhythm is enough.",
        trigger_sentence(context),
        "Each sound arrives, changes, and fades, the same way an urge can move without needing you to act on it.",
        "If your mind wanders, notice that it wandered and return to the next sound you can hear.",
        "Coming back once is real practice, and you can keep coming back one sound at a time.",
    ]


def chunk_four_lines(context: dict[str, Any]) -> list[str]:
    return [
        "Now let the breath give the wave a little structure. Breathe in for four, hold for four if that feels okay, and breathe out for six.",
        "If holding the breath feels uncomfortable, soften the hold and keep the exhale slow and easy.",
        "Try one round in your own count: in, steady, and then a longer breath out through the mouth or nose.",
        context_sentence(context),
        "Let the exhale be the part where the body does not have to brace quite so hard.",
        "Stay with the rhythm for the next few breaths, adjusting gently so the practice stays usable.",
    ]


def chunk_five_lines(context: dict[str, Any]) -> list[str]:
    return [
        "Begin to notice where you are now compared with the start, without forcing the answer to be positive.",
        "Maybe the urge dropped, maybe it held steady, or maybe it is still loud; each of those can be part of practice.",
        "Look for one small detail that changed in your body, your breath, your thoughts, or your ability to stay present.",
        context_sentence(context),
        "If the craving is still intense, consider reaching out to a trusted support person or care team after this session.",
        "When you are ready, let your attention widen to the room and carry one useful observation with you.",
    ]


def validate_row(row: dict[str, Any], label: str) -> None:
    if row.get("loraId") != LORA_ID:
        raise ValueError(f"{label}: loraId must be {LORA_ID}")
    input_payload = row.get("input")
    output_payload = row.get("output")
    if not isinstance(input_payload, dict) or not isinstance(output_payload, dict):
        raise ValueError(f"{label}: input and output must be objects")
    if input_payload.get("surface") != "phase_narration":
        raise ValueError(f"{label}: input.surface must be phase_narration")
    if input_payload.get("chunkNumber") not in {1, 2, 3, 4, 5}:
        raise ValueError(f"{label}: input.chunkNumber must be 1..5")

    lines = output_payload.get("lines")
    if not isinstance(lines, list) or len(lines) != CHUNK_LINE_COUNT:
        raise ValueError(f"{label}: output.lines must have exactly {CHUNK_LINE_COUNT} items")
    for line_index, line in enumerate(lines):
        if not isinstance(line, str):
            raise ValueError(f"{label}: line {line_index + 1} is not a string")
        if len(line) < MIN_LINE_LENGTH or len(line) > MAX_LINE_LENGTH:
            raise ValueError(f"{label}: line {line_index + 1} length is out of bounds")
        if "\n" in line:
            raise ValueError(f"{label}: line {line_index + 1} contains a newline")
        if TOXIC_POSITIVITY_RE.search(line):
            raise ValueError(f"{label}: line {line_index + 1} uses toxic positivity")
        if STAGE_DIRECTION_RE.search(line):
            raise ValueError(f"{label}: line {line_index + 1} contains a stage direction")
        if PHASE_ANNOUNCEMENT_RE.search(line):
            raise ValueError(f"{label}: line {line_index + 1} announces a chunk or phase")
        if MEDICAL_DIRECTIVE_RE.search(line):
            raise ValueError(f"{label}: line {line_index + 1} gives medication direction")


def validate_source_row(row: dict[str, Any], label: str) -> None:
    """Validate source identity/shape without rewriting legacy seed copy."""
    if row.get("loraId") != LORA_ID:
        raise ValueError(f"{label}: loraId must be {LORA_ID}")
    input_payload = row.get("input")
    output_payload = row.get("output")
    if not isinstance(input_payload, dict) or not isinstance(output_payload, dict):
        raise ValueError(f"{label}: input and output must be objects")
    if input_payload.get("surface") != "phase_narration":
        raise ValueError(f"{label}: input.surface must be phase_narration")
    if input_payload.get("chunkNumber") not in {1, 2, 3, 4, 5}:
        raise ValueError(f"{label}: input.chunkNumber must be 1..5")
    lines = output_payload.get("lines")
    if not isinstance(lines, list) or len(lines) != CHUNK_LINE_COUNT:
        raise ValueError(f"{label}: output.lines must have exactly {CHUNK_LINE_COUNT} items")


def assert_no_duplicate_ids(rows: list[dict[str, Any]]) -> None:
    seen: set[str] = set()
    for row in rows:
        row_id = str(row.get("id"))
        if row_id in seen:
            raise ValueError(f"duplicate id: {row_id}")
        seen.add(row_id)


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file_handle:
        for row in rows:
            file_handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")))
            file_handle.write("\n")


def main() -> None:
    args = parse_args()
    rng = random.Random(args.seed)
    source_rows = load_source_rows(args.source)
    plan = build_coverage_plan(args.count, rng)
    synthetic_rows = generate_rows(
        plan,
        source_rows,
        seed=args.seed,
        created_at=args.created_at,
    )

    write_jsonl(args.synthetic_only_output, synthetic_rows)
    write_jsonl(args.output, [*source_rows, *synthetic_rows])
    print(
        f"Wrote {len(synthetic_rows)} synthetic draft rows to {args.synthetic_only_output}"
    )
    print(f"Wrote {len(source_rows) + len(synthetic_rows)} total rows to {args.output}")


if __name__ == "__main__":
    main()
