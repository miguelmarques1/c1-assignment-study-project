# Frequency list

`en-lemmas-top5000.tsv` is the reference data of the F14 difficulty gate: the 5,000 most frequent English lemmas, ranked. The gate counts a generated text's words ranked beyond 3,000 (or absent from the list) and requires at least 12% of them (`rules/content-generation.yaml`). The API refuses to boot without this file, because silently skipping the gate would ship unverified content while appearing to work.

## Provenance and licence

- **Source:** wordfreq's `large_en` data, by Robyn Speer et al. (<https://github.com/rspeer/wordfreq>), read at a pinned commit (see the file header and `WORDFREQ_COMMIT` in `src/generation/text/frequency-list-builder.ts`). wordfreq blends written and spoken sources (Wikipedia, books, news, subtitles, web text), which is closer to the written prose the gate measures than a subtitles-only list.
- **Licence:** wordfreq's data is licensed under CC BY-SA 4.0 (<https://creativecommons.org/licenses/by-sa/4.0/>). This list is derived from it and shared under the same licence, with the attribution in the file header. Keep the header when editing or rebuilding.
- **Lemmatisation:** each word form's frequency is credited to its verb, noun or adjective lemma from `wink-lemmatizer` (MIT), in that order, when that lemma is itself a word in the source at most 1.5 Zipf below the form (so `was` → `be` and `better` → `good`, but `boss` stays `boss`). Only lowercase alphabetic words are kept, and single letters except `a` and `i` are dropped. Names are included, as wordfreq lists them lowercase. The gate skips capitalised mid-sentence words that are not in the list, not the ones that are.

## Rebuilding

```bash
pnpm --filter @english-quest/api frequency:build
```

This downloads the pinned source and rewrites the file. `--source <path or url>` reads another copy of `large_en.msgpack.gz`. The output is deterministic for the same source, apart from the generation date in the header.

Changing this file changes what the gate passes. Bump `version` in `rules/content-generation.yaml` in the same change: every generated item records the list's version (`en-lemmas-top5000@<hash>`) next to the rules version, so items measured against different lists stay distinguishable.
