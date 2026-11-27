import assert from 'node:assert/strict';
import { validateEvidence } from './reuse-production-ci.mjs';

const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const id = value => Number.isSafeInteger(value) && value > 0;
export function fullArtifactEvidence({ environment, sha, runId, attempt, metadata }) {
  assert.ok(['production', 'development'].includes(environment) && SHA.test(sha || ''));
  assert.ok(id(runId) && id(attempt) && id(metadata?.id));
  const name = `${environment === 'production' ? 'pages-dist' : 'development-dist'}-${sha}-${attempt}`;
  assert.equal(metadata.name, name);
  assert.ok(DIGEST.test(metadata.digest || '') && Number.isFinite(Date.parse(metadata.expires_at)));
  assert.equal(metadata.workflow_run?.id, runId);
  assert.equal(metadata.workflow_run?.head_sha, sha);
  return { version: 1, kind: 'full', environment, sha, runId, attempt, artifactId: metadata.id, digest: metadata.digest, name, expiresAt: metadata.expires_at };
}
export function validatePagesSourceEvidence(evidence, { environment, sha } = {}) {
  assert.equal(evidence?.version, 1);
  assert.ok(['production', 'development'].includes(evidence.environment) && SHA.test(evidence.sha || ''));
  if (environment !== undefined) assert.equal(evidence.environment, environment);
  if (sha !== undefined) assert.equal(evidence.sha, sha);
  assert.ok(id(evidence.runId) && id(evidence.attempt) && id(evidence.artifactId));
  assert.match(evidence.digest || '', DIGEST);
  assert.ok(Number.isFinite(Date.parse(evidence.expiresAt)));
  assert.equal(evidence.name, `${evidence.environment === 'production' ? 'pages-dist' : 'development-dist'}-${evidence.sha}-${evidence.attempt}`);
  if (evidence.kind === 'production-reuse') {
    assert.equal(evidence.environment, 'production');
    const proof = validateEvidence(evidence.productionEvidence);
    assert.equal(proof.runId, evidence.runId); assert.equal(proof.attempt, evidence.attempt);
    assert.equal(proof.artifactId, evidence.artifactId); assert.equal(proof.digest, evidence.digest);
    assert.equal(proof.expiresAt, evidence.expiresAt);
  } else assert.equal(evidence.kind, 'full');
  return evidence;
}
export function productionArtifactEvidence(proof, sha) {
  validateEvidence(proof);
  return validatePagesSourceEvidence({ version: 1, kind: 'production-reuse', environment: 'production', sha, runId: proof.runId,
    attempt: proof.attempt, artifactId: proof.artifactId, digest: proof.digest, name: `pages-dist-${sha}-${proof.attempt}`,
    expiresAt: proof.expiresAt, productionEvidence: proof });
}
