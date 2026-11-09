## The economy's state and dawn order. A port of game/src/sim/economy (see godot/README.md for what is
## simplified). Every module is a set of static functions over one Econ, so the state stays plain
## Dictionaries and Arrays (saved as JSON). Deterministic: every roll is SeedRng.derive(seed, labels),
## with the same labels as the TypeScript.
class_name Econ
extends RefCounted

const FOOD := ["bread", "fish", "berries", "grain"]
const PLAYER := "player"

var wseed: int = 0
var day: int = 1
## person id -> { name, townId, age, flame, tags } (shared with Sim.people).
var people: Dictionary = {}
## town id -> { q, r, despair }
var towns: Dictionary = {}

var ledgers: Dictionary = {}        # village-economy: town -> { goods, need, short }
var build = {"plans": [], "claims": [], "next": 1}
var companies = {"list": [], "next": 1, "purse": {}}
var kin = {"households": [], "children": [], "lineages": {}, "next": 1}
var borders = {"pairs": {}, "disputes": [], "next": 1}
var polity = {"relations": {}, "wars": [], "knowledge": {}, "tech": {}, "faiths": {}, "next": 1, "carts": {}, "grudged": []}
var logistics = {"requests": [], "carts": [], "next": 1, "lost": 0, "delivered": 0, "flow": {}, "wrecks": []}
## What happened at this dawn, for people to say: [{ person, town, line }]. Cleared each dawn.
var news: Array = []

func rng(parts: Array) -> SeedRng:
	return SeedRng.derive(wseed, parts)

## Run one dawn in v2's order (scenario-advance advanceToDawn, economy part).
func dawn(new_day: int) -> void:
	day = new_day
	news = []
	EconVillage.tick(self)
	EconPlans.tick(self)
	EconCompanies.tick(self)
	EconHouseholds.tick(self)
	EconBorders.tick(self)
	EconPolity.tick(self)
	EconLogistics.tick(self)

func say(person_id, town_id: String, line: String) -> void:
	news.append({"person": person_id if person_id != null else "", "town": town_id, "line": line})

## Residents by town, ids sorted (towns sorted too).
func residents() -> Dictionary:
	var by = {}
	for id in people:
		var t = people[id].get("townId", "")
		if t == "" or t == null:
			continue
		if not by.has(t):
			by[t] = []
		by[t].append(id)
	for t in by:
		by[t].sort()
	return by

func first_name(id: String) -> String:
	if id == PLAYER:
		return "you"
	var n = str(people.get(id, {}).get("name", id))
	var parts = n.strip_edges().split(" ", false)
	if parts.size() > 2 and parts[0] == "Old":
		return parts[0] + " " + parts[1]
	return parts[0] if parts.size() > 0 else n

static func pair_key(a: String, b: String) -> String:
	return a + "|" + b if a < b else b + "|" + a

static func sorted_keys(d: Dictionary) -> Array:
	var k = d.keys()
	k.sort()
	return k

static func addf(d: Dictionary, key, n: float) -> void:
	d[key] = float(d.get(key, 0.0)) + n

func to_dict() -> Dictionary:
	return {"ledgers": ledgers, "build": build, "companies": companies, "kin": kin, "borders": borders, "polity": polity, "logistics": logistics}

func from_dict(d: Dictionary) -> void:
	ledgers = d.get("ledgers", {})
	build = d.get("build", build)
	companies = d.get("companies", companies)
	kin = d.get("kin", kin)
	borders = d.get("borders", borders)
	polity = d.get("polity", polity)
	logistics = d.get("logistics", logistics)
