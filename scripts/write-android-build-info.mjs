import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const variant = process.env.APK_VARIANT || 'debug';
if (!['debug', 'release'].includes(variant)) throw Error('Invalid APK variant');
const path = `android/app/build/outputs/apk/${variant}/app-${variant}.apk`;
const apk = await readFile(path);
if (!apk.byteLength) throw Error('APK is empty');
const info = {
  commit: process.env.GITHUB_SHA ?? null,
  ref: process.env.GITHUB_REF ?? null,
  run: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
  file: `app-${variant}.apk`, bytes: apk.byteLength,
  sha256: createHash('sha256').update(apk).digest('hex'),
  java: 17, gradle: '8.9', androidGradlePlugin: '8.7.3', kotlin: '2.0.21', compileSdk: 35, targetSdk: 35, minSdk: 26,
  signing: variant === 'debug' ? 'debug; not a Play Store release' : 'release signature verified by apksigner; see certificate report',
  certificateReport: 'apk-signature.log',
  packageAudit: 'android-package-audit.json',
  verificationScope: 'Build and signature checks; real Android device/background behavior is not established. See app runtime for Binance TR verification status.',
};
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/android-build-info.json', JSON.stringify(info, null, 2) + '\n');
console.log(`APK SHA-256: ${info.sha256}`);
