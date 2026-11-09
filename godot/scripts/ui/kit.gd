## One look: a single panel and chip style for every control.
class_name Kit
extends RefCounted

static func panel_box(alpha: float = 0.92) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.106, 0.102, 0.098, alpha)
	sb.border_color = Color("#5a5148")
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(8)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	return sb

static func chip(text: String, min_w: float = 0.0) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(min_w, 40)
	b.add_theme_font_size_override("font_size", 15)
	var n := panel_box()
	n.set_corner_radius_all(20)
	var h := n.duplicate()
	h.bg_color = Color("#3a332c")
	h.border_color = Palette.SPARK_FILL
	b.add_theme_stylebox_override("normal", n)
	b.add_theme_stylebox_override("hover", h)
	b.add_theme_stylebox_override("pressed", h)
	b.add_theme_color_override("font_color", Palette.PAPER)
	return b

static func label(text: String, size: int = 15, color: Color = Palette.PAPER) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_outline_color", Palette.INK)
	l.add_theme_constant_override("outline_size", 4)
	return l
