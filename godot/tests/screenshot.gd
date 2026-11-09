## Renders the main scene and saves a PNG: godot --path godot -s res://tests/screenshot.gd -- out.png
## (needs a display; in CI use xvfb-run). Reignites one person first so warmth shows.
extends SceneTree

var frames := 0
var main: Node

func _initialize() -> void:
	main = load("res://scenes/main.tscn").instantiate()
	root.add_child(main)

func _process(_dt: float) -> bool:
	frames += 1
	if frames == 5:
		main.menu.hide_menu()
		var sim = root.get_node("Sim")
		for i in 6:
			sim.act("marta_ellison", "method:challenge")
		sim.act("jonah_pike", "speak")
		main._refresh_warmth()
	if frames == 60:
		var t = main._find_thing("person", "harold_finch")
		if t != null:
			main._open_ring(t)
	if frames == 90:
		var out := "user://shot.png"
		var args := OS.get_cmdline_user_args()
		if args.size() > 0:
			out = args[0]
		root.get_texture().get_image().save_png(out)
		print("saved ", out)
		return true
	return false
