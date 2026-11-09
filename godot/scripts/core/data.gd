## Loads the JSON tables copied from game/src/data (see tools/sync-data.sh).
extends Node

var people: Array = []
var reignite_threshold: int = 35
var towns: Array = []
var items: Array = []
var items_by_id: Dictionary = {}
var starting_inventory: Dictionary = {}
var gift_rules: Array = []
var methods: Array = []
var rng_fuzz: float = 0.1
var wounds: Dictionary = {}
var wound_cfg: Dictionary = {}
var player_defaults: Dictionary = {}

func _ready() -> void:
	load_all()

func load_all() -> void:
	var p = _read("res://data/people/people.json")
	people = p.get("people", [])
	reignite_threshold = int(p.get("reigniteThreshold", 35))
	towns = _read("res://data/world/towns.json").get("towns", [])
	var it = _read("res://data/items/items.json")
	items = it.get("items", [])
	for row in items:
		items_by_id[row.id] = row
	starting_inventory = it.get("startingInventory", {})
	gift_rules = it.get("giftAffinity", {}).get("rules", [])
	var m = _read("res://data/systems/methods.json")
	methods = m.get("methods", [])
	rng_fuzz = float(m.get("rngFuzz", 0.1))
	var w = _read("res://data/systems/wounds.json")
	for row in w.get("wounds", []):
		wounds[row.id] = row
	wound_cfg = w
	player_defaults = _read("res://data/systems/player.json").get("defaults", {})

func town(id: String) -> Dictionary:
	for t in towns:
		if t.id == id:
			return t
	return {}

## Towns you can walk between (the city pole is a 1x1 summary, not a place to stand).
func walkable_towns() -> Array:
	return towns.filter(func(t): return int(t.mapWidth) > 1)

func people_in(town_id: String) -> Array:
	return people.filter(func(p): return p.townId == town_id)

func method(id: String) -> Dictionary:
	for m in methods:
		if m.id == id:
			return m
	return {}

func _read(path: String) -> Dictionary:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_error("missing data file " + path)
		return {}
	var parsed = JSON.parse_string(f.get_as_text())
	return parsed if parsed is Dictionary else {}
