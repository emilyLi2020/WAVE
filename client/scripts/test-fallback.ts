/* eslint-disable no-console */
/**
 * Exercises the live chunk generation path used during sessions.
 * Validates that local Gemma returns a well-shaped `Chunk` for every
 * chunk number: the right number of text segments, default-length
 * pauses interleaved, and every line within the schema's MIN/MAX
 * length window.
 *
 * Run with:  npx --yes tsx scripts/test-fallback.ts
 */

import { generateChunk, DEFAULT_LINE_PAUSE_SECONDS } from "@/lib/gemma/chunk";
import { fallbackChunk } from "@/lib/prompts/fallback-bank";
import { CHUNK_LINE_COUNT, chunkLinesSchema } from "@/lib/prompts/schemas";
import type { ChunkNumber } from "@/types/session";

let total = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  total += 1;
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const PROFILE = {
  matType: "buprenorphine" as const,
  medicationStatus: "on_time" as const,
  trigger: "stress" as const,
  triggerOther: null,
  usedSubstanceToday: false,
};

async function testGeneratedChunkShape() {
  console.log("\n[A] generateChunk() returns Gemma chunks for every chunk number");

  const sessionHistory = [];
  for (const chunkNumber of [1, 2, 3, 4, 5] as ChunkNumber[]) {
    const result = await generateChunk({
      context: {
        chunkNumber,
        intakeIntensity: 7,
        profile: PROFILE,
        sessionHistory,
      },
    });

    assert(
      result.source === "model",
      `chunk ${chunkNumber}: source === "model" (got "${result.source}")`,
    );
    assert(result.attempts === 1, `chunk ${chunkNumber}: attempts === 1 (got ${result.attempts})`);
    assert(
      result.lines.length === CHUNK_LINE_COUNT,
      `chunk ${chunkNumber}: lines.length === ${CHUNK_LINE_COUNT}`,
    );
    assert(result.chunk.id === chunkNumber, `chunk ${chunkNumber}: chunk.id matches`);
    assert(result.chunk.title.length > 0, `chunk ${chunkNumber}: chunk.title set`);
    assert(
      chunkLinesSchema.safeParse({ lines: result.lines }).success,
      `chunk ${chunkNumber}: generated lines pass chunkLinesSchema`,
    );

    const segs = result.chunk.segments;
    const expectedSegCount = CHUNK_LINE_COUNT * 2 - 1;
    assert(
      segs.length === expectedSegCount,
      `chunk ${chunkNumber}: segments.length === ${expectedSegCount} (got ${segs.length})`,
    );
    let textCount = 0;
    let pauseCount = 0;
    for (const [idx, seg] of segs.entries()) {
      if (idx % 2 === 0) {
        assert(seg.type === "text", `chunk ${chunkNumber}: segment[${idx}] is text`);
        if (seg.type === "text") textCount += 1;
      } else {
        assert(
          seg.type === "pause" && seg.duration === DEFAULT_LINE_PAUSE_SECONDS,
          `chunk ${chunkNumber}: segment[${idx}] is ${DEFAULT_LINE_PAUSE_SECONDS}s pause`,
      );
        if (seg.type === "pause") pauseCount += 1;
      }
    }
    assert(textCount === CHUNK_LINE_COUNT, `chunk ${chunkNumber}: ${CHUNK_LINE_COUNT} text segments`);
    assert(pauseCount === CHUNK_LINE_COUNT - 1, `chunk ${chunkNumber}: ${CHUNK_LINE_COUNT - 1} pause segments`);

    sessionHistory.push({
      kind: "chunk" as const,
      chunkNumber,
      lines: result.lines,
    });
  }
}

function testFallbackBank() {
  console.log("\n[B] fallbackChunk() bank shape — every chunk number");

  for (const n of [1, 2, 3, 4, 5] as ChunkNumber[]) {
    const payload = fallbackChunk(n);
    assert(payload.lines.length === CHUNK_LINE_COUNT, `chunk ${n}: 6 lines`);
    const parsed = chunkLinesSchema.safeParse(payload);
    assert(parsed.success, `chunk ${n}: passes chunkLinesSchema`);
    if (!parsed.success) {
      console.log("    issues:", JSON.stringify(parsed.error.issues, null, 2));
    }
  }
}

(async () => {
  const start = Date.now();
  try {
    await testGeneratedChunkShape();
    testFallbackBank();
  } catch (err) {
    failed += 1;
    console.error("\n[FATAL]", err);
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`\n=== ${total - failed}/${total} assertions passed in ${elapsed}s ===`);
  process.exit(failed === 0 ? 0 : 1);
})();
