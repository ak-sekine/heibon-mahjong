// @ts-ignore Node built-ins are available to Vite config execution; this project does not install @types/node.
import { execFileSync } from 'node:child_process';
// @ts-ignore Node built-ins are available to Vite config execution; this project does not install @types/node.
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  let gitSha = 'unknown';
  try { gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* Unavailable in source archives and development sandboxes. */ }
  let appVersion = 'unknown';
  try { appVersion = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version?: string }).version ?? 'unknown'; } catch { /* Version is optional. */ }
  const buildTimeUtc = new Date().toISOString();
  const buildInfo = { gitSha, buildTimeUtc, appVersion, mode, schemaVersion: 2, buildId: `${gitSha}@${buildTimeUtc}` };
  return {
    base: '/heibon-mahjong/',
    define: { __APP_BUILD_INFO__: JSON.stringify(buildInfo) },
    build: { rollupOptions: { input: { main: 'index.html', kanTest: 'kan-test.html', test: 'test.html' } } },
  };
});
