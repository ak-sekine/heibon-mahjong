const args = process.argv.slice(2);
const productionReuse = args.length === 1 && args[0] === 'production-reuse';
if (args.length && !productionReuse) throw new Error('Unknown publication settings mode');

const { PRODUCTION_WORKER_URL, DEVELOPMENT_WORKER_URL, CLOUDFLARE_ACCOUNT_ID } = process.env;
if (PRODUCTION_WORKER_URL !== 'https://heibon-mahjong-online.ak-sekine.workers.dev') {
  throw new Error('Invalid production Worker URL');
}
if (!productionReuse && DEVELOPMENT_WORKER_URL !== 'https://heibon-mahjong-online-dev.ak-sekine.workers.dev') {
  throw new Error('Invalid development Worker URL');
}
if (!/^[0-9a-fA-F]{32}$/.test(CLOUDFLARE_ACCOUNT_ID)) {
  throw new Error('CLOUDFLARE_ACCOUNT_ID must be a 32-character hexadecimal account ID');
}
console.log(productionReuse
  ? 'Production Worker URL and shared Cloudflare account ID format verified.'
  : 'Production and development Worker URLs and shared Cloudflare account ID format verified.');
