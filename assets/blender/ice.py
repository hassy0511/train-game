"""Stage 4-1 (こおりのみずうみ) — Claude Code. Ticket 0015.

The crafted look (つくりこみ) of chapters 1-3 (sky.py, volcano.py and harbour.py, whose helpers this script uses): flat
colours (the game bakes each model into one draw call), round friendly shapes. A frozen lake in a snowy basin on a bright
day: white snow shading to pale blue and a light lilac, ice in pale blues, never dark or cold-looking. Snow, ice and the
white birds have about 0.6 of their own colour as light (GLOW; the game's snowy ground glows too), so they stay white
and pale blue on their shaded side instead of turning grey. The animals are round with eyes only (no mouth, no nose, no whiskers; the snowbird has
its small orange beak and feet); nothing is modelled on a real hut, sign, tunnel or mountain.

Models (same names, sizes, origins and orientation as the code stand-ins they replace, so the stage JSON does not
change; origin at the bottom centre, +Z forward, the model's own left is +X):
- snow-pine 5 x 8.45 x 5 (about 220 in 4-1, 200 in 4-2, 190 in 4-3 where some stand 5 times as big far off, 80 in 6-2):
  a short trunk and three tiers of drooping branches, each capped by a soft snow pillow whose lip hangs down at the
  branch tips. Under 150 triangles.
- snow-bank 7 x 1.6 x 4 (shores in 4-1, 4-2, 4-3 and 6-2; the "snow cushion" over a buffer stop, its 7 m across the
  track): a soft mound with two humps, white on top, pale blue on its sides and lilac at its foot.
- snow-island 120 x 0.15 x 84: the flat snow of こじま over the ice; its top is never above y 0.15 (the track's bed shows
  over it), its edge a soft pale-blue bank.
- snow-mountain 380 x 176 x 380: every vertex lies on the stand-in's profile (radius 190 at y 0, 150 at 35, 110 at 80,
  70 at 122, 35 at 155, 8 at 170, the top at 176), so what 4-3 stands on its little copy (scripts/layout-4-3.mjs
  hillY) stays on it. The rings are only turned against each other (facets); grey rock shows in bands on the steep
  upper slopes and a few rocks stand round the summit, where nothing is put.
- tunnel-mouth 11 x 10.5 x 4: the mouth +Z; a stone arch of rounded blocks, the tunnel going in soft blue-grey (not
  black), snow lying on the arch and the pillars.
- ice-hut, ice-hut-b, ice-hut-c 4.7 x 5.7 x 4.8: round fishing huts (coral, yellow, sky-blue planks), a snow dome roof
  with a lip, the door +Z, a round window, a stovepipe and a little red flag (no letters, no marks). Origin on the
  drum's axis.
- ice-hole 2.86 x 0.16 x 2.86: blue water in a white rim of ice.
- ice-wall 20.4 x 15.25 x 3.6: the canyon's walls; the broad faces +-Z stand at z +-1.8 (4-1 sets record 3's shelf
  against one at 9 m up), faceted in slightly different pale blues, snow on top with a hanging lip; its ends narrow a
  little, so walls side by side read as separate blocks.
- seal-sleep 1.57 x 1.02 x 3.02 (asleep on the rail: head down, eyes closed lines) and seal 1.57 x 1.36 x 2.97 (awake:
  head up, round eyes); head +Z.
- snowbird 0.96 x 1.08 x 1.24: a round white bird, head +Z, wings a little out (it waddles across the track in a row and
  circles in a flock), orange beak and feet.
- Records frost-flower 1.43 x 0.55 x 1.5, glow-shell 1 x 0.62 x 0.93 (its pearl glows), ice-bell 1.4 x 1.27 x 1 (a record
  with no rotation stands with +X toward the track, so the shelf's back, -X, goes against the wall).
- sign-ice, sign-thin-ice 1.4 x 3.28 x 0.26: as 2-3's signs (volcano.py), the picture +Z, a snow cap on the board.
Output: public/models/<name>.glb and assets/previews/<name>.png.
Run: python3 scripts/run-bpy.py assets/blender/ice.py [-- name ...]
"""
from __future__ import annotations

from pathlib import Path
import math
import random
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import sky as s  # noqa: E402  (chapter 1's crafted helpers: fix_normals, ring_faces, plate, outline, pebble...)
import volcano as v  # noqa: E402  (chapter 2's: Paint, painted, lathe, ellipsoid, sticker, eye, sign_base, preview...)
import river as rv  # noqa: E402  (chapter 3's clay: painted_clay, recolour)
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

TAU = 2 * math.pi
hexmix = v.hexmix
hash01 = v.hash01

# ---------------------------------------------------------------- palette (ticket 0015)

SNOW, SNOW_SHADE, SNOW_LILAC, SNOW_BLUE = "#FBFDFF", "#DCE6F2", "#D6D3EC", "#E9F1F9"
PINE, PINE_DARK, PINE_LIGHT, TRUNK, TRUNK_DARK = "#4F8F74", "#3E7662", "#5C9C80", "#8A6A4E", "#735740"
ICE, ICE_DEEP, ICE_EDGE, ICE_MID, ICE_LIGHT = "#CFEAF6", "#A9D7EE", "#E9F6FC", "#BCE1F2", "#DDF1FA"
WATER, WATER_DEEP = "#5FB6DC", "#4AA3CF"
STONE, STONE_DARK, STONE_LIGHT, TUNNEL_IN, TUNNEL_DEEP = "#B7B2AE", "#9A948F", "#C9C5C1", "#5E6F82", "#53637A"
HUT_WALLS = {"ice-hut": "#F28B6B", "ice-hut-b": "#F5C35B", "ice-hut-c": "#7FC6E8"}
DOOR, DOOR_DARK, FLAG, POLE, PIPE, WINDOW = "#6B4E3A", "#5A412F", "#FF6B6B", "#8A8F96", "#9AA1A9", "#BFE6FF"
SEAL, SEAL_BELLY, SEAL_SPOT, SEAL_FLIPPER = "#C9D1DB", "#EEF2F6", "#AEB9C6", "#B7C2CF"
EYE, EYE_SHINE = "#2B3A4A", "#FFFFFF"
BIRD, BIRD_SHADE, BIRD_WING, BEAK, FEET = "#FFFFFF", "#E6ECF3", "#C7D3E0", "#FF9F43", "#F4A259"
FLOWER, FLOWER_TIP, FLOWER_MID = "#F4FAFF", "#B9DDF3", "#E2F1FB"
SHELL, SHELL_RIB, SHELL_INSIDE, PEARL = "#F7E3EC", "#EBC9D9", "#FBF0F4", "#FFF6D6"
SHELF, SHELF_LIGHT, BELL, BELL_RIM, BELL_DARK = "#CBE8F5", "#E1F3FB", "#6F7F92", "#8F9DB0", "#56636F"
SIGN_BOARD, SIGN_FRAME, FLAKE, CRACK, THIN_BOARD = "#DFF3FC", "#4A9CC9", "#2F86C0", "#FFFFFF", "#8CC3E0"
ROCKET_BODY, ROCKET_NOSE, ROCKET_FLAME, ROCKET_DARK = "#F7F3EA", "#FF7A45", "#FFB84D", "#3A3F47"

SNOW_PATCH = "#F2F6FB"

# A good deal of their own colour as light. The game lights physically: its sky light gives a white face that the sun
# does not reach only about a quarter of its colour, so snow, ice and white birds would turn grey on their shaded side.
# With about 0.6 of their colour as light they stay as white (and ice as pale blue) as the game's snowy ground, which
# glows too; the side the sun reaches is a little brighter still, and the paler and deeper shades give the form.
GLOW = {SNOW: 0.6, SNOW_BLUE: 0.55, SNOW_PATCH: 0.58, SNOW_SHADE: 0.5, SNOW_LILAC: 0.42,
        ICE: 0.55, ICE_LIGHT: 0.58, ICE_MID: 0.52, ICE_DEEP: 0.48, ICE_EDGE: 0.6, WATER: 0.3, WATER_DEEP: 0.25,
        PINE: 0.14, PINE_LIGHT: 0.14, PINE_DARK: 0.1, TRUNK: 0.12,
        STONE: 0.28, STONE_LIGHT: 0.28, STONE_DARK: 0.3, TUNNEL_IN: 0.5, TUNNEL_DEEP: 0.42,
        DOOR: 0.12, FLAG: 0.25, POLE: 0.16, PIPE: 0.16, WINDOW: 0.45,
        SEAL: 0.36, SEAL_BELLY: 0.42, SEAL_SPOT: 0.3, SEAL_FLIPPER: 0.3, EYE: 0.0,
        BIRD: 0.6, BIRD_SHADE: 0.5, BIRD_WING: 0.4, BEAK: 0.25, FEET: 0.2,
        FLOWER: 0.38, FLOWER_TIP: 0.3, FLOWER_MID: 0.36,
        SHELL: 0.3, SHELL_RIB: 0.28, SHELL_INSIDE: 0.36, PEARL: 1.0,
        SHELF: 0.55, SHELF_LIGHT: 0.6, BELL: 0.14, BELL_RIM: 0.2, BELL_DARK: 0.05,
        SIGN_BOARD: 0.42, THIN_BOARD: 0.3, SIGN_FRAME: 0.14, FLAKE: 0.14, CRACK: 0.45,
        ROCKET_BODY: 0.3, ROCKET_NOSE: 0.22, ROCKET_FLAME: 0.45, ROCKET_DARK: 0.0}
for _wall in HUT_WALLS.values():
    GLOW[_wall] = 0.24


def paints(roughness, **extra):
    """The flat colour materials of a model, each glowing by GLOW (plus `extra`, hex -> amount)."""
    return v.Paint(roughness, glow=glow(GLOW, extra))


def glow(*tables, **extra):
    out: dict = {}
    for t in tables:
        out.update(t)
    out.update(extra)
    return out


# ---------------------------------------------------------------- small helpers (glTF coordinates)

def closed(parts, name, verts, faces, paint, colours, smooth=False):
    """v.painted for a closed part: faces wound outward, a colour per face (list) or colour(centre, normal)."""
    return v.painted(parts, name, verts, faces, paint, colours, smooth=smooth)


def ring_pts(cx, cz, y, radius, n, phase=0.0, sx=1.0, sz=1.0):
    return [(cx + math.cos(phase + TAU * i / n) * radius * sx, y, cz + math.sin(phase + TAU * i / n) * radius * sz) for i in range(n)]


def stack(rings, top=None, cap_bottom=True):
    """Vertices and faces of a closed body through rings of equal length (bottom first), closed by a point `top` or a
    flat cap, and a flat bottom cap. Also returns a tag per face: ("band", r, j), ("top", j), ("cap_top",) or
    ("bottom",)."""
    n = len(rings[0])
    verts = [p for r in rings for p in r]
    faces, tags = [], []
    for r in range(len(rings) - 1):
        for j in range(n):
            faces.append((r * n + j, r * n + (j + 1) % n, (r + 1) * n + (j + 1) % n, (r + 1) * n + j))
            tags.append(("band", r, j))
    last = (len(rings) - 1) * n
    if top is not None:
        verts.append(top)
        t = len(verts) - 1
        for j in range(n):
            faces.append((last + j, last + (j + 1) % n, t))
            tags.append(("top", j))
    else:
        faces.append(tuple(range(last, last + n)))
        tags.append(("cap_top",))
    if cap_bottom:
        faces.append(tuple(range(n - 1, -1, -1)))
        tags.append(("bottom",))
    return verts, faces, tags


def lump(parts, name, size, center, paint, colour, seed, rough=0.12, sub=1):
    """A faceted lump (jittered icosphere) in one colour, cut flat at y 0 when it reaches under it."""
    obj = v.lumpy_stone(parts, name, size, center, paint(colour), paint(colour), seed, sub=sub, rough=rough)
    if center[1] - size[1] / 2 < 0:
        v.cut_below(obj)
    return obj


# ---------------------------------------------------------------- snow pine

def pine_tier(parts, paint, name, y0, h, r, n, phase, edge_t=0.36, bulge_t=0.62):
    """One tier: a wide skirt of drooping branches (the rim alternates between the branch tips, further out and lower,
    and the notches between them), capped by a snow pillow: its edge stands a little proud of the branches and dips at
    the tips like snow hanging over, it bulges out and closes in a point."""
    rim, edge, bulge = [], [], []
    for i in range(n):
        a = phase + TAU * i / n
        tip = i % 2 == 0
        rr = r if tip else r * 0.76
        rim.append((math.cos(a) * rr, y0 + (0.0 if tip else 0.3 * h / 3), math.sin(a) * rr))
        re = r * (0.6 if tip else 0.5)
        edge.append((math.cos(a) * re, y0 + h * edge_t + (-0.32 * h / 3 if tip else 0.12 * h / 3), math.sin(a) * re))
        rb = r * 0.42
        bulge.append((math.cos(a + TAU / n / 2) * rb, y0 + h * bulge_t, math.sin(a + TAU / n / 2) * rb))
    verts, faces, tags = stack([rim, edge, bulge], top=(0.0, y0 + h, 0.0))

    def colour(idx):
        tag = tags[idx]
        if tag[0] == "bottom":
            return PINE_DARK
        if tag[0] == "band" and tag[1] == 0:
            return PINE if tag[2] % 2 == 0 else PINE_LIGHT
        if tag[0] == "band":
            return SNOW_BLUE
        return SNOW

    closed(parts, name, verts, faces, paint, [colour(i) for i in range(len(faces))],
           smooth=lambda c, nrm: False)


def snow_pine():
    """ゆきの まつ: a short trunk, three tiers of branches each under a pillow of snow (the lowest the widest), a point
    of snow on top. The tiers are turned against each other so the branch tips do not line up."""
    paint = paints(0.9)
    parts: list = []
    trunk = [ring_pts(0, 0, 0.0, 0.34, 5, 0.3), ring_pts(0, 0, 1.7, 0.26, 5, 0.3)]
    verts, faces, tags = stack(trunk)
    # The trunk's top is inside the lowest tier: no cap there.
    faces = [f for f, tag in zip(faces, tags) if tag[0] != "cap_top"]
    obj = k.add_mesh(parts, "trunk", verts, faces, [paint(TRUNK)])
    s.fix_normals(obj)
    pine_tier(parts, paint, "tier-1", 1.15, 3.3, 2.5, 8, 0.0)
    pine_tier(parts, paint, "tier-2", 3.35, 2.9, 1.95, 8, TAU / 16)
    pine_tier(parts, paint, "tier-3", 5.4, 3.05, 1.3, 6, TAU / 12)
    return parts, 150


# ---------------------------------------------------------------- snow bank

def snow_bank():
    """ゆきの もりあがり: a soft low mound, 7 x 1.6 x 4, two gentle humps along its length, white on top, pale blue on its
    sides and a light lilac at its foot (smooth, like a pillow of snow)."""
    paint = paints(0.95)
    n = 14
    rng = random.Random(41)
    wob = [1.0 + rng.uniform(-0.05, 0.05) for _ in range(n)]

    def height(x, z):
        # Two humps along x.
        return 0.72 + 0.28 * math.exp(-((x - 1.3) / 1.9) ** 2) + 0.22 * math.exp(-((x + 1.6) / 1.6) ** 2)

    rings = []
    for f, yk in ((1.0, 0.0), (0.93, 0.32), (0.74, 0.78), (0.42, 0.97)):
        ring = []
        for i in range(n):
            a = TAU * i / n
            x, z = math.cos(a) * 3.5 * f * wob[i], math.sin(a) * 2.0 * f * wob[i]
            ring.append((x, yk * height(x, z) * 1.6 if yk else 0.0, z))
        rings.append(ring)
    verts, faces, tags = stack(rings, top=(0.0, 1.02 * height(0.0, 0.0) * 1.6, 0.0))

    def colour(idx):
        tag = tags[idx]
        if tag[0] == "bottom" or (tag[0] == "band" and tag[1] == 0):
            return SNOW_LILAC
        if tag[0] == "band" and tag[1] == 1:
            return SNOW_SHADE
        return SNOW

    parts: list = []
    closed(parts, "bank", verts, faces, paint, [colour(i) for i in range(len(faces))], smooth=lambda c, nrm: nrm.y > -0.9)
    return parts, 120


# ---------------------------------------------------------------- snow island

def snow_island():
    """こじま: a flat oval of snow over the ice, 120 x 84, its outline softly lobed; the edge a low pale-blue bank, the top
    flat at y 0.15 with faint blue-white patches (the track's bed lies over it)."""
    paint = paints(0.95)
    n = 24
    pts = s.outline(120.0, 84.0, n, 52, lobe=0.035, power=2.0)
    nrm = s.outward_normals(pts)

    def ring(inset, y):
        return [(x - inset * nx, y, z - inset * nz) for (x, z), (nx, nz) in zip(pts, nrm)]

    inner = [(x * 0.6, 0.15, z * 0.6) for x, z in pts]
    verts, faces, tags = stack([ring(0.0, 0.0), ring(1.4, 0.1), ring(3.2, 0.15), inner], top=(0.0, 0.15, 0.0))

    def colour(idx):
        tag = tags[idx]
        if tag[0] == "bottom" or (tag[0] == "band" and tag[1] == 0):
            return SNOW_SHADE
        if tag[0] == "band" and tag[1] == 2:
            return SNOW_PATCH if tag[2] % 3 == 0 else SNOW
        if tag[0] == "top":
            return SNOW_PATCH if tag[1] % 5 == 2 else SNOW
        return SNOW

    parts: list = []
    closed(parts, "island", verts, faces, paint, [colour(i) for i in range(len(faces))], smooth=lambda c, nrm: False)
    return parts, 200


# ---------------------------------------------------------------- ice hole

def ice_hole():
    """つりの あな: a round hole in the ice, 2.86 m across: a low white rim of ice round blue water, deeper blue in the
    middle, and a little chip of ice floating in it."""
    paint = paints(0.6)
    n = 12
    rings = [ring_pts(0, 0, 0.0, 1.43, n), ring_pts(0, 0, 0.16, 1.27, n, TAU / 24), ring_pts(0, 0, 0.05, 1.08, n)]
    verts, faces, tags = stack(rings, top=(0.0, 0.02, 0.0))

    def colour(idx):
        tag = tags[idx]
        if tag[0] == "top":
            return WATER
        if tag[0] == "band" and tag[1] == 1:
            return ICE
        return ICE_EDGE

    parts: list = []
    closed(parts, "hole", verts, faces, paint, [colour(i) for i in range(len(faces))], smooth=lambda c, nrm: False)
    s.pyramid(parts, "chip", (0.42, 0.03, -0.18), (0.45, 0.1, -0.16), (0.12, 0.0, 0.03), (-0.02, 0.0, 0.1), paint(ICE_EDGE))
    return parts, 80


# ---------------------------------------------------------------- snow mountain

MOUNTAIN = [(190.0, 0.0), (150.0, 35.0), (110.0, 80.0), (70.0, 122.0), (35.0, 155.0), (8.0, 170.0), (0.0, 176.0)]


def snow_mountain():
    """ゆきやま: a big round snowy mountain far off. Its rings lie exactly on the stand-in's profile (MOUNTAIN, a midway
    ring on each of the lower slopes), each turned a little against the next, so the slopes break into soft facets
    without leaving the profile. White snow with pale blue facets, lilac at the foot; grey rock showing through in
    uneven patches on the steep upper slopes (coloured triangle by triangle, so the patches have ragged edges) and
    three rocks standing out round the summit."""
    paint = paints(0.95)
    rng = random.Random(61)
    n = 24
    spec = []
    for (r0, y0), (r1, y1) in zip(MOUNTAIN, MOUNTAIN[1:-1]):
        spec.append((r0, y0))
        if y0 < 150:
            spec.append(((r0 + r1) / 2, (y0 + y1) / 2))
    spec.append(MOUNTAIN[-2])
    rings = []
    for j, (r, y) in enumerate(spec):
        phase = 0.0 if j == 0 else rng.uniform(-0.45, 0.45) * TAU / n
        rings.append(ring_pts(0.0, 0.0, y, r, n, phase))
    verts = [p for ring in rings for p in ring]
    faces = []
    for r in range(len(rings) - 1):
        for j in range(n):
            a, b, c, d = r * n + j, r * n + (j + 1) % n, (r + 1) * n + (j + 1) % n, (r + 1) * n + j
            faces += [(a, b, c), (a, c, d)] if (j + r) % 2 else [(a, b, d), (b, c, d)]
    verts.append((0.0, MOUNTAIN[-1][1], 0.0))
    last = (len(rings) - 1) * n
    faces += [(last + j, last + (j + 1) % n, len(verts) - 1) for j in range(n)]
    faces.append(tuple(range(n - 1, -1, -1)))

    def colour(c, nrm):
        if nrm.y < -0.9:
            return SNOW_LILAC
        a = math.atan2(c.z, c.x)
        if c.y < 22.0:
            return SNOW_LILAC if hash01(round(a * 7), round(c.y)) < 0.7 else SNOW_SHADE
        rock = 0.5 * math.sin(3 * a + c.y / 26.0) + 0.35 * math.sin(7 * a - c.y / 17.0 + 1.3) + 0.25 * math.sin(11 * a + c.y / 9.0 + 2.1)
        if 62.0 < c.y < 166.0 and rock > 0.62 - (c.y - 62.0) / 104.0 * 0.32:
            return STONE_DARK if rock > 0.95 else STONE
        if c.y < 40.0 and hash01(round(a * 9), round(c.y / 3)) < 0.35:
            return SNOW_SHADE
        return SNOW_BLUE if hash01(round(a * 11), round(c.y / 5)) < 0.16 else SNOW

    parts: list = []
    closed(parts, "mountain", verts, faces, paint, colour, smooth=lambda c, nrm: False)
    # Three rocks standing out of the snow round the summit (nothing is ever put up there).
    for i, (a, rr, size) in enumerate(((0.6, 28.0, 20.0), (2.9, 22.0, 16.0), (4.6, 31.0, 22.0))):
        y = 155.0 + (35.0 - rr) * (15.0 / 27.0)
        lump(parts, f"rock-{i}", (size, size * 0.7, size * 0.85), (math.cos(a) * rr, y, math.sin(a) * rr), paint, STONE_LIGHT if i == 1 else STONE,
             70 + i, rough=0.18)
    return parts, 600


# ---------------------------------------------------------------- ice wall

WALL_W, WALL_H, WALL_D = 20.4, 15.25, 3.6


def ice_wall():
    """こおりの かべ: a slab of ice 20.4 m long, its broad faces (+-Z) at z +-1.8 broken into tall facets in slightly
    different pale blues (deeper near the foot, lighter up high), a rounded top under a pillow of snow whose lip hangs
    over both faces in drips. Its ends narrow and come down a little, so walls in a row read as blocks of ice."""
    paint = paints(0.45)
    rng = random.Random(83)
    xs = [-WALL_W / 2, -7.3, -3.5, 0.2, 3.9, 7.4, WALL_W / 2]
    half = WALL_D / 2
    sections = []
    for i, x in enumerate(xs):
        end = i in (0, len(xs) - 1)
        squeeze, drop = (0.78, 0.94) if end else (1.0, 1.0)
        drip = 0.45 if i % 2 else 0.0
        front = [(0.0, half), (4.6, half + rng.uniform(-0.16, 0.12)), (9.0, half + rng.uniform(-0.05, 0.05)), (12.7, half - 0.2),
                 (13.45 - drip, half + 0.0), (14.75, half * 0.66)]
        back = [(0.0, -half), (4.6, -half - rng.uniform(-0.16, 0.12)), (9.0, -half - rng.uniform(-0.05, 0.05)), (12.7, -half + 0.2),
                (13.45 - (0.45 - drip), -half), (14.75, -half * 0.66)]
        outline = front + [(WALL_H, 0.0)] + back[::-1]
        sections.append([(x, y * drop, z * squeeze) for y, z in outline])
    m = len(sections[0])
    verts = [p for sec in sections for p in sec]
    faces, cols = [], []
    ice_tones = [ICE_DEEP, ICE_MID, ICE, ICE_LIGHT]
    for i in range(len(xs) - 1):
        a, b = i * m, (i + 1) * m
        for j in range(m):
            jn = (j + 1) % m
            faces.append((a + j, b + j, b + jn, a + jn))
            # Bands round the outline: 0-2 / 9-11 ice faces (by height), 3 / 8 under the lip, 4-7 snow, 12 the bottom.
            band = min(j, m - 2 - j) if j < m - 1 else -1
            if j == m - 1:
                cols.append(ICE_DEEP)
            elif band <= 2:
                tone = band + (1 if hash01(i, j) > 0.55 else 0) - (1 if hash01(j, i, 3) > 0.8 else 0)
                cols.append(ice_tones[max(0, min(3, tone))])
            elif band == 3:
                cols.append(SNOW_SHADE)
            else:
                cols.append(SNOW if band >= 5 or hash01(i, j) > 0.3 else SNOW_BLUE)
    faces.append(tuple(range(m - 1, -1, -1)))
    cols.append(ICE_MID)
    last = (len(xs) - 1) * m
    faces.append(tuple(range(last, last + m)))
    cols.append(ICE_MID)
    parts: list = []
    closed(parts, "wall", verts, faces, paint, cols, smooth=lambda c, nrm: False)
    return parts, 200


# ---------------------------------------------------------------- fishing huts

def ice_hut(name):
    """つりごや: a round hut of painted planks (the planks alternate a shade), a dome of snow for a roof with a soft lip
    and drips, a dark wooden door +Z with a little handle, a round window on each side, a stovepipe at the back and a
    red flag on a pole (no letters, no marks); a lump of snow against its foot."""
    wall = HUT_WALLS[name]
    plank = hexmix(wall, "#FFFFFF", 0.14)
    paint = paints(0.8, **{plank: 0.24, hexmix(wall, "#000000", 0.25): 0.15})
    parts: list = []
    n = 16
    drum = [ring_pts(0, 0, 0.0, 2.24, n, TAU / 32), ring_pts(0, 0, 2.1, 2.18, n, TAU / 32)]
    verts, faces, tags = stack(drum)
    faces_cols = []
    for tag in tags:
        if tag[0] == "band":
            faces_cols.append(plank if tag[2] % 2 else wall)
        else:
            faces_cols.append(hexmix(wall, "#000000", 0.25))
    keep = [i for i, t in enumerate(tags) if t[0] != "cap_top"]
    closed(parts, "drum", verts, [faces[i] for i in keep], paint, [faces_cols[i] for i in keep], smooth=lambda c, nrm: False)
    # The roof: a dome of snow over a lip that hangs out past the walls.
    rim, lip, dome = [], [], []
    for i in range(n):
        a = TAU * i / n
        drip = 0.16 if i % 3 == 0 else 0.0
        rim.append((math.cos(a) * 2.1, 2.0, math.sin(a) * 2.1))
        lip.append((math.cos(a) * 2.36, 2.12 - drip, math.sin(a) * 2.36))
    rings = [rim, lip]
    for y, r in ((2.42, 2.34), (3.05, 2.0), (3.62, 1.4), (4.0, 0.72)):
        rings.append(ring_pts(0, 0, y, r, n, TAU / 32 if len(rings) % 2 else 0.0))
    verts, faces, tags = stack(rings, top=(0.0, 4.14, 0.0))
    roof_cols = []
    for tag in tags:
        if tag[0] == "bottom" or (tag[0] == "band" and tag[1] == 0):
            roof_cols.append(SNOW_SHADE)
        elif tag[0] == "band" and tag[1] == 1:
            roof_cols.append(SNOW_BLUE)
        else:
            roof_cols.append(SNOW)
    closed(parts, "roof", verts, faces, paint, roof_cols, smooth=lambda c, nrm: nrm.y > -0.5)
    # The door: a plank door with a rounded top on the front, a little handle.
    door = [(-0.5, 0.0), (0.5, 0.0), (0.5, 1.3)] + [(math.cos(math.radians(a)) * 0.5, 1.3 + math.sin(math.radians(a)) * 0.42) for a in (30, 60, 90, 120, 150)] + [(-0.5, 1.3)]
    s.plate(parts, "door", (0.0, 0.02, 2.17), (1, 0, 0), (0, 1, 0), door, 0.12, [paint(DOOR)])
    s.pyramid(parts, "handle", (-0.3, 0.8, 2.24), (-0.3, 0.8, 2.33), (0.05, 0, 0), (0, 0.05, 0), paint(FLAG))
    # Round windows on both sides: a white frame and pale glass.
    for side in (-1, 1):
        c = (side * 2.2, 1.25, 0.0)
        v.sticker(parts, f"frame-{side}", c, (side, 0, 0), (0.62, 0.62), paint(SNOW), 8, lift=0.03)
        v.sticker(parts, f"glass-{side}", c, (side, 0, 0), (0.44, 0.44), paint(WINDOW), 8, lift=0.045)
    # The stovepipe at the back, a little hat on it.
    k.add_tapered_segment(parts, "pipe", (-0.85, 3.0, -0.9), (-0.85, 4.75, -0.9), 0.15, 0.15, paint(PIPE), vertices=6, smooth=False)
    obj = parts[-1]
    s.fix_normals(obj)
    s.pyramid(parts, "pipe-hat", (-0.85, 4.75, -0.9), (-0.85, 5.02, -0.9), (0.26, 0, 0), (0, 0, 0.26), paint(PIPE))
    # The flag on its pole (pointing forward, +Z).
    k.add_tapered_segment(parts, "pole", (0.95, 3.4, 0.0), (0.95, 5.62, 0.0), 0.05, 0.045, paint(POLE), vertices=5, smooth=False)
    s.fix_normals(parts[-1])
    s.pyramid(parts, "pole-top", (0.95, 5.62, 0.0), (0.95, 5.75, 0.0), (0.06, 0, 0), (0, 0, 0.06), paint(FLAG))
    flag = [(0.0, 0.0), (0.24, 0.05), (0.48, -0.01), (0.72, 0.04), (0.72, 0.42), (0.48, 0.37), (0.24, 0.43), (0.0, 0.4)]
    s.plate(parts, "flag", (0.95, 5.12, 0.03), (0, 0, 1), (0, 1, 0), flag, 0.03, [paint(FLAG)])
    # Snow heaped against the foot, behind and to one side.
    lump(parts, "heap-1", (1.5, 0.75, 1.1), (-1.4, 0.15, -1.75), paint, SNOW, 91, rough=0.1)
    lump(parts, "heap-2", (1.1, 0.55, 0.9), (1.85, 0.1, -1.1), paint, SNOW, 92, rough=0.1)
    return parts, 500


# ---------------------------------------------------------------- tunnel mouth

def wedge(parts, name, a0, a1, r0, r1, z0, z1, cy, paint, colour):
    """A voussoir: the block of an arch between angles a0..a1 (radians, from +X up) and radii r0..r1, z0..z1 deep."""
    pts = [(math.cos(a0) * r0, cy + math.sin(a0) * r0), (math.cos(a1) * r0, cy + math.sin(a1) * r0),
           (math.cos(a1) * r1, cy + math.sin(a1) * r1), (math.cos(a0) * r1, cy + math.sin(a0) * r1)]
    verts = [(x, y, z0) for x, y in pts] + [(x, y, z1) for x, y in pts]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return closed(parts, name, verts, faces, paint, [colour] * 6)


def block(parts, name, x0, x1, y0, y1, z0, z1, paint, colour):
    verts = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return closed(parts, name, verts, faces, paint, [colour] * 6)


TM_SPRING, TM_IN, TM_OUT, TM_FRONT, TM_BACK, TM_FACE = 4.5, 3.9, 5.4, 2.0, -2.0, 0.6


def tunnel_mouth():
    """トンネルの くち: a round-topped stone arch, its mouth +Z: two pillars of stacked blocks and nine wedge stones (the
    keystone a little proud), all in two warm greys; the tunnel going in behind it in soft blue-greys, deeper toward
    the back (never black); a pillow of snow along the top of the arch with a few drips, and snow on the barrel behind."""
    paint = paints(0.9)
    parts: list = []
    tones = [STONE, STONE_LIGHT, STONE_DARK]
    # Pillars: two blocks each, a little uneven.
    for side in (-1, 1):
        x0, x1 = side * TM_IN, side * (TM_OUT + 0.08)
        block(parts, f"pillar-low-{side}", min(x0, x1), max(x0, x1), 0.0, 2.35, TM_FACE - 0.05, TM_FRONT + 0.06, paint, STONE_DARK if side < 0 else STONE)
        x0, x1 = side * TM_IN, side * TM_OUT
        block(parts, f"pillar-high-{side}", min(x0, x1), max(x0, x1), 2.35, TM_SPRING, TM_FACE, TM_FRONT, paint, STONE_LIGHT if side < 0 else STONE_DARK)
    # The arch: nine wedges, the keystone (the middle) proud and a little taller.
    count = 9
    gap = 0.012
    for i in range(count):
        a0 = math.pi * i / count + gap
        a1 = math.pi * (i + 1) / count - gap
        key = i == count // 2
        wedge(parts, f"stone-{i}", a0, a1, TM_IN - (0.05 if key else 0.0), TM_OUT + (0.22 if key else 0.0), TM_FACE - 0.02,
              TM_FRONT + (0.14 if key else 0.0), TM_SPRING, paint, tones[i % 3] if not key else STONE_LIGHT)
    # The tunnel behind: a thick shell, blue-grey inside (deeper at the back), stone outside, snow on its top.
    seg = 8
    r_out = TM_OUT - 0.5
    inner_front = [(TM_IN, 0.0)] + [(math.cos(math.pi * i / seg) * TM_IN, TM_SPRING + math.sin(math.pi * i / seg) * TM_IN) for i in range(seg + 1)] + [(-TM_IN, 0.0)]
    outer = [(r_out, 0.0)] + [(math.cos(math.pi * i / seg) * r_out, TM_SPRING + math.sin(math.pi * i / seg) * r_out) for i in range(seg + 1)] + [(-r_out, 0.0)]
    m = len(inner_front)
    z_in_back = TM_BACK + 0.25
    verts = ([(x, y, TM_FACE) for x, y in inner_front] + [(x, y, z_in_back) for x, y in inner_front]
             + [(x, y, TM_FACE) for x, y in outer] + [(x, y, TM_BACK) for x, y in outer])
    i0, i1, o0, o1 = 0, m, 2 * m, 3 * m
    faces, cols = [], []
    # Wound by hand (the shell is open where the floor is): the outlines run counter-clockwise seen from the mouth.
    for j in range(m - 1):
        # Inside (seen through the mouth): facing the tunnel's axis.
        faces.append((i0 + j, i0 + j + 1, i1 + j + 1, i1 + j))
        cols.append(TUNNEL_IN)
        # Outside: facing away from the axis.
        faces.append((o0 + j, o1 + j, o1 + j + 1, o0 + j + 1))
        cols.append(SNOW if 2 <= j <= m - 4 else STONE_DARK)
        # Front ring (hidden behind the stones), facing the mouth.
        faces.append((i0 + j, o0 + j, o0 + j + 1, i0 + j + 1))
        cols.append(STONE_DARK)
    # The inside's floor (facing up), its back wall (facing the mouth) and the outside's back (facing away).
    faces.append((i0, i1, i1 + m - 1, i0 + m - 1))
    cols.append(TUNNEL_DEEP)
    faces.append(tuple(range(i1, i1 + m)))
    cols.append(TUNNEL_DEEP)
    faces.append(tuple(range(o1 + m - 1, o1 - 1, -1)))
    cols.append(STONE_DARK)
    # The bottom between inner and outer walls, both sides, and the back ring between the inner back and outer back.
    faces.append((i0, i1, o1, o0))
    cols.append(STONE_DARK)
    faces.append((i0 + m - 1, o0 + m - 1, o1 + m - 1, i1 + m - 1))
    cols.append(STONE_DARK)
    obj = k.add_mesh(parts, "barrel", verts, faces, [])
    slots: dict = {}
    for poly, colour in zip(obj.data.polygons, cols):
        if colour not in slots:
            slots[colour] = len(obj.data.materials)
            obj.data.materials.append(paint(colour))
        poly.material_index = slots[colour]
        poly.use_smooth = False
    # Snow along the top of the arch: a pillow over the stones from 28 to 152 degrees, its front lip dripping.
    sections = []
    steps = 8
    for i in range(steps + 1):
        a = math.radians(28 + 124 * i / steps)
        drip = 0.28 if i % 2 else 0.05
        prof = [(TM_OUT - 0.05, TM_FRONT + 0.08 - 0.0, -drip), (TM_OUT + 0.22, TM_FRONT - 0.05, 0.0), (TM_OUT + 0.5, TM_FRONT - 0.7, 0.0),
                (TM_OUT + 0.42, TM_FACE - 0.2, 0.0), (TM_OUT - 0.05, TM_FACE - 0.4, 0.0)]
        ring = []
        for r, z, dy in prof:
            ring.append((math.cos(a) * r, TM_SPRING + math.sin(a) * r + dy, z))
        sections.append(ring)
    pm = len(sections[0])
    sverts = [p for sec in sections for p in sec]
    sfaces = []
    for i in range(steps):
        for j in range(pm):
            jn = (j + 1) % pm
            sfaces.append((i * pm + j, (i + 1) * pm + j, (i + 1) * pm + jn, i * pm + jn))
    sfaces.append(tuple(range(pm - 1, -1, -1)))
    sfaces.append(tuple(range(steps * pm, steps * pm + pm)))
    closed(parts, "arch-snow", sverts, sfaces, paint, lambda c, nrm: SNOW if nrm.y > 0.2 or nrm.z > 0.6 else SNOW_SHADE,
           smooth=lambda c, nrm: True)
    return parts, 400


# ---------------------------------------------------------------- seals

def seal(awake):
    """あざらし: a round soft-grey seal lying on its belly, a pale tummy and muzzle, a few darker spots on its back, small
    front flippers and its tail flippers in a V. Asleep its head rests low, the eyes two closed curves; awake it lifts
    its head and looks with round dark eyes. Eyes only: no nose, no mouth, no whiskers."""
    paint = paints(0.7)

    def belly(c, n):
        return SEAL_BELLY if (n.y < -0.45 or c.y < 0.1) else SEAL

    head = (0.0, 0.98, 1.0) if awake else (0.0, 0.46, 1.12)
    muzzle = (0.0, head[1] - 0.1, head[2] + 0.3) if awake else (0.0, head[1] - 0.08, head[2] + 0.31)
    volumes = [((1.42, 0.92, 2.2), (0.0, 0.46, -0.12)), ((0.86, 0.56, 1.0), (0.0, 0.3, -1.15)),
               ((0.84, 0.78, 0.86), head), ((0.38, 0.27, 0.3), muzzle)]
    colours = [belly, belly, SEAL, SEAL]
    if awake:
        volumes.append(((0.9, 0.9, 0.86), (0.0, 0.72, 0.55)))
        colours.append(belly)
    body = rv.painted_clay(paint, volumes, colours, "seal", 1060, 0.03)
    parts: list = [body]
    tree = k.world_tree(body)
    # Spots on the back, pressed onto the body.
    for i, (x, z, w) in enumerate(((0.28, -0.3, 0.16), (-0.22, 0.05, 0.13), (0.06, -0.75, 0.14), (-0.3, -0.62, 0.11), (0.33, 0.3, 0.1))):
        p, nrm = v.on_surface(tree, (x, 2.0, z), (x * 0.5, 0.3, z))
        v.hug(v.sticker(parts, f"spot-{i}", tuple(p), tuple(nrm), (w, w * 0.8), paint(SEAL_SPOT), 7, tilt=i * 0.7, lift=0.004), body, 0.005)
    # Front flippers out at the sides, tail flippers in a V behind.
    for side in (-1, 1):
        fl = v.ellipsoid(parts, f"flipper-{side}", (0.48, 0.09, 0.25), (side * 0.6, 0.2, 0.42), paint(SEAL_FLIPPER), 8, 3)
        fl.rotation_euler = (0.0, math.radians(side * 24), math.radians(side * 20))
        tl = v.ellipsoid(parts, f"tail-{side}", (0.44, 0.08, 0.32), (side * 0.2, 0.2, -1.76), paint(SEAL_FLIPPER), 8, 3)
        tl.rotation_euler = (0.0, 0.0, math.radians(side * -38))
    if awake:
        for side in (-1, 1):
            v.eye(parts, paint, tree, head, v.look(side * math.radians(30), math.radians(10)), (0.13, 0.15), f"eye-{side}", body)
    else:
        for side in (-1, 1):
            pts = []
            for tt in (0.0, 0.25, 0.5, 0.75, 1.0):
                d = v.look(side * math.radians(32) + side * math.radians(13) * (2 * tt - 1), math.radians(14) - math.radians(8) * (1 - (2 * tt - 1) ** 2))
                pts.append(v.on_surface(tree, tuple(Vector(head) + d * 0.9), head))
            v.hug(v.surface_line(parts, f"eye-{side}", pts, 0.035, paint(EYE)), body, 0.006)
    return parts, 1500


# ---------------------------------------------------------------- snowbird

def snowbird():
    """ゆきどり: a round white bird, its head running smoothly into its body (one fused surface), soft grey-blue wings
    held a little out from its sides (it waddles across the track in a row and circles in a flock), a short tail, a
    small orange beak and orange feet, round dark eyes with a shine. Head +Z."""
    paint = paints(0.7)

    def white(c, n):
        return BIRD_SHADE if n.y < -0.35 else BIRD

    head = (0.0, 0.83, 0.2)
    volumes = [((0.82, 0.76, 0.92), (0.0, 0.5, -0.04)), ((0.5, 0.48, 0.5), head)]
    body = rv.painted_clay(paint, volumes, [white, white], "snowbird", 186, 0.022)
    parts: list = [body]
    tree = k.world_tree(body)
    for side in (-1, 1):
        v.eye(parts, paint, tree, head, v.look(side * math.radians(36), math.radians(10)), (0.085, 0.1), f"eye-{side}", body)
        w = v.ellipsoid(parts, f"wing-{side}", (0.1, 0.42, 0.58), (side * 0.42, 0.52, -0.08), paint(BIRD_WING), 8, 4)
        w.rotation_euler = (math.radians(-12), 0.0, math.radians(side * 26))
        # A short orange leg and a three-toed foot.
        k.add_tapered_segment(parts, f"leg-{side}", (side * 0.13, 0.16, 0.0), (side * 0.13, 0.02, 0.03), 0.035, 0.03, paint(FEET), vertices=4, smooth=False)
        s.fix_normals(parts[-1])
        toes = [(0.0, -0.03), (0.07, 0.02), (0.05, 0.14), (0.0, 0.06), (-0.05, 0.14), (-0.07, 0.02)]
        s.plate(parts, f"foot-{side}", (side * 0.13, 0.016, 0.03), (1, 0, 0), (0, 0, 1), toes, 0.03, [paint(FEET)])
    k.add_tapered_segment(parts, "beak", (0.0, 0.8, 0.4), (0.0, 0.79, 0.6), 0.065, 0.0, paint(BEAK), vertices=5, smooth=False)
    s.fix_normals(parts[-1])
    s.plate(parts, "tail", (0.0, 0.56, -0.5), (1, 0, 0), (0, 0.45, -1),
            [(-0.07, 0.0), (0.07, 0.0), (0.15, 0.16), (0.0, 0.2), (-0.15, 0.16)], 0.04, [paint(BIRD_WING)])
    return parts, 400


# ---------------------------------------------------------------- records

def frond(parts, name, base, direction, side, length, width, paint, lift=0.03):
    """A feathery crystal frond lying in the plane of `direction` and `side` (unit vectors): a flat closed tent on a
    barbed outline, its top a fan round a raised spine point (paler toward the tip), its underside the flat outline."""
    d, w = Vector(direction).normalized(), Vector(side).normalized()
    up = d.cross(w).normalized()
    if up.y < 0:
        up = -up
    b = Vector(base)
    outline = [(0.0, 0.0), (0.28, 0.17), (0.4, 0.08), (0.62, 0.14), (1.0, 0.0), (0.62, -0.14), (0.4, -0.08), (0.28, -0.17)]
    ring = [b + d * (u * length) + w * (s_ * width) for u, s_ in outline]
    spine = b + d * (0.48 * length) + up * lift
    m = len(ring)
    verts = [tuple(p) for p in ring] + [tuple(spine)]
    faces = [(j, (j + 1) % m, m) for j in range(m)] + [tuple(range(m))]
    obj = k.add_mesh(parts, name, verts, faces, [paint(FLOWER), paint(FLOWER_TIP)])
    for i, poly in enumerate(obj.data.polygons):
        poly.material_index = 1 if i in (3, 4) else 0
        poly.use_smooth = False
    s.fix_normals(obj)
    return obj


def frost_flower():
    """記録①「こおりの はな」: three little bunches of frost flowers on a small disc of new ice: feathery white crystal
    fronds fanning up and out of each bunch, pale blue at their tips, a round bead of frost in its middle. They glow a
    little, so they sparkle on the ice."""
    # Less of their own light than the snow: white on the pale ice still has to show its facets (also in the picture
    # book, whose light is brighter than the game's).
    paint = paints(0.35, **{ICE: 0.35, ICE_EDGE: 0.4})
    parts: list = []
    base = [ring_pts(0, -0.08, 0.0, 0.5, 9, 0.2, 1.0, 0.9), ring_pts(0, -0.08, 0.035, 0.46, 9, 0.2, 1.0, 0.9)]
    verts, faces, tags = stack(base)
    closed(parts, "ice", verts, faces, paint, [ICE if tag[0] == "cap_top" else ICE_EDGE for tag in tags])
    rng = random.Random(15)
    for f, (cx, cz, size, count) in enumerate(((0.0, 0.06, 1.0, 6), (0.3, -0.24, 0.78, 5), (-0.28, -0.26, 0.72, 5))):
        turn = rng.uniform(0, TAU)
        for i in range(count):
            a = turn + TAU * i / count + rng.uniform(-0.15, 0.15)
            rise = math.radians(rng.uniform(42, 62))
            d = Vector((math.cos(a) * math.cos(rise), math.sin(rise), math.sin(a) * math.cos(rise)))
            w = Vector((-math.sin(a), 0.0, math.cos(a)))
            frond(parts, f"frond-{f}-{i}", (cx + math.cos(a) * 0.03, 0.035, cz + math.sin(a) * 0.03), tuple(d), tuple(w),
                  0.52 * size * rng.uniform(0.88, 1.1), 0.17 * size, paint)
        v.ellipsoid(parts, f"bead-{f}", (0.13 * size, 0.12 * size, 0.13 * size), (cx, 0.08 * size, cz), paint(FLOWER_MID), 6, 3)
    return parts, 400


def valve(parts, name, paint, hinge, radius, depth, open_deg, seg=9):
    """A scalloped shell valve (harbour.star_sand's, larger): ribs from the hinge out to a nearly round rim, bowed
    `depth` in its middle (down for the lower one, a bowl), outside in the shell's two pinks, inside paler; opened by
    `open_deg` about the hinge's axis (x)."""
    ang = math.radians(open_deg)
    rim = []
    for i in range(seg + 1):
        th = math.radians(-125 + 250 * i / seg)
        rim.append((math.sin(th) * radius, radius * 0.92 + math.cos(th) * radius))

    def put(lx, lz, bow):
        y = -bow * math.cos(ang) + lz * math.sin(ang)
        z = lz * math.cos(ang) + bow * math.sin(ang)
        return (hinge[0] + lx, hinge[1] + y, hinge[2] + z)

    verts = [hinge]
    for skin, (lift, shrink) in enumerate(((0.0, 1.0), (0.035, 0.95))):
        for row in (0.5, 1.0):
            for i, (rx, rz) in enumerate(rim):
                lx, lz = rx * row * shrink, rz * row * shrink
                bow = (depth - lift) * (1 - (lx / radius) ** 2 * 0.6) * (1.0 if row < 1 else 0.3) + (0.03 if (i % 2 and skin == 0) else 0.0)
                verts.append(put(lx, lz, bow - lift))
    w = seg + 1
    o0, o1, i0, i1 = 1, 1 + w, 1 + 2 * w, 1 + 3 * w
    faces, cols = [], []
    for i in range(seg):
        rib = SHELL_RIB if i % 2 else SHELL
        faces += [(0, o0 + i + 1, o0 + i), (o0 + i, o0 + i + 1, o1 + i + 1, o1 + i), (0, i0 + i, i0 + i + 1),
                  (i0 + i + 1, i0 + i, i1 + i, i1 + i + 1), (o1 + i, o1 + i + 1, i1 + i + 1, i1 + i)]
        cols += [rib, rib, SHELL_INSIDE, SHELL_INSIDE, SHELL]
    faces += [(0, o0, o1, i1, i0), (0, i0 + seg, i1 + seg, o1 + seg, o0 + seg)]
    cols += [SHELL, SHELL]
    return v.painted(parts, name, verts, faces, paint, cols, smooth=lambda c, n: True)


def glow_shell():
    """記録②「こおりの したの ひかる かい」: a round pink clam lying open on the lake's floor, ribbed and scalloped, its
    upper half lifted over the hinge at the back (-Z); a pearl in the bowl glows a soft warm yellow (its own light)."""
    paint = paints(0.5)
    parts: list = []
    valve(parts, "lower", paint, (0.0, 0.2, -0.43), 0.5, 0.17, 0.0)
    valve(parts, "upper", paint, (0.0, 0.21, -0.44), 0.47, -0.12, 38.0)
    v.ellipsoid(parts, "pearl", (0.24, 0.23, 0.24), (0.0, 0.2, 0.0), paint(PEARL), 10, 6)
    return parts, 300


def ice_bell():
    """記録③「こおりの たなの すず」: a little iron bell sitting on a shelf of ice high on the canyon wall. A record with no
    rotation stands with +Z along the track and +X toward it, so the shelf's back (-X) is against the wall and it
    reaches 1.4 m out toward the track: a rounded slab of pale ice, icicles under its outer edge, a little snow in its
    back corners; the bell grey-blue iron with a paler lip and a loop on top, tipped a little toward the track so its
    clapper shows."""
    paint = paints(0.5)
    parts: list = []
    # Rounded corners toward +X (the track), square ones against the wall.
    outline = [(z, x) for x, z in s.rounded_rect(-0.5, 0.5, -0.7, 0.7, 0.05, 0.3, 2)]
    s.slab(parts, "shelf", outline, 0.15, 0.36, paint(SHELF), bevel=0.05)
    for i, (z, length) in enumerate(((-0.36, 0.15), (-0.1, 0.11), (0.16, 0.15), (0.38, 0.09))):
        x = 0.58 if abs(z) < 0.3 else 0.5
        k.add_tapered_segment(parts, f"icicle-{i}", (x, 0.17, z), (x, 0.17 - length, z), 0.045, 0.0, paint(SHELF_LIGHT), vertices=4, smooth=False)
        s.fix_normals(parts[-1])
    lump(parts, "snow-l", (0.26, 0.16, 0.34), (-0.54, 0.38, -0.38), paint, SNOW, 31, rough=0.1)
    lump(parts, "snow-r", (0.22, 0.13, 0.28), (-0.56, 0.38, 0.4), paint, SNOW, 32, rough=0.1)
    bell: list = []
    prof = [(0.0, 0.0, BELL_DARK), (0.0, 0.29, BELL_RIM), (0.05, 0.31, BELL_RIM), (0.1, 0.27, BELL), (0.36, 0.24, BELL), (0.56, 0.2, BELL),
            (0.68, 0.13, BELL), (0.72, 0.0, BELL)]
    v.lathe_y(bell, "bell", prof, (0.0, 0.0), 9, paint, smooth=lambda c, nrm: nrm.y > -0.9)
    loop = [(0.0, 0.7, 0.0), (0.0, 0.78, 0.07), (0.0, 0.86, 0.0), (0.0, 0.78, -0.07), (0.0, 0.7, 0.0)]
    obj = k.add_swept_tube(bell, "loop", loop, [0.025] * len(loop), [paint(BELL_RIM)] * (len(loop) - 1), sides=4, smooth=False)
    s.fix_normals(obj)
    v.ellipsoid(bell, "clapper", (0.12, 0.12, 0.12), (0.08, 0.03, 0.0), paint(BELL_DARK), 6, 2)
    for obj in bell:
        k.active(obj)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        obj.rotation_euler = (0.0, math.radians(14), 0.0)  # tipped toward +X (Blender y is glTF -z)
        obj.location = k.to_blender((-0.04, 0.42, 0.0))
    parts += bell
    return parts, 300


# ---------------------------------------------------------------- signs

def bar(ax, ay, bx, by, w):
    dx, dy = bx - ax, by - ay
    ln = math.hypot(dx, dy)
    nx, ny = -dy / ln * w / 2, dx / ln * w / 2
    return [((ax + nx, ay + ny), (bx + nx, by + ny), (bx - nx, by - ny)), ((ax + nx, ay + ny), (bx - nx, by - ny), (ax - nx, ay - ny))]


def sign_snow(parts, paint):
    """A soft pillow of snow along the top of the board's frame, a little lip over the front."""
    y = v.SIGN_Y + v.SIGN_H / 2
    sections = []
    xs = [-0.6, -0.42, -0.14, 0.16, 0.44, 0.62]
    for i, x in enumerate(xs):
        end = i in (0, len(xs) - 1)
        hgt = 0.04 if end else 0.09 - 0.015 * (i % 2)
        dz = 0.02 if end else 0.0
        sections.append([(x, y - 0.03, -0.05 + dz), (x, y - 0.03 - (0.0 if end else 0.035 * (i % 2)), 0.075 - dz), (x, y + hgt * 0.7, 0.07 - dz),
                         (x, y + hgt, 0.0), (x, y + hgt * 0.7, -0.06 + dz)])
    m = len(sections[0])
    verts = [p for sec in sections for p in sec]
    faces = []
    for i in range(len(xs) - 1):
        for j in range(m):
            faces.append((i * m + j, (i + 1) * m + j, (i + 1) * m + (j + 1) % m, i * m + (j + 1) % m))
    faces.append(tuple(range(m - 1, -1, -1)))
    last = (len(xs) - 1) * m
    faces.append(tuple(range(last, last + m)))
    closed(parts, "snow-cap", verts, faces, paint, lambda c, nrm: SNOW if nrm.y > 0.3 else SNOW_SHADE, smooth=lambda c, nrm: True)


def sign_ice():
    """こおり: a pale ice-blue board in a blue frame with a blue six-armed snow crystal (little twigs on each arm, a
    hexagon in the middle) and a cap of snow on top."""
    paint = paints(0.6)
    parts: list = []
    z = v.sign_base(parts, paint, SIGN_BOARD, SIGN_FRAME)
    cy = v.SIGN_Y - 0.02
    tris = []
    twigs = []
    for i in range(6):
        a = TAU * i / 6 + math.pi / 2
        ex, ey = math.cos(a) * 0.36, math.sin(a) * 0.36
        tris += bar(math.cos(a) * 0.06, cy + math.sin(a) * 0.06, ex, cy + ey, 0.06)
        for at, length in ((0.2, 0.12), (0.3, 0.07)):
            mx, my = math.cos(a) * (at + 0.02), math.sin(a) * (at + 0.02)
            for turn in (-0.75, 0.75):
                twigs += bar(mx, cy + my, mx + math.cos(a + turn) * length, cy + my + math.sin(a + turn) * length, 0.04)
    hexagon = [(math.cos(TAU * i / 6 + math.pi / 6) * 0.08, cy + math.sin(TAU * i / 6 + math.pi / 6) * 0.08) for i in range(6)]
    # The arms, their twigs a hair in front (no coplanar overlaps), the hexagon in front of the arms' roots.
    v.flat_tris(parts, "crystal", tris, z, paint(FLAKE))
    v.flat_tris(parts, "crystal-twigs", twigs, z + 0.002, paint(FLAKE))
    v.flat_tris(parts, "crystal-heart", [((0.0, cy), hexagon[i], hexagon[(i + 1) % 6]) for i in range(6)], z + 0.003, paint(FLAKE))
    sign_snow(parts, paint)
    return parts, 450


def sign_thin_ice():
    """うすい こおり: a deeper blue board in the blue frame: white cracks running out from a point low on the left, and a
    small rocket flying over them to the right (white, an orange nose and band, a little flame behind); a cap of snow
    on top. The rocket says "go fast", as on 2-3's board."""
    paint = paints(0.6)
    parts: list = []
    z = v.sign_base(parts, paint, THIN_BOARD, SIGN_FRAME)
    cy = v.SIGN_Y
    c = (-0.2, cy - 0.22)
    for p_, path in enumerate(([(0.12, -0.04), (0.28, 0.02), (0.5, -0.03)], [(-0.12, 0.08), (-0.3, 0.06), (-0.42, 0.14)], [(0.04, -0.12), (0.0, -0.2)],
                               [(-0.1, -0.1), (-0.24, -0.16)], [(0.1, 0.1), (0.2, 0.2)])):
        tris = []
        x0, y0 = c
        for dx, dy in path:
            x1, y1 = c[0] + dx, c[1] + dy
            tris += bar(x0, y0, x1, y1, 0.035)
            x0, y0 = x1, y1
        # Each crack a hair in front of the last, so where they meet no faces overlap in one plane.
        v.flat_tris(parts, f"crack-{p_}", tris, z + 0.0008 * p_, paint(CRACK))
    ry, rz = cy + 0.2, 0.1
    rocket: list = []
    prof = [(-0.26, 0.0, ROCKET_DARK), (-0.26, 0.065, ROCKET_DARK), (-0.18, 0.06, ROCKET_BODY), (-0.04, 0.075, ROCKET_NOSE),
            (0.02, 0.075, ROCKET_BODY), (0.14, 0.075, ROCKET_BODY), (0.22, 0.055, ROCKET_NOSE), (0.3, 0.0, ROCKET_NOSE)]
    v.lathe_z(rocket, "rocket", prof, 0.0, 0.0, 8, paint, smooth=True)
    for obj in rocket:
        obj.rotation_euler = (0, 0, math.radians(90))  # nose (glTF +Z) to +X
        obj.scale = (0.62, 1.0, 1.0)  # flattened toward the board (local x turns to Blender y = glTF -z)
        obj.location = k.to_blender((0.16, ry, rz))
    parts += rocket
    for i, sg in enumerate((1, -1)):
        s.plate(parts, f"fin-{i}", (-0.04, ry + sg * 0.07, rz), (1, 0, 0), (0, sg, 0), [(-0.1, 0.0), (0.05, 0.0), (-0.08, 0.06), (-0.14, 0.05)],
                0.02, [paint(ROCKET_NOSE)])
    flame = [((-0.12, ry + 0.05), (-0.36, ry), (-0.12, ry - 0.05)), ((-0.16, ry + 0.025), (-0.28, ry + 0.0), (-0.16, ry - 0.025))]
    v.flat_tris(parts, "flame", flame[:1], z, paint(ROCKET_FLAME))
    v.flat_tris(parts, "flame-core", flame[1:], z + 0.003, paint(CRACK))
    sign_snow(parts, paint)
    return parts, 450


# ---------------------------------------------------------------- export and preview

def preview(model, name, direction=(0.55, -0.72, 0.42), size=(512, 400)):
    v.preview(model, name, direction, size)


BUILDERS = {"snow-pine": snow_pine, "snow-bank": snow_bank, "snow-island": snow_island, "snow-mountain": snow_mountain,
            "tunnel-mouth": tunnel_mouth, "ice-hut": lambda: ice_hut("ice-hut"), "ice-hut-b": lambda: ice_hut("ice-hut-b"),
            "ice-hut-c": lambda: ice_hut("ice-hut-c"), "ice-hole": ice_hole, "ice-wall": ice_wall, "seal-sleep": lambda: seal(False),
            "seal": lambda: seal(True), "snowbird": snowbird, "frost-flower": frost_flower, "glow-shell": glow_shell, "ice-bell": ice_bell,
            "sign-ice": sign_ice, "sign-thin-ice": sign_thin_ice}
# Exact stand-in sizes (w, h, d) the shapes are scaled to.
EXACT = {"snow-pine": (5.0, 8.45, 5.0), "snow-bank": (7.0, 1.6, 4.0), "snow-island": (120.0, 0.15, 84.0), "ice-hole": (2.86, 0.16, 2.86),
         "tunnel-mouth": (11.0, 10.5, 4.0), "ice-wall": (WALL_W, WALL_H, WALL_D), "seal-sleep": (1.57, 1.02, 3.02), "seal": (1.57, 1.36, 2.97),
         "snowbird": (0.96, 1.08, 1.24), "frost-flower": (1.43, 0.55, 1.5), "glow-shell": (1.0, 0.62, 0.93), "ice-bell": (1.4, 1.27, 1.0)}
# Centred on their bounding box; the rest keep the x/z origin they were built about.
CENTRED = {"snow-bank", "snow-island", "ice-hole", "tunnel-mouth", "ice-wall", "seal-sleep", "seal", "snowbird", "frost-flower", "glow-shell",
           "ice-bell"}
VIEWS = {"snow-island": (0.55, -0.72, 0.3), "ice-hole": (0.45, -0.6, 0.65), "snow-mountain": (0.55, -0.72, 0.3),
         "ice-wall": (0.35, -0.9, 0.2), "tunnel-mouth": (0.4, -0.85, 0.25), "seal-sleep": (0.6, -0.7, 0.4), "seal": (0.6, -0.7, 0.35),
         "snowbird": (0.5, -0.75, 0.3), "frost-flower": (0.45, -0.6, 0.6), "glow-shell": (0.45, -0.75, 0.5), "ice-bell": (0.45, -0.85, 0.15),
         "sign-ice": (0.35, -0.9, 0.15), "sign-thin-ice": (0.35, -0.9, 0.15)}
TALL = {"snow-pine", "sign-ice", "sign-thin-ice"}

if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if a in BUILDERS] or list(BUILDERS)
    for name in names:
        k.reset()
        built, budget = BUILDERS[name]()
        model = k.join(built, name)
        model.name = name
        model.data.name = name
        model.data.validate()
        if name in EXACT:
            v.scale_to(model, EXACT[name])
        if name in CENTRED:
            k.normalize(model, None)
        else:
            v.floor_to_zero(model)
        # No uv layer (nothing here is textured), triangulated by a fixed rule (harbour.py).
        while model.data.uv_layers:
            model.data.uv_layers.remove(model.data.uv_layers[0])
        k.apply_modifier(model, "TRIANGULATE", quad_method="FIXED", ngon_method="CLIP")
        s.export_glb(model, name, budget)
        preview(model, name, VIEWS.get(name, (0.55, -0.72, 0.42)), size=(400, 512) if name in TALL else (512, 400))
