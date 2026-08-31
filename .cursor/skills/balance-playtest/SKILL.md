---
name: balance-playtest
description: Playtest and rebalance SHIP IT factions across thousands of heuristic matches. Use when asked to playtest, retune win rates, rebalance decks, find broken cards, or make factions have similar win ratios. Do not edit card lists in index.html or markdown.
---

# Balance playtest

SHIP IT is a 4-faction, 30-card, first-to-5 card battler. Card data lives in **one file**: `data/cards.json`. The browser game fetches it. The simulator reads it. Never duplicate card lists in `index.html` or recreate `CARDS.md`.

## What "balanced" means here

- Round-robin win rates clustered around 50% (a ~10-point band is the target; 50-point spreads are broken).
- Most games end on **Ship Points**, not deck-out.
- Each faction keeps a distinct playstyle and at least one rare dominate combo. Do not flatten everything to vanilla stats.
- Every deck stays **exactly 30 cards**, with a real mix of Agents (`type: "process"`) and Overclocks (`type: "patch"`). Current shape is 21 / 9.

Read `SPEC.md` before changing a rule. If code and spec disagree, the code is probably right — update the spec in the same PR.

## Setup

Do **not** have LLM subagents play matches by hand. That is too slow and too noisy for thousands of games. Use the headless heuristic:

```bash
python3 scripts/sync-cards.py
node scripts/simulate.js --games 1600 --seed 1
node scripts/simulate.js --games 1600 --seed 1 --json   # machine-readable
```

`--games 1600 --matchup all` is 100 games per each of the 16 matchups (including mirrors). Run 4 parallel batches with different `--seed` values (total ~6400 games) and merge JSON.

The simulator **must stay faithful** to `index.html`. If you change a combat rule, extra-attack stacking, bounce promote, breakthrough scoring, opening-hand size, etc., edit **both** `index.html` and `scripts/simulate.js` in the same commit.

## Loop

1. Baseline: 4×1600 games, all matchups. Record faction win%, on-the-play / on-the-draw, ship vs deck-out, average turns, matchup matrix, and which cards score / correlate with wins.
2. Diagnose. Typical failure modes:
   - One faction can empty Primary (bounce, skip-deploy) and punch; others cannot score.
   - Extra-attack charges do not stack, or a traded Primary leaves nobody to take the extra swing.
   - Glass-cannon Stability 1 bodies always die to counter-damage before a second attack.
   - Pure walls with no payoff stall until deck-out.
   - Draw effects that mill the deck win (or lose) only because games never reach 5 points.
3. Patch **rules in the engine** (both files) and/or **numbers in `data/cards.json`**. Do not edit a markdown card table. Then `python3 scripts/sync-cards.py`.
4. Fresh simulator batches (new seeds). Repeat until faction win rates are close and ship-point wins dominate.
5. Keep identities:
   - Latency: haste and crash-then-chain extra attacks.
   - Hallucination: coin flips (self-crash / prevent crash), tutors, a rare blowout (Temperature + AGI + extra attack).
   - Prompt Injection: bounce / steal / skip as denial, not a free point every turn. Sandbox immunity is the anti-bounce answer.
   - Technical Debt: discard scaling, mill, crash-grow, late extra-attack cash-in.

## Card edits

Follow the `edit-cards` skill. Summary: only `data/cards.json`, keep each deck at 30, generate art if you add a new name, run `scripts/sync-cards.py`.

If a deck is missing a play pattern and no existing card can carry it, **new cards are a separate PR** with art. Do not sneak new names into a pure numbers pass if you can retune counts and stats instead.

## What not to do

- Do not embed `DECK_TEMPLATES` in `index.html` again.
- Do not generate `CARDS.md`.
- Do not call the in-game `aiTakeTurn` the balance oracle — it is a weaker heuristic than `scripts/simulate.js`.
- Do not "balance" by making every faction play the same (all bounce, all extra attack, all walls).
