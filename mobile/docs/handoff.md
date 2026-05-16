# mobile/ handoff

Skim this if you just cloned the repo or are starting a fresh session. For
the deeper architecture, read `docs/architecture.md` next.

## ✅ LiteRT-LM iOS framework rebuilt (2026-05-16)

Issue #13 is resolved up through local runtime verification. A current
LiteRT-LM `LiteRTLM.xcframework` was rebuilt on macOS from
`google-ai-edge/LiteRT-LM` `main` commit
`2f70ce879d1dd4c4a22e597b2c0a03f9799fef7d` using Xcode 26.5 and the
wrapper's `scripts/build-ios-engine.sh` flow. The zipped framework and
build metadata are on Hugging Face:

- `Maelstrome/lora-wave-session-r32/native/ios/LiteRTLM-ios-frameworks.zip`
- `Maelstrome/lora-wave-session-r32/native/ios/LiteRTLM-ios-frameworks-build-metadata.json`

`mobile/scripts/install-litert-ios-framework.js` now runs after `npm install`,
downloads that HF asset, verifies byte size + SHA256, and installs it into
`node_modules/react-native-litert-lm/ios/Frameworks/LiteRTLM.xcframework`.
This intentionally overwrites the stale framework that ships with
`react-native-litert-lm@0.3.6`.

Local verification passed with the rebuilt LiteRT-LM runtime against the
current WAVE bundle at
`Maelstrome/lora-wave-session-r32/litert-lm-v3/model.litertlm`
(`2,560,956,368` bytes): the macOS CLI loaded the bundle on CPU and generated
`Hi! How can I help you today?` for prompt `hi`. macOS GPU registration failed
for the CLI environment, so the remaining acceptance check is the physical
iPhone `/tests/litert` smoke using Metal.

## ✅ Whisper STT confirmed working on-device (2026-05-16)

`/tests/whisper` end-to-end pass on the physical iPhone:
mic → 16 kHz mono 16-bit LPCM WAV → `ggml-base.en` on Metal → transcript.

Two gotchas worth remembering — both surfaced during the first device run:

1. **whisper.rn rejects M4A/AAC with "invalid wav file".** It only accepts
   real WAV/RIFF (16 kHz mono 16-bit linear PCM). `RecordingPresets.HIGH_QUALITY`
   from expo-audio gives you 44.1 kHz stereo AAC in an M4A container — the
   first byte of the header fails the RIFF check immediately, no useful error.
   Fix: a custom `WHISPER_RECORDING_OPTIONS` in `WhisperTestScreen.tsx` with
   `.wav` extension + `IOSOutputFormat.LINEARPCM` + `linearPCMBitDepth: 16`
   + `sampleRate: 16000` + `numberOfChannels: 1`. AVAudioRecorder writes a
   proper RIFF/WAVE header when given that combo. Side benefit: recording
   already at whisper's native rate, no in-engine resample tax on RTF.

2. **Native-module throws are plain objects, not Error instances.**
   `String(plainObj)` yields the legendary `"[object Object]"`. The screen
   now has a `stringifyErr()` helper that walks `message` / `code` / `userInfo`
   before falling back to `JSON.stringify`. Reuse the pattern in other test
   screens that catch errors from whisper.rn / expo-audio / sherpa-onnx —
   they all share this throw shape.

Android note: `MediaRecorder` cannot emit raw PCM WAV; this preset is iOS-only.
When the Android path matters, the usual route is `react-native-audio-record`
(emits raw PCM that you wrap in a WAV header yourself) or whisper.rn's
`realtimeTranscribe` which takes raw PCM frames directly.

Model upgrade: cache layer now ships `whisper-base-en` (148 MB) alongside
`whisper-tiny-en` (78 MB, still used by `CombinedVoiceTestScreen.tsx`).
Loose end: combined screen should follow once base.en is validated for
the full loop's latency budget.

## Previous bundle blocker recap (2026-05-16)

Issue #11 is closed. The fine-tune was re-exported via `litert-torch 0.9.0`
on a rented Threadripper box (PEFT merge → `litert_torch.generative.export_hf`
with `dynamic_wi4_afp32` quant + `externalize_embedder=True`). New bundle is
at `Maelstrome/lora-wave-session-r32/litert-lm-v3/model.litertlm` (2.56 GB);
older `litert-lm`, `litert-lm-v2`, and `mediapipe` artifacts are preserved
as diagnostics. Magic header bytes match the stock
`litert-community/gemma-4-E2B-it.litertlm` exactly.

`mobile/src/runtime/model-cache.ts` already points at the new URL. **If your
device had the old 5 GB bundle cached**, the cache-hit check now requires
exact size match against `expectedBytes`, so the stale file will be discarded
and the new one downloaded on next `ensureModel('litert-wave')`.

### Original blocker writeup (kept for context)

**The LITERTLM bundle on HF was in the wrong flavor for our wrapper.**

Quick recap of how we found this:

1. Smoke screen on a physical iPhone hit `errno 2` from the LiteRT-LM C++
   engine — turned out to be a `file://` URI vs raw POSIX path mismatch
   (commit `2b6fdc6` strips the prefix before passing to `loadModel`).
2. Next iteration: file found, readable, but engine creation still fails
   ("Failed to create LiteRT-LM engine. Tried backend 'gpu' and CPU fallback").
3. Diagnosis: our `Maelstrome/lora-wave-session-r32/mediapipe/model.litertlm`
   was produced by **Google's MediaPipe Model Maker** (per its own
   [HF README](https://huggingface.co/Maelstrome/lora-wave-session-r32/blob/main/mediapipe/README.md)).
   The wrapper `react-native-litert-lm` calls `litert_lm_engine_create()` —
   a different Google runtime that won't load MediaPipe-flavored bundles
   even though they share the `.litertlm` extension and `LITERTLM` magic
   bytes. Same trap as the MediaPipe-web postmortem
   (`docs/postmortems/mediapipe-finetune.md`), one layer deeper.
4. Size check confirms: stock `litert-community/gemma-4-E2B-it.litertlm` is
   2.59 GB; ours is 5.07 GB. The LiteRT-LM build mmaps embedding params
   separately and runs ~half the on-disk footprint.
5. **Confirmation (2026-05-16):** stock-Gemma diagnostic button (added in
   `5288b28`) was tapped on the physical iPhone — the unmodified
   `litert-community/gemma-4-E2B-it.litertlm` loads through the same
   wrapper. Same device, same wrapper, only the bundle differs.

### Paths forward

| Path | Status | Cost | Owner |
|---|---|---|---|
| Re-export via `litert-torch` Generative API | Filed as issue #11 | Needs a **Linux x86_64** box (not Mac — `litert-torch` is Linux-only) | Delegated |
| Verify the diagnosis with stock Gemma 4 | Optional sanity check | Add a "Try stock Gemma" button to the smoke screen pointing at `https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm` | Next session |
| Contingency: pivot to llama.rn + GGUF | Documented in plan, not wired | ~3-4h to wire `llamarn-generators.ts` against `Maelstrome/lora-wave-session-r32/gguf/` | If #11 stalls |

Until #11 lands, the LiteRT smoke screen is the **only** blocked test page.
Whisper STT and Kokoro TTS are independent and should run; the combined
voice loop just gates the LLM step on LiteRT.

## TL;DR — overall state

- Branch: `pivot/react-native-litert` (~14 commits, all on a clean main+1).
- Type-check is green; `npx expo-doctor` is 17/17 green.
- The user is running `npx expo start --dev-client` and successfully
  installed a dev build on a physical iPhone, after the EAS build
  (`react-native-litert-lm@0.3.6` — `0.3.7` is broken upstream, filed as
  [hung-yueh/react-native-litert-lm#9](https://github.com/hung-yueh/react-native-litert-lm/issues/9)).
- Routes structure (`app/`): dev menu home → `/tests/{litert,whisper,kokoro,combined}`
  and `/session/{intake,safety,chunk,checkin,reflection}`.
- Unified model cache (`src/runtime/model-cache.ts`) + cache panel embedded
  in the dev menu home.

### Test pages

| Route | What it does | State |
|---|---|---|
| `/tests/litert` | Download `model.litertlm` from HF → load via `react-native-litert-lm` → generate chunk 1 → Zod-validate. Memory + tok/s + TTFT panel. | Ready to test on device (#11 resolved) |
| `/tests/whisper` | Push-to-talk: record 16 kHz mono LPCM WAV via `expo-audio` → `whisper.rn` (ggml-base.en on Metal GPU) → transcript + RTF. | ✅ Working on iPhone (2026-05-16) |
| `/tests/kokoro` | Text input → `react-native-sherpa-onnx` Kokoro TTS (CoreML EP, ANE) → sentence-streaming playback via native PCM queue. Model fetched at runtime on first use. See `docs/kokoro-tts.md`. | ✅ Production-ready |
| `/tests/combined` | Push-to-talk MVP: record → Whisper → LiteRT → Kokoro → play. State machine for the four subsystems. | Wired; depends on `/tests/litert` working |

### Production session screens

All five (`intake`, `safety`, `chunk`, `checkin`, `reflection`) exist as
navigable skeletons under `app/session/`. They link forward in the flow
but don't run the reducer yet — the reducer (`src/session/session-machine.ts`)
is ported but not wired.

## First-launch checklist

```bash
# 1. Enroll in the Apple Developer Program ($99/yr, 24-48h).
#    Required for com.apple.developer.kernel.increased-memory-limit.

# 2. Install EAS CLI and log in.
npm i -g eas-cli
eas login

# 3. Register your physical iPhone 15 Pro / 16 Pro UDID.
cd mobile
eas device:create

# 4. Cloud-build the iOS dev client and auto-upload to TestFlight in one go.
eas build -p ios --profile development --submit

# 5. When the TestFlight email lands, install on the iPhone.

# 6. Start the JS dev server.
npx expo start --dev-client
```

After step 6 the app should open on the dev menu home. Cache panel at the
bottom shows what's already downloaded; tap the rows to navigate to each
test page. Kokoro fetches its model on first use of `/tests/kokoro` or
`/tests/combined` (~304 MB, runtime download with resume).

## Critical gotchas

- **Branch is `pivot/react-native-litert`, not `main`.** Push approval
  required.

- **`react-native-litert-lm` pinned to `0.3.6`** (not the latest `0.3.7` —
  that release is broken upstream; iOS frameworks asset was never attached
  to the GitHub release. See [hung-yueh#9](https://github.com/hung-yueh/react-native-litert-lm/issues/9)).
  We intentionally replace its bundled iOS framework after install via
  `scripts/install-litert-ios-framework.js`, using the rebuilt HF artifact
  under `native/ios/`.

- **`app.json` bundle identifier is a placeholder** (`com.wave.mobile`).
  If your Apple team needs a specific bundle ID, change it before the
  first EAS build.

- **`legacy-peer-deps=true` is in `mobile/.npmrc`** because
  `react-native-litert-lm` declares `peerOptional expo@>=55.0.0` and
  we're on Expo 54. Keep until the wrapper drops the constraint.

- **Memory ceiling is real.** Demo on iPhone 15/16 Pro. iPhone 14 Pro and
  earlier (6 GB RAM) likely won't fit the full stack.

- **No barge-in cancel yet.** `sendMessageAsync` in the LiteRT wrapper
  doesn't expose an AbortSignal. Future polish for the combined loop.

- **Whisper test page uses Metal GPU**, not the ANE CoreML encoder.
  Moving encoder to ANE is a follow-up that frees Metal for Gemma decode.

- **whisper.rn requires real WAV/RIFF, 16 kHz mono 16-bit LPCM.** Do not
  feed it `RecordingPresets.HIGH_QUALITY` from expo-audio — that's M4A/AAC
  and trips an "invalid wav file" error with no other diagnostics. See
  the `WHISPER_RECORDING_OPTIONS` const in `src/screens/WhisperTestScreen.tsx`
  for the exact iOS preset, and the writeup at the top of this doc.

- **expo-file-system v19 deprecated the legacy procedural API**
  (`getInfoAsync`, `makeDirectoryAsync`, `documentDirectory`,
  `createDownloadResumable`) — they now THROW at runtime. We migrated to
  the `File`/`Directory`/`Paths` class API in `src/runtime/model-cache.ts`
  but kept `createDownloadResumable` via the `expo-file-system/legacy`
  subpath because the new `File.downloadFileAsync` has no progress
  callback in its options.

- **LiteRT-LM C++ wants raw POSIX paths**, not `file://` URIs. Stripped
  in `litert-generators.ts` `preloadWaveLiteRT()`. Don't reintroduce.

## File-by-file pointers

For "where do I add a new model?":
- Add a manifest entry to `MODELS` in `src/runtime/model-cache.ts`.
- Call `ensureModel('your-id', { onProgress })` from your code.

For "where do I change the LLM behavior?":
- Prompt builders: `src/prompts/`. They port verbatim from `client/lib/prompts/`,
  so make any change in *both* places until the web app is sunset.
- Generation logic: `src/runtime/litert-generators.ts`. Each flow has its
  own function (chunk / reflection / insights / checkin).

For "where do I add a new screen?":
- File-based route: `app/<route>.tsx` (or `app/<group>/<route>.tsx` for a
  nested stack). Render a screen component from `src/screens/`.
- Register the route in the dev menu by adding an entry to `TEST_ENTRIES`
  or `SESSION_ENTRIES` in `app/index.tsx`.

For "what's already ported and what isn't":
- See the "Directory layout" section in `docs/architecture.md`.
- Anything under `src/` that mirrors a `client/lib/...` or `client/types/...`
  path is a verbatim port.

## When things break

- **Type-check failure:** `node_modules/.bin/tsc --noEmit` from inside
  `mobile/`. The hybrid alias map in `tsconfig.json` is what keeps the
  verbatim ports working — read the "Module resolution" section of
  `docs/architecture.md` before touching it.
- **`npx expo-doctor` flags a version mismatch:** run
  `npx expo install <package>` to pull the SDK-compatible version
  (instead of plain `npm install`).
- **EAS build fails on native module compilation:** check the build log
  for the actual error. Past failures: `react-native-litert-lm@0.3.7`
  missing iOS frameworks asset (filed upstream); `_build.json` / `_logs.txt`
  artifacts EAS dumps in `mobile/` after a failed build (gitignored).
- **App opens but a test page errors on load:** check the cache panel on
  the home screen. Models may be partially downloaded (size below
  `minBytes`); clear them and retry.
- **LiteRT smoke fails with "failed to create engine":** that's the issue
  #11 blocker. Don't spend time debugging — the bundle format is wrong.

## Branch commit history (newest → oldest)

```
2b6fdc6  Strip file:// prefix before loadModel for LiteRT-LM
efa4862  Tune eas.json + handoff per the expo-dev-client skill
4b858a4  Apply Expo building-native-ui guidelines to existing screens
223c320  Migrate cache layer to new expo-file-system API (File/Directory/Paths)
17ec065  Fix dev menu navigation — Pressable child for Link asChild
(file:// strip and dev-menu fix above this point are the most recent fixes)
fff76d0  Pin expo-audio + expo-file-system to SDK 54-compatible versions
…earlier commits: combined voice loop, kokoro path, cache + panel, docs,
session reducer, gemma wrappers, runtime, scaffolding
```

`git log --oneline pivot/react-native-litert ^main` from the repo root has
the full list.

## Outstanding work

- [x] Scaffold + entitlement + EAS config
- [x] Runtime layer (LiteRT primary, contingency on hold)
- [x] Prompts / session / gemma ports
- [x] Routing restructure
- [x] LiteRT smoke screen
- [x] Whisper test page
- [x] Kokoro test page — **production-ready**. Runtime download of
      kokoro-en-v0_19 (fp32) via sherpa's download manager, sentence-
      streaming playback via native PCM queue. Full decision record at
      `docs/kokoro-tts.md`.
- [x] Production screen skeletons (5)
- [x] Unified model cache + cache panel
- [x] Combined voice loop test page (push-to-talk MVP)
- [x] Documentation (this doc + `architecture.md`)
- [x] Expo skill audit pass (UI guidelines, eas.json, file-system migration)
- [x] **Unblock the LiteRT path — issue #11** (LiteRT-LM-flavored bundle re-exported via litert-torch 0.9.0)
- [x] Add a "Try stock Gemma" button to the smoke screen to verify the
      bundle-format hypothesis if #11 takes time
- [x] **Silero VAD live detection** — runtime-downloaded ONNX via
      `onnxruntime-react-native`, live mic via sherpa-onnx
      `createPcmLiveStream`. Full record at `docs/silero-vad.md`. Local
      smoke at `scripts/test_silero_local.py`.
- [ ] CoreML Whisper encoder (move encoder to ANE)
- [ ] Production screen full UIs (port from `client/app/session/_components/`)
- [ ] Wire production screens to the session-machine reducer
- [ ] Demo video + postmortem write-up
