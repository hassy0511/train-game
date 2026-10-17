"""Stage 3-1 (うみのそこ) — Claude Code. Ticket 0011 (the sea things 3-2 and 3-3 share with it too).

The crafted look (つくりこみ) of chapters 1 and 2 (sky.py, volcano.py and meadow.py, whose helpers this script uses):
flat colours, round friendly shapes. A warm shallow sea: a sand beach, a coral reef and a sandy island over a white
sea floor with kelp and pastel corals, a gentle whale, round little fish and Sakasa's pink bubbles. Nothing scary (no
shark, no wreck, no bones, no deep-sea creature); living things are round, with eyes only (no mouth, teeth or
spikes) and no markings of a real species. Underwater the game's fog turns everything blue with distance, so what
lives down there glows a little and keeps its colour on its shaded side.

Models (same names, origins and orientation as the code stand-ins they replace, so the stage JSON does not change;
+Z is forward, the model's own left is +X; origin at the bottom centre unless said otherwise; w x h x d in m):
- sandbar 52 x 16.2 x 234, reef 78 x 16.2 x 98.8, sand-island 91 x 16.2 x 299 (starfish, tufts and coral heads on top
  reach a little higher): mounds standing on the sea floor (y -14.2 in 3-1) with a flat top 16.2 m up (2 m over the
  sea) of 40 x 180, 60 x 76 and 70 x 230, their foot spreading 1.3 times. umi runs straight down their middle (+Z);
  where it climbs onto or down off a mound the top is ramped so the track stays 0.4 m clear (the rail heights are
  read from src/stages/3-1.json). The reef's top is 76 m, 1674-1750 as scripts/layout-3-1.mjs lays it out (the
  stand-in's 90 m ran 7 m into the whale's gap); it is a coral plateau with steep walls, so the spouting whale just
  past its end has room. The island's top has a band of grass 16-26 m out on either side of the track (palms stand
  on it).
- palm 5 x 9 x 5: origin at the foot of its trunk, which leans toward +X (the crown is not over the origin).
- kelp 1.3 x 12 x 0.6: origin at its holdfast. Vertex colours, one material: the game sways it in its shader (higher
  up more), src/view/three/sea-models.ts.
- coral-a 4 x 3 x 4 (branching, pink), coral-b 4 x 3.5 x 0.8 (a sea fan facing +Z, yellow), coral-c 3 x 1.8 x 3 (round,
  purple).
- coral-arch 15.8 x 9.7 x 5.9: an arch across the track (the track along +Z), at least 9 m wide and 7.5 m high inside.
- coral-pillar 3 x 10.1 x 3: its top is flat at exactly 10.1 m, where 3-1's pearl record sits (umi 2110, 4.1 m under the
  sea; the stand-in's 10 m left the clam floating 0.1 m over it).
- rock-crack 8.4 x 3 x 4: two sandy ridges along Z with a deep blue crack between them (3-1's magnet record lies below).
- whale 8.6 x 5 x 15.9 (the body 6 wide, the flippers out to 4.3 m): named nodes `body` (origin) and `tail` (origin at
  its joint (0, 2.4, -5.2), the game beats it about X); the blowhole on top at (0, 5, 1.8) where src/view/three/sea.ts
  puts the spout and the song. Head +Z. Vertex colours, one material (the game gives each whale its own copy to fade,
  and lights it a little in its own colours under water, sea-models.ts).
- fish-a, fish-b 0.36 x 0.4 x 0.9: head +Z (flocks in 3-1, 3-2 and 3-3; 3-2's leap out of the water).
- current-ring 5 x 5 x 0.4: a ring of bubbles across the track, its centre 2.5 m over the origin. Vertex colours, one
  mesh: the game draws it instanced in its own see-through material.
- awa-big (5 m) and awa-pink (1.4 m): Sakasa's pink bubble, see-through pink (alpha 0.55) with an opaque swirl band.
- awa-note 0.9 x 1.2 x 0.05: the note in the bubble, standing up, a pink swirl on both faces.
- records rainbow-shell 1.2 x 0.5 x 1.2, pearl-clam 1.17 x 1.32 x 1.2 (its lid open, as the stand-in had it),
  iron-star 0.85 x 0.5 x 0.85.
Colours: the static models are plain-coloured parts (the game bakes each into one draw call per ground cell; the
fish flocks into one per flock). The kelp, the whale and the current ring are vertex-coloured with one material.
Output: public/models/<name>.glb and assets/previews/<name>.png.
Run: python3 scripts/run-bpy.py assets/blender/sea.py [-- name ...]
"""
from __future__ import annotations

from pathlib import Path
import json
import math
import os
import random
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import sky as s  # noqa: E402  (chapter 1's crafted helpers: fix_normals, ring_faces, plate, tuft...)
import volcano as v  # noqa: E402  (chapter 2's: Paint, painted, lathe_y, lumpy_stone, eye, preview...)
import meadow as md  # noqa: E402  (vertex-coloured nodes: paint_material, bake_colours, node, export_glb...)
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

TAU = 2 * math.pi
hexmix = v.hexmix


class Paint(v.Paint):
    """volcano.Paint with a glow for the colours it does not name (`default`): mixed tones of a glowing coral glow too."""

    def __init__(self, roughness=0.85, glow=None, default=0.0):
        super().__init__(roughness, glow)
        self.default = default

    def __call__(self, hex_color: str) -> bpy.types.Material:
        return v.mat(f"Flat {hex_color}", hex_color, self.roughness, self.glow.get(hex_color, self.default))

# ---------------------------------------------------------------- palette (ticket 0011)

SAND, SAND_RIM, SAND_WET, SAND_DEEP, SAND_FLOOR, FOAM = "#F2E2B0", "#F7EBC6", "#E2CE96", "#D9C58E", "#CDB782", "#F4F7EC"
GRASS, GRASS_LIGHT, GRASS_TUFT = "#8CCB5E", "#A2D676", "#6DB54C"
REEF, REEF_GOLD, REEF_LIGHT, REEF_DEEP, REEF_FOOT = "#E8A58C", "#E8C07A", "#F2B8A0", "#D98F7E", "#C98272"
PEBBLE, PEBBLE_TOP = "#C9B8A8", "#DCCFC2"
STARFISH, STARFISH_TOP = "#F29A7E", "#F8B49C"
TRUNK, TRUNK_LIGHT, LEAF, LEAF_LIGHT, LEAF_DARK, COCONUT = "#B08A5A", "#C49E6C", "#5DB85A", "#78C866", "#4A9E4C", "#8E6A40"
KELP_FOOT, KELP_TIP, KELP_EDGE = "#6FA84A", "#A6CF62", "#B9DA78"
CORAL_PINK, CORAL_PINK_TIP, CORAL_PINK_DEEP = "#F59BB0", "#FFBFD0", "#E3849C"
CORAL_YELLOW, CORAL_YELLOW_LIGHT, CORAL_YELLOW_DEEP = "#F7C66B", "#FBE3A6", "#E5A94C"
CORAL_PURPLE, CORAL_PURPLE_LIGHT, CORAL_PURPLE_DEEP = "#C9A0E0", "#DEC4F0", "#B288CF"
PILLAR_FOOT, PILLAR_TOP, PILLAR_CAP = "#D98F7E", "#F2B8A0", "#F7CDB8"
CRACK, CRACK_MID, CRACK_DEEP = "#2E5E8C", "#3F73A3", "#1F466F"
WHALE, WHALE_DEEP, WHALE_BELLY, BLOWHOLE = "#7FB2E5", "#6EA2D8", "#F3EBD8", "#4E7FB8"
EYE, SHINE = "#2B3A4A", "#FFFFFF"
FISH = {"fish-a": ("#FFE08A", "#FFF2C4", "#F7BE52"), "fish-b": ("#9FD8F5", "#DDF3FC", "#6DB9E6")}
RING, BUBBLE = "#9FDDF5", "#EAF8FF"
PINK, PINK_DEEP, PAPER, PAPER_LINE = "#F7A8D8", "#E8579F", "#FFF8E6", "#E6D6BA"
RAINBOW = ["#FF8A98", "#FFB46E", "#FFDD5C", "#8EDC86", "#7FCBF2", "#B497EE"]
CLAM, CLAM_RIB, CLAM_IN, PEARL = "#F5B3CB", "#EC9DBA", "#FCE3EC", "#FFFFFF"
STAR, STAR_TOP, STAR_LIGHT = "#8496B4", "#9CAECB", "#B9C8DF"

H = 16.2  # the mounds' height: from the sea floor (3-1's y -14.2) to their top, 2 m over the sea
SEA = 14.2  # the sea's surface over the sea floor
FLOOR_Y = -14.2
# SEA_DEBUG=1: print each part's bounds and where the track is still too close to a mound (while tuning).
DEBUG = bool(os.environ.get("SEA_DEBUG"))

# Underwater glow (a share of each colour as light): the game's fog turns the sea blue with distance, and the light
# under water is soft, so the corals and the like keep their own colour on their shaded side.
CORAL_GLOW = {CORAL_PINK: 0.18, CORAL_PINK_TIP: 0.24, CORAL_PINK_DEEP: 0.14, CORAL_YELLOW: 0.18, CORAL_YELLOW_LIGHT: 0.2,
              CORAL_YELLOW_DEEP: 0.14, CORAL_PURPLE: 0.18, CORAL_PURPLE_LIGHT: 0.2, CORAL_PURPLE_DEEP: 0.14}


# ---------------------------------------------------------------- small helpers (glTF coordinates)

def paint_faces(obj, paint: Paint, colour, smooth=False):
    """Gives each face of `obj` the material of `colour(centre, normal) -> hex` (glTF), made by `paint`."""
    obj.data.materials.clear()
    slots: dict[str, int] = {}
    for poly in obj.data.polygons:
        c, n = k.gltf(poly.center), k.gltf(poly.normal)
        hex_color = colour(c, n) if callable(colour) else colour
        if hex_color not in slots:
            slots[hex_color] = len(obj.data.materials)
            obj.data.materials.append(paint(hex_color))
        poly.material_index = slots[hex_color]
        poly.use_smooth = smooth(c, n) if callable(smooth) else smooth


def frames_along(points):
    """Parallel-transported frames (tangent, normal, binormal) along a polyline (glTF points)."""
    pts = [Vector(p) for p in points]
    out = []
    ref = Vector((1, 0, 0))
    prev_n = None
    for i, p in enumerate(pts):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        t = (b - a).normalized()
        if prev_n is None:
            r = ref if abs(t.dot(ref)) < 0.9 else Vector((0, 0, 1))
            n = t.cross(r).normalized()
        else:
            n = (prev_n - t * prev_n.dot(t)).normalized()
        out.append((t, n, t.cross(n).normalized()))
        prev_n = n
    return out


def tube(parts, name, points, radii, sides, paint: Paint, colours, cap_start=True, cap_end=True, smooth=True, phase=0.0):
    """A round tube along a polyline (glTF); `colours` one hex per segment (or one for all). An end without a cap is left
    open (it is buried in something)."""
    frames = frames_along(points)
    verts = []
    for p, r, (_, n, bn) in zip(points, radii, frames):
        c = Vector(p)
        for j in range(sides):
            a = phase + TAU * j / sides
            verts.append(tuple(c + n * (math.cos(a) * r) + bn * (math.sin(a) * r)))
    faces, cols = [], []
    seg_cols = colours if isinstance(colours, list) else [colours] * (len(points) - 1)
    for i in range(len(points) - 1):
        faces += s.ring_faces(i * sides, (i + 1) * sides, sides)
        cols += [seg_cols[i]] * sides
    if cap_start:
        faces.append(tuple(range(sides - 1, -1, -1)))
        cols.append(seg_cols[0])
    if cap_end:
        last = (len(points) - 1) * sides
        faces.append(tuple(range(last, last + sides)))
        cols.append(seg_cols[-1])
    obj = k.add_mesh(parts, name, verts, faces, [])
    # Faces are wound outward by construction when the frames turn the right way; make sure.
    _wind_outward(obj, points)
    paint_faces(obj, paint, lambda c, n, _it=iter(cols): next(_it), smooth=smooth)
    return obj


def _wind_outward(obj, points):
    """Turns a tube's faces outward: each side face's normal must point away from the polyline."""
    pts = [Vector(p) for p in points]
    mesh = obj.data
    votes = 0
    for poly in mesh.polygons:
        c = k.gltf(poly.center)
        nearest = min(pts, key=lambda p: (p - c).length)
        votes += 1 if k.gltf(poly.normal).dot(c - nearest) > 0 else -1
    if votes < 0:
        mesh.flip_normals()


def knob(parts, name, center, radius, paint: Paint, hex_color, sides=5, height=None, axis=(0, 1, 0), smooth=True):
    """A small round knob: a bipyramid of 2 x sides triangles along `axis`, smooth shaded (coral tips, polyps)."""
    c, ax = Vector(center), Vector(axis).normalized()
    h = height if height is not None else radius * 2
    ref = Vector((1, 0, 0)) if abs(ax.x) < 0.9 else Vector((0, 0, 1))
    u = ax.cross(ref).normalized()
    w = ax.cross(u).normalized()
    verts = [tuple(c - ax * (h / 2)), tuple(c + ax * (h / 2))]
    for i in range(sides):
        a = TAU * i / sides
        verts.append(tuple(c + u * (math.cos(a) * radius) + w * (math.sin(a) * radius)))
    faces = []
    for i in range(sides):
        a, b = 2 + i, 2 + (i + 1) % sides
        faces += [(0, b, a), (1, a, b)]
    return v.painted(parts, name, verts, faces, paint, hex_color, smooth=smooth)


def pillow(parts, name, center, u, w, outline, thick, paint: Paint, top_hex, bottom_hex, inset=0.3, smooth=True):
    """A soft flat piece (a flipper, a fluke, a leaf of fan): the outline [(a, b)] in the plane through `center` spanned
    by u and w, its rim at the middle and its two faces `thick` apart, each face an inner ring `inset` of the way in
    toward the outline's centroid. Faces on the u x w side take `top_hex`, the others `bottom_hex`."""
    u, w = Vector(u).normalized(), Vector(w).normalized()
    nrm = u.cross(w).normalized()
    c = Vector(center)
    n = len(outline)
    ca = sum(p[0] for p in outline) / n
    cb = sum(p[1] for p in outline) / n
    rim = [c + u * a + w * b for a, b in outline]
    top = [c + u * (a + (ca - a) * inset) + w * (b + (cb - b) * inset) + nrm * (thick / 2) for a, b in outline]
    bot = [c + u * (a + (ca - a) * inset) + w * (b + (cb - b) * inset) - nrm * (thick / 2) for a, b in outline]
    verts = [tuple(p) for p in rim + top + bot]
    faces = [tuple(range(n, 2 * n)), tuple(range(3 * n - 1, 2 * n - 1, -1))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    faces += [(2 * n + i, 2 * n + (i + 1) % n, (i + 1) % n, i) for i in range(n)]
    obj = v.painted(parts, name, verts, faces, paint, lambda cc, nn: top_hex if nn.dot(nrm) > 0 else bottom_hex, smooth=smooth)
    return obj


def blob(parts, name, size, center, paint: Paint, colour, seed, sub=1, rough=0.12, cut=True, smooth=False, turn=None):
    """A lumpy round stone or coral head (jittered icosphere), coloured by `colour(centre, normal)`, its bottom cut flat
    on the floor plane y = 0 when `cut`."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    rng = random.Random(seed)
    for vert in bm.verts:
        vert.co *= 1.0 + rng.uniform(-rough, rough)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    w, h, d = size
    obj.scale = (w / 2, d / 2, h / 2)
    obj.rotation_euler = (0, 0, rng.uniform(0, TAU) if turn is None else turn)
    obj.location = k.to_blender(center)
    k.active(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if cut:
        v.cut_below(obj)
    s.fix_normals(obj)
    paint_faces(obj, paint, colour, smooth=smooth)
    parts.append(obj)
    return obj


def starfish(parts, name, center, radius, paint: Paint, turn=0.0, tilt=(0.0, 0.0)):
    """A little round-armed starfish lying on the sand: a puffy five-point star (20 triangles), top lighter."""
    cx, cy, cz = center
    verts = [(cx, cy + radius * 0.32, cz), (cx, cy, cz)]
    for i in range(10):
        a = turn + TAU * i / 10
        r = radius if i % 2 == 0 else radius * 0.45
        verts.append((cx + math.cos(a) * r, cy + 0.02 + tilt[0] * math.cos(a) * r + tilt[1] * math.sin(a) * r, cz + math.sin(a) * r))
    faces = []
    for i in range(10):
        a, b = 2 + i, 2 + (i + 1) % 10
        faces += [(0, b, a), (1, a, b)]
    return v.painted(parts, name, verts, faces, paint, lambda c, n: STARFISH_TOP if n.y > 0.6 else STARFISH, smooth=False)


# ---------------------------------------------------------------- the stage's track (mounds are ramped under it)

_UMI = None


def umi_line():
    """3-1's main line `umi`: the polyline's points and their arc lengths."""
    global _UMI
    if _UMI is None:
        data = json.loads((k.ROOT / "src" / "stages" / "3-1.json").read_text())
        pts = next(r["points"] for r in data["rails"] if r["id"] == "umi")
        acc = [0.0]
        for a, b in zip(pts, pts[1:]):
            acc.append(acc[-1] + math.dist(a, b))
        _UMI = (pts, acc)
    return _UMI


def umi_at(s_):
    """The point of umi `s_` m along it and its unit direction (x, z)."""
    pts, acc = umi_line()
    for i in range(1, len(pts)):
        if acc[i] >= s_ or i == len(pts) - 1:
            t = max(0.0, min(1.0, (s_ - acc[i - 1]) / (acc[i] - acc[i - 1])))
            a, b = pts[i - 1], pts[i]
            p = [a[j] + (b[j] - a[j]) * t for j in range(3)]
            dx, dz = b[0] - a[0], b[2] - a[2]
            ln = math.hypot(dx, dz)
            return p, (dx / ln, dz / ln)
    raise ValueError(s_)


def rail_in_frame(mid, half):
    """umi from `mid - half` to `mid + half` (every metre) in the frame of a prop placed on umi at `mid` on the sea floor
    (the game's onRail placement: +Z along the rail, +X its left): [(x, y, z)], y from the sea floor."""
    (cx, _, cz), (tx, tz) = umi_at(mid)
    out = []
    total = umi_line()[1][-1]
    for i in range(int(2 * half) + 1):
        s_ = mid - half + i
        if s_ < 0 or s_ > total:
            continue
        (x, y, z), _ = umi_at(s_)
        dx, dz = x - cx, z - cz
        out.append((dx * tz - dz * tx, y - FLOOR_Y, dx * tx + dz * tz))
    return out


# ---------------------------------------------------------------- mounds: the beach, the reef, the island

def bisect(obj, co, no, faces_filter):
    """Cuts the faces `faces_filter(bm_face)` of `obj` by the plane through `co` with normal `no` (glTF)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    faces = [f for f in bm.faces if faces_filter(f)]
    geom = list({e for f in faces for e in f.edges}) + faces + list({vv for f in faces for vv in f.verts})
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=k.to_blender(co), plane_no=k.to_blender(no))
    bm.to_mesh(obj.data)
    bm.free()


def triangulate(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="BEAUTY", ngon_method="BEAUTY")
    bm.to_mesh(obj.data)
    bm.free()


def clear_track(obj, rail, clearance=0.4, side=0.3, near=6.0):
    """Lowers the surface under the rail (rail [(x, y, z)] in the model's space) until it is `clearance` m under the
    rail's centre line and `side` m under its edges (1.4 m out). Only vertices within `near` m of the rail move, each
    to the rail's height where it is less the clearance."""
    rail = sorted(rail, key=lambda p: p[2])

    def rail_at(z):
        if z <= rail[0][2]:
            return rail[0]
        for a, b in zip(rail, rail[1:]):
            if a[2] <= z <= b[2]:
                t = (z - a[2]) / (b[2] - a[2]) if b[2] > a[2] else 0.0
                return tuple(a[j] + (b[j] - a[j]) * t for j in range(3))
        return rail[-1]

    worst = 0.0
    for _ in range(40):
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.verts.ensure_lookup_table()
        tree = BVHTree.FromBMesh(bm)
        moved = 0
        worst = 0.0
        for x, y, z in rail:
            for dx, need in ((0.0, clearance), (-1.4, side), (1.4, side)):
                hit, _, index, _ = tree.ray_cast(Vector(k.to_blender((x + dx, y + 50, z))), Vector((0, 0, -1)))
                if hit is None:
                    continue
                over = hit.z - (y - need)
                if over <= 0.005:
                    continue
                worst = max(worst, over)
                bm.faces.ensure_lookup_table()
                if _ == 39 or DEBUG:
                    print("   over", round(over, 3), "at", (round(x + dx, 2), round(y, 2), round(z, 2)),
                          [tuple(round(c, 2) for c in k.gltf(vv.co)) for vv in bm.faces[index].verts])
                for vert in bm.faces[index].verts:
                    g = k.gltf(vert.co)
                    rx, ry, _ = rail_at(g.z)
                    if abs(g.x - rx) > near:
                        continue
                    limit = ry - clearance - 0.06
                    if g.y > limit:
                        vert.co.z = limit
                    else:
                        # Already at its own limit: a far corner of the face holds it up, so go lower.
                        vert.co.z -= over + 0.02
                    moved += 1
        bm.to_mesh(obj.data)
        bm.free()
        if moved == 0:
            break
    obj.data.update()
    if worst > 0.01:
        print(f"  clear_track: the surface still comes {worst:.2f} m too close under the rail")


def mound(name, a, b, mid, *, n, profile, colour, seed, wobble=0.025, cuts_x=(), ramp_ends=(), ramp_cut=12.0):
    """A mound on the sea floor: a flat top (an ellipse a x b half-axes, its shore gently wavy) 16.2 m up, then rings
    `profile` [(u, y)] going out (u: times the top's radii, to 1.3 at the foot on the floor). Its top is cut along x =
    `cuts_x` (colour bands) and, at the `ramp_ends` (+1: +Z, -1: -Z) where umi climbs onto it or leaves it, across
    `ramp_cut` m in and along x = +-4 there, so umi (the mound placed on it at `mid`) can be kept clear by a ramp. Faces
    are coloured by `colour(c, n, band)` (band -1 for the top, then 0.. outward for the rings)."""
    rng = random.Random(seed)
    ph = [rng.uniform(0, TAU) for _ in range(3)]
    rings = [(1.0, H)] + list(profile)
    verts = []
    for j, (u, y) in enumerate(rings):
        for i in range(n):
            th = TAU * i / n
            wob = 1.0 + wobble * (0.6 * math.sin(3 * th + ph[0]) + 0.4 * math.sin(5 * th + ph[1]))
            uu, yy = u, y
            if 0 < j < len(rings) - 1:
                uu += rng.uniform(-0.012, 0.012)
                yy += rng.uniform(-0.18, 0.18)
            verts.append((a * math.cos(th) * wob * uu, yy, b * math.sin(th) * wob * uu))
    faces = [tuple(range(n - 1, -1, -1))]
    bands = [0]
    for j in range(len(rings) - 1):
        faces += s.ring_faces(j * n, (j + 1) * n, n)
        bands += [j + 1] * n
    last = (len(rings) - 1) * n
    faces.append(tuple(range(last, last + n)))
    bands.append(len(rings))
    parts: list = []
    obj = k.add_mesh(parts, name, verts, faces, [])
    # The band of each face rides on its material index through the cuts (split faces keep it).
    for poly, band_ in zip(obj.data.polygons, bands):
        poly.material_index = band_
    s.fix_normals(obj)
    top = lambda f: f.material_index == 0  # noqa: E731
    for x in cuts_x:
        bisect(obj, (x, H, 0), (1, 0, 0), top)
    for end in ramp_ends:
        z0 = end * (b - ramp_cut)
        bisect(obj, (0, H, z0), (0, 0, 1), top)
        near_end = lambda f, end=end, z0=z0: f.material_index == 0 and k.gltf(f.calc_center_median()).z * end > abs(z0)  # noqa: E731
        for x in (-4.0, 4.0):
            bisect(obj, (x, H, 0), (1, 0, 0), lambda f, ne=near_end: ne(f))
    triangulate(obj)
    if ramp_ends:
        clear_track(obj, rail_in_frame(mid, b * 1.35))
    index = [poly.material_index for poly in obj.data.polygons]
    paint = Paint(0.9, glow={})
    it = iter(index)

    def by_band(c, nn):
        band_ = next(it)
        if band_ == len(rings):
            return SAND_FLOOR
        return colour(c, nn, band_ - 1)

    paint_faces(obj, paint, by_band)
    return parts, obj


def mound_band_colour(top_hex, bands):
    def colour(c, n, band):
        if n.y < -0.9:
            return SAND_FLOOR
        if band < 0:
            return top_hex(c) if callable(top_hex) else top_hex
        return bands[min(band, len(bands) - 1)]
    return colour


BEACH = [(1.035, H - 0.55), (1.07, 14.55), (1.1, 13.4), (1.19, 6.6), (1.3, 0.0)]
BEACH_BANDS = [SAND_RIM, SAND_WET, FOAM, SAND_DEEP, SAND_FLOOR]


def sandbar():
    """すなはま: the beach the first station stands on. A long oval of pale sand with a lighter dry rim, wet sand down
    to a thin line of foam at the water, then sand under the sea down to the floor. Two starfish and a few pebbles on
    the sand, clear of the track, the platform (left) and the palms (right)."""
    parts, obj = mound("sandbar", 20.0, 90.0, 72.0, n=20, profile=BEACH[:3] + BEACH[4:], seed=3, ramp_ends=(1,),
                       colour=mound_band_colour(SAND, BEACH_BANDS[:3] + BEACH_BANDS[4:]))
    paint = Paint(0.9)
    starfish(parts, "starfish-0", (-14.5, H, -38.0), 0.55, paint, 0.4)
    starfish(parts, "starfish-1", (12.5, H, 52.0), 0.45, paint, 1.3)
    for i, (x, z, sz) in enumerate(((-15.5, 30.0, 1.1), (15.0, -55.0, 0.9))):
        blob(parts, f"pebble-{i}", (sz, sz * 0.55, sz * 0.8), (x, H + sz * 0.12, z), paint,
             lambda c, n: PEBBLE_TOP if n.y > 0.5 else PEBBLE, 20 + i)
    return parts, 300


REEF_PROFILE = [(1.02, 14.6), (1.06, 11.2), (1.12, 7.0), (1.2, 3.2), (1.3, 0.0)]


def reef():
    """リーフ: a coral plateau standing out of the sea, its walls steep: warm coral rock in soft patches of salmon, gold
    and light coral, deeper toward the floor. On the top, either side of the track (15 m and more out), clusters of
    round pink, yellow and purple coral heads; on its walls under the sea a few more."""
    rng = random.Random(9)

    def colour(c, n, band):
        if band < 0:
            return REEF_LIGHT
        a = math.atan2(c.z / 38.0, c.x / 30.0)
        patch = math.sin(3 * a + c.y * 0.35 + 0.8) + 0.6 * math.sin(7 * a - c.y * 0.2 + 2.1)
        if band >= 3:
            return REEF_FOOT if band >= 4 or patch < -0.2 else REEF_DEEP
        if patch > 0.75:
            return REEF_GOLD
        if patch < -0.7:
            return REEF_DEEP if band >= 2 else REEF_LIGHT
        return REEF if band >= 1 else hexmix(REEF, REEF_LIGHT, 0.5)

    parts, obj = mound("reef", 30.0, 38.0, 1712.0, n=20, profile=REEF_PROFILE, seed=5, wobble=0.04, ramp_ends=(-1,), ramp_cut=9.0,
                       colour=colour)
    paint = Paint(0.85, glow=CORAL_GLOW)
    corals = [CORAL_PINK, CORAL_YELLOW, CORAL_PURPLE]
    lights = {CORAL_PINK: CORAL_PINK_TIP, CORAL_YELLOW: CORAL_YELLOW_LIGHT, CORAL_PURPLE: CORAL_PURPLE_LIGHT}
    # Clusters on the top, 15 m and more out from the track: a big head and a smaller one of another colour.
    spots = [(-20.0, -17.0), (19.5, -22.0), (-21.0, 14.0), (20.5, 12.0), (-17.0, 30.0)]
    for i, (x, z) in enumerate(spots):
        for j in range(2):
            hexc = corals[(i + j) % 3]
            size = rng.uniform(5.0, 6.4) if j == 0 else rng.uniform(3.2, 4.0)
            ox, oz = (0.0, 0.0) if j == 0 else (rng.choice((-1, 1)) * 3.6, rng.uniform(-3.0, 3.0))
            blob(parts, f"clump-{i}-{j}", (size, size * 0.5, size * 0.9), (x + ox, H + size * 0.1, z + oz), paint,
                 lambda c, n, h=hexc: lights[h] if n.y > 0.6 else h, 30 + 2 * i + j, smooth=True)
    # Heads of coral on the walls under the sea (clear of the track's ends).
    for i, deg in enumerate((15, 55, 128, 165, 200, 340)):
        a = math.radians(deg)
        u = 1.1
        x, z = 30.0 * math.cos(a) * u, 38.0 * math.sin(a) * u
        hexc = corals[(i + 1) % 3]
        size = rng.uniform(4.0, 5.0)
        blob(parts, f"wall-{i}", (size, size * 0.75, size), (x, 7.5 + rng.uniform(-1.5, 1.5), z), paint,
             lambda c, n, h=hexc: lights[h] if n.y > 0.5 else h, 50 + i, cut=False, smooth=True)
    return parts, 600


def sand_island():
    """しおふきじま: the beach's big sister, with a band of grass either side of the track 16-26 m out (the palms stand
    on it), a few tufts on the grass, round bushes and pebbles, and starfish on the sand."""
    def top(c):
        return GRASS if 16.0 < abs(c.x) < 26.0 else SAND

    parts, obj = mound("sand-island", 35.0, 115.0, 1910.0, n=24, profile=BEACH, seed=7, cuts_x=(-26.0, -16.0, 16.0, 26.0),
                       ramp_ends=(1,), colour=mound_band_colour(top, BEACH_BANDS))
    paint = Paint(0.9)
    # The palms (stage JSON): grass tufts and bushes keep 4 m away from them, and from the platform (left, x 0-8).
    palms = [(-20, -95), (21, -60), (-22, -30), (20, -5), (-19, 80), (22, 95), (-24, -50), (24, 60)]
    tufts = [(-18.5, -75.0), (23.5, -82.0), (17.5, -38.0), (-24.5, 12.0), (-17.5, 55.0), (24.5, 82.0)]
    m_tuft = paint(GRASS_TUFT)
    for i, (x, z) in enumerate(tufts):
        assert all(math.hypot(x - px, z - pz) > 4 for px, pz in palms), (x, z)
        s.tuft(parts, f"tuft-{i}", (x, H, z), 1.1, 4, 60 + i, m_tuft, spread=0.45)
    for i, (x, z) in enumerate(((-21.0, -12.0), (21.5, 38.0))):
        size = 2.6
        blob(parts, f"bush-{i}", (size, size * 0.7, size * 0.9), (x, H + size * 0.2, z), paint,
             lambda c, n: GRASS_LIGHT if n.y > 0.4 else GRASS_TUFT, 70 + i, rough=0.1)
    for i, (x, z, sz) in enumerate(((-29.0, -20.0, 1.3), (30.0, 20.0, 1.0), (-11.0, 104.0, 0.9))):
        blob(parts, f"pebble-{i}", (sz, sz * 0.55, sz * 0.8), (x, H + sz * 0.12, z), paint,
             lambda c, n: PEBBLE_TOP if n.y > 0.5 else PEBBLE, 80 + i)
    starfish(parts, "starfish-0", (-10.5, H, -70.0), 0.55, paint, 0.2)
    starfish(parts, "starfish-1", (11.0, H, 70.0), 0.5, paint, 0.9)
    starfish(parts, "starfish-2", (29.5, H, -40.0), 0.45, paint, 2.1)
    return parts, 600


# ---------------------------------------------------------------- palm

def palm():
    """ヤシ: a ringed trunk leaning gently toward +X (rings in two browns), a crown of six long drooping fronds (each
    arched over its rib, its edge in leaflet clumps; two greens on top, darker below) and three coconuts. Not any real
    resort's palm."""
    paint = Paint(0.85)
    parts: list = []

    def trunk_at(t):
        y = 8.15 * t
        return (0.034 * y * y, y, 0.0)

    rings = [i / 5 for i in range(6)]
    pts = [trunk_at(t) for t in rings]
    radii = [0.31 - 0.14 * t for t in rings]
    tube(parts, "trunk", pts, radii, 5, paint, [TRUNK if i % 2 else TRUNK_LIGHT for i in range(5)], smooth=True)
    crown = Vector(trunk_at(1.0)) + Vector((0, 0.05, 0))
    rng = random.Random(11)
    ts = [0.0, 0.2, 0.4, 0.6, 0.8]
    widths = [0.12, 0.62, 0.42, 0.56, 0.3]
    for i in range(6):
        a = TAU * i / 6 + 0.25 + rng.uniform(-0.12, 0.12)
        out = Vector((math.cos(a), 0, math.sin(a)))
        reach = rng.uniform(2.55, 2.85)
        rise = rng.uniform(0.55, 0.8)
        droop = rng.uniform(1.5, 1.9)

        def spine(t):
            return crown + out * (reach * t) + Vector((0, rise * math.sin(math.pi * t * 0.75) - droop * t ** 2.3, 0))

        side = Vector((-out.z, 0, out.x))
        verts = []
        for t, wdt in zip(ts, widths):
            p = spine(t)
            sag = Vector((0, 0.22 * wdt + 0.05, 0))
            verts += [tuple(p + side * wdt - sag), tuple(p + Vector((0, 0.08, 0))), tuple(p - side * wdt - sag)]
        tip = len(verts)
        verts.append(tuple(spine(1.0)))
        faces = [(0, 1, 2)]
        for j in range(len(ts) - 1):
            faces += s.ring_faces(3 * j, 3 * (j + 1), 3)
        last = 3 * (len(ts) - 1)
        faces += [(last, last + 1, tip), (last + 1, last + 2, tip), (last + 2, last, tip)]
        top_hex = LEAF_LIGHT if i % 2 else LEAF
        v.painted(parts, f"frond-{i}", verts, faces, paint, lambda c, n, t=top_hex: t if n.y > 0.05 else LEAF_DARK, smooth=False)
    for i in range(3):
        a = TAU * i / 3 + 0.9
        knob(parts, f"coconut-{i}", tuple(crown + Vector((math.cos(a) * 0.26, -0.28, math.sin(a) * 0.26))), 0.17, paint, COCONUT, 4,
             height=0.32, smooth=True)
    return parts, 250


# ---------------------------------------------------------------- kelp

def kelp():
    """こんぶ: one long frond on a short stalk, a diamond section (a midrib in front and behind), widest in the middle,
    twisting a little and waving gently as it climbs to a rounded point. Dark green at the holdfast to light green at
    the tip, its edges lighter than its rib (vertex colours; the game sways it)."""
    ts = [0.0, 0.12, 0.34, 0.58, 0.8]
    HT = 12.0

    def half_width(t):
        return 0.16 + 0.5 * math.sin(math.pi * min(1.0, t / 0.9)) ** 0.8

    def ring(t):
        w = half_width(t)
        rib = 0.07 + 0.06 * (1 - t)
        twist = 1.1 * t
        cx = 0.12 * math.sin(t * 5.0)
        cz = 0.16 * math.sin(t * 3.7 + 0.6)
        pts = []
        for x, z in ((-w, 0.0), (0.0, rib), (w, 0.0), (0.0, -rib)):
            xr = x * math.cos(twist) - z * math.sin(twist)
            zr = x * math.sin(twist) + z * math.cos(twist)
            pts.append((cx + xr, HT * t, cz + zr))
        return pts

    verts = [p for t in ts for p in ring(t)]
    tip = len(verts)
    verts.append((0.1, HT, 0.05))
    faces = [(3, 2, 1, 0)]
    for j in range(len(ts) - 1):
        faces += s.ring_faces(4 * j, 4 * (j + 1), 4)
    last = 4 * (len(ts) - 1)
    faces += [(last + i, last + (i + 1) % 4, tip) for i in range(4)]
    parts: list = []
    # A little green light of its own: under water the kelp stays green on its shaded side.
    blade = md.solid(parts, "kelp", verts, faces, [md.glow(md.paint_material("Kelp", 0.8), KELP_TIP, 0.16)])
    edge_ids = {4 * j + 0 for j in range(len(ts))} | {4 * j + 2 for j in range(len(ts))}

    def colour(poly, p):
        t = max(0.0, min(1.0, p.y / HT))
        base = hexmix(KELP_FOOT, KELP_TIP, t ** 0.9)
        return base

    md.paint_corners(blade, colour)
    # The edges a touch lighter than the rib (per corner, by vertex).
    attr = blade.data.color_attributes["paint"]
    for poly in blade.data.polygons:
        for li in poly.loop_indices:
            vi = blade.data.loops[li].vertex_index
            if vi in edge_ids and vi != tip:
                y = k.gltf(blade.data.vertices[vi].co).y / HT
                rgb = k.hex_linear(hexmix(hexmix(KELP_FOOT, KELP_TIP, y ** 0.9), KELP_EDGE, 0.45))
                attr.data[li].color = (*rgb, 1.0)
    for poly in blade.data.polygons:
        poly.use_smooth = True
    return blade, 40


# ---------------------------------------------------------------- corals

def branch(parts, name, base, direction, length, radius, paint, body_hex, tip_hex, bend=(0, 0, 0), fork=None, sides=5):
    """A coral branch: a tapering tube from `base` along `direction` (two segments, bending by `bend`), a round tip,
    and optionally one side branch `fork` = (at, direction, length)."""
    d = Vector(direction).normalized()
    b0 = Vector(base)
    mid = b0 + d * (length * 0.5) + Vector(bend) * 0.5
    end = b0 + d * length + Vector(bend)
    tube(parts, name, [tuple(b0), tuple(mid), tuple(end)], [radius, radius * 0.82, radius * 0.66], sides, paint, body_hex,
         cap_start=False, cap_end=False)
    knob(parts, f"{name}-tip", tuple(end + (end - mid).normalized() * radius * 0.3), radius * 1.12, paint, tip_hex, 6,
         height=radius * 1.9, axis=tuple((end - mid).normalized()))
    if fork:
        at, fdir, flen = fork
        f0 = b0 + (mid - b0) * at * 2 if at <= 0.5 else mid + (end - mid) * (at - 0.5) * 2
        fd = Vector(fdir).normalized()
        f1 = f0 + fd * flen
        tube(parts, f"{name}-fork", [tuple(f0), tuple(f1)], [radius * 0.72, radius * 0.55], sides, paint, body_hex, cap_start=False,
             cap_end=False)
        knob(parts, f"{name}-fork-tip", tuple(f1 + fd * radius * 0.22), radius * 0.92, paint, tip_hex, 6, height=radius * 1.6,
             axis=tuple(fd))


def coral_a():
    """えだ さんご: a bouquet of round pink branches growing out of a low knobbly foot, each branch ending in a pale
    round tip and most with one side branch (no sharp points)."""
    paint = Paint(0.75, glow=CORAL_GLOW, default=0.16)
    parts: list = []
    v.lathe_y(parts, "foot", [(0.0, 0.72, CORAL_PINK_DEEP), (0.4, 0.52, CORAL_PINK), (0.62, 0.0, CORAL_PINK)], (0, 0), 7, paint, smooth=True)
    rng = random.Random(21)
    for i in range(5):
        a = TAU * i / 5 + 0.3
        lean = math.radians(rng.uniform(34, 48))
        out = Vector((math.cos(a), 0, math.sin(a)))
        d = out * math.sin(lean) + Vector((0, math.cos(lean), 0))
        length = rng.uniform(1.8, 2.3)
        base = Vector((math.cos(a) * 0.3, 0.42, math.sin(a) * 0.3))
        fdir = out * 0.5 + Vector((0, 0.9, 0)) + Vector((-out.z, 0, out.x)) * rng.uniform(-0.7, 0.7)
        # Out first, then curving up like a candelabra.
        branch(parts, f"branch-{i}", tuple(base), tuple(d), length, 0.21, paint, CORAL_PINK, CORAL_PINK_TIP,
               bend=tuple(Vector((0, 0.55, 0)) - out * 0.35), fork=(0.5, tuple(fdir), length * 0.45))
    return parts, 300


def sea_fan(parts, name, paint: Paint, width, height, bow, n_ang=12, rings=(0.3, 0.66, 1.0), thick=0.07):
    """A sea fan's blade facing +Z, its root at the origin: a pleated half disc `width` x `height` with a softly scalloped
    edge, bowed `bow` toward +Z, deep yellow at the root, then yellow, its ribs paler, both faces alike (closed)."""
    angs = [math.radians(10 + 160 * i / n_ang) for i in range(n_ang + 1)]
    nr = len(rings)

    def p(i, f, side):
        a = angs[i]
        r = f * (1.0 + (0.045 if i % 2 == 0 else -0.025) * (f == rings[-1]))
        x, y = math.cos(a) * r * width / 2, math.sin(a) * r * height
        z = bow * r * r * (1 - 0.35 * abs(math.cos(a))) + side * thick * (1.25 - f)
        return (x, y, z)

    verts = [(0.0, 0.0, thick), (0.0, 0.0, -thick)]
    for side in (1, -1):
        for f in rings:
            verts += [p(i, f, side) for i in range(n_ang + 1)]
    m = n_ang + 1
    front = lambda j: 2 + j * m  # noqa: E731
    back = lambda j: 2 + nr * m + j * m  # noqa: E731
    tones = [CORAL_YELLOW_DEEP, CORAL_YELLOW, hexmix(CORAL_YELLOW, CORAL_YELLOW_LIGHT, 0.3)][:nr]

    def tone(j, i):
        base = tones[min(j, len(tones) - 1)]
        return hexmix(base, CORAL_YELLOW_LIGHT, 0.5) if i % 2 else base

    faces, cols = [], []
    for side, start, centre in ((1, front, 0), (-1, back, 1)):
        for i in range(n_ang):
            f = (centre, start(0) + i, start(0) + i + 1)
            faces.append(f if side > 0 else f[::-1])
            cols.append(tone(0, i))
        for j in range(nr - 1):
            for i in range(n_ang):
                q = (start(j) + i, start(j + 1) + i, start(j + 1) + i + 1, start(j) + i + 1)
                faces.append(q[::-1] if side > 0 else q)
                cols.append(tone(j + 1, i))
    last = nr - 1
    for i in range(n_ang):
        faces.append((front(last) + i, front(last) + i + 1, back(last) + i + 1, back(last) + i))
        cols.append(CORAL_YELLOW_LIGHT)
    for end in (0, n_ang):
        chain_f = [0] + [front(j) + end for j in range(nr)]
        chain_b = [1] + [back(j) + end for j in range(nr)]
        for j in range(nr):
            faces.append((chain_f[j], chain_f[j + 1], chain_b[j + 1], chain_b[j]))
            cols.append(CORAL_YELLOW)
    return v.painted(parts, name, verts, faces, paint, cols, smooth=True)


def place_obj(obj, origin, x_axis, y_axis):
    """Moves a part built at the origin (+Y up, +Z its face) to `origin`, its +Y along `y_axis` and +X along `x_axis`
    (made square to it): applied to its mesh."""
    from mathutils import Matrix
    y = Vector(y_axis).normalized()
    x = Vector(x_axis)
    x = (x - y * x.dot(y)).normalized()
    z = x.cross(y).normalized()
    to_b = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))  # glTF -> Blender
    basis = Matrix((tuple(x), tuple(y), tuple(z))).transposed()
    m = (to_b @ basis @ to_b.inverted()).to_4x4()
    m.translation = Vector(k.to_blender(tuple(origin)))
    obj.data.transform(m)
    obj.data.update()


def transform(obj, matrix):
    """Applies a 4x4 matrix given in glTF coordinates to the part's mesh."""
    from mathutils import Matrix
    to_b = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0))).to_4x4()
    obj.data.transform(to_b @ matrix @ to_b.inverted())
    obj.data.update()


def flat_star(parts, name, center, normal, r_out, r_in, points, paint: Paint, hex_color, turn=0.0):
    """A flat little star (a sparkle) lying on a surface at `center`, facing along `normal` (glTF)."""
    n = Vector(normal).normalized()
    ref = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))
    u = n.cross(ref).normalized()
    w = n.cross(u).normalized()
    c = Vector(center)
    verts = [tuple(c)]
    for q in range(2 * points):
        a = turn + math.pi * q / points
        r = r_out if q % 2 == 0 else r_in
        verts.append(tuple(c + u * (math.cos(a) * r) + w * (math.sin(a) * r)))
    m = 2 * points
    faces = [(0, 1 + q, 1 + (q + 1) % m) for q in range(m)]
    obj = k.add_mesh(parts, name, verts, faces, [paint(hex_color)])
    if k.gltf(obj.data.polygons[0].normal).dot(n) < 0:
        obj.data.flip_normals()
    return obj


def coral_b():
    """おうぎ さんご: a sea fan on a short stem, gently bowed toward +Z, its edge softly scalloped: deep yellow by the
    stem, then yellow, then a pale rim, with paler ribs fanning out (both faces alike: a closed fan, seen from both
    sides)."""
    paint = Paint(0.8, glow=CORAL_GLOW, default=0.16)
    parts: list = []
    cy = 0.62
    fan = sea_fan(parts, "fan", paint, 4.0, 2.9, 0.34, rings=(0.42, 1.0))
    place_obj(fan, (0.0, cy, 0.0), (1, 0, 0), (0, 1, 0))
    tube(parts, "stem", [(0.0, 0.0, 0.0), (0.0, 0.35, 0.02), (0.0, cy + 0.12, 0.05)], [0.24, 0.17, 0.12], 5, paint, CORAL_YELLOW_DEEP,
         cap_start=True, cap_end=False)
    return parts, 200


def coral_c():
    """まるい さんご: a round, softly lumpy purple coral head, deeper at its foot and lighter on top, dotted with pale
    round polyps."""
    paint = Paint(0.8, glow=CORAL_GLOW, default=0.16)
    parts: list = []
    rng = random.Random(33)
    rings = [(0.0, 1.32), (0.42, 1.5), (0.95, 1.38), (1.38, 0.92)]
    segs = 12
    verts = []
    for j, (y, r) in enumerate(rings):
        for i in range(segs):
            a = TAU * i / segs + j * 0.26
            rr = r * (1 + (rng.uniform(-0.07, 0.07) if j else 0.0))
            verts.append((math.cos(a) * rr, y + (rng.uniform(-0.06, 0.06) if j else 0.0), math.sin(a) * rr))
    top = len(verts)
    verts.append((0.0, 1.68, 0.0))
    faces = [tuple(range(segs - 1, -1, -1))]
    cols = [CORAL_PURPLE_DEEP]
    for j in range(len(rings) - 1):
        for i in range(segs):
            faces.append((j * segs + i, j * segs + (i + 1) % segs, (j + 1) * segs + (i + 1) % segs, (j + 1) * segs + i))
            cols.append(CORAL_PURPLE_DEEP if j == 0 else (hexmix(CORAL_PURPLE, CORAL_PURPLE_LIGHT, 0.35) if j == 2 else CORAL_PURPLE))
    last = (len(rings) - 1) * segs
    for i in range(segs):
        faces.append((last + i, last + (i + 1) % segs, top))
        cols.append(hexmix(CORAL_PURPLE, CORAL_PURPLE_LIGHT, 0.6))
    head = v.painted(parts, "head", verts, faces, paint, cols, smooth=True)
    tree = k.world_tree(head)
    for i in range(9):
        a = TAU * i / 9 + rng.uniform(-0.15, 0.15)
        el = math.radians(62 if i % 3 == 0 else (35 if i % 3 == 1 else 14))
        d = Vector((math.cos(a) * math.cos(el), math.sin(el), math.sin(a) * math.cos(el)))
        centre = Vector((0, 0.7, 0))
        loc, nrm, _, _ = tree.ray_cast(Vector(k.to_blender(tuple(centre + d * 3))), Vector(k.to_blender(tuple(-d))))
        if loc is None:
            continue
        pnt, nn = k.gltf(loc), k.gltf(nrm).normalized()
        knob(parts, f"polyp-{i}", tuple(pnt + nn * 0.06), 0.16, paint, CORAL_PURPLE_LIGHT, 5, height=0.3, axis=tuple(nn))
    return parts, 200


def coral_arch():
    """さんごの アーチ over the track: a lumpy arch of coral rock (deeper at its feet, light coral and gold patches higher
    up) standing on two big knobbly feet, with branching pink coral on its shoulders, a yellow fan on its front and one
    on its back, round purple heads and pale knobs. Inside at least 9 m wide and 7.5 m high (the train runs along +Z
    through it); nothing hangs inside."""
    paint = Paint(0.85, glow=dict(CORAL_GLOW, **{REEF_LIGHT: 0.12, REEF: 0.1, REEF_GOLD: 0.1, REEF_DEEP: 0.08}), default=0.14)
    parts: list = []
    rng = random.Random(17)
    CX, CY0, CYH = 6.3, 0.3, 8.3

    def centre(ph):
        return Vector((CX * math.cos(ph), CY0 + CYH * math.sin(ph), 0.0))

    def rad_r(ph):
        return 1.66 - 0.66 * math.sin(ph)

    def rad_z(ph):
        return 2.55 - 0.45 * math.sin(ph)

    segs, sides = 14, 7
    phs = [math.pi * i / segs for i in range(segs + 1)]
    pts = [tuple(centre(ph)) for ph in phs]
    pts[0] = (pts[0][0], -0.6, 0.0)
    pts[-1] = (pts[-1][0], -0.6, 0.0)
    verts = []
    for i, (ph, p_) in enumerate(zip(phs, pts)):
        c = Vector(p_)
        radial = Vector((CYH * math.cos(ph), CX * math.sin(ph), 0.0)).normalized()
        for j in range(sides):
            a = TAU * j / sides + (0.3 if i % 2 else 0.0)
            lump = 1.0 + (0.0 if i in (0, segs) else rng.uniform(-0.07, 0.07))
            # Inside (cos a < 0 toward the middle) the arch stays smooth: nothing bulges into the train's way.
            if math.cos(a) < -0.3:
                lump = min(lump, 1.0)
            verts.append(tuple(c + radial * (math.cos(a) * rad_r(ph) * lump) + Vector((0, 0, math.sin(a) * rad_z(ph) * lump))))
    faces = []
    for i in range(segs):
        faces += s.ring_faces(i * sides, (i + 1) * sides, sides)

    def rock(c, n):
        blob_ = math.sin(c.x * 0.9 + c.z * 0.7 + 0.4) * math.sin(c.y * 0.8 + 1.1) + 0.4 * math.sin(c.x * 2.1 - c.y * 1.3)
        if c.y < 2.2:
            return REEF_DEEP if blob_ < 0.3 else REEF
        if blob_ > 0.55:
            return REEF_GOLD
        return REEF_LIGHT if c.y > 6.8 or blob_ < -0.45 else REEF

    arch = k.add_mesh(parts, "arch", verts, faces, [])
    _wind_outward(arch, pts)
    v.cut_below(arch)  # its ends go into the floor: cut them off flat at it
    paint_faces(arch, paint, rock, smooth=True)
    tree = k.world_tree(arch)

    def on_arch(ph, alpha, lift=0.0):
        """Where the arch's surface is at `ph` along it, `alpha` round it (0 outward, +90 degrees toward +Z), and the
        surface's normal there."""
        c = centre(ph)
        radial = Vector((CYH * math.cos(ph), CX * math.sin(ph), 0.0)).normalized()
        d = (radial * math.cos(alpha) + Vector((0, 0, 1)) * math.sin(alpha)).normalized()
        loc, nrm, _, _ = tree.ray_cast(Vector(k.to_blender(tuple(c + d * 6))), Vector(k.to_blender(tuple(-d))))
        g, nn = k.gltf(loc), k.gltf(nrm).normalized()
        return g + nn * lift, nn

    # The feet: big knobbly rocks round the arch's ends, their inner edge 4.6 m out from the middle.
    for side in (-1, 1):
        blob(parts, f"foot-{side}", (3.1, 3.0, 5.6), (side * 6.4, 1.0, 0.0), paint, lambda c, n: REEF_DEEP if c.y < 1.2 else REEF,
             70 + side, sub=2, rough=0.08, smooth=True, turn=0.0)
    # Pink branching coral on the shoulders, out and up.
    for i, (ph, al) in enumerate(((math.radians(44), math.radians(35)), (math.radians(136), math.radians(-35)))):
        base, nn = on_arch(ph, al, -0.2)
        for j in range(3):
            a = TAU * j / 3 + i * 0.7
            d = nn * 0.35 + Vector((0, 1.0, 0)) + Vector((math.cos(a), 0, math.sin(a))) * 0.55
            branch(parts, f"crown-{i}-{j}", tuple(base), tuple(d), rng.uniform(2.0, 2.4), 0.3, paint, CORAL_PINK, CORAL_PINK_TIP,
                   bend=tuple(Vector((0, 0.4, 0))))
    # Yellow fans standing on the front and the back faces.
    for i, (ph, al) in enumerate(((math.radians(26), math.radians(80)), (math.radians(154), math.radians(-80)))):
        base, nn = on_arch(ph, al, -0.05)
        fan = sea_fan(parts, f"fan-{i}", paint, 2.6, 2.0, 0.25, n_ang=6, rings=(0.4, 1.0))
        facing = Vector((0, 0, 1 if al > 0 else -1))
        place_obj(fan, base, Vector((0, 1, 0)).cross(facing), Vector((0, 1, 0)) * 0.9 + facing * 0.25)
    # Round purple heads and pale knobs.
    for i, (ph, al, size) in enumerate(((math.radians(90), 0.0, 1.8), (math.radians(68), math.radians(-60), 1.35),
                                        (math.radians(112), math.radians(62), 1.4))):
        base, nn = on_arch(ph, al, -0.2 if i == 0 else 0.1)
        blob(parts, f"head-{i}", (size, size * (0.42 if i == 0 else 0.62), size), tuple(base), paint,
             lambda c, n: CORAL_PURPLE_LIGHT if n.y > 0.55 else CORAL_PURPLE, 40 + i, cut=False, smooth=True)
    for i, (ph, al) in enumerate(((math.radians(38), math.radians(-30)), (math.radians(80), math.radians(70)),
                                  (math.radians(145), math.radians(20)))):
        base, nn = on_arch(ph, al, 0.12)
        knob(parts, f"knob-{i}", tuple(base), 0.34, paint, [CORAL_PINK_TIP, CORAL_YELLOW_LIGHT, CORAL_PURPLE_LIGHT][i % 3], 5,
             height=0.5, axis=tuple(nn))
    return parts, 800


def coral_pillar():
    """さんごの はしら (record ②'s stand): a slim knobbly column of coral rock, deep coral at its foot to light at the
    top, little coral clumps on its sides and a flat lighter top (10.1 m once sized) for the pearl's clam."""
    paint = Paint(0.85, glow=dict(CORAL_GLOW, **{PILLAR_CAP: 0.12}))
    parts: list = []
    rng = random.Random(41)
    prof = [(0.0, 1.42), (0.7, 1.18), (2.4, 1.0), (4.3, 0.92), (6.2, 0.86), (8.1, 0.9), (9.45, 1.0), (10.0, 0.9)]
    segs = 8
    verts = []
    for j, (y, r) in enumerate(prof):
        for i in range(segs):
            a = TAU * i / segs + j * 0.35
            rr = r * (1 + (rng.uniform(-0.09, 0.09) if 0 < j < len(prof) - 1 else 0.0))
            verts.append((math.cos(a) * rr, y + (rng.uniform(-0.2, 0.2) if 0 < j < len(prof) - 2 else 0.0), math.sin(a) * rr))
    faces = [tuple(range(segs - 1, -1, -1))]
    cols = [PILLAR_FOOT]
    for j in range(len(prof) - 1):
        for i in range(segs):
            faces.append((j * segs + i, j * segs + (i + 1) % segs, (j + 1) * segs + (i + 1) % segs, (j + 1) * segs + i))
            t = j / (len(prof) - 2)
            tone = hexmix(PILLAR_FOOT, PILLAR_TOP, t)
            if (i + j * 3) % 5 == 0:
                tone = hexmix(tone, REEF_GOLD, 0.45)
            cols.append(tone)
    last = (len(prof) - 1) * segs
    faces.append(tuple(range(last, last + segs)))
    cols.append(PILLAR_CAP)
    v.painted(parts, "column", verts, faces, paint, cols, smooth=lambda c, n: abs(n.y) < 0.9)
    for i, (y, a, hexc) in enumerate(((1.6, 0.4, CORAL_PINK), (3.6, 2.6, CORAL_YELLOW), (5.6, 4.6, CORAL_PURPLE), (7.6, 1.5, CORAL_PINK),
                                      (8.9, 3.9, CORAL_YELLOW))):
        r = 1.0
        out = Vector((math.cos(a), 0.35, math.sin(a))).normalized()
        knob(parts, f"clump-{i}", (math.cos(a) * r, y, math.sin(a) * r), 0.45, paint, hexc, 5, height=0.7, axis=tuple(out))
    return parts, 200


def rock_crack():
    """すなの われめ (record ③): two low sandy ridges along Z, their inner walls dropping steeply into a crack that
    darkens to deep blue at the bottom, so it reads deep; a pebble and a little shell on the sand."""
    paint = Paint(0.9, glow={})
    parts: list = []
    # Cross-section of the right ridge (x > 0), from the crack's floor out: (x, y).
    sec = [(0.62, 0.0), (0.66, 1.0), (0.78, 2.1), (1.15, 2.85), (2.1, 3.0), (3.1, 2.4), (3.9, 1.1), (4.2, 0.0)]
    zs = [(-2.0, 0.55), (-1.55, 0.88), (-0.6, 1.0), (0.6, 1.0), (1.55, 0.88), (2.0, 0.55)]
    rng = random.Random(51)
    for side in (1, -1):
        verts = []
        for z, k_ in zs:
            for x, y in sec:
                verts.append((side * (0.62 + (x - 0.62) * (0.6 + 0.4 * k_)), y * k_ + (rng.uniform(-0.08, 0.08) if 0 < y < 3 else 0.0), z * (1.0 if y > 0 else 1.0)))
        m = len(sec)
        faces = []
        for j in range(len(zs) - 1):
            for i in range(m - 1):
                faces.append((j * m + i, j * m + i + 1, (j + 1) * m + i + 1, (j + 1) * m + i))
        faces.append(tuple(range(m)))
        last = (len(zs) - 1) * m
        faces.append(tuple(range(last + m - 1, last - 1, -1)))
        # The bottom (on the floor) closes it.
        faces.append(tuple([j * m for j in range(len(zs))] + [j * m + m - 1 for j in range(len(zs) - 1, -1, -1)]))

        def colour(c, n, side=side):
            inward = n.x * side < -0.35 and abs(c.x) < 1.3
            if n.y < -0.9:
                return SAND_FLOOR
            if inward:
                return CRACK_DEEP if c.y < 0.9 else (CRACK if c.y < 1.9 else CRACK_MID)
            if n.y > 0.55:
                return SAND if c.y > 2.2 else SAND_WET
            return SAND_WET if c.y > 1.0 else SAND_DEEP

        obj = k.add_mesh(parts, f"ridge-{side}", verts, faces, [])
        s.fix_normals(obj)
        paint_faces(obj, paint, colour, smooth=False)
    # The crack's floor, deep blue.
    k.add_box(parts, "crack-floor", (1.3, 0.06, 3.9), (0.0, 0.03, 0.0), paint(CRACK_DEEP))
    blob(parts, "pebble", (0.7, 0.4, 0.55), (2.9, 2.55, -1.1), paint, lambda c, n: PEBBLE_TOP if n.y > 0.5 else PEBBLE, 52, cut=False)
    starfish(parts, "starfish", (-2.3, 2.92, 0.7), 0.32, paint, 0.6, tilt=(0.05, 0.0))
    return parts, 300


# ---------------------------------------------------------------- whale

TAIL_ROOT = (0.0, 2.4, -5.2)
BLOWHOLE_AT = (0.0, 5.0, 1.8)


def whale():
    """くじら: a big round friendly whale, pastel blue with a cream belly from its chin back, two small round eyes with a
    shine (no mouth line, no smile, no teeth), soft flippers (cream underneath), a little blowhole on top, and a tail
    whose wide round flukes are cream underneath. Two nodes: `body`, and `tail` turning about its joint."""
    paint = Paint(0.6)
    # (The game lights it a little in its own colours under water: src/view/three/sea-models.ts.)
    material = md.paint_material("Whale", 0.55)
    body_parts: list = []
    # (z, centre y, half width, half height, power): the head round and big, the body tapering to the tail's root.
    rings = [(6.0, 2.35, 0.0, 0.0, 2), (5.86, 2.38, 0.95, 0.85, 2), (5.45, 2.45, 1.95, 1.8, 2.1), (4.75, 2.5, 2.6, 2.32, 2.2),
             (3.8, 2.5, 2.92, 2.5, 2.25), (2.5, 2.5, 3.0, 2.5, 2.25), (1.0, 2.5, 2.9, 2.45, 2.2), (-0.6, 2.55, 2.6, 2.25, 2.1),
             (-2.1, 2.58, 2.1, 1.85, 2.05), (-3.4, 2.55, 1.55, 1.38, 2), (-4.5, 2.47, 1.08, 0.98, 2), (-5.35, 2.42, 0.82, 0.76, 2),
             (-5.75, 2.4, 0.55, 0.5, 2), (-5.95, 2.4, 0.0, 0.0, 2)]
    trunk = md.loft_z(body_parts, "trunk", rings, 24, paint(WHALE))

    def section(z):
        """The body's section at z: (centre y, half height), between the rings round it."""
        for (z0, c0, _, h0, _), (z1, c1, _, h1, _) in zip(rings, rings[1:]):
            if z1 <= z <= z0:
                t = (z0 - z) / (z0 - z1) if z0 > z1 else 0.0
                return c0 + (c1 - c0) * t, max(0.05, h0 + (h1 - h0) * t)
        return 2.5, 2.5

    def body_colour(c, n):
        # The belly: the lower part of each section, a smooth band along the body from the chin back.
        cy_, hh = section(c.z)
        level = (c.y - cy_) / hh
        return WHALE_BELLY if level < -0.4 and c.z > -4.9 else WHALE

    paint_faces(trunk, paint, body_colour, smooth=True)
    tree = k.world_tree(trunk)
    # Eyes on the sides of the head, a little above the middle.
    for side in (-1, 1):
        v.eye(body_parts, paint, tree, (side * 1.6, 2.95, 3.9), Vector((side, 0.12, 0.25)).normalized(), (0.56, 0.66), f"eye-{side}", trunk)
    # The blowhole: a small dark oval on top.
    v.sticker(body_parts, "blowhole", BLOWHOLE_AT, (0, 1, 0), (0.5, 0.28), paint(BLOWHOLE), 8, tilt=math.pi / 2, lift=0.01)
    # Flippers: soft paddles out from the lower sides, swept back and drooping, cream underneath.
    for side in (-1, 1):
        root = Vector((side * 2.4, 1.25, 2.1))
        out = Vector((side * 0.9, -0.38, -0.32)).normalized()
        back = Vector((0, 0, -1))
        back = (back - out * back.dot(out)).normalized()
        outline = [(0.0, 0.5), (0.85, 0.62), (1.65, 0.48), (2.2, 0.1), (2.08, -0.35), (1.4, -0.6), (0.6, -0.55), (0.0, -0.4)]
        u, w = (out, back) if side > 0 else (out, -back)
        outline = outline if side > 0 else [(a, -b) for a, b in outline]
        pillow(body_parts, f"flipper-{side}", tuple(root), tuple(u), tuple(w), outline, 0.32, paint,
               WHALE if side > 0 else WHALE_BELLY, WHALE_BELLY if side > 0 else WHALE, inset=0.35)
    body = md.node(body_parts, "body", (0, 0, 0), material)

    tail_parts: list = []
    stock = [(-4.75, 2.42, 0.98, 0.9, 2), (-5.4, 2.4, 0.86, 0.78, 2), (-6.3, 2.4, 0.66, 0.55, 2), (-7.2, 2.4, 0.5, 0.36, 2.2),
             (-7.85, 2.4, 0.42, 0.26, 2.4), (-8.2, 2.4, 0.0, 0.0, 2)]
    stock_obj = md.loft_z(tail_parts, "stock", stock, 12, paint(WHALE))
    paint_faces(stock_obj, paint, lambda c, n: WHALE_BELLY if n.y < -0.6 and c.z > -6.0 else WHALE, smooth=True)
    # The flukes: two round lobes either side of a soft notch, flat, cream underneath.
    half = [(0.0, -7.25), (0.9, -7.35), (1.9, -7.7), (2.85, -8.4), (3.3, -9.25), (3.05, -9.85), (2.2, -9.75), (1.2, -9.35), (0.35, -9.05)]
    outline = [(x, z) for x, z in half] + [(-x, z) for x, z in reversed(half[1:])]
    outline = [(x, z) for x, z in outline]
    pillow(tail_parts, "flukes", (0.0, 2.4, 0.0), (1, 0, 0), (0, 0, -1), [(x, -z) for x, z in outline], 0.34, paint, WHALE, WHALE_BELLY,
           inset=0.3)
    tail = md.node(tail_parts, "tail", TAIL_ROOT, material)
    return [body, tail], 2500


# ---------------------------------------------------------------- fish

def fish(name):
    """さかな: a round little fish (no real species' markings): a plump body, a paler belly, a forked tail fin and a
    small fin on its back in a deeper shade, and two dark eyes with a shine. Head +Z."""
    body_hex, belly_hex, fin_hex = FISH[name]
    paint = Paint(0.6, glow={body_hex: 0.22, belly_hex: 0.22, fin_hex: 0.16})
    parts: list = []
    prof = [(0.45, 0.0), (0.33, 0.135), (0.1, 0.18), (-0.16, 0.13), (-0.27, 0.06)]
    segs = 5
    verts = [(0.0, 0.2, prof[0][0])]
    for z, r in prof[1:]:
        verts += [(math.cos(TAU * i / segs + math.pi / 2) * r, 0.2 + math.sin(TAU * i / segs + math.pi / 2) * r * 1.1, z) for i in range(segs)]
    faces = [(0, 1 + (i + 1) % segs, 1 + i) for i in range(segs)]
    for j in range(len(prof) - 2):
        a, b = 1 + j * segs, 1 + (j + 1) * segs
        faces += [(a + i, a + (i + 1) % segs, b + (i + 1) % segs, b + i) for i in range(segs)]
    last = 1 + (len(prof) - 2) * segs
    faces.append(tuple(range(last, last + segs)))
    v.painted(parts, "body", verts, faces, paint, lambda c, n: belly_hex if n.y < -0.35 else body_hex, smooth=True)
    # The tail fin: a forked plate standing up behind.
    s.plate(parts, "tail", (0.0, 0.2, -0.25), (0, 0, -1), (0, 1, 0),
            [(-0.02, -0.04), (0.2, -0.19), (0.16, -0.02), (0.2, 0.17), (-0.02, 0.04)], 0.03, [paint(fin_hex)])
    s.plate(parts, "dorsal", (0.0, 0.37, -0.02), (0, 0, 1), (0, 1, 0), [(-0.13, -0.02), (0.1, -0.02), (-0.08, 0.06)], 0.025, [paint(fin_hex)])
    tree = k.world_tree(parts[0])
    for side in (-1, 1):
        p, nrm = v.on_surface(tree, (side * 0.5, 0.25, 0.27), (0.0, 0.25, 0.27))
        v.sticker(parts, f"eye-{side}", tuple(p), tuple(nrm), (0.075, 0.085), paint(EYE), 5, lift=0.004)
        up = Vector((0, 1, 0))
        tangent_up = (up - nrm * nrm.dot(up)).normalized()
        v.sticker(parts, f"shine-{side}", tuple(p + tangent_up * 0.018 + Vector((0, 0, 0.012))), tuple(nrm), (0.026, 0.026), paint(SHINE), 3, lift=0.008)
    return parts, 80


# ---------------------------------------------------------------- the whale's current

def current_ring():
    """ながれの わ: a ring of light-blue water with white bubbles round it (some bigger), standing across the track; its
    centre 2.5 m up. One vertex-coloured mesh (the game draws it see-through, instanced)."""
    paint = Paint(0.4)
    parts: list = []
    seg, sides, big, small, cy = 16, 3, 2.25, 0.13, 2.5
    verts = []
    for i in range(seg):
        a = TAU * i / seg
        radial = Vector((math.cos(a), math.sin(a), 0.0))
        for j in range(sides):
            b = TAU * j / sides
            p = Vector((0.0, cy, 0.0)) + radial * (big + small * math.cos(b)) + Vector((0.0, 0.0, small * math.sin(b)))
            verts.append(tuple(p))
    faces = []
    for i in range(seg):
        a, b = i * sides, ((i + 1) % seg) * sides
        faces += [(a + j, a + (j + 1) % sides, b + (j + 1) % sides, b + j) for j in range(sides)]
    s.solid(parts, "ring", verts, faces, [paint(RING)], None, [True] * len(faces))
    for i in range(10):
        a = TAU * (i + 0.5) / 10
        r = 0.2 if i % 3 else 0.27
        c = (math.cos(a) * (big + 0.03), cy + math.sin(a) * (big + 0.03), 0.0)
        knob(parts, f"bubble-{i}", c, r, paint, BUBBLE, 4, height=r * 2)
    return parts, 200


# ---------------------------------------------------------------- Sakasa's bubbles and note

def pink_glass(alpha=0.55):
    m = bpy.data.materials.new("Pink bubble")
    m.use_nodes = True
    m.use_backface_culling = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    rgb = k.hex_linear(PINK)
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.15
    bsdf.inputs["Alpha"].default_value = alpha
    m.diffuse_color = (*rgb, 1.0)
    m.surface_render_method = "BLENDED"
    # A pink glow of its own: it stays a bright pink bubble under water.
    return md.glow(m, PINK, 0.35)


def awa(radius):
    """サカサの あわ: a see-through pink bubble (alpha 0.55) wound round by an opaque swirl band climbing round it like a
    candy stripe (deep pink and white in turn), and a white shine on its upper front."""
    paint = Paint(0.4, glow={PINK_DEEP: 0.2, SHINE: 0.4})
    parts: list = []
    k.add_ellipsoid(parts, "ball", (2 * radius, 2 * radius, 2 * radius), (0, radius, 0), pink_glass(), segments=12, rings=7)
    pts = []
    steps = 20
    for i in range(steps + 1):
        t = i / steps
        lat = math.radians(-66 + 132 * t)
        lon = TAU * 1.45 * t + 0.3
        r = radius * 1.025
        pts.append((math.cos(lat) * math.cos(lon) * r, radius + math.sin(lat) * r, math.cos(lat) * math.sin(lon) * r))
    # A flat band (a thin box section) lying on the ball, a little proud of it.
    frames = frames_along(pts)
    verts = []
    w, th = radius * 0.12, radius * 0.025
    for p_, (t_, _, _) in zip(pts, frames):
        c = Vector(p_)
        out = (c - Vector((0, radius, 0))).normalized()
        across = t_.cross(out).normalized()
        for du, dv in ((-w, -th), (w, -th), (w, th), (-w, th)):
            verts.append(tuple(c + across * du + out * dv))
    faces = [(3, 2, 1, 0)]
    cols = [PINK_DEEP]
    for i in range(steps):
        faces += s.ring_faces(i * 4, (i + 1) * 4, 4)
        cols += [PINK_DEEP if (i // 2) % 2 == 0 else SHINE] * 4
    last = steps * 4
    faces.append((last, last + 1, last + 2, last + 3))
    cols.append(cols[-1])
    v.painted(parts, "band", verts, faces, paint, cols, smooth=False)
    d = Vector((-0.42, 0.62, 0.66)).normalized()
    shine_at = Vector((0, radius, 0)) + d * radius
    v.sticker(parts, "shine", tuple(shine_at), tuple(d), (radius * 0.34, radius * 0.22), paint(SHINE), 6, tilt=0.6, lift=radius * 0.03)
    return parts, 320


def awa_note():
    """サカサの かみ: a little sheet of cream paper standing up, a pink swirl and two faint lines on both faces (the
    words are shown by the game's card, mirror-written)."""
    paint = Paint(0.8, glow={PINK_DEEP: 0.15})
    parts: list = []
    k.add_box(parts, "paper", (0.9, 1.2, 0.05), (0.0, 0.6, 0.0), paint(PAPER))
    for face in (1, -1):
        z = face * 0.026
        pts = []
        for i in range(9):
            a = i * 0.95 + 0.2
            r = 0.03 + i * 0.032
            pts.append((0.08 * face + math.cos(a) * r, 0.78 + math.sin(a) * r, z))
        swirl = k.ribbon_decal(parts, f"swirl-{face}", pts, 0.055, paint(PINK_DEEP), taper=False)
        if face < 0:
            swirl.data.flip_normals()
        for j, y in enumerate((0.36, 0.22)):
            line = k.ribbon_decal(parts, f"line-{face}-{j}", [(-0.3 * face, y, z), (0.22 * face, y, z)], 0.035, paint(PAPER_LINE), taper=False)
            if face < 0:
                line.data.flip_normals()
    return parts, 60


# ---------------------------------------------------------------- records

def rainbow_shell():
    """にじいろの かいがら (record ①): a round scallop shell lying on the sand, its ribs in the six colours of the
    rainbow fanning out from the hinge (back, -Z) with its two little ears; it glows a little."""
    glow = {h: 0.22 for h in RAINBOW}
    glow.update({hexmix(h, "#FFFFFF", 0.35): 0.26 for h in RAINBOW})
    paint = Paint(0.45, glow=dict(glow, **{CLAM_IN: 0.2}))
    parts: list = []
    hinge = Vector((0.0, 0.06, -0.52))
    n_ang = 24
    th_max = math.radians(72)
    rings = [0.28, 0.56, 0.8, 1.0]

    def rim_len(th):
        c = 0.55 * math.cos(th)
        return c + math.sqrt(max(0.0, 0.0575 + 0.3025 * math.cos(th) ** 2))

    def point(i, f):
        th = -th_max + 2 * th_max * i / n_ang
        L = rim_len(th) * f
        side = i in (0, n_ang)
        dome = 0.0 if side else 0.36 * math.sin(math.pi * min(1.0, f * 0.95)) ** 0.7 * (1 - (abs(th) / th_max) ** 3)
        rib = 0.0 if side else (0.035 * f if i % 2 else 0.0)
        y = 0.06 + dome + rib - 0.03 * f
        return (math.sin(th) * L * 1.04, max(0.03, y), hinge.z + math.cos(th) * L)

    verts = [tuple(hinge)]
    for f in rings:
        verts += [point(i, f) for i in range(n_ang + 1)]
    m = n_ang + 1
    faces, cols = [], []
    for i in range(n_ang):
        col = RAINBOW[min(5, i * 6 // n_ang)]
        faces.append((0, 1 + i + 1, 1 + i))
        cols.append(col)
        for j in range(len(rings) - 1):
            a, b = 1 + j * m, 1 + (j + 1) * m
            faces.append((a + i, a + i + 1, b + i + 1, b + i))
            cols.append(hexmix(col, "#FFFFFF", 0.35) if (i % 2 == 1 and j < 2) or j == len(rings) - 2 else col)
    # The underside: the hinge and the whole boundary, flat underneath.
    boundary = [0] + [1 + j * m for j in range(len(rings))] + [1 + (len(rings) - 1) * m + i for i in range(1, n_ang + 1)] + \
               [1 + j * m + n_ang for j in range(len(rings) - 2, -1, -1)]
    under = len(verts)
    verts += [(verts[i][0], 0.0, verts[i][2]) for i in boundary]
    nb = len(boundary)
    faces.append(tuple(range(under + nb - 1, under - 1, -1)))
    cols.append(CLAM_IN)
    for q in range(nb):
        a, b = boundary[q], boundary[(q + 1) % nb]
        faces.append((a, b, under + (q + 1) % nb, under + q))
        cols.append(CLAM_IN)
    v.painted(parts, "shell", verts, faces, paint, cols, smooth=False)
    # The ears either side of the hinge.
    for side in (-1, 1):
        s.plate(parts, f"ear-{side}", (side * 0.17, 0.05, -0.47), (side, 0, 0), (0, 0, 1),
                [(-0.12, -0.08), (0.1, -0.1), (0.13, 0.06), (-0.1, 0.08)], 0.07, [paint(hexmix(RAINBOW[2], "#FFFFFF", 0.35))])
    return parts, 300


def cup(center, radius, depth, scallops, segs, out_hex, rib_hex, in_hex, paint, name, parts, thick=0.04):
    """A round shell (a shallow cup with a wavy rim) opening upward at `center` (the rim's middle), its bottom `depth`
    below: outside in two alternating tones (ribs), inside pale. Returns the object."""
    c = Vector(center)
    out_rings = [(0.0, -depth), (0.68, -depth * 0.62), (1.0, 0.0)]
    in_rings = [(0.94, -thick * 0.2), (0.5, -depth * 0.62 + thick), (0.0, -depth + thick)]
    verts, ring_starts = [], []
    for f, y in out_rings + in_rings:
        if f == 0.0:
            ring_starts.append(("point", len(verts)))
            verts.append(tuple(c + Vector((0, y, 0))))
            continue
        ring_starts.append(("ring", len(verts)))
        for i in range(segs):
            a = TAU * i / segs
            wav = 1.0 + 0.025 * math.cos(scallops * a)
            yy = y + (0.035 * math.cos(scallops * a) if f >= 0.94 else 0.0)
            verts.append(tuple(c + Vector((math.cos(a) * radius * f * wav, yy, math.sin(a) * radius * f * wav))))
    faces = md.close_rings(ring_starts, segs)
    obj = k.add_mesh(parts, name, verts, faces, [])
    s.fix_normals(obj)

    def colour(cc, n):
        rel = cc - c
        r = math.hypot(rel.x, rel.z)
        inside = n.dot(Vector((0, 1, 0))) > 0.0 and rel.y > -depth + thick * 0.5 and r < radius * 0.96
        if inside:
            return in_hex
        a = math.atan2(rel.z, rel.x)
        return rib_hex if int((a / TAU) * segs * 0.5 + 100) % 2 else out_hex

    paint_faces(obj, paint, colour, smooth=True)
    return obj


def pearl_clam():
    """うみの しんじゅ (record ②): a round pink clam opened wide, its wavy-edged shells ribbed outside and pale inside,
    the top one hinged at the back and lifted, and a big white pearl in it that glows a little."""
    from mathutils import Matrix
    paint = Paint(0.5, glow={PEARL: 0.4, CLAM_IN: 0.24, CLAM: 0.1, CLAM_RIB: 0.1})
    parts: list = []
    R, rim_y = 0.585, 0.28
    cup((0.0, rim_y, 0.0), R, 0.27, 7, 14, CLAM, CLAM_RIB, CLAM_IN, paint, "bottom", parts)
    # The lid: the same cup turned over (its inside down), its back edge on the hinge, then opened up 64 degrees.
    lid = cup((0.0, 0.0, 0.0), R, 0.2, 7, 14, CLAM, CLAM_RIB, CLAM_IN, paint, "lid", parts)
    hinge = Vector((0.0, rim_y + 0.01, -R))
    flip = Matrix.Rotation(math.pi, 4, "X")  # (x, y, z) -> (x, -y, -z): the dome up, the rim still round z -R..R
    to_hinge = Matrix.Translation(Vector((0.0, hinge.y, 0.0)))  # lying shut on the bottom shell, its back edge on the hinge
    open_ = Matrix.Translation(hinge) @ Matrix.Rotation(math.radians(-64), 4, "X") @ Matrix.Translation(-hinge)
    transform(lid, open_ @ to_hinge @ flip)
    k.add_ellipsoid(parts, "pearl", (0.42, 0.42, 0.42), (0.0, rim_y + 0.02, 0.04), paint(PEARL), segments=8, rings=5)
    return parts, 300


def iron_star():
    """うみに おちた ながれぼし (record ③): a chunky five-point star of grey-blue iron, its top facets lighter, with two
    white sparkles on it."""
    paint = Paint(0.4, glow={SHINE: 0.6, STAR_LIGHT: 0.12})
    parts: list = []
    outer, inner, h = 0.42, 0.2, 0.3
    rings = [(0.68, h), (1.0, h * 0.55), (0.72, h * 0.06)]
    verts = []
    for f, y in rings:
        for i in range(10):
            a = math.pi / 2 + TAU * i / 10
            r = (outer if i % 2 == 0 else inner) * f
            verts.append((math.cos(a) * r, y, math.sin(a) * r))
    faces = [tuple(range(9, -1, -1))]  # the flat top (wound up after fix_normals)
    for j in range(2):
        a, b = j * 10, (j + 1) * 10
        faces += [(a + i, a + (i + 1) % 10, b + (i + 1) % 10, b + i) for i in range(10)]
    faces.append(tuple(range(20, 30)))
    v.painted(parts, "star", verts, faces, paint, lambda c, n: STAR_LIGHT if n.y > 0.95 else (STAR_TOP if n.y > 0.2 else STAR),
              smooth=False)
    for i, (x, z, sz) in enumerate(((0.04, 0.02, 0.11), (-0.09, -0.1, 0.065))):
        flat_star(parts, f"sparkle-{i}", (x, h + 0.004, z), (0, 1, 0), sz, sz * 0.28, 4, paint, SHINE, turn=0.3 * i)
    return parts, 200


# ---------------------------------------------------------------- export and preview

BUILDERS = {"sandbar": sandbar, "reef": reef, "sand-island": sand_island, "palm": palm, "kelp": kelp, "coral-a": coral_a,
            "coral-b": coral_b, "coral-c": coral_c, "coral-arch": coral_arch, "coral-pillar": coral_pillar,
            "rock-crack": rock_crack, "whale": whale, "fish-a": lambda: fish("fish-a"), "fish-b": lambda: fish("fish-b"),
            "current-ring": current_ring, "awa-big": lambda: awa(2.5), "awa-pink": lambda: awa(0.7), "awa-note": awa_note,
            "rainbow-shell": rainbow_shell, "pearl-clam": pearl_clam, "iron-star": iron_star}
# The mounds keep the origin they are built round (the rail's line); the palm and the kelp their root; the arch and the
# ring their middle (the track runs through them). The rest are centred on their bounding box, bottom on the floor.
KEEP = {"sandbar", "reef", "sand-island"}
KEEP_XZ = {"palm", "kelp", "coral-arch", "current-ring", "rock-crack"}
# One vertex-coloured mesh (the kelp: its sway shader; the ring: the game's own see-through material) or named nodes.
VERTEX = {"kelp", "current-ring"}
NODES = {"whale"}
# Exact sizes the stand-ins (or the ticket, where the stand-in was a rough shape) had.
EXACT = {"fish-a": (0.36, 0.4, 0.9), "fish-b": (0.36, 0.4, 0.9), "iron-star": (0.85, 0.5, 0.85), "rainbow-shell": (1.2, 0.5, 1.2),
         "coral-a": (4.0, 3.0, 4.0), "coral-b": (4.0, 3.5, 0.8), "coral-c": (3.0, 1.8, 3.0),
         "coral-pillar": (3.0, 10.1, 3.0), "palm": (5.0, 9.0, 5.0), "kelp": (1.3, 12.0, 0.6), "current-ring": (5.0, 5.0, 0.4),
         "rock-crack": (8.4, 3.0, 4.0)}
VIEWS = {"sandbar": (0.75, -0.55, 0.45), "reef": (0.75, -0.55, 0.45), "sand-island": (0.75, -0.55, 0.45), "palm": (0.55, -0.72, 0.3),
         "kelp": (0.45, -0.85, 0.2), "coral-b": (0.35, -0.9, 0.3), "coral-arch": (0.45, -0.85, 0.25), "coral-pillar": (0.5, -0.8, 0.3),
         "whale": (0.72, -0.62, 0.3), "fish-a": (0.75, -0.55, 0.3), "fish-b": (0.75, -0.55, 0.3), "current-ring": (0.45, -0.85, 0.2),
         "awa-note": (0.35, -0.9, 0.15), "rock-crack": (0.35, -0.6, 0.75), "rainbow-shell": (0.4, -0.6, 0.8), "pearl-clam": (0.3, -0.75, 0.6),
         "iron-star": (0.4, -0.6, 0.8)}
TALL = {"palm", "kelp", "coral-pillar", "awa-note"}


def finish(model, name):
    """Size and origin as the stand-in had them."""
    if name in EXACT:
        v.scale_to(model, EXACT[name])
    if name in KEEP:
        v.floor_to_zero(model)
    else:
        k.normalize(model, None, center=name not in KEEP_XZ)


if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if a in BUILDERS] or list(BUILDERS)
    for name in names:
        k.reset()
        built, budget = BUILDERS[name]()
        size = (400, 512) if name in TALL else (512, 400)
        if name in NODES:
            objects = built
            md.export_glb(objects, name, budget)
            md.preview(objects, name, VIEWS.get(name, (0.55, -0.72, 0.42)), size=size)
            continue
        if DEBUG and not isinstance(built, bpy.types.Object):
            bpy.context.view_layer.update()
            for part in built:
                _, lo, hi = k.model_metrics(part)
                print("   part", part.name, [round(x, 2) for x in lo], [round(x, 2) for x in hi])
        model = built if isinstance(built, bpy.types.Object) else k.join(built, name)
        model.name = name
        model.data.name = name
        model.data.validate()
        finish(model, name)
        if name in VERTEX:
            md.export_glb([model], name, budget)
            md.preview([model], name, VIEWS.get(name, (0.55, -0.72, 0.42)), size=size)
        else:
            s.export_glb(model, name, budget)
            v.preview(model, name, VIEWS.get(name, (0.55, -0.72, 0.42)), size=size)
