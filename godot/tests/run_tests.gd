## Headless checks: godot --headless --path godot -s res://tests/run_tests.gd
## Checks the RNG matches game/src/sim/rng.ts, the core rules, and the economy (determinism, saves).
## The body is loaded on the first frame, after the Data and Sim autoloads are registered.
extends SceneTree

var started := false

func _process(_dt: float) -> bool:
	if started:
		return false
	started = true
	var fails: int = load("res://tests/test_body.gd").new().run(root)
	quit(1 if fails > 0 else 0)
	return false
