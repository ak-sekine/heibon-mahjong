import { appendFileSync, readFileSync } from 'node:fs';
import { decideDeployment } from './classify-changes.mjs';

function readPaths(path) {
  try {
    return readFileSync(path, 'utf8').split('\0').filter(Boolean);
  } catch {
    return [];
  }
}

const result = decideDeployment({
  currentFiles: readPaths(process.env.CURRENT_PATHS),
  workerFiles: readPaths(process.env.WORKER_PATHS),
  pagesFiles: readPaths(process.env.PAGES_PATHS),
  stateReliable: process.env.STATE_RELIABLE === 'true',
  workerSha: process.env.WORKER_SHA ?? '',
  pagesSha: process.env.PAGES_SHA ?? '',
  eventName: process.env.EVENT_NAME ?? 'push',
  deployToProduction: process.env.DEPLOY_TO_PRODUCTION === 'true',
  currentDiffReliable: process.env.CURRENT_DIFF_RELIABLE === 'true',
});
const output = Object.entries(result).map(([key, value]) => `${key}=${value}`).join('\n');
console.log(output);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${output}\n`);
