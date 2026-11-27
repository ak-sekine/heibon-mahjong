import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, inventory, verifySealed } from '../../scripts/environments/artifacts.mjs';
import { checkArchive } from './reuse-production-ci.mjs';
import { verifyPagesArtifactMetadata } from './pages-verified-artifact.mjs';
import { validatePagesSourceEvidence } from './pages-source-evidence.mjs';

export function verifyResumeCandidate(candidate, source, snapshotDigest, expectedWorkerUrl) {
  validatePagesSourceEvidence(source);
  assert.match(snapshotDigest || '', /^[a-f0-9]{64}$/);
  const release = verifySealed(candidate);
  assert.equal(release.environment, source.environment); assert.equal(release.sha, source.sha);
  assert.equal(release.workerUrl, expectedWorkerUrl);
  assert.equal(digest(inventory(candidate)), snapshotDigest, 'Original candidate differs from the staged snapshot');
  return release;
}
function cli() {
  const env = process.env;
  if (process.argv[2] === 'candidate') {
    const source = validatePagesSourceEvidence(JSON.parse(env.PAGES_SOURCE_EVIDENCE));
    verifyResumeCandidate(process.argv[3], source, env.RESUME_SNAPSHOT_DIGEST, env.EXPECTED_WORKER_URL);
    return;
  }
  const saved = JSON.parse(readFileSync(path.join(env.RUNNER_TEMP, 'pages-resume-evidence.json'), 'utf8'));
  const source = validatePagesSourceEvidence(saved.source);
  const endpoint = `repos/${env.GITHUB_REPOSITORY}/actions/artifacts/${source.artifactId}`;
  const metadata = JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8' }));
  verifyPagesArtifactMetadata(metadata, { id: source.artifactId, digest: source.digest.slice(7), name: source.name, runId: source.runId, sha: source.sha });
  assert.equal(metadata.expires_at, source.expiresAt);
  const bytes = execFileSync('gh', ['api', endpoint + '/zip'], { maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  checkArchive(bytes, source.digest);
  const archive = path.join(env.RUNNER_TEMP, 'original-pages-verified.zip');
  writeFileSync(archive, bytes, { flag: 'wx' });
  execFileSync('python3', [path.join(env.SOURCE_DIR, '.github/scripts/extract-pages-zip.py'), archive, env.RESUME_CANDIDATE], { stdio: 'inherit' });
  verifyResumeCandidate(env.RESUME_CANDIDATE, source, saved.snapshotDigest, env.EXPECTED_WORKER_URL);
  appendFileSync(env.GITHUB_OUTPUT, `evidence=${JSON.stringify(source)}\nsnapshot_digest=${saved.snapshotDigest}\n`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) cli();
