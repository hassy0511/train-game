"""Records of stages 1-1 and 1-2 — Claude Code. Ticket 0010.

record-town-board (1-1, the town's map board), record-hq-plans (1-1, the headquarters' blueprint on its notice board),
record-balloon (1-1, a red balloon caught on a roof), record-nest (1-2, the empty nest on the cliff top).
In the look of the town (town.py: toy-like boards with bevelled edges, pictures as flat decals) and the valley
(valley.py: twigs and straw like the dino egg's nest). Same names, sizes, origins and orientation as the code stand-ins
they replace, so the stage JSON does not change: origin at the bottom centre (the balloon: the foot of its string,
where it is tied to the roof), the picture of a board toward +Z. Everything is made up: no real map, train or logo.
(record-feather, 2-1's, comes with that stage's set.)
Run: python3 scripts/run-bpy.py assets/blender/records.py [-- name ...]
"""
from __future__ import annotations

from pathlib import Path
import math
import random
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

TAU = 2 * math.pi
WOOD = "#9A7654"
WOOD_DARK = "#6E5238"
TWIG = "#8A6440"
TWIG_DARK = "#5E4430"
STRAW = "#C9A56A"
PIN = "#E23B3B"


def fix_normals(obj):
    """Consistent winding, then outward: a closed part with negative signed volume is turned inside out."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    mesh = obj.data
    volume = 0.0
    for poly in mesh.polygons:
        vs = [mesh.vertices[i].co for i in poly.vertices]
        for i in range(1, len(vs) - 1):
            volume += vs[0].dot(vs[i].cross(vs[i + 1])) / 6.0
    if volume < 0:
        mesh.flip_normals()


def B(parts, name, size, center, m, bevel=0.0):
    return k.add_box(parts, name, size, center, m, bevel=bevel, segments=1)


def prism_x(parts, name, outline_zy, x0, x1, m):
    """Prism along X from an outline in the (z, y) plane."""
    n = len(outline_zy)
    verts = [(x0, y, z) for z, y in outline_zy] + [(x1, y, z) for z, y in outline_zy]
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    obj = k.add_mesh(parts, name, verts, faces, [m])
    fix_normals(obj)
    return obj


def rounded_loop(cx, cy, w, h, r, per_corner=3):
    """Outline (x, y) of a w x h rectangle centred on (cx, cy) with corners rounded by r (counter-clockwise)."""
    pts = []
    for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = cx + qx * (w / 2 - r), cy + qy * (h / 2 - r)
        for i in range(per_corner + 1):
            a = math.radians(a0 + 90 * i / per_corner)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return pts


def line_loop(parts, name, outline, z, width, m):
    """A closed line drawn on a board facing +Z: a flat band `width` wide along the outline (x, y) at depth z."""
    n = len(outline)
    verts = []
    for i, (x, y) in enumerate(outline):
        (ax, ay), (bx, by) = outline[i - 1], outline[(i + 1) % n]
        tx, ty = bx - ax, by - ay
        length = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / length, tx / length
        verts += [(x + nx * width / 2, y + ny * width / 2, z), (x - nx * width / 2, y - ny * width / 2, z)]
    faces = []
    for i in range(n):
        a, b = 2 * i, 2 * ((i + 1) % n)
        # Wound so the band faces +Z whichever way the outline runs.
        faces.append((a, b, b + 1, a + 1))
    obj = k.add_mesh(parts, name, verts, faces, [m])
    if obj.data.polygons[0].normal.y > 0:  # Blender -Y is glTF +Z: the band must face it
        obj.data.flip_normals()
    return obj


def line(parts, name, a, b, z, width, m):
    """A straight line drawn on a board facing +Z, from a to b (x, y) at depth z."""
    return k.ribbon_decal(parts, name, [(a[0], a[1], z), (b[0], b[1], z)], width, m, taper=False)


# ---------------------------------------------------------------- 1-1

def town_board():
    """The town's map board: two posts, a framed board under a little red gable roof, and on its paper a made-up map
    of the town: the park with three trees, the pond, two roads, the railway's loop, three little houses and a red
    "you are here" dot."""
    wood, dark = k.mat("Wood", WOOD, 0.8), k.mat("Wood dark", WOOD_DARK, 0.8)
    paper = k.mat("Paper", "#F4EEDC", 0.85)
    park, tree = k.mat("Park", "#8CCB6E", 0.85), k.mat("Park tree", "#5FA85A", 0.85)
    pond, road = k.mat("Pond", "#7CC6F0", 0.6), k.mat("Road", "#9AA0A8", 0.85)
    rail = k.mat("Map rail", "#5B5F66", 0.8)
    roof = k.mat("Board roof", "#C0503F", 0.6)
    white = k.mat("House", "#FFFFFF", 0.7)
    dot = k.mat("You are here", PIN, 0.5)
    p: list = []
    for x in (-1.45, 1.45):
        B(p, f"post-{x}", (0.18, 3.3, 0.14), (x, 1.65, -0.02), dark, bevel=0.03)
    B(p, "board", (3.4, 2.1, 0.12), (0, 2.3, 0), wood, bevel=0.04)
    B(p, "ledge", (3.5, 0.1, 0.24), (0, 1.27, 0.04), dark)
    B(p, "paper", (3.1, 1.8, 0.03), (0, 2.3, 0.07), paper)
    z = 0.087
    # Park with its trees, the pond, roads and the railway's loop round the middle.
    k.poly_decal(p, "park", rounded_loop(-0.9, 2.78, 0.95, 0.6, 0.12, 1), z, park, 1)
    for i, (x, y) in enumerate(((-1.15, 2.86), (-0.85, 2.7), (-0.62, 2.88))):
        k.disc_decal(p, f"tree-{i}", (x, y, z + 0.004), (0.16, 0.16), tree, 1, 8)
    k.disc_decal(p, "pond", (0.95, 1.86, z), (0.6, 0.42), pond, 1, 12)
    line(p, "road-along", (-1.48, 2.3), (1.48, 2.3), z, 0.13, road)
    line(p, "road-across", (0.3, 1.47), (0.3, 3.13), z + 0.002, 0.13, road)
    line_loop(p, "railway", rounded_loop(0.05, 2.32, 2.5, 1.32, 0.45, 3), z + 0.003, 0.05, rail)
    for i, (x, y, colour, wall) in enumerate(((-1.05, 1.86, "#E86A5A", "#F7D3CB"), (-0.5, 1.86, "#F2C14E", "#F6E3A8"),
                                              (0.9, 2.74, "#5A8FE8", "#CFE0F7"))):
        k.poly_decal(p, f"house-{i}", [(x - 0.13, y - 0.1), (x + 0.13, y - 0.1), (x + 0.13, y + 0.07), (x - 0.13, y + 0.07)], z + 0.006,
                     k.mat(f"Wall {i}", wall, 0.7), 1)
        k.poly_decal(p, f"door-{i}", [(x - 0.03, y - 0.1), (x + 0.03, y - 0.1), (x + 0.03, y - 0.01), (x - 0.03, y - 0.01)], z + 0.008, dark, 1)
        k.poly_decal(p, f"roof-{i}", [(x - 0.18, y + 0.06), (x + 0.18, y + 0.06), (x, y + 0.22)], z + 0.007, k.mat(f"Roof {i}", colour, 0.6), 1)
    k.disc_decal(p, "here-rim", (-0.2, 2.3, z + 0.008), (0.24, 0.24), white, 1, 10)
    k.disc_decal(p, "here", (-0.2, 2.3, z + 0.009), (0.17, 0.17), dot, 1, 10)
    # The little gable roof over it (ridge along X), overhanging the picture.
    prism_x(p, "roof", [(0.32, 3.36), (0.04, 3.6), (-0.24, 3.36), (-0.24, 3.28), (0.04, 3.5), (0.32, 3.28)], -1.85, 1.85, roof)
    return p, 400


def hq_plans():
    """The headquarters' notice board with the Wonder train's blueprint pinned to it: its lead car drawn side on in
    white lines on blue paper (sloped nose, roof lamp in yellow, windows over the band, two bogies on the rail) over a
    measuring line, and a small white note; red pins. A made-up toy train, nothing real."""
    board, dark = k.mat("Notice board", "#B98A5A", 0.85), k.mat("Wood dark", WOOD_DARK, 0.8)
    blue, white = k.mat("Blueprint", "#2F6DB5", 0.7), k.mat("Blueprint line", "#EAF4FF", 0.6)
    lamp, pin = k.mat("Lamp", "#FFE066", 0.5), k.mat("Pin", PIN, 0.4)
    note = k.mat("Note", "#FBF6EC", 0.8)
    p: list = []
    for x in (-1.1, 1.1):
        B(p, f"leg-{x}", (0.16, 2.3, 0.12), (x, 1.15, -0.02), dark, bevel=0.03)
    B(p, "board", (2.6, 1.7, 0.12), (0, 2.1, 0), board, bevel=0.04)
    sheet = B(p, "sheet", (2.0, 1.2, 0.02), (-0.05, 2.08, 0.07), blue)
    sheet.rotation_euler[1] = math.radians(-1.5)
    z = 0.082
    # The lead car, side on: the body with its sloped nose to the right, the roof's line and lamp, four windows and
    # the band under them, two bogies of two wheels on the rail, and a measuring line with end ticks under it all.
    body = [(-0.92, 1.86), (0.5, 1.86), (0.66, 1.92), (0.74, 2.12), (0.6, 2.38), (0.42, 2.44), (-0.84, 2.44), (-0.92, 2.36)]
    line_loop(p, "body", body, z, 0.04, white)
    line(p, "band", (-0.9, 2.0), (0.68, 2.0), z, 0.03, white)
    k.poly_decal(p, "roof-lamp", [(-0.12, 2.45), (0.06, 2.45), (0.03, 2.53), (-0.09, 2.53)], z, lamp, 1)
    for i, x in enumerate((-0.7, -0.38, -0.06, 0.26)):
        k.poly_decal(p, f"window-{i}", [(x - 0.1, 2.1), (x + 0.1, 2.1), (x + 0.1, 2.32), (x - 0.1, 2.32)], z, white, 1)
    for i, x in enumerate((-0.74, -0.5, 0.16, 0.4)):
        k.disc_decal(p, f"wheel-{i}", (x, 1.745, z + 0.002), (0.17, 0.17), white, 1, 8)
        k.disc_decal(p, f"hub-{i}", (x, 1.745, z + 0.004), (0.08, 0.08), blue, 1, 8)
    line(p, "rail", (-0.98, 1.64), (0.82, 1.64), z, 0.025, white)
    line(p, "measure", (-0.92, 1.53), (0.74, 1.53), z, 0.02, white)
    for x in (-0.92, 0.74):
        line(p, f"tick-{x}", (x, 1.48), (x, 1.58), z + 0.002, 0.02, white)
    # A little note pinned at the corner, and the red pins.
    note_card = B(p, "note", (0.36, 0.3, 0.015), (0.98, 1.5, 0.075), note)
    note_card.rotation_euler[1] = math.radians(6)
    for i, (x, y) in enumerate(((-0.95, 2.6), (0.85, 2.6), (0.98, 1.6))):
        k.add_tapered_segment(p, f"pin-{i}", (x, y, 0.08), (x, y, 0.16), 0.045, 0.04, pin, vertices=6, smooth=False)
    return p, 400


def balloon():
    """A red balloon caught on a roof: its string's foot tied in a little knot (the origin), the string rising in a
    gentle S to the balloon's tied neck, the round body a little taller than wide, with a soft pink shine."""
    red = k.mat("Balloon", "#E8584A", 0.4)
    neck = k.mat("Balloon neck", "#D6453A", 0.45)
    shine = k.mat("Balloon shine", "#FFC2BA", 0.3)
    string = k.mat("String", "#FFFFFF", 0.7)
    p: list = []
    profile = [(1.86, 0.05), (1.93, 0.2), (2.05, 0.4), (2.25, 0.55), (2.5, 0.6), (2.75, 0.57), (2.97, 0.46), (3.12, 0.28), (3.2, 0.05)]
    body = k.add_profiled_volume(p, "body", [(y, r, r, 0.0, 0.0) for y, r in profile], red, segments=14)
    fix_normals(body)
    k.add_tapered_segment(p, "neck", (0, 1.76, 0), (0, 1.88, 0), 0.05, 0.075, neck, vertices=6)
    # The shine: a flat oval lying on the body, up and to the left of its front.
    normal = Vector((-0.28, 0.48, 0.83)).normalized()
    spot = k.add_ellipsoid(p, "shine", (0.17, 0.3, 0.05), tuple(Vector((0, 2.5, 0)) + normal * 0.628), shine, segments=6, rings=4)
    spot.rotation_mode = "QUATERNION"
    spot.rotation_quaternion = Vector((0, -1, 0)).rotation_difference(Vector(k.to_blender(normal)))
    path = [(0.04 * math.sin(t * TAU * 0.9), 0.08 + 1.68 * t, 0.03 * math.sin(t * TAU * 0.6 + 1)) for t in (i / 8 for i in range(9))]
    tube = k.add_swept_tube(p, "string", path, [0.02] * len(path), [string] * (len(path) - 1), sides=3, smooth=True)
    fix_normals(tube)
    k.add_ellipsoid(p, "knot", (0.09, 0.1, 0.09), (0, 0.05, 0), string, segments=6, rings=3)
    return p, 400


# ---------------------------------------------------------------- 1-2

def twig_loop(p, name, radius, y, thick, seed, m, wobble=0.05, points=14):
    """A twig woven round the nest: a wobbly closed loop of a four-sided tube."""
    rng = random.Random(seed)
    phase = rng.uniform(0, TAU)
    path = []
    for i in range(points + 1):
        a = phase + TAU * i / points
        r = radius * (1 + rng.uniform(-wobble, wobble)) if i < points else None
        h = y + 0.06 * math.sin(a * 3 + seed) + rng.uniform(-0.02, 0.02)
        path.append((math.cos(a) * (r or radius), h, math.sin(a) * (r or radius)))
    path[-1] = path[0]
    tube = k.add_swept_tube(p, name, path, [thick] * len(path), [m] * (len(path) - 1), sides=4, smooth=True)
    fix_normals(tube)
    return tube


def nest():
    """The big empty nest on 1-2's cliff top, 2.6 m across: a bowl woven of twigs (three loops round the rim, dark and
    light), straw sticking out between them and sticks poking out all round, the inside a dark empty hollow lined with
    straw. Nothing round in the hollow (it would read as an egg): only a few loose straws lying flat."""
    twig, dark, straw = k.mat("Twig", TWIG, 0.9), k.mat("Twig dark", TWIG_DARK, 0.9), k.mat("Straw", STRAW, 0.85)
    hollow = k.mat("Hollow", "#4A3524", 0.95)
    p: list = []
    bowl = k.add_profiled_volume(p, "bowl", [(0.0, 0.62, 0.62, 0, 0), (0.14, 0.9, 0.9, 0, 0), (0.32, 1.06, 1.06, 0, 0),
                                              (0.46, 1.04, 1.04, 0, 0), (0.4, 0.72, 0.72, 0, 0)], dark, segments=14)
    bowl.data.materials.append(hollow)
    fix_normals(bowl)
    for poly in bowl.data.polygons:
        if poly.center.z > 0.38 and poly.normal.z > 0.5:
            poly.material_index = 1  # the floor of the hollow
    twig_loop(p, "rim-0", 0.98, 0.5, 0.1, 3, twig)
    twig_loop(p, "rim-1", 1.07, 0.34, 0.09, 7, dark)
    twig_loop(p, "rim-2", 0.86, 0.6, 0.07, 11, straw, wobble=0.04)
    twig_loop(p, "rim-3", 1.0, 0.2, 0.08, 13, twig, wobble=0.06)
    rng = random.Random(5)
    # Sticks poking out all round, and wisps of straw between them; the longest reach 1.3 m from the middle.
    for i in range(18):
        a = TAU * i / 18 + rng.uniform(-0.12, 0.12)
        r0, r1 = 0.75, (1.31 if i % 4 == 0 else 1.18 * rng.uniform(0.9, 1.05))
        y0, y1 = 0.4 + rng.uniform(-0.12, 0.1), 0.42 + rng.uniform(-0.22, 0.34)
        skew = rng.uniform(-0.4, 0.4)
        m = straw if i % 3 == 0 else (twig if i % 3 == 1 else dark)
        k.add_tapered_segment(p, f"stick-{i}", (math.cos(a) * r0, y0, math.sin(a) * r0),
                              (math.cos(a + skew * 0.25) * r1, y1, math.sin(a + skew * 0.25) * r1), 0.035, 0.018, m, vertices=4, smooth=False)
    # Loose straws lying flat in the hollow.
    for i, (x, zz, ang) in enumerate(((0.2, -0.15, 0.4), (-0.25, 0.12, -0.7), (0.05, 0.3, 1.6))):
        s = B(p, f"straw-{i}", (0.6, 0.03, 0.035), (x, 0.42, zz), straw)
        s.rotation_euler[2] = ang
    return p, 1000


BUILDERS = {"record-town-board": town_board, "record-hq-plans": hq_plans, "record-balloon": balloon, "record-nest": nest}
# Picked for each: the boards' pictures face +Z (preview_world's three-quarter view sees them).

names = [a for a in sys.argv[1:] if a in BUILDERS] or list(BUILDERS)
for name in names:
    k.reset()
    parts, budget = BUILDERS[name]()
    model = k.join(parts, name)
    k.smooth_by_angle(model, 30)
    k.normalize(model, None, center=name != "record-balloon")
    k.export(model, name, budget, "world", 250)
