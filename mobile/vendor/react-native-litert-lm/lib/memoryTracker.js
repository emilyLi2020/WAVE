"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMemoryTracker = createMemoryTracker;
exports.createNativeBuffer = createNativeBuffer;
const react_native_nitro_modules_1 = require("react-native-nitro-modules");
/** Number of Float64 fields per snapshot */
const FIELDS_PER_SNAPSHOT = 4;
/** Bytes per Float64 value */
const BYTES_PER_FIELD = Float64Array.BYTES_PER_ELEMENT; // 8
/**
 * Create a new memory tracker backed by a native ArrayBuffer.
 *
 * @param maxSnapshots Maximum number of snapshots to store (default: 256)
 * @returns A MemoryTracker instance
 */
function createMemoryTracker(maxSnapshots = 256) {
    const bufferSize = maxSnapshots * FIELDS_PER_SNAPSHOT * BYTES_PER_FIELD;
    // Use NitroModules.createNativeArrayBuffer for native-backed allocation.
    const nativeBuffer = react_native_nitro_modules_1.NitroModules.createNativeArrayBuffer(bufferSize);
    const view = new Float64Array(nativeBuffer);
    let currentIndex = 0;
    return {
        record(snapshot) {
            if (currentIndex >= maxSnapshots) {
                return false;
            }
            const offset = currentIndex * FIELDS_PER_SNAPSHOT;
            view[offset] = snapshot.timestamp;
            view[offset + 1] = snapshot.nativeHeapBytes;
            view[offset + 2] = snapshot.residentBytes;
            view[offset + 3] = snapshot.availableMemoryBytes;
            currentIndex++;
            return true;
        },
        getSnapshots() {
            const snapshots = [];
            for (let i = 0; i < currentIndex; i++) {
                const offset = i * FIELDS_PER_SNAPSHOT;
                snapshots.push({
                    timestamp: view[offset],
                    nativeHeapBytes: view[offset + 1],
                    residentBytes: view[offset + 2],
                    availableMemoryBytes: view[offset + 3],
                });
            }
            return snapshots;
        },
        getSnapshotCount() {
            return currentIndex;
        },
        getCapacity() {
            return maxSnapshots;
        },
        getPeakMemory() {
            let peak = 0;
            for (let i = 0; i < currentIndex; i++) {
                const rss = view[i * FIELDS_PER_SNAPSHOT + 2];
                if (rss > peak) {
                    peak = rss;
                }
            }
            return peak;
        },
        getLatestSnapshot() {
            if (currentIndex === 0)
                return undefined;
            const offset = (currentIndex - 1) * FIELDS_PER_SNAPSHOT;
            return {
                timestamp: view[offset],
                nativeHeapBytes: view[offset + 1],
                residentBytes: view[offset + 2],
                availableMemoryBytes: view[offset + 3],
            };
        },
        getNativeBuffer() {
            return nativeBuffer;
        },
        getView() {
            return view;
        },
        reset() {
            view.fill(0);
            currentIndex = 0;
        },
        getSummary() {
            let peakRss = 0;
            let peakHeap = 0;
            let sumRss = 0;
            let firstRss = 0;
            let lastRss = 0;
            let lastHeap = 0;
            for (let i = 0; i < currentIndex; i++) {
                const offset = i * FIELDS_PER_SNAPSHOT;
                const heap = view[offset + 1];
                const rss = view[offset + 2];
                if (rss > peakRss)
                    peakRss = rss;
                if (heap > peakHeap)
                    peakHeap = heap;
                sumRss += rss;
                if (i === 0)
                    firstRss = rss;
                if (i === currentIndex - 1) {
                    lastRss = rss;
                    lastHeap = heap;
                }
            }
            return {
                snapshotCount: currentIndex,
                peakResidentBytes: peakRss,
                averageResidentBytes: currentIndex > 0 ? sumRss / currentIndex : 0,
                currentResidentBytes: lastRss,
                peakNativeHeapBytes: peakHeap,
                currentNativeHeapBytes: lastHeap,
                residentDeltaBytes: lastRss - firstRss,
                trackerBufferSizeBytes: bufferSize,
            };
        },
    };
}
/**
 * Create a native ArrayBuffer for efficient data transfer.
 *
 * A convenience wrapper around `NitroModules.createNativeArrayBuffer()`.
 *
 * @param size Size in bytes
 * @returns A native-backed ArrayBuffer
 */
function createNativeBuffer(size) {
    return react_native_nitro_modules_1.NitroModules.createNativeArrayBuffer(size);
}
