## Village logistics (sim/economy/logistics.ts): a short town posts a request; the nearest town with surplus
## loads a cart and sends it down the road. Roads have a cart cap; carts can be lost on the way.
## planRoad here is a shortest path over routes.json (v2 also routes over generated district roads).
class_name EconLogistics
extends RefCounted

const CART_CAPACITY := 6
const ROUTE_CART_CAP := 3
const DEPARTURES_PER_TOWN := 2
const MAX_DAYS := 8
const REQUEST_LAPSE_DAYS := 10
const RESERVE_DAYS := 5.0
const RESERVE_FLAT := 2.0
const ESCORT_HAZARD_MUL := 0.25
const WRECK_DAYS := 5
## letter-replies.json courierSurvivalPerDay
const SURVIVAL_PER_DAY := 0.9

static func open_requests(e: Econ, town_id: String = "") -> Array:
	return e.logistics.requests.filter(func(r): return r.status == "open" and (town_id == "" or r.townId == town_id))

## Shortest road between two towns over routes.json: { days, legs: [{ routeId, from, to, days }] } or null.
static func plan_road(from: String, to: String) -> Variant:
	var dist = {from: 0.0}
	var prev = {}
	var open = [from]
	var done = {}
	while not open.is_empty():
		open.sort_custom(func(a, b): return dist[a] < dist[b] if dist[a] != dist[b] else a < b)
		var u: String = open.pop_front()
		if done.has(u):
			continue
		done[u] = true
		if u == to:
			break
		for r in Data.routes:
			if r.get("broken", false):
				continue
			var v = ""
			if r.fromTownId == u: v = r.toTownId
			elif r.toTownId == u: v = r.fromTownId
			else: continue
			var nd: float = dist[u] + float(r.days)
			if nd < float(dist.get(v, INF)):
				dist[v] = nd
				prev[v] = [u, r]
				open.append(v)
	if not dist.has(to) or from == to:
		return null
	var legs: Array = []
	var at = to
	while at != from:
		var pr: Array = prev[at]
		legs.push_front({"routeId": pr[1].id, "from": pr[0], "to": at, "days": float(pr[1].days)})
		at = pr[0]
	return {"days": dist[to], "legs": legs}

## Where a cart is: { from, to, f } on its current leg.
static func cart_position(c: Dictionary) -> Variant:
	var t = float(c.roadDays) - float(c.daysLeft)
	for leg in c.legs:
		if t <= float(leg.days):
			return {"routeId": leg.routeId, "from": leg.from, "to": leg.to, "f": clampf(t / float(leg.days), 0.0, 1.0)}
		t -= float(leg.days)
	return null

static func _surplus(e: Econ, town_id: String, item_id: String) -> float:
	var l = e.ledgers.get(town_id)
	if l == null:
		return 0.0
	var have = float(l.goods.get(item_id, 0.0))
	if Econ.FOOD.has(item_id):
		var pool = 0.0
		for i in Econ.FOOD:
			pool += float(l.goods.get(i, 0.0))
		return floorf(minf(have, pool - float(l.need.get("food", 0.0)) * RESERVE_DAYS))
	return floorf(have - (float(l.need.get(item_id, 0.0)) * RESERVE_DAYS + RESERVE_FLAT))

static func _on_route(e: Econ, route_id: String) -> int:
	return e.logistics.carts.filter(func(c): return c.legs.any(func(l): return l.routeId == route_id)).size()

static func tick(e: Econ) -> void:
	var log = e.logistics
	log.wrecks = log.wrecks.filter(func(w): return e.day - int(w.day) < WRECK_DAYS)
	# 1. Carts on the road: age, maybe lose, maybe arrive.
	var carts: Array = log.carts.duplicate()
	carts.sort_custom(func(a, b): return a.id < b.id)
	for cart in carts:
		cart.daysLeft = float(cart.daysLeft) - 1
		var req = null
		for r in log.requests:
			if r.id == cart.requestId:
				req = r
		var hazard = 3.0 if EconPolity.at_war(e, cart.fromTownId, cart.toTownId) else (0.5 if EconPolity.safe_roads(e, cart.fromTownId, cart.toTownId) else 1.0)
		if cart.has("escortedBy"):
			hazard *= ESCORT_HAZARD_MUL
		if e.rng(["cart-road", e.day, cart.id]).next() >= pow(SURVIVAL_PER_DAY, hazard):
			var at = cart_position(cart)
			if at != null:
				log.wrecks.append({"cartId": cart.id, "itemId": cart.itemId, "qty": cart.qty, "at": at, "day": e.day})
			log.carts.erase(cart)
			log.lost = int(log.lost) + 1
			if req != null:
				req.erase("cartId")
			e.say(null, cart.toTownId, "The cart from %s never came. The road took it." % EconPolity._town_name(cart.fromTownId))
			continue
		if float(cart.daysLeft) <= 0:
			log.carts.erase(cart)
			EconVillage.supply(e, cart.toTownId, cart.itemId, float(cart.qty))
			log.delivered = int(log.delivered) + int(cart.qty)
			Econ.addf(log.flow, Econ.pair_key(cart.fromTownId, cart.toTownId), float(cart.qty))
			if req != null:
				req.status = "filled"
				req.erase("cartId")
			e.say(null, cart.toTownId, "A cart came in from %s: %d %s." % [EconPolity._town_name(cart.fromTownId), int(cart.qty), Data.item_name(cart.itemId)])
	# 2. Shortage posts requests; stale ones lapse.
	for r in log.requests:
		if r.status == "open" and e.day - int(r.postedDay) >= REQUEST_LAPSE_DAYS and not r.has("cartId"):
			r.status = "lapsed"
	for town_id in Econ.sorted_keys(e.ledgers):
		var l: Dictionary = e.ledgers[town_id]
		for key in Econ.sorted_keys(l.short):
			if log.requests.any(func(r): return r.status == "open" and r.townId == town_id and r.itemId == key):
				continue
			var qty = mini(12, maxi(1, int(ceil(float(l.need.get(key, 1.0)) * EconVillage.COVER_DAYS))))
			log.requests.append({"id": "req%d" % log.next, "townId": town_id, "itemId": key, "qty": qty, "postedDay": e.day, "status": "open"})
			log.next += 1
	log.requests = log.requests.filter(func(r): return r.status == "open" or e.day - int(r.postedDay) < 30)
	# 3. Dispatch: nearest town with spare goods loads a cart for each unserved request.
	var sent = {}
	var towns = Econ.sorted_keys(e.ledgers)
	for req in log.requests.filter(func(r): return r.status == "open" and not r.has("cartId")):
		var items: Array = Econ.FOOD if req.itemId == "food" else [req.itemId]
		var best = null
		for from in towns:
			if from == req.townId or EconPolity.at_war(e, from, req.townId) or int(sent.get(from, 0)) >= DEPARTURES_PER_TOWN:
				continue
			var item = null
			for i in items:
				if _surplus(e, from, i) >= 1:
					item = i
					break
			if item == null:
				continue
			var road = plan_road(from, req.townId)
			if road == null or float(road.days) > MAX_DAYS or road.legs.any(func(leg): return _on_route(e, leg.routeId) >= ROUTE_CART_CAP):
				continue
			if best == null or float(road.days) < float(best.road.days):
				best = {"from": from, "item": item, "road": road}
		if best == null:
			continue
		var id = "cart%d" % log.next
		var qty = EconVillage.draw(e, best.from, best.item, minf(minf(float(req.qty), CART_CAPACITY), _surplus(e, best.from, best.item)))
		if qty <= 0:
			continue
		log.next += 1
		sent[best.from] = int(sent.get(best.from, 0)) + 1
		log.carts.append({"id": id, "itemId": best.item, "qty": qty, "fromTownId": best.from, "toTownId": req.townId, "legs": best.road.legs, "roadDays": best.road.days, "daysLeft": best.road.days, "requestId": req.id})
		req.cartId = id
