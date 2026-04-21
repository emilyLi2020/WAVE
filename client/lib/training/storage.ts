/**
 * Local-file storage for the dev-only /training UI.
 *
 * One JSON-array file per LoRA at:
 *   <repo-root>/data/training-seeds/<lora-id>.json
 *
 * The directory lives OUTSIDE the Next.js project root so Next's dev
 * watcher doesn't trigger a rebuild every time the doctor saves a seed.
 * Override the location with WAVE_TRAINING_DATA_DIR if you run the dev
 * server from somewhere other than `client/`.
 *
 * Server-only — every function here writes to disk and must be called
 * from a Server Component or Route Handler that has already passed
 * assertTrainingEnabled().
 *
 * Concurrency: a tiny in-process per-file mutex serializes writes so
 * back-to-back saves from the same dev server can't clobber each other.
 * For the demo this is enough; multiple dev servers writing to the same
 * folder would still race.
 */

import "server-only";

import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { LORA_IDS } from "./types";
import type {
  LoRAId,
  SeedStatus,
  TrainingSeed,
} from "./types";

const SUBDIR = path.join("data", "training-seeds");

function dataDir(): string {
  if (process.env.WAVE_TRAINING_DATA_DIR) {
    return path.resolve(process.env.WAVE_TRAINING_DATA_DIR);
  }
  // Default: assume `pnpm dev` is running from `client/`, so the repo
  // root is one level up.
  return path.resolve(process.cwd(), "..", SUBDIR);
}

function fileFor(loraId: LoRAId): string {
  return path.join(dataDir(), `${loraId}.json`);
}

const writeLocks: Map<string, Promise<unknown>> = new Map();

async function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = writeLocks.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  writeLocks.set(
    key,
    next.catch(() => undefined),
  );
  try {
    return await next;
  } finally {
    if (writeLocks.get(key) === next) writeLocks.delete(key);
  }
}

async function ensureDir(): Promise<void> {
  await mkdir(dataDir(), { recursive: true });
}

async function readFileSeeds(loraId: LoRAId): Promise<TrainingSeed[]> {
  try {
    const raw = await readFile(fileFor(loraId), "utf8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(
        `Training seed file for ${loraId} is malformed (expected JSON array).`,
      );
    }
    return parsed as TrainingSeed[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeFileSeeds(
  loraId: LoRAId,
  seeds: TrainingSeed[],
): Promise<void> {
  await ensureDir();
  const target = fileFor(loraId);
  const tmp = `${target}.tmp-${process.pid}-${randomUUID()}`;
  // Sort newest first so the file is human-scannable and matches what
  // the UI shows.
  const sorted = [...seeds].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
  await writeFile(tmp, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  await rename(tmp, target);
}

export interface CreateSeedInput {
  loraId: LoRAId;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  authorInitials?: string | null;
  notes?: string | null;
  status?: SeedStatus;
}

export interface UpdateSeedInput {
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  authorInitials?: string | null;
  notes?: string | null;
  status?: SeedStatus;
}

export async function listSeedsForLora(
  loraId: LoRAId,
): Promise<TrainingSeed[]> {
  const seeds = await readFileSeeds(loraId);
  return seeds;
}

export async function listAllSeeds(): Promise<TrainingSeed[]> {
  const all = await Promise.all(LORA_IDS.map((id) => readFileSeeds(id)));
  return all.flat();
}

export async function getSeed(id: string): Promise<TrainingSeed | null> {
  // Search every LoRA's file. Cheap for demo volumes (≤ a few hundred
  // rows total). If this ever gets slow, add an id → loraId index file.
  for (const loraId of LORA_IDS) {
    const seeds = await readFileSeeds(loraId);
    const found = seeds.find((seed) => seed.id === id);
    if (found) return found;
  }
  return null;
}

export async function createSeed(
  payload: CreateSeedInput,
): Promise<TrainingSeed> {
  return withLock(payload.loraId, async () => {
    const now = new Date().toISOString();
    const seed: TrainingSeed = {
      id: randomUUID(),
      loraId: payload.loraId,
      input: payload.input,
      output: payload.output,
      authorInitials: payload.authorInitials ?? null,
      notes: payload.notes ?? null,
      status: payload.status ?? "draft",
      createdAt: now,
      updatedAt: now,
    };
    const existing = await readFileSeeds(payload.loraId);
    await writeFileSeeds(payload.loraId, [seed, ...existing]);
    return seed;
  });
}

export async function updateSeed(
  id: string,
  patch: UpdateSeedInput,
): Promise<TrainingSeed> {
  // Find the LoRA the seed belongs to first (without holding a lock),
  // then take the lock for that LoRA's file.
  let owningLora: LoRAId | null = null;
  for (const loraId of LORA_IDS) {
    const seeds = await readFileSeeds(loraId);
    if (seeds.some((seed) => seed.id === id)) {
      owningLora = loraId;
      break;
    }
  }
  if (!owningLora) {
    throw new Error(`updateSeed: no seed found with id ${id}`);
  }
  return withLock(owningLora, async () => {
    const seeds = await readFileSeeds(owningLora!);
    const idx = seeds.findIndex((seed) => seed.id === id);
    if (idx === -1) {
      throw new Error(`updateSeed: no seed found with id ${id}`);
    }
    const previous = seeds[idx];
    const updated: TrainingSeed = {
      ...previous,
      input: patch.input ?? previous.input,
      output: patch.output ?? previous.output,
      authorInitials:
        patch.authorInitials !== undefined
          ? patch.authorInitials
          : previous.authorInitials,
      notes: patch.notes !== undefined ? patch.notes : previous.notes,
      status: patch.status ?? previous.status,
      updatedAt: new Date().toISOString(),
    };
    const next = [...seeds];
    next[idx] = updated;
    await writeFileSeeds(owningLora!, next);
    return updated;
  });
}

export async function deleteSeed(id: string): Promise<void> {
  let owningLora: LoRAId | null = null;
  for (const loraId of LORA_IDS) {
    const seeds = await readFileSeeds(loraId);
    if (seeds.some((seed) => seed.id === id)) {
      owningLora = loraId;
      break;
    }
  }
  if (!owningLora) return; // already gone
  await withLock(owningLora, async () => {
    const seeds = await readFileSeeds(owningLora!);
    const next = seeds.filter((seed) => seed.id !== id);
    await writeFileSeeds(owningLora!, next);
  });
}

/**
 * Per-LoRA counts for the sidebar badges. Reads every LoRA's file in
 * parallel; ENOENT counts as zero rows.
 */
export interface SeedCounts {
  total: number;
  draft: number;
  ready: number;
  approved: number;
}

export async function countSeedsByLora(): Promise<Record<LoRAId, SeedCounts>> {
  const empty = (): SeedCounts => ({
    total: 0,
    draft: 0,
    ready: 0,
    approved: 0,
  });
  const counts = Object.fromEntries(
    LORA_IDS.map((id) => [id, empty()]),
  ) as Record<LoRAId, SeedCounts>;

  const results = await Promise.all(
    LORA_IDS.map(async (loraId) => {
      const seeds = await readFileSeeds(loraId);
      return [loraId, seeds] as const;
    }),
  );
  for (const [loraId, seeds] of results) {
    for (const seed of seeds) {
      counts[loraId].total += 1;
      counts[loraId][seed.status] += 1;
    }
  }
  return counts;
}

/**
 * Cell-by-cell coverage on the LoRA's stack axes (e.g. matType ×
 * medicationStatus). The page renders this as a heatmap so the doctor
 * can see which strata are under-represented.
 */
export type StackCoverage = Record<string, Record<string, number>>;

export function computeStackCoverage(
  seeds: readonly TrainingSeed[],
  rowKey: string,
  colKey: string,
  rowOptions: readonly string[],
  colOptions: readonly string[],
): StackCoverage {
  const grid: StackCoverage = {};
  for (const r of rowOptions) {
    grid[r] = {};
    for (const c of colOptions) grid[r][c] = 0;
  }
  for (const seed of seeds) {
    const r = seed.input[rowKey];
    const c = seed.input[colKey];
    if (typeof r === "string" && typeof c === "string" && grid[r] && c in grid[r]) {
      grid[r][c] += 1;
    }
  }
  return grid;
}

/**
 * Return the resolved data directory for diagnostic display in the UI.
 * Touches the filesystem only to count entries; safe to call at render.
 */
export async function describeDataLocation(): Promise<{
  absolutePath: string;
  exists: boolean;
  fileCount: number;
}> {
  const dir = dataDir();
  try {
    const entries = await readdir(dir);
    return {
      absolutePath: dir,
      exists: true,
      fileCount: entries.filter((e) => e.endsWith(".json")).length,
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { absolutePath: dir, exists: false, fileCount: 0 };
    }
    throw err;
  }
}
