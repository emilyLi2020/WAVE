// MediaPipe LLM Inference smoke screen — parallel to LiteRTSmokeScreen.
//
// Goals:
//   1. Download model.litertlm from HF (~5 GB MediaPipe-flavored bundle,
//      first-launch only).
//   2. Load it via expo-llm-mediapipe (MediaPipeTasksGenAI iOS SDK, which
//      sits on top of LiteRT — qualifies for the LiteRT prize requirement).
//   3. Generate a chunk-1 prompt and stream the response token-by-token.
//   4. Validate output against chunkLinesSchema (Zod).
//
// This screen is the proof point for the MediaPipe runtime path. If chunk-1
// generates coherently on a physical iPhone, the gemma/* imports can be
// swapped from litert-generators to mediapipe-generators in one commit.

import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { z } from "zod";

import {
  chunkLinesSchema,
  type ChunkGenerationContextPayload,
} from "@/prompts/schemas";
import {
  generateWllamaChunk,
  preloadWaveMediaPipe,
  unloadWaveMediaPipe,
} from "@/runtime/mediapipe-generators";

const SAMPLE_CONTEXT: ChunkGenerationContextPayload = {
  chunkNumber: 1,
  intakeIntensity: 7,
  profile: {
    matType: "buprenorphine",
    medicationStatus: "on_time",
    trigger: "stress",
    triggerOther: null,
    usedSubstanceToday: false,
  },
  sessionHistory: [],
};

type Phase =
  | "idle"
  | "downloading"
  | "loading"
  | "ready"
  | "generating"
  | "valid"
  | "invalid"
  | "error";

export default function MediaPipeSmokeScreen() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [downloadPct, setDownloadPct] = useState(0);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const onLoad = async () => {
    setPhase("downloading");
    setError(null);
    setDownloadPct(0);
    try {
      await preloadWaveMediaPipe({
        onProgress: (p) => {
          setDownloadPct(p);
          if (p >= 1) setPhase("loading");
        },
      });
      setPhase("ready");
    } catch (e) {
      setError(stringifyErr(e));
      setPhase("error");
    }
  };

  const onGenerate = async () => {
    setPhase("generating");
    setError(null);
    setOutput("");
    setElapsedMs(null);
    const t0 = Date.now();
    try {
      const result = await generateWllamaChunk(SAMPLE_CONTEXT, {
        maxNewTokens: 320,
        onDelta: (acc) => setOutput(acc),
      });
      setElapsedMs(Date.now() - t0);

      try {
        const parsed = JSON.parse(result.text);
        chunkLinesSchema.parse(parsed);
        setPhase("valid");
      } catch (validationErr) {
        if (validationErr instanceof z.ZodError) {
          setError(
            `Zod: ${validationErr.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
          );
        } else {
          setError(
            `JSON parse: ${validationErr instanceof Error ? validationErr.message : String(validationErr)}`,
          );
        }
        setPhase("invalid");
      }
    } catch (e) {
      setError(stringifyErr(e));
      setPhase("error");
    }
  };

  const onUnload = async () => {
    await unloadWaveMediaPipe();
    setOutput("");
    setError(null);
    setElapsedMs(null);
    setPhase("idle");
  };

  const isBusy =
    phase === "downloading" || phase === "loading" || phase === "generating";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={styles.sub} selectable>
        Loads gemma-4-e2b WAVE fine-tune (MediaPipe-Model-Maker bundle, ~5 GB)
        via MediaPipeTasksGenAI iOS SDK, generates chunk 1, validates JSON.
      </Text>

      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Phase:</Text>
        <Text style={[styles.statusValue, phaseStyle(phase)]}>{phase}</Text>
        {isBusy && <ActivityIndicator size="small" style={{ marginLeft: 8 }} />}
      </View>

      {phase === "downloading" && (
        <Text style={styles.kv}>
          Download: {(downloadPct * 100).toFixed(1)}%
        </Text>
      )}

      {elapsedMs != null && (
        <View style={styles.panel}>
          <Text style={styles.panelHead}>Generation</Text>
          <Text selectable style={styles.kv}>Total: {elapsedMs} ms</Text>
        </View>
      )}

      {error && (
        <View style={[styles.panel, styles.errorPanel]}>
          <Text style={styles.panelHead}>Error</Text>
          <Text selectable style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.button, isBusy && styles.buttonDisabled]}
          disabled={isBusy}
          onPress={onLoad}
        >
          <Text style={styles.buttonText}>1. Download + Load</Text>
        </Pressable>

        <Pressable
          style={[
            styles.button,
            phase !== "ready" &&
              phase !== "valid" &&
              phase !== "invalid" &&
              styles.buttonDisabled,
          ]}
          disabled={
            phase !== "ready" && phase !== "valid" && phase !== "invalid"
          }
          onPress={onGenerate}
        >
          <Text style={styles.buttonText}>2. Generate Chunk 1</Text>
        </Pressable>

        <Pressable style={styles.buttonSecondary} onPress={onUnload}>
          <Text style={styles.buttonSecondaryText}>Unload</Text>
        </Pressable>
      </View>

      {output.length > 0 && (
        <View style={styles.panel}>
          <Text style={styles.panelHead}>Streaming output</Text>
          <Text selectable style={styles.outputText}>
            {output}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// Native-module throws are plain objects, not Error instances. Walk
// message / code / userInfo before falling back to JSON.stringify.
// (Same pattern documented in handoff.md for whisper.rn errors.)
function stringifyErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof e.message === "string") parts.push(e.message);
    if (typeof e.code === "string") parts.push(`code=${e.code}`);
    if (e.userInfo && typeof e.userInfo === "object") {
      parts.push(`userInfo=${JSON.stringify(e.userInfo)}`);
    }
    if (parts.length > 0) return parts.join(" | ");
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

function phaseStyle(p: Phase) {
  switch (p) {
    case "valid":
      return { color: "#34D399" };
    case "invalid":
    case "error":
      return { color: "#F87171" };
    case "ready":
      return { color: "#22D3EE" };
    case "generating":
    case "loading":
    case "downloading":
      return { color: "#FBBF24" };
    default:
      return { color: "#9CA3AF" };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#08080C" },
  content: { padding: 16, gap: 12 },
  sub: { color: "#9CA3AF", fontSize: 13 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  statusLabel: { color: "#9CA3AF", fontSize: 14 },
  statusValue: { fontSize: 14, fontWeight: "600" },
  panel: {
    backgroundColor: "#16161F",
    padding: 12,
    borderRadius: 8,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#23232F",
    gap: 4,
  },
  errorPanel: { borderColor: "#7F1D1D" },
  panelHead: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  kv: { color: "#F1F1F4", fontSize: 13, fontFamily: "Menlo" },
  outputText: {
    color: "#F1F1F4",
    fontSize: 13,
    fontFamily: "Menlo",
    lineHeight: 18,
  },
  errorText: { color: "#F87171", fontSize: 13, fontFamily: "Menlo" },
  buttonRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  button: {
    backgroundColor: "#6366F1",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderCurve: "continuous",
  },
  buttonDisabled: { backgroundColor: "#3F3F50", opacity: 0.5 },
  buttonText: { color: "#F1F1F4", fontWeight: "600", fontSize: 13 },
  buttonSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#3F3F50",
  },
  buttonSecondaryText: { color: "#9CA3AF", fontWeight: "600", fontSize: 13 },
});
