import test from 'node:test';
import assert from 'node:assert/strict';
import { checksum, verifyProperties } from '../../scripts/prepare-gradle-wrapper.mjs';

const fixtureHash = 'ab'.repeat(32); // Test-only value, never a Gradle artifact checksum.
const props = hash => `distributionUrl=https\\://services.gradle.org/distributions/gradle-8.9-bin.zip\ndistributionSha256Sum=${hash}\nvalidateDistributionUrl=true\n`;
test('wrapper verification rejects malformed official hash and untrusted distribution URLs', () => {
  assert.equal(checksum(fixtureHash + '\n'), fixtureHash);
  for (const value of ['', 'abc', fixtureHash + ' extra', '<html>blocked</html>']) assert.throws(() => checksum(value));
  verifyProperties(props(fixtureHash), fixtureHash);
  assert.throws(() => verifyProperties(props(fixtureHash).replace('https\\:', 'http\\:'), fixtureHash));
  assert.throws(() => verifyProperties(props(fixtureHash).replace('services.gradle.org', 'untrusted.test'), fixtureHash));
  assert.throws(() => verifyProperties(props('cd'.repeat(32)), fixtureHash));
  assert.throws(() => verifyProperties(props(fixtureHash).replace('validateDistributionUrl=true', 'validateDistributionUrl=false'), fixtureHash));
});
