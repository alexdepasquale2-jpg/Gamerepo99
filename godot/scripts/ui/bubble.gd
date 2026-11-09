## A speech bubble over a named person. News comes through people, never a log.
class_name Bubble
extends Node2D

const TTL := 4.5
var life := TTL
var follow: Node2D

func setup(text: String, who: Node2D, kind: String) -> void:
	follow = who
	var panel := PanelContainer.new()
	var sb := Kit.panel_box(0.95)
	sb.bg_color = Palette.PAPER
	if kind == "reignite":
		sb.border_color = Palette.SPARK_FILL
		sb.set_border_width_all(3)
	elif kind == "refusal":
		sb.border_color = Color("#7a8a99")
	panel.add_theme_stylebox_override("panel", sb)
	var l := Label.new()
	l.text = text
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size = Vector2(220, 0)
	l.add_theme_font_size_override("font_size", 13)
	l.add_theme_color_override("font_color", Palette.INK)
	panel.add_child(l)
	add_child(panel)
	panel.position = Vector2(-120, -70)
	z_index = 4096
	await get_tree().process_frame
	panel.position = Vector2(-panel.size.x / 2, -64 - panel.size.y)

func _process(dt: float) -> void:
	life -= dt
	if is_instance_valid(follow):
		position = follow.position
	modulate.a = clampf(life, 0.0, 1.0)
	if life <= 0:
		queue_free()
