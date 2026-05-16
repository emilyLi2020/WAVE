// Single source of truth for all downloaded model artifacts. Test pages and
// runtime wrappers call `ensureModel(id)` to get a local path; the function
// is idempotent — returns the cached path on cache hit, downloads on miss.
//
// Storage:
//   documentDirectory/wave-models/<id>/<filename>
//
// We pick documentDirectory (not cacheDirectory) for the LiteRT bundle so
// iOS doesn't reclaim a 4.7 GB download under storage pressure. Downside:
// Documents/ is backed up to iCloud by default. Polish item: set
// NSURLIsExcludedFromBackupKey on the file once expo-file-system exposes
// that flag, or move to Library/Application Support/.
//
// Cache validity = (file exists) AND (size >= manifest.minBytes). A partial
// download from a previous interrupted session is treated as a miss and
// re-fetched (no resume yet — manifest.expectedBytes lets us add that
// later via the resumeData field on FileSystem.DownloadResumable).

import * as FileSystem from "expo-file-system";

export type ModelId = "litert-wave" | "whisper-tiny-en";

export interface ModelManifest {
  id: ModelId;
  label: string;
  filename: string;
  url: string;
  /** Authoritative byte size — used for the cache panel's "expected" column. */
  expectedBytes: number;
  /** Minimum size to consider a cached file valid (guards partial downloads). */
  minBytes: number;
}

export const MODELS: Record<ModelId, ModelManifest> = {
  "litert-wave": {
    id: "litert-wave",
    label: "Gemma 4 LITERTLM (WAVE fine-tune)",
    filename: "model.litertlm",
    url: "https://huggingface.co/Maelstrome/lora-wave-session-r32/resolve/main/mediapipe/model.litertlm",
    expectedBytes: 5_071_689_680,
    minBytes: 5_000_000_000,
  },
  "whisper-tiny-en": {
    id: "whisper-tiny-en",
    label: "Whisper tiny.en (GGML)",
    filename: "ggml-tiny.en.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
    expectedBytes: 77_704_716,
    minBytes: 70_000_000,
  },
};

// ────────────────────────────────────────────────────────────────────────
// Path helpers
// ────────────────────────────────────────────────────────────────────────

function getDocDir(): string {
  // expo-file-system 19.x exposes `documentDirectory`. Older/newer variants
  // moved to `Paths.document.uri`. Try both.
  const dir =
    (FileSystem as any).documentDirectory ??
    ((FileSystem as any).Paths?.document?.uri as string | undefined);
  if (!dir) {
    throw new Error("expo-file-system documentDirectory is unavailable");
  }
  return dir;
}

function getModelDir(id: ModelId): string {
  return `${getDocDir()}wave-models/${id}/`;
}

function getModelPath(id: ModelId): string {
  return `${getModelDir(id)}${MODELS[id].filename}`;
}

// ────────────────────────────────────────────────────────────────────────
// Inspection
// ────────────────────────────────────────────────────────────────────────

export interface CacheEntry {
  id: ModelId;
  label: string;
  filename: string;
  path: string;
  url: string;
  cached: boolean;
  bytes: number;
  expectedBytes: number;
}

export async function inspectModel(id: ModelId): Promise<CacheEntry> {
  const manifest = MODELS[id];
  const path = getModelPath(id);
  const info = await FileSystem.getInfoAsync(path);
  const bytes = info.exists ? (info.size ?? 0) : 0;
  return {
    id,
    label: manifest.label,
    filename: manifest.filename,
    path,
    url: manifest.url,
    cached: info.exists && bytes >= manifest.minBytes,
    bytes,
    expectedBytes: manifest.expectedBytes,
  };
}

export async function inspectCache(): Promise<CacheEntry[]> {
  const ids = Object.keys(MODELS) as ModelId[];
  return await Promise.all(ids.map((id) => inspectModel(id)));
}

// ────────────────────────────────────────────────────────────────────────
// Ensure (cache hit or download)
// ────────────────────────────────────────────────────────────────────────

export interface EnsureOptions {
  /** Called with progress in [0, 1]. */
  onProgress?: (pct: number) => void;
  /**
   * Optional abort signal. expo-file-system doesn't honor signals natively;
   * we check between progress callbacks and reject if aborted, but the
   * native task may continue briefly.
   */
  signal?: AbortSignal;
  /**
   * If true, delete any existing cached file first and force a re-download.
   * Useful for the "Re-download" button in the cache panel.
   */
  force?: boolean;
}

export async function ensureModel(
  id: ModelId,
  opts?: EnsureOptions,
): Promise<string> {
  const manifest = MODELS[id];
  const dir = getModelDir(id);
  const path = getModelPath(id);

  if (opts?.force) {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } else {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists && (info.size ?? 0) >= manifest.minBytes) {
      opts?.onProgress?.(1);
      return path;
    }
    // Partial download from a previous attempt? Treat as a miss and
    // start fresh. Resume support can be added by persisting the
    // DownloadResumable's resumeData in a future revision.
    if (info.exists) {
      await FileSystem.deleteAsync(path, { idempotent: true });
    }
  }

  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // already exists — fine
  }

  let aborted = false;
  const dl = FileSystem.createDownloadResumable(
    manifest.url,
    path,
    {},
    (progress) => {
      if (opts?.signal?.aborted) {
        aborted = true;
        return;
      }
      if (progress.totalBytesExpectedToWrite > 0) {
        opts?.onProgress?.(
          progress.totalBytesWritten / progress.totalBytesExpectedToWrite,
        );
      }
    },
  );

  const result = await dl.downloadAsync();
  if (aborted || opts?.signal?.aborted) {
    await FileSystem.deleteAsync(path, { idempotent: true });
    throw new DOMException("Aborted", "AbortError");
  }
  if (!result?.uri) {
    throw new Error(`download produced no uri for ${id}`);
  }

  // Sanity: did we actually get the expected file?
  const after = await FileSystem.getInfoAsync(result.uri);
  const afterSize = after.exists ? (after.size ?? 0) : 0;
  if (!after.exists || afterSize < manifest.minBytes) {
    await FileSystem.deleteAsync(result.uri, { idempotent: true });
    throw new Error(
      `cached ${id} is smaller than expected (got ${afterSize}b, expected at least ${manifest.minBytes}b)`,
    );
  }

  return result.uri;
}

// ────────────────────────────────────────────────────────────────────────
// Eviction
// ────────────────────────────────────────────────────────────────────────

export async function clearModel(id: ModelId): Promise<void> {
  await FileSystem.deleteAsync(getModelPath(id), { idempotent: true });
}

export async function clearAllModels(): Promise<void> {
  for (const id of Object.keys(MODELS) as ModelId[]) {
    await clearModel(id);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Formatting helpers (for cache panel UI)
// ────────────────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (!bytes || !Number.isFinite(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 0)} ${units[i]}`;
}
