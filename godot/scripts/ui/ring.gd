## The ring: at most 6 chips around the focused thing. Verb families first; a family opens its verbs.
## One way to act on anything, two taps or fewer.
class_name Ring
extends Control

signal chosen(verb_id: String)
signal closed

const MAX_CHIPS := 6
var center := Vector2.ZERO
var stack: Array = []

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	visible = false
	mouse_filter = Control.MOUSE_FILTER_STOP

func is_open() -> bool:
	return visible

func open(at: Vector2, verbs: Array) -> void:
	center = at
	stack = [verbs]
	visible = true
	_layout()

func close() -> void:
	if not visible:
		return
	visible = false
	for c in get_children():
		c.queue_free()
	closed.emit()

func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.pressed:
		close()
		accept_event()

func _layout() -> void:
	for c in get_children():
		c.queue_free()
	var verbs: Array = stack[-1].duplicate()
	if stack.size() > 1:
		verbs = verbs.slice(0, MAX_CHIPS - 1)
		verbs.push_front({"id": "_back", "label": "‹ Back"})
	else:
		verbs = verbs.slice(0, MAX_CHIPS)
	var n := verbs.size()
	var radius := 86.0 if n > 2 else 60.0
	var vp := get_viewport_rect().size
	var c := Vector2(clampf(center.x, radius + 80, vp.x - radius - 80), clampf(center.y, radius + 30, vp.y - radius - 80))
	for i in n:
		var v: Dictionary = verbs[i]
		var b := Kit.chip(v.label, 96)
		var ang := -PI / 2 + TAU * i / n
		b.position = c + Vector2(cos(ang), sin(ang)) * radius - Vector2(60, 20)
		b.size = Vector2(120, 40)
		b.pressed.connect(_pick.bind(v))
		add_child(b)

func _pick(v: Dictionary) -> void:
	if v.id == "_back":
		stack.pop_back()
		_layout()
	elif v.has("children"):
		stack.append(v.children)
		_layout()
	else:
		close()
		chosen.emit(v.id)
