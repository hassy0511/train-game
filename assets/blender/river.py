"""Stage 3-2 (たきのかわ) — Claude Code. Ticket 0012.

The crafted look (つくりこみ) of chapters 1 and 2 (sky.py, volcano.py and meadow.py, whose helpers this script uses):
flat colours, faceted rock, round friendly shapes. A bright summer valley with a wide river, a gentle curtain waterfall,
a meadow and a forest pond above it, a spring and the last of the snow. The living things are round with eyes only (no
mouth, no beak teeth); the ducks wear a real duck's plain colours (no hat, no clothes, not the blue and white of a
well-known cartoon duck). Nothing is modelled on a real river, waterfall or rock.

Models (same names, sizes, origins and orientation as the code stand-ins they replace, so the stage JSON does not
change; origin at the bottom centre, +Z forward, the model's own left is +X):
- reed 1.25 x 3.2 x 1.25 (240 in 3-2's valley and upper river, 5-1's night pond): five leaves and a plume, green at the
  foot to pale at the tip (vertex colours, one material); origin at the root.
- lily-pad 9 x 0.4 x 9 (scenery on the river; the leaves the track floats under are the game's own floaters), with its
  slit toward -Z. lily-flower 1.2 x 0.85 x 1.2.
- water-weed 1.8 x 5 x 0.62: ribbons spread along X (the dead ends' curtains stand across the track; vertex colours).
- islet 18 x 20 x 26 (two stones on its top to 20.8): on the river bed (y -24 in 3-2), its top a flat plateau at y 20
  inside |x| < 7.2 (record ① lies 6 m off its middle, 0.2 m over it); a sand shore at y 15.2-18.7 (the water line at
  scale 0.9-1); origin at the plateau's middle.
- rapids 16 x 1.5 x 18: put 0.6 m into the water (onRail, -3.1 m), +Z upstream: a ragged field of white water whose rim
  is under the water line, six rocks standing out of it.
- river-bank 29 x 19 x 120 (the stand-in's foot; its sandy top is about 24 x 100 at y 19, stones on it to 19.4).
- river-rock 2 x 1 x 1.6: a smooth stone with a white band, a brown and a pale pebble by it.
- sea-arch 60 x 31.5 x 20 (the bush on its crown; the stand-in was 59 x 31.7 x 20): front +Z (toward the valley). In 3-2 (scale 1.2, 2 m inside the valley's south cliff) the water
  is at y 13.3 and the cliff face at z -1.67, so the sea panel in the opening stands at z -1.2, in front of the cliff.
- falls-lip 124 x 2.5 x 4 (tufts to 2.75): the waterfall's rock eave, its front (-Z) over the valley. In 3-2 the
  meadow's ground is at its y 1.5 (the upper river's water 1 m lower, behind it) and the valley's cliff face at z -1.2,
  so it shows as a low grassy ledge whose eave overhangs the falls: along the middle (|x| < 57, the curtain's width) the
  water comes out from under the eave as a white roll at y 1.3-1.85, just behind where the game's curtain starts
  (y 1.5, z -2.7). The ends are rounded rock. Nothing reaches past z -2 (the train passes 1.1 m in front of it).
- falls-mini 7 x 5 x 7 (the map's island picture): a cliff with a grassy top, a curtain of white streaks, a pool with
  foam, a rainbow in front of it.
- stepping-stones 3.8 x 0.8 x 27.6: six flat stones in a zigzag along Z (0.4 m out of the water in 3-2).
- kawa-rock 5.1 x 1.5 x 4 (a tuft to 1.68): Sakasa's flat rock, its top flat at y 1.5 round the origin (she stands
  there).
- paper-boat 0.48 x 0.45 x 0.9: a folded pink paper boat, its sail along Z with a swirl on both sides.
- frog 0.7 x 0.5 x 0.8: the eyes on top are its highest point (a leaping frog swims with them out of the water).
- duck-family 0.75 x 1.03 x 4.4: the mother in front (+Z), four ducklings behind her in a row, one mesh (the game moves
  the family as a whole; 3-2 turns it with rotationY -90 to face the way it crosses).
- snow-patch 10 x 1.5 x 8 (also for chapter 4): soft old snow, over 1 m high round the middle (record ③ is under it).
- snow-peak 400 x 260 x 400 (far peaks, a promise of chapter 4).
- Records: blue-feather 0.3 x 0.1 x 1 (tip +Z), jade-stone 0.8 x 0.5 x 0.8, fukinotou 0.6 x 0.6 x 0.6.
Colours: the static models are plain-coloured parts (the game bakes them into one draw call per ground cell, and the
flock of frogs and the duck family into one each); the reed and the water weed, whose colour runs from root to tip, are
vertex-coloured with one material.
Output: public/models/<name>.glb and assets/previews/<name>.png.
Run: python3 scripts/run-bpy.py assets/blender/river.py [-- name ...]
"""
from __future__ import annotations

from pathlib import Path
import json
import math
import random
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import sky as s  # noqa: E402  (chapter 1's crafted helpers: fix_normals, tuft, outline, plate...)
import volcano as v  # noqa: E402  (chapter 2's: Paint, painted, lathe_y, lumpy_stone, eye, preview...)
import meadow as md  # noqa: E402  (vertex-coloured paint: paint_material, paint_corners)
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

TAU = 2 * math.pi
Paint = v.Paint
hexmix = v.hexmix

# ---------------------------------------------------------------- palette (ticket 0012)

REED, REED_TIP, REED_PLUME = "#8DB35A", "#C9D27A", "#DCD596"
LEAF, LEAF_LIGHT, LEAF_RIM, LEAF_SIDE, LEAF_UNDER, LEAF_VEIN = "#6DBF5A", "#7DCA68", "#86CF6C", "#57A247", "#4E9440", "#A2DA86"
PETAL, PETAL_DEEP, PETAL_LIGHT, PETAL_INNER, HEART = "#F6B8CF", "#EC9FBC", "#FCE0EA", "#F9CCDC", "#FFE27A"
WEED_ROOT, WEED, WEED_TIP = "#3F8A5A", "#4F9A6A", "#76C28A"
ROCK, ROCK_LIGHT, ROCK_DARK, ROCK_WARM, ROCK_WET = "#A89F90", "#C2B9A8", "#8E8472", "#B8AA94", "#958A78"
GRASS, GRASS_DARK, TUFT = "#8CC46A", "#7AB55C", "#6FAE52"
SAND, SAND_LIGHT, SAND_WET = "#E8D8A8", "#F0E4BE", "#CDBB8A"
FOAM, FOAM_BLUE, WATER, WATER_DEEP = "#F4FBFF", "#D8F1FB", "#9FD8F0", "#6FC3E6"
SEA, SEA_DEEP, SKY = "#4FA9D8", "#3A8FC4", "#CFEBF6"
PAPER, PAPER_LIGHT, PAPER_DEEP, SWIRL = "#F7A8D8", "#FBC6E6", "#EE94C9", "#E8579F"
FROG, FROG_BELLY, FROG_DARK = "#8CCB5E", "#EAF4C8", "#79B850"
DUCK, DUCK_WING, DUCK_WING_TIP, DUCKLING, DUCKLING_WING, BILL = "#EFE3C8", "#B89A74", "#9C7F5C", "#FFE27A", "#F6D35A", "#F2A94A"
SNOW, SNOW_SHADE, SNOW_DEEP = "#F4F8FC", "#D6E4F0", "#C3D5E6"
PEAK_ROCK, PEAK_ROCK_LIGHT, PEAK_FOOT = "#A3B5C8", "#BCCBDA", "#93A8BD"
FEATHER, FEATHER_DEEP, FEATHER_LIGHT, FEATHER_TIP, QUILL = "#3FA7E0", "#2E86C9", "#6CC4F0", "#F28C3A", "#EFE8D8"
JADE, JADE_LIGHT, JADE_DEEP = "#5CC49A", "#8EE0BC", "#3FA880"
BUD, BUD_LIGHT, BUD_DEEP, BUD_HEART = "#A8D46A", "#C8E07A", "#8CC45A", "#E6EC9C"
RAINBOW = ["#FF8C8C", "#FFC46B", "#FFF27A", "#8FE38F", "#7FC8FF"]


# ---------------------------------------------------------------- mesh helpers (glTF coordinates)

def body(rings, top=None, bottom=None, cap_top=True, cap_bottom=True):
    """Vertices and faces of a closed body through rings of equal length (each a list of (x, y, z), in order round
    it), from the first ring to the last. `top`/`bottom`: a point the last/first ring closes to (a fan), else a flat
    cap (or none when cap_* is False). Also returns a tag per face: ("gap", ring, j), ("top", j), ("bottom", j),
    ("cap_top",) or ("cap_bottom",)."""
    n = len(rings[0])
    verts = [p for r in rings for p in r]
    faces, tags = [], []
    for r in range(len(rings) - 1):
        for j in range(n):
            faces.append((r * n + j, r * n + (j + 1) % n, (r + 1) * n + (j + 1) % n, (r + 1) * n + j))
            tags.append(("gap", r, j))
    last = (len(rings) - 1) * n
    if top is not None:
        verts.append(top)
        t = len(verts) - 1
        for j in range(n):
            faces.append((last + j, last + (j + 1) % n, t))
            tags.append(("top", j))
    elif cap_top:
        faces.append(tuple(range(last, last + n)))
        tags.append(("cap_top",))
    if bottom is not None:
        verts.append(bottom)
        b = len(verts) - 1
        for j in range(n):
            faces.append(((j + 1) % n, j, b))
            tags.append(("bottom", j))
    elif cap_bottom:
        faces.append(tuple(range(n - 1, -1, -1)))
        tags.append(("cap_bottom",))
    return verts, faces, tags


def faces_colour(verts, faces, fn):
    """A hex colour per face from fn(centre, face index) (centre in glTF coordinates, before normals are fixed)."""
    out = []
    for i, f in enumerate(faces):
        c = Vector((0.0, 0.0, 0.0))
        for vi in f:
            c += Vector(verts[vi])
        out.append(fn(c / len(f), i))
    return out


def vc_part(parts, name, verts, faces, colour_at, material, closed=True):
    """A vertex-coloured part: colour_at(glTF point) -> hex for each corner."""
    obj = k.add_mesh(parts, name, verts, faces, [material])
    if closed:
        s.fix_normals(obj)
    md.paint_corners(obj, lambda poly, p: colour_at(p))
    return obj


def stone(parts, name, size, center, paint, side, top, seed, sub=1, rough=0.14, top_from=0.45, smooth=False):
    """A faceted stone (jittered icosphere) in two colours: its sides, and the faces turned up."""
    obj = v.lumpy_stone(parts, name, size, center, paint(side), paint(top), seed, sub=sub, top_from=top_from, rough=rough)
    if smooth:
        k.set_smooth(obj, True)
    return obj


def clay(volumes, name, material, budget, voxel, ground=False, smooth=4):
    """Round volumes [(size, centre)] fused into one smooth surface (voxel remesh, smoothed), decimated under `budget`
    triangles."""
    made: list = []
    for i, (size, center) in enumerate(volumes):
        k.add_ellipsoid(made, f"{name}-v{i}", size, center, material, segments=24, rings=12)
    dense = k.join(made, f"{name}-dense")
    k.apply_modifier(dense, "REMESH", mode="VOXEL", voxel_size=voxel, adaptivity=0.0)
    if ground:
        k.active(dense)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.bisect(plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
        bpy.ops.object.mode_set(mode="OBJECT")
    if smooth:
        k.apply_modifier(dense, "SMOOTH", factor=0.5, iterations=smooth)
    target = budget
    while True:
        low = dense.copy()
        low.data = dense.data.copy()
        bpy.context.collection.objects.link(low)
        k.apply_modifier(low, "DECIMATE", decimate_type="COLLAPSE", ratio=min(1.0, target / max(k.triangles(dense), 1)),
                         use_collapse_triangulate=True)
        if k.triangles(low) <= budget:
            break
        target -= k.triangles(low) - budget + 2
        bpy.data.objects.remove(low, do_unlink=True)
    bpy.data.objects.remove(dense, do_unlink=True)
    drop_crumbs(low)
    low.name = name
    low.data.name = name
    low.data.materials.clear()
    low.data.materials.append(material)
    k.set_smooth(low)
    s.fix_normals(low)
    return low


def drop_crumbs(obj, keep=12):
    """Delete loose bits of fewer than `keep` faces (a thin foot cut at the floor can fall apart when decimated)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    seen, crumbs = set(), []
    for face in bm.faces:
        if face.index in seen:
            continue
        group, stack = [], [face]
        seen.add(face.index)
        while stack:
            f = stack.pop()
            group.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen:
                        seen.add(g.index)
                        stack.append(g)
        if len(group) < keep:
            crumbs += group
    if crumbs:
        bmesh.ops.delete(bm, geom=crumbs, context="FACES")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def recolour(obj, paint, fn):
    """Each face of `obj` takes the colour fn(centre, normal) -> hex (glTF coordinates)."""
    slots: dict[str, int] = {}
    mesh = obj.data
    for m in mesh.materials:
        slots.setdefault(m.name.replace("Flat ", ""), len(slots))
    for poly in mesh.polygons:
        hex_color = fn(k.gltf(obj.matrix_world @ poly.center), k.gltf(poly.normal))
        if hex_color not in slots:
            slots[hex_color] = len(mesh.materials)
            mesh.materials.append(paint(hex_color))
        poly.material_index = slots[hex_color]


# ---------------------------------------------------------------- reeds

def blade_geometry(base, out_angle, height, half_width, thick, reach, droop=0.0):
    """A leaf of a reed: a closed three-sided spike (10 triangles) from `base` (x, z) at y -0.12, its flat side facing
    out along `out_angle`, bending out `reach` m by its tip (and drooping `droop` m back down)."""
    ox, oz = math.cos(out_angle), math.sin(out_angle)
    sx, sz = -oz, ox  # across the leaf
    bx, bz = base

    def ring(y, reach_at, w, t):
        cx, cz = bx + ox * reach_at, bz + oz * reach_at
        return [(cx + sx * w, y, cz + sz * w), (cx - sx * w, y, cz - sz * w), (cx - ox * t, y, cz - oz * t)]

    r0 = ring(-0.12, 0.0, half_width, thick)
    r1 = ring(height * 0.5, reach * 0.3, half_width * 0.72, thick * 0.7)
    tip = (bx + ox * reach, height - droop, bz + oz * reach)
    return body([r0, r1], top=tip)


def reed():
    """あし: a bunch of four long leaves leaning out (two of them bending over at the tip) and one taller stem with a
    soft plume, green at the foot to pale yellow-green at the tip."""
    paint = md.paint_material("Reed", 0.85)
    parts: list = []

    def leaf_colour(p):
        return hexmix(REED, REED_TIP, max(0.0, min(1.0, p.y / 3.0)) ** 1.15)

    leaves = [((0.08, 0.05), 0.3, 2.95, 0.12, 0.04, 0.6, 0.0), ((-0.06, 0.07), 2.3, 2.55, 0.115, 0.04, 0.68, 0.22),
              ((-0.04, -0.08), 3.9, 2.8, 0.12, 0.04, 0.52, 0.0), ((0.07, -0.05), 5.3, 2.35, 0.11, 0.035, 0.7, 0.26)]
    for i, (base, angle, h, w, t, reach, droop) in enumerate(leaves):
        verts, faces, _ = blade_geometry(base, angle, h, w, t, reach, droop)
        vc_part(parts, f"leaf-{i}", verts, faces, leaf_colour, paint)
    # A short leaf at the foot and the stem (three-sided spikes), and the stem's plume (a soft spindle, leaning a little).
    spike = [(0, 1, 2), (0, 3, 1), (1, 3, 2), (2, 3, 0)]
    vc_part(parts, "leaf-short", [(0.06, -0.12, 0.0), (-0.05, -0.12, 0.05), (-0.03, -0.12, -0.06), (0.32, 1.35, 0.5)], spike,
            leaf_colour, paint)
    vc_part(parts, "stem", [(0.04, -0.12, -0.02), (-0.02, -0.12, 0.03), (0.0, -0.12, -0.04), (0.12, 2.62, 0.05)], spike,
            leaf_colour, paint)
    plume = [(0.12, 2.5, 0.05), (0.2, 3.2, 0.09)]
    pv = [plume[0], plume[1]]
    for i in range(4):
        a = TAU * i / 4 + 0.4
        pv.append((0.155 + math.cos(a) * 0.075, 2.86, 0.07 + math.sin(a) * 0.075))
    pf = []
    for i in range(4):
        a, b = 2 + i, 2 + (i + 1) % 4
        pf += [(0, b, a), (1, a, b)]
    vc_part(parts, "plume", pv, pf, lambda p: hexmix(REED_TIP, REED_PLUME, (p.y - 2.5) / 0.7), paint)
    return parts, 60


# ---------------------------------------------------------------- lily pads and flowers

def lily_pad():
    """はすの はっぱ: a big round leaf, 9 m across, its slit (toward -Z) running in to the middle, the rim turned up a
    little; light green on top with six pale veins, darker round the rim and underneath."""
    paint = Paint(0.75)
    R, slit, N = 4.5, math.radians(9), 12
    angles = [-math.pi / 2 + slit + (TAU - 2 * slit) * i / N for i in range(N + 1)]

    def at(a, r, y):
        return (math.cos(a) * r, y, math.sin(a) * r)

    stations = [(0.58, 0.26), (1.0, 0.37), (1.03, 0.27), (0.97, 0.0)]
    verts = [(0.0, 0.24, 0.0)]
    for r, y in stations:
        verts += [at(a, R * r, y) for a in angles]
    verts.append((0.0, 0.0, 0.0))
    m = N + 1
    top_c, bottom_c = 0, len(verts) - 1
    ring = [1 + i * m for i in range(len(stations))]
    faces, colours = [], []
    for i in range(N):
        faces.append((top_c, ring[0] + i + 1, ring[0] + i))
        colours.append(LEAF)
    for r, colour in zip(range(len(stations) - 1), (LEAF_LIGHT, LEAF_RIM, LEAF_SIDE)):
        for i in range(N):
            a, b = ring[r] + i, ring[r + 1] + i
            faces.append((a, a + 1, b + 1, b))
            colours.append(colour)
    for i in range(N):
        faces.append((bottom_c, ring[-1] + i, ring[-1] + i + 1))
        colours.append(LEAF_UNDER)
    for i in (0, N):  # the slit's two walls
        faces.append((top_c, ring[0] + i, ring[1] + i, ring[2] + i, ring[3] + i, bottom_c))
        colours.append(LEAF_SIDE)
    parts: list = []
    v.painted(parts, "leaf", verts, faces, paint, colours)
    # Veins: thin kites from the middle out toward the rim, lying on the top.
    vein = paint(LEAF_VEIN)
    for j in range(6):
        a = -math.pi / 2 + slit + (TAU - 2 * slit) * (j + 0.5) / 6
        side = Vector((-math.sin(a), 0.0, math.cos(a)))
        mid = Vector(at(a, R * 0.58, 0.272))
        tip = Vector(at(a, R * 0.93, 0.355))
        kite = [(0.0, 0.252, 0.0), tuple(mid + side * 0.07), tuple(tip), tuple(mid - side * 0.07)]
        obj = k.add_mesh(parts, f"vein-{j}", kite, [(0, 1, 3), (1, 2, 3)], [vein])
        for poly in obj.data.polygons:
            if poly.normal.z < 0:
                poly.flip()
    return parts, 120


def petal(base, tip, width, cup, thick, at=0.45):
    """A closed petal (6 triangles): base and tip points, `width` across at `at` of its length, cupped up by `cup`."""
    b, t = Vector(base), Vector(tip)
    d = (t - b).normalized()
    side = d.cross(Vector((0, 1, 0))).normalized()
    up = side.cross(d).normalized()
    mid = b + (t - b) * at + up * cup
    verts = [tuple(b), tuple(mid + side * width), tuple(t), tuple(mid - side * width), tuple(mid - up * thick)]
    faces = [(0, 1, 2), (0, 2, 3), (0, 4, 1), (1, 4, 2), (2, 4, 3), (3, 4, 0)]
    return verts, faces


def lily_flower():
    """はすの はな: eight pale pink petals lying open, six lighter ones cupped up inside them, round a yellow heart."""
    paint = Paint(0.6, glow={PETAL_LIGHT: 0.12, PETAL_INNER: 0.1, HEART: 0.2})
    parts: list = []
    for i in range(8):
        a = TAU * i / 8
        d = Vector((math.cos(a), 0, math.sin(a)))
        verts, faces = petal(tuple(d * 0.1 + Vector((0, 0.08, 0))), tuple(d * 0.6 + Vector((0, 0.42, 0))), 0.25, 0.1, 0.05, 0.56)
        v.painted(parts, f"petal-{i}", verts, faces, paint, [PETAL, PETAL] + [PETAL_DEEP] * 4)
    for i in range(6):
        a = TAU * (i + 0.5) / 6
        d = Vector((math.cos(a), 0, math.sin(a)))
        verts, faces = petal(tuple(d * 0.08 + Vector((0, 0.18, 0))), tuple(d * 0.33 + Vector((0, 0.86, 0))), 0.19, 0.08, 0.045, 0.56)
        v.painted(parts, f"inner-{i}", verts, faces, paint, [PETAL_INNER, PETAL_INNER] + [PETAL] * 4)
    v.lathe_y(parts, "heart", [(0.16, 0.16, HEART), (0.4, 0.14, HEART), (0.5, 0.0, HEART)], (0.0, 0.0), 8, paint, smooth=True)
    return parts, 120


# ---------------------------------------------------------------- water weed

def water_weed():
    """みずくさ: three tall soft ribbons and a short one, waving as they rise, spread along X (thin along Z); dark at
    the root to light at the tip."""
    paint = md.paint_material("Water weed", 0.8)
    parts: list = []

    def colour(p):
        return hexmix(WEED_ROOT, WEED_TIP, max(0.0, min(1.0, p.y / 5.0)) ** 0.9)

    ribbons = [(-0.55, 4.6, 0.2, 0.0), (0.05, 5.0, -0.25, 1.4), (0.6, 4.3, 0.28, 2.6), (-0.15, 2.4, 0.15, 3.7)]
    for i, (x0, h, sway, phase) in enumerate(ribbons):
        rings = []
        ts = (0.0, 0.36, 0.7) if h > 3 else (0.0, 0.5)
        for t in ts:
            cx = x0 + sway * math.sin(t * math.pi * 1.6 + phase) + 0.12 * t
            cz = 0.24 * math.sin(t * math.pi * 2.0 + phase)
            w = 0.2 * (1.0 - 0.45 * t)
            th = 0.05 * (1.0 - 0.4 * t)
            rings.append([(cx - w, h * t - 0.05, cz), (cx + w, h * t - 0.05, cz + th * 0.4), (cx, h * t - 0.05, cz - th)])
        tip = (x0 + sway * math.sin(1.6 * math.pi + phase) + 0.12, h, 0.24 * math.sin(2 * math.pi + phase) + 0.05)
        verts, faces, _ = body(rings, top=tip)
        vc_part(parts, f"ribbon-{i}", verts, faces, colour, paint)
    return parts, 60



# ---------------------------------------------------------------- rocks, islets and banks

def islet():
    """なかす: a round rock island standing on the river bed, 18 x 20 x 26. Rock in wavy bands of grey, a wet band and a
    sand shore where the water line runs (y 15.4-18.8), and a grassy top, flat at y 20 inside |x| < 7.2 (record ① lies on
    it 6 m off the middle); two stones and two tufts of grass on the top's ends, clear of the middle."""
    paint = Paint(0.9)
    rng = random.Random(41)
    n = 14
    base = s.outline(18.0, 26.0, n, 41, lobe=0.035, power=2.3)
    # (y, scale of the outline, jitter of the rock, colour of the band up to the next ring)
    rings_spec = [(0.0, 1.0, 0.05, ROCK_DARK), (8.0, 0.9, 0.06, ROCK_WARM), (15.2, 0.86, 0.04, ROCK_WET),
                  (15.9, 0.995, 0.0, SAND_WET), (17.2, 0.95, 0.0, SAND), (18.7, 0.87, 0.0, GRASS_DARK), (19.6, 0.83, 0.0, GRASS),
                  (20.0, 0.8, 0.0, GRASS)]
    rings = []
    for y, f, jit, _ in rings_spec:
        ring = []
        for x, z in base:
            g = f * (1.0 + rng.uniform(-jit, jit))
            dy = rng.uniform(-0.6, 0.6) if 0 < y < 15 else 0.0
            ring.append((x * g, y + dy, z * g))
        rings.append(ring)
    verts, faces, tags = body(rings, top=(0.0, 20.0, 0.0))
    colours = []
    for tag in tags:
        if tag[0] == "gap":
            colours.append(rings_spec[tag[1]][3])
        elif tag[0] == "top":
            colours.append(GRASS)
        else:
            colours.append(ROCK_DARK)
    parts: list = []
    v.painted(parts, "islet", verts, faces, paint, colours)
    stone(parts, "stone-0", (1.5, 0.9, 1.2), (2.2, 20.2, 8.4), paint, ROCK, ROCK_LIGHT, 3)
    stone(parts, "stone-1", (0.9, 0.55, 0.8), (-1.6, 20.1, -9.2), paint, ROCK_WARM, ROCK_LIGHT, 5)
    s.tuft(parts, "tuft-0", (-2.8, 20.0, -8.0), 0.9, 4, 7, paint(TUFT), spread=0.3)
    s.tuft(parts, "tuft-1", (3.4, 20.0, 9.3), 0.75, 4, 9, paint(TUFT), spread=0.25)
    return parts, 300


def dome(parts, name, center, radius, height, stretch, paint, seed):
    """A low mound of white water (26 triangles): a pale blue skirt under the water line, white above it, stretched
    `stretch` times along Z (the flow)."""
    rng = random.Random(seed)
    cx, cz = center
    wob = [rng.uniform(0.9, 1.1) for _ in range(7)]
    rings = [[(cx + math.cos(TAU * i / 7) * radius * w, 0.25, cz + math.sin(TAU * i / 7) * radius * stretch * w) for i, w in enumerate(wob)]]
    rings.append([(cx + (x - cx) * 0.72, 0.25 + height * 0.62, cz + (z - cz) * 0.72) for x, _, z in rings[0]])
    verts, faces, tags = body(rings, top=(cx + rng.uniform(-0.2, 0.2), 0.25 + height, cz + rng.uniform(-0.3, 0.3)))
    cols = [FOAM_BLUE if tag[0] == "gap" else (FOAM if tag[0] == "top" else WATER) for tag in tags]
    return v.painted(parts, name, verts, faces, paint, cols, smooth=True)


def foam_field(parts, name, paint, nx, nz, half_x, half_z, bumps, seed):
    """The white water of a riffle: a closed slab whose top is a grid heaped in soft bumps [(x, z, radius, height)]
    (white where it heaps up, pale blue lower, water blue in the dips under the water line, y 0.6 in 3-2), its rim sunk
    under the water so what shows has a natural, ragged outline."""
    rng = random.Random(seed)

    def top_y(x, z, rim):
        if rim:
            return 0.3
        h = sum(a * math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / (r * r)) for bx, bz, r, a in bumps)
        return 0.42 + min(0.62, h) + rng.uniform(-0.03, 0.03)

    grid = []
    for j in range(nz + 1):
        row = []
        for i in range(nx + 1):
            u, w = -1 + 2 * i / nx, -1 + 2 * j / nz
            rim = i in (0, nx) or j in (0, nz)
            # A rounded outline: the grid's corners pulled in.
            pull = 1.0 - 0.28 * (abs(u) * abs(w)) ** 2
            x, z = u * half_x * pull + rng.uniform(-0.3, 0.3) * (not rim), w * half_z * pull + rng.uniform(-0.3, 0.3) * (not rim)
            row.append((x, top_y(x, z, rim), z))
        grid.append(row)
    verts = [p for row in grid for p in row]
    idx = lambda i, j: j * (nx + 1) + i  # noqa: E731
    faces = []
    for j in range(nz):
        for i in range(nx):
            faces.append((idx(i, j), idx(i, j + 1), idx(i + 1, j + 1), idx(i + 1, j)))
    rim = [idx(i, 0) for i in range(nx + 1)] + [idx(nx, j) for j in range(1, nz + 1)] + [idx(i, nz) for i in range(nx - 1, -1, -1)] + \
          [idx(0, j) for j in range(nz - 1, 0, -1)]
    base = len(verts)
    verts += [(verts[r][0], 0.0, verts[r][2]) for r in rim]
    m = len(rim)
    for k_ in range(m):
        faces.append((rim[k_], rim[(k_ + 1) % m], base + (k_ + 1) % m, base + k_))
    faces.append(tuple(range(base + m - 1, base - 1, -1)))

    def colour(c, i):
        if i >= nx * nz:
            return WATER
        return FOAM if c.y > 0.86 else (FOAM_BLUE if c.y > 0.66 else WATER)

    return v.painted(parts, name, verts, faces, paint, faces_colour(verts, faces, colour), smooth=True)


def rapids():
    """せ: white water over a riffle, 16 x 1.5 x 18, put 0.6 m into the river (the water line at y 0.6) and +Z upstream:
    a ragged field of white water heaped in soft bumps round six round grey rocks standing out of it, and a white mound
    piled up against the upstream side of the four biggest."""
    paint = Paint(0.7, glow={FOAM: 0.3, FOAM_BLUE: 0.18})
    parts: list = []
    rocks = [(-4.6, 4.2, 2.8, 1.45, 2.3), (4.2, 5.2, 2.5, 1.3, 2.1), (-0.8, -1.6, 2.7, 1.4, 2.2), (5.0, -4.6, 2.1, 1.15, 1.8),
             (-5.0, -5.6, 1.9, 1.05, 1.6), (1.5, 2.4, 1.5, 0.95, 1.3)]
    bumps = [(x + rng_x, z + d * 0.7, w * 0.75, 0.5) for (x, z, w, _, d), rng_x in zip(rocks, (0.2, -0.3, 0.1, 0.3, -0.2, 0.0))]
    bumps += [(x, z - d * 1.3, w * 0.6, 0.3) for x, z, w, _, d in rocks[:4]]
    bumps += [(1.8, -0.2, 1.8, 0.4), (-2.6, 1.6, 1.6, 0.35), (2.8, 7.2, 2.0, 0.3), (-1.8, -6.6, 2.0, 0.32), (6.4, 0.8, 1.5, 0.3)]
    foam_field(parts, "foam", paint, 6, 7, 7.6, 8.6, bumps, 23)
    for i, (x, z, w, h, d) in enumerate(rocks):
        stone(parts, f"rock-{i}", (w, h * 1.05, d), (x, h * 0.5, z), paint, ROCK, ROCK_LIGHT, 11 + i, rough=0.13, top_from=0.4)
    for i, (x, z, w, _, d) in enumerate(rocks[:4]):
        dome(parts, f"mound-{i}", (x, z + d * 0.72), w * 0.55, 0.62, 0.7, paint, 30 + i)
    return parts, 400


def river_bank():
    """駅の 下の 岸: a long low mound of sand and stones under a station, 28.8 x 19 x 120 at its foot (the stand-in's),
    rock below, a wet band and a sand shore, its sandy top 24 x 100 at y 19 with a few stones on it."""
    paint = Paint(0.9)
    rng = random.Random(53)
    n = 20
    base = s.outline(28.8, 120.0, n, 53, lobe=0.02, power=3.2)
    rings_spec = [(0.0, 1.0, 0.02, ROCK_DARK), (8.0, 0.985, 0.02, ROCK), (14.0, 0.965, 0.015, ROCK_WET), (16.6, 0.95, 0.0, SAND_WET),
                  (18.3, 0.9, 0.0, SAND), (19.0, 0.84, 0.0, SAND_LIGHT)]
    rings = []
    for y, f, jit, _ in rings_spec:
        rings.append([(x * f * (1 + rng.uniform(-jit, jit)), y, z * (1 - (1 - f) * 0.2) * (1 + rng.uniform(-jit, jit) * 0.2)) for x, z in base])
    verts, faces, tags = body(rings)
    colours = [rings_spec[tag[1]][3] if tag[0] == "gap" else (SAND_LIGHT if tag[0] == "cap_top" else ROCK_DARK) for tag in tags]
    parts: list = []
    v.painted(parts, "bank", verts, faces, paint, colours)
    for i, (x, z, sz) in enumerate(((7.0, 38.0, 2.2), (-6.5, -41.0, 1.8), (8.4, -12.0, 1.4))):
        stone(parts, f"stone-{i}", (sz, sz * 0.45, sz * 0.8), (x, 18.95, z), paint, ROCK, ROCK_LIGHT, 60 + i)
    return parts, 300


def river_rock():
    """かわらの いし: a smooth grey river stone with a white band round it, and a small brown pebble and a pale one
    beside it."""
    paint = Paint(0.75)
    parts: list = []
    main = v.lumpy_stone(parts, "stone", (1.55, 1.0, 1.25), (-0.2, 0.5, -0.1), paint(ROCK), paint(ROCK_LIGHT), 7, sub=2,
                         top_from=0.6, rough=0.035)
    main.data.materials.append(paint("#ECE8DE"))
    for poly in main.data.polygons:
        c = k.gltf(poly.center)
        if abs((c.x + 0.2) * 0.62 + (c.y - 0.5) * 1.0 + (c.z + 0.1) * 0.28) < 0.11:
            poly.material_index = 2
    k.set_smooth(main, True)
    stone(parts, "brown", (0.6, 0.42, 0.5), (0.68, 0.2, 0.42), paint, "#B59A7A", "#C7AE8E", 4, rough=0.06, smooth=True)
    stone(parts, "pale", (0.42, 0.3, 0.38), (-0.78, 0.15, 0.52), paint, "#D9D4C9", "#E8E3D8", 9, rough=0.06, smooth=True)
    return parts, 120



# ---------------------------------------------------------------- the sea arch

def sea_arch():
    """うみの アーチ: a chunky natural rock arch at the valley's south end, 60 x 30 x 20, front +Z (toward the valley).
    Two legs and a crown in wavy bands of warm grey, grass, tufts and a round bush on top, boulders at its feet; in the
    opening, a picture of the sea beyond (deep blue water with white wave lines under a pale sky) on a thin panel at
    z -1.2, which in 3-2 is just in front of the valley's cliff (the arch's back half is inside it)."""
    paint = Paint(0.9, glow={FOAM: 0.2, SKY: 0.35, SEA: 0.15})
    rng = random.Random(61)
    outer = [(-30, 0), (-29.5, 7), (-28.6, 14), (-26.6, 20), (-22.2, 25.4), (-14.5, 28.9), (-5, 30), (5, 30), (14.5, 28.9), (22.2, 25.4),
             (26.6, 20), (28.6, 14), (29.5, 7), (30, 0)]
    inner = [(-17, 0), (-17.2, 7), (-17, 13), (-16.2, 17.6), (-13.4, 21.6), (-8.6, 23.9), (-3, 24.7), (3, 24.7), (8.6, 23.9), (13.4, 21.6),
             (16.2, 17.6), (17, 13), (17.2, 7), (17, 0)]
    zf, zb = 10.0, -10.0
    rings = []
    for (ox, oy), (ix, iy) in zip(outer, inner):
        o, i = Vector((ox, oy)), Vector((ix, iy))
        n = (o - i).normalized()

        def jit(pt, z, keep_floor=True):
            dx, dy = rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5)
            if keep_floor and pt.y < 0.01:
                dy = 0.0
            return (pt.x + dx, max(0.0, pt.y + dy), z + rng.uniform(-0.35, 0.35))

        rings.append([jit(o, zf - 1.2), jit(o + n * 0.9, 2.0), (o.x, o.y, zb), (i.x, i.y, zb), jit(i - n * 0.7, 2.0), jit(i, zf - 1.2),
                      jit(i.lerp(o, 0.33), zf), jit(i.lerp(o, 0.68), zf)])
    verts, faces, tags = body(rings)

    def colour(c, idx):
        tag = tags[idx]
        if tag[0] != "gap":
            return ROCK_DARK
        f = faces[idx]
        a, b, d = (Vector(verts[f[j]]) for j in (0, 1, 3))
        nrm = (b - a).cross(d - a)
        band = int((c.y + 1.6 * math.sin(c.x * 0.17) + 1.0) / 4.2) % 3
        rock = [ROCK, ROCK_LIGHT, ROCK_WARM][band]
        if tag[2] in (0, 1) and c.y > 25.5:  # the crown's top
            return GRASS
        if tag[2] in (4,) and c.y > 18:  # under the crown
            return ROCK_DARK
        return rock

    parts: list = []
    v.painted(parts, "arch", verts, faces, paint, faces_colour(verts, faces, colour))
    # The sea through the opening: a pale sky plate filling it, the sea in front of its lower part, two wave lines.
    sky = [(-17.6, 12.4), (17.6, 12.4)] + [(x * 1.03, y + 0.4) for x, y in inner[2:-2]][::-1]
    s.plate(parts, "sky", (0.0, 0.0, -1.35), (1, 0, 0), (0, 1, 0), sky, 0.3, [paint(SKY)])
    s.plate(parts, "sea", (0.0, 0.0, -1.0), (1, 0, 0), (0, 1, 0), [(-17.5, 12.4), (17.5, 12.4), (17.4, 19.4), (-17.4, 19.4)], 0.3,
            [paint(SEA)])
    wave_tris = []
    for y0, phase in ((16.8, 0.0), (14.4, 1.3)):
        for i in range(5):
            x0 = -14 + i * 7 + phase
            wave_tris += [((x0 - 1.6, y0), (x0 + 1.6, y0), (x0, y0 + 0.45))]
    v.flat_tris(parts, "waves", wave_tris, -0.84, paint(FOAM))
    # Boulders at the feet (half in the water in 3-2) and plants on the crown.
    for i, (x, y, z, sz) in enumerate(((-25.0, 12.0, 6.8, 5.0), (24.0, 12.4, 6.2, 4.4), (-20.5, 11.6, 8.4, 3.0))):
        stone(parts, f"boulder-{i}", (sz, sz * 0.75, sz * 0.85), (x, y, z), paint, ROCK, ROCK_LIGHT, 70 + i)
    for i, (x, z) in enumerate(((-17.0, 3.0), (6.0, 4.5), (19.0, 2.0))):
        y = 28.9 if abs(x) > 12 else 30.0
        s.tuft(parts, f"tuft-{i}", (x, y - 0.2, z), 1.6, 4, 80 + i, paint(TUFT), spread=0.6)
    bush = k.add_ellipsoid(parts, "bush", (5.2, 3.4, 4.6), (-6.0, 30.6, 1.0), paint(GRASS_DARK), segments=8, rings=4, smooth=False)
    bush.data.materials.append(paint(GRASS))
    for poly in bush.data.polygons:
        poly.material_index = 1 if poly.normal.z > 0.4 else 0
    return parts, 500


# ---------------------------------------------------------------- the falls

LIP_PROFILE = {
    # (z, y) round the lip's cross-section, from the back of its foot; the water comes out from under the eave.
    "water": [(2.0, 0.0), (-1.0, 0.0), (-1.05, 1.2), (-1.75, 1.32), (-2.0, 1.58), (-1.85, 1.85), (-1.55, 1.98), (-1.98, 2.18),
              (-1.5, 2.5), (0.6, 2.5), (2.0, 2.05)],
    "rock": [(2.0, 0.0), (-1.0, 0.0), (-1.05, 1.2), (-1.7, 1.3), (-1.96, 1.58), (-1.9, 1.85), (-1.7, 1.98), (-1.98, 2.18),
             (-1.5, 2.5), (0.6, 2.5), (2.0, 2.05)],
}
LIP_COLOURS = {
    "water": [ROCK_DARK, ROCK_DARK, FOAM_BLUE, FOAM_BLUE, FOAM, ROCK_DARK, ROCK, ROCK_LIGHT, GRASS, GRASS, ROCK],
    "rock": [ROCK_DARK, ROCK_DARK, ROCK_DARK, ROCK, ROCK_LIGHT, ROCK, ROCK, ROCK_LIGHT, GRASS, GRASS, ROCK],
}


def falls_lip():
    """たきの 口の 岩の ひさし: a long rock ledge, 124 x 2.5 x 4, along the top of the falls, its front (-Z) over the
    valley. The water of the falls comes out from under its eave as a white roll along the middle (|x| < 57, the
    curtain's width; the game's curtain starts just in front of it); a grassy top with tufts, rock banks at the ends.
    In 3-2 the meadow's ground is at y 1.5 and the valley's cliff face at z -1.2: what is below and behind them is
    hidden, so nothing that shows comes forward of z -2 (the train passes 1.1 m in front)."""
    paint = Paint(0.85, glow={FOAM: 0.35, FOAM_BLUE: 0.2})
    rng = random.Random(71)
    xs = [-62.0, -60.8, -57.0, -48.0, -36.0, -24.0, -12.0, 0.0, 12.0, 24.0, 36.0, 48.0, 57.0, 60.8, 62.0]
    kinds = ["rock" if abs(x) > 58 else "water" for x in xs]
    rings = []
    for x, kind in zip(xs, kinds):
        # The ends are rounded off: the last cross-sections shrink toward the middle of the ledge's foot.
        shrink = 0.5 if abs(x) > 61.9 else (0.88 if abs(x) > 60 else 1.0)
        ring = []
        for j, (z, y) in enumerate(LIP_PROFILE[kind]):
            if j in (6, 7, 8) and abs(x) < 61.9:
                z = max(-2.0, z + rng.uniform(-0.08, 0.06))
                y += rng.uniform(-0.06, 0.0)
            if j == 9:
                y -= rng.uniform(0.0, 0.08)
            z, y = 0.2 + (z - 0.2) * shrink, y * (0.6 + 0.4 * shrink) if shrink < 1 else y
            ring.append((x, y, z))
        rings.append(ring)
    verts, faces, tags = body(rings)
    colours = []
    for tag in tags:
        if tag[0] != "gap":
            colours.append(ROCK)
            continue
        both_water = kinds[tag[1]] == "water" and kinds[tag[1] + 1] == "water"
        colours.append(LIP_COLOURS["water" if both_water else "rock"][tag[2]])
    parts: list = []
    v.painted(parts, "lip", verts, faces, paint, colours)
    for i, (x, z, h) in enumerate(((-44.0, 0.9, 0.3), (52.0, 0.7, 0.32))):
        s.tuft(parts, f"tuft-{i}", (x, 2.45, z), h, 4, 90 + i, paint(TUFT), spread=0.3)
    stone(parts, "stone-0", (1.6, 1.1, 1.3), (-61.0, 1.9, -0.6), paint, ROCK, ROCK_LIGHT, 95)
    stone(parts, "stone-1", (1.5, 1.0, 1.2), (61.0, 1.85, -0.5), paint, ROCK, ROCK_LIGHT, 96)
    return parts, 400


def falls_mini():
    """The map's little waterfall, 7 x 5 x 7: a rock cliff with a grassy top at the back, a curtain of white and pale blue
    streaks falling from it into a round pool, foam where it lands, two stones by the pool and a rainbow in front."""
    paint = Paint(0.8, glow={FOAM: 0.35, FOAM_BLUE: 0.25, **{c: 0.35 for c in RAINBOW}})
    parts: list = []
    rng = random.Random(81)
    base = s.outline(6.6, 2.2, 12, 81, lobe=0.03, power=3.0)
    spec = [(0.0, 1.04, ROCK_DARK), (1.6, 1.0, ROCK), (3.1, 0.98, ROCK_WARM), (4.4, 0.96, GRASS_DARK), (4.75, 1.02, GRASS), (5.0, 0.9, GRASS)]
    rings = [[(x * f * (1 + rng.uniform(-0.03, 0.03)), y, -1.25 + z * f) for x, z in base] for y, f, _ in spec]
    verts, faces, tags = body(rings)
    v.painted(parts, "cliff", verts, faces, paint, [spec[t[1]][2] if t[0] == "gap" else (GRASS if t[0] == "cap_top" else ROCK_DARK) for t in tags])
    # The curtain: a thin curved sheet from the cliff's lip down into the pool, in streaks.
    cols, rows = 5, 4
    front, back = [], []
    for r in range(rows + 1):
        u = r / rows
        y = 4.55 - 4.3 * u
        z = -0.12 + 1.0 * u * u
        for c in range(cols + 1):
            x = -1.7 + 3.4 * c / cols
            front.append((x, y, z + 0.06))
            back.append((x, y, z - 0.06))
    verts = front + back
    m = len(front)
    faces, colours = [], []
    for r in range(rows):
        for c in range(cols):
            a = r * (cols + 1) + c
            faces.append((a, a + 1, a + cols + 2, a + cols + 1))
            colours.append(FOAM if c % 2 == 0 else "#A9DDF2")
            faces.append((m + a, m + a + cols + 1, m + a + cols + 2, m + a + 1))
            colours.append(FOAM_BLUE)
    for r in range(rows):
        for c in (0, cols):
            a, b = r * (cols + 1) + c, (r + 1) * (cols + 1) + c
            faces.append((a, b, m + b, m + a))
            colours.append(FOAM)
    for c in range(cols):
        for r in (0, rows):
            a = r * (cols + 1) + c
            faces.append((a, m + a, m + a + 1, a + 1))
            colours.append(FOAM)
    v.painted(parts, "curtain", verts, faces, paint, colours)
    # The pool, the foam where the water lands, two stones.
    v.lathe_y(parts, "pool", [(0.0, 2.65, WATER_DEEP), (0.22, 2.65, "#7CCBEA"), (0.24, 0.0, "#7CCBEA")], (0.0, 1.75), 16, paint, smooth=False)
    dome(parts, "foam-0", (-0.6, 0.95), 0.95, 0.42, 1.0, paint, 83)
    dome(parts, "foam-1", (0.75, 1.05), 0.8, 0.36, 1.0, paint, 84)
    stone(parts, "stone-0", (1.1, 0.8, 0.9), (-2.45, 0.3, 2.6), paint, ROCK, ROCK_LIGHT, 85)
    stone(parts, "stone-1", (0.8, 0.6, 0.7), (2.5, 0.25, 2.9), paint, ROCK_WARM, ROCK_LIGHT, 86)
    # The rainbow: five bands on a flat arch standing over the pool, facing +Z.
    segs, r0, w, cz, cy, depth = 8, 1.75, 0.17, 2.2, 0.25, 0.08
    radii = [r0 + w * b for b in range(len(RAINBOW) + 1)]
    verts, faces, colours = [], [], []
    for zz in (cz + depth / 2, cz - depth / 2):
        for i in range(segs + 1):
            a = math.pi * i / segs
            for r in radii:
                verts.append((math.cos(a) * r, cy + math.sin(a) * r * 0.95, zz))
    nr = len(radii)
    back = (segs + 1) * nr
    for i in range(segs):
        for b in range(nr - 1):
            a0 = i * nr + b
            faces.append((a0, a0 + nr, a0 + nr + 1, a0 + 1))
            colours.append(RAINBOW[len(RAINBOW) - 1 - b])
        a0 = back + i * nr
        faces.append((a0, a0 + nr - 1, a0 + 2 * nr - 1, a0 + nr))
        colours.append(RAINBOW[2])
        for b in (0, nr - 1):  # inner and outer edges
            p, q = i * nr + b, (i + 1) * nr + b
            faces.append((p, back + p, back + q, q))
            colours.append(RAINBOW[0 if b == nr - 1 else len(RAINBOW) - 1])
    for i in (0, segs):  # the feet
        p = i * nr
        faces.append((p, p + nr - 1, back + p + nr - 1, back + p))
        colours.append(RAINBOW[2])
    v.painted(parts, "rainbow", verts, faces, paint, colours)
    return parts, 600


# ---------------------------------------------------------------- Sakasa's stones

def flat_stone(parts, name, center, radius, height, paint, seed, segs=7, side=ROCK, top=ROCK_LIGHT):
    """A flat round stone (26 triangles for 7 sides): straight sides, a gently domed top."""
    rng = random.Random(seed)
    cx, cz = center
    wob = [rng.uniform(0.86, 1.1) for _ in range(segs)]
    turn = rng.uniform(0, TAU)
    r0 = [(cx + math.cos(turn + TAU * i / segs) * radius * w * 1.04, 0.0, cz + math.sin(turn + TAU * i / segs) * radius * w * 1.04)
          for i, w in enumerate(wob)]
    tilt = (rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04))
    r1 = [(cx + (x - cx) * 0.94, height * 0.8 + (x - cx) * tilt[0] + (z - cz) * tilt[1], cz + (z - cz) * 0.94) for x, _, z in r0]
    verts, faces, tags = body([r0, r1], top=(cx, height, cz))
    return v.painted(parts, name, verts, faces, paint, [side if tg[0] == "gap" else (top if tg[0] == "top" else ROCK_DARK) for tg in tags],
                     smooth=False)


def stepping_stones():
    """とびいし: six flat light stones in a zigzag along Z, 3.5 x 0.8 x 28 (0.4 m out of the water in 3-2), each a
    little different in size and turn."""
    paint = Paint(0.85)
    parts: list = []
    for i in range(6):
        z = -12.6 + i * 5.05
        x = (0.65 if i % 2 else -0.65) + (0.1 if i == 3 else 0.0)
        flat_stone(parts, f"stone-{i}", (x, z), 1.08 + 0.12 * ((i * 7) % 3), 0.8 - 0.06 * (i % 2), paint, 100 + i, side=ROCK_WARM,
                   top="#D6CEBF")
    return parts, 200


def kawa_rock():
    """サカサが すわる 岩: a broad flat-topped rock in the river, 5 x 1.5 x 4: wet and darker below the water line (y
    0.7 in 3-2), pale and dry above, its top flat at y 1.5 round the middle (Sakasa stands there), a little tuft at one
    end, two pebbles by its foot."""
    paint = Paint(0.85)
    rng = random.Random(111)
    n = 12
    base = s.outline(5.0, 4.0, n, 111, lobe=0.04, power=2.6)
    spec = [(0.0, 0.96, ROCK_WET), (0.7, 1.0, ROCK), (1.25, 0.96, ROCK_LIGHT), (1.45, 0.84, "#D3CCBD")]
    rings = [[(x * f * (1 + rng.uniform(-0.02, 0.02)), y, z * f * (1 + rng.uniform(-0.02, 0.02))) for x, z in base] for y, f, _ in spec]
    verts, faces, tags = body(rings, top=(0.0, 1.5, 0.0))

    def colour(c, idx):
        tag = tags[idx]
        if tag[0] == "top":
            return "#D3CCBD"
        if tag[0] == "gap":
            return spec[tag[1]][2]
        return ROCK_DARK

    parts: list = []
    v.painted(parts, "rock", verts, faces, paint, faces_colour(verts, faces, colour))
    s.tuft(parts, "tuft", (2.05, 1.38, -0.55), 0.26, 4, 113, paint(TUFT), spread=0.12)
    stone(parts, "pebble-0", (0.7, 0.45, 0.6), (-2.35, 0.2, 1.0), paint, ROCK_WET, ROCK_LIGHT, 114)
    stone(parts, "pebble-1", (0.5, 0.35, 0.45), (1.9, 0.15, 1.75), paint, ROCK_WET, ROCK_LIGHT, 115)
    return parts, 150



# ---------------------------------------------------------------- the paper boat

def ribbon_x(parts, name, points, width, m, facing):
    """A flat strip along points [(y, z)] in the plane x = points' x (given as `facing`'s side), facing +X (facing 1)
    or -X (-1)."""
    verts, faces = [], []
    pts = [Vector(p) for p in points]
    for i, p in enumerate(pts):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        along = (b - a).normalized()
        across = Vector((0.0, -along.z, along.y))  # in the plane x = const
        half = width / 2 * (0.6 + 0.4 * math.sin(math.pi * i / (len(pts) - 1)))
        verts += [tuple(p + across * half), tuple(p - across * half)]
    faces = [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(len(pts) - 1)]
    obj = k.add_mesh(parts, name, verts, faces, [m], smooth=True)
    if (k.gltf(obj.data.polygons[0].normal).x > 0) != (facing > 0):
        obj.data.flip_normals()
    return obj


def paper_boat():
    """かみの ふね: a pink paper boat folded the old way, 0.48 x 0.45 x 0.9: a hull with pointed raised ends, its sides
    in two pinks like folds, and a triangular sail standing along it with a deep pink swirl on both sides (Sakasa's
    mark). In the ending its sail carries her drawing of the train (the card shows it; not modelled)."""
    paint = Paint(0.7, glow={PAPER_LIGHT: 0.3, PAPER: 0.25, PAPER_DEEP: 0.2, SWIRL: 0.15})
    parts: list = []
    rim = [(0.0, 0.27, 0.45), (0.22, 0.18, 0.16), (0.22, 0.18, -0.16), (0.0, 0.27, -0.45), (-0.22, 0.18, -0.16), (-0.22, 0.18, 0.16)]
    keel = [(0.0, 0.0, 0.25), (0.12, 0.0, 0.09), (0.12, 0.0, -0.09), (0.0, 0.0, -0.25), (-0.12, 0.0, -0.09), (-0.12, 0.0, 0.09)]
    verts, faces, tags = body([keel, rim])
    colours = [(PAPER if tg[2] % 3 == 1 else PAPER_LIGHT) if tg[0] == "gap" else (PAPER_DEEP if tg[0] == "cap_top" else PAPER) for tg in tags]
    v.painted(parts, "hull", verts, faces, paint, colours)
    s.plate(parts, "sail", (0.0, 0.0, 0.0), (0, 0, 1), (0, 1, 0), [(-0.19, 0.16), (0.19, 0.16), (0.015, 0.45)], 0.014, [paint(PAPER_LIGHT)])
    for side in (1, -1):
        pts = []
        for i in range(8):
            a = 2.9 * math.pi * i / 7
            r = 0.012 + 0.058 * i / 7
            pts.append((side * 0.0085, 0.27 + math.sin(a) * r, 0.0 + side * math.cos(a) * r))
        ribbon_x(parts, f"swirl-{side}", pts, 0.017, paint(SWIRL), side)
    return parts, 60


# ---------------------------------------------------------------- animals

def nearest_volume(volumes, p):
    """The index of the ellipsoid (size, centre) whose surface `p` is nearest to (in its own units)."""
    best, best_d = 0, math.inf
    for i, (size, centre) in enumerate(volumes):
        d = abs(math.sqrt(sum(((p[a] - centre[a]) / (size[a] / 2)) ** 2 for a in range(3))) - 1.0) * min(size)
        if d < best_d:
            best, best_d = i, d
    return best


def painted_clay(paint, volumes, colours, name, budget, voxel, ground=True):
    """Volumes fused into one smooth body, each face taking the colour of the volume it lies nearest to (colours[i] is
    a hex or fn(centre, normal) -> hex)."""
    body_ = clay(volumes, name, paint(colours[0] if isinstance(colours[0], str) else "#FFFFFF"), budget, voxel, ground=ground)
    recolour(body_, paint, lambda c, n: (lambda col: col if isinstance(col, str) else col(c, n))(colours[nearest_volume(volumes, c)]))
    return body_


def frog():
    """かえる: a round light-green frog sitting low, 0.7 x 0.5 x 0.8, a pale tummy and throat, folded hind legs and
    small front feet, and two round eyes on bumps on top (its highest point: a frog swimming in the leaping flock keeps
    them out of the water). Eyes only (no mouth), nothing like a known character."""
    paint = Paint(0.6, glow={FROG_BELLY: 0.1})
    belly = lambda c, n: FROG_BELLY if (n.y < -0.35 or (c.y < 0.2 and n.z > 0.35)) else FROG  # noqa: E731
    volumes = [((0.62, 0.34, 0.66), (0.0, 0.19, -0.05)), ((0.52, 0.27, 0.38), (0.0, 0.24, 0.17)),
               ((0.17, 0.17, 0.17), (0.14, 0.39, 0.19)), ((0.17, 0.17, 0.17), (-0.14, 0.39, 0.19)),
               ((0.21, 0.18, 0.34), (0.25, 0.12, -0.15)), ((0.21, 0.18, 0.34), (-0.25, 0.12, -0.15)),
               ((0.13, 0.09, 0.25), (0.29, 0.045, 0.03)), ((0.13, 0.09, 0.25), (-0.29, 0.045, 0.03)),
               ((0.12, 0.09, 0.14), (0.17, 0.045, 0.26)), ((0.12, 0.09, 0.14), (-0.17, 0.045, 0.26))]
    colours = [belly, belly, FROG, FROG, FROG, FROG, FROG_DARK, FROG_DARK, FROG_DARK, FROG_DARK]
    skin = painted_clay(paint, volumes, colours, "frog", 116, 0.02)
    parts: list = [skin]
    tree = k.world_tree(skin)
    for side in (-1, 1):
        v.eye(parts, paint, tree, (side * 0.14, 0.39, 0.19), v.look(side * math.radians(38), math.radians(18)), (0.085, 0.1), f"eye-{side}",
              skin)
    return parts, 150


def duck(volumes, colours, z, scale, head_turn=0.0, head_up=0.0):
    """One duck's volumes (body, chest, tail, neck, head, two wings, wing tips) at `z`, `scale` times the mother's."""
    sc = scale

    def at(x, y, zz):
        return (x * sc, y * sc, z + zz * sc)

    hx, hz = math.sin(head_turn) * 0.12, 0.0
    vols = [((0.7 * sc, 0.48 * sc, 1.1 * sc), at(0.0, 0.34, 0.0)), ((0.56 * sc, 0.48 * sc, 0.5 * sc), at(0.0, 0.42, 0.38)),
            ((0.3 * sc, 0.2 * sc, 0.42 * sc), at(0.0, 0.48, -0.52)), ((0.26 * sc, 0.38 * sc, 0.26 * sc), at(hx * 0.5, 0.68, 0.5)),
            ((0.38 * sc, 0.36 * sc, 0.42 * sc), at(hx, 0.86 + head_up, 0.56 + hz))]
    body_c = colours["body"]
    cols = [body_c, body_c, body_c, body_c, body_c]
    for side in (-1, 1):
        vols.append(((0.12 * sc, 0.3 * sc, 0.62 * sc), at(side * 0.31, 0.44, -0.08)))
        cols.append(colours["wing"])
        vols.append(((0.1 * sc, 0.18 * sc, 0.26 * sc), at(side * 0.27, 0.48, -0.4)))
        cols.append(colours["tip"])
    volumes += vols
    return cols, at(hx, 0.86 + head_up, 0.56 + hz)


def duck_family():
    """かもの おやこ: a mother duck and her four ducklings walking in a row, 0.9 x 1 x 4.4, the mother in front (+Z).
    Real ducks' plain colours: the mother cream with brown wings, the ducklings soft yellow; round orange bills, round
    dark eyes with a shine and nothing else on the face. No hat, no clothes, no blue and white."""
    paint = Paint(0.65, glow={DUCKLING: 0.12, DUCK: 0.1})
    parts: list = []
    volumes: list = []
    cols, head = duck(volumes, {"body": DUCK, "wing": DUCK_WING, "tip": DUCK_WING_TIP}, 1.2, 1.0)
    mother = painted_clay(paint, volumes, cols, "mother", 236, 0.026)
    parts.append(mother)
    tree = k.world_tree(mother)
    hx, hy, hz = head
    v.ellipsoid(parts, "bill", (0.2, 0.09, 0.22), (hx, hy - 0.03, hz + 0.24), paint(BILL), 6, 3)
    for side in (-1, 1):
        v.eye(parts, paint, tree, head, v.look(side * math.radians(52), math.radians(14)), (0.06, 0.07), f"eye-{side}", mother)
        v.ellipsoid(parts, f"foot-{side}", (0.16, 0.05, 0.24), (side * 0.14, 0.025, 1.32), paint(BILL), 5, 2)
    poses = [(0.18, 0.0, 0.03), (-0.55, -0.25, 0.0), (-1.27, 0.2, 0.05), (-1.98, 0.0, -0.02)]
    for i, (z, turn, up) in enumerate(poses):
        vols: list = []
        cols, head = duck(vols, {"body": DUCKLING, "wing": DUCKLING_WING, "tip": DUCKLING_WING}, z, 0.5, turn, up)
        # A duckling: rounder, a bigger head, short tail.
        vols[0] = ((0.42, 0.34, 0.52), (0.0, 0.18, z))
        vols[2] = ((0.16, 0.1, 0.16), (0.0, 0.25, z - 0.27))
        vols[4] = ((0.3, 0.29, 0.31), (vols[4][1][0], 0.43 + up, z + 0.24))
        head = vols[4][1]
        ducky = painted_clay(paint, vols, cols, f"duckling-{i}", 88, 0.018)
        parts.append(ducky)
        tree = k.world_tree(ducky)
        hx, hy, hz = head
        v.ellipsoid(parts, f"bill-{i}", (0.12, 0.05, 0.12), (hx + math.sin(turn) * 0.1, hy - 0.025, hz + 0.15 * math.cos(turn)), paint(BILL), 4, 3)
        for side in (-1, 1):
            v.eye(parts, paint, tree, head, v.look(turn + side * math.radians(55), math.radians(14)), (0.045, 0.052), f"eye-{i}-{side}", ducky)
    return parts, 900


# ---------------------------------------------------------------- snow

def snow_patch():
    """のこった 雪: a soft mound of old snow, 10 x 1.5 x 8, in round lumps fused into one (over 1 m high round its
    middle, where record ③ waits under it), white on top and pale blue on its shaded sides and foot."""
    paint = Paint(0.9, glow={SNOW: 0.2, SNOW_SHADE: 0.15, SNOW_DEEP: 0.1})
    volumes = [((6.4, 2.6, 5.4), (0.0, 0.0, 0.0)), ((4.2, 2.0, 3.6), (2.6, 0.0, 1.3)), ((3.8, 1.8, 3.2), (-2.8, 0.0, -1.2)),
               ((3.2, 1.6, 3.0), (-2.4, 0.0, 2.2)), ((3.0, 1.5, 2.6), (2.9, 0.0, -2.0)), ((2.4, 2.2, 2.4), (0.6, 0.0, -0.6))]
    mound = clay(volumes, "snow", paint(SNOW), 196, 0.12, ground=True, smooth=6)
    recolour(mound, paint, lambda c, n: SNOW if n.y > 0.62 else (SNOW_SHADE if c.y > 0.22 else SNOW_DEEP))
    return [mound], 200


def snow_peak():
    """とおくの 雪の 山: a big friendly mountain far away, 400 x 260 x 400, broad at the foot, three soft ridges turning
    round it, its top leaning a little; a snow cap whose lower edge runs down the gullies, blue-grey rock below."""
    paint = Paint(0.95, glow={SNOW: 0.4, SNOW_SHADE: 0.3, PEAK_ROCK_LIGHT: 0.12, PEAK_ROCK: 0.1, PEAK_FOOT: 0.08})
    n = 20
    spec = [(0.0, 1.0), (42.0, 0.86), (88.0, 0.67), (132.0, 0.48), (172.0, 0.32), (206.0, 0.19), (236.0, 0.09)]
    rings = []
    for y, f in spec:
        lean = 14.0 * (y / 260.0) ** 1.5
        ring = []
        for i in range(n):
            a = TAU * i / n + y * 0.002
            lobe = 1.0 + 0.13 * math.sin(3 * a + 0.5) * (1.0 - y / 320.0) + 0.06 * math.sin(5 * a + 1.2)
            ring.append((lean + math.cos(a) * 200.0 * f * lobe, y, math.sin(a) * 200.0 * f * lobe))
        rings.append(ring)
    verts, faces, tags = body(rings, top=(14.0, 260.0, 0.0))

    def colour(c, idx):
        a = math.atan2(c.z, c.x - 7.0)
        line = 150.0 - 34.0 * max(0.0, math.sin(3 * a + 2.1)) - 10.0 * math.sin(7 * a)
        if tags[idx][0] == "cap_bottom":
            return PEAK_FOOT
        if c.y > line:
            return SNOW if c.y > line + 22 else SNOW_SHADE
        if c.y > line - 34:
            return PEAK_ROCK_LIGHT
        return PEAK_ROCK if c.y > 40 else PEAK_FOOT

    parts: list = []
    v.painted(parts, "peak", verts, faces, paint, faces_colour(verts, faces, colour))
    return parts, 400


# ---------------------------------------------------------------- records

def blue_feather():
    """記録①「かわせみの あおい はね」: a kingfisher's feather lying on the islet, 0.3 x 0.1 x 1, tip +Z: a cream quill
    the whole length, bare at the root, two vanes either side of it (one with a split in its edge), bright blue with a
    deeper blue along the quill and an orange tip, a little cupped, the tip curling up; it glows a little."""
    paint = Paint(0.5, glow={FEATHER: 0.2, FEATHER_LIGHT: 0.25, FEATHER_DEEP: 0.15, FEATHER_TIP: 0.2})
    parts: list = []
    widths = [(0.12, 0.012, 0.012), (0.2, 0.1, 0.07), (0.32, 0.135, 0.095), (0.45, 0.14, 0.1), (0.52, 0.09, 0.1), (0.58, 0.14, 0.095),
              (0.72, 0.125, 0.085), (0.86, 0.085, 0.06), (1.0, 0.008, 0.006)]
    rings = []

    def point(t, x, y):
        return (x + 0.02 * math.sin(math.pi * t), 0.035 + y + 0.05 * max(0.0, t - 0.7) ** 2 / 0.09, -0.5 + t)

    for tt, wl, wr in widths:
        cup, th = 0.012 + 0.04 * (wl + wr), 0.012
        rings.append([point(tt, -wl, cup), point(tt, -wl * 0.45, th), point(tt, wr * 0.45, th), point(tt, wr, cup),
                      point(tt, wr * 0.45, -th), point(tt, -wl * 0.45, -th)])
    verts, faces, tags = body(rings)

    def colour(c, idx):
        tag = tags[idx]
        t = c.z + 0.5
        if t > 0.82:
            return FEATHER_TIP
        if tag[0] == "gap" and tag[2] in (1,):
            return FEATHER_DEEP
        if tag[0] == "gap" and tag[2] in (0, 2):
            return FEATHER_LIGHT if 0.3 < t < 0.6 and tag[2] == 0 else FEATHER
        return FEATHER_DEEP

    v.painted(parts, "vanes", verts, faces, paint, faces_colour(verts, faces, colour), smooth=True)
    path = [point(t, 0.0, 0.022) for t in (0.0, 0.12, 0.45, 0.8, 0.99)]
    path[0] = (path[0][0], 0.02, path[0][2])
    obj = k.add_swept_tube(parts, "quill", path, [0.016, 0.014, 0.011, 0.007, 0.003], [paint(QUILL)] * 4, sides=4)
    s.fix_normals(obj)
    return parts, 150


def jade_stone():
    """記録②「かわぞこの ひすい」: a round smooth green stone on the river bed, 0.8 x 0.5 x 0.8, lighter on top, with a
    soft shine and a little four-pointed sparkle; it glows so it shows in the water ("きらっ")."""
    paint = Paint(0.25, glow={JADE: 0.3, JADE_LIGHT: 0.35, JADE_DEEP: 0.25, "#FFFFFF": 0.8, "#E9FFF4": 0.6})
    parts: list = []
    gem = v.lumpy_stone(parts, "stone", (0.8, 0.5, 0.8), (0.0, 0.25, 0.0), paint(JADE), paint(JADE_LIGHT), 121, sub=2, top_from=0.62,
                        rough=0.03)
    gem.data.materials.append(paint(JADE_DEEP))
    for poly in gem.data.polygons:
        if poly.normal.z < -0.45:
            poly.material_index = 2
    k.set_smooth(gem, True)
    tree = k.world_tree(gem)
    p, nrm = v.on_surface(tree, (-0.4, 0.75, 0.45), (0.0, 0.25, 0.0))
    v.sticker(parts, "shine", tuple(p), tuple(nrm), (0.13, 0.08), paint("#E9FFF4"), 8, tilt=0.5, lift=0.004)
    p, nrm = v.on_surface(tree, (0.3, 0.8, 0.2), (0.0, 0.25, 0.0))
    up = Vector((0, 1, 0))
    u = (up - nrm * nrm.dot(up)).normalized()
    w = nrm.cross(u).normalized()
    c = p + nrm * 0.006
    star = [tuple(c)]
    for i in range(8):
        a = TAU * i / 8
        r = 0.09 if i % 2 == 0 else 0.022
        star.append(tuple(c + u * (math.cos(a) * r) + w * (math.sin(a) * r)))
    obj = k.add_mesh(parts, "sparkle", star, [(0, 1 + i, 1 + (i + 1) % 8) for i in range(8)], [paint("#FFFFFF")])
    if k.gltf(obj.data.polygons[0].normal).dot(nrm) < 0:
        obj.data.flip_normals()
    return parts, 200


def fukinotou():
    """記録③「ゆきの したの ふきのとう」: a butterbur bud just out of the ground, 0.6 x 0.6 x 0.6: broad light-green
    scales wrapped round a pale yellow-green heart of tiny buds that peeks out at the top, three opening out at its
    foot."""
    paint = Paint(0.6, glow={BUD_HEART: 0.15, BUD_LIGHT: 0.1})
    parts: list = []
    v.lathe_y(parts, "heart", [(0.08, 0.13, BUD_HEART), (0.3, 0.16, BUD_HEART), (0.46, 0.1, BUD_HEART), (0.53, 0.0, BUD_HEART)], (0.0, 0.0), 9,
              paint, smooth=True)
    for i in range(6):
        a = TAU * i / 6 + 0.2
        d = Vector((math.cos(a), 0, math.sin(a)))
        verts, faces = petal(tuple(d * 0.07 + Vector((0, 0.03, 0))), tuple(d * 0.17 + Vector((0, 0.42, 0))), 0.15, -0.06, 0.035, 0.5)
        v.painted(parts, f"scale-{i}", verts, faces, paint, [BUD_DEEP, BUD_DEEP] + [BUD] * 4)
    for i in range(5):
        a = TAU * (i + 0.5) / 5
        d = Vector((math.cos(a), 0, math.sin(a)))
        verts, faces = petal(tuple(d * 0.05 + Vector((0, 0.12, 0))), tuple(d * 0.1 + Vector((0, 0.5, 0))), 0.12, -0.05, 0.03, 0.5)
        v.painted(parts, f"inner-{i}", verts, faces, paint, [BUD, BUD] + [BUD_LIGHT] * 4)
    for i in range(3):
        a = TAU * i / 3 + 0.9
        d = Vector((math.cos(a), 0, math.sin(a)))
        verts, faces = petal(tuple(d * 0.08 + Vector((0, 0.02, 0))), tuple(d * 0.27 + Vector((0, 0.22, 0))), 0.13, -0.05, 0.03, 0.5)
        v.painted(parts, f"leaf-{i}", verts, faces, paint, [BUD_DEEP, BUD_DEEP] + [BUD] * 4)
    return parts, 200


# ---------------------------------------------------------------- export and preview

def floor_to_zero(model):
    """Move the model so its lowest point is at y = 0, keeping its x/z origin."""
    _, lo, _ = k.model_metrics(model)
    if abs(lo[1]) > 1e-6:
        model.location.z -= lo[1]
        k.active(model)
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)


def centre_xz(model):
    """Put the bounding box's middle over the origin (x and z)."""
    _, lo, hi = k.model_metrics(model)
    model.location.x -= (lo[0] + hi[0]) / 2
    model.location.y += (lo[2] + hi[2]) / 2  # Blender y = glTF -z
    k.active(model)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)


def export_glb(model, name, budget, max_kb=250):
    """The GLB without texture coordinates (no model here has a texture)."""
    tris, lo, hi = k.model_metrics(model)
    if tris > budget:
        raise RuntimeError(f"{name}: {tris} triangles exceeds budget {budget}")
    if abs(lo[1]) > 0.01:
        raise RuntimeError(f"{name}: lowest point y={lo[1]:.3f}, not on the floor")
    k.MODEL_DIR.mkdir(parents=True, exist_ok=True)
    k.active(model)
    glb = k.MODEL_DIR / f"{name}.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", export_yup=True, use_selection=True, export_texcoords=False)
    if glb.stat().st_size > max_kb * 1024:
        raise RuntimeError(f"{name}: GLB exceeds {max_kb} KB")
    print("MODEL_METRICS=" + json.dumps({
        "model": name, "triangles": tris, "budget": budget, "dimensions": [round(hi[i] - lo[i], 3) for i in range(3)],
        "min": [round(x, 3) for x in lo], "max": [round(x, 3) for x in hi], "materials": len(model.data.materials),
        "kb": round(glb.stat().st_size / 1024, 1),
    }, sort_keys=True))


def preview_focus(model, name, direction, size, keep):
    """volcano.preview, but the camera fitted to the vertices `keep(glTF point)` picks (a part of a long model: the
    falls' lip, 124 m long and 2.5 m high, is shown by its east end)."""
    v.preview(model, name, direction, size)  # sets up the scene, the light and the camera
    camera = bpy.context.scene.camera
    coords = []
    for vtx in model.data.vertices:
        world = model.matrix_world @ vtx.co
        if keep(k.gltf(world)):
            coords.extend(world)
    view = Vector(direction).normalized()
    camera.rotation_euler = (-view).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()
    location, _ = camera.camera_fit_coords(bpy.context.evaluated_depsgraph_get(), coords)
    pts = [Vector(coords[i:i + 3]) for i in range(0, len(coords), 3)]
    center = sum(pts, Vector()) / len(pts)
    camera.location = location + view * (Vector(location) - center).length * 0.12
    camera.data.clip_start = 0.05
    bpy.ops.render.render(write_still=True)


BUILDERS = {"reed": reed, "lily-pad": lily_pad, "lily-flower": lily_flower, "water-weed": water_weed, "islet": islet, "rapids": rapids,
            "river-bank": river_bank, "river-rock": river_rock, "sea-arch": sea_arch, "falls-lip": falls_lip, "falls-mini": falls_mini,
            "stepping-stones": stepping_stones, "kawa-rock": kawa_rock, "paper-boat": paper_boat, "frog": frog,
            "duck-family": duck_family, "snow-patch": snow_patch, "snow-peak": snow_peak, "blue-feather": blue_feather,
            "jade-stone": jade_stone, "fukinotou": fukinotou}
# Origins: the bottom centre, the bounding box centred over it, but for the ones whose x/z origin is modelled where the
# stage needs it (the reed and the weed on their root, the islet on its plateau, the lip on the curtain's middle...).
KEEP_XZ = {"reed", "water-weed", "islet", "rapids", "river-bank", "sea-arch", "falls-lip", "falls-mini", "kawa-rock"}
# Exact sizes (w, h, d) the hand-tuned shapes are scaled to (the stand-ins' sizes, or the ticket's where they differ).
EXACT = {"sea-arch": (60.0, 31.5, 20.0), "rapids": (16.0, 1.5, 18.0), "paper-boat": (0.48, 0.45, 0.9), "frog": (0.7, 0.5, 0.8), "snow-patch": (10.0, 1.5, 8.0),
         "snow-peak": (400.0, 260.0, 400.0), "blue-feather": (0.3, 0.1, 1.0), "jade-stone": (0.8, 0.5, 0.8), "fukinotou": (0.6, 0.6, 0.6), "reed": (1.25, 3.2, 1.25), "lily-pad": (9.0, 0.38, 9.0), "lily-flower": (1.2, 0.85, 1.2), "water-weed": (1.8, 5.0, 0.62),
         "river-rock": (2.0, 1.0, 1.6)}
VIEWS = {"duck-family": (0.8, -0.5, 0.35), "frog": (0.5, -0.75, 0.42), "paper-boat": (0.7, -0.55, 0.35), "blue-feather": (0.45, -0.6, 0.65),
         "falls-lip": (0.3, -0.9, 0.25), "sea-arch": (0.35, -0.9, 0.2), "falls-mini": (0.45, -0.8, 0.45), "reed": (0.5, -0.8, 0.2), "water-weed": (0.3, -0.9, 0.15), "lily-pad": (0.45, -0.6, 0.65), "lily-flower": (0.5, -0.7, 0.55)}
TALL = {"reed", "water-weed"}

if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if a in BUILDERS] or list(BUILDERS)
    for name in names:
        k.reset()
        built, budget = BUILDERS[name]()
        model = built if isinstance(built, bpy.types.Object) else k.join(built, name)
        model.name = name
        model.data.name = name
        model.data.validate()
        if name in EXACT:
            v.scale_to(model, EXACT[name])
        if name not in KEEP_XZ:
            centre_xz(model)
        floor_to_zero(model)
        export_glb(model, name, budget)
        if name == "falls-lip":
            preview_focus(model, name, (0.5, 0.85, 0.12), (512, 400), lambda p: p.x > 44.0)
        else:
            v.preview(model, name, VIEWS.get(name, (0.55, -0.72, 0.42)), size=(400, 512) if name in TALL else (512, 400))
