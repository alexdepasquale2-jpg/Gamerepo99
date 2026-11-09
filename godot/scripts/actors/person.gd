## A villager: stands near their site, wanders a little, coloured by their own flame.
class_name PersonActor
extends Node2D

var person_id := ""
var display_name := ""
var home := Vector2.ZERO
var target := Vector2.ZERO
var wait := 0.0
var rng: SeedRng
var map: TownMap
var label: Label

func setup(id: String, nm: String, at: Vector2, town_map: TownMap, world_seed: int) -> void:
	person_id = id
	display_name = nm
	home = at
	position = at
	target = at
	map = town_map
	rng = SeedRng.derive(world_seed, ["wander", id])
	label = Label.new()
	label.text = nm.get_slice(" ", 0)
	label.add_theme_font_size_override("font_size", 11)
	label.add_theme_color_override("font_outline_color", Palette.INK)
	label.add_theme_constant_override("outline_size", 4)
	label.position = Vector2(-30, -52)
	label.size = Vector2(60, 14)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(label)

func _process(dt: float) -> void:
	var w := Sim.warmth_of(person_id)
	var speed := 18.0 + 30.0 * w
	if position.distance_to(target) < 2.0:
		wait -= dt
		if wait <= 0.0:
			var reach := 24.0 + 60.0 * w
			var cand := home + Vector2(rng.next() * 2 - 1, rng.next() * 2 - 1) * reach
			if map.passable(cand):
				target = cand
			wait = 1.5 + rng.next() * 3.0 * (1.5 - w)
	else:
		var step := position.move_toward(target, speed * dt)
		if map.passable(step):
			position = step
		else:
			target = position
	z_index = int(position.y)
	queue_redraw()

func _draw() -> void:
	var w := Sim.warmth_of(person_id)
	var body := Color("#4a4e5a").lerp(Color("#c0703f"), w)
	var stoop := (1.0 - w) * 5.0
	draw_circle(Vector2(0, 0), 9, Color(0, 0, 0, 0.25))
	draw_rect(Rect2(-7, -26 + stoop, 14, 24 - stoop), body)
	draw_circle(Vector2(0, -32 + stoop * 1.4), 7, Color("#d8b08c").lerp(Color("#9a8f86"), 1.0 - w))
	if Sim.people.get(person_id, {}).get("reignited", false):
		draw_circle(Vector2(0, -44), 3, Palette.SPARK_FILL)
