"""Stage 2-1 (おおきなきのくに) — Claude Code. Ticket 0007 (and 2-1's record of ticket 0010).

The crafted look (つくりこみ), chosen for every model on 2026-10-15 (docs/ASSET_PIPELINE.md §1), in the toy style of
1-3's set (sky.py, whose mesh helpers and preview this script shares).
tree-trunk (the giant tree), canopy (a clump of leaves), branch-log (the branch under the rail), bough-slab and
bough-slab-cap (the flat upside-down bough the rail wraps round, and its rounded end), leaf-pad (the big leaf that
catches a falling train; 2-2 builds floors, roofs and lily pads of it), mushroom, acorn (the nut that rolls down the
branch; the squirrel holds one), squirrel, and the records acorn-big, squirrel-nest and record-feather. Same names,
sizes, origins and orientation as the code stand-ins they replace, so the stage JSON does not change:
- branch-log: origin at the centre of its top line, the top at y = 0 all along (the track sits on it), 3.8 x 3.8 x 40,
  thinner toward +Z; the thick end's collar hides the thin end of the log before it (logs are laid end to end).
- bough-slab 30 x 18.8 x 40: origin at the top centre, moss on top (y = 0) and underneath (y = -18.8), bark sides; the
  ends at z = +-20 are cut flat with one cross-section, so slabs line up end to end and the cap closes the last one.
  bough-slab-cap: the rounded end (radius 9.4 about y = -9.4, z = 0), out toward +Z; origin at the top of the end it
  closes. Rails run at x = +-6 on top and between x = -6 and 6 underneath: |x| < 10.5 stays flat and clear.
- Everything else: origin at the bottom centre, +Z forward (the squirrel's face; the side facing the rail for the
  records). The trunk's buttress roots reach past its 28 m (to a 38 m circle, still 4.5 m inside the spiral rail).
- acorn: the game turns it about its middle when it rolls or falls (src/view/three/forest.ts), held by the squirrel
  upright; the squirrel's paws are open in front of its belly for it.
Output: public/models/<name>.glb and assets/previews/<name>.png.
Run: python3 scripts/run-bpy.py assets/blender/forest.py [-- name ...]
"""
from __future__ import annotations

from pathlib import Path
import json
import math
import random
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import sky as s  # noqa: E402  (mesh helpers and the preview of the chapter-1 set)
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

TAU = 2 * math.pi

# Palette (ticket 0007) and a few accents.
BARK = "#7A5A3C"
BARK_DARK = "#5E4430"
BARK_LIGHT = "#8E6B48"
LEAF = "#5FAE4E"
LEAF_LIGHT = "#86C865"
LEAF_DARK = "#3F8A3A"
VEIN = "#C8E89A"
ACORN = "#B9803F"
ACORN_CAP = "#7B5732"
FUR = "#C8763A"
FUR_LIGHT = "#F2D3A8"
CAP = "#D9B38C"
CAP_DARK = "#C49A6E"
STEM = "#F4EBDD"
HOLLOW = "#3A2A1C"

mat = s.mat
fix_normals = s.fix_normals
ring_faces = s.ring_faces


# ---------------------------------------------------------------- helpers (glTF coordinates)

def loft_rings(parts, name, rings, materials, idx_fn=None, smooth_fn=None, cap_start=True, cap_end=True):
    """Closed loft through rings of equal length; faces coloured by idx_fn(center, normal, face_index)."""
    n = len(rings[0])
    verts = [p for r in rings for p in r]
    faces = []
    for r in range(len(rings) - 1):
        faces += ring_faces(r * n, (r + 1) * n, n)
    if cap_start:
        faces.append(tuple(range(n - 1, -1, -1)))
    if cap_end:
        last = (len(rings) - 1) * n
        faces.append(tuple(range(last, last + n)))
    obj = k.add_mesh(parts, name, verts, faces, materials)
    fix_normals(obj)
    for i, poly in enumerate(obj.data.polygons):
        c, nm = k.gltf(poly.center), k.gltf(poly.normal)
        poly.material_index = idx_fn(c, nm, i) if idx_fn else 0
        poly.use_smooth = smooth_fn(c, nm) if smooth_fn else False
    return obj


def frame_of(direction, up_hint=(0, 1, 0)):
    """Two unit vectors across `direction` (side, up)."""
    d = Vector(direction).normalized()
    hint = Vector(up_hint)
    if abs(d.dot(hint.normalized())) > 0.95:
        hint = Vector((1, 0, 0))
    side = d.cross(hint).normalized()
    up = side.cross(d).normalized()
    return side, up


def oval(parts, name, center, normal, up, w, h, m, segments=12, lift=0.0):
    """A flat ellipse (fan) facing along `normal`, its h axis along `up`."""
    nrm = Vector(normal).normalized()
    v_up = (Vector(up) - nrm * Vector(up).dot(nrm)).normalized()
    side = v_up.cross(nrm).normalized()
    c = Vector(center) + nrm * lift
    verts = [tuple(c)]
    for i in range(segments):
        a = TAU * i / segments
        verts.append(tuple(c + side * (math.cos(a) * w / 2) + v_up * (math.sin(a) * h / 2)))
    faces = [(0, 1 + i, 1 + (i + 1) % segments) for i in range(segments)]
    obj = k.add_mesh(parts, name, verts, faces, [m])
    # Face it outward whichever way the fan was wound.
    if k.gltf(obj.data.polygons[0].normal).dot(nrm) < 0:
        obj.data.flip_normals()
    return obj


def leaf_blade(parts, name, base, direction, length, width, m_top, m_under, droop=0.2, thick=0.04, sections=4):
    """A small leaf: a closed, flat diamond section swept from `base` along `direction`, drooping toward its tip (top
    and underside colours)."""
    d = Vector(direction).normalized()
    side, up = frame_of(d)
    verts, faces, mats = [], [], []
    b = Vector(base)
    for i in range(sections + 1):
        t = i / sections
        w = width * math.sin(math.pi * min(1.0, 0.12 + 0.88 * t)) * (1.0 - 0.2 * t)
        c = b + d * (length * t) - up * (droop * length * t * t)
        rib = up * (thick + w * 0.12)
        verts += [tuple(c + side * w), tuple(c + rib), tuple(c - side * w), tuple(c - up * thick)]
    for i in range(sections):
        a, bb = 4 * i, 4 * (i + 1)
        for j in range(4):
            n = (j + 1) % 4
            faces.append((a + j, a + n, bb + n, bb + j))
            mats.append(0 if j in (0, 1) else 1)
    faces.append((0, 1, 2, 3))
    mats.append(1)
    last = 4 * sections
    faces.append((last + 3, last + 2, last + 1, last))
    mats.append(1)
    obj = k.add_mesh(parts, name, verts, faces, [m_top, m_under], mats, smooth=True)
    fix_normals(obj)
    return obj


def weld(obj, distance=1e-4):
    """Merge coincident points, drop the faces that collapse, then wind the closed part outward."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=distance)
    bmesh.ops.dissolve_degenerate(bm, dist=distance, edges=bm.edges)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    fix_normals(obj)


def tube(parts, name, path, radii, m, sides=6, smooth=False):
    obj = k.add_swept_tube(parts, name, path, radii, [m] * (len(path) - 1), sides=sides, smooth=smooth)
    fix_normals(obj)
    return obj


# ---------------------------------------------------------------- the giant tree

TRUNK_RIDGES = 6


def trunk_twist(y):
    return 0.24 * y / 90.0


def trunk_ridge(theta, y):
    """1 on a bark ridge's crest, 0 in the broad groove between two."""
    return 0.5 + 0.5 * math.cos(TRUNK_RIDGES * (theta - trunk_twist(y)))


def trunk_base(y):
    return 12.9 - 0.9 * y / 90.0 + 1.9 * math.exp(-y / 5.0) + 0.25 * math.sin(y / 9.0)


def trunk_offset(i, theta, y):
    """The bark's radial offset at ring point i (the fine grooves alternate with i), without the random jitter."""
    ridge = trunk_ridge(theta, y)
    fine = (0.2 if i % 2 else -0.2) * (0.5 + 0.5 * (1 - ridge))
    return 1.7 * ridge ** 2.0 - 0.75 + fine


def trunk_surface(theta, y):
    """The lowest bark radius around angle theta at height y (a shelf rooted there never floats off a groove)."""
    n = 36
    i = round(theta / (TAU / n))
    return trunk_base(y) + min(trunk_offset(j, TAU * j / n, y) for j in (i - 1, i, i + 1)) - 0.12


def tree_trunk():
    """The giant tree: a trunk 26-27 m across and 90 m tall, its six bark ridges turning a little as they rise and
    flowing at the foot into six buttress roots that dip into the ground; fine grooves between them, moss at the foot
    and on the roots, beige shelf fungi, a knothole with a dark hollow. The top (hidden in the canopy laid on it) splits
    into four short limbs."""
    bark, dark, light = mat("Bark", BARK, 0.9), mat("Bark dark", BARK_DARK, 0.9), mat("Bark light", BARK_LIGHT, 0.9)
    moss = mat("Moss", LEAF, 0.9)
    parts: list = []
    rng = random.Random(7)
    n = 36
    heights = [0.0, 1.4, 3.4, 6.0, 9.5, 14, 20, 27, 35, 44, 53, 62, 70, 77, 82.5, 86.5]
    rings = []
    for j, y in enumerate(heights):
        ring = []
        for i in range(n):
            th = TAU * i / n
            off = trunk_offset(i, th, y) + (rng.uniform(-0.12, 0.12) if j else 0.0)
            r = trunk_base(y) + off
            yy = y + (rng.uniform(-0.35, 0.35) if 0 < j < len(heights) - 1 else 0.0)
            ring.append((math.cos(th) * r, yy, math.sin(th) * r))
        rings.append(ring)
    # The top: a low dome under the limbs.
    rings.append([(math.cos(TAU * i / n) * 9.5, 88.6, math.sin(TAU * i / n) * 9.5) for i in range(n)])
    rings.append([(math.cos(TAU * i / n) * 4.0, 89.5, math.sin(TAU * i / n) * 4.0) for i in range(n)])

    def moss_line(th):
        return 0.6 + 6.0 * max(0.0, math.cos(th - 2.3)) ** 4 + 0.9 * math.sin(5 * th + 1)

    def colour(c, nm, i):
        if nm.y > 0.6 and c.y > 80:
            return 0
        th = math.atan2(c.z, c.x)
        if c.y < moss_line(th) and nm.y > -0.3:
            return 3
        ridge = trunk_ridge(th, c.y)
        if ridge < 0.12:
            return 1
        if ridge > 0.82:
            return 2
        return 0

    loft_rings(parts, "trunk", rings, [bark, dark, light, moss], colour, cap_start=True, cap_end=True)

    # Buttress roots under the ridges, dipping into the ground 19-20 m out.
    for kk in range(TRUNK_RIDGES):
        phi = TAU * kk / TRUNK_RIDGES + rng.uniform(-0.05, 0.05)
        out = Vector((math.cos(phi), 0, math.sin(phi)))
        across = Vector((-math.sin(phi), 0, math.cos(phi)))
        bend = rng.choice((-1, 1)) * rng.uniform(0.5, 1.1)
        reach = rng.uniform(19.0, 19.8)
        sections = []
        for t in (0.0, 0.2, 0.42, 0.64, 0.84, 1.0):
            r = 12.0 + (reach - 12.0) * t
            h = 0.3 + 19.0 * (1 - t) ** 1.6
            w = 0.6 + 3.0 * (1 - t) ** 1.1
            c = out * r + across * (bend * math.sin(t * math.pi))
            sec = []
            for px, py in ((-w, 0.0), (-0.6 * w, 0.55 * h), (0.0, h), (0.6 * w, 0.55 * h), (w, 0.0)):
                p = c + across * px
                sec.append((p.x, py, p.z))
            sections.append(sec)

        def root_colour(c, nm, i):
            if nm.y > 0.35 and math.hypot(c.x, c.z) > 17.0:
                return 3
            return 0 if nm.y > -0.2 else 1

        loft_rings(parts, f"root-{kk}", sections, [bark, dark, light, moss], root_colour)

    # Four short limbs at the top, into the canopy.
    for kk in range(4):
        a = TAU * kk / 4 + 0.35
        d = Vector((math.cos(a), 0, math.sin(a)))
        path = [tuple(d * 3.0 + Vector((0, 80.0, 0))), tuple(d * 7.0 + Vector((0, 85.5, 0))), tuple(d * 10.6 + Vector((0, 88.4, 0)))]
        tube(parts, f"limb-{kk}", path, [3.4, 2.7, 1.5], bark, sides=7)

    # Shelf fungi: a big and a small shelf together, beige on top, cream underneath.
    for f, (th, y, size) in enumerate(((0.5, 7.5, 1.0), (2.9, 16.0, 0.8), (4.6, 31.0, 1.1), (1.6, 46.0, 0.9), (3.6, 63.0, 1.0),
                                       (5.6, 75.0, 0.8))):
        for tier, (dy, dth, sc) in enumerate(((0.0, 0.0, 1.0), (-1.1, 0.09, 0.62))):
            shelf(parts, f"shelf-{f}-{tier}", th + dth, y + dy * 2.6, 5.2 * size * sc, 3.2 * size * sc, rng)

    # The knothole, between two ridges.
    th = TAU * 0.5 / TRUNK_RIDGES + trunk_twist(24)
    r = trunk_base(24) - 0.35 - 0.2
    nrm = Vector((math.cos(th), 0, math.sin(th)))
    center = nrm * (r + 0.15) + Vector((0, 24, 0))
    side = Vector((-math.sin(th), 0, math.cos(th)))
    loop = []
    for i in range(13):
        a = TAU * i / 12
        loop.append(tuple(center + side * (math.cos(a) * 2.2) + Vector((0, math.sin(a) * 3.0, 0)) + nrm * 0.2))
    tube(parts, "knot-rim", loop, [0.75] * len(loop), light, sides=5)
    oval(parts, "knot-hollow", center, nrm, (0, 1, 0), 4.0, 5.6, mat("Hollow", HOLLOW, 0.95), segments=12, lift=0.1)
    return parts, 3000


def shelf(parts, name, th, y, width, depth, rng):
    """A shelf fungus on the trunk at angle th: a half-round slab, rounded on top, cream underneath."""
    top, under = mat("Fungus", CAP, 0.8), mat("Fungus under", STEM, 0.8)
    out = Vector((math.cos(th), 0, math.sin(th)))
    side = Vector((-math.sin(th), 0, math.cos(th)))
    r0 = trunk_surface(th, y) - 0.6
    outline = []
    for i in range(9):
        a = math.pi * i / 8
        outline.append((math.cos(a) * width / 2, math.sin(a) * depth))
    outline.append((-width * 0.4, -0.8))
    outline.append((width * 0.4, -0.8))
    rings = []
    for dy, inset in ((-0.55, 0.25), (0.1, 0.0), (0.62, 0.7)):
        ring = []
        for u, v in outline:
            vv = v - inset if v > 0 else v
            uu = u * (1 - inset / max(width, 0.1))
            p = out * (r0 + 0.6 + vv) + side * uu
            ring.append((p.x, y + dy, p.z))
        rings.append(ring)
    loft_rings(parts, name, rings, [top, under], lambda c, nm, i: 1 if nm.y < -0.4 else 0)


# ---------------------------------------------------------------- canopy

def canopy():
    """A clump of leaves 30 x 24 x 30: round lobes fused into one soft crown (painted and baked, so the colours keep
    clean round edges): the top lobes light green, the middle ones leaf green, some lower ones and the whole underside
    dark (it is mostly seen from below, from the branches), with light leaf marks scattered over the lit side."""
    rng = random.Random(31)
    blobs = [(0.0, 12.0, 0.0, 10.5, 8.5, 10.5, LEAF), (0.0, 5.5, 0.0, 7.5, 5.0, 7.5, LEAF_DARK)]
    for i in range(7):
        a = TAU * i / 7 + rng.uniform(-0.15, 0.15)
        r = rng.uniform(5.2, 6.4)
        blobs.append((math.cos(a) * 9.4, rng.uniform(7.0, 9.0), math.sin(a) * 9.4, r, r * 0.85, r, LEAF_DARK if i % 3 == 0 else LEAF))
    for i in range(6):
        a = TAU * (i + 0.5) / 6 + rng.uniform(-0.2, 0.2)
        r = rng.uniform(5.0, 6.0)
        blobs.append((math.cos(a) * 7.8, rng.uniform(13.0, 15.5), math.sin(a) * 7.8, r, r * 0.9, r, LEAF_LIGHT if i % 2 else LEAF))
    for i in range(3):
        a = TAU * i / 3 + 0.4
        r = rng.uniform(5.0, 5.8)
        blobs.append((math.cos(a) * 3.6, 18.5, math.sin(a) * 3.6, r, r * 0.9, r, LEAF_LIGHT))
    for i in range(9):
        a = TAU * (i + 0.3) / 9 + rng.uniform(-0.1, 0.1)
        r = rng.uniform(3.2, 4.0)
        blobs.append((math.cos(a) * 12.6, rng.uniform(10.0, 12.5), math.sin(a) * 12.6, r, r * 0.85, r, LEAF if i % 2 else LEAF_LIGHT))
    marks = leaf_marks(blobs, 56, rng)
    clay: list = []
    base = mat("Clay", "#CCCCCC")
    for i, (x, y, z, rx, ry, rz, tone) in enumerate(blobs):
        made: list = []
        k.add_ellipsoid(made, f"lobe-{i}", (2 * rx, 2 * ry, 2 * rz), (x, y, z), base, segments=24, rings=12)
        clay.append((made[0], lobe_paint(blobs[i], marks)))
    crown = k.painted_clay(clay, "canopy", voxel=0.4, budget=1990, texture=512, ground=False, smooth=4)
    fit(crown, (30.0, 24.0, 30.0))
    return [crown], 2000


def lobe_paint(lobe, marks):
    """A lobe's colour: its tone, one step darker on its lower part (each clump shades its own underside), the dark of
    the crown's underside, and lighter leaf marks."""
    x, y, z, rx, ry, rz, tone = lobe
    darker = {LEAF_DARK: LEAF_DARK, LEAF: LEAF_DARK, LEAF_LIGHT: LEAF}[tone]
    lighter = {LEAF_DARK: LEAF, LEAF: LEAF_LIGHT, LEAF_LIGHT: "#9AD477"}[tone]

    def paint(p, n):
        if n.y < -0.55 and p.y < 7.0:
            return LEAF_DARK
        if (p.y - y) / ry < -0.3 + 0.12 * math.sin(p.x * 0.9 + p.z * 0.7):
            return darker
        for c, u, v in marks:
            d = p - c
            a, b = d.dot(u), d.dot(v)
            if abs(d.dot(u.cross(v))) < 1.2 and abs(a) < 1.9 and abs(b) < 0.95 * (1 - (a / 1.9) ** 2):
                return lighter
        return tone
    return paint


def leaf_marks(blobs, count, rng):
    """Almond-shaped leaf marks on the lobes' upper surfaces: (centre, along, across) in glTF metres."""
    marks = []
    while len(marks) < count:
        x, y, z, rx, ry, rz, _ = rng.choice(blobs[2:])
        a, e = rng.uniform(0, TAU), rng.uniform(0.0, 1.2)
        nrm = Vector((math.cos(a) * math.cos(e), math.sin(e), math.sin(a) * math.cos(e)))
        c = Vector((x + nrm.x * rx, y + nrm.y * ry, z + nrm.z * rz))
        side, up = frame_of(nrm)
        turn = rng.uniform(-0.9, 0.9) + math.pi  # drooping, tip down
        along = (up * math.cos(turn) + side * math.sin(turn)).normalized()
        marks.append((c, along, nrm.cross(along).normalized()))
    return marks


def fit(obj, size):
    """Scale `obj` to exactly size (w, h, d), bottom centre at the origin."""
    w, h, d = size
    _, lo, hi = k.model_metrics(obj)
    obj.scale = (w / (hi[0] - lo[0]), d / (hi[2] - lo[2]), h / (hi[1] - lo[1]))
    k.active(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    k.normalize(obj, None)


# ---------------------------------------------------------------- branches

def log_section(r, wobble, rng, sides=12, grain=0.07):
    """Cross-section (x, y) of a log of radius r whose top facet lies at y = 0: twelve facets, the grain's ridges
    alternating in and out (the two top corners stay exact so the track's bed stays flat)."""
    pts = []
    top = r * math.cos(math.pi / sides)
    for i in range(sides):
        a = math.pi / 2 + math.pi / sides + TAU * i / sides
        exact = i in (0, sides - 1)
        rr = r if exact else r * (1 + grain * (1 if i % 2 else -1) + (rng.uniform(-wobble, wobble) if wobble else 0.0))
        pts.append((math.cos(a) * rr, math.sin(a) * rr - top))
    return pts


def branch_log():
    """The branch under the rail: 40 m long, 3.8 m thick at its foot (-Z) narrowing to 2.4 at its tip (+Z), its top
    facet flat at y = 0 all along for the track. Faceted bark in long strips of three browns with ridges of grain, moss
    on its upper flanks here and there, a collar at the foot (the knot where it joins the log before it: logs are laid
    end to end, and the collar hides the step), two cut-off twig stubs, and three sprigs of leaves on its sides, low
    enough to stay clear of the train."""
    bark, dark, light = mat("Bark", BARK, 0.9), mat("Bark dark", BARK_DARK, 0.9), mat("Bark light", BARK_LIGHT, 0.9)
    moss = mat("Moss", LEAF, 0.9)
    leaf, leaf_light = mat("Leaf", LEAF, 0.8), mat("Leaf light", LEAF_LIGHT, 0.8)
    rng = random.Random(41)
    parts: list = []
    rings = []
    stations = [(-20.0, 1.9, 0.0), (-19.0, 1.9, 0.0), (-18.2, 1.72, 0.03), (-8.0, 1.58, 0.04), (3.0, 1.44, 0.04), (12.5, 1.32, 0.04),
                (19.3, 1.2, 0.0), (20.0, 0.75, 0.0)]
    for z, r, wobble in stations:
        bow = 0.3 * math.sin(math.pi * (z + 20.0) / 40.0) ** 2  # a gentle bend, straight at both ends
        rings.append([(x + bow, y, z) for x, y in log_section(r, wobble, rng, sides=14, grain=0.09)])
    strip_tone = [0, 2, 0, 1, 0, 2, 1, 0, 2, 0, 1, 2, 0, 1]

    def colour(c, nm, i):
        if abs(nm.z) > 0.9:
            return 1  # the ends
        if c.z < -18.9:
            return 2  # the collar, a lighter ring of bark
        strip = round((math.atan2(c.y + 1.7, c.x) - math.pi / 2 - math.pi / 14) / (TAU / 14)) % 14
        return strip_tone[strip]

    loft_rings(parts, "log", rings, [bark, dark, light], colour)
    # Cushions of moss on the upper flanks, clear of the track's bed (|x| > 0.9).
    for j, (side, z, size) in enumerate(((1, -15.5, 1.0), (-1, 7.5, 1.0))):
        r = 1.72 - 0.0125 * (z + 18)
        a = math.radians(48)
        c = (side * math.sin(a) * r, -r + math.cos(a) * r - 0.05, z)
        cushion = k.add_ellipsoid(parts, f"moss-{j}", (1.5 * size, 0.6 * size, 3.6 * size), c, moss, segments=6, rings=3)
        cushion.rotation_euler[1] = side * a  # lie along the flank (Blender Y is the log's axis)
        k.set_smooth(cushion, True)
    # Two cut-off twig stubs.
    for j, (path, end_n) in enumerate((([(-1.2, -1.5, -6.0), (-2.05, -1.15, -6.5)], (-1, 0.4, -0.55)),
                                       ([(1.0, -2.2, 9.5), (1.75, -2.5, 10.1)], (1, -0.35, 0.75)))):
        tube(parts, f"stub-{j}", path, [0.4, 0.32], dark, sides=6)
        oval(parts, f"stub-end-{j}", path[1], end_n, (0, 1, 0), 0.52, 0.52, light, segments=6, lift=0.01)
    # Sprigs of leaves: a twig out of the side with three leaves, kept below the top (y < 0.25).
    for j, (side, z) in enumerate(((1, -12.0), (-1, 4.0), (1, 15.0))):
        r = 1.72 - 0.0125 * (z + 18)
        root = Vector((side * (r - 0.3), -r * 0.8, z))
        tip = root + Vector((side * 1.3, 0.45, 0.4))
        tube(parts, f"twig-{j}", [tuple(root), tuple(tip)], [0.14, 0.07], dark, sides=5)
        for q, (dx, dy, dz, length) in enumerate(((1.0, 0.3, 0.25, 2.1), (0.55, -0.1, 1.0, 1.8), (0.6, 0.1, -0.95, 1.9))):
            leaf_blade(parts, f"sprig-{j}-{q}", tuple(tip), (side * dx, dy, dz), length, 0.62, leaf_light if q % 2 else leaf, leaf,
                       droop=0.32, thick=0.06, sections=2)
    return parts, 800


# ---------------------------------------------------------------- the upside-down bough and its rounded end

SLAB_THICK = 18.8
SLAB_MID = -SLAB_THICK / 2
# The bark's side, top to bottom (x, y): ridges of grain along the bough, proud and recessed in turn.
BARK_SIDE = [(12.3, -0.45), (13.7, -1.6), (14.45, -3.5), (15.0, -5.7), (14.6, -7.7), (15.0, -9.4)]
BARK_TONES = [2, 0, 1, 0, 2]  # per band of the side, top to the middle (mirrored below)


def bark_half_profile():
    """The upper half of the bark's cross-section as (x, height above the middle): the right side from the middle up,
    across under the moss, the left side down to the middle."""
    right = [(x, y - SLAB_MID) for x, y in reversed(BARK_SIDE)]
    return right + [(-x, d) for x, d in reversed(right)]


def moss_section(drip_r, drip_l):
    """Cross-section (x, depth below the moss face) of a moss layer: flat face, rounded lip, drips, tucked under."""
    def side(sign, d):
        return [(sign * 12.1, 0.0), (sign * 12.75, -0.16), (sign * 13.1, -0.6 - d), (sign * 12.35, -0.86 - 0.5 * d)]
    return side(1, drip_r) + side(-1, drip_l)[::-1]


def bark_tone(c, nm):
    """Material index of a bark face: bands of three browns by height (mirrored about the middle)."""
    depth = SLAB_THICK / 2 - abs(c.y - SLAB_MID)  # below the nearer face
    for b in range(len(BARK_SIDE) - 1):
        if -BARK_SIDE[b][1] - 0.05 <= depth <= -BARK_SIDE[b + 1][1] + 0.05:
            return BARK_TONES[b]
    return 0


def bough_materials(under_glow=0.32):
    return {
        "bark": [mat("Bark", BARK, 0.9), mat("Bark dark", BARK_DARK, 0.9), mat("Bark light", BARK_LIGHT, 0.9)],
        "moss": mat("Moss", LEAF, 0.9),
        "moss under": mat("Moss under", LEAF, 0.9, under_glow),
    }


def bough_slab():
    """The flat upside-down bough (1-3's island-flip in the forest): 30 m wide, 18.8 thick, 40 long. A carpet of moss
    on top (y = 0) and underneath (y = -18.8, glowing a little, as 1-3's underside grass does, so it stays bright lit
    only from below), its lip rounded with drips hanging over; between them the bark bulges out in ridges of grain
    along the bough, in three browns; |x| < 12 stays flat for the rails."""
    m = bough_materials()
    parts: list = []
    rng = random.Random(51)
    columns = 4
    rings = []
    for c in range(columns + 1):
        z = -20 + 40 * c / columns
        inner = 0 < c < columns
        ring = []
        for x, y in BARK_SIDE + [(x, SLAB_MID * 2 - y) for x, y in reversed(BARK_SIDE[:-1])]:
            dx = rng.uniform(-0.18, 0.12) if inner and abs(y - SLAB_MID) < 8.5 else 0.0
            ring.append((x + dx, y, z))
        left = [(-x, y, z) for x, y, z in reversed(ring)]
        rings.append(ring + left)
    loft_rings(parts, "bark", rings, m["bark"], lambda c, nm, i: 1 if abs(nm.z) > 0.9 else bark_tone(c, nm))
    for face, glow in (("top", False), ("under", True)):
        drips_r, drips_l = s.strip_drips(8, 61 if glow else 63, 1.1), s.strip_drips(8, 62 if glow else 64, 1.1)
        rings = []
        for c in range(9):
            z = -20 + 40 * c / 8
            rings.append([(x, (-SLAB_THICK - y) if glow else y, z) for x, y in moss_section(drips_r[c], drips_l[c])])
        loft_rings(parts, f"moss-{face}", rings, [m["moss under" if glow else "moss"]], None, lambda c, nm: abs(nm.y) < 0.97)
    return parts, 600


def cap_point(x, d, phi):
    """A point d above the bough's middle line at angle phi around the cap (0 = top, pi = underneath), out to +Z."""
    return (x, SLAB_MID + d * math.cos(phi), d * math.sin(phi))


def bough_slab_cap():
    """The bough's rounded end (half round, radius 9.4 about y = -9.4, z = 0, out toward +Z): the moss carpet goes on
    round it from the top to the underside (glowing on the lower half), the bark's ridged sides swept round with it,
    so the end reads as the bough's own rounded tip. Origin at the top of the end it closes."""
    m = bough_materials()
    parts: list = []
    steps = 10
    profile = bark_half_profile()
    rings = [[cap_point(x, d, math.pi * st / steps) for x, d in profile] for st in range(steps + 1)]

    def bark_idx(c, nm, i):
        if abs(nm.z) > 0.97 and abs(c.z) < 0.05:
            return 1
        rho = math.hypot(c.y - SLAB_MID, c.z)
        y_equiv = SLAB_MID + rho
        return bark_tone(Vector((c.x, y_equiv, 0.0)), nm)

    # The swept bark is open along the cut (z = 0): one closed part with the whole cross-section as its flat side, the
    # points on the axis welded.
    n, last = len(profile), steps * len(profile)
    verts = [p for r in rings for p in r]
    faces = []
    for r in range(steps):
        faces += ring_faces(r * n, (r + 1) * n, n)[:-1]  # the profile is open: no quad back from its end to its start
    faces.append(tuple(range(n)) + tuple(range(last + n - 1, last - 1, -1)))
    obj = k.add_mesh(parts, "bark", verts, faces, m["bark"])
    weld(obj)
    for poly in obj.data.polygons:
        poly.material_index = bark_idx(k.gltf(poly.center), k.gltf(poly.normal), 0)
        poly.use_smooth = False
    drips_r, drips_l = s.strip_drips(steps, 71, 1.0), s.strip_drips(steps, 72, 1.0)
    rings = []
    for st in range(steps + 1):
        phi = math.pi * st / steps
        rings.append([cap_point(x, 9.4 + depth, phi) for x, depth in moss_section(drips_r[st], drips_l[st])])
    loft_rings(parts, "moss", rings, [m["moss"], m["moss under"]], lambda c, nm, i: 1 if c.y < SLAB_MID - 2.0 else 0,
               lambda c, nm: abs(nm.x) < 0.97)
    return parts, 600


# ---------------------------------------------------------------- the big leaf

LEAF_STATIONS = [(0.0, 1.3), (0.06, 3.2), (0.15, 4.35), (0.28, 4.92), (0.42, 5.0), (0.56, 4.72), (0.7, 3.95), (0.82, 2.85),
                 (0.92, 1.55), (1.0, 0.03)]
LEAF_ACROSS = [-1.0, -0.62, -0.22, 0.22, 0.62, 1.0]


def leaf_surface(t, v):
    """A point on the big leaf's top face: t along it (0 at the stalk, -X; 1 at the tip, +X), v across (-1..1).
    A shallow dish: 1.04 m up along the midrib, rising to 1.38 at the rim; the tip and the base curl up a little."""
    w = next(w0 + (w1 - w0) * (t - t0) / (t1 - t0) for (t0, w0), (t1, w1) in zip(LEAF_STATIONS, LEAF_STATIONS[1:]) if t0 <= t <= t1)
    w *= 1 + 0.035 * math.sin(t * math.pi * 7)
    y = 1.04 + 0.34 * v * v + 0.12 * max(0.0, (t - 0.8) / 0.2) ** 2 + 0.06 * max(0.0, (0.12 - t) / 0.12)
    return (-8.0 + 16.0 * t, min(y, 1.4), v * w)


def leaf_pad():
    """The big leaf that catches a falling train (2-2 makes floors, a roof and lily pads of it): 16 x 10 m, a shallow
    dish of light green (1.04 m up along the middle, the rim at 1.38), a pale midrib along it whose top is at 1.2 and
    pale side veins, the underside leaf green with the midrib's keel, and the stalk curling down to the ground at its
    foot (-X). Long axis along X; the tip at +X."""
    top, under = mat("Leaf light", LEAF_LIGHT, 0.75), mat("Leaf", LEAF, 0.8)
    vein, stalk = mat("Vein", VEIN, 0.7), mat("Leaf stalk", LEAF_DARK, 0.8)
    parts: list = []
    nt, nv = len(LEAF_STATIONS), len(LEAF_ACROSS)
    verts, faces, mats = [], [], []
    for face, (dy, edge) in enumerate(((0.0, 0.0), (-0.13, 0.07))):
        for t, _ in LEAF_STATIONS:
            for v in LEAF_ACROSS:
                x, y, z = leaf_surface(t, v)
                verts.append((x, y + dy + edge * v * v, z))
    off = nt * nv
    for i in range(nt - 1):
        for j in range(nv - 1):
            a, b = i * nv + j, (i + 1) * nv + j
            faces.append((a, a + 1, b + 1, b))
            mats.append(0)
            faces.append((off + a, off + b, off + b + 1, off + a + 1))
            mats.append(1)
    # The rim: both long edges, the base edge and the tip.
    for i in range(nt - 1):
        for j in (0, nv - 1):
            a, b = i * nv + j, (i + 1) * nv + j
            faces.append((a, b, off + b, off + a))
            mats.append(1)
    for j in range(nv - 1):
        for i in (0, nt - 1):
            a = i * nv + j
            faces.append((a, a + 1, off + a + 1, off + a))
            mats.append(1)
    blade = k.add_mesh(parts, "blade", verts, faces, [top, under], mats, smooth=True)
    fix_normals(blade)
    # Midrib (its top at 1.2, a keel under the blade) and the stalk curling down to the ground.
    rib = [(leaf_surface(t, 0.0)[0], 1.04 + 0.12 * max(0.0, (t - 0.8) / 0.2) ** 2 + 0.06 * max(0.0, (0.12 - t) / 0.12) - 0.04, 0.0)
           for t in (0.0, 0.12, 0.3, 0.5, 0.7, 0.85, 0.95)]
    radii = [0.2, 0.19, 0.17, 0.14, 0.1, 0.07, 0.04]
    tube(parts, "midrib", rib, radii, vein, sides=5, smooth=True)
    tube(parts, "stalk", [(-7.6, 0.98, 0.0), (-7.92, 0.6, 0.0), (-7.75, 0.26, 0.05), (-7.3, 0.17, 0.1)], [0.2, 0.19, 0.18, 0.17], stalk,
         sides=6, smooth=True)
    # Side veins on the top face, from the midrib out toward the rim, curving toward the tip.
    for i, t0 in enumerate((0.16, 0.32, 0.48, 0.64, 0.78)):
        for side in (-1, 1):
            pts = []
            for f in (0.0, 0.35, 0.7, 0.92):
                t = min(0.97, t0 + 0.13 * f)
                x, y, z = leaf_surface(t, side * f)
                pts.append((x, y + 0.025, z))
            surface_ribbon(parts, f"vein-{i}-{side}", pts, 0.16 * (1 - 0.15 * i / 4), vein)
    return parts, 500


def surface_ribbon(parts, name, pts, width, m):
    """A flat strip along points lying on a surface that faces up, tapering to its end."""
    verts = []
    for i, p in enumerate(pts):
        a, b = Vector(pts[max(i - 1, 0)]), Vector(pts[min(i + 1, len(pts) - 1)])
        along = (b - a).normalized()
        across = along.cross(Vector((0, 1, 0))).normalized()
        half = width / 2 * (1 - 0.7 * i / (len(pts) - 1))
        verts += [tuple(Vector(p) + across * half), tuple(Vector(p) - across * half)]
    faces = [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(len(pts) - 1)]
    obj = k.add_mesh(parts, name, verts, faces, [m], smooth=True)
    if k.gltf(obj.data.polygons[0].normal).y < 0:
        obj.data.flip_normals()
    return obj


# ---------------------------------------------------------------- forest floor

def mushroom_body(parts, name, x, z, height, radius, seed, segments=12, small=False):
    """One mushroom at (x, z): a cream stem a little wider at its foot, a beige dome cap with a thick rounded rim and a
    darker crown, pale gills underneath."""
    cap, crown, gills = mat("Mushroom cap", CAP, 0.7), mat("Mushroom crown", CAP_DARK, 0.7), mat("Mushroom gills", "#EAD7B7", 0.8)
    stem_m = mat("Mushroom stem", STEM, 0.75)
    rng = random.Random(seed)
    h, r = height, radius
    lean = rng.uniform(-0.04, 0.04) * h
    stem = [(0.0, 0.42 * r, 0.42 * r, x, z), (0.4 * h, 0.33 * r, 0.33 * r, x + lean * 0.4, z), (0.7 * h, 0.31 * r, 0.31 * r, x + lean, z)]
    if small:
        stem = [stem[0], stem[2]]
    obj = k.add_profiled_volume(parts, f"{name}-stem", stem, stem_m, segments=segments - 4)
    fix_normals(obj)
    cx = x + lean
    profile = [(0.66 * h, 0.3), (0.56 * h, 0.9), (0.62 * h, 1.0), (0.74 * h, 1.0), (0.88 * h, 0.8), (0.98 * h, 0.45), (1.0 * h, 0.1)]
    if small:
        profile = [profile[0], profile[1], profile[3], profile[5], profile[6]]
    rings = [(y, f * r, f * r, cx, z) for y, f in profile]
    capo = k.add_profiled_volume(parts, f"{name}-cap", rings, cap, segments=segments)
    fix_normals(capo)
    capo.data.materials.append(crown)
    capo.data.materials.append(gills)
    for poly in capo.data.polygons:
        c, nm = k.gltf(poly.center), k.gltf(poly.normal)
        poly.material_index = 2 if nm.y < -0.3 else (1 if c.y > 0.975 * h else 0)


def mushroom():
    """A mushroom of the forest floor, 2 x 1.6 x 2: a big one (beige cap, cream stem; no red with white spots) with a
    little one at its foot and two tufts of grass."""
    parts: list = []
    mushroom_body(parts, "big", 0.0, 0.0, 1.6, 1.0, 3)
    mushroom_body(parts, "small", 0.62, 0.5, 0.62, 0.36, 5, segments=8, small=True)
    grass = mat("Grass", LEAF, 0.85)
    s.tuft(parts, "tuft-0", (-0.55, 0.06, 0.35), 0.42, 4, 7, grass, spread=0.16)
    s.tuft(parts, "tuft-1", (0.35, 0.06, -0.6), 0.36, 4, 9, grass, spread=0.14)
    return parts, 400


# ---------------------------------------------------------------- acorns

def acorn_parts(parts, size, segments, body_m, cap_m, stem_m, shine_m):
    """An acorn standing on its round foot (a little nub at the bottom), its cap with a thick rim and rows of scales
    (ridges in two browns), a short curved stem on top (the top at 2 m x size) and a soft shine on the nut.
    Size 1 = 1.5 x 2 x 1.5."""
    sz = size
    body = [(0.0, 0.07), (0.07, 0.26), (0.22, 0.5), (0.46, 0.69), (0.76, 0.75), (1.04, 0.73), (1.3, 0.64)]
    nut = k.add_profiled_volume(parts, "nut", [(y * sz, r * sz, r * sz, 0.0, 0.0) for y, r in body], body_m, segments=segments)
    fix_normals(nut)
    cap = [(1.12, 0.6), (1.19, 0.77), (1.3, 0.765), (1.36, 0.71), (1.43, 0.7), (1.5, 0.63), (1.56, 0.6), (1.62, 0.47), (1.68, 0.22)]
    capo = k.add_profiled_volume(parts, "cap", [(y * sz, r * sz, r * sz, 0.0, 0.0) for y, r in cap], cap_m, segments=segments,
                                 smooth=False)
    fix_normals(capo)
    capo.data.materials.append(mat("Acorn cap light", "#93693F", 0.85))
    for poly in capo.data.polygons:
        c, nm = k.gltf(poly.center), k.gltf(poly.normal)
        row = sum(1 for y, _ in cap if y * sz < c.y)
        poly.material_index = 1 if (nm.y < 0.95 and row in (2, 4, 6)) else 0
    tube(parts, "stem", [(0.0, 1.66 * sz, 0.0), (0.03 * sz, 1.85 * sz, 0.02 * sz), (0.1 * sz, 1.96 * sz, 0.05 * sz)],
         [0.075 * sz, 0.065 * sz, 0.055 * sz], stem_m, sides=6)
    # The shine: a soft upright oval pressed onto the nut's shoulder, well to the side of its front.
    nrm = Vector((0.8, 0.12, 0.58)).normalized()
    centre = Vector((0.0, 0.8 * sz, 0.0)) + nrm * (0.75 * sz)
    spot = oval(parts, "shine", tuple(centre), tuple(nrm), (0, 1, 0), 0.16 * sz, 0.42 * sz, shine_m, segments=10)
    k.apply_modifier(spot, "SHRINKWRAP", target=nut, wrap_method="NEAREST_SURFACEPOINT", offset=0.012 * sz)
    return nut


def acorn():
    """The nut that rolls down the branch toward the train (and that the squirrel holds): 1.5 x 2 x 1.5."""
    parts: list = []
    acorn_parts(parts, 1.0, 14, mat("Acorn", ACORN, 0.5), mat("Acorn cap", ACORN_CAP, 0.85), mat("Acorn stem", BARK_DARK, 0.8),
                mat("Acorn shine", "#E9C48E", 0.4))
    return parts, 500


def acorn_big():
    """Record "おおきな どんぐり", found shining in the shade of the leaves by the light: the acorn at 1.8 times (2.7 x
    3.6 x 2.7), glossier and warmer and glowing a little, with a little leaf on its stem."""
    parts: list = []
    acorn_parts(parts, 1.8, 16, mat("Big acorn", "#C4893F", 0.32, 0.12), mat("Acorn cap", ACORN_CAP, 0.85), mat("Acorn stem", BARK_DARK, 0.8),
                mat("Big acorn shine", "#F4D7A6", 0.3, 0.25))
    leaf_blade(parts, "leaf", (0.12, 3.42, 0.06), (1.0, 0.18, 0.35), 1.15, 0.36, mat("Leaf light", LEAF_LIGHT, 0.75), mat("Leaf", LEAF, 0.8),
               droop=0.25, thick=0.04, sections=4)
    return parts, 600


# ---------------------------------------------------------------- the squirrel

FUR_TIP = "#F6E2C2"
EYE = "#2B2A33"


def squirrel_paint(region):
    """Paint rules: the belly cream, the tail's tip pale, the rest red-brown fur (the snout is painted cream whole, so
    no line across the face reads as a mouth)."""
    def body(p, n):
        return FUR_LIGHT if (n.z > 0.3 and abs(p.x) < 0.2 and 0.28 < p.y < 0.96) else FUR

    def head(p, n):
        return FUR

    def tail(p, n):
        return FUR_TIP if p.y > 1.18 and p.z > -0.42 else FUR

    return {"body": body, "head": head, "tail": tail}[region]


def squirrel():
    """A squirrel sitting up, 0.9 x 1.5 x 1.4, facing +Z: a round body with a cream belly, round head and ears, big
    hind feet, the front paws held up together in front of the chest (ready to hold a nut), and a big bushy tail curling
    up behind it with a pale tip. A round, made-up squirrel: only two eyes on its face (no nose, mouth or teeth), not
    like any known character. Origin under the body (the tail reaches back behind it)."""
    clay = []
    base = mat("Clay", "#CCCCCC")

    def add(paint, fn, *args, **kwargs):
        made: list = []
        fn(made, *args, **kwargs)
        clay.extend((o, paint) for o in made)

    E, T = k.add_ellipsoid, k.add_swept_tube
    body, head, tail = squirrel_paint("body"), squirrel_paint("head"), squirrel_paint("tail")
    add(body, E, "hips", (0.84, 0.5, 0.66), (0.0, 0.27, -0.06), base, 24, 12)
    add(body, E, "chest", (0.56, 0.7, 0.5), (0.0, 0.63, 0.02), base, 24, 12)
    add(head, E, "head", (0.5, 0.44, 0.46), (0.0, 1.07, 0.07), base, 24, 12)
    add(FUR_LIGHT, E, "snout", (0.26, 0.2, 0.22), (0.0, 1.01, 0.26), base, 16, 8)
    for side in (-1, 1):
        ear = k.add_ellipsoid([], f"ear-{side}", (0.12, 0.24, 0.07), (side * 0.13, 1.31, 0.02), base, 12, 6)
        ear.rotation_euler = (0.0, side * -0.32, 0.0)
        clay.append((ear, FUR))
        add(body, T, f"arm-{side}", [(side * 0.2, 0.8, 0.08), (side * 0.17, 0.68, 0.22), (side * 0.1, 0.62, 0.28)],
            [0.075, 0.065, 0.06], [base] * 2, 10)
        add(FUR, E, f"paw-{side}", (0.12, 0.1, 0.12), (side * 0.085, 0.63, 0.3), base, 10, 5)
        add(body, E, f"thigh-{side}", (0.26, 0.3, 0.38), (side * 0.29, 0.2, 0.04), base, 14, 7)
        add(FUR, E, f"foot-{side}", (0.17, 0.1, 0.34), (side * 0.24, 0.05, 0.16), base, 12, 6)
    path = [(0.0, 0.2, -0.34), (0.0, 0.32, -0.62), (0.0, 0.62, -0.78), (0.0, 0.96, -0.74), (0.0, 1.2, -0.56), (0.0, 1.3, -0.33),
            (0.0, 1.26, -0.14)]
    add(tail, T, "tail", path, [0.12, 0.2, 0.25, 0.25, 0.23, 0.18, 0.12], [base] * (len(path) - 1), 16)
    add(tail, E, "tail-tip", (0.24, 0.24, 0.24), path[-1], base, 12, 6)
    fur = k.painted_clay(clay, "squirrel", voxel=0.014, budget=1380, texture=512, ground=True, smooth=4)
    decals = squirrel_eyes(fur)
    return [fur, *decals], 1500


def squirrel_eyes(fur):
    ink, shine = mat("Squirrel eye", EYE, 0.35), mat("Squirrel eye shine", "#FFFFFF", 0.3)
    decals: list = []
    for i, x in enumerate((-0.105, 0.105)):
        k.wrap_onto(k.disc_decal(decals, f"eye-{i}", (x, 1.1, 0.6), (0.075, 0.095), ink, 1, 12), fur, 0.004)
        k.wrap_onto(k.disc_decal(decals, f"shine-{i}", (x + 0.015, 1.12, 0.6), (0.026, 0.026), shine, 1, 8), fur, 0.008)
    return decals


# ---------------------------------------------------------------- records

TWIG = "#8A6440"
TWIG_LIGHT = "#A8814F"
DRY_LEAF = "#C39A5A"


def on_ellipsoid(centre, radii, direction, out=0.0):
    """The point of the ellipsoid (centre, radii) in `direction`, pushed `out` m further along it."""
    d = Vector(direction).normalized()
    f = 1.0 / math.sqrt(sum((d[i] / radii[i]) ** 2 for i in range(3)))
    return Vector(centre) + d * (f + out)


def squirrel_nest():
    """Record "リスの すあな": the squirrel's drey in the fork of a branch, a ball of twigs (a dark woven ball with lighter
    twigs wound round it, sticks poking out, green and dry leaves stuck in) with a round dark doorway lined with soft
    cream fluff, facing between the front (+Z) and the rail side (+X). The fork's foot is the origin."""
    bark, dark = mat("Bark", BARK, 0.9), mat("Bark dark", BARK_DARK, 0.9)
    ball_m = mat("Drey", "#6E5238", 0.95)
    twig, twig_light = mat("Twig", TWIG, 0.9), mat("Twig light", TWIG_LIGHT, 0.9)
    fluff, hollow = mat("Fluff", FUR_LIGHT, 0.95), mat("Hollow", HOLLOW, 0.95)
    leaf_top, leaf_under, dry = mat("Leaf light", LEAF_LIGHT, 0.75), mat("Leaf", LEAF, 0.8), mat("Dry leaf", DRY_LEAF, 0.85)
    parts: list = []
    rng = random.Random(77)
    centre, radii = (0.0, 1.32, 0.05), (1.25, 0.98, 1.12)
    ball = k.add_ellipsoid(parts, "ball", tuple(2 * r for r in radii), centre, ball_m, segments=11, rings=7)
    k.set_smooth(ball, False)
    # The fork: a stem from below and two limbs round the ball.
    tube(parts, "stem", [(0.0, 0.0, -0.42), (0.0, 0.45, -0.42), (0.05, 0.8, -0.3)], [0.3, 0.27, 0.25], bark, sides=7)
    tube(parts, "limb-l", [(0.05, 0.8, -0.3), (-0.85, 1.25, -0.3), (-1.45, 1.9, -0.2), (-1.62, 2.2, -0.15)], [0.22, 0.18, 0.13, 0.1],
         bark, sides=6)
    tube(parts, "limb-r", [(0.05, 0.8, -0.3), (0.9, 1.15, -0.35), (1.42, 1.65, -0.42), (1.6, 1.95, -0.45)], [0.21, 0.17, 0.12, 0.09],
         dark, sides=6)
    # Twigs wound round the ball.
    for j, (tilt, turn, m) in enumerate(((0.35, 0.0, twig), (-0.5, 1.1, twig_light), (1.2, 2.0, twig), (0.1, 2.9, twig_light))):
        path = []
        q_tilt = Vector((math.cos(turn), 0.0, math.sin(turn)))
        for i in range(9):
            a = TAU * i / 8
            d = Vector((math.cos(a), math.sin(a) * math.cos(tilt), math.sin(a) * math.sin(tilt)))
            d = d.x * q_tilt + Vector((0, d.y, 0)) + d.z * Vector((-q_tilt.z, 0, q_tilt.x))
            path.append(tuple(on_ellipsoid(centre, radii, d, 0.04 + rng.uniform(-0.03, 0.05))))
        path[-1] = path[0]
        tube(parts, f"twig-{j}", path, [0.07] * len(path), m, sides=3)
    # Sticks poking out.
    for j in range(8):
        a, e = TAU * j / 8 + rng.uniform(-0.2, 0.2), rng.uniform(-0.3, 0.9)
        d = Vector((math.cos(a) * math.cos(e), math.sin(e), math.sin(a) * math.cos(e)))
        root = on_ellipsoid(centre, radii, d, -0.15)
        tip = on_ellipsoid(centre, radii, d + Vector((rng.uniform(-0.3, 0.3), 0.2, rng.uniform(-0.3, 0.3))), rng.uniform(0.3, 0.45))
        k.add_tapered_segment(parts, f"stick-{j}", tuple(root), tuple(tip), 0.05, 0.025, twig_light if j % 2 else twig, vertices=4,
                              smooth=False)
    # The doorway: a dark hollow in a ring of cream fluff.
    door = Vector((math.sin(math.radians(45)), 0.12, math.cos(math.radians(45)))).normalized()
    at = on_ellipsoid(centre, radii, door, 0.06)
    side = door.cross(Vector((0, 1, 0))).normalized()
    up = side.cross(door).normalized()
    ring = [tuple(at + side * (math.cos(TAU * i / 10) * 0.43) + up * (math.sin(TAU * i / 10) * 0.39) - door * 0.04) for i in range(11)]
    lumps = [0.1, 0.07, 0.11, 0.08, 0.06, 0.09, 0.13, 0.15, 0.13, 0.08, 0.1]  # fullest at the sill
    tube(parts, "fluff", ring, lumps, fluff, sides=5, smooth=True)
    oval(parts, "door", tuple(at), tuple(door), (0, 1, 0), 0.8, 0.72, hollow, segments=10, lift=0.02)
    # Leaves stuck in: green and dry.
    for j, (a, e, m) in enumerate(((2.4, 0.5, leaf_top), (4.0, 0.2, dry), (1.0, 0.75, leaf_top), (5.3, -0.2, dry))):
        d = Vector((math.cos(a) * math.cos(e), math.sin(e), math.sin(a) * math.cos(e)))
        base = on_ellipsoid(centre, radii, d, -0.05)
        leaf_blade(parts, f"leaf-{j}", tuple(base), tuple(d + Vector((0, 0.3, 0))), 0.75, 0.24, m, leaf_under if m is leaf_top else dry,
                   droop=0.3, thick=0.03, sections=3)
    return parts, 800


FEATHER_LEAN = (0.1, -0.13)  # radians about X (top toward +Z) and Z (top toward +X), as the stand-in leaned


def feather_point(t, x_off=0.0, z_off=0.0):
    """A point by the quill at t (0 = the root, 1 = the tip), leaning as the feather stands in the bark."""
    x, y, z = 0.16 * t * t + x_off, 3.22 * t, -0.07 * math.sin(math.pi * t) + z_off
    ax, az = FEATHER_LEAN
    y, z = y * math.cos(ax) - z * math.sin(ax), y * math.sin(ax) + z * math.cos(ax)
    x, y = x * math.cos(az) + y * math.sin(az), -x * math.sin(az) + y * math.cos(az)
    return (x, y, z)


def record_feather():
    """Record "こずえの はね": one big feather, 3.2 m, stuck in the bark at the treetop: a cream quill the whole length,
    bare at the foot, and two vanes either side of it (a narrow one and a wide one, each with a split in its edge),
    white with a sky-blue tip, a little cupped, glowing faintly so it stays white in the shade. No round lumps anywhere
    (they would read as eggs). Origin at the root; it leans a little, as the stand-in did."""
    white, blue = mat("Feather", "#FAFAF6", 0.6, 0.18), mat("Feather tip", "#7CC6F0", 0.55, 0.18)
    quill = mat("Quill", "#CDBF9F", 0.6)
    parts: list = []
    # Half-widths of the vanes along the quill (t, left, right); the dips are the splits in their edges.
    widths = [(0.17, 0.02, 0.02), (0.24, 0.24, 0.14), (0.34, 0.37, 0.21), (0.43, 0.4, 0.23), (0.47, 0.24, 0.23), (0.5, 0.39, 0.23),
              (0.6, 0.39, 0.22), (0.64, 0.38, 0.12), (0.67, 0.37, 0.21), (0.77, 0.32, 0.185), (0.86, 0.26, 0.15), (0.94, 0.15, 0.08),
              (1.0, 0.015, 0.012)]
    rings = []
    for tt, wl, wr in widths:
        wl, wr = wl * 1.4, wr * 1.4
        cup = 0.05 * (wl + wr) / 0.5
        thick = 0.022
        rings.append([feather_point(tt, -wl, cup), feather_point(tt, -wl * 0.45, thick), feather_point(tt, wr * 0.45, thick),
                      feather_point(tt, wr, cup), feather_point(tt, wr * 0.45, -thick), feather_point(tt, -wl * 0.45, -thick)])
    loft_rings(parts, "vanes", rings, [white, blue], lambda c, nm, i: 1 if c.y > feather_point(0.77)[1] else 0, lambda c, nm: True)
    path = [feather_point(tt) for tt in (0.0, 0.08, 0.17, 0.4, 0.65, 0.88, 1.0)]
    tube(parts, "quill", path, [0.045, 0.042, 0.038, 0.032, 0.025, 0.017, 0.008], quill, sides=5, smooth=True)
    return parts, 400


# ---------------------------------------------------------------- export and preview

def export_glb(model, name, budget, max_kb=250, origin="floor"):
    tris, lo, hi = k.model_metrics(model)
    if tris > budget:
        raise RuntimeError(f"{name}: {tris} triangles exceeds budget {budget}")
    if origin == "floor" and abs(lo[1]) > 0.01:
        raise RuntimeError(f"{name}: lowest point y={lo[1]:.3f}, not on the floor")
    if origin == "top" and abs(hi[1]) > 2.0:
        raise RuntimeError(f"{name}: highest point y={hi[1]:.3f}")
    k.MODEL_DIR.mkdir(parents=True, exist_ok=True)
    k.active(model)
    glb = k.MODEL_DIR / f"{name}.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", export_yup=True, use_selection=True,
                              export_image_format="JPEG", export_image_quality=88)
    if glb.stat().st_size > max_kb * 1024:
        raise RuntimeError(f"{name}: GLB exceeds {max_kb} KB")
    print("MODEL_METRICS=" + json.dumps({
        "model": name, "triangles": tris, "budget": budget, "dimensions": [round(hi[i] - lo[i], 3) for i in range(3)],
        "min": [round(v, 3) for v in lo], "max": [round(v, 3) for v in hi], "materials": len(model.data.materials),
        "kb": round(glb.stat().st_size / 1024, 1),
    }, sort_keys=True))


BUILDERS = {"tree-trunk": tree_trunk, "canopy": canopy, "branch-log": branch_log, "bough-slab": bough_slab, "bough-slab-cap": bough_slab_cap, "leaf-pad": leaf_pad, "mushroom": mushroom, "acorn": acorn, "acorn-big": acorn_big, "squirrel": squirrel, "squirrel-nest": squirrel_nest, "record-feather": record_feather}
# Camera directions (Blender axes: -Y is the model's front, +Z up).
VIEWS = {"tree-trunk": (0.55, -0.72, 0.25), "canopy": (0.55, -0.72, 0.1), "bough-slab": (0.62, -0.62, -0.38),
         "bough-slab-cap": (0.8, -0.55, 0.25), "leaf-pad": (0.45, -0.6, 0.65),
         "record-feather": (0.2, -0.9, 0.25)}
TALL = {"tree-trunk", "acorn", "acorn-big", "squirrel", "record-feather"}
ORIGIN = {"branch-log": "top", "bough-slab": "top", "bough-slab-cap": "top"}
KB = {"squirrel": 350}
UNDER_BODY = {"squirrel", "record-feather"}  # set on the floor, the origin kept under the body

if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if a in BUILDERS] or list(BUILDERS)
    for name in names:
        k.reset()
        built, budget = BUILDERS[name]()
        model = built if isinstance(built, bpy.types.Object) else k.join(built, name)
        model.name = name
        model.data.name = name
        if name in UNDER_BODY:
            k.normalize(model, None, center=False)
        export_glb(model, name, budget, KB.get(name, 250), ORIGIN.get(name, "floor"))
        s.preview(model, name, VIEWS.get(name, (0.55, -0.72, 0.42)), size=(400, 512) if name in TALL else (512, 400))
