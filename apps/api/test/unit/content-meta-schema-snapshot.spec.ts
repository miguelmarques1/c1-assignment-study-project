import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT, IMPORTABLE_CONTENT_TYPES } from '../../src/content/content-constants';
import { buildMetaSchema, metaSchemaPath } from '../../src/content/meta-schema';
import { ERROR_TAXONOMY_PATH } from '../../src/taxonomy/error-taxonomy.constants';
import { loadErrorTaxonomyFile } from '../../src/taxonomy/error-taxonomy';

const STALE = 'assignment-content/*/meta.schema.json is stale: run `pnpm content:schema` from apps/api and commit the result';

function committed(type: (typeof IMPORTABLE_CONTENT_TYPES)[number]): Record<string, unknown> {
  // Compared parsed, not as text: git may check the file out with CRLF.
  return JSON.parse(readFileSync(metaSchemaPath(CONTENT_ROOT, type), 'utf-8')) as Record<string, unknown>;
}

describe('curator meta.schema.json files', () => {
  const taxonomy = loadErrorTaxonomyFile(ERROR_TAXONOMY_PATH);

  it('committed_meta_schemas_are_up_to_date', () => {
    for (const type of IMPORTABLE_CONTENT_TYPES) {
      expect(committed(type), `${type}: ${STALE}`).toEqual(buildMetaSchema(type, taxonomy));
    }
  });

  it('target_tags_enum_mirrors_the_taxonomy_in_force', () => {
    const tags = taxonomy.tags.map((tag) => tag.tag);
    for (const type of IMPORTABLE_CONTENT_TYPES) {
      const properties = committed(type).properties as Record<string, { items: { enum: string[] } }>;
      expect(properties.target_tags?.items.enum, `${type}: ${STALE}`).toEqual(tags);
    }
  });
});
