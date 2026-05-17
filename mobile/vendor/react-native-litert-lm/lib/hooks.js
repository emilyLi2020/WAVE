"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useModel = useModel;
const react_1 = require("react");
const modelFactory_1 = require("./modelFactory");
/**
 * Extract a filename from a URL or file path.
 */
function extractFileName(pathOrUrl) {
    return pathOrUrl.split("/").pop() || "model.bin";
}
function useModel(pathOrUrl, config) {
    const modelRef = (0, react_1.useRef)(null);
    const [isReady, setIsReady] = (0, react_1.useState)(false);
    const [isGenerating, setIsGenerating] = (0, react_1.useState)(false);
    const [downloadProgress, setDownloadProgress] = (0, react_1.useState)(0);
    const [error, setError] = (0, react_1.useState)(null);
    const [memorySummary, setMemorySummary] = (0, react_1.useState)(null);
    // Destructure config into primitive values for stable dependency arrays.
    // This prevents infinite re-render loops when consumers pass inline config
    // objects (e.g. useModel(url, { backend: 'cpu' })) without useMemo.
    const autoLoad = config?.autoLoad ?? true;
    const enableMemoryTracking = config?.enableMemoryTracking ?? false;
    const maxMemorySnapshots = config?.maxMemorySnapshots ?? 256;
    const backend = config?.backend;
    const systemPrompt = config?.systemPrompt;
    const maxTokens = config?.maxTokens;
    const engineMaxTokens = config?.engineMaxTokens;
    const outputMaxTokens = config?.outputMaxTokens;
    const temperature = config?.temperature;
    const topK = config?.topK;
    const topP = config?.topP;
    // Build a stable config object from the destructured primitives
    const nativeConfig = (0, react_1.useMemo)(() => ({
        ...(backend !== undefined && { backend }),
        ...(systemPrompt !== undefined && { systemPrompt }),
        ...(maxTokens !== undefined && { maxTokens }),
        ...(engineMaxTokens !== undefined && { engineMaxTokens }),
        ...(outputMaxTokens !== undefined && { outputMaxTokens }),
        ...(temperature !== undefined && { temperature }),
        ...(topK !== undefined && { topK }),
        ...(topP !== undefined && { topP }),
    }), [
        backend,
        systemPrompt,
        maxTokens,
        engineMaxTokens,
        outputMaxTokens,
        temperature,
        topK,
        topP,
    ]);
    /**
     * Refresh memory summary from the tracker's native buffer.
     */
    const refreshMemorySummary = (0, react_1.useCallback)(() => {
        if (modelRef.current?.memoryTracker) {
            setMemorySummary(modelRef.current.memoryTracker.getSummary());
        }
    }, []);
    // Initialize the model instance
    (0, react_1.useEffect)(() => {
        modelRef.current = (0, modelFactory_1.createLLM)({
            enableMemoryTracking,
            maxMemorySnapshots,
        });
        // Reset ready state — the new instance has no model loaded yet.
        // This prevents stale isReady=true after Fast Refresh (which
        // preserves useState but re-runs useEffect).
        setIsReady(false);
        // Cleanup on unmount
        return () => {
            try {
                modelRef.current?.close();
            }
            catch (e) {
                console.warn("Failed to close model", e);
            }
        };
    }, [enableMemoryTracking, maxMemorySnapshots]);
    const load = (0, react_1.useCallback)(async () => {
        setIsReady(false);
        setError(null);
        setDownloadProgress(0);
        try {
            if (modelRef.current) {
                // Delegate URL handling + download to the factory's loadModel,
                // passing our progress setter as the callback (eliminates
                // duplicate download logic that was previously in this hook).
                await modelRef.current.loadModel(pathOrUrl, nativeConfig, (progress) => {
                    setDownloadProgress(progress);
                });
                setIsReady(true);
            }
        }
        catch (e) {
            setError(e.message || "Failed to load model");
            console.error(e);
        }
    }, [pathOrUrl, nativeConfig]);
    (0, react_1.useEffect)(() => {
        if (autoLoad) {
            load();
        }
    }, [autoLoad, load]);
    const generate = (0, react_1.useCallback)(async (prompt) => {
        if (!modelRef.current || !isReady) {
            throw new Error("Model not ready");
        }
        setIsGenerating(true);
        try {
            return new Promise((resolve, reject) => {
                let fullResponse = "";
                try {
                    modelRef.current?.sendMessageAsync(prompt, (token, done) => {
                        fullResponse += token;
                        if (done) {
                            refreshMemorySummary();
                            resolve(fullResponse);
                        }
                    });
                }
                catch (e) {
                    reject(e);
                }
            });
        }
        catch (e) {
            setError(e.message || "Generation failed");
            throw e;
        }
        finally {
            setIsGenerating(false);
        }
    }, [isReady, refreshMemorySummary]);
    const reset = (0, react_1.useCallback)(() => {
        if (modelRef.current) {
            modelRef.current.resetConversation();
        }
    }, []);
    const deleteModel = (0, react_1.useCallback)(async (fileName) => {
        if (modelRef.current) {
            const resolvedName = fileName ?? extractFileName(pathOrUrl);
            await modelRef.current.deleteModel(resolvedName);
            setIsReady(false);
            setDownloadProgress(0);
        }
    }, [pathOrUrl]);
    return {
        model: modelRef.current,
        isReady,
        isGenerating,
        downloadProgress,
        error,
        generate,
        reset,
        deleteModel,
        load,
        memoryTracker: modelRef.current?.memoryTracker ?? null,
        memorySummary,
    };
}
