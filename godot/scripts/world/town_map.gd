## Draws one town from towns.json: ground, paths from the square to every site, a house per site,
## the hearth and the signpost. Colours follow the town's warmth (Palette ramps).
class_name TownMap
extends Node2D

const TILE := 32
const BORDER := 3

var town: Dictionary = {}
var cols := 0
var rows := 0
var warmth := 0.5
var path_tiles: Dictionary = {}
var water_tiles: Dictionary = {}
var trees: Array = []
var buildings: Array = []  # Rect2 in world px
var hearth_pos := Vector2.ZERO
var signpost_pos := Vector2.ZERO
var site_pos: Dictionary = {}  # site id -> Vector2 (door foot)

func build(t: Dictionary, world_seed: int) -> void:
	town = t
	cols = int(t.mapWidth) + BORDER * 2
	rows = int(t.mapHeight) + BORDER * 2
	path_tiles.clear()
	water_tiles.clear()
	trees.clear()
	buildings.clear()
	site_pos.clear()
	var hub := Vector2i(cols / 2, rows / 2)
	for s in t.sites:
		if s.personId == null:
			hub = _cell(s)
	hearth_pos = foot(hub)
	var sign_cell := Vector2i(cols - 2, hub.y)
	signpost_pos = foot(sign_cell)
	_lay_path(hub, sign_cell)
	for s in t.sites:
		var c := _cell(s)
		site_pos[s.id] = foot(c)
		_lay_path(hub, c)
		if s.personId != null:
			buildings.append(Rect2((c.x - 1) * TILE, (c.y - 3) * TILE, TILE * 3, TILE * 2 + 8))
	if str(t.id).contains("lowmere") or str(t.get("name", "")).contains("Strand"):
		for x in cols:
			for y in range(rows - 3, rows):
				water_tiles[Vector2i(x, y)] = true
	var r := SeedRng.derive(world_seed, ["scatter", t.id])
	for i in int(cols * rows * 0.06):
		var c := Vector2i(r.int_range(0, cols), r.int_range(0, rows))
		var p := foot(c)
		if path_tiles.has(c) or water_tiles.has(c) or _in_building(p) or p.distance_to(hearth_pos) < TILE * 2:
			continue
		var near_site := false
		for sp in site_pos.values():
			if p.distance_to(sp) < TILE * 1.5:
				near_site = true
		if not near_site:
			trees.append(p)
	queue_redraw()

func _cell(s: Dictionary) -> Vector2i:
	return Vector2i(int(s.x) + BORDER, int(s.y) + BORDER)

func foot(c: Vector2i) -> Vector2:
	return Vector2(c.x * TILE + TILE / 2.0, c.y * TILE + TILE / 2.0)

func size_px() -> Vector2:
	return Vector2(cols * TILE, rows * TILE)

func _lay_path(a: Vector2i, b: Vector2i) -> void:
	var x := a.x
	while x != b.x:
		path_tiles[Vector2i(x, a.y)] = true
		x += signi(b.x - a.x)
	var y := a.y
	while y != b.y:
		path_tiles[Vector2i(b.x, y)] = true
		y += signi(b.y - a.y)
	path_tiles[b] = true

func _in_building(p: Vector2) -> bool:
	for b in buildings:
		if b.has_point(p):
			return true
	return false

## Walkable: inside the map, not in a house or tree trunk, not in water.
func passable(p: Vector2) -> bool:
	if p.x < 8 or p.y < 8 or p.x > cols * TILE - 8 or p.y > rows * TILE - 8:
		return false
	if water_tiles.has(Vector2i(int(p.x / TILE), int(p.y / TILE))):
		return false
	for tr in trees:
		if p.distance_to(tr) < 10:
			return false
	return not _in_building(p)

func set_warmth(w: float) -> void:
	warmth = w
	queue_redraw()

func _draw() -> void:
	var soil := Palette.ramp(Palette.SOIL, warmth)
	var path := Palette.ramp(Palette.PATH, warmth)
	var water := Palette.ramp(Palette.WATER, warmth)
	var leaf := Palette.ramp(Palette.FOLIAGE, warmth)
	var wall := Palette.ramp(Palette.BUILDING, warmth)
	draw_rect(Rect2(Vector2.ZERO, size_px()), soil)
	for c in path_tiles:
		draw_rect(Rect2(c.x * TILE, c.y * TILE, TILE, TILE), path)
	for c in water_tiles:
		draw_rect(Rect2(c.x * TILE, c.y * TILE, TILE, TILE), water)
	for b in buildings:
		draw_rect(b, wall)
		draw_rect(Rect2(b.position.x - 4, b.position.y - 10, b.size.x + 8, 14), wall.darkened(0.35))
		var door := Rect2(b.position.x + b.size.x / 2 - 7, b.end.y - 20, 14, 20)
		draw_rect(door, wall.darkened(0.5))
		var lit := Color("#f2c46b").lerp(wall.darkened(0.3), 1.0 - warmth)
		draw_rect(Rect2(b.position.x + 10, b.position.y + 14, 14, 12), lit)
		draw_rect(Rect2(b.end.x - 24, b.position.y + 14, 14, 12), lit)
	for tr in trees:
		draw_rect(Rect2(tr.x - 3, tr.y - 6, 6, 10), wall.darkened(0.4))
		draw_circle(tr + Vector2(0, -16), 13, leaf)
	# Hearth: stone ring and a fire that grows with the town's warmth.
	draw_circle(hearth_pos, 15, Color("#5b5650"))
	draw_circle(hearth_pos, 10, Color("#2b2522"))
	draw_circle(hearth_pos + Vector2(0, -3), 3 + 7 * warmth, Palette.SPARK_FILL)
	# Signpost
	draw_rect(Rect2(signpost_pos.x - 2, signpost_pos.y - 26, 4, 28), Color("#6b5137"))
	draw_rect(Rect2(signpost_pos.x - 16, signpost_pos.y - 28, 30, 9), Color("#8a6a48"))
