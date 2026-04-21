"""Regenerate environment.yml from pyproject.toml.

pyproject.toml is the single source of truth for the `models/` Python deps.
Conda users still get a working environment.yml; they just don't edit it
directly. After changing deps in pyproject.toml, run:

    uv run python sync_env.py

This script intentionally has no third-party dependencies so it can be run
from a bare conda env too:

    python sync_env.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

if sys.version_info >= (3, 11):
    import tomllib
else:
    import tomli as tomllib

ENV_NAME = "wave-models"
CONDA_CHANNELS = ["conda-forge"]
# Extra pip index URLs mirrored into environment.yml so conda users get the
# same wheels uv pulls via [tool.uv.sources] in pyproject.toml. Keep this in
# sync with the [[tool.uv.index]] entries in pyproject.toml.
EXTRA_PIP_INDEX_URLS = ["https://download.pytorch.org/whl/cu128"]

HERE = Path(__file__).resolve().parent
PYPROJECT = HERE / "pyproject.toml"
ENV_YML = HERE / "environment.yml"

PYTHON_SPEC_RE = re.compile(r"^==\s*(\d+\.\d+)(?:\.\*)?$")


def parse_python_version(requires_python: str) -> str:
    """Turn a PEP 440 `requires-python` like `==3.11.*` into `3.11` for conda."""
    match = PYTHON_SPEC_RE.match(requires_python.strip())
    if not match:
        raise SystemExit(
            f"sync_env.py only handles `requires-python = \"==X.Y.*\"`; got {requires_python!r}. "
            "Update sync_env.py if you need a different pin."
        )
    return match.group(1)


def render_env_yml(python_version: str, pip_deps: list[str]) -> str:
    lines: list[str] = []
    lines.append("# AUTO-GENERATED from pyproject.toml by sync_env.py.")
    lines.append("# Do not edit by hand. Edit pyproject.toml, then run: uv run python sync_env.py")
    lines.append(f"name: {ENV_NAME}")
    lines.append("channels:")
    for channel in CONDA_CHANNELS:
        lines.append(f"  - {channel}")
    lines.append("dependencies:")
    lines.append(f"  - python={python_version}")
    lines.append("  - pip")
    lines.append("  - pip:")
    for index_url in EXTRA_PIP_INDEX_URLS:
        lines.append(f"      - --extra-index-url {index_url}")
    for dep in pip_deps:
        lines.append(f"      - {dep}")
    return "\n".join(lines) + "\n"


def main() -> None:
    if not PYPROJECT.exists():
        raise SystemExit(f"Missing {PYPROJECT}")

    with PYPROJECT.open("rb") as fh:
        data = tomllib.load(fh)

    project = data.get("project", {})
    requires_python = project.get("requires-python")
    dependencies = project.get("dependencies", [])

    if not requires_python:
        raise SystemExit("pyproject.toml is missing [project].requires-python")
    if not dependencies:
        raise SystemExit("pyproject.toml has no [project].dependencies to sync")

    python_version = parse_python_version(requires_python)
    rendered = render_env_yml(python_version, list(dependencies))

    previous = ENV_YML.read_text(encoding="utf-8") if ENV_YML.exists() else None
    ENV_YML.write_text(rendered, encoding="utf-8")

    if previous == rendered:
        print(f"environment.yml already in sync ({len(dependencies)} deps).")
    else:
        print(f"Wrote {ENV_YML.name} ({len(dependencies)} deps, python={python_version}).")


if __name__ == "__main__":
    main()
