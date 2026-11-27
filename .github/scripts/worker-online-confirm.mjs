import { configuration, createApi, confirmOnline } from './worker-independent.mjs';
const config = configuration(process.env);
await confirmOnline(config, createApi(config), Number(process.env.WORKER_DEPLOYMENT_ID), process.env.WORKER_VERSION);
