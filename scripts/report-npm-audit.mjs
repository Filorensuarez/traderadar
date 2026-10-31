import { readFile } from 'node:fs/promises';
let report;
try { report = JSON.parse(await readFile('artifacts/npm-audit.json', 'utf8')); } catch {}
const counts = report?.auditReportVersion === 2 && !report.error ? report?.metadata?.vulnerabilities : null;
if (counts && Number.isInteger(counts.total)) {
  console.log(`::notice title=Node dependency audit::${counts.total} total; critical=${counts.critical}; high=${counts.high}; moderate=${counts.moderate}; scope=Node server/build dependencies, not Android runtime`);
  if (process.env.APK_VARIANT === 'release' && (counts.critical > 0 || counts.high > 0)) process.exitCode = 1;
} else {
  console.log('::warning title=Node dependency audit::UNAVAILABLE; no clean verdict');
  if (process.env.APK_VARIANT === 'release') process.exitCode = 1;
}
