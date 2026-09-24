---
paths:
  - "packages/design-tokens/**"
---

# Design tokens (`packages/design-tokens`)

- `tokens.json` is the only source of styling values for web and mobile. Everything else is generated: `generated/tokens.css` and the TypeScript module for the web, `lib/english_quest_tokens.dart` for Flutter.
- Never hand-edit a generated file. Change `tokens.json` (or an emitter in `src/`), then run `pnpm tokens:build`.
- The package's tests check that the committed outputs match a fresh build and that every semantic colour pair meets its contrast minimum. Run `pnpm --filter @english-quest/design-tokens test`.
- Changing a token changes both clients. Check the web's `test/token-resolution.spec.ts` and `test/no-raw-values.spec.ts`, and run `flutter analyze` in `apps/mobile`.
- A new value that doesn't exist in `design/english_quest_design_system/DESIGN.md` needs a reason. The reference design is the authority, and the tokens encode it.
