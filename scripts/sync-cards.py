#!/usr/bin/env python3
"""Validate and normalize the card single source of truth.

`data/cards.json` is the only card catalog. The game loads it at runtime;
`scripts/simulate.js` reads it directly. This script does *not* generate
markdown or patch `index.html`.

  1. Assigns/validates `art` paths from card names (convention-based)
  2. Enforces 30-card decks and safe copy
  3. Rewrites `data/cards.json` in a stable field order

Run from repo root:  python3 scripts/sync-cards.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CARDS_JSON = ROOT / "data" / "cards.json"

DECK_ORDER = ("latency", "hallucination", "injection", "techdebt")
DECK_SIZE = 30

ART_PATH_RE = re.compile(r"^art/[A-Za-z0-9_./-]+\.png$")
# Card copy is rendered into HTML; reject markup so a bad JSON edit can't become XSS.
UNSAFE_COPY_RE = re.compile(r"[<>]")


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


def assign_and_validate(data: dict) -> list[str]:
	errors: list[str] = []
	if (ROOT / "CARDS.md").is_file():
		errors.append("CARDS.md must not exist; the only card catalog is data/cards.json")
	for deck_key in DECK_ORDER:
		cards = data.get(deck_key)
		if not isinstance(cards, list):
			errors.append(f"cards.json missing deck '{deck_key}'")
			continue
		total = 0
		names: set[str] = set()
		for card in cards:
			name = card.get("name") or ""
			if not name:
				errors.append(f"{deck_key}: card missing name")
				continue
			if name in names:
				errors.append(f"{deck_key}: duplicate name {name!r}")
			names.add(name)
			count = card.get("count") or 1
			if not isinstance(count, int) or count < 1:
				errors.append(f"{deck_key}/{name}: invalid count {count!r}")
			else:
				total += count
			path = art_path_for(deck_key, name)
			card["art"] = path
			if not ART_PATH_RE.match(path):
				errors.append(f"unsafe art path: {path} (card: {name})")
			if not (ROOT / path).is_file():
				errors.append(f"missing art: {path} (card: {name})")
			for field in ("name", "text", "flavor"):
				val = card.get(field) or ""
				if UNSAFE_COPY_RE.search(str(val)):
					errors.append(f"HTML-like characters in {field}: {name}")
			if card.get("type") == "process":
				for stat in ("cost", "power", "stability"):
					if stat not in card:
						errors.append(f"{deck_key}/{name}: missing {stat}")
		if total != DECK_SIZE:
			errors.append(f"{deck_key}: deck size {total}, expected {DECK_SIZE}")
	for deck_key in DECK_ORDER:
		path = f"art/factions/{deck_key}.png"
		if not ART_PATH_RE.match(path):
			errors.append(f"unsafe faction art path: {path}")
		if not (ROOT / path).is_file():
			errors.append(f"missing faction key art: {path}")
	return errors


def write_cards_json(data: dict) -> None:
	out: dict = {}
	for deck_key in DECK_ORDER:
		out[deck_key] = []
		for card in data[deck_key]:
			ordered: dict = {
				"name": card["name"],
				"type": card["type"],
			}
			if card["type"] == "process":
				ordered["cost"] = card["cost"]
				ordered["power"] = card["power"]
				ordered["stability"] = card["stability"]
			ordered["effect"] = card.get("effect")
			ordered["text"] = card["text"]
			ordered["flavor"] = card["flavor"]
			ordered["count"] = card["count"]
			ordered["art"] = card["art"]
			out[deck_key].append(ordered)
	CARDS_JSON.write_text(
		json.dumps(out, indent=2, ensure_ascii=False) + "\n",
		encoding="utf-8",
	)


def main() -> int:
	data = json.loads(CARDS_JSON.read_text(encoding="utf-8"))
	errors = assign_and_validate(data)
	if errors:
		print("Card validation failed:", file=sys.stderr)
		for err in errors:
			print(f"  - {err}", file=sys.stderr)
		return 1

	write_cards_json(data)

	total_unique = sum(len(data[k]) for k in DECK_ORDER)
	total_copies = sum(c["count"] for k in DECK_ORDER for c in data[k])
	print(f"Validated {total_unique} unique cards ({total_copies} copies across 4 decks).")
	print(f"  wrote {CARDS_JSON.relative_to(ROOT)}")
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
