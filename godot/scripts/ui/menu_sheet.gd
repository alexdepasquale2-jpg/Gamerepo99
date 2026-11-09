## Pause menu and end screens: one slim side sheet, the world stays visible.
class_name MenuSheet
extends Control

signal action(id: String)
var box: VBoxContainer
var title: Label

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	visible = false
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", Kit.panel_box(0.95))
	panel.set_anchors_preset(Control.PRESET_RIGHT_WIDE)
	panel.offset_left = -320
	add_child(panel)
	box = VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	panel.add_child(box)

func show_menu(heading: String, body: String, options: Array) -> void:
	for c in box.get_children():
		c.queue_free()
	box.add_child(Kit.label(heading, 22, Palette.SPARK_FILL))
	if body != "":
		var b := Kit.label(body, 14)
		b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		box.add_child(b)
	for o in options:
		var chip := Kit.chip(o[1])
		chip.pressed.connect(func(): action.emit(o[0]))
		box.add_child(chip)
	visible = true

func hide_menu() -> void:
	visible = false
