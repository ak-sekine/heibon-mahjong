import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkArchive } from './reuse-production-ci.mjs';

export function verifyPagesArtifactMetadata(artifact, expected, now = Date.now()) {
  assert.ok(Number.isSafeInteger(expected.id) && expected.id > 0 && /^[a-f0-9]{64}$/.test(expected.digest || ''));
  assert.equal(artifact?.id, expected.id); assert.equal(artifact.name, expected.name);
  assert.equal(artifact.digest, 'sha256:' + expected.digest);
  assert.equal(artifact.expired, false);
  assert.ok(Number.isFinite(Date.parse(artifact.expires_at)) && Date.parse(artifact.expires_at) > now, 'Artifact expired');
  assert.equal(artifact.workflow_run?.id, expected.runId);
  assert.equal(artifact.workflow_run?.head_sha, expected.sha);
}
function main() {
  const env = process.env, id = Number(env.VERIFIED_ARTIFACT_ID);
  const expected = { id, digest: env.VERIFIED_ARTIFACT_DIGEST, name: `${env.GITHUB_REF === 'refs/heads/main' ? 'pages-dist' : 'development-dist'}-${env.GITHUB_SHA}-${env.GITHUB_RUN_ATTEMPT}`, runId: Number(env.GITHUB_RUN_ID), sha: env.GITHUB_SHA };
  assert.equal(env.GITHUB_REPOSITORY, 'ak-sekine/heibon-mahjong');
  const endpoint = `repos/${env.GITHUB_REPOSITORY}/actions/artifacts/${id}`;
  const metadata = JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8' }));
  verifyPagesArtifactMetadata(metadata, expected);
  const bytes = execFileSync('gh', ['api', endpoint + '/zip'], { maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  checkArchive(bytes, 'sha256:' + expected.digest);
  writeFileSync(path.join(env.RUNNER_TEMP, 'pages-only-verified.zip'), bytes, { flag: 'wx' });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
