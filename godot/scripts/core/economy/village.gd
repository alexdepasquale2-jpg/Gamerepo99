## Village economy (sim/economy/village-economy.ts): each dawn villagers produce and process by job,
## households eat and wear things out, and unmet demand is recorded as shortage.
## Simplified: v2 keeps goods on site shelves and in granary/storehouse (civic/town-stores); here each
## town has one store, `goods`.
class_name EconVillage
extends RefCounted

const FOOD_PER_PERSON := 0.25
const WEAR := {"wood": 0.1, "tools": 0.02, "cloth": 0.03, "pots": 0.02, "rope": 0.01, "nails": 0.02}
const COVER_DAYS := 3.0

static func ledger(e: Econ, town_id: String) -> Dictionary:
	if not e.ledgers.has(town_id):
		e.ledgers[town_id] = {"goods": {}, "need": {}, "short": {}}
	return e.ledgers[town_id]

## jobOf: a person's job is derived from the seed, never stored.
static func job_of(e: Econ, person_id: String) -> Dictionary:
	return Data.jobs[e.rng(["job", person_id]).int_range(0, Data.jobs.size())]

## Add goods to a town (player gifts, deliveries).
static func supply(e: Econ, town_id: String, item_id: String, qty: float) -> void:
	if town_id == "" or qty <= 0:
		return
	Econ.addf(ledger(e, town_id).goods, item_id, qty)

## Take up to `want` of an item from a town; returns what was taken.
static func draw(e: Econ, town_id: String, item_id: String, want: float) -> float:
	var g: Dictionary = ledger(e, town_id).goods
	var take = minf(want, float(g.get(item_id, 0.0)))
	if take > 0:
		g[item_id] = float(g[item_id]) - take
	return maxf(take, 0.0)

## 0..1: how short a town is of an item, from days of cover.
static func scarcity(e: Econ, town_id: String, item_id: String) -> float:
	var l = e.ledgers.get(town_id)
	if l == null:
		return 0.0
	var food = Econ.FOOD.has(item_id)
	var need = float(l.need.get("food" if food else item_id, 0.0))
	if need <= 0:
		return 0.0
	var have = 0.0
	if food:
		for i in Econ.FOOD:
			have += float(l.goods.get(i, 0.0))
	else:
		have = float(l.goods.get(item_id, 0.0))
	return clampf((COVER_DAYS - have / need) / COVER_DAYS, 0.0, 1.0)

## What a town is short of, biggest gap first.
static func needs(e: Econ, town_id: String) -> Array:
	var out: Array = []
	var s: Dictionary = e.ledgers.get(town_id, {}).get("short", {})
	for k in s:
		if float(s[k]) > 0:
			out.append({"item": k, "short": float(s[k])})
	out.sort_custom(func(a, b): return a.short > b.short if a.short != b.short else a.item < b.item)
	return out

static func tick(e: Econ) -> void:
	var by = e.residents()
	for town_id in Econ.sorted_keys(by):
		var ids: Array = by[town_id]
		var l = ledger(e, town_id)
		var rolls = {}
		for id in ids:
			rolls[id] = e.rng(["prod", e.day, id])
		# JOBS order puts raw jobs before the processors that use their output.
		for job in Data.jobs:
			for id in ids:
				if EconCompanies.work_job_id(e, id) != job.id:
					continue
				var r: SeedRng = rolls[id]
				var mul = EconPlans.workshop_mul(e, town_id, job.id) * EconPolity.polity_mul(e, town_id, job.id)
				for rec in job.recipes:
					if rec.has("chance") and r.next() >= float(rec.chance):
						continue
					var inputs: Dictionary = rec.get("in", {})
					var ok = true
					for item in inputs:
						if float(l.goods.get(item, 0.0)) < float(inputs[item]) - 1e-9:
							ok = false
					if not ok:
						continue
					for item in inputs:
						l.goods[item] = float(l.goods[item]) - float(inputs[item])
					for item in rec.out:
						Econ.addf(l.goods, item, float(rec.out[item]) * mul)
					EconCompanies.credit(e, id, rec.out, mul)
		# Households eat, then wear things out. Children count half.
		l.need = {}
		l.short = {}
		var kids = 0
		for c in e.kin.children:
			if c.status == "child" and c.townId == town_id:
				kids += 1
		var pop = ids.size() + 0.5 * kids
		var food = pop * FOOD_PER_PERSON
		l.need["food"] = food
		for item in Econ.FOOD:
			food -= draw(e, town_id, item, food)
		if food > 1e-9:
			l.short["food"] = food
		for item in WEAR:
			var want: float = pop * WEAR[item]
			var take = draw(e, town_id, item, want)
			l.need[item] = want
			if want - take > 1e-9:
				l.short[item] = want - take
