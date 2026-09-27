# Curated content

This folder is the curator's side of the content bank (F13). Each item is a folder holding a `meta.json` and, for listening, one audio file. `pnpm content:import` validates every item, uploads the audio to MinIO and writes the item into the bank. Items never appear in a browsing screen. Users meet them only as activities inside a study plan.

Only `meta.json` is versioned. Audio (`.mp3`, `.m4a`, `.wav`, `.ogg`) is ignored by git and reaches object storage only through the importer. A metadata fix therefore shows up as a readable diff in review, which matters when the metadata was drafted with an external AI tool.

## Layout

```
assignment-content/
  listening/
    meta.schema.json          generated, do not edit
    bbc-climate-debate/
      meta.json
      audio.mp3               not in git
  reading/
    tech-ethics-op-ed/
      meta.json
  vocabulary/
  grammar/
```

- **The folder decides the type and the slug.** Neither appears in `meta.json`.
- **Slugs** are lowercase letters and digits separated by single hyphens (`bbc-climate-debate`), at most 80 characters. A slug is unique across every type, and across generated items too: reusing one is refused, never overwritten.
- **Listening** folders need exactly one audio file with one of the four extensions above (any case), at most 100 MB, named with letters, digits, `.`, `_` or `-` only. The importer decodes the whole file to measure its duration, so a file that doesn't play is rejected at import instead of in the activity player.
- **Reading, vocabulary and grammar** folders must not contain audio.
- Other files in an item folder (notes, drafts) are ignored.

`error_review` items are not importable. Only AI generation (F14) produces them.

## `meta.json`

Keys are `snake_case`, and an unknown key is an error, so a typo such as `dificulty` is caught rather than silently dropped. Start each file with `"$schema": "../meta.schema.json"` and your editor will autocomplete fields and flag shape errors as you type. The answer-key rules below are checked only by the importer.

| Field | Required | Rule |
|---|---|---|
| `title` | yes | 1–200 characters |
| `cefr_level` | yes | `A1`, `A2`, `B1`, `B2`, `C1` or `C2` |
| `topic` | yes | 1–80 characters, e.g. `climate policy` |
| `accent` | listening only | `american`, `british`, `australian`, `canadian`, `irish`, `scottish`, `new_zealand`, `south_african`, `indian` or `other`. Not allowed on other types |
| `skills` | yes | 1–4 of `listening`, `reading`, `vocabulary`, `grammar`, no repeats, and must include the item's own type |
| `difficulty` | yes | integer 1–5 |
| `source` | yes | `{ "name": "…", "url": "https://…" }`. `url` is optional |
| `body` | listening and reading | The transcript (listening, shown after submission) or the text (reading). Optional for vocabulary and grammar. At most 20,000 characters |
| `questions` | yes | exactly 5, in any mix of the four formats below |
| `target_tags` | yes | 1–10 tags, no repeats, each listed in `apps/api/rules/error-taxonomy.yaml` (for example `grammar:conditional-3`, `vocab:collocation`, `discourse:connector`) |

The importer works out the duration, word count, checksum and storage key itself. Don't write them.

## Question formats

Every question has a `format`, a `prompt` (1–500 characters), an `answer` and a non-empty `explanation` (up to 1,000 characters), which is shown once the activity is submitted.

**`multiple_choice`**: exactly 4 distinct `options`. `answer` is the correct option's text, exactly as written in `options`.

```json
{
  "format": "multiple_choice",
  "prompt": "What is the presenter's main concern?",
  "options": ["The cost of solar panels", "Who bears the cost of the transition", "The speed of wind farm approvals", "Consumer energy habits"],
  "answer": "Who bears the cost of the transition",
  "explanation": "In the opening minute he frames the programme around the distribution of costs, not the technology."
}
```

**`fill_blank`**: the prompt contains exactly one blank, written as three or more underscores. `answer` lists 1–5 accepted variants. Matching ignores case and surrounding spaces.

```json
{
  "format": "fill_blank",
  "prompt": "The economist argues that the burden has been ___ onto households.",
  "answer": ["shifted", "offloaded"],
  "explanation": "She says 'shifted onto households' at 04:12; 'offloaded' is an accepted synonym."
}
```

**`ordering`**: 3–8 distinct `segments`, shown in the order written. `answer` lists the segment indexes (from 0) in the correct order. It must differ from the displayed order, or the question can't be answered wrong.

```json
{
  "format": "ordering",
  "prompt": "Put the arguments in the order they are made.",
  "segments": ["Carbon taxes are regressive", "Subsidies favour homeowners", "Grid upgrades are unavoidable"],
  "answer": [2, 0, 1],
  "explanation": "The grid point opens the debate, the tax point follows, and subsidies close it."
}
```

**`matching`**: `left` and `right` each hold 3–6 distinct items, and both lists are the same length. `answer[i]` is the index in `right` that pairs with `left[i]`. Every right item is used exactly once, and the pairing must not be the displayed order.

```json
{
  "format": "matching",
  "prompt": "Match each speaker to their position.",
  "left": ["Economist", "Minister", "Campaigner"],
  "right": ["Delay is costlier than action", "Households need protection", "The timetable is realistic"],
  "answer": [1, 2, 0],
  "explanation": "The economist defends households, the minister the timetable, and the campaigner urgency."
}
```

## Commands

Run these from `apps/api`, inside the API container on a running stack: `docker compose exec api sh -c 'cd apps/api && pnpm content:import'`.

| Command | What it does |
|---|---|
| `pnpm content:import` | Imports or updates every item |
| `pnpm content:import --dry-run` | Runs every check, including decoding and the checksum comparison, and writes nothing |
| `pnpm content:import listening` | Only the listening folder |
| `pnpm content:import listening/bbc-climate-debate` | Only one item |
| `pnpm content:stats` | Inventory, the corpus target, usage, and items whose tags left the taxonomy |
| `pnpm content:schema` | Regenerates the `meta.schema.json` files. Run it after the content schema or the error taxonomy changes |

Output streams one line per item, followed by a summary:

```
✓ bbc-climate-debate (imported, 4.2 MB uploaded)
↻ ted-urban-design (updated, media unchanged)
✗ npr-housing (meta.json: /questions/2/answer must be one of /questions/2/options)
1 imported, 1 updated, 1 skipped, 0 failed.
```

- Re-running is safe. An item is updated in place, and its audio is uploaded again only when the file's checksum changed, or when the stored object has gone missing.
- A broken item is skipped with the reason, and the rest of the batch still imports. The command exits non-zero if anything was skipped or failed.
- The importer never deletes anything. If an item's folder disappears, the bank keeps the item (a plan may still use it) and the run lists it on a warning line.

**Corpus target (MVP):** at least 20 listening items, spanning at least 3 accents and covering difficulties 3, 4 and 5. `pnpm content:stats` reports each condition.
