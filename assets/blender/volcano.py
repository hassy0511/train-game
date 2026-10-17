"""Stage 2-3 (かざんのしま) — Claude Code. Ticket 0009 (and spring-vent, 2-3's dive record, of ticket 0011).

The crafted look (つくりこみ) of chapter 1 (sky.py, whose helpers this script uses): flat colours, faceted rock, round
friendly shapes. A friendly volcano island in a blue sea: the volcano only ever puffs white steam (no lava, no red
light, no fire), its stones are light pumice that float, the seabirds have eyes only (no beak, no mouth), the rocket
has no face. Nothing is modelled on a real volcano, observatory, bridge or rocket.

Models (same names, sizes, origins and orientation as the code stand-ins they replace, so the stage JSON does not
change; +Z is forward, the model's own left is +X):
- volcano 792 x 119.6 x 792 (the steam cloud reaches 119.6): origin at the centre of its base (sea level). The flank is
  the cone the track is laid on (PHASE6 2-3 §6.1): radius 380 m at y 0 to radius 100 m at y 100, 2.8 m out per 1 m
  down. Every flank vertex lies on that cone and the flat faces between them dip inside it, so the flank never comes
  up through the track (2 m above it). Sand beach out to radius 396 (at most 0.55 m high), a rounded rim at radius
  100 (up to 100.45), the crater down to the steam lake at y 86.3 (radius 66), a steam cloud inside radius 22. Big
  boulders rest on the flank only 30 m or more (measured flat) from 2-3's track.
- mesa-a 175 x 140 top, mesa-b 125 x 155 top (corners rounded by 22 m): origin at the bottom centre at sea level, the
  top exactly flat at y 48 over the whole rounded rectangle (its corner arcs are circumscribed, never cut), rock sides
  spreading 8.4 m out to the water (191.8 x 156.8 and 141.8 x 171.8 at the foot). Bushes and rocks stand on the top
  only 21 m or more from 2-3's track and clear of Sakasa's run to the edge of みさき in the ending.
- pumice 1.01 x 0.86 x 0.98: origin at the bottom centre (the game centres it to roll it).
- old-bridge 10.55 x 55.4 x 20: origin at the middle of the deck's top (the exception: the track bed sits on it,
  heightFromRail -0.6, and the ending tips it about this point); one A-frame trestle reaching 54 m down, +Z along the
  track. models.json marks it "origin": "joint".
- observatory 7.7 x 10.5 x 7: origin at the centre of its plinth's base, door +Z, pinwheel at the back left (+X, -Z).
- seabird 1.64 x 0.63 x 1.02 (flying, wings up in a V) and seabird-sleep 0.52 x 0.5 x 0.81 (sitting, eyes closed):
  origin under the body, head +Z.
- sign-steep, sign-slide, sign-no-rocket 1.4 x 3.28 x 0.26 (0.43 with the sleeping rocket): the post's foot at the
  origin, the picture +Z (board front at z 0.06, post behind it).
- sulfur-crystal 1.5 x 1.87 x 1.25, spring-vent 5 x 1.07 x 5: origin at the bottom centre.
- rocket-unit 1.63 x 0.64 x 2.19: origin at the centre of the mounting plate's underside; the tubes' axes at x +-0.45,
  0.37 m up, noses +Z, nozzles -Z out to z -1.13 (volcano-gimmicks.ts mounts it on the lead car at (0, 3.75, -5.0)
  and puffs the flame from (+-0.45, 4.1, -6.3)).
Output: public/models/<name>.glb and assets/previews/<name>.png.
Run: python3 scripts/run-bpy.py assets/blender/volcano.py [-- name ...]
"""
from __future__ import annotations

from pathlib import Path
import json
import math
import random
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import sky as s  # noqa: E402  (chapter 1's crafted helpers: mat, fix_normals, pebble, tuft, crystal, cloud_shape...)
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

TAU = 2 * math.pi

# ---------------------------------------------------------------- palette (ticket 0009)

SAND, SAND_WET, SURF = "#F2DDA6", "#D9C08A", "#F6F8EE"
FOOT_GREEN, MID_GREEN = "#8CC86E", "#A9C77A"
MID_BROWN, HIGH_BROWN, TOP_GREY = "#BE946A", "#A88A74", "#978C86"
RIM, CRATER, LAKE, LAKE_EDGE = "#A99E97", "#877D78", "#D6EEF2", "#BFE2E8"
SULFUR_CRUST = "#E6CF6A"
BEACH_ROCK, BEACH_ROCK_TOP = "#9C8F86", "#B5A99F"

MESA_TOP, MESA_TOP_EDGE = "#A9C47C", "#C8B98C"
MESA_LAYERS = ["#CFA27A", "#BD8C6C", "#D8B58A", "#C49474"]
MESA_FOOT = "#8C7B6B"
BUSH, BUSH_TOP = "#86B95E", "#A2CC74"

PUMICE, PUMICE_SHADE, PUMICE_HOLE = "#ECE5D6", "#DCD3C1", "#B9AE9B"

WOOD, WOOD_LIGHT, WOOD_DARK, ROPE = "#B98B5A", "#C99C6A", "#8E6A45", "#EADBB8"

WALL, WALL_TRIM, PLINTH = "#F6F0E4", "#D9CDB8", "#C9C2B8"
DOME, DOME_SLIT, DOOR, WINDOW = "#9CCBE8", "#4E7FA8", "#4FA3A5", "#BFE6FF"
MAST, BLADES = "#8A8F96", ["#FF8A7A", "#FFD166", "#7CC6F2", "#8CD68A"]

BIRD, BIRD_SHADE, BIRD_WING, BIRD_TIP = "#FFFFFF", "#EEF1F4", "#B7C3CF", "#7F8C9A"
BIRD_FOOT, EYE, EYE_SHINE = "#F4A259", "#2B3A4A", "#FFFFFF"
# A little of their own colour as light, so the white birds stay white on their shaded side (like 1-3's clouds).
BIRD_GLOW = {BIRD: 0.3, BIRD_SHADE: 0.25, BIRD_WING: 0.12}

POST = "#8A8F96"
STEEP_BOARD, STEEP_FRAME = "#FFD43B", "#A45C3D"
SLIDE_BOARD, SLIDE_FRAME, SLIDE_MARK, SPARKLE = "#BFE3F5", "#5F9CCB", "#F7FBFF", "#FFE066"
REST_BOARD, REST_FRAME, MOON = "#3C4F86", "#C9D6F0", "#FFE066"

ROCKET_BODY, ROCKET_NOSE, ROCKET_BAND, ROCKET_STRIPE = "#F7F3EA", "#FF7A45", "#FF922B", "#FFD166"
ROCKET_SADDLE, ROCKET_DARK, ROCKET_SOOT = "#3FA7D6", "#3A3F47", "#24282E"

CRYSTAL, CRYSTAL_DEEP, CRYSTAL_TIP, CRYSTAL_ROCK = "#FFE04A", "#F4C430", "#FFF6A8", "#9A928A"

VENT_SAND, VENT_WET, VENT_HOLE, BUBBLE = "#F2E2B0", "#E2CE96", "#7FB5C9", "#EAF8FF"

mat = s.mat


def hexmix(a: str, b: str, t: float) -> str:
    """The colour t of the way from a to b (sRGB hex)."""
    ca = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    cb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02X}" for x, y in zip(ca, cb))


def hash01(*v: float) -> float:
    """A repeatable 0..1 number for a point (the same faces get the same patches on every build)."""
    h = math.sin(sum(x * c for x, c in zip(v, (12.9898, 78.233, 37.719, 4.581)))) * 43758.5453
    return h - math.floor(h)


def wave(a: float, terms) -> float:
    return sum(amp * math.sin(f * a + ph) for f, amp, ph in terms)


# ---------------------------------------------------------------- mesh helpers (glTF coordinates)

class Paint:
    """Flat colour materials made on demand by hex (one per colour, shared by every part of the model)."""

    def __init__(self, roughness=0.85, glow=None):
        self.roughness = roughness
        self.glow = glow or {}

    def __call__(self, hex_color: str) -> bpy.types.Material:
        return mat(f"Flat {hex_color}", hex_color, self.roughness, self.glow.get(hex_color, 0.0))


def painted(parts, name, verts, faces, paint: Paint, colour, smooth=False, closed=True):
    """A part whose faces take their colour from `colour(centre, normal) -> hex` (glTF coordinates), or from a list of
    hex colours in face order. `closed`: a closed volume, wound outward."""
    obj = k.add_mesh(parts, name, verts, faces, [])
    if closed:
        s.fix_normals(obj)
    slots: dict[str, int] = {}
    for index, poly in enumerate(obj.data.polygons):
        c, n = k.gltf(poly.center), k.gltf(poly.normal)
        if isinstance(colour, list):
            hex_color = colour[index]
        else:
            hex_color = colour(c, n) if callable(colour) else colour
        if hex_color not in slots:
            slots[hex_color] = len(obj.data.materials)
            obj.data.materials.append(paint(hex_color))
        poly.material_index = slots[hex_color]
        poly.use_smooth = smooth(c, n) if callable(smooth) else smooth
    return obj


def lathe(parts, name, profile, point, segments, paint: Paint, smooth, phase=0.0):
    """A closed body of revolution: profile [(t, radius, hex)] along its axis, `point(t, angle, radius)` placing a
    vertex (glTF). Each band takes the colour of its first ring; radius 0 at an end closes it to a point, otherwise
    the ends are capped."""
    verts, faces, colours, rings = [], [], [], []
    for t, r, _ in profile:
        if r <= 1e-6:
            rings.append([len(verts)])
            verts.append(point(t, 0.0, 0.0))
            continue
        rings.append(list(range(len(verts), len(verts) + segments)))
        verts += [point(t, phase + TAU * i / segments, r) for i in range(segments)]
    for j in range(len(rings) - 1):
        a, b = rings[j], rings[j + 1]
        if len(a) == 1:
            faces += [(a[0], b[(i + 1) % segments], b[i]) for i in range(segments)]
        elif len(b) == 1:
            faces += [(a[i], a[(i + 1) % segments], b[0]) for i in range(segments)]
        else:
            faces += [(a[i], a[(i + 1) % segments], b[(i + 1) % segments], b[i]) for i in range(segments)]
        colours += [profile[j][2]] * segments
    if len(rings[0]) > 1:
        faces.append(tuple(reversed(rings[0])))
        colours.append(profile[0][2])
    if len(rings[-1]) > 1:
        faces.append(tuple(rings[-1]))
        colours.append(profile[-1][2])
    return painted(parts, name, verts, faces, paint, colours, smooth=smooth)


def lathe_z(parts, name, profile, cx, cy, segments, paint: Paint, smooth=True, phase=0.0):
    """About the line (cx, cy, z): profile [(z, radius, hex)] from back to front."""
    return lathe(parts, name, profile, lambda z, a, r: (cx + math.cos(a) * r, cy + math.sin(a) * r, z), segments, paint, smooth,
                 phase)


def lathe_y(parts, name, profile, center, segments, paint: Paint, smooth=False, phase=0.0):
    """About the vertical through `center` (x, z): profile [(y, radius, hex)] from the bottom up."""
    cx, cz = center
    return lathe(parts, name, profile, lambda y, a, r: (cx + math.cos(a) * r, y, cz + math.sin(a) * r), segments, paint, smooth,
                 phase)


def ellipsoid(parts, name, size, center, m, segments=10, rings=5, smooth=True, rot=None):
    obj = k.add_ellipsoid(parts, name, size, center, m, segments=segments, rings=rings, smooth=smooth)
    if rot:
        obj.rotation_euler = rot
    return obj


def beam(parts, name, a, b, width, depth, m):
    """A box from point a to point b (glTF) with the given cross-section."""
    a, b = Vector(a), Vector(b)
    mid = (a + b) / 2
    obj = k.add_box(parts, name, (width, (b - a).length, depth), tuple(mid), m)
    up = Vector(k.to_blender(tuple(b - a))).normalized()
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(up)
    return obj


def flat_tris(parts, name, tris_xy, z, m, facing=1):
    """Flat triangles in the plane z (a picture on a board), each wound to face +Z (or -Z)."""
    verts, faces = [], []
    for tri in tris_xy:
        (ax, ay), (bx, by), (cx, cy) = tri
        cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
        i = len(verts)
        verts += [(ax, ay, z), (bx, by, z), (cx, cy, z)]
        faces.append((i, i + 1, i + 2) if (cross > 0) == (facing > 0) else (i, i + 2, i + 1))
    return k.add_mesh(parts, name, verts, faces, [m])


def sticker(parts, name, center, normal, size, m, segments=8, tilt=0.0, lift=0.004):
    """A small flat oval lying on a surface at `center` with outward `normal` (eyes, pores, shines): `size` (w, h)
    across the surface, its h axis as near world up as the surface allows, turned by `tilt`."""
    n = Vector(normal).normalized()
    up = Vector((0, 1, 0))
    if abs(n.dot(up)) > 0.95:
        up = Vector((0, 0, 1))
    u = up.cross(n).normalized()
    v = n.cross(u).normalized()
    u, v = u * math.cos(tilt) + v * math.sin(tilt), v * math.cos(tilt) - u * math.sin(tilt)
    c = Vector(center) + n * lift
    verts = [tuple(c)]
    for i in range(segments):
        a = TAU * i / segments
        verts.append(tuple(c + u * (math.cos(a) * size[0] / 2) + v * (math.sin(a) * size[1] / 2)))
    faces = [(0, 1 + i, 1 + (i + 1) % segments) for i in range(segments)]
    obj = k.add_mesh(parts, name, verts, faces, [m], smooth=True)
    # Face along the normal.
    poly = obj.data.polygons[0]
    if k.gltf(poly.normal).dot(n) < 0:
        obj.data.flip_normals()
    return obj


def cut_below(obj, y=0.0):
    """Cut the part off at the plane y (glTF) and close the cut (stones sitting in the water or the sand)."""
    k.active(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bisect(plane_co=(0, 0, y), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def lumpy_stone(parts, name, size, center, m_side, m_top, seed, sub=1, top_from=0.5, rough=0.16):
    """s.pebble with a choice of subdivision (1: 20 faces, 2: 80)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    rng = random.Random(seed)
    for v in bm.verts:
        v.co *= 1.0 + rng.uniform(-rough, rough)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    w, h, d = size
    obj.scale = (w / 2, d / 2, h / 2)
    obj.rotation_euler = (0, 0, rng.uniform(0, TAU))
    obj.location = k.to_blender(center)
    mesh.materials.append(m_side)
    mesh.materials.append(m_top)
    k.active(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for poly in mesh.polygons:
        poly.material_index = 1 if poly.normal.z > top_from else 0
        poly.use_smooth = False
    s.fix_normals(obj)
    parts.append(obj)
    return obj


# ---------------------------------------------------------------- the stage's track (decoration stays clear of it)

def stage_rails():
    """2-3's rail polylines (world x, z), each densified to 2 m steps."""
    data = json.loads((k.ROOT / "src" / "stages" / "2-3.json").read_text())
    lines = []
    for rail in data["rails"]:
        pts = rail["points"]
        dense = []
        for (ax, _, az), (bx, _, bz) in zip(pts, pts[1:]):
            steps = max(1, int(math.hypot(bx - ax, bz - az) / 2))
            dense += [(ax + (bx - ax) * i / steps, az + (bz - az) * i / steps) for i in range(steps)]
        dense.append((pts[-1][0], pts[-1][2]))
        lines.append(dense)
    return lines


def rail_frame(rail_id, at):
    """Where 2-3's rail `rail_id` is `at` m along (world x, z) and its unit direction there (x, z)."""
    data = json.loads((k.ROOT / "src" / "stages" / "2-3.json").read_text())
    pts = next(r["points"] for r in data["rails"] if r["id"] == rail_id)
    run = 0.0
    for (ax, _, az), (bx, _, bz) in zip(pts, pts[1:]):
        length = math.hypot(bx - ax, bz - az)
        if run + length >= at or (bx, bz) == (pts[-1][0], pts[-1][2]):
            t = min(1.0, (at - run) / length)
            return (ax + (bx - ax) * t, az + (bz - az) * t), ((bx - ax) / length, (bz - az) / length)
        run += length
    raise ValueError(at)


def beside(rail_id, at, lateral):
    """A point `lateral` m to the right of the rail (negative: left), as the stage JSON's onRail.lateral."""
    (x, z), (tx, tz) = rail_frame(rail_id, at)
    return (x - tz * lateral, z + tx * lateral)


def to_local(points, center, rot_deg):
    """World (x, z) into a prop's own space (three.js rotation.y by rot_deg about `center`)."""
    t = math.radians(rot_deg)
    c, sn = math.cos(t), math.sin(t)
    out = []
    for x, z in points:
        dx, dz = x - center[0], z - center[1]
        out.append((c * dx - sn * dz, sn * dx + c * dz))
    return out


def clear_of(point, lines, distance):
    px, pz = point
    d2 = distance * distance
    return all((x - px) ** 2 + (z - pz) ** 2 >= d2 for line in lines for x, z in line)


# ---------------------------------------------------------------- volcano

CONE_BASE, CONE_RUN, RIM_Y = 380.0, 2.8, 100.0
LAKE_Y, LAKE_R = 86.3, 66.0
SEG = 40


def cone_r(y):
    return CONE_BASE - CONE_RUN * y


def volcano():
    """The friendly volcano: green at the foot, warm browns in the middle, soft grey at the top, on a ring of sand with
    surf at the water's edge; a rounded rim, a terraced crater with yellow crusts and a pale steam lake, a soft white
    steam cloud. Flank colours meet along wavy lines with patches, like a painted toy mountain."""
    rng = random.Random(23)
    paint = Paint(0.9)
    # Profile rings from the sea inward: (radius, height, kind). Flank rings lie on the cone.
    beach = [(396.0, 0.0), (393.6, 0.17), (389.0, 0.4)]
    flank_y = [0.55, 5, 12, 20, 29, 38, 47, 56, 65, 74, 83, 92, RIM_Y]
    crater = [(97.6, 100.45), (93.6, 100.25), (86.5, 96.6), (78.6, 92.2), (72.0, 90.3), (LAKE_R, LAKE_Y)]
    rings = []
    step = TAU / SEG
    for j, (r, y) in enumerate(beach):
        row = []
        for i in range(SEG):
            a = step * i
            rr = r + (rng.uniform(-0.9, 0.9) if j == 1 else 0.0)  # a wavy surf line
            row.append((math.cos(a) * rr, y, math.sin(a) * rr))
        rings.append(row)
    for j, y in enumerate(flank_y):
        row = []
        inner = 0 < j < len(flank_y) - 1
        spacing = (flank_y[min(j + 1, len(flank_y) - 1)] - flank_y[max(j - 1, 0)]) / 2
        for i in range(SEG):
            # Jitter along the cone (height and angle together keep the point on it): an uneven low-poly flank.
            yy = y + (rng.uniform(-0.28, 0.28) * spacing if inner else 0.0)
            a = step * i + (rng.uniform(-0.28, 0.28) * step if inner else 0.0)
            rr = cone_r(yy)
            row.append((math.cos(a) * rr, yy, math.sin(a) * rr))
        rings.append(row)
    for j, (r, y) in enumerate(crater):
        row = []
        loose = 1 < j < len(crater)
        for i in range(SEG):
            a = step * i + (rng.uniform(-0.22, 0.22) * step if loose else 0.0)
            rr = r + (rng.uniform(-1.3, 1.3) if loose else 0.0)
            yy = y + (rng.uniform(-0.35, 0.35) if 1 < j < len(crater) - 1 else 0.0)
            row.append((math.cos(a) * rr, yy, math.sin(a) * rr))
        rings.append(row)
    # The lake: one more ring, then a fan to the middle.
    lake_inner = [(math.cos(step * (i + 0.5)) * 44.0, LAKE_Y, math.sin(step * (i + 0.5)) * 44.0) for i in range(SEG)]
    rings.append(lake_inner)
    verts = [p for row in rings for p in row]
    centre = len(verts)
    verts.append((0.0, LAKE_Y, 0.0))
    faces = []
    for j in range(len(rings) - 1):
        faces += s.ring_faces(j * SEG, (j + 1) * SEG, SEG)
    last = (len(rings) - 1) * SEG
    faces += [(last + i, last + (i + 1) % SEG, centre) for i in range(SEG)]
    faces.append(tuple(range(SEG - 1, -1, -1)))  # the bottom, at sea level

    green_line = [(3, 4.0, 0.3), (7, 2.5, 1.9), (11, 1.2, 0.8)]
    brown_line = [(2, 6.0, 1.1), (5, 3.5, 2.6), (9, 2.0, 0.4)]
    high_line = [(3, 4.0, 2.2), (6, 2.5, 0.9)]
    grey_line = [(4, 3.0, 1.4), (7, 1.5, 0.2)]

    def colour(c, n):
        r = math.hypot(c.x, c.z)
        y = c.y
        a = math.atan2(c.z, c.x)
        # Soft patches: a low-frequency pattern round the mountain, so neighbouring faces share a colour (blobs, not
        # a checkerboard).
        blob = math.sin(3 * a + y * 0.07 + 0.5) * math.sin(5 * a - y * 0.045 + 1.7) + 0.35 * math.sin(9 * a + y * 0.11)
        patch = 0.0 if blob > 0.55 else (0.3 if blob > 0.4 else 1.0)
        if n.y < -0.9 and y < 0.05:
            return SAND_WET
        if r > cone_r(0.55) - 0.5 and y < 0.6:
            if r > 393.9:
                return SURF
            return SAND_WET if r > 389.5 else SAND
        if r > 99.9 and y <= RIM_Y + 0.01:
            g = 13 + wave(a, green_line)
            b = 36 + wave(a, brown_line)
            h = 63 + wave(a, high_line)
            t = 85 + wave(a, grey_line)
            if y < g:
                return MID_GREEN if patch < 0.2 else FOOT_GREEN
            if y < b:
                if y < b - 6:
                    return FOOT_GREEN if patch < 0.22 else MID_GREEN
                return hexmix(MID_GREEN, MID_BROWN, 0.5) if patch < 0.45 else MID_GREEN
            if y < h:
                return HIGH_BROWN if patch < 0.18 else MID_BROWN
            if y < t:
                return MID_BROWN if patch < 0.15 else HIGH_BROWN
            return hexmix(TOP_GREY, HIGH_BROWN, 0.35) if patch < 0.2 else TOP_GREY
        # Rim, crater and lake.
        if abs(y - LAKE_Y) < 0.01 and n.y > 0.99:
            return LAKE if r < 40 else LAKE_EDGE
        if r > 93.5:
            return hexmix(RIM, "#FFFFFF", 0.12) if n.y > 0.97 else RIM
        if r > 84:
            return hexmix(RIM, CRATER, 0.45)
        if r > 72:
            return hexmix(SULFUR_CRUST, CRATER, 0.55) if hash01(round(c.x), round(c.z)) < 0.13 else (hexmix(CRATER, RIM, 0.3) if n.y > 0.8 else CRATER)
        return hexmix(CRATER, LAKE_EDGE, 0.35)

    parts: list = []
    painted(parts, "island", verts, faces, paint, colour)

    # The steam cloud over the lake (white, glowing a little so its shaded side stays soft).
    puffs = [(0, 4.5, 0, 15, 7, 13), (-9, 7, 5, 10, 8, 9), (10, 8, -4, 10, 8, 9), (2, 14, 2, 11, 9, 10),
             (-5, 20.5, -3, 8, 7, 8), (5, 25.5, 4, 6.5, 5.5, 6), (0, 29.5, 1, 4.5, 3.5, 4.5)]
    cloud = s.cloud_shape("steam", (40, 33.1, 36), puffs, 250, 0.5, glow=0.42, shade_below=0.22)
    cloud.location = k.to_blender((-2.0, LAKE_Y + 0.2, 1.5))
    parts.append(cloud)

    # A few round stones on the beach (clear of the quay's track and the dive spur at -125..-80 degrees) and boulders on
    # the crater's terrace.
    side, top = paint(BEACH_ROCK), paint(BEACH_ROCK_TOP)
    for i, (deg, r, size) in enumerate(((-62, 385.5, 6.5), (-142, 386.0, 5.0), (28, 384.5, 7.5), (104, 386.5, 5.5))):
        a = math.radians(deg)
        st = lumpy_stone(parts, f"beach-rock-{i}", (size, size * 0.62, size * 0.85), (math.cos(a) * r, size * 0.16, math.sin(a) * r),
                         side, top, 40 + i)
        cut_below(st)
    # A few big rounded boulders resting on the flank, well away from the track (30 m and more, measured flat).
    lines = stage_rails()
    flank_side, flank_top = paint(hexmix(HIGH_BROWN, TOP_GREY, 0.5)), paint(hexmix(MID_BROWN, "#FFFFFF", 0.12))
    candidates = []
    for deg in range(0, 360, 6):
        for y in (9.0, 18.0, 27.0, 36.0, 45.0, 54.0, 63.0, 72.0, 81.0):
            a = math.radians(deg + (y * 1.7) % 6)
            r = cone_r(y)
            if clear_of((math.cos(a) * r, math.sin(a) * r), lines, 30.0):
                candidates.append((a, y))
    rng.shuffle(candidates)
    boulders = []
    for a, y in candidates:
        p = (math.cos(a) * cone_r(y), math.sin(a) * cone_r(y))
        if all(math.hypot(p[0] - q[0], p[1] - q[1]) > 90 for q, _ in boulders):
            boulders.append((p, y))
        if len(boulders) == 6:
            break
    for i, ((x, z), y) in enumerate(boulders):
        size = rng.uniform(9.0, 14.0)
        lumpy_stone(parts, f"flank-rock-{i}", (size, size * 0.55, size * 0.8), (x * 0.995, y + size * 0.12, z * 0.995), flank_side, flank_top,
                    80 + i, top_from=0.55)
    crust_side, crust_top = paint(hexmix(CRATER, RIM, 0.2)), paint(hexmix(RIM, "#FFFFFF", 0.1))
    for i, (deg, r, size) in enumerate(((35, 76.0, 7.0), (160, 75.5, 5.5), (265, 77.0, 6.0))):
        a = math.radians(deg)
        lumpy_stone(parts, f"crater-rock-{i}", (size, size * 0.6, size * 0.8), (math.cos(a) * r, 91.0 + size * 0.15, math.sin(a) * r),
                    crust_side, crust_top, 60 + i)
    return parts, 3000


# ---------------------------------------------------------------- mesas

MESA_Y = 48.0
MESA_R = 22.0


def mesa_outline(w, d, per_corner=3, piece=30.0):
    """The top's outline: a rounded rectangle w x d whose corner arcs (radius 22) are circumscribed by per_corner
    tangent segments (so the polygon holds the whole rounded rectangle), long edges cut every `piece` m. Returns
    [(x, z, nx, nz)] counter-clockwise from above (+Y), with outward normals."""
    hx, hz = w / 2 - MESA_R, d / 2 - MESA_R
    corners = [(hx, hz, 0.0), (-hx, hz, 90.0), (-hx, -hz, 180.0), (hx, -hz, 270.0)]
    pts = []
    for ci, (cx, cz, a0) in enumerate(corners):
        half = 90.0 / per_corner / 2
        for j in range(per_corner):
            a = math.radians(a0 + half * (2 * j + 1))
            rr = MESA_R / math.cos(math.radians(half))
            pts.append((cx + math.cos(a) * rr, cz + math.sin(a) * rr, math.cos(a), math.sin(a)))
        # The straight edge to the next corner, along the tangent at a0 + 90.
        nx_, nz_, _ = corners[(ci + 1) % 4]
        ae = math.radians(a0 + 90.0)
        fx, fz = cx + math.cos(ae) * MESA_R, cz + math.sin(ae) * MESA_R
        tx, tz = nx_ + math.cos(ae) * MESA_R, nz_ + math.sin(ae) * MESA_R
        length = math.hypot(tx - fx, tz - fz)
        pieces = max(1, round(length / piece))
        for p in range(1, pieces):
            t = p / pieces
            pts.append((fx + (tx - fx) * t, fz + (tz - fz) * t, math.cos(ae), math.sin(ae)))
    # Counter-clockwise seen from +Y means x toward z: the corners above go +x+z, -x+z, -x-z, +x-z. Reverse if needed.
    area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    return pts if area > 0 else pts[::-1]


def mesa(name, w, d, world_center, rot_deg, seed):
    """A flat-topped rock standing in the sea: grass on top, a grassy lip with tongues hanging over a sandy rim, then
    wavy strata in four warm colours, darker at the water. A few bushes and rocks on the top, clear of the track."""
    rng = random.Random(seed)
    paint = Paint(0.92)
    out_pts = mesa_outline(w, d)
    n = len(out_pts)
    drip = [0.0] * n
    for i in range(n):
        if rng.random() < 0.35:
            drip[i] = rng.uniform(0.6, 1.8)
    # Side rings: (height, outward offset, jitter scale).
    # Proud and recessed bands alternate a little, so the strata read as ledges.
    strata = [(43.6, 1.3, 0.5), (36.2, 1.4, 1.0), (28.4, 2.9, 1.0), (20.8, 3.0, 1.0), (13.4, 5.1, 1.0), (6.6, 5.9, 0.8),
              (1.5, 7.6, 0.4), (0.0, 8.4, 0.0)]
    col_out = [rng.uniform(0.0, 1.3) for _ in range(n)]
    crevice = [rng.random() < 0.22 for _ in range(n)]
    for i in range(n):
        if crevice[i]:
            col_out[i] = -1.4
    rows = [[(x, MESA_Y, z) for x, z, _, _ in out_pts]]
    rows.append([(x + nx * 0.32, MESA_Y - 0.62 - drip[i], z + nz * 0.32) for i, (x, z, nx, nz) in enumerate(out_pts)])
    rows.append([(x + nx * 0.62, MESA_Y - 1.7 - drip[i] * 1.1, z + nz * 0.62) for i, (x, z, nx, nz) in enumerate(out_pts)])
    for y, out, jit in strata:
        row = []
        for i, (x, z, nx, nz) in enumerate(out_pts):
            o = max(0.6, min(8.2, out + (col_out[i] + rng.uniform(-0.5, 0.8)) * jit)) if y > 0 else out
            yy = y + (rng.uniform(-0.9, 0.9) * jit if 0 < y < 40 else 0.0)
            row.append((x + nx * o, yy, z + nz * o))
        rows.append(row)
    verts = [p for row in rows for p in row]
    faces = []
    for j in range(len(rows) - 1):
        faces += s.ring_faces(j * n, (j + 1) * n, n)
    faces.append(tuple(range((len(rows) - 1) * n + n - 1, (len(rows) - 1) * n - 1, -1)))  # the bottom at sea level
    # The top: a lighter band 6 m wide inside the edge, then the field.
    inner = len(verts)
    for x, z, nx, nz in out_pts:
        verts.append((x - nx * 6.0, MESA_Y, z - nz * 6.0))
    faces += [(i, (i + 1) % n, inner + (i + 1) % n, inner + i) for i in range(n)]
    faces.append(tuple(inner + i for i in range(n)))
    edge_band = hexmix(MESA_TOP, MESA_TOP_EDGE, 0.3)
    # Colours in face order: the grass lip, the sandy rim, the strata (wavy, as their rings are), the water line, the
    # bottom, the top's edge band and its field.
    layer_of = {2: 2, 3: 0, 4: 1, 5: 3, 6: 0, 7: 2, 8: 1}
    colours = []
    for j in range(len(rows) - 1):
        for i in range(n):
            if j == 0:
                colours.append(MESA_TOP if drip[i] + drip[(i + 1) % n] < 0.1 else hexmix(MESA_TOP, "#86A866", 0.35))
            elif j == 1:
                colours.append(MESA_TOP_EDGE)
            elif j == len(rows) - 2:
                colours.append(MESA_FOOT)
            else:
                base = MESA_LAYERS[layer_of.get(j, j % 4)]
                if crevice[i] or crevice[(i + 1) % n]:
                    colours.append(hexmix(base, "#6E5A4C", 0.16))
                else:
                    colours.append(hexmix(base, "#FFFFFF", 0.1) if rng.random() < 0.18 else base)
    colours.append(MESA_FOOT)
    colours += [edge_band] * n
    colours.append(MESA_TOP)
    parts: list = []
    painted(parts, "rock", verts, faces, paint, colours)

    # On the top: bushes and rocks where the track and its stations are 20 m away or more.
    lines = [to_local(line, world_center, rot_deg) for line in stage_rails()]
    # Also clear of Sakasa's run across みさき in the ending (kudari 1052, 14 m left, to the edge 29-31 m left).
    run = [to_local([beside("kudari", 1053.0, -lat)], world_center, rot_deg)[0] for lat in range(10, 34, 2)]
    spots = []
    for gx in range(-int(w / 2) + 14, int(w / 2) - 13, 7):
        for gz in range(-int(d / 2) + 14, int(d / 2) - 13, 7):
            if clear_of((gx, gz), lines, 21.0) and clear_of((gx, gz), [run], 10.0):
                spots.append((gx + rng.uniform(-2, 2), gz + rng.uniform(-2, 2)))
    rng.shuffle(spots)
    chosen = []
    for p in spots:
        if all(math.hypot(p[0] - q[0], p[1] - q[1]) > 14 for q in chosen):
            chosen.append(p)
        if len(chosen) == 5:
            break
    bush, bush_top = paint(BUSH), paint(BUSH_TOP)
    stone, stone_top = paint(MESA_LAYERS[2]), paint(hexmix(MESA_LAYERS[2], "#FFFFFF", 0.15))
    for i, (x, z) in enumerate(chosen):
        if i < 4:
            # A clump of round bushes, two or three together.
            size = rng.uniform(5.0, 7.0)
            lumpy_stone(parts, f"bush-{i}", (size, size * 0.66, size * 0.9), (x, MESA_Y + size * 0.22, z), bush, bush_top, seed + 10 + i,
                        top_from=0.3, rough=0.12)
            a = rng.uniform(0, TAU)
            lumpy_stone(parts, f"bush-b-{i}", (size * 0.62, size * 0.48, size * 0.58),
                        (x + math.cos(a) * size * 0.58, MESA_Y + size * 0.14, z + math.sin(a) * size * 0.58), bush, bush_top, seed + 20 + i,
                        top_from=0.3, rough=0.12)
        else:
            size = rng.uniform(3.4, 4.6)
            lumpy_stone(parts, f"stone-{i}", (size, size * 0.55, size * 0.8), (x, MESA_Y + size * 0.14, z), stone, stone_top, seed + 30 + i)
    # Two stones at the foot, standing in the water by two corners (inside the footprint's bounding box).
    corners = [i for i, (_, _, nx, nz) in enumerate(out_pts) if abs(abs(nx) - abs(nz)) < 0.2]
    for i, ci in enumerate((corners[0], corners[2])):
        x, z, nx, nz = out_pts[ci]
        size = rng.uniform(5.5, 7.0)
        st = lumpy_stone(parts, f"foot-stone-{i}", (size, size * 0.7, size * 0.8), (x + nx * 9.6, size * 0.12, z + nz * 9.6),
                         paint(MESA_FOOT), paint(MESA_LAYERS[1]), seed + 40 + i)
        cut_below(st)
    return parts, 800


# ---------------------------------------------------------------- pumice

def pumice():
    """かるいし: a light, round, softly lumpy cream stone (faceted) with round pits sunk into it, each a small darker cup,
    and a few broad patches a shade darker. The cream glows a touch: a light stone even on its shaded side."""
    paint = Paint(0.95, glow={PUMICE: 0.14, PUMICE_SHADE: 0.1})
    rng = random.Random(7)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    for v in bm.verts:
        v.co *= 1.0 + rng.uniform(-0.07, 0.07)
    # Pits at well-separated corners (fewer underneath): each corner is bevelled into a small polygon whose middle is
    # pushed in, a little cup.
    order = sorted(bm.verts, key=lambda v: rng.random())
    chosen = []
    for v in order:
        d = v.co.normalized()
        if d.z < -0.55:
            continue
        if all(d.angle(q.co.normalized()) > 0.8 for q in chosen):
            chosen.append(v)
        if len(chosen) == 11:
            break
    for f in bm.faces:
        f.material_index = 0
    pit_faces = []
    for i, v in enumerate(chosen):
        size = (0.13, 0.17, 0.11)[i % 3]
        made = bmesh.ops.bevel(bm, geom=[v], offset=size, segments=1, affect="VERTICES")
        poked = bmesh.ops.poke(bm, faces=made["faces"], offset=-size * 0.75)
        pit_faces += poked["faces"]
    for f in pit_faces:
        f.material_index = 3
    for f in bm.faces:
        if f.material_index == 0:
            c = f.calc_center_median().normalized()
            blob = math.sin(2.3 * c.x + 0.4) * math.sin(2.9 * c.y + 1.1) + 0.5 * math.sin(3.1 * c.z + 2.0)
            f.material_index = 1 if blob > 0.45 else 0
    mesh = bpy.data.meshes.new("stone")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("stone", mesh)
    bpy.context.collection.objects.link(obj)
    for m in (paint(PUMICE), paint(PUMICE_SHADE), paint(hexmix(PUMICE_HOLE, PUMICE_SHADE, 0.5)), paint(PUMICE_HOLE)):
        mesh.materials.append(m)
    obj.scale = (0.505, 0.49, 0.43)  # Blender x, y (= glTF -z), z (= up)
    obj.location = (0, 0, 0.43)
    k.active(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    s.fix_normals(obj)
    # The faces round each cup's mouth a shade darker too.
    for poly in mesh.polygons:
        poly.use_smooth = False
    return [obj], 300


# ---------------------------------------------------------------- old bridge

def old_bridge():
    """ぐらぐらばし, one 20 m piece: an old plank deck 4.8 m wide (planks a little uneven, one patched), two stringers, low
    rails (posts, a light top rail and a sagging rope), and under the middle one tall A-frame trestle with cross ties,
    X braces and rope lashings, 54 m down into the sea. Origin: the middle of the deck's top."""
    paint = Paint(0.9)
    wood, light, dark, rope = paint(WOOD), paint(WOOD_LIGHT), paint(WOOD_DARK), paint(ROPE)
    rng = random.Random(5)
    parts: list = []
    planks = 10
    for i in range(planks):
        z = -10 + (i + 0.5) * 2.0
        m = [wood, light, wood, dark, wood, light, wood, wood, dark, light][i]
        tilt = rng.uniform(-0.02, 0.02)
        drop = rng.uniform(0.0, 0.025)
        width = 4.8 - rng.uniform(0.0, 0.12)
        shift = rng.uniform(-0.05, 0.05)
        b = k.add_box(parts, f"plank-{i}", (width, 0.26, 1.86), (shift, -0.13 - drop, z), m)
        b.rotation_euler = (0, 0, tilt)
    for x in (-1.6, 1.6):
        k.add_box(parts, f"stringer-{x}", (0.42, 0.55, 20.0), (x, -0.55, 0), dark)
    # Rails each side, outside the train (3 m wide): posts, a light top rail, a rope sagging between the posts.
    for side in (-1, 1):
        x = side * 2.3
        for z in (-5.0, 5.0):
            k.add_box(parts, f"post-{side}-{z}", (0.2, 1.36, 0.2), (x, 0.6, z), wood)
        top = k.add_box(parts, f"top-rail-{side}", (0.14, 0.14, 20.0), (x, 1.31, 0), light)
        top.rotation_euler = (math.radians(0.3 * side), 0, 0)
        path = [(x, 0.68, -10.0), (x, 0.72, -5.0), (x, 0.5, 0.0), (x, 0.72, 5.0), (x, 0.68, 10.0)]
        tube = k.add_swept_tube(parts, f"rope-{side}", path, [0.045] * len(path), [rope] * (len(path) - 1), sides=3, smooth=False)
        s.fix_normals(tube)
    # The trestle: a cap beam under the stringers, two legs splaying out, ties across and X braces between them.
    top_y, bottom_y = -0.95, -54.0

    def leg_x(y):
        return 1.8 + (top_y - y) / (top_y - bottom_y) * 3.2

    k.add_box(parts, "cap", (4.9, 0.42, 0.55), (0, -1.0, 0), dark)
    for side in (-1, 1):
        beam(parts, f"leg-{side}", (side * leg_x(top_y), top_y, 0.0), (side * leg_x(bottom_y), bottom_y, 0.0), 0.55, 0.55, dark)
    levels = [-1.0, -13.0, -26.0, -39.0, -48.0]
    for y in levels[1:-1]:
        k.add_box(parts, f"tie-{y}", (2 * leg_x(y) + 0.5, 0.34, 0.34), (0, y, 0.0), wood)
    for i in range(len(levels) - 1):
        y0, y1 = levels[i], levels[i + 1]
        beam(parts, f"brace-a-{i}", (-leg_x(y0), y0, 0.32), (leg_x(y1), y1, 0.32), 0.24, 0.22, light if i % 2 else wood)
        if i < len(levels) - 2:
            beam(parts, f"brace-b-{i}", (leg_x(y0), y0, -0.32), (-leg_x(y1), y1, -0.32), 0.24, 0.22, wood if i % 2 else light)
    # Rope lashings where the legs meet the cap (one band round each leg, wound with the cap).
    for side in (-1, 1):
        k.add_box(parts, f"lash-{side}", (0.72, 0.5, 0.72), (side * leg_x(-1.3), -1.3, 0.0), rope)
    return parts, 500


# ---------------------------------------------------------------- observatory

def observatory():
    """かんそくじょ: a little round tower of cream walls on a stone plinth, a teal door in a porch at the front (+Z)
    under a small blue awning, two round windows, a pale-blue dome with a dark-blue shutter strip over it and a small
    telescope looking out of it, and a four-colour pinwheel on a mast at the back left."""
    paint = Paint(0.75)
    parts: list = []
    k.add_box(parts, "plinth", (7.0, 0.5, 7.0), (0, 0.25, 0), paint(PLINTH), bevel=0.08, segments=1)
    lathe_y(parts, "tower", [(0.5, 2.66, WALL_TRIM), (0.82, 2.66, WALL), (4.0, 2.55, WALL)], (0, 0), 16, paint, smooth=True,
            phase=TAU / 32)
    lathe_y(parts, "cornice", [(3.92, 2.78, WALL_TRIM), (4.32, 2.84, WALL_TRIM)], (0, 0), 16, paint, smooth=False, phase=TAU / 32)
    dome = [(4.32, 2.7, DOME)]
    for j in range(1, 5):
        a = math.radians(90 * j / 5)
        dome.append((4.32 + 2.7 * math.sin(a), 2.7 * math.cos(a), DOME))
    dome.append((4.32 + 2.7, 0.0, DOME))
    lathe_y(parts, "dome", dome, (0, 0), 16, paint, smooth=True, phase=TAU / 32)
    # The shutter strip over the dome, from low at the front to past the top.
    sections = []
    for j in range(9):
        th = math.radians(14 + 92 * j / 8)
        d = Vector((0, math.sin(th), math.cos(th)))
        base = Vector((0, 4.32, 0)) + d * 2.73
        outer = Vector((0, 4.32, 0)) + d * 2.8
        sections.append([(-0.36, base.y, base.z), (0.36, base.y, base.z), (0.36, outer.y, outer.z), (-0.36, outer.y, outer.z)])
    verts = [p for sec in sections for p in sec]
    faces = [(0, 1, 2, 3)] + [f for j in range(8) for f in s.ring_faces(j * 4, (j + 1) * 4, 4)] + [(32, 33, 34, 35)]
    painted(parts, "shutter", verts, faces, paint, DOME_SLIT, smooth=False)
    # The telescope, looking out of the shutter toward the sky at the front.
    k.add_tapered_segment(parts, "telescope", (0, 5.9, 1.1), (0, 7.05, 2.75), 0.22, 0.27, paint(MAST), vertices=8, smooth=True)
    sticker(parts, "lens", (0, 7.05, 2.75), (0, 0.82, 1.17), (0.4, 0.4), paint(WINDOW), 8, lift=0.04)
    # The porch with the door, its awning and step.
    k.add_box(parts, "porch", (1.8, 2.6, 0.8), (0, 1.8, 2.42), paint(WALL), bevel=0.05, segments=1)
    arch = [(0.5, 0.62), (0.5, 2.1)] + [(0.5 * math.cos(math.radians(a)), 2.1 + 0.5 * math.sin(math.radians(a))) for a in range(30, 151, 30)] + \
           [(-0.5, 2.1), (-0.5, 0.62)]
    k.poly_decal(parts, "door", arch, 2.825, paint(DOOR), rings=1)
    k.disc_decal(parts, "knob", (0.32, 1.55, 2.83), (0.1, 0.1), paint(BLADES[1]), 1, 8)
    s.plate(parts, "awning", (0, 3.18, 2.55), (1, 0, 0), (0, 0.25, 1), [(-1.05, -0.5), (1.05, -0.5), (1.05, 0.5), (-1.05, 0.5)], 0.1,
            [paint(DOME)])
    k.add_box(parts, "step", (1.5, 0.18, 0.4), (0, 0.59, 3.0), paint(PLINTH))
    # Round windows on the walls, either side of the porch.
    for i, deg in enumerate((-48, 48)):
        a = math.radians(deg)
        nrm = Vector((math.sin(a), 0, math.cos(a)))
        c = Vector((0, 2.55, 0)) + nrm * 2.6
        k.add_tapered_segment(parts, f"window-rim-{i}", tuple(c - nrm * 0.1), tuple(c + nrm * 0.1), 0.45, 0.45, paint(WALL_TRIM),
                              vertices=8, smooth=False)
        sticker(parts, f"window-{i}", tuple(c + nrm * 0.1), tuple(nrm), (0.66, 0.66), paint(WINDOW), 10, lift=0.004)
    # The pinwheel mast at the back left, the pinwheel turned to the front.
    mx, mz = 2.9, -2.9
    k.add_tapered_segment(parts, "mast", (mx, 0.5, mz), (mx, 9.25, mz), 0.11, 0.07, paint(MAST), vertices=6, smooth=False)
    hub = Vector((mx, 9.2, mz + 0.18))
    for i in range(4):
        a = TAU * i / 4
        tip = Vector((math.cos(a) * 1.3, math.sin(a) * 1.3, 0))
        side = Vector((math.cos(a + math.pi / 2), math.sin(a + math.pi / 2), 0))
        outline = [(0.0, 0.0), (0.75, 0.0), (1.3, 0.12), (0.85, 0.5)]
        u = tip.normalized()
        s.plate(parts, f"blade-{i}", tuple(hub), tuple(u), tuple(side), [(p, q) for p, q in outline], 0.05, [paint(BLADES[i])])
    ellipsoid(parts, "hub", (0.26, 0.26, 0.2), tuple(hub + Vector((0, 0, 0.06))), paint(BLADES[1]), 8, 4)
    return parts, 800


# ---------------------------------------------------------------- seabirds

def bird_clay(paint, volumes, name, budget, ground=False, voxel=0.018):
    """Round volumes (size, centre) fused into one smooth surface (voxel remesh, smoothed, decimated): white above, the
    soft grey-white underneath, as flat colours per face (the game bakes them into one draw call)."""
    made: list = []
    for i, (size, center) in enumerate(volumes):
        k.add_ellipsoid(made, f"{name}-v{i}", size, center, paint(BIRD), segments=24, rings=12)
    clay = k.flat_clay(made, name, paint(BIRD), voxel, budget, ground=ground, smooth=4)
    clay.data.materials.append(paint(BIRD_SHADE))
    for poly in clay.data.polygons:
        poly.material_index = 1 if k.gltf(poly.normal).y < -0.4 else 0
    return clay


def on_surface(tree, outside, toward):
    """Where a ray from `outside` toward `toward` (glTF) meets the surface in `tree` (k.world_tree), and the normal there."""
    o = Vector(k.to_blender(outside))
    t = Vector(k.to_blender(toward))
    loc, nrm, _, _ = tree.ray_cast(o, (t - o).normalized())
    return k.gltf(loc), k.gltf(nrm).normalized()


def look(az, el):
    """A direction from yaw `az` (0 = +Z, toward +X positive) and pitch `el` (radians)."""
    return Vector((math.sin(az) * math.cos(el), math.sin(el), math.cos(az) * math.cos(el)))


def surface_line(parts, name, points, width, m, lift=0.005):
    """A thin tapered line through surface points [(point, normal)] (closed eyes), facing out of the surface."""
    verts = []
    for i, (p, nrm) in enumerate(points):
        a, b = points[max(i - 1, 0)][0], points[min(i + 1, len(points) - 1)][0]
        side = (b - a).cross(nrm).normalized()
        half = width / 2 * (0.55 + 0.45 * math.sin(math.pi * i / (len(points) - 1)))
        c = p + nrm * lift
        verts += [tuple(c + side * half), tuple(c - side * half)]
    faces = [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(len(points) - 1)]
    obj = k.add_mesh(parts, name, verts, faces, [m], smooth=True)
    mid = len(points) // 2
    if k.gltf(obj.data.polygons[min(mid, len(faces) - 1)].normal).dot(points[mid][1]) < 0:
        obj.data.flip_normals()
    return obj


def hug(obj, body, offset):
    """Press a small sticker onto the curved surface of `body` (every vertex to its nearest surface point, lifted by
    `offset`), so no edge stands off the surface."""
    k.apply_modifier(obj, "SHRINKWRAP", target=body, wrap_method="NEAREST_SURFACEPOINT", offset=offset)


def eye(parts, paint, tree, center, direction, size, name, body=None):
    """A round dark eye with a white shine, pressed onto the head where `direction` from its centre meets it."""
    p, nrm = on_surface(tree, tuple(Vector(center) + direction * 0.6), center)
    dot = sticker(parts, f"{name}", tuple(p), tuple(nrm), size, paint(EYE), 8, lift=0.004)
    up = Vector((0, 1, 0))
    tangent_up = (up - nrm * nrm.dot(up)).normalized()
    across = nrm.cross(tangent_up).normalized()
    shine = p + tangent_up * size[1] * 0.22 + across * size[0] * 0.16 * (1 if direction.x < 0 else -1)
    glint = sticker(parts, f"{name}-shine", tuple(shine), tuple(nrm), (size[0] * 0.36, size[0] * 0.36), paint(EYE_SHINE), 5, lift=0.008)
    if body is not None:
        hug(dot, body, 0.004)
        hug(glint, body, 0.008)


def wing(parts, paint, side, root, span, chord, rise, sweep, thick=0.05, sections=5, droop=0.0):
    """A soft wing slab from the shoulder outward (side +1 = the bird's left, +X), rising `rise` toward the tip: grey,
    the outer part the darker tip colour, a rounded tip."""
    verts, faces, cols = [], [], []
    rx, ry, rz = root
    for j in range(sections + 1):
        t = j / sections
        x = rx + side * span * t
        y = ry + rise * math.sin(t * math.pi / 2) - droop * t * t
        c = chord * (1.0 - 0.55 * t ** 1.6)
        z_front = rz + 0.06 - sweep * t * t
        th = thick * (1.0 - 0.5 * t)
        verts += [(x, y, z_front), (x, y + th, z_front - c * 0.35), (x, y, z_front - c), (x, y - th * 0.5, z_front - c * 0.4)]
    tip = len(verts)
    verts.append((rx + side * (span + chord * 0.12), ry + rise - droop, rz + 0.06 - sweep - chord * 0.24))
    faces.append((0, 3, 2, 1))
    cols.append(BIRD_WING)
    for j in range(sections):
        a, b = 4 * j, 4 * (j + 1)
        col = BIRD_TIP if j >= sections - 2 else BIRD_WING
        faces += [(a + i, a + (i + 1) % 4, b + (i + 1) % 4, b + i) for i in range(4)]
        cols += [col] * 4
    last = 4 * sections
    faces += [(last + i, last + (i + 1) % 4, tip) for i in range(4)]
    cols += [BIRD_TIP] * 4
    return painted(parts, f"wing-{side}", verts, faces, paint, cols, smooth=True)


def seabird():
    """うみどり, flying: a round white body running smoothly into its head and a short tail (one fused surface), soft
    grey wings raised in a wide V with darker tips, orange feet tucked under, and two round dark eyes with a shine (no
    beak, no mouth). Head +Z."""
    paint = Paint(0.7, glow=BIRD_GLOW)
    parts: list = []
    head = (0, 0.39, 0.25)
    body = bird_clay(paint, [((0.4, 0.34, 0.66), (0, 0.27, -0.08)), ((0.33, 0.31, 0.32), head), ((0.24, 0.12, 0.34), (0, 0.31, -0.36))],
                     "body", 112)
    parts.append(body)
    tree = k.world_tree(body)
    for side in (-1, 1):
        wing(parts, paint, side, (side * 0.12, 0.33, 0.04), 0.64, 0.36, 0.31, 0.12, thick=0.05, droop=0.03)
        eye(parts, paint, tree, head, look(side * math.radians(40), math.radians(12)), (0.07, 0.085), f"eye-{side}", body)
        ellipsoid(parts, f"foot-{side}", (0.07, 0.06, 0.15), (side * 0.07, 0.05, -0.24), paint(BIRD_FOOT), 5, 2)
    s.plate(parts, "tail", (0, 0.31, -0.46), (1, 0, 0), (0, 0.1, -1),
            [(-0.05, 0.0), (0.05, 0.0), (0.12, 0.16), (0.0, 0.19), (-0.12, 0.16)], 0.03, [paint(BIRD_WING)])
    return parts, 400


def seabird_sleep():
    """うみどり asleep: sitting round and low (a flat bottom), its head sunk into the shoulders (one fused surface), wings
    folded along the sides with their darker tips crossing over the tail, eyes closed (two soft curved lines)."""
    paint = Paint(0.7, glow=BIRD_GLOW)
    parts: list = []
    head = (0, 0.33, 0.16)
    body = bird_clay(paint, [((0.5, 0.42, 0.66), (0, 0.19, -0.06)), ((0.32, 0.31, 0.32), head), ((0.2, 0.1, 0.24), (0, 0.24, -0.38))],
                     "body", 152, ground=True)
    parts.append(body)
    tree = k.world_tree(body)
    for side in (-1, 1):
        ellipsoid(parts, f"wing-{side}", (0.09, 0.22, 0.46), (side * 0.215, 0.23, -0.12), paint(BIRD_WING), 7, 3,
                  rot=(math.radians(-10), math.radians(side * 6), 0))
        ellipsoid(parts, f"wing-tip-{side}", (0.07, 0.06, 0.2), (side * 0.1, 0.27, -0.36), paint(BIRD_TIP), 5, 3,
                  rot=(math.radians(-15), 0, math.radians(side * 25)))
        # A closed eye: a soft arc dipping in the middle ("‿").
        az0 = side * math.radians(40)
        pts = []
        for t in (0.0, 0.25, 0.5, 0.75, 1.0):
            d = look(az0 + side * math.radians(15) * (2 * t - 1), math.radians(14) - math.radians(8) * (1 - (2 * t - 1) ** 2))
            pts.append(on_surface(tree, tuple(Vector(head) + d * 0.6), head))
        hug(surface_line(parts, f"eye-{side}", pts, 0.02, paint(EYE)), body, 0.005)
    return parts, 400


# ---------------------------------------------------------------- signs

SIGN_W, SIGN_H, SIGN_Y = 1.4, 1.05, 2.755
BOARD_FRONT = 0.06


def rounded(cx, cy, w, h, r, per=3):
    pts = []
    for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = cx + qx * (w / 2 - r), cy + qy * (h / 2 - r)
        for i in range(per + 1):
            a = math.radians(a0 + 90 * i / per)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return pts


def sign_base(parts, paint, board_hex, frame_hex):
    """Post, a rounded board in the frame colour and a slightly proud face in the board colour (the frame shows round
    it), a little cap on the post."""
    post = paint(POST)
    k.add_tapered_segment(parts, "post", (0, 0.0, -0.1), (0, SIGN_Y + 0.35, -0.1), 0.08, 0.07, post, vertices=6, smooth=False)
    k.add_box(parts, "foot", (0.26, 0.12, 0.2), (0, 0.06, -0.1), paint(hexmix(POST, "#3A3F47", 0.4)), bevel=0.03, segments=1)
    s.plate(parts, "frame", (0, SIGN_Y, -0.005), (1, 0, 0), (0, 1, 0), rounded(0, 0, SIGN_W, SIGN_H, 0.17, 2), 0.09, [paint(frame_hex)])
    s.plate(parts, "face", (0, SIGN_Y, 0.04), (1, 0, 0), (0, 1, 0), rounded(0, 0, SIGN_W - 0.16, SIGN_H - 0.16, 0.11, 2), 0.04, [paint(board_hex)])
    return BOARD_FRONT + 0.001


def chevron(cx, cy, size, thick, direction):
    """A thick '>' as triangles pointing along `direction` (radians)."""
    out = []
    co, sn = math.cos(direction), math.sin(direction)

    def rot(x, y):
        return (cx + x * co - y * sn, cy + x * sn + y * co)

    for sg in (1, -1):
        a = rot(-size / 2, sg * size / 2)
        b = rot(size / 2, 0)
        c = rot(size / 2 - thick * 1.4, 0)
        d = rot(-size / 2 - thick * 0.2, sg * size / 2 - sg * thick)
        out += [(a, b, c), (a, c, d)]
    return out


def sparkle(cx, cy, r):
    out = []
    for i in range(4):
        a = TAU * i / 4
        tip = (cx + math.cos(a) * r, cy + math.sin(a) * r)
        left = (cx + math.cos(a + math.pi / 4) * r * 0.26, cy + math.sin(a + math.pi / 4) * r * 0.26)
        right = (cx + math.cos(a - math.pi / 4) * r * 0.26, cy + math.sin(a - math.pi / 4) * r * 0.26)
        out += [((cx, cy), right, tip), ((cx, cy), tip, left)]
    return out


def sign_steep():
    """きゅうな さか: a yellow board in a red-brown frame; a steep red-brown hill rising to the right with two yellow
    '>' marks climbing it, and a little white ground line."""
    paint = Paint(0.6)
    parts: list = []
    z = sign_base(parts, paint, STEEP_BOARD, STEEP_FRAME)
    y0 = SIGN_Y - 0.33
    hill = [((-0.5, y0), (0.5, y0), (0.5, SIGN_Y + 0.32))]
    flat_tris(parts, "hill", hill, z, paint(STEEP_FRAME))
    ang = math.atan2(0.65, 1.0)
    flat_tris(parts, "climb", chevron(0.12, y0 + 0.19, 0.16, 0.06, ang) + chevron(0.33, y0 + 0.33, 0.16, 0.06, ang), z + 0.003,
              paint(STEEP_BOARD))
    return parts, 450


def sign_slide():
    """つるつるざか: a pale-blue board in a blue frame; a white slope falling to the right, a soft blue shine line on it,
    and two yellow sparkles."""
    paint = Paint(0.6)
    parts: list = []
    z = sign_base(parts, paint, SLIDE_BOARD, SLIDE_FRAME)
    y0 = SIGN_Y - 0.33
    flat_tris(parts, "slope", [((-0.5, y0), (0.5, y0), (-0.5, SIGN_Y + 0.2))], z, paint(SLIDE_MARK))
    shine = [((-0.42, SIGN_Y + 0.06), (-0.36, SIGN_Y + 0.1), (0.2, y0 + 0.13)), ((-0.42, SIGN_Y + 0.06), (0.2, y0 + 0.13), (0.16, y0 + 0.09))]
    flat_tris(parts, "shine", shine, z + 0.003, paint(SLIDE_FRAME))
    flat_tris(parts, "sparkles", sparkle(0.24, SIGN_Y + 0.18, 0.17) + sparkle(0.43, SIGN_Y - 0.04, 0.1), z, paint(SPARKLE))
    return parts, 450


def sign_no_rocket():
    """ロケット おやすみ: a navy board in a pale frame; a yellow crescent moon, three 'z's rising, and a little rocket
    lying asleep across the board (white, an orange band and nose, a dark nozzle; no flame, no face)."""
    paint = Paint(0.6)
    parts: list = []
    z = sign_base(parts, paint, REST_BOARD, REST_FRAME)
    # The crescent: outer circle minus an offset inner one, as a strip.
    mx, my, ro = -0.32, SIGN_Y + 0.12, 0.27
    tris = []
    steps = 10
    for i in range(steps):
        a0 = math.pi * 0.38 + math.pi * 1.24 * i / steps
        a1 = math.pi * 0.38 + math.pi * 1.24 * (i + 1) / steps
        k0, k1 = math.sin(math.pi * i / steps), math.sin(math.pi * (i + 1) / steps)
        o0 = (mx + math.cos(a0) * ro, my + math.sin(a0) * ro)
        o1 = (mx + math.cos(a1) * ro, my + math.sin(a1) * ro)
        i0 = (mx + math.cos(a0) * (ro - 0.16 * k0), my + math.sin(a0) * (ro - 0.16 * k0))
        i1 = (mx + math.cos(a1) * (ro - 0.16 * k1), my + math.sin(a1) * (ro - 0.16 * k1))
        tris += [(o0, o1, i1), (o0, i1, i0)]
    flat_tris(parts, "moon", tris, z, paint(MOON))

    def zee(cx, cy, sz, w=0.032):
        def bar(ax, ay, bx, by):
            dx, dy = bx - ax, by - ay
            ln = math.hypot(dx, dy)
            nx, ny = -dy / ln * w / 2, dx / ln * w / 2
            return [((ax + nx, ay + ny), (bx + nx, by + ny), (bx - nx, by - ny)), ((ax + nx, ay + ny), (bx - nx, by - ny), (ax - nx, ay - ny))]
        return bar(cx - sz, cy + sz, cx + sz, cy + sz) + bar(cx + sz, cy + sz, cx - sz, cy - sz) + bar(cx - sz, cy - sz, cx + sz, cy - sz)

    flat_tris(parts, "zzz", zee(0.14, SIGN_Y + 0.12, 0.045) + zee(0.3, SIGN_Y + 0.23, 0.055) + zee(0.48, SIGN_Y + 0.33, 0.045), z, paint(MOON))
    # The resting rocket: a small body of revolution lying along x, nose to the right, standing proud of the board.
    ry, rz = SIGN_Y - 0.2, 0.145
    rocket: list = []
    prof = [(-0.3, 0.0, ROCKET_DARK), (-0.3, 0.075, ROCKET_DARK), (-0.2, 0.06, ROCKET_BODY), (-0.06, 0.085, ROCKET_BAND),
            (0.0, 0.085, ROCKET_BODY), (0.18, 0.085, ROCKET_NOSE), (0.27, 0.06, ROCKET_NOSE), (0.33, 0.0, ROCKET_NOSE)]
    lathe_z(rocket, "rocket", prof, 0.0, 0.0, 10, paint, smooth=True)
    for obj in rocket:
        obj.rotation_euler = (0, 0, math.radians(90))  # a quarter turn about the vertical: the nose (glTF +Z) to +X
        obj.location = k.to_blender((0.12, ry, rz))
    parts += rocket
    for i, sg in enumerate((1, -1)):
        s.plate(parts, f"fin-{i}", (-0.12, ry + sg * 0.085, rz), (1, 0, 0), (0, sg, 0), [(-0.12, 0.0), (0.06, 0.0), (-0.09, 0.07), (-0.16, 0.06)],
                0.02, [paint(ROCKET_BAND)])
    return parts, 450


# ---------------------------------------------------------------- sulfur crystal

def sulfur_crystal():
    """きいろい けっしょう: a cluster of bright yellow six-sided crystals with pale points, leaning out of a grey stone,
    glowing a little so they twinkle in the steam when the light finds them."""
    paint = Paint(0.4, glow={CRYSTAL: 0.38, CRYSTAL_DEEP: 0.3, CRYSTAL_TIP: 0.5})
    parts: list = []
    stone = lumpy_stone(parts, "stone", (1.45, 0.62, 1.2), (0, 0.18, 0), paint(CRYSTAL_ROCK), paint(hexmix(CRYSTAL_ROCK, "#FFFFFF", 0.18)), 3,
                        sub=1, top_from=0.45, rough=0.12)
    cut_below(stone)
    tones = [paint(CRYSTAL), paint(CRYSTAL_DEEP), paint(CRYSTAL_TIP)]
    for i, (x, z, lx, lz, length, radius, turn) in enumerate([
            (0.0, 0.0, 0.0, 0.05, 1.62, 0.15, 0.2), (0.3, 0.12, 0.62, 0.18, 1.0, 0.115, 0.7), (-0.28, 0.14, -0.6, 0.3, 1.08, 0.12, 0.1),
            (0.08, -0.26, 0.15, -0.6, 0.88, 0.1, 0.9), (-0.14, 0.3, -0.12, 0.62, 0.72, 0.085, 0.4), (0.3, -0.18, 0.62, -0.42, 0.62, 0.08, 0.3),
            (-0.3, -0.16, -0.62, -0.32, 0.66, 0.085, 0.6), (0.18, 0.32, 0.4, 0.75, 0.48, 0.07, 0.2), (-0.42, 0.02, -0.95, 0.0, 0.4, 0.06, 0.8)]):
        s.crystal(parts, f"crystal-{i}", (x, 0.3, z), (lx, 1.0, lz), length, radius, turn, tones)
    return parts, 400


# ---------------------------------------------------------------- spring vent

def spring_vent():
    """あわの いずみ: a low, lumpy sand mound on the sea floor with three round vents, each a little sandy crater with a
    deep blue-green mouth, and a bubble or two just out of them."""
    paint = Paint(0.95, glow={BUBBLE: 0.25})
    rng = random.Random(12)
    parts: list = []
    prof = [(0.0, 2.5, VENT_WET), (0.2, 2.4, VENT_WET), (0.52, 1.9, VENT_SAND), (0.73, 1.0, VENT_SAND), (0.79, 0.0, VENT_SAND)]
    mound = lathe_y(parts, "mound", prof, (0, 0), 13, paint, smooth=True)
    for v in mound.data.vertices:
        if v.co.z > 0.01:
            v.co.x *= 1.0 + 0.06 * math.sin(math.atan2(v.co.y, v.co.x) * 3 + 1.0)
            v.co.y *= 1.0 + 0.06 * math.sin(math.atan2(v.co.y, v.co.x) * 3 + 1.0)
    vents = []
    for i in range(3):
        a = TAU * i / 3 + 0.4
        r = 0.95 + 0.25 * (i == 1)
        vx, vz = math.cos(a) * r, math.sin(a) * r
        y = 0.78 - 0.32 * (r / 2.5) ** 2 * 1.6
        vents.append((vx, vz, y))
        rr = 0.5 - 0.08 * (i == 2)
        lathe_y(parts, f"vent-{i}", [(y - 0.2, rr + 0.12, VENT_SAND), (y + 0.12, rr + 0.02, hexmix(VENT_SAND, VENT_WET, 0.5)),
                                     (y + 0.13, rr - 0.08, VENT_HOLE), (y + 0.0, 0.0, VENT_HOLE)], (vx, vz), 6, paint, smooth=False)
    bubble = paint(BUBBLE)
    for i, (j, lift, size) in enumerate(((0, 0.17, 0.42), (1, 0.12, 0.3))):
        vx, vz, y = vents[j]
        lumpy_stone(parts, f"bubble-{i}", (size, size, size), (vx + 0.04, y + lift, vz), bubble, bubble, 70 + i, sub=1, rough=0.02)
    return parts, 300


# ---------------------------------------------------------------- rocket unit

def rocket_unit():
    """The rocket on ワンダー号's roof: a dark mounting plate, two blue cradles (the jump device's blue, a yellow stripe)
    holding two round white tubes side by side, each with an orange nose, an orange and a yellow band, two little
    orange fins and a dark nozzle at the back. A toy rocket pack, no face, nothing like a real launcher."""
    paint = Paint(0.5)
    parts: list = []
    axis_y, r = 0.37, 0.26
    k.add_box(parts, "plate", (1.46, 0.09, 1.62), (0, 0.045, 0.02), paint(ROCKET_DARK), bevel=0.03, segments=1)
    # Cradles: a block across both tubes with two round seats cut into it.
    for i, z in enumerate((-0.42, 0.42)):
        outline = [(-0.73, 0.09), (0.73, 0.09), (0.73, 0.3)]
        for cx_ in (0.45, -0.45):
            for j in range(7):
                a = math.radians(0 - 180 * j / 6)
                outline.append((cx_ + math.cos(a) * (r + 0.01) * (1 if cx_ > 0 else 1), axis_y + math.sin(a) * (r + 0.01)))
            if cx_ > 0:
                outline.append((0.0, 0.3))
        outline.append((-0.73, 0.3))
        # Keep the seats' upper ends at the block top (y 0.3): clamp the arc points that rise above it.
        outline = [(x, min(y, 0.3)) for x, y in outline]
        s.plate(parts, f"cradle-{i}", (0, 0, z), (1, 0, 0), (0, 1, 0), outline, 0.26, [paint(ROCKET_SADDLE)])
        k.add_box(parts, f"cradle-stripe-{i}", (1.47, 0.05, 0.27), (0, 0.2, z), paint(ROCKET_STRIPE))
    for side in (-1, 1):
        x = side * 0.45
        prof = [(-1.13, 0.0, ROCKET_SOOT), (-1.13, 0.272, ROCKET_DARK), (-0.86, 0.225, ROCKET_DARK), (-0.74, 0.2, ROCKET_DARK),
                (-0.72, r, ROCKET_BODY), (-0.38, r, ROCKET_STRIPE), (-0.3, r + 0.008, ROCKET_BODY), (0.33, r, ROCKET_BAND),
                (0.47, r + 0.008, ROCKET_BODY), (0.6, r, ROCKET_NOSE), (0.82, 0.215, ROCKET_NOSE), (0.97, 0.13, ROCKET_NOSE),
                (1.06, 0.0, ROCKET_NOSE)]
        lathe_z(parts, f"tube-{side}", prof, x, axis_y, 10, paint, smooth=True, phase=TAU / 20)
        # Fins: one out to the side and one down-and-out, at the back.
        for j, ang in enumerate((0.0, -50.0)):
            a = math.radians(ang)
            u = Vector((side * math.cos(a), math.sin(a), 0.0))
            base = Vector((x, axis_y, -0.48)) + u * (r - 0.02)
            s.plate(parts, f"fin-{side}-{j}", tuple(base), (0, 0, 1), tuple(u),
                    [(-0.16, 0.0), (0.14, 0.0), (-0.04, 0.125 if j == 0 else 0.09), (-0.18, 0.11 if j == 0 else 0.08)], 0.035,
                    [paint(ROCKET_BAND)])
    return parts, 800


# ---------------------------------------------------------------- export and preview

def floor_to_zero(model):
    """Move the model so its lowest point is at y = 0, keeping its x/z origin."""
    _, lo, _ = k.model_metrics(model)
    if abs(lo[1]) > 1e-6:
        model.location.z -= lo[1]
        k.active(model)
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)


def scale_to(model, size):
    """Scale the model about its origin to exactly `size` (w, h, d)."""
    _, lo, hi = k.model_metrics(model)
    sx, sy, sz = (size[i] / (hi[i] - lo[i]) for i in range(3))
    model.scale = (sx, sz, sy)  # Blender axes: x, y (= glTF -z), z (= up)
    k.active(model)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def preview(model, name, direction=(0.55, -0.72, 0.42), size=(512, 400)):
    """sky.preview's three-quarter view in a pale sky, with the camera's clipping fitted to big models too."""
    k.PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.compression = 90
    scene.render.dither_intensity = 0.0
    scene.render.filepath = str(k.PREVIEW_DIR / f"{name}.png")
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    world = bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    tree = world.node_tree
    seen = tree.nodes["Background"]
    seen.inputs["Color"].default_value = (0.50, 0.70, 0.90, 1)
    seen.inputs["Strength"].default_value = 1.0
    lit = tree.nodes.new("ShaderNodeBackground")
    lit.inputs["Color"].default_value = (0.93, 0.92, 0.90, 1)
    lit.inputs["Strength"].default_value = 0.85
    path = tree.nodes.new("ShaderNodeLightPath")
    mix = tree.nodes.new("ShaderNodeMixShader")
    tree.links.new(path.outputs["Is Camera Ray"], mix.inputs[0])
    tree.links.new(lit.outputs[0], mix.inputs[1])
    tree.links.new(seen.outputs[0], mix.inputs[2])
    tree.links.new(mix.outputs[0], tree.nodes["World Output"].inputs["Surface"])
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 10), rotation=(math.radians(40), 0, math.radians(25)))
    bpy.context.object.data.energy = 2.6
    bpy.context.object.data.angle = math.radians(14)
    _, lo, hi = k.model_metrics(model)
    span = max(hi[i] - lo[i] for i in range(3))
    bpy.ops.object.camera_add(location=(0, 0, 0))
    camera = bpy.context.object
    camera.data.lens = 50
    camera.data.sensor_fit = "HORIZONTAL"
    camera.data.clip_start = max(0.01, span * 0.002)
    camera.data.clip_end = span * 50
    view = Vector(direction).normalized()
    camera.rotation_euler = (-view).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    bpy.context.view_layer.update()
    coords = []
    for v in model.data.vertices:
        coords.extend(model.matrix_world @ v.co)
    location, _ = camera.camera_fit_coords(bpy.context.evaluated_depsgraph_get(), coords)
    center = Vector(k.to_blender([(hi[i] + lo[i]) / 2 for i in range(3)]))
    camera.location = location + view * (Vector(location) - center).length * 0.12
    bpy.ops.render.render(write_still=True)


BUILDERS = {"volcano": volcano,
            "mesa-a": lambda: mesa("mesa-a", 175.0, 140.0, (-532.0, 165.0), 0.0, 31),
            "mesa-b": lambda: mesa("mesa-b", 125.0, 155.0, (-266.0, 308.5), 8.0, 47),
            "pumice": pumice, "old-bridge": old_bridge, "observatory": observatory, "seabird": seabird,
            "seabird-sleep": seabird_sleep, "sign-steep": sign_steep, "sign-slide": sign_slide, "sign-no-rocket": sign_no_rocket,
            "sulfur-crystal": sulfur_crystal, "spring-vent": spring_vent, "rocket-unit": rocket_unit}
# Origins: the bottom centre (x/z as modelled) for most; old-bridge keeps the top of its deck at the origin; the round
# things the game centres (pumice, crystal, vent) are centred on their bounding box.
CENTRED = {"pumice", "sulfur-crystal", "spring-vent", "seabird", "seabird-sleep"}
# Exact stand-in sizes (w, h, d) the hand-tuned shapes are scaled to.
EXACT = {"pumice": (1.01, 0.86, 0.98), "sulfur-crystal": (1.5, 1.87, 1.25), "seabird": (1.64, 0.63, 1.02),
         "seabird-sleep": (0.52, 0.5, 0.81), "spring-vent": (5.0, 1.07, 5.0)}
KEEP = {"old-bridge"}
SMOOTH = {"seabird", "seabird-sleep", "rocket-unit"}
VIEWS = {"volcano": (0.55, -0.72, 0.38), "old-bridge": (0.75, -0.5, 0.2), "rocket-unit": (0.6, 0.62, 0.45),
         "seabird": (0.5, -0.75, 0.42), "seabird-sleep": (0.55, -0.75, 0.35), "sign-steep": (0.35, -0.9, 0.15),
         "sign-slide": (0.35, -0.9, 0.15), "sign-no-rocket": (0.35, -0.9, 0.15), "spring-vent": (0.5, -0.7, 0.6)}
TALL = {"sign-steep", "sign-slide", "sign-no-rocket", "old-bridge", "observatory"}

if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if a in BUILDERS] or list(BUILDERS)
    for name in names:
        k.reset()
        built, budget = BUILDERS[name]()
        model = k.join(built, name)
        model.name = name
        model.data.name = name
        model.data.validate()  # the fused steam cloud can leave a degenerate face or two
        if name in EXACT:
            scale_to(model, EXACT[name])
        if name in CENTRED:
            k.normalize(model, None)
        elif name not in KEEP:
            floor_to_zero(model)
        s.export_glb(model, name, budget)
        preview(model, name, VIEWS.get(name, (0.55, -0.72, 0.42)), size=(400, 512) if name in TALL else (512, 400))
