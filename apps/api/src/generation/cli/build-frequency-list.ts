import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

import { FREQUENCY_LIST_PATH } from '../generation.constants';
import {
  FREQUENCY_LIST_SIZE,
  WORDFREQ_SOURCE_URL,
  decodeCbpack,
  rankLemmas,
  renderFrequencyList,
  wordZipfs,
} from '../text/frequency-list-builder';

/**
 * `pnpm frequency:build [--source <path or url>]`: rewrites the committed
 * frequency list from wordfreq's English data. A dev tool — the API never
 * runs it. Changing the file changes the gate, so bump the rules version in
 * rules/content-generation.yaml whenever the output differs.
 */
async function readSource(source: string): Promise<Uint8Array> {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Could not download ${source}: HTTP ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  return readFileSync(source);
}

function parseArgs(argv: string[]): { source: string } {
  let source = WORDFREQ_SOURCE_URL;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    }
    if (arg === '--source') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--source needs a path or a URL.');
      }
      source = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument "${arg}". Usage: pnpm frequency:build [--source <path or url>]`);
  }
  return { source };
}

async function main(): Promise<void> {
  const { source } = parseArgs(process.argv.slice(2));
  const buckets = decodeCbpack(await readSource(source));
  const rows = rankLemmas(wordZipfs(buckets), FREQUENCY_LIST_SIZE);
  const lemmatizerVersion = (
    JSON.parse(readFileSync(require.resolve('wink-lemmatizer/package.json'), 'utf-8')) as { version: string }
  ).version;

  const text = renderFrequencyList(rows, {
    // A local copy is named by its file name only, so no machine path lands in the committed file.
    source: /^https?:\/\//.test(source) ? source : `a local copy of ${basename(source)}`,
    lemmatizerVersion,
    generatedOn: new Date().toISOString().slice(0, 10),
  });
  writeFileSync(FREQUENCY_LIST_PATH, text, 'utf-8');
  process.stdout.write(`Wrote ${rows.length} lemmas to ${FREQUENCY_LIST_PATH}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
