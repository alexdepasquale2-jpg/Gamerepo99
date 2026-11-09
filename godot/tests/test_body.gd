## The checks themselves; run_tests.gd loads this once the autoloads exist.
## Checks the RNG matches game/src/sim/rng.ts and the core rules move flames and spark.
extends RefCounted

var fails := 0

func check(cond: bool, what: String) -> void:
	if cond:
		print("ok   ", what)
	else:
		fails += 1
		print("FAIL ", what)

func run(root: Node) -> int:
	# Reference values from the TypeScript createRng / deriveRng.
	var a := SeedRng.new(12345)
	var want := [0.9797282677609473, 0.3067522644996643, 0.484205421525985]
	for w in want:
		check(absf(a.next() - w) < 1e-12, "mulberry32 matches TS (%s)" % w)
	var b := SeedRng.derive(20261109, ["dawn", 7])
	check(absf(b.next() - 0.998831195756793) < 1e-12, "deriveRng matches TS (1)")
	check(absf(b.next() - 0.10891294409520924) < 1e-12, "deriveRng matches TS (2)")

	var data = root.get_node("Data")
	var sim = root.get_node("Sim")
	data.load_all()
	check(data.people.size() == 12, "people.json loaded")
	check(data.methods.size() >= 5, "methods.json loaded")
	sim.new_game(42)
	check(sim.town_id == "ashford", "starts in the starting town")
	var spark0: int = sim.spark
	var f0: int = sim.flame("marta_ellison")
	sim.act("marta_ellison", "method:challenge")
	check(sim.spark < spark0, "a method costs spark")
	check(sim.flame("marta_ellison") != f0, "a method moves the flame")
	var bread0: int = sim.inventory.get("bread", 0)
	sim.act("harold_finch", "give:bread")
	check(sim.inventory.get("bread", 0) == bread0 - 1, "giving removes the item")
	for i in 6:
		sim.act("marta_ellison", "method:challenge")
	check(sim.people["marta_ellison"].reignited, "repeated challenge reignites Marta (apathy)")
	var d0: int = sim.day
	sim.rest()
	check(sim.day == d0 + 1, "rest advances the day")
	check(sim.save_game(), "save writes")
	var flame_saved: int = sim.flame("marta_ellison")
	sim.new_game(7)
	check(sim.load_game() and sim.flame("marta_ellison") == flame_saved, "load restores flames")
	_economy(sim)
	print("%d failure(s)" % fails)
	return fails

func _run_days(sim, seed: int, days: int) -> String:
	sim.new_game(seed)
	for i in days:
		sim.rest()
	return JSON.stringify(sim.econ.to_dict())

func _economy(sim) -> void:
	var a := _run_days(sim, 99, 120)
	var e: Econ = sim.econ
	var plans: int = e.build.plans.size()
	var done: int = e.build.plans.filter(func(p): return p.stage == "done").size()
	var sent: int = int(e.logistics.next) - 1
	print("     120 dawns: plans %d (done %d), carts+requests %d, delivered %d, lost %d, households %d, children %d, companies %d, wars %d" % [
		plans, done, sent, int(e.logistics.delivered), int(e.logistics.lost), e.kin.households.size(), e.kin.children.size(), e.companies.list.size(), e.polity.wars.size()])
	for t in Econ.sorted_keys(e.ledgers):
		var g: Dictionary = e.ledgers[t].goods
		var top: Array = Econ.sorted_keys(g).filter(func(k): return g[k] >= 1).map(func(k): return "%s %d" % [k, int(g[k])])
		print("     %s: %s" % [t, ", ".join(top)])
	var b := _run_days(sim, 99, 120)
	check(a == b, "economy is deterministic (same seed, same 120 dawns)")
	check(a != _run_days(sim, 100, 120), "a different seed gives a different economy")
	sim.new_game(99)
	for i in 120:
		sim.rest()
	e = sim.econ
	check(plans > 0, "villagers take up ambitions and stake plans")
	check(sent > 0, "shortages post requests and carts")
	check(e.kin.households.size() > 0, "couples form households")
	var grain_before: float = EconVillage.ledger(e, "ashford").goods.get("grain", 0.0)
	EconVillage.supply(e, "ashford", "grain", 5)
	check(is_equal_approx(EconVillage.ledger(e, "ashford").goods.grain, grain_before + 5), "supply adds goods to the town")
	check(not EconView.lines(e, "ashford").is_empty(), "noticeboard has lines")
	var snap := JSON.stringify(e.to_dict())
	sim.save_game()
	sim.new_game(1)
	sim.load_game()
	check(JSON.stringify(sim.econ.to_dict()) == snap, "economy survives save and load")
	var after_load := _continue(sim, 10)
	sim.load_game()
	check(_continue(sim, 10) == after_load, "a loaded economy carries on the same way twice")

func _continue(sim, days: int) -> String:
	for i in days:
		sim.rest()
	return JSON.stringify(sim.econ.to_dict())
