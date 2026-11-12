import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

assert.equal(process.env.GITHUB_REPOSITORY, 'ak-sekine/heibon-mahjong');
assert.equal(process.env.GITHUB_REF, 'refs/heads/develop');
assert.equal(process.env.GITHUB_EVENT_NAME, 'push');
assert.equal(process.env.INSPECTION_REQUEST, 'bootstrap: inspect development Worker (Issue #47)');
assert(process.env.CLOUDFLARE_API_TOKEN && /^[a-f0-9]{32}$/.test(process.env.CLOUDFLARE_ACCOUNT_ID ?? ''));
const root = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}`;
async function read(path) {
  try {
    const response = await fetch(root + path, {
      headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
      redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    const body = await response.json();
    return { status: response.status, success: body.success === true, codes: (body.errors ?? []).map(e => e.code).filter(Number.isInteger), result: body.result };
  } catch { return { status: null, success: false, codes: [] }; }
}
const report = { sha: process.env.GITHUB_SHA, mode: 'read-only', workers: {} };
for (const name of ['heibon-mahjong-online', 'heibon-mahjong-online-dev']) {
  const settings = await read(`/workers/scripts/${name}/settings`);
  const entry = { status: settings.status, success: settings.success, codes: settings.codes };
  if (settings.success) {
    entry.settingsSha256 = createHash('sha256').update(JSON.stringify(settings.result)).digest('hex');
    entry.bindings = (settings.result.bindings ?? []).filter(b => b.type === 'durable_object_namespace').map(({ name, class_name, script_name, namespace_id }) => ({ name, class_name, script_name, namespace_id }));
  }
  report.workers[name] = entry;
}
const account = await read('');
report.account = { status: account.status, success: account.success, codes: account.codes };
const dev = report.workers['heibon-mahjong-online-dev'];
report.developmentAbsent = dev.status === 404 && dev.codes.includes(10007);
const output = JSON.stringify(report, null, 2);
console.log(output);
appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\nRead-only Cloudflare inspection:\n\n\`\`\`json\n${output}\n\`\`\`\n`);
if (!report.workers['heibon-mahjong-online'].success || (!dev.success && !report.developmentAbsent)) process.exitCode = 1;
