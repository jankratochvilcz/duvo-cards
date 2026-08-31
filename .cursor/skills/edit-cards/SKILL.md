---
name: edit-cards
description: Add, retune, or replace SHIP IT cards. Use when changing stats, counts, effects, flavor, art, or adding a new card. data/cards.json is the only catalog — never edit card lists in index.html or markdown.
---

# Edit cards

`data/cards.json` is the **only** card catalog. The live game fetches `data/cards.json` at runtime. `scripts/simulate.js` reads that same file. There is no markdown card table and no embedded `DECK_TEMPLATES` block.

## Always

1. Edit `data/cards.json` only for card data (name, type, cost, power, stability, effect, text, flavor, count).
2. Keep each of `latency`, `hallucination`, `injection`, `techdebt` at **exactly 30** copies (`sum(count) === 30`).
3. Run `python3 scripts/sync-cards.py`. It assigns `art` paths, checks files exist, rejects `<>` in copy, and rewrites the JSON in a stable field order. It does **not** patch `index.html` and does **not** write markdown.
4. If you change an **effect's rules** (not just which card uses it), update `index.html`, `scripts/simulate.js`, and `SPEC.md` together.

## Never

- Do not paste card objects into `index.html`.
- Do not create or update `CARDS.md`.
- Do not hand-edit `art` paths; the sync script derives `art/cards/<deck>/<Slug>.png` from the name (`We'll` → `Well`, strip `'`, `:`, `,`, spaces → `_`).

## New cards

- Pick a unique `name` in that deck. Add PNG art at the derived path before sync will pass.
- Internal `type` is `process` (Agent) or `patch` (Overclock). `effect` is a key the engine already implements, or you are adding a new key in the same PR.
- Agents need `cost`, `power`, `stability`. Overclocks omit those.
- Generate art to match existing card portraits (dark, faction-colored, no cluttered multi-eye mess). Copy the style of neighbors in `art/cards/<deck>/`.
- New cards that change a deck's identity belong in their own PR, not mixed into an unrelated engine fix.

## After a data change

```bash
python3 scripts/sync-cards.py
node scripts/simulate.js --games 1600 --seed 1
```

If the change is meant to move win rates, follow the `balance-playtest` skill instead of stopping at one seed.
