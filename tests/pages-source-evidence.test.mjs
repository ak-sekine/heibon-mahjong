import test from 'node:test';
import assert from 'node:assert/strict';
import { fullArtifactEvidence, productionArtifactEvidence, validatePagesSourceEvidence } from '../.github/scripts/pages-source-evidence.mjs';
import { WORKFLOW_ID, WORKFLOW_REF } from '../.github/scripts/reuse-production-ci.mjs';
const sha = 'a'.repeat(40), digest = 'sha256:' + 'b'.repeat(64);
test('full source evidence binds environment, SHA, run, attempt and artifact', () => {
  for (const environment of ['production', 'development']) {
    const name = `${environment === 'production' ? 'pages-dist' : 'development-dist'}-${sha}-2`;
    const metadata = { id: 33, name, digest, expires_at: '2099-01-01T00:00:00Z', workflow_run: { id: 22, head_sha: sha } };
    const evidence = fullArtifactEvidence({ environment, sha, runId: 22, attempt: 2, metadata });
    assert.deepEqual(validatePagesSourceEvidence(evidence, { environment, sha }), evidence);
    assert.throws(() => fullArtifactEvidence({ environment, sha, runId: 23, attempt: 2, metadata }));
    assert.throws(() => validatePagesSourceEvidence({ ...evidence, name: name + '-other' }));
  }
});
test('production-reuse source evidence retains the original strict proof', () => {
  const proof = { workflowId: WORKFLOW_ID, workflowRef: WORKFLOW_REF, runId: 22, attempt: 1, artifactId: 33, digest, expiresAt: '2099-01-01T00:00:00Z' };
  const evidence = productionArtifactEvidence(proof, sha);
  assert.equal(evidence.kind, 'production-reuse');
  assert.throws(() => validatePagesSourceEvidence({ ...evidence, artifactId: 34 }));
  assert.throws(() => validatePagesSourceEvidence({ ...evidence, environment: 'development' }));
});
