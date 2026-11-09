#!/usr/bin/env bash
# Copy the JSON tables the Godot port reads from the v2 game (game/src/data) into godot/data.
# The TypeScript game stays the source of truth for content; run this after changing data there.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
src="$here/../game/src/data"
for f in people/people.json people/names.json world/towns.json items/items.json \
         systems/methods.json systems/wounds.json systems/player.json \
         items/jobs.json items/buildings.json items/polity.json world/routes.json; do
  mkdir -p "$here/data/$(dirname "$f")"
  cp "$src/$f" "$here/data/$f"
done
echo "synced data into $here/data"
