## Households and lineage (sim/economy/households.ts). Adults pair into households while there are homes;
## founders pick the family name; secure households have children; a warm, secure household can rarely
## have a gifted child; children grow up into villagers. Sex is derived from the seed, not stored.
class_name EconHouseholds
extends RefCounted

const ADULTS_PER_HOME := 3
const PAIR_CHANCE := 0.04
const BIRTH_CHANCE := 0.012
const MAX_KIDS := 4
const SETTLE_DAYS := 10
const BIRTH_SECURITY := 0.4
const WARM_FLAME := 55.0
const GIFTED_SECURITY := 0.7
const GIFTED_CHANCE_WARM := 0.2
const GIFTED_CHANCE_BASE := 0.02
const COME_OF_AGE_DAYS := 80
const PURSE_FOR_SECURITY := 20.0
const GIFTS := ["healer", "maker", "speaker", "seer"]

static func sex_of(e: Econ, id: String) -> String:
	return "m" if e.rng(["sex", id]).next() < 0.5 else "f"

static func household_of(e: Econ, person_id: String) -> Variant:
	for h in e.kin.households:
		if h.adults.has(person_id):
			return h
	return null

## 0..1: food cover in town plus the adults' savings.
static func security(e: Econ, h: Dictionary) -> float:
	var purse = 0.0
	for id in h.adults:
		purse += EconCompanies.purse_of(e, id)
	return 0.7 * (1.0 - EconVillage.scarcity(e, h.townId, "bread")) + 0.3 * minf(1.0, purse / PURSE_FOR_SECURITY)

static func warmth(e: Econ, h: Dictionary) -> float:
	var n = 0.0
	for id in h.adults:
		n += float(e.people.get(id, {}).get("flame", 0))
	return n / 2.0

static func birth_mul(e: Econ, town_id: String) -> float:
	return float(EconPolity.creed_of(e, town_id).get("birthMul", 1.0))

static func _pick(list: Array, taken: Dictionary, start: int) -> String:
	for i in list.size():
		var v: String = list[(start + i) % list.size()]
		if not taken.has(v):
			return v
	return list[start % list.size()]

static func _family(e: Econ, id: String) -> String:
	var parts = str(e.people.get(id, {}).get("name", "")).split(" ", false)
	return " ".join(parts.slice(1)) if parts.size() > 1 else ""

static func tick(e: Econ) -> void:
	var k = e.kin
	_form_couples(e)
	var hs: Array = k.households.duplicate()
	hs.sort_custom(func(a, b): return a.id < b.id)
	for h in hs:
		if h.kids.size() >= MAX_KIDS or e.day - int(h.formed) < SETTLE_DAYS or h.adults.size() < 2:
			continue
		if not h.adults.all(func(a): return e.people.has(a)):
			continue
		var sec = security(e, h)
		if sec < BIRTH_SECURITY:
			continue
		var r = e.rng(["birth", e.day, h.id])
		if r.next() >= BIRTH_CHANCE * birth_mul(e, h.townId):
			continue
		_bear(e, h, sec, r)
	_grow_up(e)

static func _form_couples(e: Econ) -> void:
	var k = e.kin
	var adults_by = {}
	for id in e.people:
		var p: Dictionary = e.people[id]
		if str(p.get("townId", "")) != "" and int(p.get("age", 30)) >= 18:
			if not adults_by.has(p.townId):
				adults_by[p.townId] = []
			adults_by[p.townId].append(id)
	for town_id in Econ.sorted_keys(adults_by):
		var ids: Array = adults_by[town_id]
		var paired = {}
		for h in k.households:
			for a in h.adults:
				paired[a] = true
		var free: Array = ids.filter(func(id): return not paired.has(id))
		free.sort()
		var homes = int(ceil(float(ids.size()) / ADULTS_PER_HOME)) + e.build.claims.filter(func(c): return c.townId == town_id and c.status == "built" and c.kind == "house").size()
		var count = k.households.filter(func(h): return h.townId == town_id).size()
		for m in free.filter(func(id): return sex_of(e, id) == "m"):
			if count >= homes:
				break
			if paired.has(m) or e.rng(["pair", e.day, m]).next() >= PAIR_CHANCE:
				continue
			var f = null
			for id in free:
				if not paired.has(id) and sex_of(e, id) == "f":
					f = id
					break
			if f == null:
				break
			var line = _ancestry(e, m)
			if line == null:
				line = _ancestry(e, f)
			var surname: String
			if line == null:
				var family: Array = Data.names.get("family", ["Ash"])
				surname = ""
				for n in [_family(e, m), _family(e, f)]:
					if n != "" and not k.lineages.has(n):
						surname = n
						break
				if surname == "":
					surname = _pick(family, k.lineages, e.rng(["surname", m]).int_range(0, family.size()))
				k.lineages[surname] = {"surname": surname, "founders": [m, f], "founded": e.day, "generation": 1}
			else:
				surname = line.surname
				k.lineages[surname].generation = maxi(int(k.lineages[surname].generation), int(line.generation) + 1)
			k.households.append({"id": "hh%d" % k.next, "townId": town_id, "adults": [m, f], "surname": surname, "generation": k.lineages[surname].generation, "formed": e.day, "kids": []})
			k.next += 1
			paired[m] = true
			paired[f] = true
			count += 1
			e.say(m, town_id, "%s and I have set up house together." % e.first_name(f))

static func _ancestry(e: Econ, id: String) -> Variant:
	for c in e.kin.children:
		if c.get("personId", "") == id:
			return {"surname": c.surname, "generation": int(e.kin.lineages.get(c.surname, {}).get("generation", 1))}
	return null

static func _bear(e: Econ, h: Dictionary, sec: float, r: SeedRng) -> void:
	var k = e.kin
	var warm = warmth(e, h) >= WARM_FLAME and sec >= GIFTED_SECURITY
	var gifted = r.next() < (GIFTED_CHANCE_WARM if warm else GIFTED_CHANCE_BASE)
	var id = "kid%d" % k.next
	k.next += 1
	r.next()  # the old sex coin-flip, kept so gifts roll the same as v2
	var used = {}
	for c in k.children:
		if c.surname == h.surname:
			used[c.given] = true
	var given_pool: Array = Data.names.get("given", ["Wren"])
	var given = _pick(given_pool, used, e.rng(["given", id]).int_range(0, given_pool.size()))
	var sex = sex_of(e, "born_" + id)
	var child = {"id": id, "householdId": h.id, "townId": h.townId, "given": given, "surname": h.surname, "sex": sex, "parents": [h.adults[0], h.adults[1]], "born": e.day, "status": "child"}
	if gifted:
		child["gift"] = GIFTS[r.int_range(0, GIFTS.size())]
	k.children.append(child)
	h.kids.append(id)
	var voice = h.adults[0] if sex_of(e, h.adults[0]) == "f" else h.adults[1]
	e.say(voice, h.townId, "A little one at ours. %s, we're calling %s." % [given, "her" if sex == "f" else "him"])

static func _grow_up(e: Econ) -> void:
	for c in e.kin.children:
		if c.status != "child" or e.day - int(c.born) < COME_OF_AGE_DAYS:
			continue
		var flame = 0.0
		for p in c.parents:
			flame += float(e.people.get(p, {}).get("flame", 0))
		var pid: String = "born_" + c.id
		var tags = ["born_here"]
		if c.has("gift"):
			tags.append("gifted_" + c.gift)
		e.people[pid] = {"name": "%s %s" % [c.given, c.surname], "townId": c.townId, "age": 18, "flame": int(minf(100, flame / 2.0 + (15 if c.has("gift") else 0))), "tags": tags, "marks": [], "reignited": false, "spoke_day": 0, "folk": true}
		c.status = "adult"
		c.personId = pid
		c.grown = e.day
		e.say(pid, c.townId, "I'm grown now. %s, of the %s line." % [c.given, c.surname])
