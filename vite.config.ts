// @ts-ignore Node built-ins are available to Vite config execution; this project does not install @types/node.
import { execFileSync } from 'node:child_process';
// @ts-ignore Node built-ins are available to Vite config execution; this project does not install @types/node.
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
// @ts-ignore Node built-ins are available to Vite config execution; this project does not install @types/node.
import process from 'node:process';

export default defineConfig(({ mode }) => {
  let gitSha = 'unknown';
  try { gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* Unavailable in source archives and development sandboxes. */ }
  let appVersion = 'unknown';
  try { appVersion = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version?: string }).version ?? 'unknown'; } catch { /* Version is optional. */ }
  const buildTimeUtc = new Date().toISOString();
  const buildInfo = { gitSha, buildTimeUtc, appVersion, mode, schemaVersion: 2, buildId: `${gitSha}@${buildTimeUtc}` };
  const isItchBuild = mode === 'itch';
  const isDevelopmentPages = mode === 'development-pages';
  if (isDevelopmentPages) {
    const api = process.env.VITE_ONLINE_API_URL;
    if (!api || !/^https:\/\/heibon-mahjong-online-dev\.[a-z0-9-]+\.workers\.dev$/.test(api)) {
      throw new Error('Development Pages requires the explicit HTTPS development Worker URL.');
    }
  }
  if (isItchBuild) {
    const onlineApiUrl = process.env.VITE_ONLINE_API_URL;
    if (!onlineApiUrl) throw new Error('Set VITE_ONLINE_API_URL to the deployed HTTPS Worker URL before building the itch.io package.');
    let parsedOnlineApiUrl: URL;
    try { parsedOnlineApiUrl = new URL(onlineApiUrl); }
    catch { throw new Error('VITE_ONLINE_API_URL must be an absolute HTTPS URL.'); }
    if (parsedOnlineApiUrl.protocol !== 'https:') throw new Error('VITE_ONLINE_API_URL must use HTTPS.');
  }
  const input: Record<string, string> = isItchBuild
    ? { main: 'index.html' }
    : { main: 'index.html', kanTest: 'kan-test.html', test: 'test.html', callTest: 'call-test.html' };
  return {
    base: isItchBuild ? './' : isDevelopmentPages ? '/heibon-mahjong/dev/' : '/heibon-mahjong/',
    plugins: [{
      name: 'development-pages-identity',
      transformIndexHtml: (html: string) => isDevelopmentPages
        ? html.replace('<title>Heibon Mahjong</title>', '<meta name="apple-mobile-web-app-title" content="Heibon Mahjong DEV" /><title>Heibon Mahjong DEV</title>')
        : html,
    }],
    define: { __APP_BUILD_INFO__: JSON.stringify(buildInfo), __HEIBON_ENV__: JSON.stringify(isDevelopmentPages ? 'development' : 'production') },
    build: {
      rollupOptions: { input },
    },
  };
});
