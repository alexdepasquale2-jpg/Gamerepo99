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
var jobs: Array = []
var buildings: Array = []
var building_by_id: Dictionary = {}
var workshop_mul: float = 1.5
var polity: Dictionary = {}
var routes: Array = []
var econ_towns: Dictionary = {}
var names: Dictionary = {}

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
	jobs = _read("res://data/items/jobs.json").get("jobs", [])
	var b = _read("res://data/items/buildings.json")
	buildings = b.get("buildings", [])
	workshop_mul = float(b.get("workshopMul", 1.5))
	for row in buildings:
		building_by_id[row.id] = row
	polity = _read("res://data/items/polity.json")
	var known := {}
	for t in towns:
		known[t.id] = true
	routes = _read("res://data/world/routes.json").get("routes", []).filter(func(r): return known.has(r.fromTownId) and known.has(r.toTownId))
	econ_towns = _read("res://data/world/godot-economy.json").get("towns", {})
	names = _read("res://data/people/names.json")

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

func job(id: String) -> Dictionary:
	for j in jobs:
		if j.id == id:
			return j
	return {}

func price(item_id: String) -> float:
	return float(items_by_id.get(item_id, {}).get("price", 0))

func item_name(item_id: String) -> String:
	if item_id == "food":
		return "food"
	return str(items_by_id.get(item_id, {}).get("name", item_id)).to_lower()

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
