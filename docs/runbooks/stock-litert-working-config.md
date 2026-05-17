# Runbook — Verified working stock Gemma 4 LiteRT config (WAVE)

> **🏆 Verified on a physical iPhone 17 Pro, 2026-05-16.** This is the
> reproducible snapshot of the *working* on-device LiteRT path. If you
> need "the thing that demonstrably runs," start here. Companion to
> `docs/postmortems/gemma4-litert-stock-limits-research.md` (the why) and
> [`Wave#14`](https://github.com/emilyLi2020/Wave/issues/14) (tracking).
> Do not delete.

## What this is

Stock (un-fine-tuned) Gemma 4 E2B running on-device through LiteRT-LM on
iPhone, via a one-line fork of `react-native-litert-lm` that splits the
conflated `maxTokens` knob. Proven: the full ~1846-token WAVE chunk-1
prompt streamed coherent JSON on device.

## Pinned artifacts (the "saved model")

| Piece | Exact value |
|---|---|
| Model bundle | `https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm` (~2.59 GB, downloaded at runtime, cached) |
| Wrapper fork | `IdkwhatImD0ing/react-native-litert-lm-wave` @ **`f9dbf28`** — *pristine npm `0.3.6` + only the 5-file maxTokens patch* (NOT `d35ba92`, which bundled the `main` framework and broke the C++ bridge compile) |
| `mobile/package.json` dep | `"react-native-litert-lm": "github:IdkwhatImD0ing/react-native-litert-lm-wave#f9dbf28b7cf8b0afeb390a525a155dc37db4002e"` |
| Framework | upstream **v0.10.2** prebuilt (the fork's pristine postinstall downloads it; the 0.3.6 C++ bridge only compiles against the v0.10.2 C header) |
| Engine config | `engineMaxTokens: 2048`, `outputMaxTokens: 256` — the litert-community **benchmark** values; verified-safe, NOT proven hard caps. Runtime-settable; real envelope under measurement in Wave#15 Phase 0. |
| System prompt (stock path) | Currently the canonical `WAVE_SYSTEM_PROMPT` (via `check-in.ts` / `chunk-generator.ts`), and a tiny inline prompt on the stock test screen. `WAVE_SYSTEM_PROMPT_STOCK_COMPACT` is **defined but not yet wired** — switching to it is Wave#15 Phase 0b. (When wired: stock base only — the fine-tune/GGUF path must keep canonical `WAVE_SYSTEM_PROMPT` verbatim.) |
| Verified device | iPhone 17 Pro, hardware UDID `00008150-001079E40182401C` |
| Branch | `wave/litert-maxtokens-pathA` |

> **⚠️ CORRECTION:** the "2048 total / 256 decode" framing below is
> over-stated (old-wrapper conflation artifact). Context is
> runtime-settable; real iOS ceiling ≈ 4096 ([LiteRT #6765]), and the
> 256-decode cap is unverified post-fork. The table is the *conservative
> verified-safe* envelope; the true envelope is being measured per
> `docs/plans/litert-cache-reexport-plan.md` Phase 0. Don't treat the ❌
> rows as proven.

## Per-surface fit — HISTORICAL estimate at the benchmark 2048/256 config

> This table is the conservative estimate **at the 2048/256 benchmark
> config only**, under the now-disproven `min(outputMaxTokens, 256, 2048 −
> input)` model. It is NOT the true envelope: context is runtime-settable
> and the 256/2048 numbers are not proven caps. The ⚠️/❌ rows are
> **unverified pending the Wave#15 Phase 0 sweep** (real WAVE prompts +
> tokenizer counts on device). Kept only to show why the sweep matters.

| Surface | Input (est) | Output need | At 2048/256 (historical estimate) |
|---|---|---|---|
| Reflection | ~700 | ~150–180 | ✅ fits |
| Check-in turn | ~600–1000 | <100 | ✅ fits |
| Chunk-1 / phase | ~1846 (→ ~1400 w/ compact) | ~150–210 | ✅ (tight at canonical) |
| Chunks 2–5 | ~2500–2900 w/ history | ~150–210 | ❓ unverified — the core Phase 0 question |
| >256-tok output | — | >256 | ❓ unverified (256-decode cap not re-tested post-fork) |

The compact system prompt is what moves chunk-1 from "fragile, ~202-token
output bound" to "comfortably decode-cap bound." It does **not** fully
rescue chunks 4–5 (history accumulation) or any surface needing >256
output tokens — those need llama.rn/GGUF or a re-exported bundle (Wave#14).

## Reproduce the on-device build (no EAS credits)

Full detail in memory `litert-fork-signing-setup`. Summary:

```
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
cd mobile && npm install                         # resolves fork @ f9dbf28; postinstall pulls v0.10.2 framework
npx expo prebuild                                 # generates mobile/ios/ (git-ignored, CNG)
# pods install during prebuild
# signing: eas credentials -p ios -> "Download credentials from EAS to credentials.json"
#   import credentials/ios/dist-cert.p12 into login keychain
#   copy credentials/ios/profile.mobileprovision -> ~/Library/Developer/Xcode/UserData/Provisioning Profiles/<UUID>.mobileprovision
xcodebuild -workspace <abs>/mobile/ios/Wave.xcworkspace -scheme Wave \
  -configuration Debug -destination 'generic/platform=iOS' \
  -derivedDataPath <abs>/mobile/ios/build/DD \
  CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=8TADX8KSDK \
  PROVISIONING_PROFILE_SPECIFIER=<profile UUID> \
  CODE_SIGN_IDENTITY=<EAS dist cert SHA1> build
xcrun devicectl device install app --device <coredevice-id> \
  <abs>/mobile/ios/build/DD/Build/Products/Debug-iphoneos/Wave.app
npx expo start                                    # Metro; open Wave on device -> /tests/litert-stock
```

`credentials.json` + `credentials/` are git-ignored (private key). EAS was
abandoned for builds (out of credits); this local path is the supported one.

## Known-good commits

- `362a806` Path A fork wiring · `ea790aa` react-native-fs peer dep ·
  `280be1f` pin `f9dbf28` · `19d8d98` verified-win docs ·
  `c1fc871` outputMaxTokens 200→256 · (this commit) compact prompt + runbook.
