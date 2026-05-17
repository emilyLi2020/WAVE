/**
 * Memory tracking utilities for LiteRT-LM using real native memory metrics.
 *
 * Records real memory usage from OS-level APIs via `getMemoryUsage()`,
 * and stores snapshots in a native-backed ArrayBuffer allocated via
 * `NitroModules.createNativeArrayBuffer()` (v0.35+) for zero-copy interop.
 *
 * @example
 * ```typescript
 * import { createMemoryTracker } from 'react-native-litert-lm';
 *
 * const tracker = createMemoryTracker(100);
 *
 * // Record a real snapshot (typically called internally after inference)
 * tracker.record({
 *   timestamp: Date.now(),
 *   nativeHeapBytes: usage.nativeHeapBytes,
 *   residentBytes: usage.residentBytes,
 *   availableMemoryBytes: usage.availableMemoryBytes,
 * });
 *
 * console.log(`Peak RSS: ${tracker.getPeakMemory()} bytes`);
 * ```
 */
/**
 * A single memory usage snapshot with real data from OS APIs.
 */
export interface MemorySnapshot {
    /** Unix timestamp in milliseconds */
    timestamp: number;
    /** Native heap allocated bytes (Debug.getNativeHeapAllocatedSize on Android, task_info on iOS) */
    nativeHeapBytes: number;
    /** Process resident set size (RSS) in bytes */
    residentBytes: number;
    /** Available system memory in bytes */
    availableMemoryBytes: number;
}
/**
 * Memory tracker that stores snapshots in a native-backed ArrayBuffer.
 *
 * Uses `NitroModules.createNativeArrayBuffer()` to allocate the backing
 * buffer in native (C++) memory, ensuring zero-copy interop with native
 * methods and keeping memory tracking data off the JS heap.
 */
export interface MemoryTracker {
    /**
     * Record a new memory snapshot.
     * @param snapshot The memory usage data to record
     * @returns true if recorded, false if buffer is full
     */
    record(snapshot: MemorySnapshot): boolean;
    /**
     * Get all recorded snapshots as structured objects.
     */
    getSnapshots(): MemorySnapshot[];
    /**
     * Get the number of recorded snapshots.
     */
    getSnapshotCount(): number;
    /**
     * Get the maximum number of snapshots this tracker can hold.
     */
    getCapacity(): number;
    /**
     * Get the peak resident set size across all snapshots.
     */
    getPeakMemory(): number;
    /**
     * Get the latest memory snapshot, or undefined if none recorded.
     */
    getLatestSnapshot(): MemorySnapshot | undefined;
    /**
     * Get the underlying native ArrayBuffer.
     * This buffer is allocated via `NitroModules.createNativeArrayBuffer()`
     * and lives in native memory, enabling zero-copy transfer to native methods.
     */
    getNativeBuffer(): ArrayBuffer;
    /**
     * Get the Float64Array view over the native buffer.
     */
    getView(): Float64Array;
    /**
     * Reset the tracker, clearing all recorded snapshots.
     * The native buffer is preserved (not reallocated).
     */
    reset(): void;
    /**
     * Get a summary of memory usage statistics.
     */
    getSummary(): MemoryTrackerSummary;
}
/**
 * Summary statistics from the memory tracker.
 */
export interface MemoryTrackerSummary {
    /** Number of snapshots recorded */
    snapshotCount: number;
    /** Peak resident set size in bytes */
    peakResidentBytes: number;
    /** Average resident set size in bytes */
    averageResidentBytes: number;
    /** Latest resident set size in bytes */
    currentResidentBytes: number;
    /** Peak native heap allocated in bytes */
    peakNativeHeapBytes: number;
    /** Latest native heap allocated in bytes */
    currentNativeHeapBytes: number;
    /** RSS delta from first to last snapshot in bytes */
    residentDeltaBytes: number;
    /** Size of the native tracking buffer itself in bytes */
    trackerBufferSizeBytes: number;
}
/**
 * Create a new memory tracker backed by a native ArrayBuffer.
 *
 * @param maxSnapshots Maximum number of snapshots to store (default: 256)
 * @returns A MemoryTracker instance
 */
export declare function createMemoryTracker(maxSnapshots?: number): MemoryTracker;
/**
 * Create a native ArrayBuffer for efficient data transfer.
 *
 * A convenience wrapper around `NitroModules.createNativeArrayBuffer()`.
 *
 * @param size Size in bytes
 * @returns A native-backed ArrayBuffer
 */
export declare function createNativeBuffer(size: number): ArrayBuffer;
