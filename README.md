# SHIP IT — Duvo Card Game

A quick, browser-playable card battler themed around AI-engineering culture. Built as a
playtest tool for Duvo swag/game ideas — four factions, 30 cards each, first to 5 Ship Points,
~15-20 minutes a match.

## Play it

**Live:** https://jankratochvilcz.github.io/duvo-cards/

Serve this folder over HTTP locally (card art paths need a real origin — opening `index.html`
as a `file://` URL will load the game but may block images in some browsers):

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
| [`data/cards.json`](./data/cards.json) | **Authoritative card data** (stats, effects, flavor, counts, art paths) |
| [`scripts/sync-cards.py`](./scripts/sync-cards.py) | Regenerates derived artifacts from `cards.json` |
| [`CARDS.md`](./CARDS.md) | Human-readable tables — **generated**, do not edit by hand |
| [`index.html`](./index.html) | Game UI/engine; embeds a synced copy of `DECK_TEMPLATES` from `cards.json` |
| [`SPEC.md`](./SPEC.md) | Authoritative rules reference — every mechanic, exactly as implemented |
| [`art/cards/<deck>/`](./art/cards/) | Per-card key art (filenames match card names) |
| [`art/factions/`](./art/factions/) | Faction key art used on the deck picker |

After editing `data/cards.json` (or replacing art files), run:

```bash
python3 scripts/sync-cards.py
```

That validates every card has art on disk, rewrites `CARDS.md`, and patches the embedded
`DECK_TEMPLATES` block in `index.html` so the playable build cannot drift from the JSON.

Art paths are convention-based: `art/cards/<deckKey>/<Card_Name>.png` (spaces → `_`,
`We'll` → `Well`, punctuation stripped). The sync script writes the resolved `art` field
into both `cards.json` and the embedded templates.

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
2. **`data/cards.json` is ground truth for card data.** Never edit `CARDS.md` or the embedded
   `DECK_TEMPLATES` by hand — change the JSON, then run `scripts/sync-cards.py`.
3. **Everything game-logic lives in one `<script>` tag in `index.html`.** There's no build step
   and no framework — plain string-concatenated HTML rendering, a single global `state` object,
   and a `render()` call after every state change. Keep new code consistent with that style.
4. **Test by serving the folder** (`python3 -m http.server`) and playing in a browser.
5. See the "Known open design questions" section at the end of `SPEC.md` for concrete starting
   points (AI opponent behavior, deck balance analysis, some one-time-flag edge cases).
