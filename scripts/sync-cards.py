#!/usr/bin/env python3
"""Single source of truth sync for Duvo cards.

`data/cards.json` is authoritative. This script:
  1. Assigns/validates `art` paths from card names (convention-based)
  2. Regenerates `CARDS.md`
  3. Rewrites the embedded `DECK_TEMPLATES` block in `index.html`

Run from repo root:  python3 scripts/sync-cards.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CARDS_JSON = ROOT / "data" / "cards.json"
CARDS_MD = ROOT / "CARDS.md"
INDEX_HTML = ROOT / "index.html"

DECK_ORDER = ("latency", "hallucination", "injection", "techdebt")

DECK_META = {
	"latency": {
		"label": "Latency",
		"tag": "Aggro",
		"blurb": "Fast, fragile, ends the game before it can be punished.",
	},
	"hallucination": {
		"label": "Hallucination",
		"tag": "Chaos",
		"blurb": "Coin-flip swings — can blow out or fizzle completely.",
	},
	"injection": {
		"label": "Prompt Injection",
		"tag": "Interference",
		"blurb": "Bounces, steals, and reroutes the opponent's plans — wins by making sure their board never works the way they wanted.",
	},
	"techdebt": {
		"label": "Technical Debt",
		"tag": "Scaling",
		"blurb": "Weak early, dangerous if the game runs long.",
	},
}

TYPE_LABEL = {"process": "Agent", "patch": "Overclock"}


def art_slug(name: str) -> str:
	"""Match generated PNG filenames under art/cards/<deck>/."""
	s = name.replace("We'll", "Well")
	s = s.replace("'", "")
	s = s.replace(":", "")
	s = s.replace(",", "")
	s = s.replace(" ", "_")
	return s


def art_path_for(deck_key: str, name: str) -> str:
	return f"art/cards/{deck_key}/{art_slug(name)}.png"


def js_str(value: object) -> str:
	"""Emit a JS single-quoted string literal (or null / number / bool)."""
	if value is None:
		return "null"
	if isinstance(value, bool):
		return "true" if value else "false"
	if isinstance(value, (int, float)):
		return str(value)
	if not isinstance(value, str):
		raise TypeError(f"Unsupported JS value: {type(value)}")
	escaped = (
		value.replace("\\", "\\\\")
		.replace("'", "\\'")
		.replace("\n", "\\n")
		.replace("\r", "")
	)
	return f"'{escaped}'"


def card_to_js(card: dict) -> str:
	"""One card object as multi-line JS matching the existing index.html style.

	Agents (`process`) include cost/power/stability. Overclocks (`patch`) omit them.
	"""
	head = (
		"    {"
		f"name:{js_str(card['name'])}, "
		f"type:{js_str(card['type'])}, "
	)
	if card["type"] == "process":
		head += (
			f"cost:{js_str(card['cost'])}, "
			f"power:{js_str(card['power'])}, "
			f"stability:{js_str(card['stability'])}, "
		)
	head += f"effect:{js_str(card['effect'])},"
	lines = [
		head,
		f"      text:{js_str(card['text'])},",
		f"      flavor:{js_str(card['flavor'])}, count:{card['count']},",
		f"      art:{js_str(card['art'])}}},",
	]
	return "\n".join(lines)


def emit_deck_templates_js(data: dict) -> str:
	chunks = ["const DECK_TEMPLATES = {"]
	for deck_key in DECK_ORDER:
		chunks.append(f"  {deck_key}: [")
		for card in data[deck_key]:
			chunks.append(card_to_js(card))
		chunks.append("  ],")
	chunks.append("};")
	return "\n".join(chunks)


def type_display(card: dict) -> str:
	base = TYPE_LABEL.get(card["type"], card["type"])
	# Rares are still process/patch; detect by convention used in CARDS.md
	if card.get("rare"):
		return f"{base} (Rare)"
	# Heuristic: AGI and named rares from existing CARDS.md — prefer explicit flag.
	return base


def mark_rares(data: dict) -> None:
	"""Tag known rare cards so CARDS.md can label them (matches prior CARDS.md)."""
	rare_names = {
		"AGI",
		"The Demo That Worked",
		"The Bug That Fixed Itself",
		"The Leaked Checkpoint",
		"Sunk Cost Fallacy",
	}
	for deck in data.values():
		for card in deck:
			card["rare"] = card["name"] in rare_names


def pwr_stb(card: dict) -> str:
	if card["type"] != "process":
		return "—"
	return f"{card.get('power')}/{card.get('stability')}"


def cost_cell(card: dict) -> str:
	if card["type"] != "process":
		return "—"
	return str(card.get("cost"))


def effect_cell(card: dict) -> str:
	return f"`{card['effect']}`" if card["effect"] else "`—`"


def rules_cell(card: dict) -> str:
	if not card["text"] or card["text"] == "—":
		return "_(vanilla — no ability)_"
	return card["text"]


def generate_cards_md(data: dict) -> str:
	lines = [
		"# Cards",
		"",
		"Auto-generated reference table for all four decks. "
		"See [`data/cards.json`](./data/cards.json) for the machine-readable source of truth "
		"(the game embeds a synced copy into `index.html` via `scripts/sync-cards.py`).",
		"",
		"",
	]
	for deck_key in DECK_ORDER:
		meta = DECK_META[deck_key]
		cards = data[deck_key]
		total = sum(c["count"] for c in cards)
		lines.append(f"## {meta['label']} — {meta['tag']}")
		lines.append("")
		lines.append(f"_{meta['blurb']}_")
		lines.append("")
		lines.append("")
		lines.append(f"**{total} cards.**")
		lines.append("")
		lines.append("")
		lines.append(
			"| Qty | Name | Type | Cost | Pwr/Stb | Effect key | Rules text | Flavor |"
		)
		lines.append("|---|---|---|---|---|---|---|---|")
		for card in cards:
			td = type_display(card)
			lines.append(
				"| {qty} | {name} | {td} | {cost} | {ps} | {eff} | {rules} | {flavor} |".format(
					qty=card["count"],
					name=card["name"],
					td=td,
					cost=cost_cell(card),
					ps=pwr_stb(card),
					eff=effect_cell(card),
					rules=rules_cell(card),
					flavor=card["flavor"],
				)
			)
		lines.append("")
	return "\n".join(lines).rstrip() + "\n"


def assign_and_validate_art(data: dict) -> list[str]:
	errors: list[str] = []
	for deck_key in DECK_ORDER:
		for card in data[deck_key]:
			path = art_path_for(deck_key, card["name"])
			card["art"] = path
			full = ROOT / path
			if not full.is_file():
				errors.append(f"missing art: {path} (card: {card['name']})")
	# Faction key art
	for deck_key in DECK_ORDER:
		path = f"art/factions/{deck_key}.png"
		if not (ROOT / path).is_file():
			errors.append(f"missing faction key art: {path}")
	return errors


def patch_index_html(deck_templates_js: str) -> None:
	html = INDEX_HTML.read_text(encoding="utf-8")
	pattern = re.compile(
		r"const DECK_TEMPLATES = \{.*?\n\};",
		re.DOTALL,
	)
	if not pattern.search(html):
		raise RuntimeError("Could not find DECK_TEMPLATES block in index.html")
	html = pattern.sub(deck_templates_js, html, count=1)
	INDEX_HTML.write_text(html, encoding="utf-8")


def write_cards_json(data: dict) -> None:
	"""Write cards.json without the ephemeral `rare` helper flag."""
	out: dict = {}
	for deck_key in DECK_ORDER:
		out[deck_key] = []
		for card in data[deck_key]:
			clean = {k: v for k, v in card.items() if k != "rare"}
			ordered: dict = {
				"name": clean["name"],
				"type": clean["type"],
			}
			if clean["type"] == "process":
				ordered["cost"] = clean["cost"]
				ordered["power"] = clean["power"]
				ordered["stability"] = clean["stability"]
			ordered["effect"] = clean["effect"]
			ordered["text"] = clean["text"]
			ordered["flavor"] = clean["flavor"]
			ordered["count"] = clean["count"]
			ordered["art"] = clean["art"]
			out[deck_key].append(ordered)
	CARDS_JSON.write_text(
		json.dumps(out, indent=2, ensure_ascii=False) + "\n",
		encoding="utf-8",
	)


def main() -> int:
	data = json.loads(CARDS_JSON.read_text(encoding="utf-8"))
	for key in DECK_ORDER:
		if key not in data:
			print(f"error: cards.json missing deck '{key}'", file=sys.stderr)
			return 1

	errors = assign_and_validate_art(data)
	if errors:
		print("Art validation failed:", file=sys.stderr)
		for err in errors:
			print(f"  - {err}", file=sys.stderr)
		return 1

	mark_rares(data)
	write_cards_json(data)
	CARDS_MD.write_text(generate_cards_md(data), encoding="utf-8")
	patch_index_html(emit_deck_templates_js(data))

	total_unique = sum(len(data[k]) for k in DECK_ORDER)
	total_copies = sum(c["count"] for k in DECK_ORDER for c in data[k])
	print(f"Synced {total_unique} unique cards ({total_copies} copies across 4 decks).")
	print(f"  wrote {CARDS_JSON.relative_to(ROOT)}")
	print(f"  wrote {CARDS_MD.relative_to(ROOT)}")
	print(f"  patched DECK_TEMPLATES in {INDEX_HTML.relative_to(ROOT)}")
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
