import { execFileSync } from 'node:child_process';

const shaPattern = /^[a-f0-9]{40}$/;

// Unknown inputs never imply that publication is unnecessary. Paths are evaluated
// on both sides of renames (git diff --no-renames), including deleted files.
export function pathImpact(file) {
  if (typeof file !== 'string' || !file || file.startsWith('/') || file.split('/').includes('..')) return 'unknown';
  if (file.endsWith('.md') || file.startsWith('tests/')) return 'none';
  if (file.startsWith('worker/')) return 'worker';
  if (/^wrangler(?:\.development)?\.jsonc$/.test(file)) return 'worker';
  if (file.startsWith('src/game/') || file.startsWith('src/model/') ||
      ['src/online/protocol.ts', 'src/online/game-engine.ts', 'src/online/game-view.ts'].includes(file)) return 'both';
  if (file === 'src/style.css' || file.startsWith('public/') || file === 'index.html' ||
      file === 'vite.config.ts' || file === 'scripts/build-pwa.mjs') return 'pages';
  // Changes to dependencies or release tooling require human review.
  return 'unknown';
}

export function compareRelease(base, candidate, git = execFileSync) {
  if (!shaPattern.test(base ?? '') || !shaPattern.test(candidate ?? '')) return { reliable: false, files: [] };
  try {
    git('git', ['merge-base', '--is-ancestor', base, candidate], { stdio: 'pipe' });
    const files = git('git', ['diff', '--no-renames', '--name-only', '-z', base, candidate, '--'], { encoding: 'utf8' });
    return { reliable: true, files: files.split('\0').filter(Boolean) };
  } catch { return { reliable: false, files: [] }; }
}

export function planPublication({ environment, candidate, pagesBase, workerBase, target = 'auto', compatibility = false, git = execFileSync }) {
  if (!['production', 'development'].includes(environment) || !['auto', 'pages', 'worker', 'both', 'none'].includes(target)) {
    return { classification: 'unknown', blocked: true, reason: 'invalid-input' };
  }
  const pagesDiff = compareRelease(pagesBase, candidate, git);
  const workerDiff = compareRelease(workerBase, candidate, git);
  if (!pagesDiff.reliable || !workerDiff.reliable) return { classification: 'unknown', blocked: true, reason: 'unreliable-baseline' };
  const pagesImpacts = pagesDiff.files.map(pathImpact);
  const workerImpacts = workerDiff.files.map(pathImpact);
  if ([...pagesImpacts, ...workerImpacts].includes('unknown')) return { classification: 'unknown', blocked: true, reason: 'unknown-path' };
  const pages = pagesImpacts.some(impact => impact === 'pages' || impact === 'both');
  const worker = workerImpacts.some(impact => impact === 'worker' || impact === 'both');
  const classification = pages && worker ? 'both' : pages ? 'pages' : worker ? 'worker' : 'none';
  const selected = target === 'auto' ? classification : target;
  if ((pages && !['pages', 'both'].includes(selected)) || (worker && !['worker', 'both'].includes(selected))) {
    return { classification, selected, blocked: true, reason: 'required-target-excluded' };
  }
  if (selected !== 'none' && compatibility !== true) return { classification, selected, blocked: true, reason: 'compatibility-unconfirmed' };
  return { classification, selected, blocked: false, pages: ['pages', 'both'].includes(selected), worker: ['worker', 'both'].includes(selected), onlineVerification: selected !== 'none' };
}
