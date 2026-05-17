import { LiteRTLM, LLMConfig } from "./specs/LiteRTLM.nitro";
import { MemoryTracker } from "./memoryTracker";
/**
 * Extended LiteRT-LM instance with optional memory tracking and
 * augmented loadModel that accepts a download progress callback.
 */
export type LiteRTLMInstance = Omit<LiteRTLM, "loadModel"> & {
    memoryTracker?: MemoryTracker;
    loadModel: (pathOrUrl: string, config?: LLMConfig, onDownloadProgress?: (progress: number) => void) => Promise<void>;
};
/**
 * Creates a new LiteRT-LM inference engine instance.
 *
 * Optionally creates a native-backed memory tracker using
 * `NitroModules.createNativeArrayBuffer()` (v0.35+) for efficient
 * zero-copy memory usage tracking.
 *
 * @param options.enableMemoryTracking Enable automatic memory tracking (default: false)
 * @param options.maxMemorySnapshots Maximum number of memory snapshots to store (default: 256)
 */
export declare function createLLM(options?: {
    enableMemoryTracking?: boolean;
    maxMemorySnapshots?: number;
}): LiteRTLMInstance;
