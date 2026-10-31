import { readFileSync } from 'node:fs';

export const REQUIRED_BROWSER_UI_JOBS = [
  'browser-ui / browser-ui (chromium)',
  'browser-ui / browser-ui (webkit)',
];

export function checkBrowserUiMatrix(jobs) {
  if (!Array.isArray(jobs)) throw new TypeError('GitHub Actions jobs must be an array');

  const errors = [];
  for (const name of REQUIRED_BROWSER_UI_JOBS) {
    const matching = jobs.filter((job) => job?.name === name);
    if (matching.length !== 1) {
      errors.push(`${name}: expected exactly one job, found ${matching.length}`);
      continue;
    }
    if (matching[0].conclusion !== 'success') {
      errors.push(`${name}: expected success, found ${matching[0].conclusion ?? 'no conclusion'}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function main() {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: node check-browser-ui-matrix.mjs <workflow-jobs-json>');
  const payload = JSON.parse(readFileSync(path, 'utf8'));
  const result = checkBrowserUiMatrix(payload.jobs);
  if (!result.ok) {
    for (const error of result.errors) console.error(`::error::${error}`);
    process.exitCode = 1;
    return;
  }
  console.log('Verified one successful Chromium job and one successful WebKit job.');
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) main();
