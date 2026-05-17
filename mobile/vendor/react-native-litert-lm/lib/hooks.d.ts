import { LLMConfig } from "./index";
import type { LiteRTLMInstance } from "./modelFactory";
import type { MemoryTracker, MemoryTrackerSummary } from "./memoryTracker";
export interface UseModelConfig extends LLMConfig {
    autoLoad?: boolean;
    /**
     * Enable memory tracking using native ArrayBuffers (v0.35+).
     * When enabled, memory usage is tracked after each inference call
     * using `NitroModules.createNativeArrayBuffer()` for zero-copy storage.
     * @default false
     */
    enableMemoryTracking?: boolean;
    /**
     * Maximum number of memory snapshots to store.
     * Each snapshot uses 32 bytes of native memory.
     * @default 256
     */
    maxMemorySnapshots?: number;
}
export interface UseModelResult {
    model: LiteRTLMInstance | null;
    isReady: boolean;
    isGenerating: boolean;
    downloadProgress: number;
    error: string | null;
    generate: (prompt: string) => Promise<string>;
    reset: () => void;
    /**
     * Delete the model file. If no fileName is provided, derives it from
     * the URL/path passed to useModel.
     */
    deleteModel: (fileName?: string) => Promise<void>;
    load: () => Promise<void>;
    /**
     * Memory tracker instance (available when enableMemoryTracking is true).
     * Uses native ArrayBuffers allocated via `NitroModules.createNativeArrayBuffer()`
     * for efficient, zero-copy memory usage tracking.
     */
    memoryTracker: MemoryTracker | null;
    /**
     * Current memory tracking summary (null if tracking is disabled).
     * Updates automatically after each inference call.
     */
    memorySummary: MemoryTrackerSummary | null;
}
export declare function useModel(pathOrUrl: string, config?: UseModelConfig): UseModelResult;
