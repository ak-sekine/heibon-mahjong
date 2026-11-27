import { runIndependentWorker } from './worker-independent.mjs';
if (process.argv.length !== 3 || process.argv[2] !== 'independent') throw new Error('Only independent Worker publication is supported');
await runIndependentWorker();
