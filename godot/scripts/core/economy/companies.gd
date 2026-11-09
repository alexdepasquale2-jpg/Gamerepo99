## Companies (sim/economy/companies.ts). A finished building with worker slots becomes a company: an owner,
## a till and hired hands who work its trade at the workshop boost. Sales bring coin; wages go to workers'
## purses; unpaid workers quit; the owner draws profit above the reserve.
## v2 runs NPC staffing in civic/staffing.ts; this port uses the COMPANY rules directly for hiring and pay.
class_name EconCompanies
extends RefCounted

const START_COIN := 10.0
const WAGE := 1.0
const HIRE_BUFFER_DAYS := 7
const REVENUE_SHARE := 0.4
const QUIT_AFTER_UNPAID := 3
const OWNER_DRAW := 0.2
const RESERVE := 20.0

static func company_of(e: Econ, person_id: String) -> Variant:
	for c in e.companies.list:
		if c.ownerId == person_id or c.workers.has(person_id):
			return c
	return null

static func purse_of(e: Econ, person_id: String) -> float:
	return float(e.companies.purse.get(person_id, 0.0))

static func trade_of(c: Dictionary) -> String:
	return Data.building_by_id[c.kind].jobs[0]

## What a person makes goods as: their company's trade, else their own job.
static func work_job_id(e: Econ, person_id: String) -> String:
	var c = company_of(e, person_id)
	return trade_of(c) if c != null else EconVillage.job_of(e, person_id).id

## Sales: the company earns a share of what its member just made.
static func credit(e: Econ, person_id: String, out: Dictionary, mul: float) -> void:
	var c = company_of(e, person_id)
	if c == null:
		return
	var v = 0.0
	for item in out:
		v += float(out[item]) * mul * Data.price(item)
	v *= REVENUE_SHARE
	c.coin = float(c.coin) + v
	c.revenue = float(c.revenue) + v

static func tick(e: Econ) -> void:
	var co = e.companies
	# Found a company when a building with a trade is finished.
	for plan in e.build.plans:
		if plan.stage != "done" or co.list.any(func(c): return c.planId == plan.id):
			continue
		var def: Dictionary = Data.building_by_id[plan.kind]
		if def.get("slots") == null or co.list.any(func(c): return c.ownerId == plan.ownerId or c.workers.has(plan.ownerId)):
			continue
		var nm = "%s's %s" % [e.first_name(plan.ownerId), str(def.name).capitalize()]
		co.list.append({"id": "co%d" % co.next, "planId": plan.id, "name": nm, "ownerId": plan.ownerId, "townId": plan.townId, "kind": plan.kind, "workers": [], "coin": START_COIN, "founded": e.day, "revenue": 0.0, "unpaid": {}})
		co.next += 1
	var list: Array = co.list.duplicate()
	list.sort_custom(func(a, b): return a.id < b.id)
	var by = e.residents()
	for c in list:
		if not e.people.has(c.ownerId):
			continue
		# Wages, then quitting.
		for w in c.workers.duplicate():
			if not e.people.has(w):
				c.workers.erase(w)
				continue
			if float(c.coin) >= WAGE:
				c.coin = float(c.coin) - WAGE
				Econ.addf(co.purse, w, WAGE)
				c.unpaid.erase(w)
			else:
				c.unpaid[w] = int(c.unpaid.get(w, 0)) + 1
				if int(c.unpaid[w]) >= QUIT_AFTER_UNPAID:
					c.workers.erase(w)
					c.unpaid.erase(w)
					e.say(w, c.townId, "Three days unpaid at %s. I'm done there." % c.name)
		# Hire: idle hands (no trade that makes goods) or the same trade, while the till can carry them.
		var slots = int(Data.building_by_id[c.kind].get("slots", 0))
		if c.workers.size() < slots and float(c.coin) >= WAGE * HIRE_BUFFER_DAYS * (c.workers.size() + 1):
			for id in by.get(c.townId, []):
				if id == c.ownerId or company_of(e, id) != null:
					continue
				var j: Dictionary = EconVillage.job_of(e, id)
				if j.recipes.is_empty() or j.id == trade_of(c):
					c.workers.append(id)
					e.say(id, c.townId, "I've taken work at %s." % c.name)
					break
		# The owner draws profit above the reserve.
		if float(c.coin) > RESERVE:
			var d = (float(c.coin) - RESERVE) * OWNER_DRAW
			c.coin = float(c.coin) - d
			Econ.addf(co.purse, c.ownerId, d)
