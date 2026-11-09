## Minimal HUD: spark top-left (gold fill, cyan outline), day and phase muted at top-centre,
## purse by the hotbar, touch buttons bottom-right.
class_name Hud
extends Control

signal use_item(item_id: String)
signal act_pressed
signal menu_pressed

var day_label: Label
var hotbar: HBoxContainer
var purse: Label
var town_label: Label
var bottom: HBoxContainer
var act_btn: Button
var menu_btn: Button

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	day_label = Kit.label("", 14, Color("#bdb3a3"))
	day_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(day_label)
	town_label = Kit.label("", 13, Color("#8f877b"))
	town_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(town_label)
	bottom = HBoxContainer.new()
	bottom.alignment = BoxContainer.ALIGNMENT_CENTER
	bottom.add_theme_constant_override("separation", 6)
	add_child(bottom)
	hotbar = HBoxContainer.new()
	hotbar.add_theme_constant_override("separation", 6)
	bottom.add_child(hotbar)
	purse = Kit.label("", 14, Palette.SPARK_FILL)
	bottom.add_child(purse)
	act_btn = Kit.chip("Act", 72)
	act_btn.pressed.connect(func(): act_pressed.emit())
	add_child(act_btn)
	menu_btn = Kit.chip("≡", 44)
	menu_btn.pressed.connect(func(): menu_pressed.emit())
	add_child(menu_btn)
	Sim.spark_changed.connect(func(_a, _b): queue_redraw())
	Sim.inventory_changed.connect(refresh)
	Sim.state_replaced.connect(refresh)
	Sim.town_changed.connect(func(_t): refresh())
	refresh()

func refresh() -> void:
	for c in hotbar.get_children():
		c.queue_free()
	for id in Sim.inventory:
		var item: Dictionary = Data.items_by_id.get(id, {})
		var b := Kit.chip("%s ×%d" % [item.get("name", id), int(Sim.inventory[id])])
		b.add_theme_font_size_override("font_size", 13)
		var use = item.get("use", null)
		b.disabled = not (use is Dictionary and use.has("spark"))
		b.tooltip_text = "Tap to eat (+%s spark)" % str(use.spark) if not b.disabled else "Give it to someone from their ring"
		b.pressed.connect(func(): use_item.emit(id))
		hotbar.add_child(b)
	purse.text = "  %d coin" % Sim.coin
	town_label.text = Data.town(Sim.town_id).get("name", Sim.town_id)
	queue_redraw()

func _process(_dt: float) -> void:
	day_label.text = "Day %d · %s" % [Sim.day, Sim.phase_name()]
	var vp := get_viewport_rect().size
	day_label.position = Vector2(vp.x / 2 - 150, 10)
	day_label.size = Vector2(300, 20)
	town_label.position = Vector2(vp.x / 2 - 150, 30)
	town_label.size = Vector2(300, 20)
	bottom.size = bottom.get_combined_minimum_size()
	bottom.position = Vector2((vp.x - bottom.size.x) / 2, vp.y - bottom.size.y - 14)
	act_btn.position = Vector2(vp.x - act_btn.size.x - 18, vp.y - act_btn.size.y - 70)
	menu_btn.position = Vector2(vp.x - menu_btn.size.x - 14, 12)

func _draw() -> void:
	var r := Rect2(16, 16, 220, 18)
	var f := float(Sim.spark) / float(Sim.spark_max)
	draw_rect(r, Color(0, 0, 0, 0.55))
	var fill := Palette.SPARK_FILL if not Sim.in_ember_zone() else Color("#c8643c")
	draw_rect(Rect2(r.position, Vector2(r.size.x * clampf(f, 0, 1), r.size.y)), fill)
	draw_rect(r, Palette.SPARK_OUTLINE, false, 2.0)
	draw_string(get_theme_default_font(), Vector2(20, 50), "Spark %d" % Sim.spark, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Palette.SPARK_OUTLINE)
