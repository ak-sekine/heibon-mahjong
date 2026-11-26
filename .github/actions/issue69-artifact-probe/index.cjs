const { DefaultArtifactClient } = require('@actions/artifact');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
(async () => {
  const { waitForPagesArtifact } = await import(pathToFileURL(path.join(process.env.GITHUB_WORKSPACE, '.github/scripts/pages-artifact-check.mjs')));
  const client = new DefaultArtifactClient();
  const id = Number(process.env.PROBE_ID);
  const digest = `sha256:${process.env.PROBE_DIGEST.replace(/^sha256:/, '')}`;
  await waitForPagesArtifact({
    name: process.env.PROBE_NAME, id, digest,
    list: async () => (await client.listArtifacts()).artifacts,
    metadata: async artifactId => {
      const response = await fetch(`${process.env.GITHUB_API_URL}/repos/${process.env.GITHUB_REPOSITORY}/actions/artifacts/${artifactId}`, {
        headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
      });
      if (!response.ok) throw new Error(`Artifact metadata HTTP ${response.status}`);
      return response.json();
    },
  });
  console.log(`Verified Artifact ID ${id}, digest ${digest}`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
