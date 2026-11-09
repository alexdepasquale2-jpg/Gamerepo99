## The inhabitant: WASD/arrows, or tap/click the ground to walk there.
class_name PlayerActor
extends Node2D

const SPEED := 150.0
var map: TownMap
var walk_target = null
var facing := Vector2.DOWN
var frozen := false

func _process(dt: float) -> void:
	if frozen:
		return
	var dir := Vector2.ZERO
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT): dir.x -= 1
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT): dir.x += 1
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP): dir.y -= 1
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN): dir.y += 1
	if dir != Vector2.ZERO:
		walk_target = null
	elif walk_target != null:
		var to: Vector2 = walk_target - position
		if to.length() < 3.0:
			walk_target = null
		else:
			dir = to
	if dir == Vector2.ZERO:
		return
	dir = dir.normalized()
	facing = dir
	var step := dir * SPEED * dt
	# Slide along walls: try each axis on its own.
	if map.passable(position + Vector2(step.x, 0)):
		position.x += step.x
	elif walk_target != null:
		walk_target = null
	if map.passable(position + Vector2(0, step.y)):
		position.y += step.y
	z_index = int(position.y)
	queue_redraw()

func walk_to(p: Vector2) -> void:
	walk_target = p

func _draw() -> void:
	var glow := Palette.SPARK_FILL
	glow.a = 0.18 + 0.25 * float(Sim.spark) / float(Sim.spark_max)
	draw_circle(Vector2(0, -20), 22, glow)
	draw_circle(Vector2(0, 0), 9, Color(0, 0, 0, 0.25))
	draw_rect(Rect2(-7, -26, 14, 24), Color("#3c4f63"))
	draw_circle(Vector2(0, -32), 7, Color("#e0bc96"))
	draw_circle(Vector2(0, -16), 3, Palette.SPARK_FILL)
