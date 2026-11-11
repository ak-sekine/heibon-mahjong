import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const env = process.argv[2];
if (!['production', 'development'].includes(env)) throw new Error('Invalid environment');
const branch = env === 'production' ? 'main' : 'develop';
if (process.env.GITHUB_REF !== 'refs/heads/' + branch) throw new Error('Wrong deployment branch');
const latest = execFileSync('gh', ['api', `repos/${process.env.GITHUB_REPOSITORY}/commits/${branch}`, '--jq', '.sha'], { encoding: 'utf8' }).trim();
if (latest !== process.env.GITHUB_SHA) throw new Error('Stale source SHA');
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.EXPECTED_WORKER_URL) throw new Error('Missing explicit deployment configuration');
const name = env === 'production' ? 'heibon-mahjong-online' : 'heibon-mahjong-online-dev';
const expected = process.env.EXPECTED_WORKER_URL;
if (!new RegExp('^https://' + name + '\\.[a-z0-9-]+\\.workers\\.dev$').test(expected)) throw new Error('Wrong configured Worker endpoint');
let output;
try { output = execFileSync('npx', ['wrangler', 'deploy', '--config', env === 'production' ? 'wrangler.jsonc' : 'wrangler.development.jsonc'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
catch { throw new Error('Wrangler failed; output suppressed to protect credentials. Check Cloudflare account setup.'); }
if (!output.includes(expected)) throw new Error('Deployed Worker URL differs from tested candidate');
appendFileSync(process.env.GITHUB_OUTPUT, 'url=' + expected + '\n');
