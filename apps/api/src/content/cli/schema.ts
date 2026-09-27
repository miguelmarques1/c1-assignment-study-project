import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative } from 'node:path';

import { ERROR_TAXONOMY_PATH } from '../../taxonomy/error-taxonomy.constants';
import { loadErrorTaxonomyFile } from '../../taxonomy/error-taxonomy';
import { CONTENT_ROOT, IMPORTABLE_CONTENT_TYPES } from '../content-constants';
import { buildMetaSchema, metaSchemaPath, renderMetaSchema } from '../meta-schema';

/**
 * `pnpm content:schema`: writes `assignment-content/<type>/meta.schema.json`
 * for every importable type. Re-run it after changing the shared content
 * schema or the error taxonomy, and commit the result.
 */
async function main(): Promise<void> {
  const taxonomy = loadErrorTaxonomyFile(ERROR_TAXONOMY_PATH);

  for (const type of IMPORTABLE_CONTENT_TYPES) {
    const path = metaSchemaPath(CONTENT_ROOT, type);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, renderMetaSchema(buildMetaSchema(type, taxonomy)), 'utf-8');
    console.warn(`Wrote ${relative(process.cwd(), path)} (taxonomy v${taxonomy.version}, ${taxonomy.tags.length} tags)`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
