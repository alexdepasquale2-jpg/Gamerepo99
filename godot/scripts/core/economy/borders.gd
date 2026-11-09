## Land, borders and claim disputes (sim/economy/borders.ts). A town's reach grows with what it claims and
## builds; where two towns' reach overlaps, border tension builds. Stalled claims invite claim-jumpers,
## and disputes are settled by standing.
class_name EconBorders
extends RefCounted

const WORLD_SCALE := 6.32
const CELL_TILES := 3
const BASE_REACH := 12 * WORLD_SCALE
const PER_BUILT := 2.5 * WORLD_SCALE
const PER_CLAIMED := 1 * WORLD_SCALE
const MAX_REACH := 70 * WORLD_SCALE
const TILES_PER_ROAD_DAY := 40 * WORLD_SCALE
const TENSION_BASE := 1.0
const TENSION_DIVISOR := 5 * WORLD_SCALE
const TENSION_DECAY := 5.0
const TENSION_MAX := 100.0
const STALLED_DAYS := 10
const JUMP_CHANCE := 0.02
const JUMPER_PURSE := 10.0
const SETTLE_DAYS := 8
const INCUMBENCY := 0.25

static func reach(e: Econ, town_id: String) -> float:
	var cs = EconPlans.claims_in(e, town_id)
	var built = cs.filter(func(c): return c.status == "built").size()
	var far = 0.0
	for c in cs:
		far = maxf(far, maxf(absi(int(c.dx)) + int(c.w), absi(int(c.dy)) + int(c.h)) * CELL_TILES)
	return minf(MAX_REACH, maxf(BASE_REACH + PER_BUILT * built + PER_CLAIMED * (cs.size() - built), far))

static func tension(e: Econ, a: String, b: String) -> float:
	return float(e.borders.pairs.get(Econ.pair_key(a, b), {}).get("tension", 0.0))

static func standing(e: Econ, person_id: String) -> float:
	var c = EconCompanies.company_of(e, person_id)
	var h = EconHouseholds.household_of(e, person_id)
	return EconCompanies.purse_of(e, person_id) / 50.0 + (float(c.coin) / 50.0 if c != null else 0.0) + (0.5 * EconHouseholds.security(e, h) if h != null else 0.0)

static func _stake(e: Econ, plan_id: String) -> float:
	for p in e.build.plans:
		if p.id == plan_id:
			var cost: Dictionary = Data.building_by_id[p.kind].cost
			var have = 0.0
			var total = 0.0
			for i in cost:
				have += mini(int(cost[i]), int(p.have.get(i, 0)))
				total += float(cost[i])
			return have / total
	return 0.0

static func tick(e: Econ) -> void:
	var b = e.borders
	var towns = Econ.sorted_keys(e.towns)
	var road_days = {}
	for r in Data.routes:
		if r.get("broken", false):
			continue
		var k = Econ.pair_key(r.fromTownId, r.toTownId)
		road_days[k] = minf(float(road_days.get(k, INF)), float(r.days))
	for i in towns.size():
		for j in range(i + 1, towns.size()):
			var ta: String = towns[i]
			var tb: String = towns[j]
			var oa: Dictionary = e.towns[ta]
			var ob: Dictionary = e.towns[tb]
			var key = ta + "|" + tb
			var dist = minf(Vector2(oa.q - ob.q, oa.r - ob.r).length(), float(road_days.get(key, INF)) * TILES_PER_ROAD_DAY)
			var ra = reach(e, ta)
			var rb = reach(e, tb)
			var overlap = ra + rb - dist
			var was = b.pairs.get(key)
			if overlap <= 0 and was == null:
				continue
			var prev = float(was.tension) if was != null else 0.0
			var t = minf(TENSION_MAX, prev + TENSION_BASE + overlap / TENSION_DIVISOR) if overlap > 0 else maxf(0.0, prev - TENSION_DECAY)
			if t <= 0 and overlap <= 0:
				b.pairs.erase(key)
				continue
			b.pairs[key] = {"a": ta, "b": tb, "dist": dist, "reachA": ra, "reachB": rb, "overlap": overlap, "tension": t, "since": was.since if was != null else e.day}
	# Claim disputes: settle those that are due, then let stalled claims attract jumpers.
	for d in b.disputes:
		if d.status != "open" or e.day - int(d.opened) < SETTLE_DAYS:
			continue
		var claim = null
		for c in e.build.claims:
			if c.id == d.claimId:
				claim = c
		var plan = null
		if claim != null:
			for p in e.build.plans:
				if p.id == claim.planId:
					plan = p
		if claim == null or plan == null or claim.ownerId != d.holderId or not e.people.has(d.challengerId):
			d.status = "dismissed"
			continue
		if standing(e, d.challengerId) > standing(e, d.holderId) + _stake(e, plan.id) + INCUMBENCY:
			claim.ownerId = d.challengerId
			plan.ownerId = d.challengerId
			plan.stalledDays = 0
			d.status = "upheld"
			e.say(d.challengerId, d.townId, "The claim's mine now. %s let it sit too long." % e.first_name(d.holderId))
		else:
			d.status = "dismissed"
	b.disputes = b.disputes.filter(func(d): return d.status == "open" or e.day - int(d.opened) < 60)
	var by = e.residents()
	for town_id in Econ.sorted_keys(by):
		var contested = {}
		for d in b.disputes:
			if d.status == "open":
				contested[d.claimId] = true
		var cands = EconPlans.active(e, town_id).filter(func(p): return p.stage == "gathering" and int(p.stalledDays) >= STALLED_DAYS and not contested.has(p.claimId))
		cands.sort_custom(func(x, y): return x.id < y.id)
		if cands.is_empty() or e.rng(["jump", e.day, town_id]).next() >= JUMP_CHANCE:
			continue
		var target: Dictionary = cands[0]
		var busy = {}
		for p in EconPlans.active(e):
			busy[p.ownerId] = true
		for id in by[town_id]:
			if id != target.ownerId and not busy.has(id) and EconCompanies.purse_of(e, id) >= JUMPER_PURSE:
				b.disputes.append({"id": "dsp%d" % b.next, "townId": town_id, "claimId": target.claimId, "challengerId": id, "holderId": target.ownerId, "opened": e.day, "status": "open"})
				b.next += 1
				e.say(id, town_id, "%s's claim has stood idle. I've a mind to take it." % e.first_name(target.ownerId))
				break
