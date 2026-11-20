import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function publicationMode(value) {
  switch (value ?? '') {
    case '': return 'disabled (unset)';
    case 'false': return 'disabled (false)';
    case 'true': return 'enabled (true; manual publish=true dispatch still required)';
    default: throw new Error('DUAL_PAGES_ENABLED must be unset, false, or true.');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    console.log(`Publication mode: ${publicationMode(process.env.DUAL_PAGES_ENABLED)}.`);
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
