"""Stage 5-1 (よるのもり) — Claude Code. Ticket 0018.

The crafted look (つくりこみ) of chapters 1-4 (sky.py, volcano.py, river.py, ice.py, snow.py and village.py, whose helpers
this script uses): flat colours (the game bakes each model into one draw call), round friendly shapes. A big forest at
night under a blue moon: deep blue-greens and warm browns, never black; what glows (the mushrooms' caps, the moonstone,
the fireflies, the great tree's lanterns, the moonlit meadow and its flowers) carries its own colour as light, and white
fur keeps some too, so it stays white under the game's 70% moonlight instead of turning grey. The animals have two
small dark eyes and a nose only (no mouth, teeth, brows or lashes; no clothes, hats, leaves, bottles or drum bellies);
the great tree has one hollow only; the moon on the signs has no face; nothing has letters, crests or marks, and
nothing is modelled on a real sign, lantern or known character.

Models (same names, sizes (within 0.1 m), origins and orientation as the code stand-ins they replace, so the stage
JSON does not change; origin at the bottom centre, +Z forward, the model's own left is +X):
- night-tree-a 5.04 x 12.44 x 6.17, night-tree-b 7.06 x 16.1 x 8.25 (about 420 in 5-1, 80 in 6-2): a trunk with a
  flared foot and two short boughs, and three / four round clumps of leaves, lighter on the moon's side (+X, up).
  Origin at the trunk's foot (the clumps sit off the middle as the stand-ins' did). Under 150 / 180 triangles.
- night-bush 2.37 x 1.36 x 2.48: three soft lobes fused into one round bush. Under 60 triangles.
- glow-mushroom 0.86 x 0.8 x 0.76: a big and a small mushroom, white stems, round blue caps that glow (pale gills).
- moon-meadow 60 x 0.08 x 100: the moonlit meadow's board (100 m along +Z, tiled either side of the track): pale
  blue-green grass in soft patches, its rim sloping to the floor, little white and lilac flowers; it all glows a
  little (the moonlit clearing reads paler than the dark forest floor).
- great-tree 50 x 68.6 x 50 (the stand-in's size; the ticket says 40 x 70 x 40): a thick bark trunk (Ø 14 at its foot,
  the bark twisting in two browns), six roots on the ground, four boughs into a fused crown of five clumps, one hollow
  low on the trunk (+Z), six warm paper lanterns hanging under the crown (they glow). The soft firefly light round the
  crown is the game's (src/view/three/night-models.ts adds it, as the stand-in had it).
- plaza-deck 19.9 x 0.7 x 40: the square's wooden deck, ten planks in two browns, light cut ends, two joists and six
  posts under it.
- big-stump 9.75 x 3 x 10: the stump by the stump station: ridged bark, growth rings on its top, five root flares.
- log-bridge-end 5.88 x 1.4 x 4.7: the broken end of the log bridge, five logs bound by two cross logs, posts under the
  near end, the far ends (+Z, toward the gap) splintered in pale wood.
- thicket 8.78 x 3.66 x 1.7: a soft wall of round leaves at a dark dead end (no thorns), little pale flowers on the
  train's side (-Z).
- birdhouse-upside 0.57 x 0.75 x 0.57: Sakasa's upside-down birdhouse, its roof below, the hole +Z (now low on the
  front), its perch above the hole, and her pink swirl on the front. Vertex colours, two materials: "trace-swirl" is
  the swirl, which the game swaps for 4-2's glowing one (it glows while the light finds it); the rest is "night-paint".
- bell-branch 6.1 x 0.92 x 0.73: record 3's branch along X, its thick end +X (into the tree), the thin end with a few
  leaves, an iron hook under it at x -1 (the record hangs there). Origin under the branch's middle, at the hook's foot.
- moonstone 0.5 x 0.3 x 0.4 (record 2): a round pale-yellow pebble that keeps the moonlight (it glows softly).
- lantern-bell 0.31 x 0.69 x 0.36 (record 3): a little iron lantern (a ring, a cap, warm lit panes, a base) with a gold
  bell under it.
- firefly-wait 1.41 x 1.23 x 0.7: six fireflies waiting in front of a dead end's thicket (where the stand-in's were),
  two perched on tall grass blades; they glow warm yellow-green.
- firefly-grass 1.35 x 0.7 x 1.02: a low tuft of dark grass by a firefly fork (the game's fireflies rest round it).
- firefly-swarm / firefly-swarm-big (cutscenes, the map and the movies): 60 / 160 points (glTF POINTS, written here
  directly: Blender exports no loose points) in the stand-in's places, round the sphere of radius 3 / 6 whose bottom
  is the origin ("origin": "joint" in assets/models.json: the lowest point is 1.2 / 2.3 m up). The game draws them as
  soft additive dots that twinkle (night-models.ts).
- sign-hush, sign-whistle-reversed 1.18 x 2.14 x 0.15: a post and a navy / white board with the hush picture (a
  crescent and ZZZ, no face); the second has a dancing tanuki's round shadow beside it (no pink swirl).
- bunny-sleep 0.47 x 0.34 x 0.74: a rabbit asleep, curled up, ears laid back, eyes closed (two little lines).
- bunny-family 1.52 x 0.45 x 1.3 (record 1): a straw nest with a big rabbit and two little ones asleep in it.
- fawn 0.4 x 1.25 x 1.1: a young deer, brown with white spots, thin legs (parts of their own), soft ears.
- hedgehog-walk 0.42 x 0.33 x 0.64: a round brown hedgehog sniffing along: a cape of soft spines (a pattern of little
  triangles, a zigzag edge), a light face and a dark nose.
- hedgehog-ball 0.5 x 0.48 x 0.59: the hedgehog curled up into a spiny ball, its nose peeking out at the front.
- tanuki 0.64 x 0.83 x 0.68: one little tanuki standing (the game puts 1-4 of them side by side, "tanuki-<n>"): a round
  body, a light tummy and muzzle, dark patches round its eyes, dark arms and legs, a striped tail.
- fake-lantern 0.64 x 2.6 x 0.36: Sakasa's fake light: a bamboo pole stuck in the ground, its arm, a cord and a round
  pink festival lantern hanging from it (never floating). Vertex colours, two materials: "fake-lantern-paper" is the
  paper, which the game swaps for its glowing pink (it goes out when the light sees through it); the rest "night-paint".
- root-mound 91.4 x 16.3 x 263.7: the great tree's root hill under the square (scripts/layout-5-1.mjs MOUND, the same
  numbers): its top a rounded rectangle 48 x 220 (corners 14 m round) flat at y 15.4 (the square's ground), its sides
  down to the forest floor 20 m out (MOUND_PROFILE), earth with moss on the shoulder, ten roots running down them, a
  few mossy lumps. Origin at the middle of its foot, +Z along the track.
Output: public/models/<name>.glb and assets/previews/<name>.png.
Run: python3 scripts/run-bpy.py assets/blender/night.py [-- name ...]
"""
from __future__ import annotations

from pathlib import Path
import json
import math
import random
import struct
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import sky as s  # noqa: E402  (chapter 1's crafted helpers: fix_normals, plate, pyramid...)
import volcano as v  # noqa: E402  (chapter 2's: Paint, painted, lathe_y, ellipsoid, sticker, eye, flat_tris, preview...)
import river as rv  # noqa: E402  (chapter 3's clay: body, clay, painted_clay, recolour, centre_xz, floor_to_zero)
import meadow as md  # noqa: E402  (vertex colours: export_glb)
import village as vg  # noqa: E402  (to_vertex_colours)
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

TAU = 2 * math.pi
hexmix = v.hexmix
hash01 = v.hash01

# ---------------------------------------------------------------- palette (ticket 0018)

LEAF_DARK, LEAF, LEAF_LIGHT, LEAF_MOON = "#2C5A55", "#356A5F", "#3F7A6A", "#4A8676"
TRUNK, TRUNK_DARK, TRUNK_LIGHT, WOOD_CUT, WOOD_HEART = "#5A4636", "#46362A", "#6B5542", "#C29A6B", "#A8835A"
HOLLOW, HOLLOW_RIM = "#241A14", "#7A624C"
MUSHROOM, MUSHROOM_DEEP, GILLS, STEM, STEM_SHADE = "#7FD6FF", "#5FBDF0", "#C9EEFF", "#EEF2F4", "#D5DEE6"
MEADOW, MEADOW_LIGHT, MEADOW_DARK, MEADOW_RIM = "#5F8F86", "#6D9D92", "#557F79", "#4C7570"
FLOWER, FLOWER_LILAC, FLOWER_HEART = "#F4F6FF", "#D9D2FF", "#FFF1A8"
DECK, DECK_DARK, DECK_END, POST_DARK = "#9A6B45", "#7A5234", "#C29A6B", "#5E4330"
WARM, WARM_DEEP, LANTERN_CAP, CORD = "#FFD27A", "#F6B85C", "#5A3E2E", "#3B2C22"
IRON, IRON_DARK, IRON_LIGHT, GOLD, GOLD_LIGHT, GLASS = "#6E7784", "#555D69", "#8A93A0", "#E8B93A", "#F6D46A", "#FFE7A8"
MOONSTONE, MOONSTONE_LIGHT, MOONSTONE_SHADE = "#FFF1A8", "#FFF7C8", "#EED98A"
FIREFLY, FIREFLY_WARM, FIREFLY_BODY = "#D8FF7A", "#F2FF9E", "#5E6B3A"
GRASS, GRASS_LIGHT = "#3F6E4F", "#5E8F63"
NAVY, NAVY_EDGE, NAVY_LINE, MOON, POST, BOARD_WHITE = "#27305E", "#1B2247", "#3D4C8E", "#FFE27A", "#7A5A3E", "#F4F1E6"
BIRDHOUSE, BIRDHOUSE_ROOF, BIRDHOUSE_DARK, SWIRL = "#B88A5A", "#7A4E33", "#2A1F18", "#FF7FBF"
RABBIT, RABBIT_SHADE, RABBIT_TAN, EAR_PINK, NOSE_PINK, LID = "#F4F0EA", "#E2DBD0", "#D8C0A0", "#E8B9B4", "#E79AA6", "#7C6A5E"
STRAW, STRAW_DARK, STRAW_LIGHT = "#C9A55E", "#A8853F", "#DDBE7A"
FAWN, FAWN_LIGHT, SPOT, HOOF = "#B07A4A", "#E7CBA6", "#F7EEDF", "#5A4332"
HEDGEHOG, HEDGEHOG_DARK, HEDGEHOG_TIP, HEDGEHOG_FACE = "#8B6A4C", "#6A4E36", "#A8865F", "#D9BE98"
TANUKI, TANUKI_DARK, TANUKI_BELLY = "#8A6A4E", "#4E3B2C", "#D9C3A0"
NOSE, EYE, EYE_SHINE = "#3A2A20", v.EYE, v.EYE_SHINE
BAMBOO, BAMBOO_DARK, BAMBOO_NODE, STRING = "#9DB36B", "#7C9150", "#6B7E44", "#E9E2D0"
PINK, PINK_DEEP, PINK_LIGHT = "#FF8FC8", "#E0569F", "#FFC2E2"

# Their own colour as light. The game lights physically and the night's moonlight is 70% of the day's, so a white or
# pale face the moon does not reach would turn grey: the white fur, the white boards and the stems keep some of their
# colour as light. What glows (the mushrooms' caps, the moonstone, the lanterns, the fireflies, the meadow's flowers)
# keeps a lot; the moonlit meadow a little, so it reads paler than the forest floor. Leaves and bark a touch, so the
# forest stays deep blue-green and brown instead of black.
GLOW = {LEAF_DARK: 0.03, LEAF: 0.04, LEAF_LIGHT: 0.05, LEAF_MOON: 0.06, TRUNK: 0.04, TRUNK_DARK: 0.03, TRUNK_LIGHT: 0.05,
        WOOD_CUT: 0.12, WOOD_HEART: 0.1, HOLLOW: 0.0, HOLLOW_RIM: 0.06,
        MUSHROOM: 0.95, MUSHROOM_DEEP: 0.85, GILLS: 0.8, STEM: 0.45, STEM_SHADE: 0.4,
        MEADOW: 0.05, MEADOW_LIGHT: 0.06, MEADOW_DARK: 0.04, MEADOW_RIM: 0.03, FLOWER: 0.7, FLOWER_LILAC: 0.6,
        FLOWER_HEART: 0.8,
        DECK: 0.08, DECK_DARK: 0.06, DECK_END: 0.12, POST_DARK: 0.04,
        WARM: 1.0, WARM_DEEP: 0.9, LANTERN_CAP: 0.05, CORD: 0.0,
        IRON: 0.1, IRON_DARK: 0.06, IRON_LIGHT: 0.12, GOLD: 0.3, GOLD_LIGHT: 0.4, GLASS: 0.85,
        MOONSTONE: 0.5, MOONSTONE_LIGHT: 0.55, MOONSTONE_SHADE: 0.42,
        FIREFLY: 1.0, FIREFLY_WARM: 1.0, FIREFLY_BODY: 0.05, GRASS: 0.07, GRASS_LIGHT: 0.09,
        "#FFFFFF": 0.6, NAVY: 0.12, NAVY_EDGE: 0.08, NAVY_LINE: 0.15, MOON: 0.6, POST: 0.06, BOARD_WHITE: 0.4,
        BIRDHOUSE: 0.12, BIRDHOUSE_ROOF: 0.08, BIRDHOUSE_DARK: 0.0, SWIRL: 0.2,
        RABBIT: 0.4, RABBIT_SHADE: 0.34, RABBIT_TAN: 0.24, EAR_PINK: 0.3, NOSE_PINK: 0.3, LID: 0.05,
        STRAW: 0.16, STRAW_DARK: 0.12, STRAW_LIGHT: 0.18,
        FAWN: 0.12, FAWN_LIGHT: 0.22, SPOT: 0.4, HOOF: 0.04,
        HEDGEHOG: 0.1, HEDGEHOG_DARK: 0.07, HEDGEHOG_TIP: 0.12, HEDGEHOG_FACE: 0.2,
        TANUKI: 0.12, TANUKI_DARK: 0.06, TANUKI_BELLY: 0.24, NOSE: 0.0, EYE: 0.0, EYE_SHINE: 0.5,
        BAMBOO: 0.16, BAMBOO_DARK: 0.12, BAMBOO_NODE: 0.1, STRING: 0.3}


def paints(roughness=0.85, **extra):
    """The flat colour materials of a model, each glowing by GLOW (plus `extra`, hex -> amount)."""
    table = dict(GLOW)
    table.update(extra)
    return v.Paint(roughness, glow=table)


# ---------------------------------------------------------------- small helpers (glTF coordinates)

def closed(parts, name, verts, faces, paint, colours, smooth=False):
    """v.painted for a closed part: faces wound outward, a colour per face (list) or colour(centre, normal)."""
    return v.painted(parts, name, verts, faces, paint, colours, smooth=smooth)


def ring(cx, cy, cz, rx, rz, n, phase=0.0):
    return [(cx + math.cos(phase + TAU * i / n) * rx, cy, cz + math.sin(phase + TAU * i / n) * rz) for i in range(n)]


def puff(parts, name, center, radii, paint, colour, n=6, lat=3, seed=0, jitter=0.1, phase=0.0, smooth=False, squash_bottom=1.0):
    """A soft round clump (a jittered globe of `n` segments and `lat` latitude rings between its two poles), each face
    coloured by colour(centre, normal). n=6, lat=3: 36 triangles."""
    rng = random.Random(seed)
    cx, cy, cz = center
    rx, ry, rz = radii
    rings = []
    for j in range(1, lat + 1):
        t = math.pi * j / (lat + 1)  # from the bottom pole up
        y = -math.cos(t)
        rr = math.sin(t)
        ring_pts = []
        for i in range(n):
            a = phase + TAU * i / n + (math.pi / n if j % 2 else 0.0)
            f = 1.0 + rng.uniform(-jitter, jitter)
            yy = y * (squash_bottom if y < 0 else 1.0)
            ring_pts.append((cx + math.cos(a) * rr * rx * f, cy + yy * ry * f, cz + math.sin(a) * rr * rz * f))
        rings.append(ring_pts)
    top = (cx, cy + ry * (1.0 + rng.uniform(-jitter, jitter) * 0.5), cz)
    bottom = (cx, cy - ry * squash_bottom * (1.0 + rng.uniform(-jitter, jitter) * 0.5), cz)
    verts, faces, _ = rv.body(rings, top=top, bottom=bottom)
    return closed(parts, name, verts, faces, paint, colour, smooth=smooth)


def leafy(seed=0):
    """Leaves: lighter on the moon's side (+X) and on top, darker underneath, a few darker facets for depth."""
    def colour(c, n):
        if n.y < -0.45:
            return LEAF_DARK
        if n.y > 0.62 and n.x > 0.1:
            return LEAF_MOON
        if n.y > 0.5 or n.x > 0.55:
            return LEAF_LIGHT
        return LEAF_DARK if hash01(round(c.x * 3.1), round(c.y * 2.7), round(c.z * 3.3), seed) < 0.28 else LEAF
    return colour


def bead(parts, name, center, radii, paint, colour, smooth=True):
    """A little round bead: an octahedron (8 triangles), smooth shaded."""
    cx, cy, cz = center
    rx, ry, rz = radii
    verts = [(cx + rx, cy, cz), (cx, cy, cz + rz), (cx - rx, cy, cz), (cx, cy, cz - rz), (cx, cy + ry, cz), (cx, cy - ry, cz)]
    faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (1, 0, 5), (2, 1, 5), (3, 2, 5), (0, 3, 5)]
    return closed(parts, name, verts, faces, paint, colour, smooth=smooth)


def tube(parts, name, points, radii, m, sides=5):
    """A closed tube along a polyline (one material), wound outward."""
    obj = k.add_swept_tube(parts, name, points, radii, [m] * (len(points) - 1), sides=sides, smooth=False)
    s.fix_normals(obj)
    return obj


def twig(parts, name, a, b, r0, r1, m, sides=4):
    obj = k.add_tapered_segment(parts, name, a, b, r0, r1, m, vertices=sides, smooth=False)
    s.fix_normals(obj)
    return obj


def bar(ax, ay, bx, by, w):
    """Two triangles: a bar `w` wide from (ax, ay) to (bx, by)."""
    dx, dy = bx - ax, by - ay
    ln = math.hypot(dx, dy)
    nx, ny = -dy / ln * w / 2, dx / ln * w / 2
    return [((ax + nx, ay + ny), (bx + nx, by + ny), (bx - nx, by - ny)), ((ax + nx, ay + ny), (bx - nx, by - ny), (ax - nx, ay - ny))]


def fan(cx, cy, rx, ry, n, phase=0.0):
    """A filled oval (n triangles round its centre)."""
    pts = [(cx + math.cos(phase + TAU * i / n) * rx, cy + math.sin(phase + TAU * i / n) * ry) for i in range(n)]
    return [((cx, cy), pts[i], pts[(i + 1) % n]) for i in range(n)]


def crescent(cx, cy, r, steps=4, inner=0.42):
    """A crescent opening to the right: the left half of a disc less a flattened half (thick middle, thin tips)."""
    out = []

    def pt(t, kk):
        return (cx + math.cos(t) * r * kk, cy + math.sin(t) * r)

    for i in range(steps):
        a = math.pi / 2 + math.pi * i / steps
        b = math.pi / 2 + math.pi * (i + 1) / steps
        out += [(pt(a, 1), pt(b, 1), pt(b, inner)), (pt(a, 1), pt(b, inner), pt(a, inner))]
    return out


def zed(x, y, size, w):
    """A "Z" `size` tall with its bottom-left at (x, y): three bars (6 triangles)."""
    return bar(x, y + size, x + size, y + size, w) + bar(x + size, y + size, x, y, w) + bar(x, y, x + size, y, w)


def cut_floor(obj):
    """Cut a part off at y 0 and close the cut."""
    v.cut_below(obj, 0.0)
    s.fix_normals(obj)


# ---------------------------------------------------------------- night trees

def trunk(parts, paint, foot, top_y, r0, r1, n=5, phase=0.0):
    """A tapering trunk with a flared foot, bark in two browns (darker on the side away from the moon)."""
    prof = [(0.0, foot, TRUNK_DARK), (0.45, r0, TRUNK), (top_y, r1, TRUNK)]
    obj = v.lathe_y(parts, "trunk", prof, (0.0, 0.0), n, paint, smooth=False, phase=phase)
    k.active(obj)
    rv.recolour(obj, paint, lambda c, nn: TRUNK_DARK if (nn.y < -0.5 or c.y < 0.45 or nn.x < -0.55) else (TRUNK_LIGHT if nn.x > 0.6 else TRUNK))
    return obj


def night_tree(height, width, clumps, boughs, seed):
    """よるの もりの き: a trunk with a flared foot, short boughs up into the side clumps, round clumps of leaves (the
    stand-in's places), lighter on the moon's side."""
    paint = paints(0.9)
    parts: list = []
    trunk(parts, paint, width * 0.105, height * 0.6, width * 0.075, width * 0.045, 5, phase=0.3)
    for i, (x, y, z) in enumerate(boughs):
        twig(parts, f"bough-{i}", (0.0, height * 0.36, 0.0), (x, y, z), width * 0.04, width * 0.022, paint(TRUNK), sides=3)
    for i, (cx, cy, cz, r) in enumerate(clumps):
        puff(parts, f"clump-{i}", (cx, cy, cz), (r, r * 1.1, r), paint, leafy(seed + i), n=6, lat=3, seed=seed * 10 + i,
             jitter=0.12, phase=i * 0.7, squash_bottom=0.8, smooth=True)
    return parts


def stand_in_clumps(h, w, n):
    """The stand-in's clumps (night-placeholders.ts nightTree): (x, y, z, radius)."""
    out = []
    for i in range(n):
        a = i / n * TAU + 0.4
        r = 0.0 if i == 0 else w * 0.22
        y = h * (0.72 if i == 0 else 0.5 + 0.12 * (i % 2))
        size = w * (0.42 if i == 0 else 0.34)
        # three.js: (cos a * r, y, sin a * r)
        out.append((math.cos(a) * r, y, math.sin(a) * r, size))
    return out


def night_tree_a():
    h, w = 14.0, 6.0
    clumps = stand_in_clumps(h, w, 3)
    boughs = [(c[0] * 0.8, c[1] - c[3] * 0.4, c[2] * 0.8) for c in clumps[1:]]
    return night_tree(h, w, clumps, boughs, 11), 150


def night_tree_b():
    h, w = 18.0, 8.0
    clumps = stand_in_clumps(h, w, 4)
    boughs = [(c[0] * 0.8, c[1] - c[3] * 0.4, c[2] * 0.8) for c in clumps[1:2]]
    return night_tree(h, w, clumps, boughs, 23), 180


# ---------------------------------------------------------------- bush

def night_bush():
    """やぶ: three soft round lobes of leaves (smooth), lighter on top and toward the moon."""
    paint = paints(0.9)
    parts: list = []
    for i in range(3):
        a = i / 3 * TAU + 0.3
        puff(parts, f"lobe-{i}", (math.cos(a) * 0.5, 0.68, math.sin(a) * 0.5), (0.95, 0.72, 0.95), paint, leafy(40 + i), n=5, lat=2, seed=40 + i,
             jitter=0.1, phase=i, smooth=True)
    return parts, 60


# ---------------------------------------------------------------- glowing mushrooms

def mushroom(parts, paint, name, x, z, s_, segs, stem_segs):
    """One glowing mushroom at (x, z), `s_` times the big one: a white stem a little wider at its foot, a round blue
    cap with a rolled rim, deeper blue on its crown, pale glowing gills underneath."""
    stem = [(0.0, 0.08 * s_, STEM_SHADE), (0.5 * s_, 0.058 * s_, STEM)]
    v.lathe(parts, f"{name}-stem", stem, lambda y, a, r: (x + math.cos(a) * r, y, z + math.sin(a) * r), stem_segs, paint, smooth=lambda c, n: abs(n.y) < 0.9)
    cap = [(0.42 * s_, 0.12 * s_, GILLS), (0.47 * s_, 0.32 * s_, MUSHROOM), (0.62 * s_, 0.28 * s_, MUSHROOM), (0.75 * s_, 0.15 * s_, MUSHROOM_DEEP),
           (0.8 * s_, 0.0, MUSHROOM_DEEP)]
    v.lathe(parts, f"{name}-cap", cap, lambda y, a, r: (x + math.cos(a) * r, y, z + math.sin(a) * r), segs, paint, smooth=lambda c, n: True,
            phase=0.3)


def glow_mushroom():
    """ひかる きのこ: a big and a small mushroom side by side, their caps glowing blue (their light is their own)."""
    paint = paints(0.6)
    parts: list = []
    mushroom(parts, paint, "big", 0.0, 0.0, 1.0, 6, 4)
    mushroom(parts, paint, "small", 0.35, 0.25, 0.6, 5, 3)
    return parts, 120


# ---------------------------------------------------------------- moon meadow

def moon_meadow():
    """つきの はらっぱ: the moonlit meadow's board, 60 x 100 (along +Z), laid either side of the track: its top flat at
    0.06 m in big soft patches of pale blue-green (a grid of faces, coloured by two slow waves), a narrow rim (0.8 m)
    sloping to the floor all round, and little white and lilac flowers a hair above it; it all glows a little (the
    clearing reads paler than the forest floor)."""
    paint = paints(0.95)
    parts: list = []
    W, D, TOP, RIM = 60.0, 100.0, 0.06, 0.8
    xs = [-W / 2, -W / 2 + RIM, -15.0, 0.0, 15.0, W / 2 - RIM, W / 2]
    zs = [-D / 2, -D / 2 + RIM, -32.0, -16.0, 0.0, 16.0, 32.0, D / 2 - RIM, D / 2]
    cols, rows = len(xs), len(zs)
    verts = []
    for j, z in enumerate(zs):
        for i, x in enumerate(xs):
            edge = i in (0, cols - 1) or j in (0, rows - 1)
            verts.append((x, 0.0 if edge else TOP, z))
    faces, colours = [], []
    for j in range(rows - 1):
        for i in range(cols - 1):
            a = j * cols + i
            faces.append((a, a + cols, a + cols + 1, a + 1))
            cx, cz = (xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2
            w = math.sin(cx * 0.21 + cz * 0.07) + math.sin(cz * 0.13 - cx * 0.05 + 1.3)
            rim = i in (0, cols - 2) or j in (0, rows - 2)
            colours.append(MEADOW_RIM if rim else (MEADOW_LIGHT if w > 0.6 else (MEADOW_DARK if w < -0.8 else MEADOW)))
    border = [i for i in range(cols)] + [j * cols + cols - 1 for j in range(1, rows)] + \
        [(rows - 1) * cols + i for i in range(cols - 2, -1, -1)] + [j * cols for j in range(rows - 2, 0, -1)]
    faces.append(tuple(border))
    colours.append(MEADOW_RIM)
    closed(parts, "grass", verts, faces, paint, colours)
    # Flowers: little diamonds a hair over the grass (white, every fourth lilac), clear of the board's edges.
    rng = random.Random(51)
    fverts, ffaces, fcols = [], [], []
    for i in range(38):
        fx = rng.uniform(-W / 2 + 2.0, W / 2 - 2.0)
        fz = rng.uniform(-D / 2 + 2.0, D / 2 - 2.0)
        r = rng.uniform(0.17, 0.26)
        turn = rng.uniform(0, TAU)
        i0 = len(fverts)
        for q in range(4):
            a = turn + TAU * q / 4
            fverts.append((fx + math.cos(a) * r * (1.0 if q % 2 else 0.7), TOP + 0.02, fz + math.sin(a) * r * (1.0 if q % 2 else 0.7)))
        ffaces += [(i0, i0 + 1, i0 + 2), (i0, i0 + 2, i0 + 3)]
        fcols += [FLOWER_LILAC if i % 4 == 1 else FLOWER] * 2
    obj = k.add_mesh(parts, "flowers", fverts, ffaces, [])
    slots: dict = {}
    for poly, colour in zip(obj.data.polygons, fcols):
        if colour not in slots:
            slots[colour] = len(obj.data.materials)
            obj.data.materials.append(paint(colour))
        poly.material_index = slots[colour]
        poly.use_smooth = False
        if k.gltf(poly.normal).y < 0:
            poly.flip()
    return parts, 200


# ---------------------------------------------------------------- great tree

GT_CLUMPS = [(0.0, 55.0, 0.0, 16.0), (-12.0, 43.0, 4.0, 13.0), (12.0, 44.0, -3.0, 13.0), (2.0, 42.0, 13.0, 12.0), (-2.0, 45.0, -13.0, 12.0)]


def paper_lantern(parts, paint, name, cx, top, cz, radius=1.0, height=2.4, cord=1.2):
    """A round paper lantern on a short cord: dark caps, a warm glowing body (no letters, no pattern)."""
    twig(parts, f"{name}-cord", (cx, top, cz), (cx, top - cord - 0.05, cz), 0.05, 0.05, paint(CORD), sides=3)
    y1 = top - cord
    y0 = y1 - height
    prof = [(y0, radius * 0.42, LANTERN_CAP), (y0 + height * 0.14, radius * 0.86, WARM_DEEP), (y0 + height * 0.5, radius, WARM),
            (y0 + height * 0.86, radius * 0.86, LANTERN_CAP), (y1, radius * 0.42, LANTERN_CAP)]
    obj = v.lathe_y(parts, name, prof, (cx, cz), 6, paint, smooth=lambda c, n: abs(n.y) < 0.85, phase=TAU / 12)
    return obj


def great_tree():
    """おおきな き: the landmark of the fireflies' square. A thick trunk (Ø 14 at its foot) whose bark twists up in two
    browns, six roots spreading on the ground, four boughs up into a crown of five big clumps fused into one, one hollow
    low on the trunk facing the square (+Z; only one, never two eyes and a mouth), and six warm paper lanterns hanging
    under the crown (they glow)."""
    paint = paints(0.9)
    parts: list = []
    # The trunk: twisting bark (each ring turned a little more), ridges in two browns, lighter on the moon's side.
    n = 14
    prof = [(0.0, 7.4), (1.6, 6.8), (5.0, 6.35), (12.0, 5.9), (21.0, 5.4), (30.0, 5.0), (39.0, 4.6), (44.0, 4.2)]
    rings = []
    for j, (y, r) in enumerate(prof):
        rings.append([(math.cos(TAU * i / n + j * 0.16) * r * (1.0 + (0.04 if i % 2 else -0.03)), y,
                       math.sin(TAU * i / n + j * 0.16) * r * (1.0 + (0.04 if i % 2 else -0.03))) for i in range(n)])
    verts, faces, tags = rv.body(rings)

    def bark(idx):
        tag = tags[idx]
        if tag[0] != "gap":
            return TRUNK_DARK
        j = tag[2]
        return TRUNK_DARK if j % 2 else (TRUNK_LIGHT if j in (0, 1, 13) else TRUNK)

    trunk_obj = closed(parts, "trunk", verts, faces, paint, [bark(i) for i in range(len(faces))])
    # Roots: six thick roots from low on the trunk out and down to the ground, sunk into it.
    for i in range(6):
        a = TAU * i / 6 + 0.25
        ca, sa = math.cos(a), math.sin(a)
        pts = [(ca * 4.5, 5.4, sa * 4.5), (ca * 7.4, 3.3, sa * 7.4), (ca * 10.4, 1.5, sa * 10.4), (ca * 13.4, 0.5, sa * 13.4)]
        root = tube(parts, f"root-{i}", pts, [2.5, 2.1, 1.45, 0.95], paint(TRUNK if i % 2 else TRUNK_DARK), sides=5)
        cut_floor(root)
    # Boughs into the side clumps.
    for i, (cx, cy, cz, r) in enumerate(GT_CLUMPS[1:]):
        tube(parts, f"bough-{i}", [(cx * 0.12, 33.0, cz * 0.12), (cx * 0.45, cy - r * 0.55, cz * 0.45), (cx * 0.7, cy - r * 0.2, cz * 0.7)],
             [2.4, 1.6, 1.1], paint(TRUNK), sides=5)
    # The crown: the five clumps (and a few smaller lobes on their rims) fused into one soft mass.
    vols = [((r * 2, r * 1.7, r * 2), (x, y, z)) for x, y, z, r in GT_CLUMPS]
    for i, (x, y, z, r) in enumerate(GT_CLUMPS[1:]):
        out = Vector((x, 0, z)).normalized()
        side = Vector((-out.z, 0, out.x))
        for sg in (-1, 1):
            p = Vector((x, y, z)) + out * r * 0.55 + side * sg * r * 0.55
            vols.append(((r * 1.1, r * 0.95, r * 1.1), (p.x, y - r * 0.15 + sg * 1.5, p.z)))
    crown = rv.clay(vols, "crown", paint(LEAF), 1250, 1.1, ground=False, smooth=3)

    def leaves(c, nn):
        if nn.y < -0.45:
            return LEAF_DARK
        if nn.y > 0.55 and nn.x > 0.15:
            return LEAF_MOON
        if nn.y > 0.45 or nn.x > 0.6:
            return LEAF_LIGHT
        return LEAF_DARK if hash01(round(c.x / 3.0), round(c.y / 3.0), round(c.z / 3.0)) < 0.3 else LEAF

    rv.recolour(crown, paint, leaves)
    for poly in crown.data.polygons:
        poly.use_smooth = False
    parts.append(crown)
    # The one hollow: a dark oval low on the trunk, facing +Z, in a soft rim of lighter bark.
    tree = k.world_tree(trunk_obj)
    p, nrm = v.on_surface(tree, (1.2, 9.0, 12.0), (1.2, 9.0, 0.0))
    rim = v.sticker(parts, "hollow-rim", tuple(p), tuple(nrm), (3.6, 4.6), paint(HOLLOW_RIM), 10, lift=0.03)
    v.hug(rim, trunk_obj, 0.03)
    hole = v.sticker(parts, "hollow", tuple(p), tuple(nrm), (2.7, 3.6), paint(HOLLOW), 10, lift=0.06)
    v.hug(hole, trunk_obj, 0.06)
    # Six lanterns hanging under the crown (the stand-in's ring: radius 15, their middles about 31.5 up).
    ctree = k.world_tree(crown)
    for i in range(6):
        a = TAU * i / 6 + 0.3
        x, z = math.cos(a) * 15.0, math.sin(a) * 15.0
        hit = ctree.ray_cast(Vector(k.to_blender((x, 20.0, z))), Vector((0, 0, 1)))
        top = (k.gltf(hit[0]).y + 0.6) if hit[0] is not None else 34.0
        cord = max(0.6, top - 33.6)
        paper_lantern(parts, paint, f"lantern-{i}", x, top, z, cord=cord)
    return parts, 2500


# ---------------------------------------------------------------- plaza deck

def plaza_deck():
    """ひろばの デッキ: ten planks 40 m long in two browns (one slab, a strip per plank), light cut ends, darker edges,
    on six square posts."""
    paint = paints(0.85)
    parts: list = []
    x0, x1, y0, y1, half = -9.95, 9.95, 0.42, 0.7, 20.0
    n = 10
    xs = [x0 + (x1 - x0) * i / n for i in range(n + 1)]
    m = n + 1
    verts = [(x, y1, -half) for x in xs] + [(x, y1, half) for x in xs] + [(x0, y0, -half), (x1, y0, -half), (x1, y0, half), (x0, y0, half)]
    b0, b1, b2, b3 = 2 * m, 2 * m + 1, 2 * m + 2, 2 * m + 3
    faces, cols = [], []
    for i in range(n):
        faces.append((i, m + i, m + i + 1, i + 1))
        cols.append(DECK if i % 2 else DECK_DARK)
    faces.append(tuple([b0] + list(range(m)) + [b1]))
    cols.append(DECK_END)
    faces.append(tuple([b3] + [m + i for i in range(m)] + [b2]))
    cols.append(DECK_END)
    faces += [(0, b0, b3, m), (n, m + n, b2, b1), (b0, b1, b2, b3)]
    cols += [DECK_DARK, DECK_DARK, POST_DARK]
    closed(parts, "deck", verts, faces, paint, cols)
    # Six square posts down to the floor (their tops and feet are hidden: open, wound outward).
    for x in (-9.0, 9.0):
        for z in (-18.0, 0.0, 18.0):
            h = 0.27
            pv = [(x - h, 0.0, z - h), (x + h, 0.0, z - h), (x + h, 0.0, z + h), (x - h, 0.0, z + h)]
            pv += [(px, 0.43, pz) for px, _, pz in pv]
            obj = k.add_mesh(parts, f"post-{x}-{z}", pv, [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], [paint(POST_DARK)])
            flip_out(obj)
    return parts, 100


# ---------------------------------------------------------------- big stump

def big_stump():
    """きりかぶ: a big tree stump, its bark in ridges (two browns), five roots flaring at its foot, and on its flat top
    the growth rings: a light ring of cut wood, a darker ring, a light middle."""
    paint = paints(0.9)
    parts: list = []
    n = 12
    rings = [ring(0, 0.0, 0, 4.5, 4.5, n), ring(0, 2.75, 0, 4.12, 4.12, n, 0.1), ring(0, 3.0, 0, 3.92, 3.92, n, 0.1),
             ring(0, 3.0, 0, 2.8, 2.8, n, 0.1), ring(0, 3.0, 0, 1.75, 1.75, n, 0.1)]
    verts, faces, tags = rv.body(rings, top=(0.0, 3.0, 0.0))

    def colour(tag):
        if tag[0] == "top":
            return WOOD_CUT
        if tag[0] == "cap_bottom":
            return TRUNK_DARK
        r, j = tag[1], tag[2]
        if r == 0:
            return TRUNK_DARK if j % 2 else (TRUNK_LIGHT if j in (0, 2, 10) else TRUNK)
        return (TRUNK_LIGHT, WOOD_CUT, WOOD_HEART)[r - 1]

    closed(parts, "stump", verts, faces, paint, [colour(t) for t in tags])
    # Five root flares: wedges from the bark down and out onto the ground.
    for i in range(5):
        a = TAU * i / 5 + 0.5
        ca, sa = math.cos(a), math.sin(a)
        ta, tb = -sa, ca

        def at(r, y, t):
            return (ca * r + ta * t, y, sa * r + tb * t)

        verts = [at(4.0, 1.7, 0.0), at(4.1, 0.0, -0.55), at(4.1, 0.0, 0.55), at(5.05, 0.0, 0.0), at(4.25, 0.9, -0.38), at(4.25, 0.9, 0.38)]
        faces = [(0, 4, 3), (0, 3, 5), (4, 1, 3), (5, 3, 2), (1, 2, 3), (0, 5, 2), (0, 2, 1), (0, 1, 4)]
        closed(parts, f"root-{i}", verts, faces, paint, [TRUNK, TRUNK_DARK, TRUNK, TRUNK_DARK, TRUNK_DARK, TRUNK_DARK, TRUNK_DARK, TRUNK_DARK])
    return parts, 200


# ---------------------------------------------------------------- log bridge end

def log_bridge_end():
    """まるきばしの はし（こわれた）: five round logs side by side (+Z toward the gap), their near ends cut light, their
    far ends splintered in pale wood; a cross log binds them, two posts hold the near end up."""
    paint = paints(0.9)
    parts: list = []
    rng = random.Random(7)
    sides = 5
    for i in range(5):
        x = -2.4 + i * 1.2
        length = 3.6 + hash01(i, 2, 5) * 0.8
        z0, z1 = 2.2 - length, 2.2
        r = 0.29
        back = [(x + math.cos(TAU * j / sides + 0.3) * r, 1.1 + math.sin(TAU * j / sides + 0.3) * r, z0) for j in range(sides)]
        front = [(x + math.cos(TAU * j / sides + 0.3) * r, 1.1 + math.sin(TAU * j / sides + 0.3) * r, z1 + rng.uniform(-0.1, 0.12)) for j in range(sides)]
        tip = (x + rng.uniform(-0.08, 0.08), 1.1 + rng.uniform(-0.06, 0.08), z1 + 0.42 + rng.uniform(-0.05, 0.08))
        verts, faces, tags = rv.body([back, front], top=tip)
        cols = []
        for tag in tags:
            if tag[0] == "top":
                cols.append("#B08860" if tag[1] % 2 else "#8A6A4A")
            elif tag[0] == "cap_bottom":
                cols.append(WOOD_CUT)
            else:
                cols.append(TRUNK_DARK if tag[2] in (3, 4) else TRUNK)
        closed(parts, f"log-{i}", verts, faces, paint, cols)
    tube(parts, "cross", [(-2.95, 0.84, -0.9), (2.95, 0.84, -0.9)], [0.17, 0.17], paint(TRUNK_DARK), sides=3)
    for x in (-2.7, 2.7):
        twig(parts, f"post-{x}", (x, 0.0, -1.6), (x, 0.84, -1.6), 0.21, 0.18, paint(TRUNK_DARK), sides=3)
    return parts, 120


# ---------------------------------------------------------------- thicket

def thicket():
    """いきどまりの しげみ: a soft wall of round leaves (no thorns) across a dead end, the train's side -Z; lighter
    leaves on top and toward the moon, little pale flowers on the train's side."""
    paint = paints(0.9)
    vols = []
    for i in range(5):
        x = -3.2 + i * 1.6
        vols.append(((2.9, 3.4 + (i % 2) * 0.8, 1.7), (x, 1.55 + (i % 2) * 0.45, 0.0)))
    for i in range(4):
        vols.append(((2.0, 1.6, 1.5), (-2.4 + i * 1.6, 0.6, -0.05)))
    wall = rv.clay(vols, "thicket", paint(LEAF), 170, 0.11, ground=True, smooth=3)
    rv.recolour(wall, paint, lambda c, n: LEAF_DARK if (n.y < -0.3 or c.y < 0.35) else (LEAF_MOON if n.y > 0.7 else (LEAF_LIGHT if n.y > 0.35 or n.x > 0.6 else (LEAF_DARK if hash01(round(c.x * 1.3), round(c.y * 1.4)) < 0.25 else LEAF))))
    for poly in wall.data.polygons:
        poly.use_smooth = False
    parts: list = [wall]
    tree = k.world_tree(wall)
    for i, (x, y) in enumerate(((-2.9, 1.3), (-1.2, 2.3), (0.4, 1.0), (1.9, 2.0), (3.1, 1.15), (-0.4, 2.9))):
        p, nrm = v.on_surface(tree, (x, y, -3.0), (x, y, 0.0))
        v.hug(v.sticker(parts, f"flower-{i}", tuple(p), tuple(nrm), (0.26, 0.26), paint(FLOWER if i % 3 else FLOWER_LILAC), 5, tilt=i, lift=0.02), wall, 0.02)
    return parts, 200


# ---------------------------------------------------------------- birdhouse

def birdhouse_upside():
    """さかさまの すばこ: Sakasa's doing, a birdhouse hung upside down: its pointed roof below, the box above, the round
    hole +Z low on the front (it was high), the perch above it, a little hanging strap on top; her pink swirl on the
    front's upper half (its own material: the game makes it glow while the light finds it)."""
    paint = paints(0.8)
    parts: list = []
    # The box: 0.44 wide, from 0.3 up to 0.75.
    w = 0.22
    verts = [(-w, 0.3, -w), (w, 0.3, -w), (w, 0.3, w), (-w, 0.3, w), (-w, 0.75, -w), (w, 0.75, -w), (w, 0.75, w), (-w, 0.75, w)]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    closed(parts, "box", verts, faces, paint, [BIRDHOUSE_ROOF, BIRDHOUSE, BIRDHOUSE, BIRDHOUSE, BIRDHOUSE, BIRDHOUSE])
    # The roof, upside down: a four-sided point under the box, its eaves standing out past the walls.
    e = 0.283
    rverts = [(-e, 0.33, -e), (e, 0.33, -e), (e, 0.33, e), (-e, 0.33, e), (0.0, 0.0, 0.0)]
    rfaces = [(0, 1, 2, 3), (1, 0, 4), (2, 1, 4), (3, 2, 4), (0, 3, 4)]
    closed(parts, "roof", rverts, rfaces, paint, [BIRDHOUSE_ROOF] * 5)
    # The hole (low on the front now) and the perch above it.
    v.sticker(parts, "hole", (0.0, 0.43, w), (0, 0, 1), (0.13, 0.13), paint(BIRDHOUSE_DARK), 6, lift=0.004)
    twig(parts, "perch", (0.0, 0.53, w), (0.0, 0.53, w + 0.08), 0.016, 0.016, paint(BIRDHOUSE_ROOF), sides=3)
    # Sakasa's swirl on the front's upper half: a pink spiral ribbon.
    pts = []
    for i in range(12):
        t = i / 11
        a = 0.6 + t * TAU * 1.6
        rr = 0.012 + 0.085 * t
        pts.append((math.cos(a) * rr, 0.645 + math.sin(a) * rr, w + 0.006))
    swirl = k.ribbon_decal(parts, "swirl", pts, 0.026, paint(SWIRL), taper=False)
    if k.gltf(swirl.data.polygons[0].normal).z < 0:
        swirl.data.flip_normals()
    return parts, 80


def trace_split(material_name):
    """The swirl is the material the game lights (4-2's "trace-swirl")."""
    return "trace-swirl" if SWIRL in material_name else None


# ---------------------------------------------------------------- bell branch

def bell_branch():
    """記録③の えだ: a thick branch along X, its thick end +X (into the tree), the thin end -X with a little clump of
    leaves; an iron hook hangs under it at x -1, where the bell hangs. The hook's foot is the model's lowest point."""
    paint = paints(0.9)
    parts: list = []
    y = 0.5
    tube(parts, "branch", [(3.0, y + 0.02, 0.0), (0.2, y + 0.06, 0.03), (-2.75, y + 0.12, 0.04)], [0.38, 0.27, 0.12], paint(TRUNK), sides=5)
    puff(parts, "leaves", (-2.78, y + 0.2, 0.0), (0.3, 0.2, 0.36), paint, leafy(3), n=5, lat=1, seed=5, jitter=0.1)
    hook = [(-1.0, y - 0.12, 0.0), (-1.0, 0.09, 0.0), (-1.03, 0.0, 0.0), (-1.11, 0.05, 0.0)]
    tube(parts, "hook", hook, [0.025, 0.022, 0.022, 0.02], paint(IRON), sides=3)
    return parts, 60


# ---------------------------------------------------------------- moonstone

def moonstone():
    """記録②「つきいし」: a round pebble of pale moon yellow, lighter on top, that keeps the moonlight (it glows
    softly); a soft white shine on its top."""
    paint = paints(0.35)
    parts: list = []

    def colour(c, n):
        return MOONSTONE_LIGHT if n.y > 0.92 else (MOONSTONE_SHADE if n.y < -0.3 else MOONSTONE)

    puff(parts, "stone", (0.0, 0.15, 0.0), (0.25, 0.15, 0.2), paint, colour, n=8, lat=4, seed=3, jitter=0.025, smooth=True)
    tree = k.world_tree(parts[0])
    p, nrm = v.on_surface(tree, (0.09, 0.6, -0.04), (0.05, 0.15, -0.02))
    v.hug(v.sticker(parts, "shine", tuple(p), tuple(nrm), (0.08, 0.05), paint("#FFFFFF"), 6, tilt=0.4, lift=0.004), parts[0], 0.004)
    return parts, 80


# ---------------------------------------------------------------- lantern bell

def lantern_bell():
    """記録③「ランタンの すず」: a little iron lantern (a ring to hang it by, a six-sided cap, six warm lit panes, a
    base) with a small gold bell under it, its clapper peeking out."""
    paint = paints(0.5)
    parts: list = []
    loop = [(-0.004, 0.6, 0.0), (-0.045, 0.64, 0.0), (0.0, 0.69, 0.0), (0.045, 0.64, 0.0), (0.004, 0.6, 0.0)]
    tube(parts, "ring", loop, [0.012] * len(loop), paint(IRON_DARK), sides=3)
    prof = [(0.27, 0.075, IRON_DARK), (0.29, 0.13, IRON), (0.31, 0.125, GLASS), (0.47, 0.125, IRON), (0.5, 0.15, IRON_LIGHT),
            (0.535, 0.105, IRON), (0.605, 0.0, IRON)]
    v.lathe_y(parts, "lantern", prof, (0.0, 0.0), 6, paint, smooth=False, phase=TAU / 12)
    twig(parts, "stem", (0.0, 0.28, 0.0), (0.0, 0.19, 0.0), 0.012, 0.012, paint(IRON_DARK), sides=3)
    bell = [(0.02, 0.09, GOLD), (0.05, 0.086, GOLD_LIGHT), (0.11, 0.07, GOLD), (0.17, 0.045, GOLD), (0.205, 0.0, GOLD)]
    v.lathe_y(parts, "bell", bell, (0.0, 0.0), 8, paint, smooth=lambda c, n: abs(n.y) < 0.95)
    bead(parts, "clapper", (0.0, 0.022, 0.0), (0.024, 0.024, 0.024), paint, IRON_DARK)
    return parts, 200


# ---------------------------------------------------------------- fireflies

# The stand-in's six fireflies (night-placeholders.ts fireflyWait: hash(i, 1|2|3, 6)).
def ts_hash(x, y, z):
    sv = math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453
    return sv - math.floor(sv)


def firefly_wait():
    """いきどまりで まつ ほたる: six fireflies where the stand-in's were (hovering 0.4-1.3 m up in front of the
    thicket), glowing warm yellow-green, two of them perched on the tips of tall grass blades rising from the ground."""
    paint = paints(0.6)
    parts: list = []
    flies = [((ts_hash(i, 1, 6) - 0.5) * 2, 0.4 + ts_hash(i, 2, 6) * 1.1, (ts_hash(i, 3, 6) - 0.5) * 0.6) for i in range(6)]
    for i, (x, y, z) in enumerate(flies):
        bead(parts, f"fly-{i}", (x, y, z), (0.09, 0.075, 0.09), paint, FIREFLY_WARM if i % 3 == 0 else FIREFLY)
    # Two grass blades up to the lowest two (closed three-sided spikes).
    low = sorted(range(6), key=lambda i: flies[i][1])[:2]
    for b, i in enumerate(low):
        x, y, z = flies[i]
        base = (x + 0.12 * (1 if b else -1), 0.0, z - 0.05)
        verts = [(base[0] + math.cos(TAU * j / 3) * 0.05, 0.0, base[2] + math.sin(TAU * j / 3) * 0.05) for j in range(3)] + [(x, y - 0.06, z)]
        closed(parts, f"blade-{b}", verts, [(0, 1, 2), (0, 3, 1), (1, 3, 2), (2, 3, 0)], paint, [GRASS, GRASS_LIGHT, GRASS, GRASS_LIGHT])
    return parts, 60


def firefly_grass():
    """ほたるの くさむら: a low tuft of dark grass by a firefly fork, the blades leaning out, lighter at their tips (the
    game's resting fireflies sit round it)."""
    paint = paints(0.85)
    parts: list = []
    rng = random.Random(19)
    for i in range(10):
        x = (ts_hash(i, 1, 9) - 0.5) * 1.2 if i < 9 else 0.05
        z = (ts_hash(i, 2, 9) - 0.5) * 0.8 if i < 9 else -0.05
        h = 0.4 + ts_hash(i, 3, 9) * 0.3 if i < 9 else 0.7
        a = rng.uniform(0, TAU)
        lean = rng.uniform(0.12, 0.3)
        w = 0.07
        base = [(x + math.cos(a + TAU * j / 3) * w, 0.0, z + math.sin(a + TAU * j / 3) * w) for j in range(3)]
        out = Vector((x, 0, z)).normalized() if abs(x) + abs(z) > 0.05 else Vector((1, 0, 0))
        mid = [(px + out.x * lean * 0.4 * h, h * 0.5, pz + out.z * lean * 0.4 * h) for px, _, pz in [(x + (bx - x) * 0.6, 0, z + (bz - z) * 0.6) for bx, _, bz in base]]
        tip = (x + out.x * lean * h, h, z + out.z * lean * h)
        verts, faces, tags = rv.body([base, mid], top=tip, cap_bottom=False)
        cols = [GRASS_LIGHT if t[0] == "top" else GRASS for t in tags]
        obj = k.add_mesh(parts, f"blade-{i}", verts, faces, [])
        slots: dict = {}
        for poly, colour in zip(obj.data.polygons, cols):
            if colour not in slots:
                slots[colour] = len(obj.data.materials)
                obj.data.materials.append(paint(colour))
            poly.material_index = slots[colour]
            poly.use_smooth = False
        flip_out(obj)
    return parts, 100


def flip_out(obj):
    """An open part (a spike, a post's sides): each face turned to face away from the part's middle."""
    mesh = obj.data
    cx = sum(vv.co.x for vv in mesh.vertices) / len(mesh.vertices)
    cy = sum(vv.co.y for vv in mesh.vertices) / len(mesh.vertices)
    cz = sum(vv.co.z for vv in mesh.vertices) / len(mesh.vertices)
    centre = Vector((cx, cy, cz))
    for poly in mesh.polygons:
        if poly.normal.dot(poly.center - centre) < 0:
            poly.flip()


# ---------------------------------------------------------------- firefly swarms (glTF POINTS, written directly)

def swarm_points(r, n):
    """The stand-in's points (night-placeholders.ts fireflySwarm): within a sphere of radius r whose bottom is the
    origin, squashed to 0.7 up and down."""
    out = []
    for i in range(n):
        u = ts_hash(i, 1, n) * 2 - 1
        a = ts_hash(i, 2, n) * TAU
        d = ts_hash(i, 3, n) ** (1 / 3) * r
        q = math.sqrt(1 - u * u)
        out.append((math.cos(a) * q * d, r + u * d * 0.7, math.sin(a) * q * d))
    return out


def write_points_glb(name, points, colours):
    """A GLB of one POINTS primitive (positions, colours) in a material "firefly-swarm" (yellow-green, emissive)."""
    n = len(points)
    pos = b"".join(struct.pack("<3f", *p) for p in points)
    col = b"".join(struct.pack("<3f", *c) for c in colours)
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    base = k.hex_linear(FIREFLY)
    gltf = {
        "asset": {"version": "2.0", "generator": "assets/blender/night.py"},
        "scene": 0,
        "scenes": [{"name": "Scene", "nodes": [0]}],
        "nodes": [{"name": name, "mesh": 0}],
        "meshes": [{"name": name, "primitives": [{"attributes": {"POSITION": 0, "COLOR_0": 1}, "mode": 0, "material": 0}]}],
        "materials": [{"name": "firefly-swarm", "emissiveFactor": list(base),
                       "pbrMetallicRoughness": {"baseColorFactor": [*base, 1.0], "metallicFactor": 0.0, "roughnessFactor": 1.0}}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": n, "type": "VEC3", "min": lo, "max": hi},
            {"bufferView": 1, "componentType": 5126, "count": n, "type": "VEC3"},
        ],
        "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": len(pos), "target": 34962},
                        {"buffer": 0, "byteOffset": len(pos), "byteLength": len(col), "target": 34962}],
        "buffers": [{"byteLength": len(pos) + len(col)}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    binary = pos + col
    binary += b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(js) + 8 + len(binary)
    out = struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(binary), b"BIN\0") + binary
    k.MODEL_DIR.mkdir(parents=True, exist_ok=True)
    path = k.MODEL_DIR / f"{name}.glb"
    path.write_bytes(out)
    print("MODEL_METRICS=" + json.dumps({"model": name, "points": n, "dimensions": [round(hi[i] - lo[i], 3) for i in range(3)],
                                         "min": [round(x, 3) for x in lo], "max": [round(x, 3) for x in hi], "kb": round(len(out) / 1024, 1)},
                                        sort_keys=True))


def firefly_swarm(name, r, n):
    """ほたるの むれ: the stand-in's points, most of them yellow-green, every fourth a warmer pale yellow and every
    seventh a little greener, so the cloud twinkles in a few shades. Writes the GLB and renders a preview (little
    glowing balls on a night sky)."""
    pts = swarm_points(r, n)
    cols = []
    for i in range(n):
        hx = FIREFLY_WARM if i % 4 == 1 else ("#BFF26A" if i % 7 == 3 else FIREFLY)
        cols.append(k.hex_linear(hx))
    write_points_glb(name, pts, cols)
    # Preview: a small glowing ball per point.
    k.reset()
    parts: list = []
    for i, p in enumerate(pts):
        hx = FIREFLY_WARM if i % 4 == 1 else ("#BFF26A" if i % 7 == 3 else FIREFLY)
        k.add_ellipsoid(parts, f"p{i}", (0.12 * r / 3 + 0.1,) * 3, p, s.mat(f"fly {hx}", hx, 0.9, 3.0), segments=6, rings=4, smooth=True)
    model = k.join(parts, name)
    night_preview(model, name, (0.55, -0.72, 0.3), (512, 400))


def night_preview(model, name, direction, size):
    """v.preview's camera fit, on a deep night sky with a dim blue moonlight (the fireflies show)."""
    v.preview(model, name, direction, size)
    scene = bpy.context.scene
    tree = scene.world.node_tree
    for node in tree.nodes:
        if node.type == "BACKGROUND":
            node.inputs["Color"].default_value = (0.03, 0.04, 0.12, 1)
            node.inputs["Strength"].default_value = 1.0
    for obj in scene.objects:
        if obj.type == "LIGHT":
            obj.data.energy = 0.6
            obj.data.color = (0.8, 0.85, 1.0)
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------- signs

SIGN_Y0, SIGN_W, SIGN_H = 1.22, 1.18, 0.92


def board_outline(w, h, cut):
    """An octagon w x h (corners cut by `cut`), counter-clockwise from the bottom right."""
    x, y = w / 2, h / 2
    return [(x - cut, -y), (x, -y + cut), (x, y - cut), (x - cut, y), (-x + cut, y), (-x, y - cut), (-x, -y + cut), (-x + cut, -y)]


def sign_post_board(parts, paint, board, edge):
    """A three-sided post behind a chamfered board (the board's face +Z at z 0.045). Returns the face's z."""
    twig(parts, "post", (0.0, 0.0, -0.035), (0.0, SIGN_Y0 + SIGN_H * 0.6, -0.035), 0.075, 0.065, paint(POST), sides=3)
    cy = SIGN_Y0 + SIGN_H / 2
    out = board_outline(SIGN_W, SIGN_H, 0.13)
    obj = s.plate(parts, "board", (0.0, cy, 0.005), (1, 0, 0), (0, 1, 0), out, 0.08, [paint(board), paint(edge)])
    for i, poly in enumerate(obj.data.polygons):
        poly.material_index = 0 if i < 2 else 1
    return 0.046, cy


def frame_ring(w, h, cut, t):
    """The flat ring between the board's outline and one `t` inside it (16 triangles)."""
    outer = board_outline(w, h, cut)
    inner = board_outline(w - 2 * t, h - 2 * t, cut * 0.75)
    tris = []
    for i in range(8):
        a, b = outer[i], outer[(i + 1) % 8]
        c, d = inner[(i + 1) % 8], inner[i]
        tris += [(a, b, c), (a, c, d)]
    return tris


def hush_picture(cx, cy, size):
    """The hush picture: a crescent moon (no face) and a rising ZZZ, `size` across, centred at (cx, cy)."""
    moon = crescent(cx - size * 0.16, cy - size * 0.04, size * 0.3)
    zz = zed(cx + size * 0.1, cy - size * 0.02, size * 0.13, size * 0.035) + zed(cx + size * 0.27, cy + size * 0.15, size * 0.1, size * 0.03) + \
        zed(cx + size * 0.4, cy + size * 0.29, size * 0.075, size * 0.025)
    return moon, zz


def sign_hush():
    """しーっ の ふだ: a navy board on a post, a thin lighter border, a yellow crescent and a rising ZZZ (no face)."""
    paint = paints(0.7)
    parts: list = []
    z, cy = sign_post_board(parts, paint, NAVY, NAVY_EDGE)
    v.flat_tris(parts, "border", [((x0, y0 + cy), (x1, y1 + cy), (x2, y2 + cy)) for (x0, y0), (x1, y1), (x2, y2) in frame_ring(SIGN_W, SIGN_H, 0.13, 0.05)], z,
                paint(NAVY_LINE))
    moon, zz = hush_picture(0.0, cy, 0.95)
    v.flat_tris(parts, "moon", moon, z + 0.002, paint(MOON))
    v.flat_tris(parts, "zzz", zz, z + 0.002, paint(MOON))
    return parts, 80


def sign_whistle_reversed():
    """たぬきの ふだ: a white board in a wooden border: a little tanuki's round dark shadow dancing (arms up, its
    striped tail out) and the hush picture beside it (a crescent and ZZZ). No pink swirl."""
    paint = paints(0.7)
    parts: list = []
    z, cy = sign_post_board(parts, paint, BOARD_WHITE, POST)
    v.flat_tris(parts, "border", [((x0, y0 + cy), (x1, y1 + cy), (x2, y2 + cy)) for (x0, y0), (x1, y1), (x2, y2) in frame_ring(SIGN_W, SIGN_H, 0.13, 0.05)], z,
                paint(POST))
    tx, ty = -0.2, cy - 0.12
    # Round body and head, small round ears (a tanuki's, not pointed).
    shadow = fan(tx, ty, 0.17, 0.19, 7) + fan(tx, ty + 0.27, 0.125, 0.11, 6, 0.3)
    shadow += fan(tx - 0.085, ty + 0.36, 0.04, 0.035, 4, 0.4) + fan(tx + 0.085, ty + 0.36, 0.04, 0.035, 4, 0.4)
    shadow += bar(tx - 0.13, ty + 0.08, tx - 0.27, ty + 0.27, 0.06) + bar(tx + 0.13, ty + 0.08, tx + 0.27, ty + 0.27, 0.06)
    shadow += bar(tx + 0.12, ty - 0.12, tx + 0.34, ty - 0.2, 0.09)
    v.flat_tris(parts, "tanuki", shadow, z + 0.002, paint(TANUKI_DARK))
    v.flat_tris(parts, "tail-stripe", bar(tx + 0.25, ty - 0.13, tx + 0.29, ty - 0.24, 0.035), z + 0.004, paint(TANUKI))
    moon = crescent(0.2, cy + 0.08, 0.11, steps=3)
    zz = zed(0.29, cy + 0.12, 0.07, 0.022) + zed(0.39, cy + 0.24, 0.055, 0.02)
    v.flat_tris(parts, "moon", moon, z + 0.002, paint(MOON))
    v.flat_tris(parts, "zzz", zz, z + 0.002, paint(MOON))
    return parts, 100


# ---------------------------------------------------------------- rabbits

def rabbit_volumes(at, sc, rot):
    """One rabbit curled up asleep (`sc` times the single one, turned `rot` about the vertical, at `at`): body, head,
    ears laid back along the back, a round tail, front paws tucked in. Returns (volumes, colours, head centre, turn)."""
    c, sn = math.cos(rot), math.sin(rot)

    def place(p):
        x, y, z = p
        return (at[0] + (x * c + z * sn) * sc, at[1] + y * sc, at[2] + (-x * sn + z * c) * sc)

    def size(sz):
        w, h, d = sz
        # Turned volumes keep their size along their own axes; the turns used here are small (under 35 degrees).
        return (w * sc, h * sc, d * sc)

    body_col = lambda cc, n: RABBIT_SHADE if n.y < -0.35 else RABBIT  # noqa: E731
    ear_col = lambda cc, n: EAR_PINK if n.y > 0.55 else RABBIT  # noqa: E731
    vols = [(size((0.46, 0.31, 0.58)), place((0.0, 0.155, -0.08))), (size((0.27, 0.25, 0.27)), place((0.0, 0.205, 0.225))),
            (size((0.085, 0.07, 0.3)), place((0.055, 0.29, 0.02))), (size((0.085, 0.07, 0.3)), place((-0.055, 0.29, 0.02))),
            (size((0.11, 0.1, 0.1)), place((0.0, 0.15, -0.35))), (size((0.08, 0.06, 0.12)), place((0.07, 0.03, 0.27))),
            (size((0.08, 0.06, 0.12)), place((-0.07, 0.03, 0.27)))]
    cols = [body_col, RABBIT, ear_col, ear_col, RABBIT, RABBIT_TAN, RABBIT_TAN]
    return vols, cols, place((0.0, 0.205, 0.225)), (c, sn)


def rabbit_face(parts, paint, tree, head, sc, turn, body, tag):
    """Closed eyes (two small soft curves) and a tiny pink nose on a rabbit's head."""
    c, sn = turn
    fwd = Vector((sn, 0.0, c))
    side = Vector((c, 0.0, -sn))
    hd = Vector(head)
    for sg in (-1, 1):
        # A closed eye: a soft arc dipping in the middle, on the side of the face (about 45 degrees out).
        pts = []
        for t in (0.0, 0.5, 1.0):
            az = sg * math.radians(36 + 18 * t)
            el = math.radians(16 - 6 * (1 - (2 * t - 1) ** 2))
            d = fwd * (math.cos(az) * math.cos(el)) + side * (math.sin(az) * math.cos(el)) + Vector((0, math.sin(el), 0))
            pts.append(v.on_surface(tree, tuple(hd + d * 0.5 * sc), tuple(hd)))
        v.hug(v.surface_line(parts, f"eye-{tag}-{sg}", pts, 0.018 * sc, paint(LID)), body, 0.004 * sc)
    p, nrm = v.on_surface(tree, tuple(hd + fwd * 0.4 * sc + Vector((0, -0.01 * sc, 0))), tuple(hd))
    v.hug(v.sticker(parts, f"nose-{tag}", tuple(p), tuple(nrm), (0.03 * sc, 0.022 * sc), paint(NOSE_PINK), 5, lift=0.003), body, 0.003 * sc)


def bunny_sleep():
    """ねむる うさぎ: one rabbit curled up asleep: round and white with a creamy underside, its ears laid back along its
    back (pink inside), a round tail, front paws tucked in; eyes closed (two little lines) and a tiny pink nose."""
    paint = paints(0.75)
    vols, cols, head, turn = rabbit_volumes((0.0, 0.0, 0.0), 1.0, 0.0)
    body = rv.painted_clay(paint, vols, cols, "bunny", 120, 0.016)
    parts: list = [body]
    tree = k.world_tree(body)
    rabbit_face(parts, paint, tree, head, 1.0, turn, body, "a")
    return parts, 150


def bunny_family():
    """記録①「ねむる うさぎの おやこ」: a round straw nest (a lumpy rim in three straws round a flat floor), a big
    rabbit asleep in it and two little ones curled up in front, each with closed eyes and a pink nose."""
    paint = paints(0.75)
    parts: list = []
    # The nest: a lumpy ring of straw and its floor.
    n = 12
    rings = []
    for j, (dr, y) in enumerate(((0.0, 0.0), (0.12, 0.12), (0.0, 0.24), (-0.14, 0.15))):
        rr = []
        for i in range(n):
            a = TAU * i / n
            wob = 1.0 + 0.05 * math.sin(a * 3 + j)
            rr.append((math.cos(a) * (0.57 + dr) * 1.1 * wob, y + (0.03 if (i + j) % 2 else 0.0), math.sin(a) * (0.57 + dr) * wob))
        rings.append(rr)
    rings.append([(math.cos(TAU * i / n) * 0.4 * 1.1, 0.06, math.sin(TAU * i / n) * 0.4) for i in range(n)])
    verts, faces, tags = rv.body(rings, top=(0.0, 0.06, 0.0))
    cols = []
    for idx, tag in enumerate(tags):
        if tag[0] == "top":
            cols.append(STRAW_DARK)
        elif tag[0] == "gap":
            cols.append(STRAW_LIGHT if (tag[1] == 1 and tag[2] % 3 == 0) else (STRAW if (tag[2] + tag[1]) % 2 else STRAW_DARK))
        else:
            cols.append(STRAW_DARK)
    closed(parts, "nest", verts, faces, paint, cols)
    # The rabbits: the mother in the middle, two little ones in front.
    for tag, (at, sc, rot) in enumerate((((0.0, 0.05, -0.08), 1.2, 0.0), ((-0.32, 0.06, 0.28), 0.65, 0.6), ((0.34, 0.06, 0.26), 0.62, -0.5))):
        vols, cols, head, turn = rabbit_volumes(at, sc, rot)
        body = rv.painted_clay(paint, vols, cols, f"bunny-{tag}", 108 if tag == 0 else 60, 0.016 * max(0.8, sc), ground=False)
        parts.append(body)
        tree = k.world_tree(body)
        rabbit_face(parts, paint, tree, head, sc, turn, body, str(tag))
    return parts, 400


# ---------------------------------------------------------------- fawn

def fawn():
    """こじか: a young deer (0.4 x 1.25 x 1.1), warm brown with a light tummy, chest and muzzle, white spots along its
    back, thin legs with dark little hooves (parts of their own), soft ears, a short white tail; two small dark eyes
    with a shine and a dark nose (no lashes, not big eyes). Facing +Z."""
    paint = paints(0.75)
    light = lambda c, n: FAWN_LIGHT if (n.y < -0.4 or (c.z > 0.28 and c.y < 0.82)) else FAWN  # noqa: E731
    head = (0.0, 1.1, 0.44)
    vols = [((0.36, 0.36, 0.8), (0.0, 0.73, -0.02)), ((0.3, 0.3, 0.3), (0.0, 0.76, 0.28)), ((0.3, 0.32, 0.3), (0.0, 0.72, -0.3)),
            ((0.13, 0.36, 0.14), (0.0, 0.95, 0.36)), ((0.2, 0.19, 0.25), head), ((0.12, 0.1, 0.14), (0.0, 1.07, 0.56)),
            ((0.08, 0.16, 0.06), (0.1, 1.23, 0.4)), ((0.08, 0.16, 0.06), (-0.1, 1.23, 0.4)), ((0.08, 0.1, 0.07), (0.0, 0.82, -0.47))]
    cols = [light, light, FAWN, FAWN, FAWN, FAWN_LIGHT, FAWN, FAWN, SPOT]
    body = rv.painted_clay(paint, vols, cols, "fawn", 190, 0.016, ground=False)
    parts: list = [body]
    tree = k.world_tree(body)
    # Ears: soft ovals turned out a little (inside lighter).
    for sg in (-1, 1):
        v.ellipsoid(parts, f"ear-{sg}", (0.06, 0.15, 0.04), (sg * 0.115, 1.2, 0.41), paint(FAWN), 5, 3, smooth=True,
                    rot=(math.radians(-10), math.radians(sg * 10), math.radians(-sg * 35)))
    # Legs: thin, slightly tapering, with dark hooves.
    for x, z in ((-0.1, 0.27), (0.1, 0.27), (-0.1, -0.3), (0.1, -0.3)):
        twig(parts, f"leg-{x}-{z}", (x, 0.66, z), (x * 0.95, 0.06, z + 0.01), 0.04, 0.026, paint(FAWN), sides=4)
        twig(parts, f"hoof-{x}-{z}", (x * 0.95, 0.07, z + 0.01), (x * 0.95, 0.0, z + 0.015), 0.03, 0.032, paint(HOOF), sides=3)
    # White spots along its back.
    for i in range(6):
        sx = (1 if i % 2 else -1) * (0.07 + hash01(i, 1, 2) * 0.05)
        sz = -0.3 + i * 0.09
        p, nrm = v.on_surface(tree, (sx, 1.5, sz), (sx * 0.4, 0.7, sz))
        v.hug(v.sticker(parts, f"spot-{i}", tuple(p), tuple(nrm), (0.05, 0.045), paint(SPOT), 5, tilt=i, lift=0.003), body, 0.004)
    for sg in (-1, 1):
        v.eye(parts, paint, tree, head, v.look(sg * math.radians(48), math.radians(12)), (0.034, 0.038), f"eye-{sg}", body)
    p, nrm = v.on_surface(tree, (0.0, 1.08, 0.9), (0.0, 1.07, 0.5))
    v.hug(v.sticker(parts, "nose", tuple(p), tuple(nrm), (0.045, 0.032), paint(NOSE), 6, lift=0.004), body, 0.004)
    return parts, 400


# ---------------------------------------------------------------- hedgehog

def spine_cape(parts, paint, name, center, radii, n, rows, seed, bottom=None, zig=0.06):
    """A cape of soft spines: a dome (or a ball when `bottom` is given) whose faces form a pattern of little dark and
    light triangles and whose lowest ring zigzags out (little points in its outline)."""
    rng = random.Random(seed)
    cx, cy, cz = center
    rx, ry, rz = radii
    lo = -0.15 if bottom is None else -0.82
    rings = []
    for j in range(rows):
        t = lo + (0.92 - lo) * j / (rows - 1)
        y = math.sin(t * math.pi / 2)
        rr = math.cos(t * math.pi / 2)
        pts = []
        for i in range(n):
            a = TAU * i / n + (math.pi / n if j % 2 else 0.0)
            f = 1.0 + (zig * 1.6 if (j == 0 and i % 2 == 0 and bottom is None) else rng.uniform(-zig, zig) * 0.5)
            dy = -0.03 if (j == 0 and i % 2 == 0 and bottom is None) else 0.0
            pts.append((cx + math.cos(a) * rr * rx * f, cy + y * ry + dy, cz + math.sin(a) * rr * rz * f))
        rings.append(pts)
    verts, faces, tags = rv.body(rings, top=(cx, cy + ry, cz), bottom=bottom)

    def colour(idx):
        tag = tags[idx]
        if tag[0] in ("cap_bottom", "bottom"):
            return HEDGEHOG_DARK
        if tag[0] == "top":
            return HEDGEHOG_TIP if tag[1] % 2 else HEDGEHOG
        return HEDGEHOG_DARK if (tag[1] + tag[2]) % 2 else (HEDGEHOG_TIP if tag[1] % 2 else HEDGEHOG)

    # Each quad split into two triangles of different shades: the "little triangles" pattern.
    tri_faces, tri_cols = [], []
    for idx, f in enumerate(faces):
        col = colour(idx)
        if len(f) == 4 and tags[idx][0] == "gap":
            a, b, c, d = f
            tri_faces += [(a, b, c), (a, c, d)]
            tri_cols += [col, HEDGEHOG_DARK if col != HEDGEHOG_DARK else HEDGEHOG]
        else:
            tri_faces.append(f)
            tri_cols.append(col)
    return closed(parts, name, verts, tri_faces, paint, tri_cols)


def hedgehog_walk():
    """はりねずみ: a small round hedgehog sniffing along (+Z): a cape of soft spines over its back (a pattern of
    little triangles, a zigzag edge: nothing sharp), a light pointed face, a dark round nose, two small dark eyes, little
    light feet."""
    paint = paints(0.75)
    parts: list = []
    face = HEDGEHOG_FACE
    head = (0.0, 0.135, 0.22)
    vols = [((0.36, 0.24, 0.48), (0.0, 0.13, -0.02)), ((0.2, 0.17, 0.22), head), ((0.1, 0.08, 0.12), (0.0, 0.11, 0.33)),
            ((0.07, 0.06, 0.09), (0.1, 0.03, 0.13)), ((0.07, 0.06, 0.09), (-0.1, 0.03, 0.13)), ((0.07, 0.06, 0.09), (0.1, 0.03, -0.15)),
            ((0.07, 0.06, 0.09), (-0.1, 0.03, -0.15))]
    body = rv.painted_clay(paint, vols, [HEDGEHOG_DARK, face, face, face, face, face, face], "hedgehog", 80, 0.014)
    parts.append(body)
    spine_cape(parts, paint, "spines", (0.0, 0.105, -0.06), (0.21, 0.225, 0.3), 10, 4, 4)
    tree = k.world_tree(body)
    bead(parts, "nose", (0.0, 0.115, 0.38), (0.024, 0.021, 0.021), paint, NOSE)
    for sg in (-1, 1):
        v.eye(parts, paint, tree, head, v.look(sg * math.radians(42), math.radians(16)), (0.03, 0.034), f"eye-{sg}", body)
    return parts, 200


def hedgehog_ball():
    """はりねずみ (まるまった): the hedgehog curled up into a soft spiny ball (the triangle pattern all round, nothing
    sharp), its light face and dark nose just peeking out low at the front."""
    paint = paints(0.75)
    parts: list = []
    spine_cape(parts, paint, "ball", (0.0, 0.24, 0.0), (0.245, 0.24, 0.29), 10, 5, 9, bottom=(0.0, 0.0, 0.0), zig=0.08)
    v.ellipsoid(parts, "face", (0.15, 0.1, 0.1), (0.0, 0.12, 0.25), paint(HEDGEHOG_FACE), 6, 3, smooth=True)
    bead(parts, "nose", (0.0, 0.12, 0.3), (0.021, 0.018, 0.018), paint, NOSE)
    return parts, 150


# ---------------------------------------------------------------- tanuki

def tanuki():
    """こだぬき: one little tanuki standing (+Z): a round brown body with a light tummy, a round head with a light
    muzzle, dark patches round its two small eyes (each with a shine), a dark nose, small dark ears, dark arms a little
    out and dark legs, a bushy striped tail behind. No leaf, hat, bottle or drum belly."""
    paint = paints(0.75)
    belly = lambda c, n: TANUKI_BELLY if (n.z > 0.62 and 0.17 < c.y < 0.44 and abs(c.x) < 0.085) else TANUKI  # noqa: E731
    muzzle = lambda c, n: TANUKI_BELLY if n.z > 0.2 else TANUKI  # noqa: E731
    head = (0.0, 0.64, 0.02)
    vols = [((0.46, 0.5, 0.42), (0.0, 0.33, 0.0)), (( 0.34, 0.31, 0.32), head), ((0.15, 0.11, 0.13), (0.0, 0.6, 0.15)),
            ((0.09, 0.09, 0.05), (0.105, 0.78, 0.0)), ((0.09, 0.09, 0.05), (-0.105, 0.78, 0.0)),
            ((0.09, 0.2, 0.09), (0.2, 0.44, 0.05)), ((0.09, 0.2, 0.09), (-0.2, 0.44, 0.05)),
            ((0.1, 0.14, 0.11), (0.1, 0.07, 0.03)), ((0.1, 0.14, 0.11), (-0.1, 0.07, 0.03)),
            ((0.14, 0.14, 0.14), (0.0, 0.22, -0.25)), ((0.13, 0.13, 0.13), (0.0, 0.25, -0.33)), ((0.11, 0.11, 0.11), (0.0, 0.29, -0.4))]
    cols = [belly, TANUKI, muzzle, TANUKI_DARK, TANUKI_DARK, TANUKI_DARK, TANUKI_DARK, TANUKI_DARK, TANUKI_DARK, TANUKI, TANUKI_DARK, TANUKI]
    body = rv.painted_clay(paint, vols, cols, "tanuki", 222, 0.016)
    parts: list = [body]
    tree = k.world_tree(body)
    for sg in (-1, 1):
        d = v.look(sg * math.radians(34), math.radians(12))
        p, nrm = v.on_surface(tree, tuple(Vector(head) + d * 0.6), head)
        v.hug(v.sticker(parts, f"patch-{sg}", tuple(p), tuple(nrm), (0.085, 0.065), paint(TANUKI_DARK), 7, tilt=sg * 0.35, lift=0.003), body, 0.003)
        v.eye(parts, paint, tree, head, d, (0.032, 0.036), f"eye-{sg}", body)
    p, nrm = v.on_surface(tree, (0.0, 0.62, 0.6), (0.0, 0.6, 0.1))
    v.hug(v.sticker(parts, "nose", tuple(p), tuple(nrm), (0.04, 0.03), paint(NOSE), 6, lift=0.004), body, 0.005)
    return parts, 300


# ---------------------------------------------------------------- fake lantern

def fake_lantern():
    """にせの ひかり: a bamboo pole stuck in the ground (green, its lengths in two shades), an arm out to +X, a cord,
    and a round pink festival lantern hanging from it between two dark rims (never floating). The paper is its own
    material: the game lights it pink and puts it out when the light sees through Sakasa's trick."""
    paint = paints(0.75)
    parts: list = []
    prof = [(0.0, 0.05, BAMBOO_NODE), (0.65, 0.045, BAMBOO), (1.3, 0.042, BAMBOO_DARK), (1.95, 0.039, BAMBOO), (2.6, 0.035, BAMBOO_DARK)]
    v.lathe_y(parts, "pole", prof, (0.0, 0.0), 4, paint, smooth=False, phase=TAU / 8)
    twig(parts, "arm", (-0.03, 2.5, 0.0), (0.46, 2.53, 0.0), 0.022, 0.018, paint(BAMBOO_DARK), sides=3)
    twig(parts, "cord", (0.4, 2.52, 0.0), (0.4, 2.2, 0.0), 0.007, 0.007, paint(STRING), sides=3)
    cx, cy = 0.4, 1.96
    lantern = [(cy - 0.26, 0.08, NAVY_EDGE), (cy - 0.22, 0.16, PINK_DEEP), (cy - 0.06, 0.205, PINK), (cy + 0.08, 0.2, PINK_LIGHT),
               (cy + 0.2, 0.16, NAVY_EDGE), (cy + 0.245, 0.08, NAVY_EDGE)]
    v.lathe(parts, "paper", lantern, lambda y, a, r: (cx + math.cos(a) * r, y, math.sin(a) * r), 6, paint, smooth=lambda c, n: abs(n.y) < 0.8)
    return parts, 140


def paper_split(material_name):
    """The paper (the three pinks) is the material the game lights."""
    return "fake-lantern-paper" if any(c in material_name for c in (PINK, PINK_DEEP, PINK_LIGHT)) else None


# ---------------------------------------------------------------- the great tree's root hill

# The square's hill (scripts/layout-5-1.mjs MOUND uses the same numbers): its top a rounded rectangle 48 x 220 m
# (corners 14 m round) flat at y 15.4 (the square's ground, the rail's height less 0.6), its sides one profile all round:
# (metres out from the top's edge, height) — a soft shoulder, a steep middle, a gentle foot 20 m out.
MOUND_HALF_X, MOUND_HALF_Z, MOUND_CORNER = 24.0, 110.0, 14.0
MOUND_PROFILE = [(20.0, 0.0), (12.0, 5.6), (6.0, 11.8), (2.0, 14.9), (0.0, 15.4)]
EARTH, EARTH_DARK, MOSS, MOSS_LIGHT, FLOOR = "#4A3B2E", "#3D3127", "#3E6A4E", "#4E7A5A", "#33503F"
GLOW.update({EARTH: 0.04, EARTH_DARK: 0.03, MOSS: 0.05, MOSS_LIGHT: 0.06, FLOOR: 0.03})


def mound_outline(off):
    """The rounded rectangle `off` m out from the top's edge (off < 0: inside it), the same parameter places for every
    offset (a corner arc in 3 steps, the long sides in 9, the short ones in 2), counter-clockwise from above."""
    hx, hz, r = MOUND_HALF_X - MOUND_CORNER, MOUND_HALF_Z - MOUND_CORNER, MOUND_CORNER + off
    pts, normals = [], []
    corners = [(hx, hz, 0.0), (-hx, hz, 90.0), (-hx, -hz, 180.0), (hx, -hz, 270.0)]
    sides = [2, 9, 2, 9]  # after each corner, the straight side to the next one: the far end, -X, the near end, +X
    for k, (cx, cz, a0) in enumerate(corners):
        for i in range(3):
            a = math.radians(a0 + 90.0 * i / 3)
            pts.append((cx + math.cos(a) * r, cz + math.sin(a) * r))
            normals.append((math.cos(a), math.sin(a)))
        nx, nz, _ = corners[(k + 1) % 4]
        a = math.radians(a0 + 90.0)
        sx, sz = cx + math.cos(a) * r, cz + math.sin(a) * r
        ex, ez = nx + math.cos(a) * r, nz + math.sin(a) * r
        for i in range(sides[k]):
            t = i / sides[k]
            pts.append((sx + (ex - sx) * t, sz + (ez - sz) * t))
            normals.append((math.cos(a), math.sin(a)))
    return pts, normals


def mound_height(off):
    """The hill's height `off` m out from the top's edge (15.4 on the top)."""
    if off <= 0.0:
        return MOUND_PROFILE[-1][1]
    for (o1, y1), (o0, y0) in zip(MOUND_PROFILE, MOUND_PROFILE[1:]):
        if o0 <= off <= o1:
            return y0 + (y1 - y0) * (off - o0) / (o1 - o0)
    return 0.0


def root_mound():
    """おおきな きの ねっこの おか: the hill of dark forest earth under the fireflies' square and the great tree. Its
    top is flat at the square's ground (the decks lie on it, the great tree's roots meet it) in a moss-green forest
    floor; its sides slope down all round to the forest floor in earth browns with moss on the shoulder, and thick
    roots (the great tree's) run down them; a few mossy lumps. Origin at the middle of its foot, +Z along the track."""
    paint = paints(0.95)
    parts: list = []
    rings = []
    for off, y in MOUND_PROFILE:
        pts, nrm = mound_outline(off)
        ring_pts = []
        for i, ((x, z), (nx, nz)) in enumerate(zip(pts, nrm)):
            # The foot wanders in and out, the slope's middle a little (gullies); not where Sakasa runs down in the
            # ending (+X, z 20..60: layout-5-1.mjs reads the slope's height there from MOUND_PROFILE).
            calm = x > 0 and 20.0 < z < 60.0
            wob = 0.0
            if off >= 20.0:
                wob = (hash01(i, 3, 7) - 0.5) * 4.0
            elif off >= 6.0 and not calm:
                wob = (hash01(i, 5, off) - 0.5) * 2.4
            ring_pts.append((x + nx * wob, y, z + nz * wob))
        rings.append(ring_pts)
    verts, faces, tags = rv.body(rings)

    def colour(idx):
        tag = tags[idx]
        if tag[0] == "cap_top":
            return FLOOR
        if tag[0] == "cap_bottom":
            return EARTH_DARK
        band, j = tag[1], tag[2]
        h = hash01(j, band, 11)
        if band == 3:
            return MOSS if h < 0.7 else MOSS_LIGHT
        if band == 2:
            return MOSS if h < 0.35 else (EARTH if h < 0.75 else EARTH_DARK)
        if band == 1:
            return EARTH if h < 0.55 else (EARTH_DARK if h < 0.85 else MOSS)
        return EARTH_DARK if h < 0.6 else EARTH

    closed(parts, "hill", verts, faces, paint, [colour(i) for i in range(len(faces))])
    # The great tree's roots running down the sides (most round its end, +Z): from inside the top's edge down to the
    # foot, thinning, a third sunk into the ground all the way.
    pts0, nrm0 = mound_outline(0.0)
    for k, i in enumerate((0, 2, 3, 5, 7, 10, 14, 20, 26, 32)):
        (x, z), (nx, nz) = pts0[i], nrm0[i]
        # A little sideways drift, so the roots do not run straight down.
        sx, sz = -nz * (hash01(k, 9) - 0.5) * 0.4, nx * (hash01(k, 9) - 0.5) * 0.4
        line, radii = [], []
        for off, r in ((-3.0, 1.45), (1.5, 1.3), (6.5, 1.05), (12.5, 0.8), (18.5, 0.5)):
            y = mound_height(off) - r * 0.35
            line.append((x + nx * off + sx * off, y, z + nz * off + sz * off))
            radii.append(r)
        tube(parts, f"root-{k}", line, radii, paint(TRUNK if k % 2 else TRUNK_DARK), sides=4)
    # Mossy lumps on the slopes.
    for k, (i, off) in enumerate(((9, 9.0), (24, 7.0), (30, 10.0))):
        (x, z), (nx, nz) = pts0[i], nrm0[i]
        cx, cz = x + nx * off, z + nz * off
        puff(parts, f"moss-{k}", (cx, mound_height(off) + 0.3, cz), (3.6, 1.6, 3.6), paint, lambda c, n: MOSS_LIGHT if n.y > 0.5 else MOSS,
             n=5, lat=2, seed=70 + k, jitter=0.15, smooth=True)
    return parts, 800


# ---------------------------------------------------------------- export and preview

def vertex_coloured(model, split):
    """The model in vertex colours, "night-paint" plus the material the game swaps (village.to_vertex_colours)."""
    vg.to_vertex_colours(model, None, split)
    model.data.materials[0].name = "night-paint"


BUILDERS = {"night-tree-a": night_tree_a, "night-tree-b": night_tree_b, "night-bush": night_bush, "glow-mushroom": glow_mushroom,
            "moon-meadow": moon_meadow, "great-tree": great_tree, "plaza-deck": plaza_deck, "big-stump": big_stump,
            "log-bridge-end": log_bridge_end, "thicket": thicket, "birdhouse-upside": birdhouse_upside, "bell-branch": bell_branch,
            "moonstone": moonstone, "lantern-bell": lantern_bell, "firefly-wait": firefly_wait, "firefly-grass": firefly_grass,
            "sign-hush": sign_hush, "sign-whistle-reversed": sign_whistle_reversed, "bunny-sleep": bunny_sleep,
            "bunny-family": bunny_family, "fawn": fawn, "hedgehog-walk": hedgehog_walk, "hedgehog-ball": hedgehog_ball, "tanuki": tanuki,
            "fake-lantern": fake_lantern, "root-mound": root_mound}
SWARMS = {"firefly-swarm": (3.0, 60), "firefly-swarm-big": (6.0, 160)}
# The stand-ins' exact sizes (w, h, d) the shapes are scaled to.
EXACT = {"night-tree-a": (5.037, 12.438, 6.17), "night-tree-b": (7.062, 16.104, 8.252), "night-bush": (2.366, 1.361, 2.482),
         "glow-mushroom": (0.862, 0.8, 0.762), "great-tree": (50.0, 68.6, 50.0), "big-stump": (9.749, 3.0, 10.0),
         "log-bridge-end": (5.876, 1.4, 4.702), "thicket": (8.782, 3.662, 1.701), "birdhouse-upside": (0.566, 0.75, 0.566),
         "moonstone": (0.5, 0.3, 0.4), "lantern-bell": (0.312, 0.685, 0.36), "sign-hush": (1.18, 2.14, 0.145),
         "sign-whistle-reversed": (1.18, 2.14, 0.145), "bunny-sleep": (0.468, 0.34, 0.742), "bunny-family": (1.518, 0.447, 1.3),
         "fawn": (0.395, 1.251, 1.096), "hedgehog-walk": (0.42, 0.33, 0.637), "hedgehog-ball": (0.497, 0.48, 0.587),
         "tanuki": (0.638, 0.83, 0.677), "firefly-grass": (1.345, 0.705, 1.019)}
# Centred on their bounding box (x/z); the rest keep the x/z origin they were built about (the stand-ins').
CENTRED = {"night-bush", "big-stump", "thicket", "birdhouse-upside", "moonstone", "lantern-bell", "bunny-sleep", "bunny-family", "hedgehog-ball"}
# Vertex-coloured, with the second material the game swaps.
VERTEX = {"birdhouse-upside": trace_split, "fake-lantern": paper_split}
VIEWS = {"root-mound": (0.75, -0.45, 0.35), "moon-meadow": (0.45, -0.6, 0.55), "plaza-deck": (0.55, -0.72, 0.4), "great-tree": (0.5, -0.8, 0.25), "log-bridge-end": (0.6, 0.62, 0.42),
         "thicket": (0.35, 0.85, 0.3), "bell-branch": (0.3, -0.9, 0.2), "sign-hush": (0.3, -0.9, 0.15), "sign-whistle-reversed": (0.3, -0.9, 0.15),
         "birdhouse-upside": (0.45, -0.85, 0.2), "fake-lantern": (0.45, -0.85, 0.2), "fawn": (0.75, -0.6, 0.25), "tanuki": (0.5, -0.8, 0.25),
         "hedgehog-walk": (0.65, -0.7, 0.3), "bunny-family": (0.45, -0.75, 0.5), "bunny-sleep": (0.55, -0.7, 0.45), "firefly-wait": (0.4, 0.85, 0.2),
         "moonstone": (0.5, -0.7, 0.5), "lantern-bell": (0.45, -0.85, 0.25)}
TALL = {"night-tree-a", "night-tree-b", "great-tree", "sign-hush", "sign-whistle-reversed", "fake-lantern", "lantern-bell", "fawn", "tanuki"}

if __name__ == "__main__":
    wanted = [a for a in sys.argv[1:] if a in BUILDERS or a in SWARMS] or list(BUILDERS) + list(SWARMS)
    for name in wanted:
        if name in SWARMS:
            firefly_swarm(name, *SWARMS[name])
            continue
        k.reset()
        built, budget = BUILDERS[name]()
        model = built if isinstance(built, bpy.types.Object) else k.join(built, name)
        model.name = name
        model.data.name = name
        model.data.validate()
        if name in EXACT:
            v.scale_to(model, EXACT[name])
        if name in CENTRED:
            rv.centre_xz(model)
        rv.floor_to_zero(model)
        # No uv layer (nothing here is textured), triangulated by a fixed rule.
        while model.data.uv_layers:
            model.data.uv_layers.remove(model.data.uv_layers[0])
        k.apply_modifier(model, "TRIANGULATE", quad_method="FIXED", ngon_method="CLIP")
        size = (400, 512) if name in TALL else (512, 400)
        if name in VERTEX:
            vertex_coloured(model, VERTEX[name])
            md.export_glb([model], name, budget)
        else:
            rv.export_glb(model, name, budget)
        v.preview(model, name, VIEWS.get(name, (0.55, -0.72, 0.42)), size)
