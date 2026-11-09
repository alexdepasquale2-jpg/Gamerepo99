## Ambitions and build plans (sim/economy/build-plans.ts). A villager may want a building for their
## trade: they claim a plot, draw goods from the town, and shortfalls post as town need. When the goods
## are in and the labor done, the building stands and boosts its trade in that town.
## Simplified: no zoning or civic tiers (every kind is allowed), plots are cells on a ring with no terrain check.
class_name EconPlans
extends RefCounted

const AMBITION_CHANCE := 0.03
const ACTIVE_PER_TOWN := 3
const RESIDENTS_PER_BUILDING := 10
const STALL_DAYS := 40
const CENTER_RADIUS := 5
const MAX_RING := 11

static func live(p: Dictionary) -> bool:
	return p.stage == "gathering" or p.stage == "building"

static func active(e: Econ, town_id: String = "") -> Array:
	return e.build.plans.filter(func(p): return live(p) and (town_id == "" or p.townId == town_id))

static func claims_in(e: Econ, town_id: String) -> Array:
	return e.build.claims.filter(func(c): return c.townId == town_id)

static func workshop_mul(e: Econ, town_id: String, job_id: String) -> float:
	for c in e.build.claims:
		if c.status == "built" and c.townId == town_id and Data.building_by_id.get(c.kind, {}).get("jobs", []).has(job_id):
			return Data.workshop_mul
	return 1.0

## Goods a town's active builds still lack, summed.
static func build_needs(e: Econ, town_id: String) -> Array:
	var out = {}
	for p in active(e, town_id):
		if p.stage != "gathering":
			continue
		var cost: Dictionary = Data.building_by_id[p.kind].cost
		for item in cost:
			out[item] = int(out.get(item, 0)) + maxi(0, int(cost[item]) - int(p.have.get(item, 0)))
	var list: Array = []
	for k in out:
		if out[k] > 0:
			list.append({"item": k, "qty": out[k]})
	list.sort_custom(func(a, b): return a.qty > b.qty if a.qty != b.qty else a.item < b.item)
	return list

## The player gives the owner a good their build needs: it goes to the site. Returns a line, or "".
static func contribute(e: Econ, person_id: String, item_id: String) -> String:
	for p in active(e):
		if p.ownerId == person_id and p.stage == "gathering" and int(Data.building_by_id[p.kind].cost.get(item_id, 0)) > int(p.have.get(item_id, 0)):
			p.have[item_id] = int(p.have.get(item_id, 0)) + 1
			p.stalledDays = 0
			return "It goes toward their %s." % Data.building_by_id[p.kind].name
	return ""

static func find_plot(e: Econ, town_id: String, w: int, h: int) -> Variant:
	var taken = claims_in(e, town_id)
	var R := CENTER_RADIUS
	for ring in range(R + 1, MAX_RING + 1):
		for dy in range(-ring, ring + 1):
			for dx in range(-ring, ring + 1):
				if maxi(absi(dx), absi(dy)) != ring:
					continue
				if dx <= R and dx + w > -R and dy <= R and dy + h > -R:
					continue
				var hit = false
				for c in taken:
					if dx < c.dx + c.w and dx + w > c.dx and dy < c.dy + c.h and dy + h > c.dy:
						hit = true
						break
				if not hit:
					return Vector2i(dx, dy)
	return null

static func stake(e: Econ, owner_id: String, town_id: String, kind: String) -> void:
	var def: Dictionary = Data.building_by_id.get(kind, {})
	if def.is_empty():
		return
	var plot = find_plot(e, town_id, int(def.w), int(def.h))
	if plot == null:
		return
	var b = e.build
	var plan_id = "plan%d" % b.next
	b.next += 1
	var claim_id = "claim%d" % b.next
	b.next += 1
	b.claims.append({"id": claim_id, "planId": plan_id, "ownerId": owner_id, "townId": town_id, "dx": plot.x, "dy": plot.y, "w": int(def.w), "h": int(def.h), "kind": kind, "status": "claimed"})
	b.plans.append({"id": plan_id, "ownerId": owner_id, "townId": town_id, "kind": kind, "claimId": claim_id, "stage": "gathering", "have": {}, "laborDone": 0, "startDay": e.day, "stalledDays": 0})
	e.say(owner_id, town_id, "I've staked ground for a %s. Timber and stone, if you see any." % def.name)

static func tick(e: Econ) -> void:
	var b = e.build
	var pop = e.residents()
	var plans: Array = b.plans.duplicate()
	plans.sort_custom(func(x, y): return x.id < y.id)
	# 1. Existing plans: draw goods, build, finish or give up.
	for plan in plans:
		if not live(plan):
			continue
		var def: Dictionary = Data.building_by_id[plan.kind]
		var l = EconVillage.ledger(e, plan.townId)
		if plan.stage == "gathering":
			var moved = 0
			for item in def.cost:
				var missing = int(def.cost[item]) - int(plan.have.get(item, 0))
				if missing <= 0:
					continue
				var take = mini(missing, int(floor(float(l.goods.get(item, 0.0)))))
				if take > 0:
					l.goods[item] = float(l.goods[item]) - take
					plan.have[item] = int(plan.have.get(item, 0)) + take
					moved += take
				var still = missing - take
				if still > 0:
					Econ.addf(l.need, item, still)
					Econ.addf(l.short, item, still)
			plan.stalledDays = 0 if moved > 0 else int(plan.stalledDays) + 1
			var full = true
			for item in def.cost:
				if int(plan.have.get(item, 0)) < int(def.cost[item]):
					full = false
			if full:
				plan.stage = "building"
			elif int(plan.stalledDays) >= STALL_DAYS:
				plan.stage = "abandoned"
				for item in plan.have:
					Econ.addf(l.goods, item, float(plan.have[item]))
				b.claims = b.claims.filter(func(c): return c.id != plan.claimId)
				e.say(plan.ownerId, plan.townId, "I've given up on the %s. Nothing came." % def.name)
		else:
			plan.laborDone = int(plan.laborDone) + 1 + int(pop.get(plan.townId, []).size() / 10)
			if int(plan.laborDone) >= int(def.labor):
				plan.stage = "done"
				plan.doneDay = e.day
				for c in b.claims:
					if c.id == plan.claimId:
						c.status = "built"
				e.say(plan.ownerId, plan.townId, "The %s stands. Come and see it." % def.name)
	# 2. New ambitions: a villager without a plan may decide to build for their trade.
	for town_id in Econ.sorted_keys(pop):
		var ids: Array = pop[town_id]
		for id in ids:
			if active(e, town_id).size() >= ACTIVE_PER_TOWN:
				break
			var busy = false
			for p in b.plans:
				if p.ownerId == id and live(p):
					busy = true
			if busy:
				continue
			var r = e.rng(["ambition", e.day, id])
			if r.next() >= AMBITION_CHANCE:
				continue
			var job: String = EconVillage.job_of(e, id).id
			var kinds: Array = Data.buildings.filter(func(k): return k.jobs.has(job))
			var def: Dictionary = kinds[r.int_range(0, kinds.size())] if kinds.size() > 0 else Data.building_by_id["house"]
			var have = b.plans.filter(func(p): return p.townId == town_id and p.kind == def.id and p.stage != "abandoned").size()
			if have >= int(ceil(float(ids.size()) / RESIDENTS_PER_BUILDING)):
				continue
			stake(e, id, town_id, def.id)
