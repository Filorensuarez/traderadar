import { readFile, writeFile, mkdtemp, mkdir, copyFile, chmod, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const VERSION = '8.9';
export const FILES = ['gradlew', 'gradlew.bat', 'gradle/wrapper/gradle-wrapper.jar', 'gradle/wrapper/gradle-wrapper.properties'];
export function checksum(text) {
  const value = text.trim();
  if (!/^[a-f0-9]{64}$/i.test(value)) throw Error('Official SHA-256 response is invalid');
  return value.toLowerCase();
}
export function verifyProperties(text, expected) {
  const props = Object.fromEntries(text.split(/\r?\n/).filter(x => x && !x.startsWith('#')).map(x => {
    const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1).replaceAll('\\:', ':')];
  }));
  if (props.distributionUrl !== `https://services.gradle.org/distributions/gradle-${VERSION}-bin.zip` ||
      props.distributionSha256Sum !== checksum(expected) || props.validateDistributionUrl !== 'true') throw Error('Wrapper distribution URL/checksum configuration is invalid');
}
async function officialChecksum(file) {
  let response;
  try {
    response = await fetch(`https://services.gradle.org/distributions/gradle-${VERSION}-${file}.sha256`, { signal: AbortSignal.timeout(20000) });
  } catch {
    throw Error('Cannot reach services.gradle.org for official checksums. Check the supported proxy/domain permissions; no Wrapper was generated or executed.');
  }
  if (!response.ok) throw Error(`Official ${file} checksum unavailable: HTTP ${response.status}`);
  return checksum(await response.text());
}
function run(args, cwd) {
  const result = spawnSync('gradle', args, { cwd, encoding: 'utf8', shell: false });
  if (result.error) throw Error('Trusted Gradle 8.9 is required to generate the missing Wrapper; use the Android build workflow');
  if (result.status !== 0) throw Error(`Gradle Wrapper generation failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
export async function prepare(root = resolve(import.meta.dirname, '..')) {
  const android = join(root, 'android');
  // No checksum literals are guessed. Both values come from Gradle's official service via verified TLS.
  const [distributionHash, jarHash] = await Promise.all([officialChecksum('bin.zip'), officialChecksum('wrapper.jar')]);
  let jar;
  try { jar = await readFile(join(android, FILES[2])); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (jar) {
    if (createHash('sha256').update(jar).digest('hex') !== jarHash) throw Error('Existing Wrapper jar failed official SHA-256 verification; refusing to execute or overwrite it');
    verifyProperties(await readFile(join(android, FILES[3]), 'utf8'), distributionHash);
    for (const file of FILES) await readFile(join(android, file));
    console.log('Existing Gradle 8.9 Wrapper and distribution checksum verified.');
    return;
  }
  if (!/^Gradle 8\.9\r?$/m.test(run(['--version'], root))) throw Error('Wrapper generator must be Gradle 8.9 exactly');
  const staging = await mkdtemp(join(tmpdir(), 'tr-gradle-wrapper-'));
  try {
    await writeFile(join(staging, 'settings.gradle'), "rootProject.name = 'verified-wrapper-bootstrap'\n");
    await writeFile(join(staging, 'build.gradle'), '');
    // Generate in a minimal project: Android plugin resolution must not be required to repair a Wrapper.
    run(['--no-daemon', 'wrapper', '--gradle-version', VERSION, '--distribution-type', 'bin', '--gradle-distribution-sha256-sum', distributionHash], staging);
    const generated = await readFile(join(staging, FILES[2]));
    if (createHash('sha256').update(generated).digest('hex') !== jarHash) throw Error('Generated Wrapper jar failed official SHA-256 verification');
    verifyProperties(await readFile(join(staging, FILES[3]), 'utf8'), distributionHash);
    await mkdir(join(android, 'gradle/wrapper'), { recursive: true });
    for (const file of FILES) await copyFile(join(staging, file), join(android, file));
    await chmod(join(android, 'gradlew'), 0o755);
    console.log('Official Gradle 8.9 Wrapper generated and verified; four files installed.');
  } finally { await rm(staging, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  try { await prepare(); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
