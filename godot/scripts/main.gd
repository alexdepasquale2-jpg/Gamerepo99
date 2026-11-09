## Shell: builds the town, people and player, the HUD, the ring and the menus, and routes input.
## Mirrors game/src/app/shell.ts: world → actors → voice → ui → interact.
extends Node2D

const REACH := 56.0

var world: Node2D
var map: TownMap
var player: PlayerActor
var camera: Camera2D
var actors: Dictionary = {}  # person id -> PersonActor
var daylight: CanvasModulate
var prompt: Label
var hud: Hud
var ring: Ring
var menu: MenuSheet
var focused = null  # Dictionary thing or null
var pending_open = null  # thing to open once the walk arrives

func _ready() -> void:
	world = Node2D.new()
	world.y_sort_enabled = false
	add_child(world)
	map = TownMap.new()
	map.z_index = -4096
	world.add_child(map)
	player = PlayerActor.new()
	player.map = map
	world.add_child(player)
	camera = Camera2D.new()
	camera.position_smoothing_enabled = true
	player.add_child(camera)
	daylight = CanvasModulate.new()
	add_child(daylight)
	prompt = Kit.label("", 13, Palette.SPARK_FILL)
	prompt.z_index = 4095
	prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prompt.size = Vector2(200, 18)
	world.add_child(prompt)

	var ui := CanvasLayer.new()
	add_child(ui)
	hud = Hud.new()
	ui.add_child(hud)
	ring = Ring.new()
	ui.add_child(ring)
	menu = MenuSheet.new()
	ui.add_child(menu)

	hud.use_item.connect(func(id): Sim.use_item(id))
	hud.act_pressed.connect(_act_on_focus)
	hud.menu_pressed.connect(_open_pause)
	ring.chosen.connect(_on_verb)
	menu.action.connect(_on_menu)
	Sim.said.connect(_on_said)
	Sim.reignited.connect(_on_reignited)
	Sim.town_changed.connect(func(_t): _build_town())
	Sim.state_replaced.connect(_build_town)
	Sim.day_started.connect(func(_d, _l): _refresh_warmth())
	Sim.ended.connect(_on_ended)
	_build_town()
	_show_title()

func _build_town() -> void:
	for a in actors.values():
		a.queue_free()
	actors.clear()
	ring.close()
	var t := Data.town(Sim.town_id)
	map.build(t, Sim.world_seed)
	for p in Data.people_in(Sim.town_id):
		var a := PersonActor.new()
		var at: Vector2 = map.site_pos.get(p.siteId, map.hearth_pos) + Vector2(0, 14)
		a.setup(p.id, p.name, at, map, Sim.world_seed)
		world.add_child(a)
		actors[p.id] = a
	player.position = map.signpost_pos + Vector2(-40, 0) if Sim.day > 1 or Sim.phase > 0.15 else map.hearth_pos + Vector2(0, 40)
	camera.limit_left = 0
	camera.limit_top = 0
	camera.limit_right = int(map.size_px().x)
	camera.limit_bottom = int(map.size_px().y)
	var vp := get_viewport_rect().size
	var z := maxf(1.4, maxf(vp.x / map.size_px().x, vp.y / map.size_px().y))
	camera.zoom = Vector2(z, z)
	camera.reset_smoothing()
	_refresh_warmth()

func _refresh_warmth() -> void:
	map.set_warmth(Sim.town_warmth())

# --- Things and focus --------------------------------------------------------

func _things() -> Array:
	var out: Array = []
	for id in actors:
		var a: PersonActor = actors[id]
		out.append({"kind": "person", "id": id, "pos": a.position, "label": a.display_name})
	out.append({"kind": "hearth", "id": "hearth", "pos": map.hearth_pos, "label": "Hearth"})
	out.append({"kind": "signpost", "id": "signpost", "pos": map.signpost_pos, "label": "Signpost"})
	return out

func _nearest(p: Vector2, radius: float):
	var best = null
	var bd := radius
	for t in _things():
		var d: float = p.distance_to(t.pos)
		if d < bd:
			bd = d
			best = t
	return best

func _process(dt: float) -> void:
	if menu.visible:
		return
	Sim.advance_time(dt)
	_update_daylight()
	focused = _nearest(player.position, REACH)
	if focused != null and not ring.is_open():
		prompt.visible = true
		prompt.text = ("E · " if not _is_touch() else "") + focused.label
		prompt.position = focused.pos + Vector2(-100, -76 if focused.kind == "person" else -48)
	else:
		prompt.visible = false
	if pending_open != null:
		var live = _find_thing(pending_open.kind, pending_open.id)
		if live == null:
			pending_open = null
		elif player.position.distance_to(live.pos) <= REACH:
			pending_open = null
			player.walk_target = null
			_open_ring(live)
		elif player.walk_target == null:
			pending_open = null

func _find_thing(kind: String, id: String):
	for t in _things():
		if t.kind == kind and t.id == id:
			return t
	return null

func _is_touch() -> bool:
	return DisplayServer.is_touchscreen_available()

func _update_daylight() -> void:
	var p := Sim.phase
	var light := 1.0 - 0.45 * clampf((p - 0.75) / 0.2, 0.0, 1.0)
	light = minf(light, 0.75 + 0.25 * clampf(p / 0.15, 0.0, 1.0))
	daylight.color = Color(light, light * 0.97, light * (0.9 + 0.1 * light))

# --- Input -------------------------------------------------------------------

func _unhandled_input(e: InputEvent) -> void:
	if menu.visible:
		if e is InputEventKey and e.pressed and e.keycode == KEY_ESCAPE and not Sim.over:
			menu.hide_menu()
		return
	if e is InputEventKey and e.pressed and not e.echo:
		match e.keycode:
			KEY_E, KEY_SPACE, KEY_ENTER:
				if ring.is_open(): ring.close()
				else: _act_on_focus()
			KEY_ESCAPE:
				if ring.is_open(): ring.close()
				else: _open_pause()
	elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
		var wp := get_global_mouse_position()
		var hit = _nearest(wp, 30.0)
		if hit != null:
			if player.position.distance_to(hit.pos) <= REACH:
				_open_ring(hit)
			else:
				pending_open = hit
				player.walk_to(hit.pos + (player.position - hit.pos).normalized() * 30.0)
		else:
			player.walk_to(wp)

func _act_on_focus() -> void:
	if focused != null:
		_open_ring(focused)

func _open_ring(t: Dictionary) -> void:
	var verbs: Array = []
	match t.kind:
		"person":
			verbs = Sim.verbs_for_person(t.id)
		"hearth":
			verbs = [{"id": "rest", "label": "Rest till dawn"}, {"id": "save", "label": "Save"}]
		"signpost":
			for other in Data.walkable_towns():
				if other.id != Sim.town_id:
					verbs.append({"id": "travel:" + other.id, "label": "To " + other.name})
	ring.set_meta("thing", t)
	var screen: Vector2 = get_viewport().get_canvas_transform() * t.pos
	ring.open(screen + Vector2(0, -30), verbs)

func _on_verb(verb_id: String) -> void:
	var t: Dictionary = ring.get_meta("thing")
	if verb_id == "rest":
		Sim.rest()
		_say_at(player, "Dawn. Day %d." % Sim.day, "talk")
	elif verb_id == "save":
		_say_at(player, "Saved." if Sim.save_game() else "Couldn't save.", "talk")
	elif verb_id.begins_with("travel:"):
		Sim.travel(verb_id.substr(7))
	elif t.kind == "person":
		Sim.act(t.id, verb_id)
	_refresh_warmth()

# --- Voice -------------------------------------------------------------------

func _on_said(person_id: String, line: String, kind: String) -> void:
	if actors.has(person_id):
		_say_at(actors[person_id], line, kind)

func _say_at(who: Node2D, line: String, kind: String) -> void:
	for c in world.get_children():
		if c is Bubble and c.follow == who:
			c.queue_free()
	var b := Bubble.new()
	world.add_child(b)
	b.position = who.position
	b.setup(line, who, kind)

func _on_reignited(person_id: String) -> void:
	_refresh_warmth()
	if actors.has(person_id):
		var burst := CPUParticles2D.new()
		burst.one_shot = true
		burst.amount = 40
		burst.lifetime = 1.2
		burst.explosiveness = 0.9
		burst.direction = Vector2.UP
		burst.spread = 70
		burst.initial_velocity_min = 60
		burst.initial_velocity_max = 140
		burst.gravity = Vector2(0, 90)
		burst.color = Palette.SPARK_FILL
		burst.scale_amount_min = 2
		burst.scale_amount_max = 4
		burst.position = actors[person_id].position + Vector2(0, -30)
		burst.z_index = 4000
		world.add_child(burst)
		burst.emitting = true
		get_tree().create_timer(2.0).timeout.connect(burst.queue_free)

# --- Menus -------------------------------------------------------------------

func _show_title() -> void:
	var opts := [["new", "New world"]]
	if Sim.has_save():
		opts.push_front(["load", "Continue"])
	menu.show_menu("The Last Spark", "Walk into towns that have lost the will to live and reignite people one by one. Every method costs some of your own spark.\n\nMove: WASD or tap. Act: E or tap a person. Rest at the hearth. The signpost leads on.", opts)

func _open_pause() -> void:
	ring.close()
	var opts := [["resume", "Resume"], ["save", "Save"]]
	if Sim.has_save():
		opts.append(["load", "Load"])
	opts.append(["new", "New world"])
	menu.show_menu("Paused", "Day %d in %s." % [Sim.day, Data.town(Sim.town_id).get("name", "")], opts)

func _on_menu(id: String) -> void:
	match id:
		"resume":
			menu.hide_menu()
		"save":
			Sim.save_game()
			menu.hide_menu()
		"load":
			Sim.load_game()
			menu.hide_menu()
		"new":
			Sim.new_game(int(Time.get_unix_time_from_system()) & 0x7FFFFFFF)
			menu.hide_menu()

func _on_ended(_kind: String, text: String) -> void:
	menu.show_menu("The end", text, [["new", "Begin again"]])
