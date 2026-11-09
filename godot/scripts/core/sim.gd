## The play session: player spark, day clock, people's flames, inventory, saves.
## A GDScript port of the core rules in game/src/sim (methods.ts commitMethod, gifts, rest/relapse).
## The scene never changes state directly: it calls these functions and listens to the signals.
extends Node

signal spark_changed(spark: int, spark_max: int)
signal inventory_changed
## A person said something (reaction, refusal, reignite, dawn).
signal said(person_id: String, line: String, kind: String)
signal reignited(person_id: String)
signal day_started(day: int, lines: Array)
signal town_changed(town_id: String)
signal ended(kind: String, text: String)
signal state_replaced

const SAVE_PATH := "user://save.json"
const PHASE_SECONDS_PER_DAY := 360.0

var world_seed: int = 0
var rng: SeedRng
var day: int = 1
var phase: float = 0.1
var spark: int = 88
var spark_max: int = 100
var coin: int = 0
var town_id: String = "ashford"
var inventory: Dictionary = {}
## person id -> { flame:int, marks:Array, reignited:bool, spoke_day:int }
var people: Dictionary = {}
var acts_today: int = 0
var over: bool = false

func _ready() -> void:
	new_game(20261109)

func new_game(new_seed: int) -> void:
	world_seed = new_seed
	rng = SeedRng.derive(world_seed, ["session"])
	day = 1
	phase = 0.1
	over = false
	acts_today = 0
	spark_max = int(Data.player_defaults.get("sparkMax", 100))
	spark = int(Data.player_defaults.get("sparkStart", 88))
	inventory = {}
	for k in Data.starting_inventory:
		if k == "coin":
			coin = int(Data.starting_inventory[k])
		else:
			inventory[k] = int(Data.starting_inventory[k])
	people = {}
	for p in Data.people:
		people[p.id] = {"flame": int(p.flameStart), "marks": [], "reignited": false, "spoke_day": 0}
	for t in Data.towns:
		if t.get("starting", false):
			town_id = t.id
	state_replaced.emit()

func person_row(id: String) -> Dictionary:
	for p in Data.people:
		if p.id == id:
			return p
	return {}

func flame(id: String) -> int:
	return int(people.get(id, {}).get("flame", 0))

## 0 despair .. 1 alive, for palette lerps.
func warmth_of(id: String) -> float:
	return clampf(float(flame(id)) / float(Data.reignite_threshold), 0.0, 1.0)

func town_warmth(tid: String = town_id) -> float:
	var folk := Data.people_in(tid)
	if folk.is_empty():
		return 0.55
	var sum := 0.0
	for p in folk:
		sum += warmth_of(p.id)
	return sum / folk.size()

func in_ember_zone() -> bool:
	return spark < int(Data.player_defaults.get("emberZoneBelow", 20))

func advance_time(dt: float) -> void:
	if over:
		return
	phase = minf(phase + dt / PHASE_SECONDS_PER_DAY, 1.0)

func phase_name() -> String:
	if phase < 0.2: return "Dawn"
	if phase < 0.45: return "Morning"
	if phase < 0.6: return "Noon"
	if phase < 0.75: return "Afternoon"
	if phase < 0.9: return "Dusk"
	return "Night"

# --- Acts -------------------------------------------------------------------

## Verbs offered for a person, grouped into ring families (at most 6 chips at a level).
func verbs_for_person(id: String) -> Array:
	var out: Array = [{"id": "speak", "label": "Speak"}]
	var methods: Array = []
	for m in Data.methods:
		methods.append({"id": "method:" + m.id, "label": "%s (-%d)" % [m.name, int(m.sparkCost)]})
	out.append({"id": "family:methods", "label": "Reach", "children": methods})
	var gifts: Array = []
	for item_id in inventory:
		if int(inventory[item_id]) > 0 and Data.items_by_id.has(item_id):
			gifts.append({"id": "give:" + item_id, "label": "Give " + Data.items_by_id[item_id].name})
	if not gifts.is_empty():
		out.append({"id": "family:give", "label": "Give", "children": gifts.slice(0, 6)})
	return out

func act(person_id: String, verb_id: String) -> void:
	if over:
		return
	if verb_id == "speak":
		_speak(person_id)
	elif verb_id.begins_with("method:"):
		commit_method(person_id, verb_id.substr(7))
	elif verb_id.begins_with("give:"):
		give(person_id, verb_id.substr(5))
	_check_end()

func _speak(id: String) -> void:
	var row := person_row(id)
	var st: Dictionary = people[id]
	var line: String
	if st.reignited:
		line = row.get("lifeLoop", row.get("reigniteLine", "..."))
	elif int(st.spoke_day) == 0:
		line = row.get("firstLine", "...")
	else:
		line = row.get("woundLine", row.get("firstLine", "..."))
	if int(st.spoke_day) != day:
		st.spoke_day = day
		_add_flame(id, 2)
	said.emit(id, line, "talk")

## commitMethod: flameDelta = floor(basePower * woundMul * (1 ± fuzz)), spark -= sparkCost (x1.5 in the ember zone).
func commit_method(id: String, method_id: String) -> void:
	var m := Data.method(method_id)
	var row := person_row(id)
	if m.is_empty() or row.is_empty():
		return
	var wound_mul := float(m.get("effectiveness", {}).get(row.get("woundId", ""), 1.0))
	var cost := int(floor(float(m.sparkCost) * (1.5 if in_ember_zone() else 1.0)))
	_spend(cost)
	var backfire_below := float(Data.wound_cfg.get("backfireBelow", 0.4))
	if wound_mul < backfire_below and rng.next() < float(Data.wound_cfg.get("backfireChance", 0.35)):
		_add_flame(id, int(Data.wound_cfg.get("backfireFlameDelta", -10)))
		people[id].marks.append(Data.wound_cfg.get("backfireMarkId", "resentment"))
		said.emit(id, "That slid off. Worse: it stuck the wrong way.", "refusal")
		return
	var resist := float(Data.wounds.get(row.get("woundId", ""), {}).get("baseResistance", 0)) + float(row.get("resistanceBonus", 0))
	var raw := float(m.basePower) * wound_mul * (1.0 + (rng.next() * 2.0 - 1.0) * Data.rng_fuzz)
	var delta := int(floor(raw * (1.0 - clampf(resist / 100.0, 0.0, 0.8))))
	acts_today += 1
	var was := bool(people[id].reignited)
	_add_flame(id, delta)
	if not was and not people[id].reignited:
		var how := "That landed deep." if wound_mul >= 1.2 else ("Something moved." if wound_mul >= 0.9 else "It mostly slid off.")
		said.emit(id, how, "reaction")

func give(id: String, item_id: String) -> void:
	if int(inventory.get(item_id, 0)) <= 0:
		return
	var row := person_row(id)
	var item: Dictionary = Data.items_by_id.get(item_id, {})
	inventory[item_id] = int(inventory[item_id]) - 1
	if int(inventory[item_id]) <= 0:
		inventory.erase(item_id)
	inventory_changed.emit()
	var weight := gift_affinity(row, item)
	var was := bool(people[id].reignited)
	_add_flame(id, 4 + 5 * weight)
	if not was and not people[id].reignited:
		var line := "You kept this for me?" if weight >= 2 else ("Thank you." if weight >= 0 else "I don't want that from you.")
		said.emit(id, line, "reaction")

## Sum of giftAffinity rules whose personMatch is a substring of the person's wound or tags.
func gift_affinity(row: Dictionary, item: Dictionary) -> int:
	var hay := str(row.get("woundId", "")) + " " + " ".join(row.get("tags", []))
	var wound: Dictionary = Data.wounds.get(row.get("woundId", ""), {})
	hay += " " + " ".join(wound.get("tags", []))
	var w := 0
	for rule in Data.gift_rules:
		if str(rule.personMatch) == "" or hay.contains(str(rule.personMatch)):
			if item.get("tags", []).has(rule.itemTag):
				w += int(rule.weight)
	return w

## Self-use of an item from the hotbar (eat bread: +spark).
func use_item(item_id: String) -> void:
	var item: Dictionary = Data.items_by_id.get(item_id, {})
	var use = item.get("use", null)
	if use == null or not (use is Dictionary) or not use.has("spark") or int(inventory.get(item_id, 0)) <= 0:
		return
	inventory[item_id] = int(inventory[item_id]) - 1
	if int(inventory[item_id]) <= 0:
		inventory.erase(item_id)
	spark = mini(spark_max, spark + int(use.spark))
	inventory_changed.emit()
	spark_changed.emit(spark, spark_max)

func _spend(n: int) -> void:
	spark -= n
	spark_changed.emit(spark, spark_max)

func _add_flame(id: String, n: int) -> void:
	var st: Dictionary = people[id]
	st.flame = maxi(0, int(st.flame) + n)
	if not st.reignited and int(st.flame) >= Data.reignite_threshold:
		st.reignited = true
		reignited.emit(id)
		said.emit(id, person_row(id).get("reigniteLine", "..."), "reignite")

# --- Rest, travel, endings ---------------------------------------------------

## Sleep at a hearth: dawn of the next day. Relapse rolls for the kindled, drift for the rest.
func rest() -> void:
	if over:
		return
	day += 1
	phase = 0.05
	acts_today = 0
	spark = mini(spark_max, spark + 18)
	var lines: Array = []
	var r := SeedRng.derive(world_seed, ["dawn", day])
	for p in Data.people:
		var st: Dictionary = people[p.id]
		if st.reignited:
			if r.next() < float(p.get("relapseBase", 0.2)) * 0.5:
				st.flame = int(st.flame) - 8
				if int(st.flame) < Data.reignite_threshold:
					st.reignited = false
					if p.townId == town_id:
						lines.append([p.id, p.get("woundLine", "It's gone cold again.")])
		else:
			st.flame = maxi(0, int(st.flame) - 1)
	spark_changed.emit(spark, spark_max)
	day_started.emit(day, lines)
	for l in lines:
		said.emit(l[0], l[1], "dawn")

func travel(to_town: String) -> void:
	if over or to_town == town_id:
		return
	town_id = to_town
	phase = minf(phase + 0.15, 1.0)
	_spend(3)
	town_changed.emit(town_id)
	_check_end()

func _check_end() -> void:
	if over:
		return
	if spark <= int(Data.player_defaults.get("burnoutAt", 0)):
		over = true
		ended.emit("burnout", "Your spark gutters out. The towns go on without you.")
		return
	for p in Data.people:
		if p.townId != "city_reach" and not people[p.id].reignited:
			return
	over = true
	ended.emit("kindled", "Every hearth is lit. You can rest now.")

# --- Saves -------------------------------------------------------------------

func save_game() -> bool:
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		return false
	f.store_string(JSON.stringify({
		"version": 1, "seed": world_seed, "rng": rng.state, "day": day, "phase": phase, "spark": spark,
		"coin": coin, "town": town_id, "inventory": inventory, "people": people, "acts": acts_today,
	}))
	return true

func has_save() -> bool:
	return FileAccess.file_exists(SAVE_PATH)

func load_game() -> bool:
	var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if f == null:
		return false
	var d = JSON.parse_string(f.get_as_text())
	if not (d is Dictionary):
		return false
	world_seed = int(d.seed)
	rng = SeedRng.new(int(d.rng))
	day = int(d.day)
	phase = float(d.phase)
	spark = int(d.spark)
	coin = int(d.coin)
	town_id = str(d.town)
	inventory = {}
	for k in d.inventory:
		inventory[k] = int(d.inventory[k])
	people = {}
	for k in d.people:
		var st: Dictionary = d.people[k]
		people[k] = {"flame": int(st.flame), "marks": st.marks, "reignited": bool(st.reignited), "spoke_day": int(st.spoke_day)}
	acts_today = int(d.get("acts", 0))
	over = false
	state_replaced.emit()
	return true
