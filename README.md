# SHIP IT — Duvo Card Game

A quick, browser-playable card battler themed around AI-engineering culture. Built as a
playtest tool for Duvo swag/game ideas — four factions, 30 cards each, first to 5 Ship Points,
~15-20 minutes a match.

## Play it

**Live:** https://jankratochvilcz.github.io/duvo-cards/

Serve this folder over HTTP locally (the game fetches `data/cards.json`, and card art paths need
a real origin — opening `index.html` as a `file://` URL will not load the decks):

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

Supports two modes:

- **Play vs AI** — a simple (beatable) bot opponent, good for solo balance testing.
- **Hotseat** — pass the device between two players. The UI shows a clear turn banner and
  reorders the board so whoever's turn it is is always at the bottom, next to their own hand.

## Single source of truth

| File | Role |
|---|---|
| [`data/cards.json`](./data/cards.json) | **The only card catalog** (stats, effects, flavor, counts, art paths). The game fetches this at runtime. The simulator reads it directly. |
| [`scripts/sync-cards.py`](./scripts/sync-cards.py) | Validates art, deck size (30), and copy; normalizes `art` paths in the JSON |
| [`index.html`](./index.html) | Game UI/engine. **Does not contain card lists.** |
| [`scripts/simulate.js`](./scripts/simulate.js) | Headless heuristic match runner for balance playtests |
| [`SPEC.md`](./SPEC.md) | Authoritative rules reference — every mechanic, exactly as implemented |
| [`art/cards/<deck>/`](./art/cards/) | Per-card key art (filenames match card names) |
| [`art/factions/`](./art/factions/) | Faction key art used on the deck picker |

After editing `data/cards.json` (or replacing art files), run:

```bash
python3 scripts/sync-cards.py
```

That is validation + path normalization only. It does **not** generate markdown and does **not**
patch `index.html`. Do not recreate a `CARDS.md`.

Art paths are convention-based: `art/cards/<deckKey>/<Card_Name>.png` (spaces → `_`,
`We'll` → `Well`, punctuation stripped). The sync script writes the resolved `art` field
back into `cards.json`.

## Faction quick reference

| Deck key | Deck | Archetype | Color |
|---|---|---|---|
| `latency` | Latency | Aggro | Green `#39FF88` |
| `hallucination` | Hallucination | Chaos | Red `#FF3355` |
| `injection` | Prompt Injection | Interference | Blue `#2F80FF` |
| `techdebt` | Technical Debt | Scaling | Grayscale `#B8C0C8` |

## Working on this

If you're an agent (or human) picking up a task here:

1. **Read `SPEC.md` first.** It's written to match the current implementation exactly, not an
   aspirational design doc — if something in the code contradicts it, the code is probably right
   and the spec needs updating in the same PR.
2. **`data/cards.json` is the only card catalog.** Never put card lists in `index.html` or in
   markdown. Change the JSON, then run `scripts/sync-cards.py`.
3. **Everything game-logic lives in one `<script>` tag in `index.html`.** There's no build step
   and no framework — plain string-concatenated HTML rendering, a single global `state` object,
   and a `render()` call after every state change. Keep new code consistent with that style.
   If you change a rule, update `scripts/simulate.js` in the same PR.
4. **Test by serving the folder** (`python3 -m http.server`) and playing in a browser.
5. For faction win-rate work, follow the `balance-playtest` skill. For adding or retuning cards,
   follow the `edit-cards` skill.
