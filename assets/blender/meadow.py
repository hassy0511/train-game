"""Stage 2-2 (むしのはらっぱ) — Claude Code. Ticket 0008 (and 2-2's dive record of ticket 0011).

The crafted look (つくりこみ), chosen for every model on 2026-10-15 (docs/ASSET_PIPELINE.md §1). The train has shrunk
to the size of a bug: grass is a forest to look up at, clover leaves are decks the track runs on, flowers are towers,
a puddle is a pond. Toy-like and bright, rounded where it can be; the bugs are friends, round and simple, with eyes only
(no mouth, fangs, spikes or bristles) and no markings of a real species.

grass-blade, clover, clover-four (record "よつばの クローバー"), meadow-flower, water-strip, grasshopper, butterfly,
dandelion-seed (record "たんぽぽの わたげ"), spider, rail-web and record-marble (the record "みずたまりの そこ" on the
pond floor). Same names, sizes, origins and orientation as the code stand-ins they replace, so the stage JSON does not
change: origin at the bottom centre, +Z forward (the bugs' heads), the model's own left is +X. Exceptions:
- butterfly: origin at the middle of its body ("origin": "joint" in assets/models.json).
- rail-web: the web stands in the XY plane, seen from +Z; origin at its lowest point (the foot of the bottom spoke).
- meadow-flower: the top of its yellow middle is exactly 30 m (src/view/three/meadow.ts scales it by height / 30).
- clover: the top of its leaves is flat at exactly 1.5 m (track and stations stand on it at scale 2).
Moving parts (src/view/three/meadow.ts finds them with getObjectByName) are named nodes whose origin is the joint:
- grasshopper: `body` (origin), `head` (the neck [0, 0.95, 1.0]) with its children `antenna-left` (+X) and
  `antenna-right` (-X) at their roots on the head, `leg-left` (+X) and `leg-right` (-X), the big hind legs, at the hips
  [+-0.38, 0.74, -0.22].
- butterfly: `body`, and `wing-left` (+X) and `wing-right` (-X) on the body's centre line; at rotation 0 the wings rise
  a little outward.
Colours: the static models are plain-coloured parts (the game bakes them into one draw call per ground cell). The models
whose colour runs as a gradient (grass-blade from root to tip, water-strip deeper in the middle) and the moving bugs are
vertex-coloured with one material, so each node is one draw call; water-strip and the marble's glass are see-through.
Output: public/models/<name>.glb and assets/previews/<name>.png.
Run: python3 scripts/run-bpy.py assets/blender/meadow.py [-- name ...]
"""
from __future__ import annotations

from pathlib import Path
import json
import math
import random
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

TAU = 2 * math.pi

# Palette (ticket 0008).
GRASS_ROOT = "#5E9E3A"
GRASS_TIP = "#A5D66B"
CLOVER = "#5DAE4B"
CLOVER_MARK = "#A8D88F"
CLOVER_STEM = "#4F9A3F"
CLOVER_FOUR = "#67BC50"
CLOVER_FOUR_RIM = "#B2E68A"
CLOVER_FOUR_MARK = "#D6F3C2"
FLOWER_STEM = "#6BA84F"
FLOWER_LEAF = "#7DB85C"
PETAL = "#F4A7C0"
PETAL_INNER = "#F9C9D8"
FLOWER_CENTRE = "#FFD95A"
WATER = "#8FD3F0"
HOPPER = "#7CCB3A"
HOPPER_BELLY = "#B8E07A"
HOPPER_LEG = "#6CBA32"
HOPPER_FEELER = "#4E8A2A"
WING = "#FFD95A"
WING_BASE = "#FFB547"  # the wings' warm root
WING_DOT = "#FFFFFF"
BUTTERFLY_BODY = "#6B5A8E"
SEED = "#B08A5A"
SEED_TOP = "#C49E6C"
FLUFF = "#FFFFFF"
FLUFF_STALK = "#EEE8DA"
SPIDER = "#B9A3E0"
SPIDER_TOP = "#D2C4EE"
SPIDER_LEG = "#9F88CF"
WEB_RAIL = "#9AA3AD"
WEB_SLEEPER = "#6B4E2E"
WEB_SILK = "#F4F7FF"
EYE_WHITE = "#FFFFFF"
EYE_DARK = "#2B3A4A"


def mat(name: str, hex_color: str, roughness: float = 0.8, glow_: float = 0.0) -> bpy.types.Material:
    """Flat colour; `glow_` adds that much of the colour as emission (petal undersides lit only from the ground)."""
    m = k.material(name, hex_color, roughness)
    return glow(m, hex_color, glow_) if glow_ else m


def glow(material_: bpy.types.Material, hex_color: str, strength: float) -> bpy.types.Material:
    """Adds an even glow of `hex_color` to a material (a vertex-coloured one cannot glow per vertex)."""
    bsdf = material_.node_tree.nodes["Principled BSDF"]
    rgb = k.hex_linear(hex_color)
    bsdf.inputs["Emission Color"].default_value = (rgb[0] * strength, rgb[1] * strength, rgb[2] * strength, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 1.0
    return material_


def mix_hex(a: str, b: str, t: float) -> str:
    """sRGB mix of two hex colours (t clamped to 0..1)."""
    t = max(0.0, min(1.0, t))
    ca = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    cb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02X}" for x, y in zip(ca, cb))


def paint_material(name: str, roughness: float = 0.6, alpha: float = 1.0) -> bpy.types.Material:
    """One material whose colour is the mesh's "paint" colour attribute (exported as vertex colours); see-through
    (alpha blended) when alpha < 1."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = True
    tree = m.node_tree
    bsdf = tree.nodes["Principled BSDF"]
    node = tree.nodes.new("ShaderNodeVertexColor")
    node.layer_name = "paint"
    tree.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = roughness
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
    return m


def paint_corners(obj, colour_at) -> None:
    """Fills the "paint" attribute: colour_at(polygon, glTF position of the corner's vertex) -> hex colour."""
    mesh = obj.data
    attr = mesh.color_attributes.new(name="paint", type="FLOAT_COLOR", domain="CORNER")
    cache: dict[str, tuple] = {}
    values = [0.0] * (len(mesh.loops) * 4)
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            hex_color = colour_at(poly, k.gltf(mesh.vertices[mesh.loops[li].vertex_index].co))
            rgb = cache.get(hex_color) or cache.setdefault(hex_color, k.hex_linear(hex_color))
            values[li * 4:li * 4 + 4] = (*rgb, 1.0)
    attr.data.foreach_set("color", values)


def bake_colours(obj, material_: bpy.types.Material, shade=None, keep=()) -> None:
    """Turns the per-face material colours into vertex colours and gives the mesh one material instead.
    `shade(material name, glTF position)` may return another hex colour for a corner (a gradient), or None.
    Materials named in `keep` stay as they are (after the vertex-coloured one)."""
    mesh = obj.data
    old = list(mesh.materials)
    colours = [m.diffuse_color[:3] for m in old]
    kept = [m for m in old if m.name in keep]
    attr = mesh.color_attributes.new(name="paint", type="FLOAT_COLOR", domain="CORNER")
    values = [0.0] * (len(mesh.loops) * 4)
    for poly in mesh.polygons:
        rgb = colours[poly.material_index]
        name = old[poly.material_index].name
        for li in poly.loop_indices:
            hex_color = shade(name, k.gltf(obj.matrix_world @ mesh.vertices[mesh.loops[li].vertex_index].co)) if shade else None
            values[li * 4:li * 4 + 4] = (*(k.hex_linear(hex_color) if hex_color else rgb), 1.0)
    attr.data.foreach_set("color", values)
    index = [1 + kept.index(m) if m in kept else 0 for m in old]
    for poly in mesh.polygons:
        poly.material_index = index[poly.material_index]
    mesh.materials.clear()
    mesh.materials.append(material_)
    for m in kept:
        mesh.materials.append(m)


# ---------------------------------------------------------------- mesh helpers (glTF coordinates)

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


def solid(parts, name, verts, faces, materials, indices=None, smooth=False):
    """A closed part: faces wound outward afterwards."""
    obj = k.add_mesh(parts, name, verts, faces, materials, indices, smooth=smooth)
    fix_normals(obj)
    return obj


def ring_faces(a: int, b: int, n: int):
    """Quads joining ring a (n vertices from index a) to ring b."""
    return [(a + i, a + (i + 1) % n, b + (i + 1) % n, b + i) for i in range(n)]


def outward_normals(pts):
    """Unit normals (x, z) pointing out of a closed outline, at each of its points."""
    n = len(pts)
    area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
    out = []
    for i in range(n):
        (ax, az), (bx, bz) = pts[i - 1], pts[(i + 1) % n]
        tx, tz = bx - ax, bz - az
        length = math.hypot(tx, tz) or 1.0
        # Counter-clockwise outline: the outside is to the right of the direction of travel.
        nx, nz = (tz / length, -tx / length) if area > 0 else (-tz / length, tx / length)
        out.append((nx, nz))
    return out


def inset(pts, d):
    """The outline moved `d` m inward along its normals."""
    return [(x - d * nx, z - d * nz) for (x, z), (nx, nz) in zip(pts, outward_normals(pts))]


def slab(parts, name, outline, y_top, y_bottom, bevel, mats, top_y=None):
    """A thick leaf on the outline (x, z): a flat (or `top_y(x, z)`-shaped) top, a rounded bevel round its edge,
    straight sides and a flat bottom. mats = (top, bevel, side, bottom). Returns the object."""
    n = len(outline)
    lift = top_y or (lambda x, z: 0.0)
    inner = inset(outline, bevel)
    rings = [
        [(x, y_top + lift(x, z), z) for x, z in inner],
        [(x, y_top - bevel * 0.85 + lift(x, z), z) for x, z in outline],
        [(x, y_bottom + lift(x, z) * 0.6, z) for x, z in outline],
    ]
    verts = [p for r in rings for p in r]
    faces = [tuple(range(n))] + ring_faces(0, n, n) + ring_faces(n, 2 * n, n) + [tuple(range(3 * n - 1, 2 * n - 1, -1))]
    indices = [0] + [1] * n + [2] * n + [3]
    return solid(parts, name, verts, faces, list(mats), indices)


def close_rings(starts, sides):
    """Faces joining a run of rings (("ring", first vertex) of `sides` vertices, or ("point", vertex)) in order, with
    flat caps on rings at the ends."""
    faces = []
    for (ka, ia), (kb, ib) in zip(starts, starts[1:]):
        if ka == "ring" and kb == "ring":
            faces += ring_faces(ia, ib, sides)
        elif ka == "point":
            faces += [(ia, ib + (i + 1) % sides, ib + i) for i in range(sides)]
        else:
            faces += [(ia + i, ia + (i + 1) % sides, ib) for i in range(sides)]
    if starts[0][0] == "ring":
        faces.append(tuple(range(starts[0][1] + sides - 1, starts[0][1] - 1, -1)))
    if starts[-1][0] == "ring":
        faces.append(tuple(range(starts[-1][1], starts[-1][1] + sides)))
    return faces


def lathe(parts, name, a, b, profile, sides, m, smooth=True):
    """A round closed body along the line a -> b: profile = [(t, radius)] from t = 0 (at a) to 1 (at b); a radius of 0
    at either end closes it in a point, otherwise with a flat cap."""
    a, b = Vector(a), Vector(b)
    axis = (b - a).normalized()
    ref = Vector((0, 1, 0)) if abs(axis.y) < 0.9 else Vector((1, 0, 0))
    u = axis.cross(ref).normalized()
    v = axis.cross(u).normalized()
    verts, starts = [], []
    for t, r in profile:
        c = a + (b - a) * t
        if r <= 1e-6:
            verts.append(tuple(c))
            starts.append(("point", len(verts) - 1))
            continue
        starts.append(("ring", len(verts)))
        for i in range(sides):
            ang = TAU * i / sides
            verts.append(tuple(c + u * (math.cos(ang) * r) + v * (math.sin(ang) * r)))
    return solid(parts, name, verts, close_rings(starts, sides), [m], smooth=smooth)


def loft_z(parts, name, rings, sides, m, smooth=True):
    """A round closed body along Z: rings = [(z, centre y, half width, half height, power)], power 2 for an ellipse and
    more for a squarer section; a ring of zero size closes the end in a point (otherwise a flat cap)."""
    verts, starts = [], []
    for z, cy, rx, ry, power in rings:
        if rx <= 1e-6:
            verts.append((0.0, cy, z))
            starts.append(("point", len(verts) - 1))
            continue
        starts.append(("ring", len(verts)))
        for i in range(sides):
            c, s_ = math.cos(TAU * i / sides), math.sin(TAU * i / sides)
            verts.append((math.copysign(abs(c) ** (2 / power), c) * rx, cy + math.copysign(abs(s_) ** (2 / power), s_) * ry, z))
    return solid(parts, name, verts, close_rings(starts, sides), [m], smooth=smooth)


def lens(parts, name, center, normal, size, m, segments=8, rings=4):
    """A flattened round piece (w, h, thickness) lying on a surface whose normal is `normal` (a pupil, a shine)."""
    obj = k.add_ellipsoid(parts, name, (size[0], size[1], size[2]), center, m, segments=segments, rings=rings)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, -1, 0)).rotation_difference(Vector(k.to_blender(Vector(normal).normalized())))
    return obj


def bead(parts, name, center, width, height, sides, m, axis=(0.0, 1.0, 0.0), smooth=False):
    """A small bipyramid (2 x sides triangles): a feeler's tip, a tuft, a dew drop."""
    c, ax = Vector(center), Vector(axis).normalized()
    return lathe(parts, name, tuple(c - ax * (height / 2)), tuple(c + ax * (height / 2)), [(0, 0.0), (0.5, width / 2), (1, 0.0)], sides, m,
                 smooth=smooth)


def tube(parts, name, points, radii, sides, m, smooth=True):
    """A closed round tube along a polyline (flat caps)."""
    obj = k.add_swept_tube(parts, name, points, radii, [m] * (len(points) - 1), sides=sides, smooth=smooth)
    fix_normals(obj)
    return obj


def dot(parts, name, center, radius, sides, m, up=True):
    """A flat round spot lying on a horizontal surface, facing up (or down)."""
    cx, cy, cz = center
    verts = [(cx, cy, cz)] + [(cx + math.cos(TAU * i / sides) * radius, cy, cz + math.sin(TAU * i / sides) * radius) for i in range(sides)]
    faces = [(0, 1 + i, 1 + (i + 1) % sides) for i in range(sides)]
    obj = k.add_mesh(parts, name, verts, faces, [m])
    if (obj.data.polygons[0].normal.z > 0) != up:  # Blender +Z is glTF +Y
        obj.data.flip_normals()
    return obj


def set_origin(obj, point) -> None:
    """Moves the object's origin (its node's pivot) to `point` (glTF) without moving its mesh."""
    k.active(obj)
    bpy.context.scene.cursor.location = k.to_blender(point)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = (0, 0, 0)


def node(parts, name, pivot, material_, shade=None):
    """Joins `parts` into the named node `name` with its origin at `pivot`, coloured by vertex (one material)."""
    obj = k.join(parts, name)
    bake_colours(obj, material_, shade)
    set_origin(obj, pivot)
    return obj


def attach(child, parent) -> None:
    """Parents `child` to `parent`, keeping where it is."""
    bpy.context.view_layer.update()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


# ---------------------------------------------------------------- grass

def grass_blade():
    """A tall grass blade, 3 x 38 x 1.5 m (scale 0.7-1.3 in the grass forest, leaning 30 degrees in the tunnel, a
    stalk under a leaf at small scale). A blade folded along its midrib: a shallow V channel in front, a keel behind,
    narrow at the root like a sheath, widest low down, tapering to a rounded point; it twists a little as it climbs
    and arches toward +Z. Dark green at the root to light at the tip (vertex colours), flat shaded."""
    H = 38.0
    ts = [0.0, 0.11, 0.27, 0.44, 0.61, 0.77, 0.9]
    BEND = 1.2

    def half_width(t):
        if t < 0.17:
            return 1.18 + (1.5 - 1.18) * math.sin(t / 0.17 * math.pi / 2)
        u = (t - 0.17) / 0.83
        return 1.5 * (1 - u ** 1.75)

    def ring(t):
        w = half_width(t)
        fold = 0.17 * w
        keel = 0.22 * (1 - t) + 0.06
        twist = 0.3 * t
        pts = []
        for x, z in ((-w, fold), (0.0, 0.0), (w, fold), (0.0, -keel)):
            xr = x * math.cos(twist) + z * math.sin(twist)
            zr = -x * math.sin(twist) + z * math.cos(twist)
            pts.append((xr, H * t, zr + BEND * t ** 2.1))
        return pts

    verts = [p for t in ts for p in ring(t)]
    tip = len(verts)
    verts.append((0.0, H, BEND))
    faces = [(3, 2, 1, 0)]
    for j in range(len(ts) - 1):
        faces += ring_faces(4 * j, 4 * (j + 1), 4)
    last = 4 * (len(ts) - 1)
    faces += [(last + i, last + (i + 1) % 4, tip) for i in range(4)]
    parts: list = []
    blade = solid(parts, "blade", verts, faces, [paint_material("Grass", 0.85)])

    def colour(poly, p):
        t = max(0.0, min(1.0, p.y / H))
        edge = abs(p.x) > 0.25 * half_width(t) + 0.05  # the blade's edges a touch lighter than its midrib
        return mix_hex(GRASS_ROOT, GRASS_TIP, min(1.0, t ** 0.85 + (0.06 if edge else 0.0)))

    paint_corners(blade, colour)
    return blade, 60


# ---------------------------------------------------------------- clover

def heart_outline(n: int, length: float):
    """A clover leaflet (x across, u out from the stem): a rounded heart with a shallow notch at its outer end and its
    point at u = 0 (where the leaflets meet), sampled by arc length (notch and point always included)."""
    dense = []
    for i in range(720):
        s = TAU * i / 720
        x = 16 * math.sin(s) ** 3
        y = 13 * math.cos(s) - 3.5 * math.cos(2 * s) - 1.5 * math.cos(3 * s) - 0.6 * math.cos(4 * s)
        dense.append((x, y))
    lengths = [0.0]
    for i in range(1, len(dense) + 1):
        (ax, ay), (bx, by) = dense[i - 1], dense[i % len(dense)]
        lengths.append(lengths[-1] + math.hypot(bx - ax, by - ay))
    total = lengths[-1]
    pts = []
    j = 0
    for i in range(n):
        target = total * i / n
        while lengths[j + 1] < target:
            j += 1
        f = (target - lengths[j]) / (lengths[j + 1] - lengths[j])
        (ax, ay), (bx, by) = dense[j], dense[(j + 1) % len(dense)]
        pts.append((ax + (bx - ax) * f, ay + (by - ay) * f))
    bottom = -13 - 3.5 + 1.5 - 0.6  # y at the point (s = pi)
    scale = length / (10.87 - bottom)
    return [(x * scale, (y - bottom) * scale) for x, y in pts]


def chevron(parts, name, along, across, length, y_at, m):
    """The pale V on a leaflet, its point toward the stem: two bars lying on the leaf (height y_at(x, z)), facing up."""
    def at(u, v):
        x, z = along[0] * u + across[0] * v, along[1] * u + across[1] * v
        return (x, y_at(x, z), z)
    w = 0.085 * length
    apex_u, end_u, end_v = 0.33 * length, 0.6 * length, 0.3 * length
    verts = [at(apex_u, 0.0), at(apex_u + w * 1.4, 0.0)]
    faces = []
    for side in (1, -1):
        i = len(verts)
        verts += [at(end_u, side * end_v), at(end_u + w * 0.2, side * (end_v - w * 1.05))]
        faces.append((0, i, i + 1, 1))
    obj = k.add_mesh(parts, name, verts, faces, [m])
    for poly in obj.data.polygons:
        if poly.normal.z < 0:  # Blender +Z is glTF +Y: face up
            poly.flip()
    obj.data.update()
    return obj


def clover_shape(leaves, length, top, thick, bevel, n, mats, mark, stem_m, stem_sides, cup=0.0):
    """Leaflets round the stem (the first toward +Z), each a thick heart with a bevelled rim and a pale V on top."""
    parts: list = []
    for i in range(leaves):
        a = math.pi / 2 + TAU * i / leaves
        along = (math.cos(a), math.sin(a))
        across = (-math.sin(a), math.cos(a))
        outline = [(along[0] * u + across[0] * v, along[1] * u + across[1] * v) for v, u in heart_outline(n, length)]
        # Counter-clockwise in (x, z) for inset(): the slab helper winds the faces itself.
        # Cupped: each leaflet tips up toward its outer end (a plane, so its top stays flat and the V lies on it).
        lift = (lambda x, z, d=along: cup * (x * d[0] + z * d[1]) / length) if cup else None
        slab(parts, f"leaf-{i}", outline, top - cup, top - thick, bevel, mats, lift)
        chevron(parts, f"mark-{i}", along, across, length, lambda x, z: top - cup + (lift(x, z) if lift else 0.0) + 0.015, mark)
    stem_top = top - thick + 0.05
    lathe(parts, "stem", (0, 0, 0), (0, stem_top, 0), [(0, 0.16 * length / 7.3), (1, 0.11 * length / 7.3)], stem_sides, stem_m, smooth=False)
    return parts


def fit_xz(model, width, depth):
    """Scales x and z (not y) so the model's footprint is exactly width x depth, centred on the origin."""
    _, lo, hi = k.model_metrics(model)
    model.scale = (width / (hi[0] - lo[0]), depth / (hi[2] - lo[2]), 1.0)
    k.active(model)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def clover():
    """A clover, 15 x 1.5 x 13.9 m: three heart-shaped leaflets round a short stem, flat on top at 1.5 m (track and
    stations stand on it at scale 2), each with a rounded rim that catches the light and a pale V."""
    mats = (mat("Clover", CLOVER, 0.8), mat("Clover rim", "#6FBE5B", 0.75), mat("Clover side", "#53A043", 0.85),
            mat("Clover under", CLOVER_STEM, 0.9))
    parts = clover_shape(3, 7.4, 1.5, 0.34, 0.16, 16, mats, mat("Clover mark", CLOVER_MARK, 0.8),
                         mat("Clover stem", CLOVER_STEM, 0.85), 4)
    return parts, 300


def clover_four():
    """Record "よつばの クローバー", 8 x 1.2 x 8 m: four heart-shaped leaflets cupped a little, brighter toward the rim,
    which glows a little (it shone in the light), each with a pale V."""
    mats = (mat("Four leaf", CLOVER_FOUR, 0.7, 0.08), mat("Four leaf rim", CLOVER_FOUR_RIM, 0.6, 0.35),
            mat("Four leaf side", "#8CD06A", 0.7, 0.2), mat("Four leaf under", "#4F9A3F", 0.9))
    parts = clover_shape(4, 4.0, 1.2, 0.26, 0.13, 12, mats, mat("Four leaf mark", CLOVER_FOUR_MARK, 0.6, 0.3),
                         mat("Four leaf stem", CLOVER_STEM, 0.85), 4, cup=0.14)
    return parts, 300


# ---------------------------------------------------------------- flower

def meadow_flower():
    """A meadow flower, 12 x 30 x 12 m (a tower to look up at; at scale 0.13 the butterfly's little flower): a stem with
    a gentle sway and two long folded leaves, a green star of sepals, five round cupped petals tipped up a little
    (pale at their base, pink outward, a stronger pink underneath that glows a little, as the train sees them from
    below) and a domed yellow middle with an orange heart whose top is exactly 30 m."""
    H = 30.0
    green = mat("Stem", FLOWER_STEM, 0.8)
    leaf_m = mat("Leaf", FLOWER_LEAF, 0.75)
    leaf_under = mat("Leaf under", "#86C266", 0.85, 0.22)
    inner = mat("Petal inner", PETAL_INNER, 0.6)
    outer = mat("Petal", PETAL, 0.6)
    under = mat("Petal under", "#F58FC0", 0.6, 0.32)
    yellow = mat("Middle", FLOWER_CENTRE, 0.55, 0.12)
    heart = mat("Middle heart", "#F7B23B", 0.55, 0.12)
    parts: list = []
    cup_y = H - 2.15
    # Stem: six-sided, swaying a little half-way up and back over the root.
    path = [(0.32 * math.sin(math.pi * t) * 0.6, cup_y * t, 0.32 * math.sin(math.pi * t)) for t in (0, 0.3, 0.55, 0.8, 1.0)]
    path.insert(1, (0.0, 1.0, 0.0))  # straight up out of the ground, so its foot is level
    radii = [0.64, 0.6, 0.55, 0.5, 0.45, 0.42]
    stem = k.add_swept_tube(parts, "stem", path, radii, [green] * 5, sides=6, smooth=True)
    fix_normals(stem)
    # Two leaves: long, broad, softly folded (a shallow V open to the sky), arching out from the stem and drooping at
    # the tip; their undersides glow a little so they stay leaf green seen from the train below.
    for i, (y, side, turn) in enumerate(((9.0, 1, 0.25), (15.0, -1, -0.35))):
        ox = path[2][0] if y < 12 else path[3][0]
        oz = path[2][2] if y < 12 else path[3][2]
        base = Vector((ox, y, oz))
        out = Vector((side * math.cos(turn), 0.0, math.sin(turn)))
        across = Vector((-out.z, 0.0, out.x))
        # (along, rise, half width) from the stem to the tip.
        spine = [(0.0, 0.0, 0.32), (0.24, 0.85, 1.15), (0.5, 1.2, 1.4), (0.76, 0.95, 1.0), (1.0, 0.1, 0.0)]
        L = 5.7
        verts = []
        for s_, rise, w in spine[:-1]:
            c = base + out * (L * s_) + Vector((0, rise, 0))
            fold = 0.2 * w
            for q in (c + across * w + Vector((0, fold, 0)), c + Vector((0, 0.04, 0)), c - across * w + Vector((0, fold, 0)), c - Vector((0, 0.16, 0))):
                verts.append(tuple(q))
        s_, rise, _ = spine[-1]
        verts.append(tuple(base + out * (L * s_) + Vector((0, rise, 0))))
        faces = [(3, 2, 1, 0)] + ring_faces(0, 4, 4) + ring_faces(4, 8, 4) + ring_faces(8, 12, 4) + [(12 + j, 12 + (j + 1) % 4, 16) for j in range(4)]
        leaf = solid(parts, f"leaf-{i}", verts, faces, [leaf_m, leaf_under])
        for poly in leaf.data.polygons:
            poly.material_index = 1 if poly.normal.z < -0.2 else 0  # Blender +Z is up
    # Sepals: a green star cup under the petals, its rounded points between them, drooping a little.
    ring_lo = [(math.cos(TAU * j / 5 + math.pi / 2 + math.pi / 5) * 0.5, cup_y, math.sin(TAU * j / 5 + math.pi / 2 + math.pi / 5) * 0.5) for j in range(5)]
    ring_hi = []
    for j in range(10):
        a = math.pi / 2 + math.pi / 5 + TAU * j / 10
        r = 2.3 if j % 2 == 0 else 1.6
        ring_hi.append((math.cos(a) * r, cup_y + (0.85 if j % 2 == 0 else 1.3), math.sin(a) * r))
    verts = ring_lo + ring_hi
    faces = [tuple(range(4, -1, -1)), tuple(range(5, 15))]
    for j in range(5):
        lo, lo_next = j, (j + 1) % 5
        tip, mid, tip_next = 5 + 2 * j, 5 + 2 * j + 1, 5 + (2 * j + 2) % 10
        faces += [(lo, tip, mid), (lo, mid, lo_next), (lo_next, mid, tip_next)]
    solid(parts, "sepals", verts, faces, [leaf_m])
    # Petals: spoon-shaped slabs from near the middle outward, cupped (edges raised), tipped up a little; their tips stay
    # under the top of the middle.
    reach, tilt, thick = 6.2, 0.2, 0.32
    # (distance out, half width, edge lift) from the base to the round end; the first two rows' faces are pale.
    rows = [(0.9, 0.6, 0.05), (2.3, 1.85, 0.3), (3.95, 2.25, 0.42), (5.3, 1.6, 0.28)]
    for i in range(5):
        a = math.pi / 2 + TAU * i / 5
        along = Vector((math.cos(a), 0.0, math.sin(a)))
        across = Vector((-along.z, 0.0, along.x))
        outline = [(rows[0][0] - 0.3, 0.0, 0.0)] + [(d, w, lift) for d, w, lift in rows] + [(reach, 0.0, 0.1)]
        outline += [(d, -w, lift) for d, w, lift in reversed(rows)]
        verts = [tuple(along * d + across * v + Vector((0.0, H - 1.58 + d * math.sin(tilt) + lift, 0.0))) for d, v, lift in outline]
        n = len(verts)
        verts += [(x, y - thick, z) for x, y, z in verts[:n]]
        # Top: a strip from the base to the round end (so the faces near the base can take the pale colour).
        m = len(rows)
        left = list(range(1, m + 1))
        right = [n - 1 - j for j in range(m)]
        top_faces = [(0, left[0], right[0])] + [(left[j], left[j + 1], right[j + 1], right[j]) for j in range(m - 1)]
        top_faces.append((left[-1], m + 1, right[-1]))
        bottom_faces = [tuple(n + v for v in reversed(f)) for f in top_faces]
        side_faces = [(j, (j + 1) % n, n + (j + 1) % n, n + j) for j in range(n)]
        indices = [0, 0] + [1] * (len(top_faces) - 2) + [2] * len(bottom_faces) + [3] * len(side_faces)
        solid(parts, f"petal-{i}", verts, top_faces + bottom_faces + side_faces, [inner, outer, under, outer], indices)
    # The middle: a dome of yellow with an orange heart on top, its top at exactly 30 m.
    rings = [(H - 1.7, 2.05), (H - 0.6, 1.95), (H, 0.85)]
    seg = 10
    verts = [(math.cos(TAU * j / seg) * r, y, math.sin(TAU * j / seg) * r) for y, r in rings for j in range(seg)]
    faces = [tuple(range(seg - 1, -1, -1))]
    for r in range(len(rings) - 1):
        faces += ring_faces(r * seg, (r + 1) * seg, seg)
    faces.append(tuple(range((len(rings) - 1) * seg, len(rings) * seg)))
    indices = [0] + [0] * seg * 2 + [1]
    dome = solid(parts, "middle", verts, faces, [yellow, heart], indices)
    for poly in dome.data.polygons:
        poly.use_smooth = poly.material_index == 0 and abs(k.gltf(poly.normal).y) < 0.95
    return parts, 400


# ---------------------------------------------------------------- water

def water_strip():
    """A flat water strip, 60 x 0.1 x 40 m with rounded corners: laid (and scaled) side by side it makes a stream or a
    puddle. Top and rim only (it lies on the ground); deeper blue in the middle, paler toward the shallow edge;
    see-through (0.8) and a little glossy."""
    HX, HZ, R, TOP = 30.0, 20.0, 7.0, 0.1
    outline = []
    for cx, cz, start in ((HX - R, HZ - R, 0.0), (-(HX - R), HZ - R, 90.0), (-(HX - R), -(HZ - R), 180.0), (HX - R, -(HZ - R), 270.0)):
        for i in range(3):
            a = math.radians(start + 45.0 * i)
            outline.append((cx + R * math.cos(a), cz + R * math.sin(a)))
    n = len(outline)
    verts = [(0.0, TOP, 0.0)] + [(x, TOP, z) for x, z in outline] + [(x, 0.0, z) for x, z in outline]
    faces = [(0, 1 + (i + 1) % n, 1 + i) for i in range(n)]
    faces += [(1 + i, 1 + n + i, 1 + n + (i + 1) % n, 1 + (i + 1) % n) for i in range(n)]
    parts: list = []
    obj = k.add_mesh(parts, "water", verts, faces, [paint_material("Water", 0.22, 0.8)])
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    if obj.data.polygons[0].normal.z < 0:  # the top must face up (Blender +Z)
        obj.data.flip_normals()

    deep, shallow = mix_hex(WATER, "#5FB8E6", 0.35), mix_hex(WATER, "#FFFFFF", 0.25)

    def colour(poly, p):
        if p.y < TOP * 0.5:
            return shallow
        return mix_hex(deep, shallow, max(abs(p.x) / HX, abs(p.z) / HZ))

    paint_corners(obj, colour)
    return obj, 40


# ---------------------------------------------------------------- bugs: grasshopper

def grasshopper():
    """A grasshopper, 1.6 x 1.6 x 4 m: a smooth bright green body with a pale belly and folded wings along its back,
    a round head with big friendly eyes (white, dark pupils looking ahead), two curving feelers with round tips, four
    short legs and two long hind legs (a plump thigh up to a high knee, a thin shin down to the foot)."""
    green = k.mat("Hopper", HOPPER, 0.55)
    belly = k.mat("Hopper belly", HOPPER_BELLY, 0.6)
    leg_m = k.mat("Hopper leg", HOPPER_LEG, 0.55)
    feeler = k.mat("Hopper feeler", HOPPER_FEELER, 0.6)
    wing_m = k.mat("Hopper wing", "#69B533", 0.5)
    white = k.mat("Eye", EYE_WHITE, 0.3)
    dark = k.mat("Pupil", EYE_DARK, 0.3)
    paint = paint_material("Grasshopper", 0.5)

    # body: one smooth loft from the tail to the neck (abdomen, then the thorax with its squarish saddle), pale below.
    body_parts: list = []
    rings = [(-1.95, 0.84, 0.0, 0.0, 2), (-1.83, 0.83, 0.12, 0.12, 2), (-1.52, 0.8, 0.29, 0.28, 2), (-1.02, 0.77, 0.39, 0.37, 2),
             (-0.42, 0.78, 0.42, 0.4, 2), (0.1, 0.84, 0.44, 0.43, 2.4), (0.52, 0.9, 0.47, 0.46, 2.8), (0.86, 0.92, 0.42, 0.44, 2.6),
             (1.08, 0.94, 0.27, 0.3, 2)]
    trunk = loft_z(body_parts, "trunk", rings, 10, green)
    trunk.data.materials.append(belly)
    for poly in trunk.data.polygons:
        poly.material_index = 1 if k.gltf(poly.normal).y < -0.3 else 0
    # Folded wings: a long tent along the back, from the saddle to past the tail.
    def back_top(z):
        u = (z + 0.62) / 1.25
        return 0.76 + 0.39 * math.sqrt(max(0.0, 1 - u * u))
    rows = [(0.2, 0.2), (-0.3, 0.34), (-0.9, 0.34), (-1.45, 0.26)]
    verts = []
    for z, w in rows:
        y = back_top(z)
        verts += [(w, y - 0.1, z), (0.0, y + 0.07, z), (-w, y - 0.1, z), (0.0, y - 0.12, z)]
    verts.append((0.0, 0.84, -1.95))
    faces = [(3, 2, 1, 0)] + ring_faces(0, 4, 4) + ring_faces(4, 8, 4) + ring_faces(8, 12, 4) + [(12 + j, 12 + (j + 1) % 4, 16) for j in range(4)]
    solid(body_parts, "wings", verts, faces, [wing_m], smooth=False)
    # Front and middle legs: hip under the body, knee out, foot on the ground.
    for side in (1, -1):
        for hip, knee, foot in (((0.24, 0.58, 0.78), (0.52, 0.6, 1.02), (0.56, 0.06, 1.18)),
                                ((0.28, 0.52, 0.26), (0.66, 0.54, 0.28), (0.72, 0.06, 0.04))):
            pts = [(side * hip[0], hip[1], hip[2]), (side * knee[0], knee[1], knee[2]), (side * foot[0], foot[1], foot[2])]
            tube(body_parts, f"leg-{side}-{hip[2]}", pts, [0.075, 0.068, 0.06], 4, leg_m)
    body = node(body_parts, "body", (0, 0, 0), paint)

    # head: pivot at the neck; a round head, the face below the eyes pale.
    head_parts: list = []
    head = k.add_ellipsoid(head_parts, "skull", (0.8, 0.9, 0.84), (0, 1.03, 1.3), green, 12, 7)
    head.data.materials.append(belly)
    for poly in head.data.polygons:
        c, nm = k.gltf(poly.center), k.gltf(poly.normal)
        poly.material_index = 1 if (c.y < 0.96 and nm.z > 0.1) or nm.y < -0.55 else 0
    # Big round eyes: white domes on the sides of the head, a dark round pupil looking ahead and a little shine.
    for side in (1, -1):
        centre, radii = Vector((side * 0.26, 1.16, 1.48)), Vector((0.2, 0.23, 0.19))
        k.add_ellipsoid(head_parts, f"eye-{side}", tuple(radii * 2), tuple(centre), white, 10, 5)
        look = Vector((side * 0.42, 0.1, 1.0)).normalized()
        t = 1 / math.sqrt(sum((look[i] / radii[i]) ** 2 for i in range(3)))
        on = centre + look * t
        lens(head_parts, f"pupil-{side}", tuple(on - look * 0.012), tuple(look), (0.21, 0.25, 0.07), dark, 8, 4)
        up = Vector((0, 1, 0)) - look * look.y
        lens(head_parts, f"shine-{side}", tuple(on + up.normalized() * 0.055 + look * 0.02), tuple(look), (0.075, 0.075, 0.03), white, 6, 3)
    head_node = node(head_parts, "head", (0, 0.95, 1.0), paint)

    # Feelers: from the top of the head up, out and forward in a soft curve, a round tip at the end.
    for side, label in ((1, "left"), (-1, "right")):
        root = Vector((side * 0.12, 1.39, 1.52))
        path = [root + Vector(p) for p in ((0, -0.04, -0.03), (side * 0.03, 0.1, 0.05), (side * 0.09, 0.19, 0.17), (side * 0.17, 0.2, 0.31), (side * 0.25, 0.14, 0.45))]
        parts: list = []
        tube(parts, "stalk", [tuple(p) for p in path], [0.04, 0.036, 0.032, 0.028, 0.026], 3, feeler)
        bead(parts, "tip", tuple(path[-1]), 0.16, 0.15, 6, feeler, smooth=True)
        antenna = node(parts, f"antenna-{label}", tuple(root), paint)
        attach(antenna, head_node)

    # Hind legs: pivot at the hip; a plump thigh up and back to the knee, the shin down and forward to the foot.
    legs = []
    for side, label in ((1, "left"), (-1, "right")):
        hip = Vector((side * 0.38, 0.74, -0.22))
        knee = hip + Vector((side * 0.3, 0.5, -1.4))
        foot = hip + Vector((side * 0.34, -0.64, -0.95))
        parts = []
        lathe(parts, "thigh", tuple(hip + (hip - knee) * 0.04), tuple(knee + (knee - hip) * 0.03),
              [(0, 0.0), (0.08, 0.13), (0.3, 0.2), (0.62, 0.15), (0.9, 0.09), (1, 0.0)], 6, green)
        tube(parts, "shin", [tuple(knee), tuple(knee + (foot - knee) * 0.5 + Vector((side * 0.02, 0.06, -0.08))), tuple(foot + Vector((0, 0.04, 0)))],
             [0.07, 0.058, 0.05], 4, leg_m)
        lathe(parts, "foot", tuple(foot + Vector((0, -0.038, -0.1))), tuple(foot + Vector((0, -0.038, 0.2))), [(0, 0.0), (0.4, 0.07), (1, 0.0)], 6, leg_m)
        legs.append(node(parts, f"leg-{label}", tuple(hip), paint))
    return [body, head_node, *legs], 1000


# ---------------------------------------------------------------- bugs: butterfly

DIHEDRAL = 0.16


def catmull(keys, count):
    """`count` points along a Catmull-Rom curve through `keys` (pairs), ends included."""
    pts = [keys[0]] + list(keys) + [keys[-1]]
    out = []
    for i in range(count):
        f = i / (count - 1) * (len(keys) - 1)
        j = min(int(f), len(keys) - 2)
        t = f - j
        p0, p1, p2, p3 = pts[j], pts[j + 1], pts[j + 2], pts[j + 3]
        out.append(tuple(0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t
                                + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t ** 3) for c in range(2)))
    return out


def wing_surface(parts, name, root, keys, count, side, m):
    """A wing: a fan from its root on the body out to a rounded edge (angle in degrees from +X toward +Z, radius),
    drawn on both faces (two surfaces back to back; the game shows each from its own side)."""
    rim = [(root[0] + r * math.cos(math.radians(a)), root[1] + r * math.sin(math.radians(a))) for a, r in catmull(keys, count)]
    verts, faces = [], []
    for y in (0.006, -0.006):
        base = len(verts)
        verts.append((side * root[0], y, root[1]))
        verts += [(side * x, y, z) for x, z in rim]
        for i in range(count - 1):
            faces.append((base, base + 1 + i, base + 2 + i))
    obj = k.add_mesh(parts, name, verts, faces, [m])
    half = len(faces) // 2
    for i, poly in enumerate(obj.data.polygons):
        if (poly.normal.z > 0) != (i < half):  # Blender +Z is glTF +Y: the first half faces up
            poly.flip()
    obj.data.update()
    return obj


def wing_side(side: int, yellow, white):
    """One side's wings (side 1 = +X, the left): a big round front wing and a smaller hind wing fanning out from the
    body, warm orange at the root and yellow outward, a white dot on both faces, raised outward by DIHEDRAL. Built
    directly on that side (no mirroring)."""
    front = [(-22, 0.62), (-6, 1.5), (12, 1.93), (30, 1.92), (48, 1.52), (66, 1.08), (80, 0.6)]
    hind = [(-100, 0.62), (-80, 1.12), (-56, 1.32), (-32, 1.26), (-14, 0.96), (0, 0.5)]
    parts: list = []
    wing_surface(parts, "front", (0.12, 0.26), front, 11, side, yellow)
    wing_surface(parts, "hind", (0.12, -0.02), hind, 9, side, yellow)
    for i, (spot, r) in enumerate((((1.32, 0.76), 0.25), ((0.84, -0.7), 0.19))):
        for up in (True, False):
            dot(parts, f"dot-{i}-{up}", (side * spot[0], 0.018 if up else -0.018, spot[1]), r, 5, white, up)
    for obj in parts:
        obj.rotation_euler = (0.0, -side * DIHEDRAL, 0.0)  # about Blender Y (glTF -Z): the outer end up
    return parts


def butterfly():
    """A butterfly, 4 x 0.6 x 2.5 m: four round yellow wings (warm orange at the root) with a white dot on each (both
    faces), a small purple body in one soft piece, a round head with two big eyes, and two feelers with round tips.
    Origin at the middle of the body."""
    purple = k.mat("Butterfly", BUTTERFLY_BODY, 0.55)
    yellow = k.mat("Wing", WING, 0.5)
    white = k.mat("Wing dot", WING_DOT, 0.5)
    eye_white = k.mat("Eye", EYE_WHITE, 0.3)
    dark = k.mat("Pupil", EYE_DARK, 0.3)
    paint = paint_material("Butterfly", 0.5)
    # The wings glow a little (an even warm light): they stay bright yellow seen from below or against the light.
    wing_paint = glow(paint_material("Butterfly wing", 0.5), WING, 0.3)
    parts: list = []
    lathe(parts, "body", (0, -0.02, -0.98), (0, 0.02, 0.48), [(0, 0.0), (0.12, 0.08), (0.5, 0.12), (0.78, 0.15), (0.94, 0.12), (1, 0.0)], 6, purple)
    k.add_ellipsoid(parts, "head", (0.38, 0.36, 0.36), (0, 0.05, 0.62), purple, 8, 4)
    for side in (1, -1):
        # Eyes: a white lens on the front of the head and a dark one on it, looking ahead and a little out.
        look = Vector((side * 0.45, 0.15, 1.0)).normalized()
        on = Vector((0, 0.05, 0.62)) + look * 0.18
        bead(parts, f"eye-{side}", tuple(on), 0.15, 0.07, 6, eye_white, axis=tuple(look), smooth=True)
        bead(parts, f"pupil-{side}", tuple(on + look * 0.03), 0.08, 0.04, 5, dark, axis=tuple(look), smooth=True)
        path = [(side * 0.05, 0.17, 0.68), (side * 0.1, 0.32, 0.84), (side * 0.24, 0.33, 1.1)]
        tube(parts, f"feeler-{side}", path, [0.022, 0.02, 0.018], 3, purple)
        bead(parts, f"feeler-tip-{side}", path[-1], 0.1, 0.1, 4, purple, smooth=True)
    body = node(parts, "body", (0, 0, 0), paint)
    nodes = [body]
    for side, label in ((1, "left"), (-1, "right")):
        # Warm at the root: the yellow (not the dots) runs from orange at the body out to yellow.
        wing = node(wing_side(side, yellow, white), f"wing-{label}", (0, 0, 0), wing_paint,
                    lambda m, p: mix_hex(WING_BASE, WING, min(1.0, max(0.0, abs(p.x) - 0.12) / 0.5)) if m == "Wing" else None)
        nodes.append(wing)
    return nodes, 300


# ---------------------------------------------------------------- dandelion seed

def dandelion_seed():
    """Record "たんぽぽの わたげ", 6 x 8 x 6 m; Sakasa holds on to it to fly away. A ribbed brown seed at the bottom
    (the origin under it), a long pale beak up to a little white hub, and from the hub an umbrella of fine white rays
    arching out and up, each ending in a soft tuft."""
    seed_low = mat("Seed", SEED, 0.8)
    seed_high = mat("Seed top", SEED_TOP, 0.8)
    stalk_m = mat("Beak", FLUFF_STALK, 0.7, 0.3)
    fluff = mat("Fluff", FLUFF, 0.8, 0.5)
    parts: list = []
    # The seed: an eight-sided spindle with raised ribs, darker below.
    profile = [(0.0, 0.0), (0.25, 0.2), (0.75, 0.36), (1.25, 0.31), (1.7, 0.12)]
    sides = 8
    verts = [(0.0, 0.0, 0.0)]
    for y, r in profile[1:]:
        for i in range(sides):
            rr = r * (1.0 if i % 2 == 0 else 0.84)
            a = TAU * i / sides
            verts.append((math.cos(a) * rr, y, math.sin(a) * rr))
    top = len(verts)
    verts.append((0.0, 1.86, 0.0))
    faces = [(0, 1 + (i + 1) % sides, 1 + i) for i in range(sides)]
    for r in range(len(profile) - 2):
        faces += ring_faces(1 + r * sides, 1 + (r + 1) * sides, sides)
    last = 1 + (len(profile) - 2) * sides
    faces += [(last + i, last + (i + 1) % sides, top) for i in range(sides)]
    seed = solid(parts, "seed", verts, faces, [seed_low, seed_high])
    for poly in seed.data.polygons:
        poly.material_index = 1 if k.gltf(poly.center).y > 0.95 else 0
    hub_y = 6.1
    lathe(parts, "beak", (0, 1.7, 0), (0, hub_y, 0), [(0, 0.1), (0.5, 0.075), (1, 0.07)], 4, stalk_m, smooth=False)
    k.add_ellipsoid(parts, "hub", (0.46, 0.4, 0.46), (0, hub_y, 0), fluff, 6, 4)
    rays = 14
    for i in range(rays):
        a = TAU * i / rays + (0.08 if i % 2 else 0.0)
        out = Vector((math.cos(a), 0.0, math.sin(a)))
        reach = 2.8 if i % 2 == 0 else 2.6
        rise = 1.42 if i % 2 == 0 else 1.58
        hub = Vector((0, hub_y, 0))
        # Each ray rises steeply from the hub, then leans out (an open parasol).
        mid = hub + out * (reach * 0.42) + Vector((0, rise * 0.72, 0))
        tip = hub + out * reach + Vector((0, rise, 0))
        tube(parts, f"ray-{i}", [tuple(hub), tuple(mid), tuple(tip)], [0.045, 0.04, 0.035], 3, fluff)
        # The tuft: a soft round puff across the ray's end.
        bead(parts, f"tuft-{i}", tuple(tip + (tip - mid).normalized() * 0.1), 0.62, 0.34, 6, fluff, axis=tuple(tip - mid), smooth=True)
    return parts, 500


# ---------------------------------------------------------------- spider

def spider():
    """A spider, 3 x 2.5 x 3 m (only in the ending, on the web): a round, soft lilac body like a plush toy (lighter on
    top, with three fluffy bumps), a round head with two big friendly eyes, and eight short round legs arching to
    little round feet. No fangs, spikes or bristles. Faces +Z."""
    clay_m = k.mat("Spider", SPIDER, 0.75)
    leg_m = k.mat("Spider leg", SPIDER_LEG, 0.7)
    foot_m = k.mat("Spider foot", SPIDER_TOP, 0.7)
    white = mat("Eye", EYE_WHITE, 0.3, 0.35)
    dark = k.mat("Pupil", EYE_DARK, 0.3)
    volumes: list = []
    k.add_ellipsoid(volumes, "abdomen", (2.16, 2.0, 2.2), (0, 1.22, -0.45), clay_m, 28, 14)
    for i, (x, y, z, r) in enumerate(((0.28, 2.06, -0.62, 0.36), (-0.3, 2.02, -0.28, 0.32), (0.02, 1.96, -1.02, 0.3))):
        k.add_ellipsoid(volumes, f"fluff-{i}", (2 * r, 2 * r, 2 * r), (x, y, z), clay_m, 16, 8)
    k.add_ellipsoid(volumes, "head", (1.46, 1.38, 1.4), (0, 0.9, 0.62), clay_m, 24, 12)
    body = k.flat_clay(volumes, "spider-body", clay_m, voxel=0.06, budget=220, smooth=4)
    parts = [body]
    decals: list = []
    for side in (1, -1):
        cx, cy = side * 0.27, 1.06
        k.wrap_onto(k.disc_decal(decals, f"eye-{side}", (cx, cy, 2.0), (0.5, 0.58), white, 3, 10), body, 0.03)
        k.wrap_onto(k.disc_decal(decals, f"pupil-{side}", (cx + side * 0.03, cy + 0.0, 2.0), (0.27, 0.32), dark, 1, 10), body, 0.05)
        k.wrap_onto(k.disc_decal(decals, f"shine-{side}", (cx + side * 0.03 + 0.06, cy + 0.08, 2.0), (0.1, 0.1), white, 1, 6), body, 0.07)
    parts += decals
    hips = [0.78, 0.32, -0.2, -0.7]
    feet = [(1.2, 1.2), (1.36, 0.45), (1.36, -0.45), (1.2, -1.22)]
    for i in range(4):
        fx, fz = feet[i]
        for side in (1, -1):
            hip = Vector((side * 0.55, 0.82, hips[i]))
            foot = Vector((side * fx, 0.14, fz))
            knee = Vector((side * (0.55 + (fx - 0.55) * 0.7), 1.32, (hips[i] + fz) / 2))
            path = [hip, knee, foot]
            tube(parts, f"leg-{i}-{side}", [tuple(p) for p in path], [0.15, 0.135, 0.11], 5, leg_m)
            # A little round foot (a short lathe: flat-ish sole, rounded top).
            lathe(parts, f"foot-{i}-{side}", tuple(foot - Vector((0, 0.14, 0))), tuple(foot + Vector((0, 0.14, 0))),
                  [(0, 0.0), (0.25, 0.14), (0.65, 0.16), (1, 0.0)], 6, foot_m)
    # The body lightens smoothly toward the top (vertex colours: no hard line that would read as a cap) and glows a
    # little, so it stays a soft light lilac on the web against the sky; the eyes keep their own colours.
    model = k.join(parts, "spider")
    bake_colours(model, glow(paint_material("Spider", 0.75), SPIDER_TOP, 0.22),
                 lambda m, p: mix_hex(SPIDER, SPIDER_TOP, (p.y - 1.0) / 1.2) if m == "Spider" else None, keep=("Eye", "Pupil"))
    return model, 800


# ---------------------------------------------------------------- the web of rails

def rail_web():
    """A spider's web made of track, 36 x 36 x 0.45 m, standing up in the XY plane and seen from +Z: eight spokes of the
    train's own track (two steel rails 1.5 m apart, shiny on their running face toward +Z, on 2.4 m sleepers behind
    them), a hub of white silk, a silk spiral of four turns that sags a little between the spokes, a silk frame round
    the rim and a few dew drops. Origin at its lowest point (the foot of the bottom spoke)."""
    R, HUB, cy = 18.0, 2.8, 18.0
    steel = mat("Rail", WEB_RAIL, 0.4)
    shine = mat("Rail top", "#C2C9D1", 0.3)
    wood = mat("Sleeper", WEB_SLEEPER, 0.85)
    silk = mat("Silk", WEB_SILK, 0.6, 0.3)
    dew = mat("Dew", "#BDEBFF", 0.15, 0.4)
    parts: list = []

    def at(angle, r, offset=0.0, z=0.0):
        return Vector((math.cos(angle) * r - math.sin(angle) * offset, cy + math.sin(angle) * r + math.cos(angle) * offset, z))

    def bar(name, a, b, width, z0, z1, mats, shiny=False):
        """A box from a to b in the web's plane, `width` across in the plane, from z0 to z1 in depth; `shiny`: its
        face toward +Z (a rail's running face) takes the second material."""
        along = (b - a).normalized()
        side = Vector((-along.y, along.x, 0.0)) * (width / 2)
        verts = []
        for z in (z0, z1):
            for p in (a - side, a + side, b + side, b - side):
                verts.append((p.x, p.y, z))
        faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        obj = solid(parts, name, verts, faces, mats)
        if shiny:
            for poly in obj.data.polygons:
                poly.material_index = 1 if k.gltf(poly.normal).z > 0.9 else 0
        return obj

    for s in range(8):
        angle = TAU * s / 8
        for o in (-0.75, 0.75):
            bar(f"rail-{s}-{o}", at(angle, HUB - 0.2, o), at(angle, R, o), 0.2, -0.02, 0.2, [steel, shine], shiny=True)
        r = HUB + 0.95
        i = 0
        while r < R - 0.5:
            bar(f"sleeper-{s}-{i}", at(angle, r, -1.2), at(angle, r, 1.2), 0.42, -0.2, -0.02, [wood])
            r += 2.0
            i += 1
    # Hub: a round white cushion of silk over where the spokes meet.
    lathe(parts, "hub", (0, cy, -0.12), (0, cy, 0.2), [(0, 3.0), (0.6, 3.0), (1.0, 2.2)], 12, silk, smooth=False)
    # Spiral: four turns from near the hub to near the rim, a thread between each pair of spokes sagging toward the hub.
    turns, r0, r1 = 4, 4.7, 16.9
    steps = turns * 8
    radius = lambda i: r0 + (r1 - r0) * i / steps  # noqa: E731
    for i in range(steps):
        a0, a1 = TAU * i / 8, TAU * (i + 1) / 8
        p0, p1 = at(a0, radius(i), 0.0, 0.08), at(a1, radius(i + 1), 0.0, 0.08)
        if i < steps // 2:  # the inner turns are short: straight threads
            tube(parts, f"silk-{i}", [tuple(p0), tuple(p1)], [0.13, 0.13], 3, silk, smooth=False)
            continue
        mid = (p0 + p1) / 2
        hub = Vector((0, cy, 0.08))
        mid += (hub - mid).normalized() * (0.035 * (mid - hub).length)
        tube(parts, f"silk-{i}", [tuple(p0), tuple(mid), tuple(p1)], [0.13, 0.12, 0.13], 3, silk, smooth=False)
    # The frame: a thread round the rim joining the spokes' ends.
    for s in range(8):
        a0, a1 = TAU * s / 8, TAU * (s + 1) / 8
        p0, p1 = at(a0, R - 0.3, 0.0, 0.08), at(a1, R - 0.3, 0.0, 0.08)
        mid = (p0 + p1) / 2
        mid += (Vector((0, cy, 0.08)) - mid).normalized() * 0.45
        tube(parts, f"frame-{s}", [tuple(p0), tuple(mid), tuple(p1)], [0.15, 0.14, 0.15], 3, silk, smooth=False)
    # Dew drops on the spiral.
    rng = random.Random(8)
    for d in range(6):
        i = 4 + d * 5 + rng.randint(0, 2)
        a = TAU * (i + 0.5) / 8
        p = at(a, radius(i + 0.5) * 0.975, 0.0, 0.1)
        bead(parts, f"dew-{d}", tuple(p), 0.3, 0.38, 4, dew, smooth=True)
    return parts, 1500


# ---------------------------------------------------------------- record: the marble

def record_marble():
    """Record "みずたまりの そこ", 1.6 m: a big glass marble lying on the pond floor. A see-through, glossy pale blue
    glass ball with a three-colour twist inside (pink, yellow and green vanes that glow a little, turning round as
    they rise) and two soft white shines on the glass."""
    glass = bpy.data.materials.new("Marble glass")
    glass.use_nodes = True
    glass.use_backface_culling = True
    bsdf = glass.node_tree.nodes["Principled BSDF"]
    rgb = k.hex_linear("#94D8FF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.06
    bsdf.inputs["Alpha"].default_value = 0.36
    glass.diffuse_color = (*rgb, 1.0)
    glass.surface_render_method = "BLENDED"
    shine = mat("Marble shine", "#FFFFFF", 0.2, 0.7)
    vanes = [mat("Twist pink", "#FF5C8A", 0.4, 0.35), mat("Twist yellow", "#FFC233", 0.4, 0.35), mat("Twist green", "#3CCB7F", 0.4, 0.35)]
    parts: list = []
    ball = k.add_ellipsoid(parts, "glass", (1.6, 1.6, 1.6), (0, 0.8, 0), glass, 14, 9)
    # Three thin vanes from the axis out, turning round (0.7 of a half turn) from bottom to top.
    rows = 7
    for v in range(3):
        rings = []
        for j in range(rows):
            y = 0.28 + 1.04 * j / (rows - 1)
            a = TAU * v / 3 + 0.7 * math.pi * j / (rows - 1)
            half = math.sqrt(max(0.0, 0.8 ** 2 - (y - 0.8) ** 2))
            reach = max(0.1, min(0.32, half - 0.22))
            out = Vector((math.cos(a), 0.0, math.sin(a)))
            side = Vector((-out.z, 0.0, out.x)) * 0.03
            c0, c1 = Vector((0, y, 0)) + out * 0.03, Vector((0, y, 0)) + out * reach
            rings.append([tuple(c0 + side), tuple(c1 + side), tuple(c1 - side), tuple(c0 - side)])
        verts = [p for r in rings for p in r]
        faces = [(3, 2, 1, 0)] + [f for j in range(rows - 1) for f in ring_faces(4 * j, 4 * (j + 1), 4)]
        faces.append(tuple(range(4 * (rows - 1), 4 * rows)))
        solid(parts, f"vane-{v}", verts, faces, [vanes[v]], smooth=False)
    decals: list = []
    for i, (x, y, w, h) in enumerate(((-0.3, 1.18, 0.3, 0.22), (-0.06, 1.38, 0.1, 0.08))):
        k.wrap_onto(k.disc_decal(decals, f"shine-{i}", (x, y, 1.2), (w, h), shine, 1, 8, tilt=0.6), ball, 0.01)
    return parts + decals, 400


# ---------------------------------------------------------------- export and preview

def metrics(objects):
    """Triangles of all `objects` and their bounds in glTF coordinates (world space)."""
    tris = 0
    pts = []
    bpy.context.view_layer.update()
    for obj in objects:
        obj.data.calc_loop_triangles()
        tris += len(obj.data.loop_triangles)
        pts += [k.gltf(obj.matrix_world @ v.co) for v in obj.data.vertices]
    lo = [min(p[a] for p in pts) for a in range(3)]
    hi = [max(p[a] for p in pts) for a in range(3)]
    return tris, lo, hi


def export_glb(objects, name, budget, max_kb=250):
    tris, lo, hi = metrics(objects)
    if tris > budget:
        raise RuntimeError(f"{name}: {tris} triangles exceeds budget {budget}")
    k.MODEL_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    glb = k.MODEL_DIR / f"{name}.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", export_yup=True, use_selection=True,
                              export_texcoords=False)
    if glb.stat().st_size > max_kb * 1024:
        raise RuntimeError(f"{name}: GLB exceeds {max_kb} KB")
    print("MODEL_METRICS=" + json.dumps({
        "model": name, "triangles": tris, "budget": budget, "dimensions": [round(hi[i] - lo[i], 3) for i in range(3)],
        "min": [round(v, 3) for v in lo], "max": [round(v, 3) for v in hi], "nodes": [o.name for o in objects],
        "file_bytes": glb.stat().st_size,
    }, sort_keys=True))


def preview(objects, name, direction=(0.55, -0.72, 0.42), size=(512, 400)):
    """A three-quarter view in a pale sky, fitted to the model (as sky.py's previews)."""
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
    bpy.ops.object.camera_add(location=(0, 0, 0))
    camera = bpy.context.object
    camera.data.lens = 50
    camera.data.sensor_fit = "HORIZONTAL" if size[0] >= size[1] else "VERTICAL"
    view = Vector(direction).normalized()
    camera.rotation_euler = (-view).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    bpy.context.view_layer.update()
    coords = []
    for obj in objects:
        for v in obj.data.vertices:
            coords.extend(obj.matrix_world @ v.co)
    location, _ = camera.camera_fit_coords(bpy.context.evaluated_depsgraph_get(), coords)
    _, lo, hi = metrics(objects)
    center = Vector(k.to_blender([(hi[i] + lo[i]) / 2 for i in range(3)]))
    camera.location = location + view * (Vector(location) - center).length * 0.12
    bpy.ops.render.render(write_still=True)


BUILDERS = {"grass-blade": grass_blade, "clover": clover, "clover-four": clover_four, "meadow-flower": meadow_flower,
            "water-strip": water_strip, "grasshopper": grasshopper, "butterfly": butterfly,
            "dandelion-seed": dandelion_seed, "spider": spider, "rail-web": rail_web, "record-marble": record_marble}
# Named nodes the game moves (their pivots are where meadow.ts turns them): exported as built.
MOVING = {"grasshopper", "butterfly"}
# Set on the floor but not centred: the web stands on its bottom spoke, the seed on its tip, the grass and the flower on
# their root (their bend and sway would move a bounding-box centre off it), the water on its middle.
KEEP_XZ = {"rail-web", "dandelion-seed", "grass-blade", "meadow-flower", "water-strip"}
# Footprints the stand-ins had (the stage was laid out with them): fitted exactly.
FOOTPRINT = {"clover": (15.0, 13.9), "clover-four": (8.0, 8.0)}
VIEWS = {"grass-blade": (0.35, -0.9, 0.15), "meadow-flower": (0.2, -1.0, 0.1), "rail-web": (0.35, -0.9, 0.18),
         "water-strip": (0.5, -0.7, 0.75), "clover": (0.5, -0.7, 0.75), "clover-four": (0.45, -0.65, 0.9),
         "butterfly": (0.5, -0.6, 0.62), "grasshopper": (0.8, -0.55, 0.35), "spider": (0.45, -0.85, 0.3),
         "dandelion-seed": (0.6, -0.72, 0.42), "record-marble": (0.5, -0.75, 0.42)}
TALL = {"grass-blade", "meadow-flower", "dandelion-seed"}

if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if a in BUILDERS] or list(BUILDERS)
    for name in names:
        k.reset()
        built, budget = BUILDERS[name]()
        if name in MOVING:
            # The nodes and their children (the grasshopper's feelers) are exported together.
            objects = built + [c for o in built for c in o.children]
        else:
            model = built if isinstance(built, bpy.types.Object) else k.join(built, name)
            model.name = name
            model.data.name = name
            if name in FOOTPRINT:
                fit_xz(model, *FOOTPRINT[name])
            k.normalize(model, None, center=name not in KEEP_XZ)
            objects = [model]
        export_glb(objects, name, budget)
        preview(objects, name, VIEWS.get(name, (0.55, -0.72, 0.42)), size=(400, 512) if name in TALL else (512, 400))
