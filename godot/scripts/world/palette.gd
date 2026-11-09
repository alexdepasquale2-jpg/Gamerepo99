## Material ramps from docs/art/PALETTE.md: index 0 despair, 9 fully alive.
## Despair is a palette shift on the town, never an overlay.
class_name Palette
extends RefCounted

const SOIL := ["#2A2A28", "#34322C", "#3E3A30", "#4A4638", "#586040", "#6A7848", "#7A9050", "#6B9A40", "#5AAA38", "#4CB038"]
const PATH := ["#3A3836", "#45413C", "#524C44", "#5E564C", "#6A6256", "#7A7060", "#8A7E6A", "#9A8A70", "#A89068", "#B89860"]
const FOLIAGE := ["#2A3028", "#323A30", "#3A4436", "#465240", "#54644C", "#647858", "#789064", "#8CAC70", "#9CC878", "#A8D880"]
const WATER := ["#243038", "#2A3840", "#344850", "#3E5860", "#486870", "#547880", "#608890", "#6C98A0", "#78A8A8", "#84B8B0"]
const BUILDING := ["#3A3838", "#464240", "#524C48", "#5E5650", "#6A6058", "#786A60", "#867468", "#947E70", "#A28878", "#B09280"]

const SPARK_FILL := Color("#F2B84B")
const SPARK_OUTLINE := Color("#5EC8C8")
const INK := Color("#1b1a19")
const PAPER := Color("#f3ead8")

static func ramp(stops: Array, warmth: float) -> Color:
	var w := clampf(warmth, 0.0, 1.0) * (stops.size() - 1)
	var i := int(floor(w))
	if i >= stops.size() - 1:
		return Color(stops[stops.size() - 1])
	return Color(stops[i]).lerp(Color(stops[i + 1]), w - i)
