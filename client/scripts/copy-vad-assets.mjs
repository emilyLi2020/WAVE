import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const clientDir = dirname(scriptDir);
const outputDir = join(clientDir, "public", "vendor", "vad");

const vadDistDir = dirname(require.resolve("@ricky0123/vad-web/dist/index.js"));
const ortDistDir = dirname(require.resolve("onnxruntime-web/wasm"));

const vadAssets = [
  "vad.worklet.bundle.min.js",
  "silero_vad_legacy.onnx",
  "silero_vad_v5.onnx",
];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const assetName of vadAssets) {
  await copyFile(join(vadDistDir, assetName), join(outputDir, assetName));
}

const ortAssets = (await readdir(ortDistDir)).filter(
  (assetName) =>
    assetName.startsWith("ort-wasm") &&
    (assetName.endsWith(".wasm") || assetName.endsWith(".mjs")),
);

for (const assetName of ortAssets) {
  await copyFile(join(ortDistDir, assetName), join(outputDir, assetName));
}

console.log(
  `Copied ${vadAssets.length + ortAssets.length} VAD runtime assets to ${outputDir}`,
);
