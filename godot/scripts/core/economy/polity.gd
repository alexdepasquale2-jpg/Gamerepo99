## Light polity layer (sim/economy/polity.ts): faith from chapels, technology from workshops (forked paths),
## diplomacy (trust, feud, treaties, learning), and war (raids, truce, lost craft).
## Not ported: doctrine friction (doctrines are not in the Godot port yet).
class_name EconPolity
extends RefCounted

static func tuning() -> Dictionary:
	return Data.polity.get("tuning", {})

static func T(key: String) -> float:
	return float(tuning().get(key, 0.0))

static func techs() -> Array:
	return Data.polity.get("techs", [])

static func creeds() -> Array:
	return Data.polity.get("creeds", [])

static func tech(id: String) -> Dictionary:
	for t in techs():
		if t.id == id:
			return t
	return {}

static func at_war(e: Econ, a: String, b: String) -> bool:
	var k = Econ.pair_key(a, b)
	return e.polity.wars.any(func(w): return w.status == "active" and Econ.pair_key(w.aggressor, w.defender) == k)

static func treaty_of(e: Econ, a: String, b: String) -> String:
	return str(e.polity.relations.get(Econ.pair_key(a, b), {}).get("treaty", "none"))

static func techs_of(e: Econ, town_id: String) -> Array:
	return e.polity.tech.get(town_id, [])

static func creed_of(e: Econ, town_id: String) -> Dictionary:
	var f = e.polity.faiths.get(town_id)
	if f == null:
		return {}
	for c in creeds():
		if c.id == f.creed:
			return c
	return {}

static func polity_mul(e: Econ, town_id: String, job_id: String) -> float:
	var m = 1.0
	for id in techs_of(e, town_id):
		m *= float(tech(id).get("mul", {}).get(job_id, 1.0))
	m *= float(creed_of(e, town_id).get("jobMul", {}).get(job_id, 1.0))
	return m

static func safe_roads(e: Econ, a: String, b: String) -> bool:
	return bool(creed_of(e, a).get("safeRoads", false)) or bool(creed_of(e, b).get("safeRoads", false))

static func strength(e: Econ, town_id: String) -> float:
	var pop = 0
	for id in e.people:
		if e.people[id].get("townId", "") == town_id:
			pop += 1
	var built = e.build.claims.filter(func(c): return c.townId == town_id and c.status == "built").size()
	var cos = e.companies.list.filter(func(c): return c.townId == town_id).size()
	return pop + 3 * built + 2 * cos + 2 * techs_of(e, town_id).size()

static func tech_open(known: Array, t: Dictionary) -> bool:
	if known.has(t.id):
		return false
	for x in t.get("needs", {}).get("techs", []):
		if not known.has(x):
			return false
	if t.has("fork"):
		for k in known:
			if tech(k).get("fork", "") == t.fork:
				return false
	return true

static func tech_cost(known: Array, t: Dictionary) -> float:
	return float(t.cost) * (1.0 + T("costRisePerTech") * known.size())

static func _could_spare(e: Econ, town_id: String, item_id: String) -> bool:
	var l = e.ledgers.get(town_id)
	if l == null:
		return false
	var have = 0.0
	if item_id == "food":
		for i in tuning().get("foodPool", Econ.FOOD):
			have += float(l.goods.get(i, 0.0))
	else:
		have = float(l.goods.get(item_id, 0.0))
	return have - float(l.need.get(item_id, 0.0)) * T("spareDays") >= T("spareFlat")

static func _grievances(e: Econ, links: Array) -> Dictionary:
	var p = e.polity
	var add = {}
	var bump = func(a: String, b: String, n: float):
		if a != b:
			Econ.addf(add, Econ.pair_key(a, b), n)
	var reqs = {}
	for r in e.logistics.requests:
		reqs[r.id] = r
	var grudged = {}
	for g in p.get("grudged", []):
		grudged[g] = true
	for r in e.logistics.requests:
		if r.status != "lapsed" or grudged.has(r.id):
			continue
		grudged[r.id] = true
		for key in links:
			var ab: PackedStringArray = key.split("|")
			var other = ab[1] if ab[0] == r.townId else (ab[0] if ab[1] == r.townId else "")
			if other != "" and _could_spare(e, other, r.itemId):
				bump.call(r.townId, other, T("unservedFeud"))
	var keep: Array = grudged.keys().filter(func(id): return reqs.has(id))
	keep.sort()
	p.grudged = keep
	# A cart that left the road without filling its request was lost: both ends blame each other.
	var now = {}
	for c in e.logistics.carts:
		now[c.id] = c.requestId + "#" + Econ.pair_key(c.fromTownId, c.toTownId)
	for id in p.get("carts", {}):
		if now.has(id):
			continue
		var parts: PackedStringArray = str(p.carts[id]).split("#")
		var req = reqs.get(parts[0])
		if req == null or req.status == "filled":
			continue
		var ab: PackedStringArray = parts[1].split("|")
		bump.call(ab[0], ab[1], T("lostCartFeud"))
	p.carts = now
	return add

static func tick(e: Econ) -> void:
	var towns = Econ.sorted_keys(e.towns)
	if towns.size() < 2:
		return
	var p = e.polity
	var flow: Dictionary = e.logistics.get("flow", {})
	var claims: Array = e.build.claims
	# 1. Faith: a finished chapel founds the town's creed.
	for c in claims:
		if c.kind != "chapel" or c.status != "built" or p.faiths.has(c.townId):
			continue
		var cr: Dictionary = creeds()[e.rng(["creed", c.townId]).int_range(0, creeds().size())]
		p.faiths[c.townId] = {"creed": cr.id, "founded": e.day, "shrine": c.id}
		e.say(c.ownerId, c.townId, "We've a chapel now, and a creed: %s." % cr.name)
	# 2. Technology.
	for id in towns:
		var built: Array = claims.filter(func(c): return c.townId == id and c.status == "built")
		var gifted = 0
		for pid in e.people:
			var x: Dictionary = e.people[pid]
			if x.get("townId", "") == id and x.get("tags", []).any(func(t): return str(t).begins_with("gifted_")):
				gifted += 1
		Econ.addf(p.knowledge, id, T("knowledgeBase") + T("knowledgePerWorkshop") * built.filter(func(c): return c.kind != "house").size() + T("knowledgePerGifted") * gifted)
		if not p.tech.has(id):
			p.tech[id] = []
		var known: Array = p.tech[id]
		var have = func(kind: String) -> int:
			return built.filter(func(c): return c.kind == kind).size()
		var weight = func(t: Dictionary) -> int:
			var n = 0
			for k in t.get("needs", {}).get("buildings", {}):
				n += have.call(k)
			return n
		var cands: Array = techs().filter(func(t):
			if not tech_open(known, t):
				return false
			var nb: Dictionary = t.get("needs", {}).get("buildings", {})
			for k in nb:
				if have.call(k) < int(nb[k]):
					return false
			return true)
		cands.sort_custom(func(a, b):
			var wa: int = weight.call(a)
			var wb: int = weight.call(b)
			if wa != wb:
				return wa > wb
			if a.cost != b.cost:
				return a.cost < b.cost
			return a.id < b.id)
		if not cands.is_empty() and float(p.knowledge[id]) >= tech_cost(known, cands[0]):
			p.knowledge[id] = float(p.knowledge[id]) - tech_cost(known, cands[0])
			known.append(cands[0].id)
			e.say(null, id, "Word in town: someone's worked out %s." % str(cands[0].name).to_lower())
	# 3. Diplomacy between towns linked by road or border.
	var link_set = {}
	for k in e.borders.pairs:
		link_set[k] = true
	for r in Data.routes:
		link_set[Econ.pair_key(r.fromTownId, r.toTownId)] = true
	var links: Array = link_set.keys().filter(func(k):
		var ab: PackedStringArray = k.split("|")
		return e.towns.has(ab[0]) and e.towns.has(ab[1]))
	links.sort()
	var grief = _grievances(e, links)
	for key in links:
		var ab: PackedStringArray = key.split("|")
		var a = ab[0]
		var b = ab[1]
		if not p.relations.has(key):
			p.relations[key] = {"a": a, "b": b, "trust": 0.0, "feud": 0.0, "treaty": "none", "since": e.day, "lastWar": -999}
		var r: Dictionary = p.relations[key]
		var trust = float(r.trust)
		var drift = minf(absf(trust), T("trustDrift")) * signf(trust)
		r.trust = clampf(trust + T("trustPerUnit") * float(flow.get(key, 0.0)) - drift, -100.0, 100.0)
		var ca = p.faiths.get(a, {}).get("creed")
		var cb = p.faiths.get(b, {}).get("creed")
		var decay = maxf(float(creed_of(e, a).get("feudDecay", T("feudDecay"))), float(creed_of(e, b).get("feudDecay", T("feudDecay"))))
		var sharp = 1.0 + T("despairFeudMul") * maxf(float(e.towns[a].get("despair", 0.0)), float(e.towns[b].get("despair", 0.0)))
		var grown = tension_of(e, key) * T("feudPerTension") + (T("creedFriction") if ca != null and cb != null and ca != cb else 0.0) + float(grief.get(key, 0.0))
		r.feud = clampf(float(r.feud) + grown * sharp - decay, 0.0, 100.0)
		var was: String = r.treaty
		if r.treaty != "none" and (r.feud >= T("breakFeud") or r.trust < 0):
			r.treaty = "none"
		elif r.treaty == "none" and r.trust >= T("tradeTrust") and r.feud < T("tradeFeud"):
			r.treaty = "trade"
		elif r.treaty == "trade" and r.trust >= T("allyTrust") and r.feud < T("allyFeud"):
			r.treaty = "alliance"
		if r.treaty != was:
			r.since = e.day
			e.say(null, a, _treaty_line(r.treaty, b))
			e.say(null, b, _treaty_line(r.treaty, a))
		if r.treaty != "none" and e.day - int(r.since) >= int(T("learnAfterDays")):
			var chance = T("learnAlliance") if r.treaty == "alliance" else T("learnTrade")
			for pair in [[a, b], [b, a]]:
				var theirs: Array = p.tech.get(pair[1], [])
				var lacking: Array = p.tech.get(pair[0], []).filter(func(t): return not tech(t).is_empty() and tech_open(theirs, tech(t)))
				if not lacking.is_empty() and e.rng(["learn", e.day, "%s>%s" % pair]).next() < chance:
					if not p.tech.has(pair[1]):
						p.tech[pair[1]] = []
					p.tech[pair[1]].append(lacking[0])
		if r.treaty == "none" and r.feud >= T("warFeud") and e.day - int(r.lastWar) >= int(T("warCooldown")) and not at_war(e, a, b):
			var agg = a if strength(e, a) >= strength(e, b) else b
			var dfn = b if agg == a else a
			var id = "war%d" % p.next
			p.next += 1
			p.wars.append({"id": id, "aggressor": agg, "defender": dfn, "started": e.day, "duration": int(T("warMin")) + e.rng(["war-len", id]).int_range(0, int(T("warSpread"))), "raids": 0, "status": "active"})
			r.lastWar = e.day
			e.say(null, dfn, "%s has come for us. It's war." % _town_name(agg))
			e.say(null, agg, "We march on %s." % _town_name(dfn))
	# 4. War: raids, then a truce and a lost craft for the loser.
	for w in p.wars:
		if w.status != "active":
			continue
		var r = e.rng(["raid", e.day, w.id])
		var dg = e.ledgers.get(w.defender, {}).get("goods")
		var ag = e.ledgers.get(w.aggressor, {}).get("goods")
		if dg != null and r.next() < T("raidChance"):
			for item in Econ.sorted_keys(dg):
				var take = floorf(float(dg[item]) * T("raidShare"))
				if take <= 0:
					continue
				dg[item] = float(dg[item]) - take
				if ag != null:
					Econ.addf(ag, item, floorf(take * T("lootShare")))
			w.raids = int(w.raids) + 1
			e.say(null, w.defender, "Raiders from %s took from the stores last night." % _town_name(w.aggressor))
		var targets: Array = e.build.plans.filter(func(x): return x.townId == w.defender and EconPlans.live(x))
		targets.sort_custom(func(x, y): return x.id < y.id)
		if not targets.is_empty() and r.next() < T("claimRaidChance"):
			targets[0].stage = "abandoned"
			var cid: String = targets[0].claimId
			e.build.claims = e.build.claims.filter(func(c): return c.id != cid)
		if e.day - int(w.started) >= int(w.duration):
			w.status = "ended"
			w.winner = w.aggressor if strength(e, w.aggressor) >= strength(e, w.defender) else w.defender
			var loser: String = w.defender if w.winner == w.aggressor else w.aggressor
			var known: Array = p.tech.get(loser, [])
			if not known.is_empty():
				w.lostTech = known[-1]
				p.tech[loser] = known.slice(0, -1)
			p.knowledge[loser] = 0.0
			var rel = p.relations.get(Econ.pair_key(w.aggressor, w.defender))
			if rel != null:
				rel.feud = T("truceFeud")
				rel.trust = minf(float(rel.trust), T("truceTrust"))
				rel.treaty = "none"
				rel.since = e.day
				rel.lastWar = e.day
			e.say(null, loser, "The war's over. We lost.")
			e.say(null, w.winner, "The war's over. We held.")
	p.wars = p.wars.filter(func(w): return w.status == "active" or e.day - int(w.started) < 120)
	e.logistics.flow = {}

static func tension_of(e: Econ, key: String) -> float:
	return float(e.borders.pairs.get(key, {}).get("tension", 0.0))

static func _town_name(id: String) -> String:
	return str(Data.town(id).get("name", id))

static func _treaty_line(t: String, other: String) -> String:
	match t:
		"trade": return "We've a trade pact with %s now." % _town_name(other)
		"alliance": return "%s and us stand together now." % _town_name(other)
		_: return "The pact with %s is broken." % _town_name(other)
