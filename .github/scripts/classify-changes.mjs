import { appendFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';

export function classifyChanges(changedFiles, reliableDiff = true) {
  let runFullSuite = true;
  let deployRequired = true;
  const files = Array.isArray(changedFiles) ? changedFiles : [];

  if (reliableDiff && files.length > 0) {
    runFullSuite = false;
    deployRequired = false;
    for (const file of files) {
      if (file.endsWith('.md')) continue;
      runFullSuite = true;
      if (!file.startsWith('.github/') && !file.startsWith('tests/') && file !== 'package.json') deployRequired = true;
    }
  }

  const classification = !runFullSuite
    ? 'docs-only'
    : deployRequired ? 'application-or-unknown' : 'validation-only';
  return {
    run_full_suite: String(runFullSuite),
    deploy_required: String(deployRequired),
    changed_count: String(files.length),
    classification,
  };
}

function main() {
  const reliableDiff = process.argv[2] !== '--unsafe';
  const changedFiles = reliableDiff
    ? readFileSync(0, 'utf8').split('\0').filter(Boolean)
    : [];
  const result = classifyChanges(changedFiles, reliableDiff);
  const output = Object.entries(result).map(([key, value]) => `${key}=${value}`).join('\n');
  console.log(output);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${output}\n`);
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) main();
