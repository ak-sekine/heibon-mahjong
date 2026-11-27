import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { inspectFinalizedSnapshot, verifyRecoveryPublicSite } from '../../scripts/environments/pages-recovery.mjs';
import { configuration, createApi, inspectWorker } from './worker-independent.mjs';
import { planPublication } from './publication-plan.mjs';

export async function planAutomatic({ config, store, source, api, ref, git = execFileSync, get = fetch }) {
  const storeSha = await ref('pages-verified');
  if (!/^[a-f0-9]{40}$/.test(storeSha || '')) throw new Error('Pages store ref is unavailable');
  const checked = git('git', ['-C', store, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (checked !== storeSha) throw new Error('Wrong Pages store checkout');
  const { state, files } = inspectFinalizedSnapshot(store);
  await verifyRecoveryPublicSite(files, get);
  const worker = await inspectWorker(config, api);
  const plan = planPublication({ environment: config.environment, candidate: config.sha,
    pagesBase: state.current[config.environment].sha, workerBase: worker.sha, target: 'auto',
    git: (cmd, args, opts) => git(cmd, args, { ...opts, cwd: source }) });
  if (plan.blocked) throw new Error('Automatic publication target is unknown: ' + plan.reason);
  if (await ref('pages-verified') !== storeSha || await ref(config.branch) !== config.sha) throw new Error('Publication refs changed during planning');
  return plan;
}

async function cli() {
  const env = process.env, config = configuration(env), api = createApi(config);
  const ref = name => api.ref(name).then(result => result?.object?.sha);
  const plan = await planAutomatic({ config, api, ref, store: env.PAGES_STORE, source: env.SOURCE_DIR });
  appendFileSync(env.GITHUB_OUTPUT, `pages=${plan.pages}\nworker=${plan.worker}\nclassification=${plan.classification}\n`);
  appendFileSync(env.GITHUB_STEP_SUMMARY, `Automatic publication decision: ${plan.classification}; Pages ${plan.pages}, Worker ${plan.worker}.\n`);
}
if (process.argv[1]?.endsWith('/publication-auto.mjs')) await cli();
