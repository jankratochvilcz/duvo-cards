#!/usr/bin/env node
/**
 * Headless SHIP IT simulator.
 *
 * Ports game logic from index.html faithfully, then plays both seats with a
 * heuristic AI that actually uses Overclocks, bounce/steal, and combat risk.
 *
 * Usage:
 *   node scripts/simulate.js [--games N] [--seed S] [--matchup a,b] [--json]
 *   node scripts/simulate.js --games 200 --matchup all
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CARDS = JSON.parse(fs.readFileSync(path.join(ROOT, "data/cards.json"), "utf8"));
const DECKS = ["latency", "hallucination", "injection", "techdebt"];
const WIN_POINTS = 5;

function parseArgs(argv) {
  const out = { games: 200, seed: 1, matchup: "all", json: false, verbose: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--games") out.games = Number(argv[++i]);
    else if (a === "--seed") out.seed = Number(argv[++i]);
    else if (a === "--matchup") out.matchup = argv[++i];
    else if (a === "--json") out.json = true;
    else if (a === "--verbose") out.verbose = true;
  }
  return out;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function expand(list, deckKey) {
  const out = [];
  list.forEach((tmpl, i) => {
    const n = tmpl.count || 1;
    for (let k = 0; k < n; k++) {
      out.push(Object.assign({}, tmpl, {
        uid: deckKey + "-" + i + "-" + k,
        deckKey,
        bonusPower: 0,
        bonusStability: 0,
        turnsSurvived: 0,
        hasAttacked: false,
        usedGraceful: false,
        tempPowerBonus: 0,
      }));
    }
  });
  return out;
}

function newPlayerState(deckKey, rng, extraCard) {
  const deck = shuffle(expand(CARDS[deckKey], deckKey), rng);
  const handSize = extraCard ? 6 : 5;
  const hand = deck.splice(0, handSize);
  return {
    deckKey, deck, hand, discard: [],
    primary: null, backup: null,
    shipPoints: 0, turnsTaken: 0,
    deploysRemaining: 0, patchesRemaining: 0,
    skipNextPatch: false, skipNextDeploy: false, skipNextAttack: false, skipAttackThisTurn: false,
    extraAttack: 0, rerollCharges: 0, attackedThisTurn: false,
    deploysThisTurn: 0, overclockPlayedThisTurn: false,
  };
}

function oppKeyOf(key) { return key === "A" ? "B" : "A"; }

function effPower(inst, ownerState) {
  let p = inst.power + (inst.bonusPower || 0) + (inst.tempPowerBonus || 0);
  if (inst.effect === "scalePowerDiscard3") p += Math.floor(ownerState.discard.length / 2);
  if (inst.effect === "scalePowerByPatchDiscard") p += ownerState.discard.filter(c => c.type === "patch").length;
  if (inst.effect === "growPerTurnSurvive") p += (inst.turnsSurvived || 0);
  if (inst.effect === "scaleBothByDiscard") p += Math.floor(ownerState.discard.length / 3);
  return p;
}
function effStability(inst, ownerState) {
  let s = inst.stability + (inst.bonusStability || 0);
  if (inst.effect === "scaleStabilityByDiscard") s += ownerState.discard.length;
  if (inst.effect === "growPerTurnSurvive") s += (inst.turnsSurvived || 0);
  if (inst.effect === "scaleBothByDiscard") s += Math.floor(ownerState.discard.length / 3);
  return s;
}
function isImmuneToOppRemoval(card) {
  return !!card && (card.effect === "growPerTurnSurvive" || card.effect === "sandboxImmune");
}

function attackPower(inst, ownerState) {
  let p = effPower(inst, ownerState);
  if (inst.effect === "attackBonus2") p += 2;
  if (inst.effect === "firstAttackBonus" && !inst.hasAttacked) p += 5;
  return p;
}

class Game {
  constructor(deckA, deckB, rng, stats) {
    this.rng = rng;
    this.stats = stats;
    this.attacks = { attempted: 0, skipped: 0, unblocked: 0, trades: 0, crashesOnly: 0, diedOnly: 0, fizzled: 0 };
    this.state = {
      players: { A: newPlayerState(deckA, rng, false), B: newPlayerState(deckB, rng, true) },
      active: "A",
      log: [],
      gameOver: false,
      winner: null,
      winReason: null,
    };
    this.turnTrace = [];
  }

  addLog(msg) {
    const log = this.state.log;
    log.push(msg);
    if (log.length > 80) log.shift();
  }

  coinFlip(favorKey) {
    const st = this.state.players[favorKey];
    if (st && st.rerollCharges > 0) {
      st.rerollCharges--;
      return true;
    }
    return this.rng() < 0.5;
  }

  drawCards(st, n) {
    for (let i = 0; i < n && st.deck.length > 0; i++) st.hand.push(st.deck.pop());
  }

  discardRandom(st) {
    if (st.hand.length === 0) return null;
    const i = Math.floor(this.rng() * st.hand.length);
    const c = st.hand.splice(i, 1)[0];
    st.discard.push(c);
    return c;
  }

  canDeploy(ownerKey, card) {
    const st = this.state.players[ownerKey];
    const oppSt = this.state.players[oppKeyOf(ownerKey)];
    const penalty = [oppSt.primary, oppSt.backup].filter(c => c && c.effect === "raiseOppCost").length;
    const cap = Math.min(st.turnsTaken, 4);
    const slotFree = !st.primary || !st.backup;
    return st.deploysRemaining > 0 && slotFree && (card.cost + penalty) <= cap;
  }

  pickWorstHand(st) {
    let worst = null, worstScore = Infinity, idx = -1;
    st.hand.forEach((c, i) => {
      const s = this.staticCardScore(c, st);
      if (s < worstScore) { worstScore = s; worst = c; idx = i; }
    });
    return { card: worst, idx };
  }

  pickBestOf(cards, st) {
    let best = null, bestScore = -Infinity;
    cards.forEach(c => {
      const s = this.staticCardScore(c, st);
      if (s > bestScore) { bestScore = s; best = c; }
    });
    return best;
  }

  staticCardScore(c, st) {
    if (!c) return -99;
    if (c.type === "process") {
      let s = (c.power || 0) + (c.stability || 0) + (c.cost || 0);
      const rareFx = {
        coinDoubleOrNothing: 8, coinPreventCrash: 7, coinSelfCrash: 2,
        attackAgainOnCrash: 6, attackTwiceSelfCrash: 5, bounceOppPrimary: 6,
        peekStealCard: 6, sandboxImmune: 4, skipOppAttack: 5,
        noSummoningSickness: 4, growOnAnyCrash: 6, scalePowerDiscard3: 4,
        bonusIfSecondDeploy: 3, shuffleDiscardIn: 4,
      };
      s += rareFx[c.effect] || 0;
      if (st && st.turnsTaken >= (c.cost || 1)) s += 1;
      return s;
    }
    const patchFx = {
      draw2: 6, extraDeploy: 7, attackAgain: 7, tutor: 8, crashOppPrimary: 9,
      skipOppAttack: 7, discardOppRandom2Draw1: 8, tempPowerBuff3: 5,
      skipOppPatch: 4, look3take1: 5, mulligan: 3, mutualCrashPrimaries: 6,
      mutualRandomDiscard: 3, reroll: 4, drawThenDiscard: 3, reclaimCrashed: 5,
      stabilityBuff2: 4, skipAttackDraw2: 3,
    };
    return patchFx[c.effect] || 3;
  }

  deployCard(ownerKey, uid) {
    const st = this.state.players[ownerKey];
    const idx = st.hand.findIndex(c => c.uid === uid);
    if (idx < 0) return false;
    const card = st.hand[idx];
    if (!this.canDeploy(ownerKey, card)) return false;
    st.hand.splice(idx, 1);
    card.deployedTurn = st.turnsTaken;
    if (!st.primary) st.primary = card; else st.backup = card;
    st.deploysRemaining--;
    this.addLog(ownerKey + " deploy " + card.name);
    if (this.stats) this.stats.played[ownerKey][card.name] = (this.stats.played[ownerKey][card.name] || 0) + 1;
    if (card.effect === "bonusIfSecondDeploy" && st.deploysThisTurn > 0) card.bonusPower += 2;
    if (card.effect === "bonusIfOverclockedThisTurn" && st.overclockPlayedThisTurn) card.bonusPower += 3;
    st.deploysThisTurn = (st.deploysThisTurn || 0) + 1;

    if (card.effect === "deployDraw2Discard1") {
      this.drawCards(st, 2);
      const { idx: di } = this.pickWorstHand(st);
      if (di >= 0) st.discard.push(st.hand.splice(di, 1)[0]);
    }
    if (card.effect === "shuffleDiscardIn") {
      const n = st.discard.length;
      st.deck = shuffle(st.deck.concat(st.discard), this.rng);
      st.discard = [];
      if (n > 0) {
        const grow = Math.floor(n / 2);
        if (grow > 0) card.bonusPower = (card.bonusPower || 0) + grow;
      }
    }
    if (card.effect === "bounceOppPrimary") {
      const oppSt = this.state.players[oppKeyOf(ownerKey)];
      if (isImmuneToOppRemoval(oppSt.primary)) {
        this.addLog("bounce fails (immune)");
      } else if (oppSt.primary) {
        this.addLog("bounce " + oppSt.primary.name);
        if (this.stats) this.stats.bounces[ownerKey]++;
        oppSt.hand.push(oppSt.primary);
        oppSt.primary = null;
        if (oppSt.backup) {
          oppSt.primary = oppSt.backup;
          oppSt.backup = null;
        }
      }
    }
    if (card.effect === "peekStealCard") {
      const oppSt = this.state.players[oppKeyOf(ownerKey)];
      if (oppSt.hand.length > 0) {
        const stolen = this.pickBestOf(oppSt.hand, st);
        const i = oppSt.hand.findIndex(c => c.uid === stolen.uid);
        if (i >= 0) {
          oppSt.hand.splice(i, 1);
          st.hand.push(stolen);
          this.addLog("steal " + stolen.name);
          if (this.stats) this.stats.steals[ownerKey]++;
        }
      }
    }
    if (card.effect === "forceSwapOpp") {
      const oppSt = this.state.players[oppKeyOf(ownerKey)];
      if (isImmuneToOppRemoval(oppSt.primary)) {
        /* fail */
      } else if (oppSt.primary && oppSt.backup) {
        const t = oppSt.primary; oppSt.primary = oppSt.backup; oppSt.backup = t;
      } else if (!oppSt.primary && oppSt.backup) {
        oppSt.primary = oppSt.backup; oppSt.backup = null;
      }
    }
    if (card.effect === "copyOppPrimaryStats") {
      const oppSt = this.state.players[oppKeyOf(ownerKey)];
      if (oppSt.primary) {
        const targetP = effPower(oppSt.primary, oppSt);
        const targetS = effStability(oppSt.primary, oppSt);
        card.bonusPower += (targetP - card.power);
        card.bonusStability += (targetS - card.stability);
      }
    }
    if (card.effect === "skipOppDeploy") {
      this.state.players[oppKeyOf(ownerKey)].skipNextDeploy = true;
    }
    if (card.effect === "skipOppAttack") {
      this.state.players[oppKeyOf(ownerKey)].skipNextAttack = true;
    }
    return true;
  }

  playPatch(ownerKey, uid) {
    const st = this.state.players[ownerKey];
    if (st.patchesRemaining <= 0 || st.attackedThisTurn) return false;
    const idx = st.hand.findIndex(c => c.uid === uid);
    if (idx < 0) return false;
    const card = st.hand[idx];
    st.hand.splice(idx, 1);
    st.discard.push(card);
    st.patchesRemaining--;
    st.overclockPlayedThisTurn = true;
    this.addLog(ownerKey + " patch " + card.name);
    if (this.stats) this.stats.played[ownerKey][card.name] = (this.stats.played[ownerKey][card.name] || 0) + 1;
    this.resolvePatch(ownerKey, card);
    return true;
  }

  resolvePatch(ownerKey, card) {
    const st = this.state.players[ownerKey];
    const oppKey = oppKeyOf(ownerKey);
    const oppSt = this.state.players[oppKey];
    switch (card.effect) {
      case "attackAgain": st.extraAttack = (st.extraAttack || 0) + 1; break;
      case "extraDeploy": st.deploysRemaining += 1; break;
      case "draw2": this.drawCards(st, 2); break;
      case "reroll": st.rerollCharges += 1; break;
      case "tempPowerBuff3":
        if (st.primary) st.primary.tempPowerBonus = (st.primary.tempPowerBonus || 0) + 3;
        break;
      case "crashOppPrimary":
        if (isImmuneToOppRemoval(oppSt.primary)) break;
        if (oppSt.primary) this.crashOwnCard(oppKey, oppSt.primary);
        break;
      case "mutualCrashPrimaries":
        if (st.primary) this.crashOwnCard(ownerKey, st.primary);
        if (isImmuneToOppRemoval(oppSt.primary)) break;
        else if (oppSt.primary) this.crashOwnCard(oppKey, oppSt.primary);
        break;
      case "mutualRandomDiscard":
        this.discardRandom(st);
        this.discardRandom(oppSt);
        break;
      case "skipAttackDraw2":
        st.skipAttackThisTurn = true;
        this.drawCards(st, 2);
        break;
      case "skipOppPatch":
        oppSt.skipNextPatch = true;
        break;
      case "skipOppAttack":
        oppSt.skipNextAttack = true;
        break;
      case "discardOppRandom2Draw1":
        this.discardRandom(oppSt);
        this.drawCards(st, 1);
        break;
      case "drawThenDiscard": {
        this.drawCards(st, 1);
        const { idx: di } = this.pickWorstHand(st);
        if (di >= 0) st.discard.push(st.hand.splice(di, 1)[0]);
        break;
      }
      case "mulligan": {
        const n = st.hand.length;
        st.discard.push(...st.hand);
        st.hand = [];
        this.drawCards(st, n);
        break;
      }
      case "look3take1": {
        const top = [];
        for (let i = 0; i < 3 && st.deck.length > 0; i++) top.push(st.deck.pop());
        if (top.length === 0) break;
        const chosen = this.pickBestOf(top, st);
        top.forEach(c => { if (c.uid === chosen.uid) st.hand.push(c); else st.discard.push(c); });
        break;
      }
      case "tutor": {
        if (st.deck.length === 0) break;
        const byName = {};
        st.deck.forEach(c => { if (!byName[c.name]) byName[c.name] = c; });
        const chosen = this.pickTutorTarget(st, Object.values(byName));
        const i = st.deck.findIndex(c => c.uid === chosen.uid);
        if (i >= 0) {
          const c = st.deck.splice(i, 1)[0];
          st.hand.push(c);
          st.deck = shuffle(st.deck, this.rng);
        }
        break;
      }
      case "stabilityBuff2": {
        const targets = [st.primary, st.backup].filter(Boolean);
        if (targets.length === 0) break;
        const t = targets.reduce((a, b) => effStability(a, st) <= effStability(b, st) ? a : b);
        t.bonusStability += 2;
        break;
      }
      case "reclaimCrashed": {
        const opts = st.discard.filter(c => c.type === "process");
        if (opts.length === 0) break;
        const chosen = this.pickBestOf(opts, st);
        const i = st.discard.findIndex(c => c.uid === chosen.uid);
        if (i >= 0) st.hand.push(st.discard.splice(i, 1)[0]);
        break;
      }
    }
  }

  pickTutorTarget(st, opts) {
    const names = new Set(st.hand.map(c => c.name));
    const prefer = [];
    const push = (pred, w) => {
      opts.forEach(c => { if (pred(c) && !names.has(c.name)) prefer.push({ c, w }); });
    };
    push(c => c.effect === "coinDoubleOrNothing", 10);
    push(c => c.effect === "coinPreventCrash", 9);
    push(c => c.effect === "firstAttackBonus", 9);
    push(c => c.effect === "crashOppPrimary", 8);
    push(c => c.effect === "attackAgainOnCrash", 7);
    push(c => c.effect === "tempPowerBuff3", 6);
    push(c => c.effect === "draw2" || c.effect === "extraDeploy", 5);
    if (prefer.length) {
      prefer.sort((a, b) => b.w - a.w);
      return prefer[0].c;
    }
    return this.pickBestOf(opts, st);
  }

  triggerGlobalCrash() {
    ["A", "B"].forEach(k => {
      const st = this.state.players[k];
      [st.primary, st.backup].forEach(c => {
        if (c && c.effect === "growOnAnyCrash") c.bonusPower += 2;
      });
    });
  }

  crashOwnCard(ownerKey, inst) {
    const st = this.state.players[ownerKey];
    if (st.primary === inst) st.primary = null;
    if (st.backup === inst) st.backup = null;
    if (this.stats) this.stats.crashes[ownerKey][inst.name] = (this.stats.crashes[ownerKey][inst.name] || 0) + 1;
    if (inst.effect === "recycleOnCrash") {
      st.deck = shuffle(st.deck.concat([inst]), this.rng);
    } else {
      st.discard.push(inst);
    }
    if (inst.effect === "crashDiscardOpp") this.discardRandom(this.state.players[oppKeyOf(ownerKey)]);
    this.triggerGlobalCrash();
  }

  checkWin() {
    ["A", "B"].forEach(k => {
      if (this.state.players[k].shipPoints >= WIN_POINTS && !this.state.gameOver) {
        this.state.gameOver = true;
        this.state.winner = k;
        this.state.winReason = "ship";
      }
    });
  }

  doOneAttack(activeKey) {
    if (this.state.gameOver) return;
    const passiveKey = oppKeyOf(activeKey);
    const atkState = this.state.players[activeKey];
    const defState = this.state.players[passiveKey];
    const attacker = atkState.primary;
    if (!attacker) return;

    if (attacker.effect === "coinSelfCrash") {
      const heads = this.coinFlip(activeKey);
      if (!heads) {
        this.crashOwnCard(activeKey, attacker);
        return;
      }
    }

    let power = effPower(attacker, atkState);
    if (attacker.effect === "attackBonus2") power += 2;
    if (attacker.effect === "coinDoubleOrNothing") {
      const heads = this.coinFlip(activeKey);
      if (heads) power *= 2;
      else return;
    }

    const defender = defState.primary;
    if (!defender) {
      atkState.shipPoints++;
      this.addLog(activeKey + " scores " + atkState.shipPoints);
      if (this.stats) {
        this.stats.scores[activeKey].push({
          turn: atkState.turnsTaken,
          attacker: attacker.name,
          points: atkState.shipPoints,
        });
      }
      this.checkWin();
      return;
    }

    if (attacker.effect === "firstAttackBonus" && !attacker.hasAttacked) power += 5;
    attacker.hasAttacked = true;

    const defenderPower = effPower(defender, defState);
    const attackerStability = effStability(attacker, atkState);
    const stab = effStability(defender, defState);
    let crashes = power >= stab;
    let attackerDied = false;

    if (defenderPower >= attackerStability) attackerDied = true;

    if (crashes && defender.effect === "coinPreventCrash") {
      if (this.coinFlip(passiveKey)) crashes = false;
    }
    if (crashes && defender.effect === "gracefulOnce" && !defender.usedGraceful) {
      defender.usedGraceful = true;
      crashes = false;
    }

    if (attackerDied) this.crashOwnCard(activeKey, attacker);
    if (crashes) {
      this.crashOwnCard(passiveKey, defender);
      if (!defState.backup && !this.state.gameOver) {
        atkState.shipPoints++;
        this.addLog(activeKey + " breakthrough " + atkState.shipPoints);
        if (this.stats) {
          this.stats.scores[activeKey].push({
            turn: atkState.turnsTaken,
            attacker: attacker.name,
            points: atkState.shipPoints,
            kind: "breakthrough",
          });
        }
        this.checkWin();
      }
      if (attacker.effect === "drawOnCrash") this.drawCards(atkState, 1);
      if (attacker.effect === "attackAgainOnCrash" && !attackerDied) {
        atkState.extraAttack = (atkState.extraAttack || 0) + 1;
      }
      if (attacker.effect === "stealOppCardOnCrash" && defState.hand.length > 0) {
        const si = Math.floor(this.rng() * defState.hand.length);
        atkState.hand.push(defState.hand.splice(si, 1)[0]);
      }
      this.checkWin();
    }
  }

  canAttack(activeKey) {
    const st = this.state.players[activeKey];
    if (st.skipAttackThisTurn) return false;
    const attacker = st.primary;
    if (!attacker) return false;
    if (attacker.deployedTurn === st.turnsTaken && attacker.effect !== "noSummoningSickness") return false;
    return true;
  }

  performAttack(activeKey) {
    const st = this.state.players[activeKey];
    st.patchesRemaining = 0;
    if (st.skipAttackThisTurn) return;
    const attackerRef = st.primary;
    if (attackerRef && attackerRef.deployedTurn === st.turnsTaken && attackerRef.effect !== "noSummoningSickness") return;
    this.doOneAttack(activeKey);
    if (this.state.gameOver) return;
    if (attackerRef && attackerRef.effect === "attackTwiceSelfCrash" && (st.primary === attackerRef || st.backup === attackerRef)) {
      this.doOneAttack(activeKey);
      if (!this.state.gameOver && (st.primary === attackerRef || st.backup === attackerRef)) {
        this.crashOwnCard(activeKey, attackerRef);
      }
    }
    while (!this.state.gameOver && (st.extraAttack || 0) > 0) {
      st.extraAttack--;
      if (!st.primary && st.backup) {
        st.primary = st.backup;
        st.backup = null;
      }
      this.doOneAttack(activeKey);
    }
  }

  startTurn(key) {
    const st = this.state.players[key];
    st.turnsTaken++;
    st.attackedThisTurn = false;
    if (st.skipNextDeploy) { st.deploysRemaining = 0; st.skipNextDeploy = false; }
    else st.deploysRemaining = 1;
    if (st.skipNextPatch) { st.patchesRemaining = 0; st.skipNextPatch = false; }
    else st.patchesRemaining = 2;
    if (st.skipNextAttack) { st.skipAttackThisTurn = true; st.skipNextAttack = false; }
    else st.skipAttackThisTurn = false;
    st.deploysThisTurn = 0;
    st.overclockPlayedThisTurn = false;

    [st.primary, st.backup].forEach(c => {
      if (c && c.effect === "growPerTurnSurvive") c.turnsSurvived = (c.turnsSurvived || 0) + 1;
    });
    [st.primary, st.backup].forEach(c => { if (c) c.tempPowerBonus = 0; });

    [st.primary, st.backup].forEach(c => {
      if (c && c.effect === "singularityGrowth") {
        if (this.coinFlip(key)) {
          c.bonusPower = c.power + 2 * (c.bonusPower || 0);
        } else {
          this.crashOwnCard(key, c);
        }
      }
    });
    [st.primary, st.backup].forEach(c => {
      if (c && c.effect === "coinGrowSafe") {
        if (this.coinFlip(key)) c.bonusPower = (c.bonusPower || 0) + 1;
      }
    });

    if (st.deck.length === 0) {
      this.state.gameOver = true;
      this.state.winner = oppKeyOf(key);
      this.state.winReason = "deckout";
      return;
    }
    st.hand.push(st.deck.pop());
    this.state.active = key;
  }

  autoPromote(key) {
    const st = this.state.players[key];
    if (!st.primary && st.backup) {
      st.primary = st.backup;
      st.backup = null;
    }
  }

  endTurn(key) {
    this.autoPromote("A");
    this.autoPromote("B");
    this.startTurn(oppKeyOf(key));
  }

  previewCombat(activeKey) {
    const st = this.state.players[activeKey];
    const opp = this.state.players[oppKeyOf(activeKey)];
    const atk = st.primary;
    if (!atk) return { can: false, score: false, crashDef: false, crashAtk: false, unblocked: false };
    const def = opp.primary;
    if (!def) return { can: true, score: true, crashDef: false, crashAtk: false, unblocked: true };
    const power = attackPower(atk, st);
    const stab = effStability(def, opp);
    const crashDef = power >= stab;
    const crashAtk = effPower(def, opp) >= effStability(atk, st);
    const graceful = crashDef && def.effect === "gracefulOnce" && !def.usedGraceful;
    const prevent = crashDef && def.effect === "coinPreventCrash";
    return {
      can: true, score: false,
      crashDef: crashDef && !graceful,
      maybePrevent: prevent,
      crashAtk,
      unblocked: false,
      power, stab,
      spawnking: atk.effect === "attackTwiceSelfCrash",
      shipIt: atk.effect === "attackAgainOnCrash",
      coinSelf: atk.effect === "coinSelfCrash",
      coinAgi: atk.effect === "coinDoubleOrNothing",
    };
  }

  shouldAttack(key) {
    if (!this.canAttack(key)) return false;
    const pv = this.previewCombat(key);
    if (!pv.can) return false;
    const st = this.state.players[key];
    const opp = this.state.players[oppKeyOf(key)];
    if (pv.unblocked) {
      if (pv.coinAgi && st.rerollCharges <= 0) {
        // 50% fizzle, but scoring is the only win path — still swing.
        return true;
      }
      if (pv.coinSelf && st.rerollCharges <= 0) return true;
      return true;
    }
    if (pv.spawnking) {
      // Double swing: crash then possibly score, then self-crash. Good if it crashes
      // a real body or the opponent is close to filling the board again.
      if (pv.crashDef && !pv.crashAtk) return true;
      if (pv.crashDef) return true;
      return false;
    }
    if (pv.crashDef && !pv.crashAtk) return true;
    if (pv.crashDef && !opp.backup) return true; // breakthrough score
    if (pv.crashDef && pv.crashAtk) {
      // Trade. Take it if we have a backup, opponent is ahead, or Ship It might chain
      // (Ship It dies so no chain). Prefer trade if they have no backup (breakthrough)
      // or we have backup.
      if (st.backup) return true;
      if (!opp.backup) return true;
      if (opp.shipPoints >= st.shipPoints) return true;
      if (st.extraAttack) return true;
      return st.turnsTaken >= 6;
    }
    if (!pv.crashDef && pv.crashAtk) return false;
    // Bounce: no one dies. Never swing unless extraAttack already armed and we expect
    // a later hit (won't happen without a crash). Skip.
    return false;
  }

  shouldSwap(key) {
    const st = this.state.players[key];
    if (!st.backup) return false;
    if (st.backup.deployedTurn === st.turnsTaken) return false;
    if (!st.primary) return true;
    const atkP = attackPower(st.primary, st);
    const atkS = effStability(st.primary, st);
    const bakP = attackPower(st.backup, st);
    const bakS = effStability(st.backup, st);
    const opp = this.state.players[oppKeyOf(key)];
    if (!opp.primary) {
      // Want a legal attacker. If primary is sick and backup isn't, swap.
      const primSick = st.primary.deployedTurn === st.turnsTaken && st.primary.effect !== "noSummoningSickness";
      const bakSick = st.backup.deployedTurn === st.turnsTaken && st.backup.effect !== "noSummoningSickness";
      if (primSick && !bakSick) return true;
      return bakP > atkP;
    }
    const defS = effStability(opp.primary, opp);
    const defP = effPower(opp.primary, opp);
    const primCrashes = atkP >= defS;
    const primDies = defP >= atkS;
    const bakCrashes = bakP >= defS;
    const bakDies = defP >= bakS;
    if (bakCrashes && !bakDies && !(primCrashes && !primDies)) return true;
    if (bakCrashes && bakDies && !primCrashes && primDies) return true;
    if (!primCrashes && primDies && bakS > atkS) return true;
    return false;
  }

  swapSlots(key) {
    const st = this.state.players[key];
    if (!st.backup) return;
    if (st.backup.deployedTurn === st.turnsTaken) return;
    if (!st.primary) { st.primary = st.backup; st.backup = null; }
    else { const t = st.primary; st.primary = st.backup; st.backup = t; }
  }

  deployScore(key, card) {
    const st = this.state.players[key];
    const opp = this.state.players[oppKeyOf(key)];
    let s = this.staticCardScore(card, st);
    const emptyPrimary = !st.primary;
    if (emptyPrimary) s += 3;
    if (card.effect === "noSummoningSickness" && emptyPrimary) s += 6;
    if (card.effect === "bounceOppPrimary" && opp.primary && !isImmuneToOppRemoval(opp.primary)) {
      s += 4 + Math.min(6, effPower(opp.primary, opp));
      if (!opp.backup && st.primary && this.canAttackWithExisting(key)) s += 12;
    }
    if (card.effect === "peekStealCard" && opp.hand.length > 0) s += 5;
    if (card.effect === "skipOppAttack") s += 5;
    if (card.effect === "sandboxImmune") s += 3;
    if (card.effect === "copyOppPrimaryStats" && opp.primary) {
      s += effPower(opp.primary, opp) + effStability(opp.primary, opp);
    } else if (card.effect === "copyOppPrimaryStats") s -= 4;
    if (card.effect === "shuffleDiscardIn") {
      // Anti-synergy with discard scalers.
      const scalers = [st.primary, st.backup].filter(c => c && /scale|growOnAnyCrash|scaleBoth/.test(c.effect || ""));
      if (scalers.length || st.discard.length >= 6) s -= 8;
      else if (st.deck.length < 8) s += 6;
    }
    if (card.effect === "singularityGrowth") s -= 2;
    if (card.effect === "coinSelfCrash") s -= 1;
    if (card.effect === "recycleOnCrash") s -= 1;
    if (card.effect === "bonusIfSecondDeploy" && st.deploysThisTurn > 0) s += 4;
    if (card.effect === "bonusIfOverclockedThisTurn" && st.overclockPlayedThisTurn) s += 5;
    if (card.cost <= st.turnsTaken) s += card.cost;
    return s;
  }

  canAttackWithExisting(key) {
    const st = this.state.players[key];
    if (!st.primary) return false;
    if (st.skipAttackThisTurn) return false;
    if (st.primary.deployedTurn === st.turnsTaken && st.primary.effect !== "noSummoningSickness") return false;
    return true;
  }

  patchScore(key, card) {
    const st = this.state.players[key];
    const opp = this.state.players[oppKeyOf(key)];
    const fx = card.effect;
    const pv = this.previewCombat(key);
    switch (fx) {
      case "extraDeploy": {
        const deployable = st.hand.filter(c => c.type === "process" && this.wouldBeDeployable(key, c, 1));
        if (deployable.length === 0) return -5;
        const hasParallel = deployable.some(c => c.effect === "bonusIfSecondDeploy");
        return 6 + deployable.length + (hasParallel ? 4 : 0);
      }
      case "draw2":
        return st.hand.length <= 4 ? 8 : 4;
      case "attackAgain":
        if (!this.canAttack(key) && !st.primary) return -4;
        if (pv.unblocked) return 14;
        if (pv.crashDef && !pv.crashAtk) return 8;
        if (pv.spawnking) return 6;
        return 2;
      case "tempPowerBuff3":
        if (!st.primary) return -6;
        if (!this.canAttack(key)) return 1;
        if (pv.unblocked) return 1;
        if (!pv.crashDef && pv.power + 3 >= pv.stab && !pv.crashAtk) return 12;
        if (!pv.crashDef && pv.power + 3 >= pv.stab) return 7;
        return 1;
      case "crashOppPrimary":
        if (!opp.primary || isImmuneToOppRemoval(opp.primary)) return -8;
        return 6 + effPower(opp.primary, opp) + (this.canAttackWithExisting(key) && !opp.backup ? 10 : 0);
      case "mutualCrashPrimaries": {
        if (!opp.primary) return -8;
        if (isImmuneToOppRemoval(opp.primary) && st.primary) return -10;
        const weWeaker = st.primary && opp.primary && attackPower(st.primary, st) < effStability(opp.primary, opp);
        return weWeaker ? 7 : 1;
      }
      case "skipOppAttack":
        if (opp.shipPoints >= st.shipPoints && opp.primary) return 8;
        if (st.primary && pv.crashAtk && !pv.crashDef) return 7;
        return 3;
      case "skipOppPatch":
        return 3;
      case "discardOppRandom2Draw1":
        return 5 + Math.min(opp.hand.length, 2) * 2;
      case "tutor":
        return 7;
      case "reroll": {
        const coinCards = [st.primary, st.backup, ...st.hand].filter(c => c && /coin|singularity/.test(c.effect || ""));
        return coinCards.length ? 6 : 1;
      }
      case "look3take1":
        return 5;
      case "mulligan": {
        const avg = st.hand.reduce((s, c) => s + this.staticCardScore(c, st), 0) / Math.max(1, st.hand.length);
        return avg < 6 && st.hand.length >= 3 ? 6 : -4;
      }
      case "drawThenDiscard":
        return 2;
      case "mutualRandomDiscard":
        return st.hand.length > opp.hand.length ? 3 : 1;
      case "skipAttackDraw2":
        return this.canAttack(key) && pv.unblocked ? -8 : 4;
      default:
        return 2;
    }
  }

  wouldBeDeployable(key, card, extraDeploys) {
    const st = this.state.players[key];
    const oppSt = this.state.players[oppKeyOf(key)];
    const penalty = [oppSt.primary, oppSt.backup].filter(c => c && c.effect === "raiseOppCost").length;
    const cap = Math.min(st.turnsTaken, 4);
    const slots = (!st.primary ? 1 : 0) + (!st.backup ? 1 : 0);
    const deploys = st.deploysRemaining + extraDeploys;
    return deploys > 0 && slots > 0 && (card.cost + penalty) <= cap;
  }

  takeTurn(key) {
    const st = this.state.players[key];
    if (this.state.gameOver) return;

    if (this.shouldSwap(key)) this.swapSlots(key);

    // Overclock first when it enables a better deploy (extraDeploy, Zero-Day window).
    if (st.patchesRemaining > 0) {
      const patches = st.hand.filter(c => c.type === "patch");
      const extra = patches.find(c => c.effect === "extraDeploy");
      const hasSecondAgent = st.hand.some(c => c.type === "process" && c !== extra);
      const zeroDay = st.hand.some(c => c.effect === "bonusIfOverclockedThisTurn");
      if (extra && (hasSecondAgent || st.deploysRemaining > 0) && this.patchScore(key, extra) > 0) {
        this.playPatch(key, extra.uid);
      } else if (zeroDay && patches.length) {
        const best = patches.slice().sort((a, b) => this.patchScore(key, b) - this.patchScore(key, a))[0];
        if (this.patchScore(key, best) >= 3) this.playPatch(key, best.uid);
      }
    }

    // Deploys: greedy best legal agent, possibly twice with extraDeploy.
    while (st.deploysRemaining > 0 && !this.state.gameOver) {
      const opts = st.hand.filter(c => c.type === "process" && this.canDeploy(key, c));
      if (!opts.length) break;
      opts.sort((a, b) => this.deployScore(key, b) - this.deployScore(key, a));
      if (this.deployScore(key, opts[0]) < 0 && st.primary) break;
      this.deployCard(key, opts[0].uid);
    }

    // Remaining overclocks: dump setup before the attack (up to 2 per turn).
    while (st.patchesRemaining > 0 && !this.state.gameOver) {
      const opts = st.hand.filter(c => c.type === "patch");
      if (!opts.length) break;
      opts.sort((a, b) => this.patchScore(key, b) - this.patchScore(key, a));
      if (this.patchScore(key, opts[0]) < 3) break;
      this.playPatch(key, opts[0].uid);
      while (st.deploysRemaining > 0 && !this.state.gameOver) {
        const dOpts = st.hand.filter(c => c.type === "process" && this.canDeploy(key, c));
        if (!dOpts.length) break;
        dOpts.sort((a, b) => this.deployScore(key, b) - this.deployScore(key, a));
        this.deployCard(key, dOpts[0].uid);
      }
    }

    if (this.shouldSwap(key)) this.swapSlots(key);

    if (!this.state.gameOver && this.shouldAttack(key)) {
      st.attackedThisTurn = true;
      this.attacks.attempted++;
      const pv = this.previewCombat(key);
      if (pv.unblocked) this.attacks.unblocked++;
      else if (pv.crashDef && pv.crashAtk) this.attacks.trades++;
      else if (pv.crashDef) this.attacks.crashesOnly++;
      else if (pv.crashAtk) this.attacks.diedOnly++;
      else this.attacks.fizzled++;
      this.performAttack(key);
    } else if (this.canAttack(key)) {
      this.attacks.skipped++;
    }

    if (!this.state.gameOver) this.endTurn(key);
  }

  run() {
    this.startTurn("A");
    let guard = 0;
    while (!this.state.gameOver && guard < 80) {
      guard++;
      const key = this.state.active;
      const beforeTurns = this.state.players.A.turnsTaken + this.state.players.B.turnsTaken;
      this.takeTurn(key);
      if (this.state.players.A.turnsTaken + this.state.players.B.turnsTaken === beforeTurns && !this.state.gameOver) {
        // Safety: turn failed to advance.
        this.endTurn(key);
      }
    }
    if (!this.state.gameOver) {
      this.state.gameOver = true;
      const a = this.state.players.A.shipPoints;
      const b = this.state.players.B.shipPoints;
      this.state.winner = a >= b ? "A" : "B";
      this.state.winReason = "timeout";
    }
    return this.state;
  }
}

function emptySideStats() {
  return { played: {}, crashes: {} };
}

function playOne(deckA, deckB, seed) {
  const rng = mulberry32(seed);
  const stats = {
    played: { A: {}, B: {} },
    crashes: { A: {}, B: {} },
    scores: { A: [], B: [] },
    bounces: { A: 0, B: 0 },
    steals: { A: 0, B: 0 },
  };
  const g = new Game(deckA, deckB, rng, stats);
  const state = g.run();
  return {
    winner: state.winner,
    winReason: state.winReason,
    turnsA: state.players.A.turnsTaken,
    turnsB: state.players.B.turnsTaken,
    pointsA: state.players.A.shipPoints,
    pointsB: state.players.B.shipPoints,
    deckA, deckB,
    stats,
    first: "A",
    attacks: g.attacks,
  };
}

function mergeCount(dst, src) {
  Object.entries(src).forEach(([k, v]) => { dst[k] = (dst[k] || 0) + v; });
}

function summarize(results) {
  const faction = {};
  DECKS.forEach(d => {
    faction[d] = { games: 0, wins: 0, firstGames: 0, firstWins: 0, secondGames: 0, secondWins: 0, pointsFor: 0, pointsAgainst: 0, turns: 0, shipWins: 0, deckoutWins: 0, timeoutWins: 0 };
  });
  const matchup = {};
  const playedWhenWon = {};
  const playedWhenLost = {};
  const scoreCards = {};
  let totalTurns = 0;
  const turnBuckets = { "1-6": 0, "7-10": 0, "11-16": 0, "17+": 0 };
  const reasons = { ship: 0, deckout: 0, timeout: 0 };
  const attacks = { attempted: 0, skipped: 0, unblocked: 0, trades: 0, crashesOnly: 0, diedOnly: 0, fizzled: 0 };

  results.forEach(r => {
    const turns = r.turnsA + r.turnsB;
    totalTurns += turns;
    if (turns <= 6) turnBuckets["1-6"]++;
    else if (turns <= 10) turnBuckets["7-10"]++;
    else if (turns <= 16) turnBuckets["11-16"]++;
    else turnBuckets["17+"]++;
    reasons[r.winReason] = (reasons[r.winReason] || 0) + 1;
    Object.keys(attacks).forEach(k => { attacks[k] += r.attacks[k] || 0; });

    const pair = r.deckA + "_vs_" + r.deckB;
    if (!matchup[pair]) matchup[pair] = { games: 0, aWins: 0, bWins: 0, avgTurns: 0, avgPA: 0, avgPB: 0 };
    const m = matchup[pair];
    m.games++;
    if (r.winner === "A") m.aWins++; else m.bWins++;
    m.avgTurns += turns;
    m.avgPA += r.pointsA;
    m.avgPB += r.pointsB;

    [["A", r.deckA, r.pointsA, r.pointsB, r.turnsA, true], ["B", r.deckB, r.pointsB, r.pointsA, r.turnsB, false]].forEach(([side, deck, pf, pa, t, first]) => {
      const f = faction[deck];
      f.games++;
      f.pointsFor += pf;
      f.pointsAgainst += pa;
      f.turns += t;
      if (first) f.firstGames++; else f.secondGames++;
      if (r.winner === side) {
        f.wins++;
        if (first) f.firstWins++; else f.secondWins++;
        if (r.winReason === "ship") f.shipWins++;
        else if (r.winReason === "deckout") f.deckoutWins++;
        else f.timeoutWins++;
        if (!playedWhenWon[deck]) playedWhenWon[deck] = {};
        mergeCount(playedWhenWon[deck], r.stats.played[side]);
      } else {
        if (!playedWhenLost[deck]) playedWhenLost[deck] = {};
        mergeCount(playedWhenLost[deck], r.stats.played[side]);
      }
    });

    r.stats.scores.A.forEach(s => {
      if (!scoreCards[r.deckA]) scoreCards[r.deckA] = {};
      scoreCards[r.deckA][s.attacker] = (scoreCards[r.deckA][s.attacker] || 0) + 1;
    });
    r.stats.scores.B.forEach(s => {
      if (!scoreCards[r.deckB]) scoreCards[r.deckB] = {};
      scoreCards[r.deckB][s.attacker] = (scoreCards[r.deckB][s.attacker] || 0) + 1;
    });
  });

  Object.values(matchup).forEach(m => {
    m.avgTurns = +(m.avgTurns / m.games).toFixed(2);
    m.avgPA = +(m.avgPA / m.games).toFixed(2);
    m.avgPB = +(m.avgPB / m.games).toFixed(2);
    m.aWinPct = +((100 * m.aWins) / m.games).toFixed(1);
  });

  const factionSummary = {};
  DECKS.forEach(d => {
    const f = faction[d];
    factionSummary[d] = {
      games: f.games,
      winPct: f.games ? +((100 * f.wins) / f.games).toFixed(1) : 0,
      firstWinPct: f.firstGames ? +((100 * f.firstWins) / f.firstGames).toFixed(1) : 0,
      secondWinPct: f.secondGames ? +((100 * f.secondWins) / f.secondGames).toFixed(1) : 0,
      avgPointsFor: f.games ? +(f.pointsFor / f.games).toFixed(2) : 0,
      avgPointsAgainst: f.games ? +(f.pointsAgainst / f.games).toFixed(2) : 0,
      avgTurns: f.games ? +(f.turns / f.games).toFixed(2) : 0,
      shipWins: f.shipWins,
      deckoutWins: f.deckoutWins,
      timeoutWins: f.timeoutWins,
    };
  });

  function topN(map, n) {
    return Object.entries(map || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => k + ":" + v);
  }

  const cardSignal = {};
  DECKS.forEach(d => {
    const won = playedWhenWon[d] || {};
    const lost = playedWhenLost[d] || {};
    const names = new Set([...Object.keys(won), ...Object.keys(lost)]);
    const rows = [];
    names.forEach(name => {
      const w = won[name] || 0;
      const l = lost[name] || 0;
      const t = w + l;
      if (t < 20) return;
      rows.push({ name, played: t, winRateWhenPlayed: +((100 * w) / t).toFixed(1), won: w, lost: l });
    });
    rows.sort((a, b) => b.winRateWhenPlayed - a.winRateWhenPlayed);
    cardSignal[d] = {
      highWinWhenPlayed: rows.slice(0, 8),
      lowWinWhenPlayed: rows.slice(-8).reverse(),
      topScorers: topN(scoreCards[d], 8),
    };
  });

  return {
    games: results.length,
    avgTurns: results.length ? +(totalTurns / results.length).toFixed(2) : 0,
    turnBuckets,
    reasons,
    attacks,
    factionSummary,
    matchup,
    cardSignal,
  };
}

function matchupList(spec) {
  if (spec === "all") {
    const list = [];
    DECKS.forEach(a => DECKS.forEach(b => list.push([a, b])));
    return list;
  }
  const [a, b] = spec.split(",");
  if (!DECKS.includes(a) || !DECKS.includes(b)) throw new Error("bad matchup " + spec);
  return [[a, b]];
}

function formatReport(sum) {
  const lines = [];
  lines.push("GAMES " + sum.games + "  avgTurns " + sum.avgTurns);
  lines.push("reasons " + JSON.stringify(sum.reasons) + "  buckets " + JSON.stringify(sum.turnBuckets));
  lines.push("attacks " + JSON.stringify(sum.attacks));
  lines.push("");
  lines.push("FACTION WIN%  (first / second)");
  DECKS.forEach(d => {
    const f = sum.factionSummary[d];
    lines.push(
      "  " + d.padEnd(14) +
      String(f.winPct).padStart(5) + "%   first " + String(f.firstWinPct).padStart(5) +
      "%  second " + String(f.secondWinPct).padStart(5) +
      "%  pts " + f.avgPointsFor + "/" + f.avgPointsAgainst +
      "  turns " + f.avgTurns +
      "  ship/deckout/timeout " + f.shipWins + "/" + f.deckoutWins + "/" + f.timeoutWins
    );
  });
  lines.push("");
  lines.push("MATCHUPS (A listed first; A win%)");
  Object.entries(sum.matchup).sort().forEach(([k, m]) => {
    lines.push("  " + k.padEnd(32) + String(m.aWinPct).padStart(5) + "%  n=" + m.games + "  turns " + m.avgTurns + "  pts " + m.avgPA + "-" + m.avgPB);
  });
  lines.push("");
  DECKS.forEach(d => {
    const cs = sum.cardSignal[d];
    lines.push("CARDS " + d);
    lines.push("  high WR when played: " + cs.highWinWhenPlayed.map(r => r.name + " " + r.winRateWhenPlayed + "% (n=" + r.played + ")").join(" | "));
    lines.push("  low  WR when played: " + cs.lowWinWhenPlayed.map(r => r.name + " " + r.winRateWhenPlayed + "% (n=" + r.played + ")").join(" | "));
    lines.push("  scorers: " + cs.topScorers.join(", "));
  });
  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  const pairs = matchupList(args.matchup);
  const perPair = Math.max(1, Math.round(args.games / pairs.length));
  const results = [];
  let seed = args.seed;
  pairs.forEach(([a, b]) => {
    for (let i = 0; i < perPair; i++) {
      results.push(playOne(a, b, seed++));
    }
  });
  const sum = summarize(results);
  if (args.json) {
    process.stdout.write(JSON.stringify(sum, null, 2) + "\n");
  } else {
    process.stdout.write(formatReport(sum) + "\n");
  }
}

if (require.main === module) main();

module.exports = { playOne, summarize, formatReport, DECKS, Game };
