# SHIP IT — Game Spec

A quick 2-player card battler themed around AI-engineering culture. Four fixed 30-card decks,
first to 5 Ship Points wins, ~15-20 minutes per match. Built as a single self-contained
`index.html` — no build step, no dependencies beyond a browser.

This doc is the authoritative rules reference. It's written to match the actual implementation
exactly (see `index.html`), so any agent working on balance, new cards, or new mechanics should
treat this as ground truth for *current* behavior — and update it in the same PR as any rule change.

---

## Setup

- Each player picks one of the four decks (see `data/cards.json`).
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
     the defender crashes. `coinPreventCrash` can cancel this even when the numbers say it should happen.
   - **Self-crash coin** (`coinSelfCrash`): after swinging, the attacker flips a coin; Tails crashes
     itself even if it would otherwise survive. `reroll` (Turn Up The Temperature) loads the next
     coin this turn so it comes up the favorable face.
   - Both crash checks are independent — a mutual trade (both Agents crash) is possible and common.
4. A crashed Agent goes to its owner's discard pile.
5. **Breakthrough:** if that combat crash left the opponent with *no Backup* (their last Agent
   just went down), you score **1 Ship Point**. Crashing a Primary while they still have a Backup
   sitting in the other slot does *not* score — that's what extra-attack chaining is for.
6. Unblocked hits (step 2) and breakthroughs (step 5) are the only ways to score. Hard-removal
   Overclocks (`crashOppPrimary`, `mutualCrashPrimaries`) still never score.

### Extra-attack chaining

`extraAttack` is a charge counter, not a boolean. Playing two extra-attack effects (or combining **Force Push To Prod** / **Just Making Things Up** / **Crunch Mode** with **Ship It**'s on-crash extra swing) stacks. After each swing, if your Primary is empty and you have a Backup, the Backup promotes immediately so the next swing can happen. The opponent's Backup still only auto-promotes at end of turn — that window is how aggro actually scores.

`attackAgainOnCrash` (Latency: **Ship It**, **Silent Timeout**, **The Demo That Worked**, **Foothills of the Singularity**) adds one extra-attack charge when that Agent crashes a defender and survives. **The Subagent Spawnking** (`attackTwiceSelfCrash`) always takes a second swing, then crashes itself.

### Removal that skips combat entirely

A few Overclocks crash a target directly, without any Power/Stability comparison:
`crashOppPrimary` (**Kill -9**) and `mutualCrashPrimaries` (**Everything Is Deprecated**, which
crashes *both* players' Primaries). These still respect the immunity rule below.

### Immunity to opponent removal

Cards with `sandboxImmune` (**The Sandbox Escape**, **The Adversarial Example**, **The Fuzzer**,
**The Ancient Dependency**) cannot be bounced, force-swapped, or hard-removed by an *opponent's*
targeted effect.
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
  (e.g. **The Rewrite** growing after a crash).
- `tempPowerBonus` — a *temporary* Power buff that clears automatically at the start of the
  owner's next turn (`tempPowerBuff3`: **Cache Warmup**, **Few-Shot Priming**, **Adversarial Perturbation**).
- Discard-pile scalers, recomputed live from the current discard pile size — not snapshotted:
  - `scalePowerDiscard3`: +1 Power per 2 cards in your discard (**Legacy Code**, **Deprecated,
    Still In Prod**, **Monkey Patch**, **Compound Interest**, **The Duct Tape Fix**,
    **The Great Refactor**).
  - `growOnAnyCrash`: +2 Power whenever any Agent crashes (**The Rewrite**, **Sunk Cost Fallacy**).

## Turn-start triggers

None of the current cards grow at turn start. Combat coins (`coinSelfCrash`, `coinPreventCrash`,
`coinDoubleOrNothing`) and `reroll` resolve during combat, not at the start of the turn.

## On-deploy triggers

Several Agents do something the moment they enter play (as either Primary or Backup, whichever
slot they land in):

| Effect | Card(s) | What happens |
|---|---|---|
| `bounceOppPrimary` | The Jailbreak, Attention Hijack | Opponent's Primary returns to their hand (blocked by immunity). Their Backup, if any, is promoted immediately — bounce is a reroute, not a free empty-board punch unless they had no Backup. |
| `peekStealCard` | The Charm Exploit, Model Extraction, The Leaked Checkpoint | You choose and take 1 card from the opponent's hand |
| `skipOppAttack` | The Silent Observer | Opponent skips their next attack (same flag as the Overclock). |
| `bonusIfSecondDeploy` | Parallel Rollout | +2 Power if you already deployed another Agent this turn |

## Overclock effects (full list)

Overclocks are one-shot: play from hand, resolve immediately, go to discard. One per turn unless
an extra-deploy Overclock is also in play that turn. Full effect-key reference:

`attackAgain` (charges stack), `extraDeploy`, `draw2`, `reroll`, `tempPowerBuff3`, `crashOppPrimary`,
`mutualCrashPrimaries`, `skipOppAttack`, `discardOppRandom2Draw1` (one random discard),
`look3take1`, `tutor`.

See `data/cards.json` for exact card-to-effect mapping and rules text per card.

---

## Deck identities

Each faction has a **small kit** — a handful of verbs players actually have to remember. Prefer
remapping a card onto an existing kit verb over adding a new effect key.

| Deck | Archetype | Color | Kit (what to remember) |
|---|---|---|---|
| Latency | Aggro | Green `#39FF88` | Haste (`noSummoningSickness`), extra deploy, crash-then-attack-again. Rare: Spawnking attacks twice, then self-crashes. |
| Hallucination | Chaos | Red `#FF3355` | Two coins: self-crash on tails, or prevent a crash on heads. Reroll (loaded coin) and tutor for consistency. |
| Prompt Injection | Interference | Blue `#2F80FF` | Bounce, steal from hand, skip their attack, sandbox immunity. |
| Technical Debt | Scaling | Grayscale `#B8C0C8` | Power from discard size, mill (`look3take1`), crash-grow. Ancient Dependency is sandbox-immune so bounce cannot just reset the pile. |

Shared across all four decks: **AGI** (`coinDoubleOrNothing`), extra-attack Overclocks (`attackAgain`),
and a +3 Power Overclock (`tempPowerBuff3`).

| Deck | What it's trying to do |
|---|---|
| Latency | End the game before low Stability is punished. Extra-deploy into a haste body, then chain extra attacks through an empty Primary. |
| Hallucination | High-roll coins. Temperature loads the next flip; tutor finds AGI or a prevent-crash body. |
| Prompt Injection | Win by denial as much as combat — bounce their board, steal their answers, skip their swing. |
| Technical Debt | Weak early. Mill into discard so scalers hit hard; crash-grow cash-in if the game runs long. |

Faction colors are pure CSS custom properties (`--latency`, `--hallucination`, `--injection`,
`--techdebt` in `:root`) — every accent-colored UI element (card borders, badges, the turn
banner, board highlighting) derives from these four variables via `.deck-X` / `.card-X` classes,
so a palette change is a 4-line edit, not a search-and-replace across the file.

---

## Known open design questions (good starting points for other agents)

- AI opponent (`aiTakeTurn`) plays a wider set of Overclocks and will skip a swing that would only crash itself — still a heuristic, not a solver.
- Deck balance is stress-tested with a headless heuristic sim (`scripts/simulate.js`) across all 16 matchup pairs. Re-run after card changes: `node scripts/simulate.js --games 1600 --seed 1`.
- Faction kits should stay small: prefer remapping a card onto an existing faction verb over adding a new effect key.
- Current unique effect keys in `data/cards.json` should stay in the low twenties, not 40+. Vanilla bodies are allowed.
