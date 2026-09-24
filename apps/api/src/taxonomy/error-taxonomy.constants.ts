import { join } from 'node:path';

/** The versioned taxonomy file, read once at boot (F11). Restart the API after editing it. */
export const ERROR_TAXONOMY_PATH = join(process.cwd(), 'rules', 'error-taxonomy.yaml');
