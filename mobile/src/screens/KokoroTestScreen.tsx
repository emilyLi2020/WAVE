// Kokoro TTS test page — text → audio via react-native-sherpa-onnx.
//
// Kokoro ships as a multi-file ONNX bundle (~330 MB int8): model.onnx,
// voices.bin, tokens.txt, lexicon-us-en.txt, and an espeak-ng-data/ tree.
// sherpa-onnx requires the entire directory locally. Two ways to land it:
//
//   a) Bundle via expo assets — bloats the IPA but no first-launch wait.
//   b) Download at runtime via expo-file-system from a fixed HF URL and
//      cache to documentDirectory + 'wave-models/kokoro/'. Same pattern as
//      LiteRT + Whisper. Plus an unzip step (use expo-file-system's
//      readAsStringAsync or write a thin zip helper).
//
// For this first smoke (path b), we point at a single .tar / .zip of the
// sherpa-onnx-kokoro-en-v0.19 model. The test page exposes a "Download +
// extract", "Speak", and "Play" cycle. Until the bundle is in place, the
// page guides the user through what's needed.

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import * as FileSystem from "expo-file-system";

// Lazy-import — react-native-sherpa-onnx pulls in native bindings only
// resolved on device. Keeps Metro from crashing on web/dev imports.
type TtsEngine = {
  generateSpeech: (text: string, opts?: any) => Promise<any>;
  destroy: () => Promise<void>;
};

const DEFAULT_TEXT =
  "Welcome back. Take a breath. We're going to surf this together.";

// Bundle URL — placeholder. Replace with the model archive we publish to
// HF (Maelstrome/lora-wave-session-r32/kokoro/kokoro-en-int8.tar.bz2 or
// similar). Until then this page surfaces what the test gates on.
const KOKORO_BUNDLE_URL: string | null = null;

type Phase =
  | "idle"
  | "needsBundle"
  | "downloading"
  | "loading"
  | "ready"
  | "speaking"
  | "played"
  | "error";

export default function KokoroTestScreen() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [downloadPct, setDownloadPct] = useState(0);
  const [text, setText] = useState(DEFAULT_TEXT);
  const [error, setError] = useState<string | null>(null);
  const [genMs, setGenMs] = useState(0);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const engineRef = useRef<TtsEngine | null>(null);

  useEffect(() => {
    return () => {
      engineRef.current?.destroy().catch(() => {});
    };
  }, []);

  const onLoad = async () => {
    setError(null);
    if (!KOKORO_BUNDLE_URL) {
      setPhase("needsBundle");
      return;
    }
    // TODO(kokoro-bundle): wire download → expo-file-system → unzip →
    // createTTS with modelType: 'kokoro', modelPath: { type: 'file', path: dir },
    // providers: ['CoreMLExecutionProvider'], modelOptions: { kokoro: { ... } }.
    setPhase("error");
    setError("Bundle URL not configured yet.");
  };

  const onSpeak = async () => {
    if (!engineRef.current) {
      setError("Kokoro not loaded yet");
      setPhase("error");
      return;
    }
    setError(null);
    setPhase("speaking");
    try {
      const t0 = Date.now();
      const audio = await engineRef.current.generateSpeech(text);
      const t1 = Date.now();
      setGenMs(t1 - t0);

      const docDir =
        (FileSystem as any).documentDirectory ??
        ((FileSystem as any).Paths?.document?.uri as string | undefined);
      const outPath = `${docDir}wave-models/kokoro/out-${Date.now()}.wav`;
      // saveAudioToFile would go here once the engine is wired. Holding for
      // bundle integration.
      setAudioPath(outPath);
      setPhase("played");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const isBusy =
    phase === "downloading" || phase === "loading" || phase === "speaking";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Kokoro TTS smoke</Text>
      <Text style={styles.sub}>
        react-native-sherpa-onnx + Kokoro-82M ONNX (CoreML EP). Text → audio on iPhone.
      </Text>

      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Phase:</Text>
        <Text style={[styles.statusValue, phaseStyle(phase)]}>{phase}</Text>
        {isBusy && <ActivityIndicator size="small" style={{ marginLeft: 8 }} />}
      </View>

      {phase === "needsBundle" && (
        <View style={styles.panel}>
          <Text style={styles.panelHead}>Bundle setup required</Text>
          <Text style={styles.bodyText}>
            The Kokoro model is a multi-file ONNX bundle (~330 MB). Two paths:
          </Text>
          <Text style={[styles.bodyText, { marginTop: 6 }]}>
            (a) Bundle it in mobile/assets/kokoro/ and update KOKORO_BUNDLE_URL
            to null + add a file:// load path. EAS Build packages it into the IPA.
          </Text>
          <Text style={[styles.bodyText, { marginTop: 6 }]}>
            (b) Upload sherpa-onnx-kokoro-en-vNNN.tar.bz2 to
            Maelstrome/lora-wave-session-r32/kokoro/ on HF, set the URL constant,
            and the page downloads + unzips on first launch.
          </Text>
        </View>
      )}

      {phase === "downloading" && (
        <Text style={styles.kv}>Download: {(downloadPct * 100).toFixed(1)}%</Text>
      )}

      {phase === "played" && (
        <View style={styles.panel}>
          <Text style={styles.panelHead}>Result</Text>
          <Text style={styles.kv}>Generation: {genMs.toFixed(0)} ms</Text>
          <Text style={styles.kv}>Audio: {audioPath ?? "—"}</Text>
        </View>
      )}

      {error && (
        <View style={[styles.panel, styles.errorPanel]}>
          <Text style={styles.panelHead}>Error</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Text style={styles.label}>Text to synthesize</Text>
      <TextInput
        style={styles.textInput}
        multiline
        value={text}
        onChangeText={setText}
        placeholder="Type something Kokoro should speak…"
        placeholderTextColor="#6B7280"
      />

      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.button, isBusy && styles.buttonDisabled]}
          disabled={isBusy}
          onPress={onLoad}
        >
          <Text style={styles.buttonText}>1. Download + Load Kokoro</Text>
        </Pressable>

        <Pressable
          style={[
            styles.button,
            phase !== "ready" && phase !== "played" && styles.buttonDisabled,
          ]}
          disabled={phase !== "ready" && phase !== "played"}
          onPress={onSpeak}
        >
          <Text style={styles.buttonText}>2. Speak</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function phaseStyle(p: Phase) {
  switch (p) {
    case "played":
      return { color: "#34D399" };
    case "error":
      return { color: "#F87171" };
    case "ready":
      return { color: "#22D3EE" };
    case "speaking":
    case "loading":
    case "downloading":
      return { color: "#FBBF24" };
    case "needsBundle":
      return { color: "#FBBF24" };
    default:
      return { color: "#9CA3AF" };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#08080C" },
  content: { padding: 16, gap: 12 },
  heading: { color: "#F1F1F4", fontSize: 20, fontWeight: "700" },
  sub: { color: "#9CA3AF", fontSize: 13 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  statusLabel: { color: "#9CA3AF", fontSize: 14 },
  statusValue: { fontSize: 14, fontWeight: "600" },
  panel: {
    backgroundColor: "#16161F",
    padding: 12,
    borderRadius: 8,
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
  bodyText: { color: "#F1F1F4", fontSize: 13, lineHeight: 18 },
  errorText: { color: "#F87171", fontSize: 13, fontFamily: "Menlo" },
  label: { color: "#9CA3AF", fontSize: 12, marginTop: 4 },
  textInput: {
    backgroundColor: "#16161F",
    borderWidth: 1,
    borderColor: "#23232F",
    borderRadius: 6,
    padding: 10,
    color: "#F1F1F4",
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  buttonRow: { gap: 8 },
  button: {
    backgroundColor: "#6366F1",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  buttonDisabled: { backgroundColor: "#3F3F50", opacity: 0.5 },
  buttonText: { color: "#F1F1F4", fontWeight: "600", fontSize: 14, textAlign: "center" },
});
