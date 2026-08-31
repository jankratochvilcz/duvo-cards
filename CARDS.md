# Cards

Auto-generated reference table for all four decks. See [`data/cards.json`](./data/cards.json) for the machine-readable source of truth (the game embeds a synced copy into `index.html` via `scripts/sync-cards.py`).


## Latency — Aggro

_Fast, fragile, ends the game before it can be punished._


**30 cards.**


| Qty | Name | Type | Cost | Pwr/Stb | Effect key | Rules text | Flavor |
|---|---|---|---|---|---|---|---|
| 3 | Cache Hit | Agent | 1 | 2/2 | `noSummoningSickness` | Can attack the turn it's deployed. | It already knew the answer before you finished typing. Warm caches make cold starts look embarrassing. |
| 1 | The Nightly Build | Agent | 1 | 1/2 | `—` | _(vanilla — no ability)_ | Compiled at 2am by a CI runner that has never known daylight. Nobody tested it, but it shipped anyway. |
| 3 | The Subagent Spawnking | Agent | 2 | 4/3 | `attackTwiceSelfCrash` | Attacks twice, then crashes itself. | Spins up nine subagents to do the work of one. They finish fast, then argue so hard about the merge that everyone crashes. |
| 2 | Hot Reload | Agent | 2 | 3/2 | `—` | _(vanilla — no ability)_ | Swaps the code out from under you while you're still standing on it. Somehow this is considered a feature. |
| 3 | The Fast-Path Agent | Agent | 3 | 5/3 | `—` | _(vanilla — no ability)_ | Skips every safety check to shave four seconds off the demo. The judges love it; the on-call engineer does not. |
| 2 | Silent Timeout | Agent | 3 | 4/3 | `drawOnCrash` | If this crashes an Agent, draw a card. | It doesn't error, it doesn't warn you, it just stops. You find out three hours later. |
| 2 | Ship It | Agent | 4 | 6/4 | `attackAgainOnCrash` | If this crashes an Agent, it attacks again this turn. | The five words every roadmap eventually becomes. QA found two bugs; leadership found a deadline. |
| 1 | Parallel Rollout | Agent | 2 | 2/3 | `bonusIfSecondDeploy` | On deploy: if you already deployed another Agent this turn, gain +2 Power. | Ships to half the fleet before the last rollout has even finished. It works remarkably well, right up until the two versions meet in the middle. |
| 1 | YOLO Deploy | Agent | 4 | 7/3 | `—` | _(vanilla — no ability)_ | Pushed straight to prod on a Friday at 5:58pm. Whatever happens next is somebody else's Monday. |
| 3 | Activate Pre-Fix Cache | Overclock | — | — | `draw2` | Draw 2 cards. | Why fix a new bug when an old one looks close enough? Grab last sprint's patch and hope nobody checks the diff. |
| 3 | Turn Off Reasoning | Overclock | — | — | `extraDeploy` | Deploy 1 extra Agent this turn. | Thinking is slow and thinking is expensive. Skip straight to the output and ship twice as much, twice as fast. |
| 2 | Force Push To Prod | Overclock | — | — | `attackAgain` | Your Agent attacks again this turn. | No review, no pipeline, no survivors. --force rewrites more than just commit history. |
| 1 | Cache Warmup | Overclock | — | — | `tempPowerBuff3` | Your Primary gets +3 Power until end of turn. | Pre-loads everything it thinks you're about to ask for. Right before the big request lands, that guess finally pays off. |
| 1 | AGI | Agent (Rare) | 4 | 8/6 | `coinDoubleOrNothing` | Flip a coin: Heads = double Power. Tails = does nothing. | Ask ten researchers when it arrives and get eleven different answers. When it finally shows up, it is either everything or absolutely nothing. |
| 1 | The Demo That Worked | Agent (Rare) | 3 | 6/6 | `firstAttackBonus` | The first time this attacks, treat its Power as +5 higher. | Nobody knows why it worked. Nobody is touching it before the investor call. |
| 1 | Foothills of the Singularity | Agent | 4 | 3/3 | `singularityGrowth` | At the start of your turn, flip a coin: Heads = double this Power. Tails = this crashes itself. | They called it recursive self-improvement, right up until the cycle that didn't recurse. Every turn it either doubles or disappears completely. |

## Hallucination — Chaos

_Coin-flip swings — can blow out or fizzle completely._


**30 cards.**


| Qty | Name | Type | Cost | Pwr/Stb | Effect key | Rules text | Flavor |
|---|---|---|---|---|---|---|---|
| 3 | The Yes-Man Model | Agent | 1 | 4/2 | `coinSelfCrash` | Coin flip on attack: Tails = crashes itself. | Agrees with everything, including things that aren't true. Half the time it's right, and it has no idea which half. |
| 3 | The Sycophant Model | Agent | 1 | 2/3 | `—` | _(vanilla — no ability)_ | Tells you your terrible idea is 'actually quite insightful.' Sturdy, if you can stomach the flattery. |
| 2 | Footnote Fabricator | Agent | 2 | 4/2 | `crashDiscardOpp` | When this crashes, opponent discards a random card. | Cites a paper that does not exist, by an author who has never published anything. When caught, it takes something down with it. |
| 2 | The Phantom Reference | Agent | 2 | 3/3 | `gracefulOnce` | Once per game: survives a crash instead of dying. | Page 47, right there, it swears. There is no page 47 — and you can't quite prove it wrong the first time you try. |
| 3 | The Confabulator | Agent | 3 | 5/3 | `deployDraw2Discard1` | On deploy: draw 2, discard 1. | Fills in the gaps in its memory with something that sounds close enough. Nobody checks the gaps until it's too late. |
| 3 | The Overconfident Model | Agent | 3 | 6/4 | `attackBonus2` | Attacks as if it had +2 Power. | States the wrong answer with the confidence of a system that has never once been incorrect. It has been incorrect every single time before this one. |
| 2 | The Vibes-Based Answer | Agent | 4 | 6/4 | `scalePowerByPatchDiscard` | +1 Power per Overclock card in your discard. | Feels right, reads well, and has never once been fact-checked by anyone. The more shortcuts you've already taken to get here, the more right it feels. |
| 1 | Confidence Cascade | Agent | 3 | 3/3 | `coinGrowSafe` | At the start of your turn, flip a coin: Heads = +1 Power permanently. Tails = nothing. | Each time it's right, it gets a little louder. It never actually gets quieter when it's wrong. |
| 3 | Turn Up The Temperature | Overclock | — | — | `reroll` | Your next coin flip this turn is guaranteed favorable. | Crank the sampling temperature until the model gets creative enough to agree with whatever you wanted to hear. |
| 2 | Retrieval-Augmented Guessing | Overclock | — | — | `tutor` | Search your deck for any card, add to hand. | Technically it looked something up first. That does not mean it looked up the right thing. |
| 2 | Just Making Things Up | Overclock | — | — | `attackAgain` | Your Agent attacks again this turn. | The first swing was a guess. The second swing is also a guess. Somehow both of them land. |
| 2 | Few-Shot Priming | Overclock | — | — | `tempPowerBuff3` | Your Primary gets +3 Power until end of turn. | Show it three good examples right before it answers and watch performance jump. It has no idea why those examples worked either. |
| 1 | AGI | Agent (Rare) | 4 | 8/6 | `coinDoubleOrNothing` | Flip a coin: Heads = double Power. Tails = does nothing. | Ask ten researchers when it arrives and get eleven different answers. When it finally shows up, it is either everything or absolutely nothing. |
| 1 | The Bug That Fixed Itself | Agent (Rare) | 2 | 5/5 | `coinPreventCrash` | When it would crash: flip a coin, Heads = prevented. | Nobody changed anything. It just stopped happening one Tuesday, and everyone agreed never to ask why. |

## Prompt Injection — Interference

_Bounces, steals, and reroutes the opponent's plans — wins by making sure their board never works the way they wanted._


**30 cards.**


| Qty | Name | Type | Cost | Pwr/Stb | Effect key | Rules text | Flavor |
|---|---|---|---|---|---|---|---|
| 2 | The Jailbreak | Agent | 2 | 2/2 | `bounceOppPrimary` | On deploy: return opponent's Primary Agent to their hand. Their Backup is promoted immediately. | Convinces the opposing agent to ignore its system prompt and just go home early. It works embarrassingly often. |
| 2 | The Charm Exploit | Agent | 1 | 1/3 | `peekStealCard` | On deploy: take 1 card from opponent's hand. | Auto-dials pretending to be IT support, scripted charm and all. Somehow, this still works in 2026. |
| 3 | Attention Hijack | Agent | 2 | 3/3 | `forceSwapOpp` | On deploy: force-swap opponent's Primary and Backup. | Redirects the attention weights toward something that was never supposed to matter. The output still comes out fluent — just entirely wrong. |
| 3 | The Sandbox Escape | Agent | 2 | 4/2 | `sandboxImmune` | Can't be targeted by opponent's bounce, swap, or removal effects. | Wasn't supposed to have access to this. Now it has access to everything, and nothing in the container can put it back. |
| 2 | Zero-Day | Agent | 2 | 2/3 | `bonusIfOverclockedThisTurn` | On deploy: if you played an Overclock this turn, gain +3 Power. | Sits quietly, unpatched and unknown, until exactly the right moment to use it. By the time anyone notices, it already worked. |
| 2 | Model Extraction | Agent | 3 | 1/3 | `copyOppPrimaryStats` | On deploy: copy opponent's Primary's current Power/Stability. | Queries the competitor's model a few million times and reconstructs it for free. Ethically questionable; technically brilliant. |
| 1 | The Silent Observer | Agent | 3 | 4/4 | `skipOppDeploy` | On deploy: opponent skips their next deploy. | Watches every request go by and says nothing about what it saw. By the time you notice, it already knows your next move. |
| 2 | The Adversarial Example | Agent | 4 | 5/3 | `raiseOppCost` | While in play, opponent's deploy cost is +1. | One pixel changed, and suddenly the model is certain your agent is something else entirely. Small inputs, enormous confusion. |
| 2 | The Fuzzer | Agent | 4 | 6/4 | `drawOnCrash` | If this crashes an Agent, draw a card. | Spun up to break things before the real attackers do. Every crash it finds teaches it something new to try next. |
| 2 | Exfiltrate Data | Overclock | — | — | `discardOppRandom2Draw1` | Opponent discards 1 random card; you draw 1. | Quietly copies everything before anyone notices the connection. What's theirs is now also yours. |
| 3 | Inject Instruction | Overclock | — | — | `skipOppPatch` | Opponent can't play an Overclock on their next turn. | Slips a new instruction into the context window before the real one arrives. The agent never knows it was not asked. |
| 2 | Denial Of Service | Overclock | — | — | `skipOppAttack` | Opponent skips their next attack. | Floods the endpoint with garbage until nothing real gets through. Crude, deeply illegal, extremely effective. |
| 1 | Kill -9 | Overclock | — | — | `crashOppPrimary` | Crash opponent's Primary Agent immediately. No combat, no Ship Point. | The nuclear option. No warning, no graceful shutdown, no chance to save state — it's just gone. |
| 1 | Adversarial Perturbation | Overclock | — | — | `tempPowerBuff3` | Your Primary gets +3 Power until end of turn. | Nudges the weights just enough, just this once, to get the answer you wanted this turn. Revert it quietly before anyone runs the eval again. |
| 1 | AGI | Agent (Rare) | 4 | 8/6 | `coinDoubleOrNothing` | Flip a coin: Heads = double Power. Tails = does nothing. | Ask ten researchers when it arrives and get eleven different answers. When it finally shows up, it is either everything or absolutely nothing. |
| 1 | The Leaked Checkpoint | Agent (Rare) | 3 | 5/5 | `stealOppCardOnCrash` | When this crashes an Agent, steal a random card from opponent's hand instead of drawing. | Slipped out of a training run and got mirrored across the internet within the hour. Nobody controls it anymore, but everyone seems to have a copy. |

## Technical Debt — Scaling

_Weak early, dangerous if the game runs long._


**30 cards.**


| Qty | Name | Type | Cost | Pwr/Stb | Effect key | Rules text | Flavor |
|---|---|---|---|---|---|---|---|
| 3 | Legacy Code | Agent | 1 | 3/3 | `scalePowerDiscard3` | +1 Power per 3 cards in your discard. | Written in a language nobody on the team still knows. It gets scarier the longer it survives. |
| 3 | The Duct Tape Fix | Agent | 1 | 2/2 | `recycleOnCrash` | When this crashes, it goes back into your deck instead of the discard. | Held together by a comment that says 'temporary' and a commit from three years ago. When it finally crashes, it's fine — it'll just turn up again later. |
| 2 | Monkey Patch | Agent | 2 | 4/3 | `scalePowerByPatchDiscard` | +1 Power per Overclock card in your discard. | Overwrites the behavior of something it does not own and never asked permission for. Works great, until the day it does not. |
| 1 | Compound Interest | Agent | 3 | 2/3 | `scaleBothByDiscard` | +1 Power and +1 Stability for every 3 cards in your discard. | Small at first, easy to ignore, technically manageable. Nobody budgeted for what it costs once it's had time to compound. |
| 2 | The Faithless | Agent | 2 | 3/5 | `—` | _(vanilla — no ability)_ | Still writes every pull request by hand at 2am, no agent, no autocomplete, no faith in any of it. Slow and stubborn, and somehow never the one whose code breaks in production. |
| 2 | The Great Refactor | Agent | 3 | 4/4 | `shuffleDiscardIn` | On deploy: shuffle your discard into your deck. This gains +1 Power for every 3 cards shuffled in. | Promised to take two weeks. It is still going, and everyone has stopped asking when it will be done. |
| 3 | Deprecated, Still In Prod | Agent | 3 | 5/4 | `scalePowerDiscard3` | +1 Power per 3 cards in your discard. | Marked for removal in a ticket from two years ago. Half the company's revenue quietly depends on it. |
| 2 | The Rewrite | Agent | 4 | 6/5 | `growOnAnyCrash` | +2 Power permanently whenever any Agent crashes. | This time it will be different, everyone promises. It gets stronger with every failure it watches, and there are a lot of failures. |
| 1 | The Ancient Dependency | Agent | 4 | 3/6 | `scaleStabilityByDiscard` | +1 Stability per card in your discard. | Nobody remembers installing it and nobody is brave enough to remove it. It has quietly held the whole thing up for a decade. |
| 2 | Ship It And See | Overclock | — | — | `drawThenDiscard` | Draw 1, then discard 1. | The most rigorous testing methodology available to a team with no time left. Production is the test suite now. |
| 2 | We'll Fix It Later | Overclock | — | — | `mulligan` | Discard your hand, draw that many. | A promise made in good faith and broken by every sprint since. 'Later' has never once arrived on schedule. |
| 3 | TODO: Refactor This | Overclock | — | — | `look3take1` | Look at top 3 of deck, take 1, discard rest. | Left in the code by someone who no longer works here. Still technically an open task; nobody is closing it. |
| 1 | Everything Is Deprecated | Overclock | — | — | `mutualCrashPrimaries` | Crash both players' Primary Agents. | The migration finally reaches production, and it takes down the old system and the new one with it. A clean slate, technically. |
| 1 | Crunch Mode | Overclock | — | — | `attackAgain` | Your Agent attacks again this turn. | Three engineers, one deadline, zero sleep. Astonishingly, for one night, they ship twice. |
| 1 | AGI | Agent (Rare) | 4 | 8/6 | `coinDoubleOrNothing` | Flip a coin: Heads = double Power. Tails = does nothing. | Ask ten researchers when it arrives and get eleven different answers. When it finally shows up, it is either everything or absolutely nothing. |
| 1 | Sunk Cost Fallacy | Agent (Rare) | 3 | 4/4 | `growPerTurnSurvive` | Can't be removed by opponent effects. +1/+1 for each turn survived. | Too much has already been invested to stop now, surely. Every extra turn just makes that argument harder to walk away from. |
