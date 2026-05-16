#!/usr/bin/env bash
# Downloads + unpacks the sherpa-onnx Kokoro English TTS model bundle into
# mobile/assets/kokoro/ so EAS Build can package it into the IPA.
#
# Run once per dev machine from mobile/:
#
#   ./scripts/download-kokoro.sh
#
# The asset dir is .gitignored — re-run this on a fresh clone before
# building, or any time the bundle version bumps.

set -euo pipefail

# Pin a specific Kokoro release. Update both URL + extracted dir name when
# bumping. Sizes (uncompressed): ~330 MB int8 quant.
KOKORO_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-en-v0.19.tar.bz2"
KOKORO_INNER_DIR="kokoro-en-v0.19"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ASSETS_DIR="$SCRIPT_DIR/../assets/kokoro"

if [ -d "$ASSETS_DIR" ] && [ -n "$(ls -A "$ASSETS_DIR" 2>/dev/null)" ]; then
  echo "Kokoro bundle already present at $ASSETS_DIR"
  echo "Delete that directory and re-run to refetch."
  exit 0
fi

mkdir -p "$ASSETS_DIR"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

TARBALL="$TMPDIR/kokoro.tar.bz2"
echo "Downloading $KOKORO_URL …"
curl -L --fail --progress-bar "$KOKORO_URL" -o "$TARBALL"

echo "Extracting to $ASSETS_DIR …"
tar -xjf "$TARBALL" -C "$TMPDIR"

# The tarball expands to ./$KOKORO_INNER_DIR/* — move contents up so
# assets/kokoro/ holds the model files directly.
if [ -d "$TMPDIR/$KOKORO_INNER_DIR" ]; then
  mv "$TMPDIR/$KOKORO_INNER_DIR"/* "$ASSETS_DIR/"
else
  # Tarball layout differed — copy whatever was extracted.
  shopt -s dotglob
  mv "$TMPDIR"/* "$ASSETS_DIR/" 2>/dev/null || true
fi

echo "Done. Kokoro bundle installed:"
ls -lh "$ASSETS_DIR" | head -20
