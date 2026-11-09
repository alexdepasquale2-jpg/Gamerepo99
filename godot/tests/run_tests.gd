## Headless checks: godot --headless --path godot -s res://tests/run_tests.gd
## Checks the RNG matches game/src/sim/rng.ts and the core rules move flames and spark.
extends SceneTree

var fails := 0

func check(cond: bool, what: String) -> void:
	if cond:
		print("ok   ", what)
	else:
		fails += 1
		print("FAIL ", what)

func _initialize() -> void:
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
	print("%d failure(s)" % fails)
	quit(1 if fails > 0 else 0)
