# SHIP IT — Game Spec

A quick 2-player card battler themed around AI-engineering culture. Four fixed 30-card decks,
first to 5 Ship Points wins, ~15-20 minutes per match. Built as a single self-contained
`index.html` — no build step, no dependencies beyond a browser.

This doc is the authoritative rules reference. It's written to match the actual implementation
exactly (see `index.html`), so any agent working on balance, new cards, or new mechanics should
treat this as ground truth for *current* behavior — and update it in the same PR as any rule change.

---

## Setup

- Each player picks one of the four decks (see `CARDS.md` / `data/cards.json`).
- Each player has two **Agent slots**: **Primary** and **Backup**.
- Each player starts at **0 Ship Points**. First to **5** wins.
- Starting hand: 5 cards, drawn from the top of a shuffled 30-card deck. The second player
  draws 1 extra card before the match begins (6-card opening hand) to offset first-turn haste.
- If a player cannot draw a card on their own turn (deck-out), they lose immediately.

## Turn structure

On the active player's turn, in any order they like (this is deliberately loose — there is no
strict phase order except "draw happens first"):

1. **Draw** — 1 card, automatically, at the start of the turn.
2. **Deploy** (optional) — play 1 Agent from hand into an empty slot (Primary if empty, else
   Backup). Cost gate: an Agent's Cost must be ≤ `min(turnsTaken, 4)` — i.e. a Cost-3 card can't
   be deployed before your 3rd turn, and the cap tops out at turn 4 (nothing above Cost 4 exists).
   Some Overclocks grant an extra deploy this turn (see `extraDeploy`).
3. **Overclock** (optional) — play 1 Overclock from hand, any time before or after deploying.
   Exactly one per turn unless boosted.
4. **Attack** (optional) — click Attack once per turn. This is a genuine choice, not automatic;
   see [Combat](#combat) below for what happens and why it's risky.
5. **End Turn** — always available, whether or not you attacked.

### Summoning sickness

An Agent normally **cannot attack the turn it's deployed** — it can sit in a slot and defend,
but its first attack has to wait for your next turn. Cards with the `noSummoningSickness` effect
(currently: **Cache Hit**) are the explicit exception and can attack immediately.

### Backup → Primary swap

You may manually swap Backup into Primary (or fill an empty Primary from Backup) at any time on
your turn, for free — **except** a Backup can't be swapped in on the same turn it was deployed
(mirrors the summoning-sickness restriction, applied to repositioning rather than attacking).

### End-of-turn auto-promotion

If a player's Primary slot is empty at the end of *any* turn (yours or your opponent's), their
Backup is automatically promoted into Primary. This is unconditional and not a "swap" — it isn't
blocked by the same-turn-deploy restriction above.

---

## Combat

Attacking is optional, and it's the core tension of the game: it's the only way to score, but it
puts your own Agent at risk regardless of whether your attack lands.

1. Your Primary attacks the opponent's Primary.
2. **If the opponent has no Primary**, this is an **unblocked hit**: you score **1 Ship Point**
   immediately and nothing else happens.
3. **If the opponent has a Primary**, resolve in this order:
   - Compute your attacker's effective Power (base + all active modifiers, see
     [Stats](#effective-stats-power--stability) below).
   - **Counter-damage check**: if the *defender's* effective Power ≥ the *attacker's own*
     effective Stability, your attacker crashes — regardless of whether your attack also crashes
     the defender. This is compared against your attacker's **Stability**, not its Power, so a
     tanky-but-weak attacker (high Stability, low Power) is safe to swing with even into a
     high-Power target; a glass-cannon attacker (high Power, low Stability) is not.
   - **Crash check**: if your attacker's effective Power ≥ the defender's effective Stability,
     the defender crashes. Some defensive effects (`coinPreventCrash`, `gracefulOnce`) can cancel
     this even when the numbers say it should happen.
   - Both crash checks are independent — a mutual trade (both Agents crash) is possible and common.
4. A crashed Agent goes to its owner's discard pile, **unless** it has `recycleOnCrash` (goes back
   into the deck instead) — see **The Duct Tape Fix**.
5. **Breakthrough:** if that combat crash left the opponent with *no Backup* (their last Agent
   just went down), you score **1 Ship Point**. Crashing a Primary while they still have a Backup
   sitting in the other slot does *not* score — that's what extra-attack chaining is for.
6. Unblocked hits (step 2) and breakthroughs (step 5) are the only ways to score. Hard-removal
   Overclocks (`crashOppPrimary`, `mutualCrashPrimaries`) still never score.

### Extra-attack chaining

`extraAttack` is a charge counter, not a boolean. Playing two extra-attack effects (or combining **Force Push To Prod** / **Just Making Things Up** / **Crunch Mode** with **Ship It**'s on-crash extra swing) stacks. After each swing, if your Primary is empty and you have a Backup, the Backup promotes immediately so the next swing can happen. The opponent's Backup still only auto-promotes at end of turn — that window is how aggro actually scores.

### Removal that skips combat entirely

A few Overclocks crash a target directly, without any Power/Stability comparison:
`crashOppPrimary` (**Kill -9**) and `mutualCrashPrimaries` (**Everything Is Deprecated**, which
crashes *both* players' Primaries). These still respect the immunity rule below.

### Immunity to opponent removal

Cards with `growPerTurnSurvive` (**Sunk Cost Fallacy**) or `sandboxImmune` (**The Sandbox
Escape**) cannot be bounced, force-swapped, or hard-removed by an *opponent's* targeted effect.
Combat crashes still work normally against them — the immunity is specifically about being
picked out by name by an opponent's card, not about combat. A player can still crash their own
immune card via their own effect (e.g. their own copy of Everything Is Deprecated still crashes
their own Primary even if it's immune to the opponent's copy of the same effect).

This is implemented as a single shared helper (`isImmuneToOppRemoval`) — any new removal-style
effect should call it rather than re-deriving immunity ad hoc.

---

## Effective stats (Power / Stability)

A card's printed Power/Stability is a floor, not the whole picture. Effective stats are
recomputed on the fly from these layers, all of which stack:

- `bonusPower` / `bonusStability` — permanent modifiers from an effect having already fired
  (e.g. **The Rewrite** growing after a crash, **Model Extraction** copying a stat snapshot).
- `tempPowerBonus` — a *temporary* Power buff that clears automatically at the start of the
  owner's next turn. This is what every "+3 Power until end of turn" Overclock uses
  (`tempPowerBuff3`: **Cache Warmup**, **Few-Shot Priming**, **Adversarial Perturbation**,
  **Crunch Mode**).
- Discard-pile scalers, recomputed live from the current discard pile size — not snapshotted:
  - `scalePowerDiscard3`: +1 Power per 2 cards in your discard (**Legacy Code**, **Deprecated,
    Still In Prod**).
  - `scalePowerByPatchDiscard`: +1 Power per Overclock card specifically in your discard
    (**Monkey Patch**, **The Vibes-Based Answer**).
  - `scaleStabilityByDiscard`: +1 Stability per card in your discard (**The Ancient
    Dependency**).
  - `scaleBothByDiscard`: +1 Power *and* +1 Stability per 3 cards in your discard (**Compound
    Interest**).
  - `growPerTurnSurvive`: +1 Power and +1 Stability per turn the card has survived
    (**Sunk Cost Fallacy**).
- In-combat, one-shot modifiers: `attackBonus2` (flat +2 Power on this attack, **The
  Overconfident Model**), `firstAttackBonus` (+5 Power, only the first time this specific card
  ever attacks, **The Demo That Worked**).

## Turn-start triggers

A few cards do something automatically at the start of their owner's turn, independent of combat:

- `singularityGrowth` (**Foothills of the Singularity**): flip a coin. Heads = double this
  card's Power, permanently. Tails = it crashes itself. High variance, no ceiling, real downside.
- `coinGrowSafe` (**Confidence Cascade**): flip a coin. Heads = +1 Power, permanently. Tails =
  nothing happens. Same shape as Foothills but with the failure case removed — slower, safer.
- `growPerTurnSurvive` (**Sunk Cost Fallacy**): unconditionally +1/+1 every turn it survives, no
  coin flip.

## On-deploy triggers

Several Agents do something the moment they enter play (as either Primary or Backup, whichever
slot they land in):

| Effect | Card(s) | What happens |
|---|---|---|
| `bounceOppPrimary` | The Jailbreak | Opponent's Primary returns to their hand (blocked by immunity). Their Backup, if any, is promoted immediately — bounce is a reroute, not a free empty-board punch unless they had no Backup. |
| `peekStealCard` | The Charm Exploit | You choose and take 1 card from the opponent's hand |
| `forceSwapOpp` | Attention Hijack | Opponent's Primary and Backup are force-swapped (blocked by immunity) |
| `copyOppPrimaryStats` | Model Extraction | This card's effective Power/Stability become a snapshot of the opponent's current Primary |
| `skipOppDeploy` | The Silent Observer | Opponent's next deploy is blocked |
| `deployDraw2Discard1` | The Confabulator | Draw 2, then choose 1 to discard |
| `shuffleDiscardIn` | The Great Refactor | Shuffle discard into deck; this Agent gains +1 Power per 2 cards shuffled in |
| `bonusIfSecondDeploy` | Parallel Rollout | +2 Power if you already deployed another Agent this turn |
| `bonusIfOverclockedThisTurn` | Zero-Day | +3 Power if you already played an Overclock this turn |

## Overclock effects (full list)

Overclocks are one-shot: play from hand, resolve immediately, go to discard. One per turn unless
boosted by `extraDeploy`-adjacent effects. Full effect-key reference:

`attackAgain` (charges stack — two extra-attack effects in one turn really do mean two extra swings; if your Primary crashed on an earlier swing, your Backup promotes immediately so the extra attack has a body. The opponent's Backup still waits until end of turn, so a crash-then-chain can score an unblocked hit), `extraDeploy`, `draw2`, `reroll`, `tempPowerBuff3`, `crashOppPrimary`,
`mutualCrashPrimaries`, `mutualRandomDiscard`, `skipAttackDraw2`, `skipOppPatch`, `skipOppAttack`,
`discardOppRandom2Draw1` (one random discard, not two), `drawThenDiscard`, `mulligan`, `look3take1`, `tutor`, `stabilityBuff2`,
`reclaimCrashed`.

See `data/cards.json` for exact card-to-effect mapping and rules text per card, or `CARDS.md` for
the human-readable table.

---

## Deck identities

| Deck | Archetype | Color | What it's trying to do |
|---|---|---|---|
| Latency | Aggro | Green `#39FF88` | Fast, fragile, wants to end the game before its low Stability gets punished |
| Hallucination | Chaos | Red `#FF3355` | Coin-flip variance — can blow out or fizzle completely |
| Prompt Injection | Interference | Blue `#2F80FF` | Bounces, steals, and reroutes the opponent's board — wins by denial, not just combat |
| Technical Debt | Scaling | Grayscale `#B8C0C8` | Weak early, discard-pile scaling makes it dangerous if the game runs long |

Faction colors are pure CSS custom properties (`--latency`, `--hallucination`, `--injection`,
`--techdebt` in `:root`) — every accent-colored UI element (card borders, badges, the turn
banner, board highlighting) derives from these four variables via `.deck-X` / `.card-X` classes,
so a palette change is a 4-line edit, not a search-and-replace across the file.

---

## Known open design questions (good starting points for other agents)

- AI opponent (`aiTakeTurn`) plays a wider set of Overclocks and will skip a swing that would only crash itself — still a heuristic, not a solver.
- Deck balance is stress-tested with a headless heuristic sim (`scripts/simulate.js`) across all 16 matchup pairs. Re-run after card changes: `node scripts/simulate.js --games 1600 --seed 1`.
- `hasAttacked` (for `firstAttackBonus`) and `usedGraceful` (for `gracefulOnce`) are per-card-
  instance one-time flags that never reset — confirm that's intended for cards that get bounced
  back to hand and redeployed (currently: yes, the flag persists, so a bounced Demo That Worked
  does *not* get a second "first attack" bonus after redeploying — this is a judgment call worth
  revisiting).
