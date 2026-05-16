# mobile/ handoff

Skim this if you just cloned the repo and want to ship the iOS app. For
the deeper architecture, read `docs/architecture.md` next.

## TL;DR — where the pivot is

- `pivot/react-native-litert` branch holds the work.
- Type-check is green; `npx expo-doctor` is 17/17 green.
- Three test pages built. LiteRT smoke and Whisper STT are wired end-to-end
  and should run on a device. Kokoro TTS is wired but needs you to run a
  setup script that populates `assets/kokoro/`. The combined voice loop
  page is a stub until the three individual smokes green.
- Five production session screens exist as skeletons (not tested).
- A unified model cache + cache panel is on the dev menu home.

Nothing has run on a physical iPhone yet because that's gated on you
finishing Apple Developer Program enrollment + EAS setup.

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
# Follow the on-screen QR/email flow.

# 4. Populate the Kokoro asset bundle (one-shot, ~330 MB).
./scripts/download-kokoro.sh

# 5. Cloud-build the iOS development client. ~10-15 min.
eas build --profile development --platform ios

# 6. Install the IPA on your iPhone (TestFlight link or ad-hoc URL from
#    the build output). Open the app once so iOS registers it.

# 7. Start the JS dev server.
npx expo start --dev-client
# Scan the QR with the installed app.
```

After step 7 the app should open on the dev menu home. From there:

- **LiteRT smoke** — tap "Download + Load". First run pulls model.litertlm
  (~4.7 GB) from HF. Tap "Generate Chunk 1" once loaded. Output should be a
  6-line JSON narration validated by `chunkLinesSchema`.
- **Whisper STT** — tap "Download + Load" (~78 MB). Tap "Record", say
  something, tap "Stop + transcribe". Transcript appears, RTF reported.
- **Kokoro TTS** — tap "Download + Load Kokoro". If you ran the script in
  step 4, this should initialize from the bundled asset and the "Speak"
  button enables.

Once all three are green, the combined voice loop page is the next thing
to wire.

## Critical gotchas

- **`app.json` bundle identifier is a placeholder** (`com.wave.mobile`).
  If your Apple team needs a specific one (it usually does — you have to
  own the bundle ID), change it before the first EAS build. EAS will
  prompt to create a new App Store Connect entry.

- **Mic permission string** is in `app.json` under `ios.infoPlist`. The
  text shows up in the system permission prompt on first mic use. Change
  it if you want different copy.

- **Don't commit `mobile/assets/kokoro/`.** It's gitignored. Anyone cloning
  the repo runs `scripts/download-kokoro.sh` once to populate it.

- **`legacy-peer-deps=true` is in `mobile/.npmrc`** because
  `react-native-litert-lm@0.3.7` declares `peerOptional expo@>=55.0.0`
  and we're on Expo 54. Keep the flag until either Expo bumps to 55 or
  the wrapper drops the constraint.

- **Memory ceiling is real.** Demo on iPhone 15/16 Pro. iPhone 14 Pro and
  earlier (6 GB RAM) likely won't fit the full stack. The LiteRT smoke
  screen's memory panel reports live RSS so you can watch it.

- **No barge-in cancel yet.** `sendMessageAsync` in the LiteRT wrapper
  doesn't expose an AbortSignal. When step 5c wires the voice loop, we'll
  either call `wrapper.close()` + reload (slow) or upstream a cancel PR.
  Treat barge-in as a future polish item, not Day 1.

- **Whisper test page uses Metal GPU, not the ANE CoreML encoder.** Adding
  CoreML moves the encoder off Metal and frees the GPU for Gemma decode +
  Whisper decoder. Follow-up item.

## File-by-file pointers

For "where do I add a new model?":
- Add a manifest entry to `MODELS` in `src/runtime/model-cache.ts`.
- Call `ensureModel('your-id', { onProgress })` from your code.

For "where do I change the LLM behavior?":
- Prompt builders: `src/prompts/`. They port verbatim from `client/lib/prompts/`,
  so make any change in *both* places until the web app is sunset.
- Generation logic: `src/runtime/litert-generators.ts`. Each flow has its own
  function (chunk / reflection / insights / checkin).

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
- **EAS build fails on native module compilation:** usually a peer-dep or
  Expo SDK mismatch. Check the build log; common fixes are bumping Expo,
  reinstalling with `legacy-peer-deps`, or adding the package's config
  plugin to `app.json > plugins`.
- **App opens but a test page errors on load:** check the cache panel on
  the home screen. Models may be partially downloaded (size below
  `minBytes`); clear them and retry.

## Outstanding work

Tracked in the project's task list (run `TaskList` from inside Claude
Code). Current state:

- [x] Scaffold + entitlement + EAS config
- [x] Runtime layer (LiteRT primary, contingency on hold)
- [x] Prompts / session / gemma ports
- [x] Routing restructure
- [x] LiteRT smoke screen
- [x] Whisper test page
- [x] Kokoro test page (asset path wired; script provided)
- [x] Production screen skeletons (5)
- [x] Unified model cache + cache panel
- [x] Documentation (this doc + architecture.md)
- [ ] Combined voice loop test page (wires the three subsystems + push-to-talk MVP)
- [ ] VAD listener port (step 5a, after combined smoke greens)
- [ ] CoreML Whisper encoder (move encoder to ANE)
- [ ] Production screen full UIs (port from client/app/session/_components/)
- [ ] Demo video + postmortem write-up
