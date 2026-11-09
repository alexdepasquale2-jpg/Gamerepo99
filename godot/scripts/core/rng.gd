## Mulberry32 seeded RNG, bit-for-bit the same stream as game/src/sim/rng.ts.
## Never use randf()/randi() in the sim: derive a stream from the seed and labels instead.
class_name SeedRng
extends RefCounted

const MASK := 0xFFFFFFFF
var state: int = 0

func _init(s: int = 0) -> void:
	state = s & MASK

## Math.imul for unsigned 32-bit values, without 64-bit overflow.
static func imul(a: int, b: int) -> int:
	a &= MASK
	b &= MASK
	var lo := (a * (b & 0xFFFF)) & MASK
	var hi := ((a * (b >> 16)) & 0xFFFF) << 16
	return (lo + hi) & MASK

func next() -> float:
	state = (state + 0x6d2b79f5) & MASK
	var t := state
	t = imul(t ^ (t >> 15), t | 1)
	t = (t ^ ((t + imul(t ^ (t >> 7), t | 61)) & MASK)) & MASK
	return float((t ^ (t >> 14)) & MASK) / 4294967296.0

## Integer in [lo, hi).
func int_range(lo: int, hi: int) -> int:
	if hi <= lo:
		return lo
	return lo + int(floor(next() * (hi - lo)))

func pick(arr: Array):
	if arr.is_empty():
		return null
	return arr[int_range(0, arr.size())]

## deriveRng(seed, ...parts): FNV-1a over parts joined with '|'.
static func derive(s: int, parts: Array) -> SeedRng:
	var h := (0x811c9dc5 ^ (s & MASK)) & MASK
	var joined := "|".join(parts.map(func(p): return str(p)))
	for i in joined.length():
		h ^= joined.unicode_at(i)
		h = imul(h, 0x01000193)
	return SeedRng.new(h)
