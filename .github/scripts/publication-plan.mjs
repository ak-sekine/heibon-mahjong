import { execFileSync } from 'node:child_process';

const shaPattern = /^[a-f0-9]{40}$/;
const pipelinePaths = new Set([
  '.github/workflows/deploy.yml', '.github/workflows/environments.yml', '.github/workflows/publish-environments.yml',
  '.github/workflows/browser-ui.yml', '.github/scripts/publication-plan.mjs', '.github/scripts/pages-artifact-check.mjs',
  '.github/scripts/classify-changes.mjs', '.github/scripts/deployment-decision.mjs', '.github/scripts/deployment-state.mjs',
  '.github/scripts/publication-reservation.mjs', '.github/scripts/deploy-isolated-worker.mjs',
  '.github/scripts/worker-independent.mjs', '.github/scripts/worker-online-confirm.mjs', '.github/scripts/pages-independent.mjs', '.github/scripts/pages-independent-recovery.mjs', '.github/scripts/pages-verified-artifact.mjs',
  '.github/scripts/reuse-production-ci.mjs', '.github/scripts/audit-main-publication.mjs',
]);

// This classifies product bytes, not whether changed CI or deployment code must be tested.
// Rename detection is disabled so both the old and new paths are classified.
export function pathImpact(file, environment = 'production') {
  if (!['production', 'development'].includes(environment) || typeof file !== 'string' || !file || file.startsWith('/') || file.split('/').includes('..')) return 'unknown';
  if ((file.startsWith('docs/') && file.endsWith('.md')) || /^[^/]+\.md$/.test(file) || file.startsWith('tests/') || pipelinePaths.has(file)) return 'none';
  if (file === 'wrangler.jsonc') return environment === 'production' ? 'worker' : 'none';
  if (file === 'wrangler.development.jsonc') return environment === 'development' ? 'worker' : 'none';
  if (file === 'worker/development.ts' && environment === 'production') return 'none';
  if (file.startsWith('worker/')) return 'worker';
  if (['package.json', 'package-lock.json', 'tsconfig.json', '.nvmrc'].includes(file)) return 'both';
  if (file.startsWith('src/game/') || file.startsWith('src/model/') || file.startsWith('src/analysis/') ||
      ['src/environment.ts', 'src/online/protocol.ts', 'src/online/diagnostics.ts', 'src/online/game-engine.ts', 'src/online/game-view.ts', 'src/rendering/pending-discard.ts'].includes(file)) return 'both';
  if (file.startsWith('src/') || file.startsWith('public/') || ['index.html', 'test.html', 'kan-test.html', 'call-test.html', 'vite.config.ts', 'scripts/build-pwa.mjs', 'scripts/environments/artifacts.mjs'].includes(file)) return 'pages';
  if (['scripts/environments/issue-ref.mjs', 'scripts/environments/pages-live-audit.mjs', 'scripts/environments/pages-recovery.mjs', 'scripts/environments/production-live-audit.mjs', 'scripts/package-itch.mjs', '.gitignore'].includes(file)) return 'none';
  return 'unknown';
}

export function compareRelease(base, candidate, git = execFileSync) {
  if (!shaPattern.test(base ?? '') || !shaPattern.test(candidate ?? '')) return { reliable: false, files: [] };
  try {
    for (const sha of [base, candidate]) git('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'pipe' });
    const files = git('git', ['diff', '--no-renames', '--name-only', '-z', base, candidate, '--'], { encoding: 'utf8' });
    return { reliable: true, files: files.split('\0').filter(Boolean) };
  } catch { return { reliable: false, files: [] }; }
}

// Inputs are independently trusted success records. Callers must verify record
// provenance, environment, current candidate ref, approval and required CI.
export function planPublication({ environment, candidate, pagesBase, workerBase, target = 'auto', git = execFileSync }) {
  if (!['production', 'development'].includes(environment) || !['auto', 'pages', 'worker', 'both', 'none'].includes(target)) {
    return { classification: 'unknown', blocked: true, reason: 'invalid-input' };
  }
  const pagesDiff = compareRelease(pagesBase, candidate, git);
  const workerDiff = compareRelease(workerBase, candidate, git);
  const pagesImpacts = pagesDiff.files.map(file => pathImpact(file, environment));
  const workerImpacts = workerDiff.files.map(file => pathImpact(file, environment));
  const pagesKnown = pagesDiff.reliable && !pagesImpacts.includes('unknown');
  const workerKnown = workerDiff.reliable && !workerImpacts.includes('unknown');
  const requirePages = ['auto', 'both', 'pages'].includes(target);
  const requireWorker = ['auto', 'both', 'worker'].includes(target);
  if ((requirePages && !pagesKnown) || (requireWorker && !workerKnown)) {
    const missingRequiredBaseline = (requirePages && !pagesDiff.reliable) || (requireWorker && !workerDiff.reliable);
    return { classification: 'unknown', blocked: true, reason: missingRequiredBaseline ? 'unreliable-baseline' : 'unknown-path' };
  }
  const pagesPending = pagesKnown ? pagesImpacts.some(impact => impact === 'pages' || impact === 'both') : null;
  const workerPending = workerKnown ? workerImpacts.some(impact => impact === 'worker' || impact === 'both') : null;
  const classification = !pagesKnown || !workerKnown ? 'unknown' : pagesPending && workerPending ? 'both' : pagesPending ? 'pages' : workerPending ? 'worker' : 'none';
  const selected = target === 'auto' ? classification : target;
  const pages = ['pages', 'both'].includes(selected);
  const worker = ['worker', 'both'].includes(selected);
  return { classification, selected, blocked: false, pages, worker, pagesPending, workerPending, pagesDeferred: pagesPending === null ? null : pagesPending && !pages, workerDeferred: workerPending === null ? null : workerPending && !worker, onlineVerification: pages || worker };
}
