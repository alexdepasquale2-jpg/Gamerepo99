## Read-only view for the noticeboard (sim/economy/economy-view.ts economyLines). Changes nothing.
class_name EconView
extends RefCounted

static func lines(e: Econ, town_id: String) -> Array:
	var out: Array = []
	var short = EconVillage.needs(e, town_id).slice(0, 5)
	if not short.is_empty():
		out.append("[b]The town is short of[/b]")
		for n in short:
			out.append("• %s (%d a day)" % [Data.item_name(n.item), int(ceil(n.short))])
		out.append("")
	var incoming: Array = e.logistics.carts.filter(func(c): return c.toTownId == town_id)
	if not incoming.is_empty():
		out.append("[b]On the road to us[/b]")
		for c in incoming.slice(0, 3):
			var d = int(ceil(float(c.daysLeft)))
			out.append("• %d %s from %s, %d day%s out" % [int(c.qty), Data.item_name(c.itemId), EconPolity._town_name(c.fromTownId), d, "" if d == 1 else "s"])
		out.append("")
	var plans = EconPlans.active(e, town_id)
	if not plans.is_empty():
		out.append("[b]Under construction[/b]")
		for p in plans.slice(0, 4):
			var def: Dictionary = Data.building_by_id[p.kind]
			var have = 0.0
			var total = 0.0
			var missing: Array = []
			for i in def.cost:
				have += mini(int(def.cost[i]), int(p.have.get(i, 0)))
				total += float(def.cost[i])
				var m = int(def.cost[i]) - int(p.have.get(i, 0))
				if m > 0:
					missing.append("%d %s" % [m, Data.item_name(i)])
			var prog = 0.5 * have / total if p.stage == "gathering" else 0.5 + 0.5 * minf(1.0, float(p.laborDone) / float(def.labor))
			var tail = ", needs " + ", ".join(missing.slice(0, 3)) if p.stage == "gathering" and not missing.is_empty() else ", building"
			out.append("• %s's %s: %d%%%s" % [e.first_name(p.ownerId), def.name, int(round(prog * 100)), tail])
		out.append("  Give a builder what they need and it goes to their site.")
		out.append("")
	var cos: Array = e.companies.list.filter(func(c): return c.townId == town_id)
	if not cos.is_empty():
		out.append("[b]Workshops[/b]")
		for c in cos.slice(0, 4):
			out.append("• %s (%d working, %d coin)" % [c.name, 1 + c.workers.size(), int(c.coin)])
		out.append("")
	var others = {}
	for r in Data.routes:
		if r.fromTownId == town_id: others[r.toTownId] = true
		if r.toTownId == town_id: others[r.fromTownId] = true
	if not others.is_empty():
		out.append("[b]Neighbours[/b]")
		for o in Econ.sorted_keys(others):
			var t = EconPolity.treaty_of(e, town_id, o)
			var s = "at war" if EconPolity.at_war(e, town_id, o) else ("allied" if t == "alliance" else ("trade pact" if t == "trade" else "no treaty"))
			out.append("• %s: %s" % [EconPolity._town_name(o), s])
		out.append("")
	var creed = EconPolity.creed_of(e, town_id)
	if not creed.is_empty():
		out.append("Faith: " + creed.name)
	var known: Array = EconPolity.techs_of(e, town_id).map(func(t): return EconPolity.tech(t).get("name", t))
	if not known.is_empty():
		out.append("Known crafts: " + ", ".join(known))
	var hh = e.kin.households.filter(func(h): return h.townId == town_id).size()
	var kids = e.kin.children.filter(func(c): return c.townId == town_id and c.status == "child").size()
	out.append("Households: %d · children: %d" % [hh, kids])
	if out.size() == 1:
		out.push_front("Nothing posted. The town gets by.")
	return out
