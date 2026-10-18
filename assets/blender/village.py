"""Stage 4-2 (おおゆきの むら) and chapter 4's snowplow — Claude Code. Ticket 0016.

The crafted look (つくりこみ) of chapters 1-3 (sky.py, volcano.py, river.py and meadow.py, whose helpers this script
uses): flat colours, round friendly shapes, toy-like. A small village at the foot of the snowy mountain the morning
after a night of heavy snow, and its evening snow-house festival. Snow is never plain white: it shades to pale blue and
lilac (and glows a little, so it stays light on its shaded side and turns warm, not grey, in the evening). No letters,
crests or marks anywhere; the snowplow is a round yellow scoop, not a real plough's wedge or blades; nothing has a face.

Models (same names, sizes, origins and orientation as the code stand-ins they replace, so the stage JSON does not
change; origin at the bottom centre, +Z forward, the model's own left is +X):
- plow-blade 3.4 x 1.3 x 1.6: the round yellow scoop (concave to +Z, its ends swept forward) with a white rim, the dark
  arms reaching back (-Z) to the train. Origin at the scoop's bottom middle; plow.ts puts it on the lead car's nose
  (down at (0, 0.08, 6.45); folded, it tips back and tucks in under the nose) and bakes it into one draw call.
- snow-wall 8.8 x 5 x 4.76: a soft block of snow with a cornice hanging over its face (+Z, the face at z 2, where
  plow.ts presses the train's dent), white on top to blue below, sparkles on the face. Vertex colours, one material:
  plow.ts draws every wall in its own vertex-coloured material.
- sign-plow 1.4 x 3.28 x 0.27: 2-3's sign (volcano.py) in purple: the train's nose and its yellow scoop pushing a
  mound of blue snow.
- snow-house, snow-house-b 9.9 x 8.55 x 8.9: a wooden house on a stone plinth (walls brown / blue-grey), a thick soft
  blanket of snow on its roof, warm lit windows, the door +Z under a little canopy.
- kamakura 4 x 2.6 x 3.9: a snow dome with a porch, the doorway (+Z) glowing warm orange from inside.
- amanojaku-kamakura 1.6 x 1.2 x 1.5: Sakasa's own little snow house, lumpy, lopsided and far too small.
- lantern 0.5 x 2.7 x 0.5: a red paper lantern with a white band (no letters) on a thin pole. Vertex colours, two
  materials: "lantern-paper" is the paper, which the game swaps for its glowing one (village-models.ts lights every
  lantern at once at the festival); the rest is "village-paint".
- snow-fence-small 6.1 x 3.1 x 0.6: a wooden snow fence, five planks with pointed tops on a rail between two posts, snow
  along its top; boards +Z.
- snow-fence-trace 6.1 x 3 x 1: the same fence upside down (Sakasa's doing): planks pointed end down, the rail low,
  the snow heaped at its foot, and her pink swirl on the middle plank. Vertex colours, two materials: "trace-swirl" is
  the swirl, which the game swaps for its own (it glows while the light finds it); the rest is "village-paint".
- snow-shed 9.6 x 7.8 x 10.2: 10 m of the wooden snow shed the track runs through (along Z): posts every 5 m, low
  board walls, open above them, a pitched roof under a thick blanket of snow. Pieces 10 m apart meet end to end.
- ski-ramp 6.2 x 2.4 x 12.2: the ski jump laid over the track: a snowy ramp curving up to its lip, wooden sides and
  guard rails, the lip at the origin (where the train takes off), the ramp behind it (-Z).
- ski-ramp-folded 2 x 4.3 x 6.2: the same ski jump folded up on end on the model's left (+X, x 3.85-5.86), its wooden
  underside to the track, propped from outside.
- ski-lift-tower 3.6 x 12.48 x 3.6: a blue steel lift tower, a cross arm with two wheel sets on top, snow on it and a
  pillow of snow on the pole's head (its top at 12.48: record ③ sticks in it, scripts/layout-4-2.mjs).
- snow-ravine 30 x 2.6 x 40: the soft drifts at the bottom of the snowy valley under the ski jump.
- frozen-fall 6.6 x 7.5 x 4.9 (record ①): a small rocky cliff whose waterfall froze as it fell, a frozen pool below.
- spiral-mitten 0.4 x 0.5 x 0.2 (record ②): one mitten, purple and green stripes winding round it, a white cuff.
- tin-shovel 0.3 x 0.9 x 0.2 (record ③): a small silver tin shovel with a red handle.
Colours: the static models are plain-coloured parts (the game bakes each into one draw call per ground cell); the snow
wall, the lantern and the upside-down fence are vertex-coloured (see above).
Output: public/models/<name>.glb and assets/previews/<name>.png.
Run: python3 scripts/run-bpy.py assets/blender/village.py [-- name ...]
"""
from __future__ import annotations

from pathlib import Path
import math
import random
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import sky as s  # noqa: E402  (chapter 1's crafted helpers: fix_normals, ring_faces, plate, rounded_rect...)
import volcano as v  # noqa: E402  (chapter 2's: Paint, painted, lathe_y, beam, sticker, sign_base, preview...)
import meadow as md  # noqa: E402  (vertex colours: paint_material, mix_hex, export_glb)
import river as rv  # noqa: E402  (chapter 3's: body, drop_crumbs)
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

TAU = 2 * math.pi
hexmix = v.hexmix

# ---------------------------------------------------------------- palette (ticket 0016)

SNOW, SNOW_SHADE, SNOW_DEEP, SNOW_LILAC = "#FBFDFF", "#DCE6F2", "#C9DBEA", "#D6D3EC"
SPARKLE, SPARKLE_GOLD = "#FFFFFF", "#FFF4C8"
WOOD, WOOD_DARK, WOOD_LIGHT, WOOD_END = "#9A6B45", "#7A5234", "#AD7D52", "#C9A27A"
HOUSE_WALLS = {"snow-house": "#B07D52", "snow-house-b": "#8C9DB5"}
HOUSE_TRIM = {"snow-house": "#F3E6CF", "snow-house-b": "#F4F6FA"}
WINDOW, DOOR, STONE, STONE_DARK = "#FFD45C", "#6B4E3A", "#B9B3AE", "#9C958F"
BLADE, BLADE_DEEP, BLADE_LIGHT, RIM, ARM, ARM_DARK = "#F2B632", "#E09A1E", "#F7C95A", "#FFFFFF", "#4A5360", "#3A414C"
BLADE_LOW = "#EAA82A"
PURPLE, SIGN_BOARD, SIGN_SNOW, SIGN_SNOW_LIGHT, SIGN_RAIL = "#7B86E8", "#EEF0FF", "#7FA7D9", "#B5CFEE", "#5B6270"
STEEL, STEEL_DARK, STEEL_LIGHT, WHEEL, HUB, CONCRETE = "#3F7CC4", "#2F5F9A", "#5A93D2", "#2B3A4A", "#C9D1DA", "#B8BCC4"
ROCK, ROCK_DARK, ROCK_LIGHT, ICE, ICE_DEEP, ICE_LIGHT = "#9C958F", "#8A837D", "#B8B0A9", "#BFE6F7", "#8FCDEB", "#E2F5FC"
LANTERN_RED, LANTERN_BAND, LANTERN_CAP = "#E8584F", "#FFF4E6", "#3D3A44"
KAMAKURA_GLOW, KAMAKURA_INSIDE = "#FFB347", "#FFE2B8"
MITTEN_A, MITTEN_B, MITTEN_CUFF, MITTEN_CUFF_SHADE = "#8C6BD8", "#5FBF9A", "#F4F1FB", "#DCD6EE"
TIN, TIN_DARK, TIN_LIGHT, HANDLE = "#C9D1DA", "#A9B3BE", "#E6EBF0", "#D9483B"
SWIRL = "#FF7FBF"

# Snow keeps a little of its own colour as light (as river.py's snow): white on its shaded side, warm in the evening.
SNOW_GLOW = {SNOW: 0.26, SNOW_SHADE: 0.22, SNOW_DEEP: 0.16, SNOW_LILAC: 0.16}


def snow_paint(roughness=0.9, extra=None):
    """A Paint whose snow colours glow a little (and the colours in `extra` {hex: share} as much as given)."""
    table = dict(SNOW_GLOW)
    table.update(extra or {})
    return v.Paint(roughness, glow=table)


# ---------------------------------------------------------------- helpers (glTF coordinates)

def tube(parts, name, points, radii, m, sides=4):
    """A closed tube along a polyline (one material), wound outward."""
    obj = k.add_swept_tube(parts, name, points, radii, [m] * (len(points) - 1), sides=sides)
    s.fix_normals(obj)
    return obj


def loft(parts, name, rings, paint, colour, smooth=False, cap_start=True, cap_end=True):
    """A closed body through rings of equal length (each a list of glTF points round it). `colour(tag, centre,
    normal) -> hex`, the tag as river.body gives it ("gap", ring, edge) / ("cap_top",) / ("cap_bottom",)."""
    verts, faces, tags = rv.body(rings, cap_top=cap_end, cap_bottom=cap_start)
    obj = k.add_mesh(parts, name, verts, faces, [])
    s.fix_normals(obj)
    slots: dict[str, int] = {}
    for poly, tag in zip(obj.data.polygons, tags):
        c, n = k.gltf(poly.center), k.gltf(poly.normal)
        hex_color = colour(tag, c, n) if callable(colour) else colour
        if hex_color not in slots:
            slots[hex_color] = len(obj.data.materials)
            obj.data.materials.append(paint(hex_color))
        poly.material_index = slots[hex_color]
        poly.use_smooth = smooth(c, n) if callable(smooth) else smooth
    return obj


def clay(volumes, name, budget, voxel, smooth=4, ground=True):
    """Soft volumes fused into one smooth surface (voxel remesh, smoothed) and decimated under `budget` triangles:
    ("ell", size, centre) ellipsoids and ("box", size, centre, bevel) rounded boxes. One placeholder material."""
    m = v.mat("clay", SNOW)
    made: list = []
    for i, spec in enumerate(volumes):
        kind, size, center = spec[:3]
        if kind == "box":
            k.add_box(made, f"{name}-v{i}", size, center, m, bevel=spec[3] if len(spec) > 3 else 0.0, segments=4)
        else:
            k.add_ellipsoid(made, f"{name}-v{i}", size, center, m, segments=24, rings=12)
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
    rv.drop_crumbs(low)
    low.name = name
    low.data.name = name
    k.set_smooth(low)
    s.fix_normals(low)
    return low


def square_post(parts, name, center, y0, y1, r0, r1, m):
    """A square post (half widths r0 at the foot, r1 at the top), open at its foot (it stands in the snow or on a
    plinth): 10 triangles."""
    x, z = center
    verts = []
    for y, r in ((y0, r0), (y1, r1)):
        verts += [(x + r, y, z + r), (x - r, y, z + r), (x - r, y, z - r), (x + r, y, z - r)]
    obj = k.add_mesh(parts, name, verts, s.ring_faces(0, 4, 4) + [(4, 5, 6, 7)], [m])
    # Outward: the top faces up.
    top = obj.data.polygons[-1]
    if k.gltf(top.normal).y < 0:
        obj.data.flip_normals()
    return obj


def recolour(obj, paint, fn, smooth=None):
    """Each face of `obj` takes the material of fn(centre, normal) -> hex (glTF coordinates)."""
    mesh = obj.data
    mesh.materials.clear()
    slots: dict[str, int] = {}
    for poly in mesh.polygons:
        c, n = k.gltf(obj.matrix_world @ poly.center), k.gltf(poly.normal)
        hex_color = fn(c, n)
        if hex_color not in slots:
            slots[hex_color] = len(mesh.materials)
            mesh.materials.append(paint(hex_color))
        poly.material_index = slots[hex_color]
        if smooth is not None:
            poly.use_smooth = smooth(c, n) if callable(smooth) else smooth


def surface_hit(tree, origin, direction):
    """Where a ray from `origin` along `direction` (glTF) meets the BVH tree (built in Blender space): point and normal
    in glTF coordinates, or None."""
    hit = tree.ray_cast(Vector(k.to_blender(origin)), Vector(k.to_blender(direction)).normalized())
    if hit[0] is None:
        return None
    return k.gltf(hit[0]), k.gltf(hit[1])


def to_vertex_colours(model, colour_at=None, split=None, roughness=0.8):
    """Per-face flat colours into vertex colours: each corner takes its face's material colour, or colour_at(material
    name, corner point, its normal: the vertex's on smooth faces) -> hex where that gives one. The faces then share one vertex-coloured material,
    "village-paint", or the one split(material name) names (the lantern's paper, the swirl), which the game swaps."""
    mesh = model.data
    old = list(mesh.materials)
    attr = mesh.color_attributes.new(name="paint", type="FLOAT_COLOR", domain="CORNER")
    values = [0.0] * (len(mesh.loops) * 4)
    for poly in mesh.polygons:
        m = old[poly.material_index]
        base = tuple(m.diffuse_color[:3])
        for li in poly.loop_indices:
            vert = mesh.vertices[mesh.loops[li].vertex_index]
            p = k.gltf(model.matrix_world @ vert.co)
            n = k.gltf(vert.normal) if poly.use_smooth else k.gltf(poly.normal)
            hex_color = colour_at(m.name, p, n) if colour_at else None
            values[li * 4:li * 4 + 4] = (*(k.hex_linear(hex_color) if hex_color else base), 1.0)
    attr.data.foreach_set("color", values)
    own = [split(m.name) if split else None for m in old]
    names = ["village-paint"] + sorted({x for x in own if x})
    index = [names.index(x) if x else 0 for x in own]
    old_index = [poly.material_index for poly in mesh.polygons]
    # (Clearing the slots resets every face's index, so the new ones are set after.)
    mesh.materials.clear()
    for nm in names:
        mesh.materials.append(md.paint_material(nm, roughness))
    for poly, i in zip(mesh.polygons, old_index):
        poly.material_index = index[i]


# ---------------------------------------------------------------- plow-blade

PLOW_YC, PLOW_R, PLOW_T = 0.66, 0.75, 0.08  # the scoop's arc: centre height, radius, sheet thickness
PLOW_PHI = (-52.7, -30.0, -6.0, 18.0, 46.0)  # where the front arc's points are (degrees from straight back)
PLOW_ZC = 0.455                             # the arc's centre (z): the bottom lip of the front at z 0 in the middle
PLOW_HALF, PLOW_BOW = 1.62, 0.42            # the sheet's half width, and how far its ends sweep forward


def bow(x):
    return PLOW_BOW * (x / PLOW_HALF) ** 2


def scoop_section(x, r_front=PLOW_R, r_back=PLOW_R + PLOW_T):
    """The sheet's cross-section at x: the front arc from the bottom lip to the top lip, then the back arc down."""
    dz = bow(x)
    front = [(x, PLOW_YC + r_front * math.sin(math.radians(p)), PLOW_ZC + dz - r_front * math.cos(math.radians(p))) for p in PLOW_PHI]
    back = [(x, PLOW_YC + r_back * math.sin(math.radians(p)), PLOW_ZC + dz - r_back * math.cos(math.radians(p))) for p in reversed(PLOW_PHI)]
    return front + back


def plow_blade():
    """ゆきかき: a round yellow scoop, a curved sheet concave to the front with its two ends swept forward (round in
    plan as well), a white rolled rim along its top, white end plates and a white lower lip (no edge, no teeth);
    two dark arms reach back from it to a cross bar and a mounting plate at the train's nose."""
    paint = v.Paint(0.55, glow={BLADE: 0.08, BLADE_LIGHT: 0.08, BLADE_LOW: 0.06, RIM: 0.12})
    parts: list = []
    xs = [-PLOW_HALF + 2 * PLOW_HALF * i / 5 for i in range(6)]
    rings = [scoop_section(x) for x in xs]
    m = len(PLOW_PHI)

    def colour(tag, c, n):
        if tag[0] != "gap":
            return BLADE
        j = tag[2]
        if j < m - 1:
            return (BLADE_LOW, BLADE, BLADE, BLADE_LIGHT)[j]  # the front: deeper low down, lighter under the rim
        if j == m - 1:
            return RIM                                      # the top edge
        if j == 2 * m - 1:
            return RIM                                      # the bottom lip
        return BLADE_DEEP                                   # the back

    # Rings run along X here, so the "gap" faces are the sheet; its ends are capped by the end plates' plates too.
    sheet = loft(parts, "scoop", rings, paint, colour)
    # Smooth over the curved front and back only: the rim and lip faces stay flat (their edges sharp).
    edges = {m - 1, 2 * m - 1}
    for poly, tag in zip(sheet.data.polygons, rv.body(rings)[2]):
        poly.use_smooth = tag[0] == "gap" and tag[2] not in edges
    # White end plates closing the scoop's sides (a circular segment: the arc and its chord), a little proud of it.
    for side in (-1, 1):
        x = side * (PLOW_HALF + 0.04)
        dz = bow(PLOW_HALF)
        arc = [(PLOW_ZC + dz - (PLOW_R + PLOW_T + 0.02) * math.cos(math.radians(p)),
                PLOW_YC + (PLOW_R + PLOW_T + 0.02) * math.sin(math.radians(p))) for p in (-52.7, -26.0, 0.0, 24.0, 46.0)]
        arc[0] = (arc[0][0], max(arc[0][1], 0.0))
        s.plate(parts, f"end-{side}", (x, 0.0, 0.0), (0, 0, 1), (0, 1, 0), arc, 0.08, [paint(RIM)])
    # The rolled rim along the top lip.
    top = []
    for x in xs:
        dz = bow(x)
        a = math.radians(PLOW_PHI[-1])
        r = PLOW_R + PLOW_T / 2
        top.append((x, PLOW_YC + r * math.sin(a) + 0.02, PLOW_ZC + dz - r * math.cos(a)))
    top[0] = (top[0][0] - 0.04, *top[0][1:])
    top[-1] = (top[-1][0] + 0.04, *top[-1][1:])
    tube(parts, "rim", top, [0.065] * len(top), paint(RIM), sides=4)
    # Arms, cross bar and the plate that meets the train.
    for side in (-1, 1):
        x = side * 0.95
        back = PLOW_ZC + bow(x) - (PLOW_R + PLOW_T) + 0.02
        v.beam(parts, f"arm-{side}", (x, PLOW_YC, back + 0.04), (x, 0.74, -1.12), 0.16, 0.18, paint(ARM))
    k.add_box(parts, "bar", (2.12, 0.18, 0.18), (0.0, 0.74, -1.04), paint(ARM))
    k.add_box(parts, "plate", (0.8, 0.46, 0.1), (0.0, 0.74, -1.13), paint(ARM_DARK))
    return parts, 300


# ---------------------------------------------------------------- snow-wall

def snow_wall():
    """ゆきの かべ: a soft rounded block of snow across the track, a lumpy pillow along its top and a cornice hanging
    over its face (+Z), drifts at its back corners; white on top to blue at its foot, a few sparkles on the face."""
    volumes = [
        ("box", (7.9, 4.3, 3.9), (0.0, 2.15, 0.0), 0.9),
        ("ell", (3.6, 1.9, 4.2), (-2.6, 4.0, 0.15)),
        ("ell", (3.8, 2.0, 4.3), (0.2, 4.05, 0.2)),
        ("ell", (3.4, 1.8, 4.1), (2.8, 3.95, 0.1)),
        ("ell", (8.4, 1.2, 1.5), (0.0, 4.35, 1.85)),
        ("ell", (2.6, 1.6, 2.4), (-3.4, 0.2, -1.6)),
        ("ell", (2.4, 1.4, 2.2), (3.5, 0.2, -1.4)),
    ]
    wall = clay(volumes, "snow-wall", 330, 0.16, smooth=5)
    parts = [wall]
    paint = v.Paint(0.9)
    wall.data.materials.clear()
    wall.data.materials.append(paint(SNOW))
    # Sparkles: little four-pointed stars pressed on the face (where the ray from the front meets it).
    tree = k.world_tree(wall)
    rng = random.Random(42)
    spots = [(-2.9, 1.2), (-1.4, 2.6), (0.6, 0.9), (2.2, 2.3), (3.2, 1.0), (-0.4, 3.3), (1.5, 3.6), (-3.3, 3.1)]
    for i, (x, y) in enumerate(spots):
        hit = surface_hit(tree, (x, y, 6.0), (0, 0, -1))
        if not hit:
            continue
        p, nrm = hit
        size = rng.uniform(0.32, 0.46)
        star = []
        for j in range(8):
            a = TAU * j / 8
            r = size / 2 if j % 2 == 0 else size * 0.13
            star.append((math.cos(a) * r, math.sin(a) * r))
        obj = v.sticker(parts, f"sparkle-{i}", tuple(p), tuple(nrm), (1.0, 1.0), paint(SPARKLE_GOLD if i % 3 == 1 else SPARKLE), 8,
                        tilt=rng.uniform(0, 0.6), lift=0.05)
        # Reshape the round sticker into a star (its rim alternately out and in).
        for vi, vert in enumerate(obj.data.vertices):
            if vi == 0:
                continue
            cx = obj.data.vertices[0].co
            d = vert.co - cx
            frac = (size / 2 if (vi - 1) % 2 == 0 else size * 0.13) / max(d.length, 1e-6)
            vert.co = cx + d * frac
    return parts, 400


def wall_colour(material_name, p, n):
    """The wall's corners: white on top to blue at the foot (lilac under the cornice); the sparkles keep theirs."""
    if "Flat " + SNOW not in material_name:
        return None
    t = max(0.0, min(1.0, (p.y - 0.2) / 4.2))
    base = md.mix_hex(SNOW_DEEP, SNOW, t ** 0.85)
    return md.mix_hex(base, SNOW_LILAC, max(0.0, -n.y - 0.1) * 1.4)


# ---------------------------------------------------------------- sign-plow

def sign_plow():
    """ゆきかきの 札: 2-3's sign with a purple frame: the train's blue nose (a yellow band) on the left, its arm holding
    a yellow round scoop that pushes a mound of blue snow along a little rail, snow flying up from the mound."""
    paint = v.Paint(0.6)
    parts: list = []
    z = v.sign_base(parts, paint, SIGN_BOARD, PURPLE)
    y0 = v.SIGN_Y - 0.36
    # The rail along the bottom.
    v.flat_tris(parts, "rail", [((-0.56, y0), (0.56, y0), (0.56, y0 + 0.05)), ((-0.56, y0), (0.56, y0 + 0.05), (-0.56, y0 + 0.05))], z,
                paint(SIGN_RAIL))
    # The mound of snow ahead of the scoop (right), round on top.
    mound = []
    cx, cy = 0.25, y0 + 0.05
    pts = [(cx - 0.3, cy)] + [(cx + 0.3 * math.cos(math.pi - math.pi * i / 6), cy + 0.27 * math.sin(math.pi * i / 6)) for i in range(1, 6)] + \
          [(cx + 0.3, cy)]
    for a, b in zip(pts, pts[1:]):
        mound.append(((cx, cy), a, b))
    v.flat_tris(parts, "mound", mound, z, paint(SIGN_SNOW))
    # Bits of snow flying up off it.
    bits = []
    for bx, by, r in ((0.12, y0 + 0.47, 0.055), (0.33, y0 + 0.55, 0.045), (0.48, y0 + 0.42, 0.04)):
        ring = [(bx + math.cos(TAU * i / 6) * r, by + math.sin(TAU * i / 6) * r) for i in range(6)]
        bits += [((bx, by), ring[i], ring[(i + 1) % 6]) for i in range(6)]
    v.flat_tris(parts, "bits", bits, z, paint(SIGN_SNOW_LIGHT))
    # The scoop: a thick crescent opening to the right, pressed against the mound, its white rim on the top tip.
    sx, sy, ro, ri = -0.08, y0 + 0.26, 0.24, 0.15
    scoop = []
    for i in range(6):
        a0 = math.radians(90 + 180 * i / 6)
        a1 = math.radians(90 + 180 * (i + 1) / 6)
        o0, o1 = (sx + math.cos(a0) * ro, sy + math.sin(a0) * ro), (sx + math.cos(a1) * ro, sy + math.sin(a1) * ro)
        i0 = (sx + 0.06 + math.cos(a0) * ri, sy + math.sin(a0) * ri)
        i1 = (sx + 0.06 + math.cos(a1) * ri, sy + math.sin(a1) * ri)
        scoop += [(o0, o1, i1), (o0, i1, i0)]
    v.flat_tris(parts, "scoop", scoop, z + 0.004, paint(BLADE))
    # The arm going back (left) from the scoop's middle to the train's nose, a blue box with a yellow band.
    arm = [(sx - ro + 0.03, sy + 0.035), (sx - 0.36, sy + 0.035), (sx - 0.36, sy - 0.035), (sx - ro + 0.03, sy - 0.035)]
    v.flat_tris(parts, "arm", [(arm[0], arm[1], arm[2]), (arm[0], arm[2], arm[3])], z + 0.002, paint(ARM))
    nx0, nx1, ny0, ny1 = -0.6, -0.44, y0 + 0.08, y0 + 0.52
    v.flat_tris(parts, "nose", [((nx0, ny0), (nx1, ny0), (nx1, ny1)), ((nx0, ny0), (nx1, ny1), (nx0, ny1))], z, paint("#3E9BD6"))
    band = [((nx0, sy - 0.02), (nx1, sy - 0.02), (nx1, sy + 0.02)), ((nx0, sy - 0.02), (nx1, sy + 0.02), (nx0, sy + 0.02))]
    v.flat_tris(parts, "band", band, z + 0.003, paint("#FFC93C"))
    return parts, 250


# ---------------------------------------------------------------- lantern

def lantern():
    """ちょうちん: a round red paper lantern with a white band round its middle (no letters, no pattern) between two
    dark caps, on a thin wooden pole. The paper is its own material, which the game lights at the festival."""
    paint = v.Paint(0.8)
    parts: list = []
    k.add_tapered_segment(parts, "pole", (0, 0.0, 0), (0, 2.12, 0), 0.04, 0.032, paint(WOOD_DARK), vertices=3, smooth=False)
    prof = [(2.07, 0.12, LANTERN_CAP), (2.17, 0.215, LANTERN_RED), (2.35, 0.255, LANTERN_BAND), (2.45, 0.255, LANTERN_RED),
            (2.63, 0.2, LANTERN_CAP), (2.7, 0.11, LANTERN_CAP)]
    v.lathe_y(parts, "lantern", prof, (0, 0), 6, paint, smooth=lambda c, n: abs(n.y) < 0.9, phase=TAU / 12)
    return parts, 80


def lantern_split(material_name):
    """The paper (red and the white band) is the material the game lights."""
    return "lantern-paper" if (LANTERN_RED in material_name or LANTERN_BAND in material_name) else None


# ---------------------------------------------------------------- kamakura

KAMA_H = 2.6


def dome_rings(rx, rz, h, cz, levels, segments, rng=None, wobble=0.0, lean=0.0):
    """Rings of a snow dome (an ellipsoid's upper half, a little fuller at the shoulder): radius rx across, rz along,
    height h, centred on z = cz; `wobble` jitters each vertex (lumpy hand-made snow), `lean` tips the top along x."""
    rings = []
    for j, t in enumerate(levels):
        y = h * t
        f = math.sqrt(max(0.0, 1.0 - t ** 2.2))
        ring = []
        for i in range(segments):
            a = TAU * i / segments
            w = 1.0 + (rng.uniform(-wobble, wobble) if rng and t < 0.99 else 0.0)
            ring.append((math.cos(a) * rx * f * w + lean * t, y, cz + math.sin(a) * rz * f * w))
        rings.append(ring)
    return rings


def kamakura():
    """かまくら: a round snow dome, white on top and pale blue round its foot, a small porch at the front (+Z) whose
    arched doorway glows warm orange from the light inside; the porch's inner walls are lit cream."""
    paint = snow_paint(extra={KAMAKURA_GLOW: 0.95, KAMAKURA_INSIDE: 0.45})
    parts: list = []
    rng = random.Random(7)
    cz = -0.15
    rings = dome_rings(2.0, 1.85, KAMA_H, cz, [0.0, 0.2, 0.42, 0.62, 0.8, 0.93], 14, rng, 0.025)
    verts, faces, tags = rv.body(rings, top=(0.0, KAMA_H, cz), cap_bottom=True)
    v.painted(parts, "dome", verts, faces, paint, rv.faces_colour(verts, faces, lambda c, i: (
        SNOW_DEEP if tags[i][0] == "cap_bottom" else (SNOW if c.y > 1.3 else (SNOW_SHADE if c.y > 0.45 else SNOW_DEEP)))), smooth=True)
    porch(parts, paint, 1.56, 1.42, 1.0, 1.1, 2.0, 1.8, 1.45, KAMAKURA_INSIDE, KAMAKURA_GLOW)
    return parts, 300


def arch(w, h, n=7):
    """An arch's outline (x, y): w wide, h tall, its top a half round of n points, standing on y 0."""
    pts = [(w / 2, 0.0)]
    for i in range(n):
        a = math.pi * i / (n - 1)
        pts.append((w / 2 * math.cos(a), h - w / 2 + w / 2 * math.sin(a)))
    pts.append((-w / 2, 0.0))
    return pts


def porch(parts, paint, ow, oh, iw, ih, zf, zd, zb, inside, door, n_arch=7):
    """A snow house's porch: an arch of packed snow (ow x oh) standing out of the dome from zb to its front zf, its
    doorway (iw x ih) going in to zd, where the doorway's back (`door`) shows; the doorway's walls are `inside`."""
    outer, inner = arch(ow, oh, n_arch), arch(iw, ih, n_arch)
    n = len(outer)
    ring_of = lambda pts, z: [(x, y, z) for x, y in pts]  # noqa: E731
    verts = ring_of(outer, zb) + ring_of(outer, zf) + ring_of(inner, zf) + ring_of(inner, zd)
    faces, cols = [], []
    for r, colour in ((0, SNOW), (1, SNOW), (2, inside)):
        for j in range(n - 1):
            faces.append((r * n + j, r * n + j + 1, (r + 1) * n + j + 1, (r + 1) * n + j))
            cols.append(colour if not (r == 0 and j in (0, n - 2)) else SNOW_SHADE)
    shell = k.add_mesh(parts, "porch", verts, faces, [])
    # Faces wound outward: the outer wall away from the doorway, the front facing +Z, the inner walls inward.
    slots: dict[str, int] = {}
    for poly, colour in zip(shell.data.polygons, cols):
        if colour not in slots:
            slots[colour] = len(shell.data.materials)
            shell.data.materials.append(paint(colour))
        poly.material_index = slots[colour]
        poly.use_smooth = True
    mid = ih * 0.45
    for poly in shell.data.polygons:
        c, nrm = k.gltf(poly.center), k.gltf(poly.normal)
        if poly.index < n - 1:          # outer wall: away from the doorway's middle line
            want = Vector((c.x, c.y - mid, 0.0))
        elif poly.index < 2 * (n - 1):  # front face
            want = Vector((0, 0, 1))
        else:                            # inner walls: toward the doorway's middle
            want = Vector((-c.x, mid - c.y, 0.0))
        if nrm.dot(want) < 0:
            poly.flip()
    shell.data.update()
    k.poly_decal(parts, "doorway", inner, zd + 0.005, paint(door), rings=1)


# ---------------------------------------------------------------- amanojaku-kamakura

def amanojaku_kamakura():
    """サカサの かまくら: Sakasa's own little snow house, made alone: a lumpy, lopsided dome leaning to one side, a
    snowball stuck on top, another left lying by it, and a doorway far too small for her."""
    paint = snow_paint()
    parts: list = []
    rng = random.Random(23)
    rings = dome_rings(0.8, 0.76, 1.0, 0.0, [0.0, 0.26, 0.5, 0.72, 0.9], 9, rng, 0.1, lean=0.1)
    verts, faces, tags = rv.body(rings, top=(0.12, 1.0, 0.0), cap_bottom=True)
    dome = v.painted(parts, "dome", verts, faces, paint, rv.faces_colour(verts, faces, lambda c, i: (
        SNOW_DEEP if tags[i][0] == "cap_bottom" else (SNOW if c.y > 0.55 else SNOW_SHADE))), smooth=True)
    v.lumpy_stone(parts, "ball-top", (0.36, 0.32, 0.34), (0.14, 1.0, -0.04), paint(SNOW), paint(SNOW), 5, sub=1, rough=0.1)
    v.lumpy_stone(parts, "ball-side", (0.3, 0.26, 0.3), (-0.62, 0.11, 0.5), paint(SNOW_SHADE), paint(SNOW), 9, sub=1, rough=0.12)
    for obj in parts[-2:]:
        k.set_smooth(obj, True)
    # The tiny doorway (a little porch, its hole in pale blue shadow: nobody could get in).
    porch(parts, paint, 0.5, 0.44, 0.3, 0.3, 0.8, 0.7, 0.55, SNOW_DEEP, "#9FB3CC", n_arch=5)
    return parts, 200


# ---------------------------------------------------------------- snow houses

def snow_house(name):
    """むらの いえ: a wooden house on a stone plinth, dark timber at its corners, a thick soft blanket of snow on its
    roof hanging over the eaves (the roof's wooden edge just showing), a stone chimney capped with snow, warm lit
    windows in light frames with snow on their sills, a round window in each gable, a wooden door (+Z) under a little
    snowy canopy, a drift of snow against the front. Walls brown (snow-house) or blue-grey (snow-house-b)."""
    wall, trim = HOUSE_WALLS[name], HOUSE_TRIM[name]
    flip = 1 if name == "snow-house" else -1
    paint = snow_paint(0.85, extra={WINDOW: 0.65, wall: 0.06})
    parts: list = []
    B = k.add_box
    W, D, Y0, YW = 8.0, 6.6, 0.35, 4.35   # walls: width, depth, from the plinth's top to the eaves
    B(parts, "plinth", (8.4, Y0, 7.0), (0, Y0 / 2, 0), paint(STONE))
    B(parts, "walls", (W, YW - Y0, D), (0, (Y0 + YW) / 2, 0), paint(wall))
    for sx in (-1, 1):
        for sz in (-1, 1):
            square_post(parts, f"post-{sx}-{sz}", (sx * (W / 2 - 0.05), sz * (D / 2 - 0.05)), Y0, YW, 0.15, 0.15, paint(WOOD_DARK))
    # The gables (the attic under the roof).
    RIDGE, EAVE_Z, EAVE_Y = 6.85, 4.05, 4.15
    loft(parts, "gables", [[(x, YW - 0.01, -D / 2), (x, YW - 0.01, D / 2), (x, RIDGE - 0.15, 0.0)] for x in (-W / 2, W / 2)], paint, wall)
    # The roof's wooden boards (seen at the eaves and the gable ends).
    slope = math.atan2(RIDGE - EAVE_Y, EAVE_Z)
    L = math.hypot(EAVE_Z, RIDGE - EAVE_Y) + 0.05
    for sz in (-1, 1):
        c = (0.0, (RIDGE + EAVE_Y) / 2, sz * EAVE_Z / 2)
        s.plate(parts, f"roof-{sz}", c, (1, 0, 0), (0, -math.sin(slope), sz * math.cos(slope)), [(-4.62, -L / 2), (4.62, -L / 2), (4.62, L / 2),
                (-4.62, L / 2)], 0.22, [paint(WOOD_DARK)])
    # The snow blanket: a soft roll over the whole roof, hanging over the eaves, its ends rounded over the gables.
    top = [(4.42, 4.36), (4.26, 4.75), (3.0, 5.78), (1.6, 6.74), (0.7, 7.4), (0.0, 7.62)]
    prof = [(4.32, 4.02)] + top + [(-z, y) for z, y in reversed(top[:-1])] + [(-4.32, 4.02), (-4.05, 4.3), (0.0, 7.05), (4.05, 4.3)]
    def ring(x, shrink):
        return [(x, 5.6 + (y - 5.6) * (1 - shrink * 0.6), z * (1 - shrink * 0.08)) for z, y in prof]
    rings = [ring(-4.95, 1.0), ring(-4.75, 0.0), ring(4.75, 0.0), ring(4.95, 1.0)]
    loft(parts, "snow", rings, paint, lambda tag, c, n: SNOW if n.y > 0.45 else (SNOW_LILAC if n.y < -0.3 else SNOW_SHADE),
         smooth=lambda c, n: True)
    # The chimney through the back slope, a snow cap on it.
    cx = flip * 2.4
    B(parts, "chimney", (0.8, 2.0, 0.8), (cx, 7.15, -1.7), paint(STONE_DARK))
    v.lathe_y(parts, "chimney-snow", [(8.12, 0.58, SNOW_SHADE), (8.42, 0.5, SNOW), (8.55, 0.0, SNOW)], (cx, -1.7), 6, paint,
              smooth=True, phase=TAU / 12)
    # The door under its canopy, a step in front.
    ZF = D / 2
    B(parts, "door-frame", (1.6, 2.5, 0.1), (0, Y0 + 1.25, ZF + 0.03), paint(WOOD_DARK))
    B(parts, "door", (1.25, 2.25, 0.12), (0, Y0 + 1.125, ZF + 0.06), paint(DOOR))
    k.disc_decal(parts, "knob", (0.42, Y0 + 1.1, ZF + 0.125), (0.13, 0.13), paint(WINDOW), 1, 6)
    s.plate(parts, "canopy", (0, 3.2, ZF + 0.45), (1, 0, 0), (0, -0.45, 1), [(-1.05, -0.5), (1.05, -0.5), (1.05, 0.5), (-1.05, 0.5)], 0.12,
            [paint(WOOD_DARK)])
    s.plate(parts, "canopy-snow", (0, 3.38, ZF + 0.48), (1, 0, 0), (0, -0.45, 1), [(-1.12, -0.52), (1.12, -0.52), (1.12, 0.55), (-1.12, 0.55)],
            0.2, [paint(SNOW)])
    B(parts, "step", (1.8, 0.3, 0.6), (0, 0.15, ZF + 0.55), paint(STONE_DARK))
    # Windows: two on the front, one on each side; light frames, a cross of muntins, snow on the sill.
    def window(cx_, cy, cz, facing):
        if facing == "z":
            B(parts, f"frame-{cx_}", (1.5, 1.32, 0.1), (cx_, cy, cz + 0.03), paint(trim))
            k.poly_decal(parts, f"glass-{cx_}", [(cx_ - 0.56, cy - 0.5), (cx_ + 0.56, cy - 0.5), (cx_ + 0.56, cy + 0.5), (cx_ - 0.56, cy + 0.5)],
                         cz + 0.085, paint(WINDOW), rings=1)
            bars = [((cx_ - 0.04, cy - 0.5), (cx_ + 0.04, cy - 0.5), (cx_ + 0.04, cy + 0.5)), ((cx_ - 0.04, cy - 0.5), (cx_ + 0.04, cy + 0.5), (cx_ - 0.04, cy + 0.5)),
                    ((cx_ - 0.56, cy - 0.04), (cx_ + 0.56, cy - 0.04), (cx_ + 0.56, cy + 0.04)), ((cx_ - 0.56, cy - 0.04), (cx_ + 0.56, cy + 0.04), (cx_ - 0.56, cy + 0.04))]
            v.flat_tris(parts, f"bars-{cx_}", bars, cz + 0.09, paint(trim))
            B(parts, f"sill-{cx_}", (1.7, 0.2, 0.36), (cx_, cy - 0.74, cz + 0.16), paint(SNOW))
        else:
            sx = 1 if cx_ > 0 else -1
            B(parts, f"frame-{sx}", (0.1, 1.32, 1.5), (cx_ + sx * 0.03, cy, cz), paint(trim))
            glass = k.poly_decal(parts, f"glass-{sx}", [(-0.56, cy - 0.5), (0.56, cy - 0.5), (0.56, cy + 0.5), (-0.56, cy + 0.5)], 0.0, paint(WINDOW),
                                 rings=1)
            glass.rotation_euler = (0, 0, sx * math.pi / 2)  # +Z turned to +-X (Blender z is up)
            glass.location = k.to_blender((cx_ + sx * 0.085, 0, cz))
            B(parts, f"sill-{sx}", (0.36, 0.2, 1.7), (cx_ + sx * 0.16, cy - 0.74, cz), paint(SNOW))

    for x in (-2.5, 2.5):
        window(x, 2.55, ZF, "z")
    for sx in (-1, 1):
        window(sx * W / 2, 2.55, 0.4, "x")
    # A round window in each gable.
    for sx in (-1, 1):
        for r, colour, off in ((0.46, trim, 0.03), (0.33, WINDOW, 0.05)):
            d = k.disc_decal(parts, f"attic-{sx}-{r}", (0, 5.35, 0), (2 * r, 2 * r), paint(colour), 1, 8)
            d.rotation_euler = (0, 0, sx * math.pi / 2)
            d.location = k.to_blender((sx * (W / 2 + off), 0, 0))
    # A drift of snow against the front, beside the door.
    v.lathe_y(parts, "drift", [(0.0, 1.05, SNOW_SHADE), (0.32, 0.85, SNOW), (0.6, 0.0, SNOW)], (-flip * 2.7, ZF + 0.25), 6, paint, smooth=True)
    return parts, 500


# ---------------------------------------------------------------- snow fences

PLANK_XS = (-2.3, -1.15, 0.0, 1.15, 2.3)
PLANK_Y0, PLANK_H = 0.28, 2.62


def lean(p, angle, pivot_y):
    """A point turned about the X axis through (y = pivot_y, z = 0) by `angle` (+: its top toward +Z)."""
    x, y, z = p
    dy, dz = y - pivot_y, z
    return (x, pivot_y + dy * math.cos(angle) - dz * math.sin(angle), dy * math.sin(angle) + dz * math.cos(angle))


def fence(upside):
    """ゆきよけの さく: five wooden planks with pointed tops nailed to a rail between two posts, leaning a little, snow
    along the top. Upside down (Sakasa's): the planks pointed end down and leaning the other way, the rail low, the snow
    heaped against its foot, and her pink swirl on the middle plank."""
    paint = snow_paint(0.85, extra={SWIRL: 0.2})
    parts: list = []
    angle = -0.1 if upside else 0.1
    top = PLANK_Y0 + PLANK_H
    for x in (-2.8, 2.8):
        square_post(parts, f"post-{x}", (x, -0.12), 0.0, 3.0, 0.12, 0.1, paint(WOOD_DARK))
    for i, px in enumerate(PLANK_XS):
        outline = [(px + x, y) for x, y in ((-0.5, PLANK_Y0), (0.5, PLANK_Y0), (0.5, top - 0.3), (0.0, top), (-0.5, top - 0.3))]
        if upside:
            outline = [(x, top + PLANK_Y0 - y) for x, y in outline]
        ring0 = [lean((x, y, 0.0), angle, PLANK_Y0 if not upside else top) for x, y in outline]
        ring1 = [lean((x, y, 0.07), angle, PLANK_Y0 if not upside else top) for x, y in outline]
        loft(parts, f"plank-{i}", [ring0, ring1], paint, WOOD if i % 2 == 0 else WOOD_LIGHT)
    rail_y = 0.75 if upside else 2.3
    k.add_box(parts, "rail", (6.0, 0.2, 0.1), (0, rail_y, -0.06), paint(WOOD_DARK))
    if not upside:
        prof = [(-0.24, 2.84), (0.24, 2.84), (0.22, 3.0), (0.0, 3.1), (-0.22, 3.0)]
        rings = [[(x, y if abs(x) < 3 else 2.9 + (y - 2.9) * 0.4, z * (0.55 if abs(x) > 3 else 1.0)) for z, y in prof] for x in (-3.05, -2.85, 2.85, 3.05)]
        loft(parts, "snow", rings, paint, lambda tag, c, n: SNOW if n.y > 0.3 else SNOW_SHADE, smooth=lambda c, n: True)
        return parts, 150
    # The snow heaped against its foot, on the front: lumpy along its length.
    rings = []
    for x, h, d in ((-3.05, 0.25, 0.45), (-1.4, 0.62, 0.8), (0.9, 0.5, 0.7), (3.05, 0.3, 0.5)):
        rings.append([(x, 0.0, -0.02), (x, 0.0, d), (x, h * 0.55, d * 0.7), (x, h, d * 0.25), (x, h * 0.96, 0.0)])
    loft(parts, "drift", rings, paint, lambda tag, c, n: SNOW if n.y > 0.4 else SNOW_SHADE, smooth=lambda c, n: True)
    # Sakasa's swirl on the middle plank (pink, faint until the game's light finds it).
    pts = []
    cy = 1.55
    for i in range(19):
        t = i / 18
        a = t * 2.15 * TAU
        pts.append(lean((math.cos(a) * 0.4 * t, cy + math.sin(a) * 0.4 * t, 0.082), angle, top))
    k.ribbon_decal(parts, "swirl", pts, 0.085, paint(SWIRL), taper=False)
    return parts, 250


def trace_split(material_name):
    """The swirl is the material the game lights."""
    return "trace-swirl" if SWIRL in material_name else None


# ---------------------------------------------------------------- snow-shed

def snow_shed():
    """ゆきよけ トンネル: 10 m of a wooden snow shed over the track (along Z): posts every 5 m on both sides with a knee
    brace each, beams along their tops and tie beams across, two boards of low wall on each side with snow on them,
    open above (light comes in), a pitched board roof under a thick blanket of snow hanging over its eaves."""
    paint = snow_paint(0.85)
    parts: list = []
    B = k.add_box
    for sx in (-1, 1):
        x = sx * 4.3
        for z in (-2.5, 2.5):
            k.add_tapered_segment(parts, f"post-{sx}-{z}", (x, 0.0, z), (x, 5.6, z), 0.22, 0.19, paint(WOOD_DARK), vertices=4, smooth=False)
            v.beam(parts, f"brace-{sx}-{z}", (x, 4.45, z + 0.1), (x, 5.58, z + 1.25), 0.2, 0.2, paint(WOOD))
        B(parts, f"beam-{sx}", (0.36, 0.4, 10.2), (x, 5.78, 0.0), paint(WOOD))
        for j, (y, colour) in enumerate(((0.55, WOOD), (1.62, WOOD_LIGHT))):
            B(parts, f"wall-{sx}-{j}", (0.14, 1.0, 10.2), (sx * 4.44, y, 0.0), paint(colour))
        B(parts, f"wall-snow-{sx}", (0.42, 0.22, 10.2), (sx * 4.44, 2.2, 0.0), paint(SNOW))
    for z in (-2.5, 2.5):
        B(parts, f"tie-{z}", (8.96, 0.3, 0.3), (0.0, 6.12, z), paint(WOOD_DARK))
    roof = [(-4.72, 5.95), (0.0, 7.05), (4.72, 5.95), (4.72, 6.17), (0.0, 7.27), (-4.72, 6.17)]
    loft(parts, "roof", [[(x, y, z) for x, y in roof] for z in (-5.1, 5.1)], paint, WOOD_DARK)
    top = [(4.7, 5.84), (4.78, 6.12), (4.45, 6.48), (2.5, 7.2), (0.95, 7.66), (0.0, 7.82)]
    prof = top + [(-x, y) for x, y in reversed(top[:-1])] + [(-4.5, 6.2), (0.0, 7.26), (4.5, 6.2)]
    loft(parts, "snow", [[(x, y, z) for x, y in prof] for z in (-5.1, 5.1)], paint,
         lambda tag, c, n: SNOW if n.y > 0.45 else (SNOW_LILAC if n.y < -0.3 else SNOW_SHADE), smooth=lambda c, n: abs(n.z) < 0.9)
    return parts, 300


# ---------------------------------------------------------------- ski-ramp and ski-ramp-folded

RAMP_HALF, RAMP_LEN, RAMP_LIP = 3.0, 12.0, 2.0
RAMP_ZS = (-12.0, -9.0, -6.2, -3.8, -1.7, 0.0)


def ramp_y(z):
    """The ramp's snow surface: rising from the back (z -12) to the lip (z 0), steeper toward the lip."""
    u = max(0.0, min(1.0, (z + RAMP_LEN) / RAMP_LEN))
    return RAMP_LIP * u ** 1.7


def ski_ramp():
    """スキーの ジャンプだい: a wooden ramp laid over the track, its snowy top curving up to the lip at the origin (where
    the train takes off), the ramp behind it (-Z). A soft blanket of snow with two blue grooves where the rails run on,
    wooden guard rails along both sides, dark planks and three posts across its front under the lip."""
    paint = snow_paint(0.85)
    parts: list = []
    body = [[(-RAMP_HALF, 0.0, z), (RAMP_HALF, 0.0, z), (RAMP_HALF, max(0.04, ramp_y(z) - 0.12), z), (-RAMP_HALF, max(0.04, ramp_y(z) - 0.12), z)]
            for z in RAMP_ZS]
    loft(parts, "body", body, paint, lambda tag, c, n: WOOD_DARK if tag[0] != "gap" else ((WOOD if tag[1] % 2 else WOOD_LIGHT) if abs(n.x) > 0.9 else WOOD_DARK))
    snow = []
    for z in RAMP_ZS:
        y = ramp_y(z)
        snow.append([(-2.88, max(0.02, y - 0.16), z), (2.88, max(0.02, y - 0.16), z), (2.88, y + 0.02, z), (2.45, y + 0.12, z), (-2.45, y + 0.12, z),
                     (-2.88, y + 0.02, z)])
    loft(parts, "snow", snow, paint, lambda tag, c, n: SNOW if n.y > 0.5 else SNOW_SHADE, smooth=lambda c, n: abs(n.z) < 0.9)
    for gx in (-0.75, 0.75):
        pts = [(gx, ramp_y(z) + 0.125, z) for z in RAMP_ZS]
        groove = k.add_mesh(parts, f"groove-{gx}", [(gx + dx, y, z) for gx_, y, z in pts for dx in (-0.09, 0.09)],
                            [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(len(pts) - 1)], [paint(SNOW_DEEP)])
        if k.gltf(groove.data.polygons[0].normal).y < 0:
            groove.data.flip_normals()
    for side in (-1, 1):
        rail = [[(side * (RAMP_HALF - 0.1), ramp_y(z) - 0.12, z), (side * (RAMP_HALF + 0.12), ramp_y(z) - 0.12, z),
                 (side * (RAMP_HALF + 0.12), ramp_y(z) + 0.36, z), (side * (RAMP_HALF - 0.1), ramp_y(z) + 0.36, z)] for z in RAMP_ZS[1:]]
        loft(parts, f"rail-{side}", rail, paint, lambda tag, c, n: WOOD_DARK if n.y > 0.5 else WOOD)
    for x in (-2.55, 0.0, 2.55):
        k.add_box(parts, f"post-{x}", (0.26, RAMP_LIP - 0.1, 0.24), (x, (RAMP_LIP - 0.1) / 2, 0.06), paint(WOOD))
    return parts, 300


def ski_ramp_folded():
    """たたんだ ジャンプだい: the ski jump folded up on end on the model's left (+X), out of the train's way: three wide
    planks with three dark battens on the side facing the track, its snowy top now facing out, a lump of snow along its
    top edge, a hinge along its foot and two props holding it from outside."""
    paint = snow_paint(0.85)
    parts: list = []
    B = k.add_box
    x0 = 4.12
    for j, (y, colour) in enumerate(((0.72, WOOD), (2.07, WOOD_LIGHT), (3.42, WOOD))):
        B(parts, f"plank-{j}", (0.2, 1.3, 5.96), (x0, y, -3.0), paint(colour))
    B(parts, "snow-face", (0.16, 4.02, 5.9), (x0 + 0.18, 2.06, -3.0), paint(SNOW_SHADE))
    for z in (-5.3, -3.0, -0.7):
        B(parts, f"batten-{z}", (0.12, 4.0, 0.26), (x0 - 0.16, 2.06, z), paint(WOOD_DARK))
    prof = [(3.98, 4.02), (4.42, 4.02), (4.36, 4.2), (4.2, 4.32), (4.04, 4.2)]
    rings = []
    for z, f in ((-6.1, 0.4), (-5.8, 1.0), (-0.2, 1.0), (0.1, 0.4)):
        rings.append([(4.2 + (x - 4.2) * (0.6 + 0.4 * f), 4.02 + (y - 4.02) * f, z) for x, y in prof])
    loft(parts, "snow-top", rings, paint, lambda tag, c, n: SNOW if n.y > 0.3 else SNOW_SHADE, smooth=lambda c, n: True)
    k.add_tapered_segment(parts, "hinge", (3.96, 0.12, -6.0), (3.96, 0.12, 0.0), 0.11, 0.11, paint(ARM), vertices=6, smooth=False)
    for z in (-5.0, -1.0):
        v.beam(parts, f"prop-{z}", (4.42, 3.2, z), (5.6, 0.1, z), 0.16, 0.16, paint(WOOD_DARK))
        B(parts, f"foot-{z}", (0.42, 0.14, 0.4), (5.62, 0.07, z), paint(WOOD_DARK))
    return parts, 300


# ---------------------------------------------------------------- ski-lift-tower

def ski_lift_tower():
    """リフトの てっとう: a blue steel pole with a white band near the top, standing in a mound of snow; a cross arm on
    top with snow along it and a set of two dark wheels under each end (where the lift's rope runs), a round head on
    the pole under a pillow of snow (its top, at 12.48 m, is where record ③ sticks)."""
    paint = snow_paint(0.6, extra={STEEL: 0.05, RIM: 0.15})
    parts: list = []
    v.lathe_y(parts, "mound", [(0.0, 1.8, SNOW_SHADE), (0.22, 1.45, SNOW), (0.42, 0.9, SNOW), (0.5, 0.0, SNOW)], (0, 0), 8, paint, smooth=True)
    v.lathe_y(parts, "pole", [(0.3, 0.42, STEEL), (9.9, 0.31, RIM), (10.3, 0.3, STEEL), (11.8, 0.27, STEEL)], (0, 0), 8, paint,
              smooth=lambda c, n: abs(n.y) < 0.9, phase=TAU / 16)
    k.add_box(parts, "arm", (3.5, 0.36, 0.42), (0.0, 11.95, 0.0), paint(STEEL_DARK))
    k.add_box(parts, "arm-snow", (3.3, 0.14, 0.46), (0.0, 12.19, 0.0), paint(SNOW))
    for side in (-1, 1):
        x = side * 1.5
        k.add_box(parts, f"yoke-{side}", (0.2, 0.24, 1.46), (x, 11.66, 0.0), paint(STEEL_DARK))
        for z in (-0.48, 0.48):
            k.add_tapered_segment(parts, f"wheel-{side}-{z}", (x - 0.07, 11.42, z), (x + 0.07, 11.42, z), 0.28, 0.28, paint(WHEEL), vertices=6,
                                  smooth=False)
    # The pole's round head under a pillow of snow (record ③, the tin shovel, sticks in it: layout-4-2.mjs puts it a
    # quarter of its length into the top at 12.48 m times the tower's scale).
    v.lathe_y(parts, "cap", [(12.08, 0.3, STEEL_LIGHT), (12.18, 0.3, SNOW_SHADE), (12.23, 0.38, SNOW), (12.38, 0.33, SNOW), (12.48, 0.0, SNOW)],
              (0, 0), 8, paint, smooth=lambda c, n: n.y > -0.5, phase=TAU / 16)
    return parts, 300


# ---------------------------------------------------------------- snow-ravine

def snow_ravine():
    """ゆきの たにの そこ: the soft bottom of the snowy valley under the ski jump, 30 x 40 m: a field of rounded drifts
    heaped highest in the middle (2.6 m), white on their tops, pale blue on their sides and lilac in the dips, running
    down to nothing at the rim."""
    paint = snow_paint(0.95)
    rng = random.Random(17)
    nx, nz, hx, hz = 10, 12, 15.0, 20.0
    bumps = [(0.0, 0.0, 6.5, 2.6), (-7.5, 9.5, 5.0, 2.0), (6.5, -9.5, 5.5, 2.2), (-5.5, -12.5, 4.2, 1.5), (8.0, 10.5, 4.5, 1.7),
             (2.5, 9.0, 3.6, 1.2), (-8.5, -1.0, 4.0, 1.4), (8.5, 0.5, 3.8, 1.1), (-1.5, -8.0, 3.2, 0.9), (-3.0, 14.5, 3.5, 1.0)]

    def height(x, z):
        u, w = abs(x) / hx, abs(z) / hz
        fade = max(0.0, 1.0 - max(u, w) ** 4)
        return min(2.6, sum(a * math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / (r * r)) for bx, bz, r, a in bumps)) * fade

    grid = []
    for j in range(nz + 1):
        row = []
        for i in range(nx + 1):
            u, w = -1 + 2 * i / nx, -1 + 2 * j / nz
            rim = i in (0, nx) or j in (0, nz)
            pull = 1.0 - 0.22 * (abs(u) * abs(w)) ** 2
            x = u * hx * pull + (rng.uniform(-0.6, 0.6) if not rim else 0.0)
            z = w * hz * pull + (rng.uniform(-0.6, 0.6) if not rim else 0.0)
            row.append((x, 0.0 if rim else height(x, z), z))
        grid.append(row)
    verts = [p for row in grid for p in row]
    idx = lambda i, j: j * (nx + 1) + i  # noqa: E731
    faces = [(idx(i, j), idx(i, j + 1), idx(i + 1, j + 1), idx(i + 1, j)) for j in range(nz) for i in range(nx)]
    rim = [idx(i, 0) for i in range(nx + 1)] + [idx(nx, j) for j in range(1, nz + 1)] + [idx(i, nz) for i in range(nx - 1, -1, -1)] + \
          [idx(0, j) for j in range(nz - 1, 0, -1)]
    faces.append(tuple(reversed(rim)))
    parts: list = []

    def colour(c, n):
        if n.y < -0.9:
            return SNOW_DEEP
        if n.y > 0.94:
            return SNOW
        return SNOW_SHADE if n.y > 0.8 else SNOW_LILAC

    v.painted(parts, "drifts", verts, faces, paint, colour, smooth=lambda c, n: n.y > -0.9)
    return parts, 400


# ---------------------------------------------------------------- frozen-fall (record ①)

def frozen_fall():
    """こおった たき: a small cliff of grey faceted rock with snow on its ledges and a pillow of snow on top; down its
    front the waterfall froze as it fell, a bulging cascade of pale blue ice in vertical streaks, icicles hanging from
    the rock beside it, a round frozen pool at its foot between two little drifts."""
    paint = snow_paint(0.8, extra={ICE: 0.16, ICE_LIGHT: 0.2, ICE_DEEP: 0.12, ROCK: 0.1, ROCK_LIGHT: 0.12, ROCK_DARK: 0.08})
    parts: list = []
    for name, size, center, sub, seed in (("rock-l", (2.7, 5.4, 2.7), (-1.95, 2.55, -0.55), 2, 3), ("rock-r", (2.5, 5.0, 2.5), (1.95, 2.35, -0.5), 2, 5),
                                          ("rock-top", (4.8, 2.4, 2.5), (0.0, 5.5, -0.95), 1, 7), ("rock-back", (2.4, 6.0, 1.9), (0.0, 3.1, -1.25), 1, 9),
                                          ("rock-foot", (1.3, 1.0, 1.2), (-2.75, 0.4, 0.95), 1, 11)):
        v.lumpy_stone(parts, name, size, center, paint(ROCK), paint(SNOW), seed, sub=sub, top_from=0.62, rough=0.12)
        recolour(parts[-1], paint, lambda c, n: SNOW if n.y > 0.5 else (ROCK_LIGHT if n.x * 0.5 + n.z * 0.5 > 0.3 else (ROCK_DARK if n.y < -0.35 else ROCK)),
                 smooth=False)
        v.cut_below(parts[-1], 0.0)
    for i, (size, center, seed) in enumerate((((2.8, 0.85, 2.1), (-0.95, 6.72, -0.9), 13), ((2.6, 1.0, 2.0), (1.0, 6.75, -0.8), 15))):
        v.lumpy_stone(parts, f"snow-top-{i}", size, center, paint(SNOW_SHADE), paint(SNOW), seed, sub=1, top_from=0.25, rough=0.1)
        k.set_smooth(parts[-1], True)
    # The frozen cascade: rings from the lip down, its front in five rounded flutes (streaks of two blues).
    flutes = 9
    rings = []
    for y, half, zf, zb in ((6.35, 0.75, 0.25, -0.35), (5.3, 0.9, 0.5, -0.3), (3.7, 1.05, 0.72, -0.25), (2.1, 1.2, 0.9, -0.2), (0.3, 1.45, 1.25, -0.1)):
        ring = []
        for i in range(flutes):
            t = -1 + 2 * i / (flutes - 1)
            x = t * half
            ring.append((x, y, zf * (1 - 0.35 * t * t) + (0.1 if i % 2 else 0.0)))
        ring += [(half * 0.9, y, zb), (-half * 0.9, y, zb)]
        rings.append(ring)

    def ice(tag, c, n):
        if tag[0] != "gap":
            return ICE_DEEP
        j = tag[2]
        if j >= flutes - 1:
            return ICE_DEEP
        return ICE_LIGHT if j % 2 == 0 and c.y > 1.5 else (ICE if c.y > 1.2 else ICE_DEEP)

    loft(parts, "fall", rings, paint, ice, smooth=lambda c, n: True)
    for i, (x, y, z, length) in enumerate(((-1.05, 5.8, 0.15, 1.1), (-1.35, 5.4, 0.3, 0.8), (1.1, 5.5, 0.2, 1.0), (1.4, 5.0, 0.4, 0.7))):
        k.add_tapered_segment(parts, f"icicle-{i}", (x, y, z), (x, y - length, z + 0.05), 0.11, 0.0, paint(ICE_LIGHT), vertices=5, smooth=True)
    # The frozen pool and the drifts beside it.
    v.lathe(parts, "pool", [(0.0, 2.0, ICE_DEEP), (0.16, 1.95, ICE), (0.22, 0.0, ICE)],
            lambda y, a, r: (math.cos(a) * r, y, 1.45 + math.sin(a) * r * 0.55), 10, paint, smooth=lambda c, n: n.y < 0.95)
    for i, (x, z, r, h) in enumerate(((-2.0, 1.75, 0.95, 0.5), (2.1, 1.55, 1.05, 0.55))):
        v.lathe_y(parts, f"drift-{i}", [(0.0, r, SNOW_SHADE), (h * 0.55, r * 0.8, SNOW), (h, 0.0, SNOW)], (x, z), 6, paint, smooth=True)
    return parts, 500


# ---------------------------------------------------------------- spiral-mitten (record ②)

def twisted(rings, segments, turns, y0, y1, centre_of=lambda y: (0.0, 0.0), tip=None):
    """Rings (y, rx, rz) of a body round a vertical axis, each turned a little more than the one below (`turns` whole
    turns from y0 to y1): the faces between them run in a spiral."""
    out = []
    for y, rx, rz in rings:
        twist = TAU * turns * (y - y0) / (y1 - y0)
        cx, cz = centre_of(y)
        out.append([(cx + math.cos(TAU * i / segments + twist) * rx, y, cz + math.sin(TAU * i / segments + twist) * rz) for i in range(segments)])
    return out


def spiral_mitten():
    """ぐるぐる もようの てぶくろ: one mitten standing up, flat and round, purple and green stripes winding round it like
    Sakasa's hat (nobody says so), its thumb striped too, a soft white ribbed cuff at the bottom."""
    paint = v.Paint(0.85, glow={MITTEN_CUFF: 0.08})
    parts: list = []
    seg = 10
    cuff = [[(math.cos(TAU * i / seg) * rx * (1.0 if i % 2 else 0.93), y, math.sin(TAU * i / seg) * rz * (1.0 if i % 2 else 0.93)) for i in range(seg)]
            for y, rx, rz in ((0.0, 0.14, 0.078), (0.12, 0.15, 0.084))]
    loft(parts, "cuff", cuff, paint, lambda tag, c, n: MITTEN_CUFF if tag[0] != "gap" or tag[2] % 2 else MITTEN_CUFF_SHADE, smooth=lambda c, n: abs(n.y) < 0.9)
    body = twisted([(0.11, 0.132, 0.072), (0.17, 0.148, 0.083), (0.235, 0.158, 0.089), (0.3, 0.158, 0.089), (0.36, 0.15, 0.085), (0.42, 0.125, 0.073),
                    (0.465, 0.075, 0.046)], 10, 0.55, 0.11, 0.48, centre_of=lambda y: (-0.025, 0.0))
    verts, faces, tags = rv.body(body, top=(-0.025, 0.492, 0.0), cap_bottom=True)
    cols = [MITTEN_A if (tag[0] in ("gap", "top") and tag[-1] % 2 == 0) else MITTEN_B for tag in tags]
    v.painted(parts, "hand", verts, faces, paint, cols, smooth=True)
    # The thumb: a short striped tube leaning out to the model's left (+X), closed at its round tip.
    axis = [(0.085, 0.17), (0.155, 0.235), (0.18, 0.3)]
    rings = []
    for (x, y), r in zip(axis, (0.05, 0.048, 0.04)):
        rings.append([(x + math.cos(TAU * i / 8 + y * 9) * r * 0.9, y + math.sin(TAU * i / 8 + y * 9) * r * 0.35, math.sin(TAU * i / 8 + y * 9) * r * 0.85)
                      for i in range(8)])
    verts, faces, tags = rv.body(rings, top=(0.19, 0.335, 0.0), cap_bottom=True)
    cols = [MITTEN_B if (tag[0] in ("gap", "top") and tag[-1] % 2 == 0) else MITTEN_A for tag in tags]
    v.painted(parts, "thumb", verts, faces, paint, cols, smooth=True)
    return parts, 250


# ---------------------------------------------------------------- tin-shovel (record ③)

def tin_shovel():
    """ブリキの ちいさな スコップ: a small silver tin shovel standing on its blade: a scoop with its sides turned up a
    little to the front and a round tip, a darker rolled edge and socket where the red wooden shaft goes in, a red
    D-grip on top."""
    paint = v.Paint(0.5, glow={HANDLE: 0.05})
    parts: list = []
    cols, rows = 5, 3
    front, back = [], []
    for j in range(rows):
        t = j / (rows - 1)                       # 0 at the tip, 1 at the top of the blade
        half = 0.14 * (0.72 + 0.28 * math.sqrt(t))
        for i in range(cols):
            u = -1 + 2 * i / (cols - 1)
            x = u * half
            y = 0.33 * t + (0.075 * u * u if j == 0 else 0.0)   # the tip rounded: lowest in the middle
            z = 0.07 * (1 - t) + 0.05 * u * u
            front.append((x, y, z + 0.008))
            back.append((x, y, z - 0.008))
    verts = front + back
    n = cols * rows
    faces = []
    for j in range(rows - 1):
        for i in range(cols - 1):
            a = j * cols + i
            faces.append((a, a + 1, a + cols + 1, a + cols))
            faces.append((n + a + cols, n + a + cols + 1, n + a + 1, n + a))
    rim = [j * cols for j in range(rows)][::-1] + list(range(cols)) + [j * cols + cols - 1 for j in range(rows)] + \
          [(rows - 1) * cols + i for i in range(cols - 1, -1, -1)]
    seen = []
    for vtx in rim:
        if not seen or seen[-1] != vtx:
            seen.append(vtx)
    loop = seen[:-1] if seen[0] == seen[-1] else seen
    for a, b in zip(loop, loop[1:] + loop[:1]):
        faces.append((a, b, n + b, n + a))
    v.painted(parts, "blade", verts, faces, paint, lambda c, nrm: TIN if nrm.z > 0.3 else TIN_DARK, smooth=lambda c, nrm: abs(nrm.z) > 0.3)
    k.add_box(parts, "edge", (0.27, 0.035, 0.05), (0.0, 0.33, 0.012), paint(TIN_DARK))
    k.add_tapered_segment(parts, "socket", (0.0, 0.3, 0.0), (0.0, 0.43, 0.0), 0.036, 0.026, paint(TIN_DARK), vertices=6, smooth=True)
    k.add_tapered_segment(parts, "shaft", (0.0, 0.42, 0.0), (0.0, 0.79, 0.0), 0.022, 0.022, paint(HANDLE), vertices=5, smooth=True)
    grip = [(-0.016, 0.78, 0.0), (-0.075, 0.82, 0.0), (-0.072, 0.875, 0.0), (0.0, 0.888, 0.0), (0.072, 0.875, 0.0), (0.075, 0.82, 0.0),
            (0.016, 0.78, 0.0)]
    tube(parts, "grip", grip, [0.019] * len(grip), paint(HANDLE), sides=3)
    return parts, 150


# ---------------------------------------------------------------- export and preview

def fit_box(model, lo, hi):
    """Scale and move the model so its bounding box is exactly lo..hi (glTF)."""
    _, a, b = k.model_metrics(model)
    sx, sy, sz = ((hi[i] - lo[i]) / (b[i] - a[i]) for i in range(3))
    model.scale = (sx, sz, sy)  # Blender axes: x, y (= glTF -z), z (= up)
    k.active(model)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _, a, _ = k.model_metrics(model)
    model.location += Vector(k.to_blender((lo[0] - a[0], lo[1] - a[1], lo[2] - a[2])))
    k.active(model)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)


def preview(model, name, direction, size, dark=False):
    """volcano.preview's three-quarter view; `dark` for the glowing ones: an evening sky and a dimmer, warmer light."""
    v.preview(model, name, direction, size)
    if not dark:
        return
    scene = bpy.context.scene
    tree = scene.world.node_tree
    seen = tree.nodes["Background"]
    seen.inputs["Color"].default_value = (0.55, 0.3, 0.25, 1)
    for node in tree.nodes:
        if node.type == "BACKGROUND" and node is not seen:
            node.inputs["Color"].default_value = (0.95, 0.75, 0.6, 1)
            node.inputs["Strength"].default_value = 0.45
    for obj in scene.objects:
        if obj.type == "LIGHT":
            obj.data.energy = 1.2
            obj.data.color = (1.0, 0.72, 0.53)
    bpy.ops.render.render(write_still=True)


BUILDERS = {"plow-blade": plow_blade, "snow-wall": snow_wall, "sign-plow": sign_plow, "lantern": lantern, "kamakura": kamakura,
            "amanojaku-kamakura": amanojaku_kamakura, "snow-house": lambda: snow_house("snow-house"),
            "snow-house-b": lambda: snow_house("snow-house-b"), "snow-fence-small": lambda: fence(False),
            "snow-fence-trace": lambda: fence(True), "snow-shed": snow_shed, "ski-ramp": ski_ramp, "ski-ramp-folded": ski_ramp_folded,
            "ski-lift-tower": ski_lift_tower, "snow-ravine": snow_ravine, "frozen-fall": frozen_fall, "spiral-mitten": spiral_mitten,
            "tin-shovel": tin_shovel}
# The stand-ins' exact bounding boxes (min, max) for the shapes made to fit them.
FIT = {"snow-wall": ((-4.4, 0.0, -2.13), (4.4, 5.0, 2.63))}
# Built about their size, then stretched to the stand-in's height.
HEIGHT = {"frozen-fall": 7.5}
# Vertex-coloured models: colour_at for their corners, split for their second material.
VERTEX = {"snow-wall": (wall_colour, None), "lantern": (None, lantern_split), "snow-fence-trace": (None, trace_split)}
# Kept where they are modelled (x/z origin); the rest are centred on their bounding box.
KEEP_XZ = {"plow-blade", "sign-plow", "lantern", "kamakura", "snow-house", "snow-house-b", "snow-fence-small", "snow-fence-trace",
           "snow-shed", "ski-ramp", "ski-ramp-folded", "ski-lift-tower", "snow-ravine", "frozen-fall", "spiral-mitten", "tin-shovel"}
VIEWS = {"plow-blade": (0.62, -0.72, 0.38), "snow-wall": (0.5, -0.8, 0.3), "sign-plow": (0.35, -0.9, 0.15), "lantern": (0.5, -0.8, 0.25),
         "kamakura": (0.45, -0.8, 0.35), "amanojaku-kamakura": (0.45, -0.8, 0.35), "snow-house": (0.55, -0.72, 0.35),
         "snow-house-b": (-0.55, -0.72, 0.35), "snow-fence-small": (0.35, -0.9, 0.25), "snow-fence-trace": (0.35, -0.9, 0.25),
         "snow-shed": (0.62, -0.62, 0.3), "ski-ramp": (0.7, -0.6, 0.35), "ski-ramp-folded": (-0.75, -0.55, 0.3),
         "ski-lift-tower": (0.55, -0.75, 0.25), "snow-ravine": (0.6, -0.72, 0.3), "frozen-fall": (0.4, -0.85, 0.25),
         "spiral-mitten": (0.35, -0.85, 0.3), "tin-shovel": (0.45, -0.8, 0.3)}
TALL = {"sign-plow", "lantern", "ski-lift-tower", "frozen-fall", "spiral-mitten", "tin-shovel"}
DARK = {"kamakura", "snow-house-b"}

if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if a in BUILDERS] or list(BUILDERS)
    for name in names:
        k.reset()
        built, budget = BUILDERS[name]()
        model = built if isinstance(built, bpy.types.Object) else k.join(built, name)
        model.name = name
        model.data.name = name
        model.data.validate()
        if name in HEIGHT:
            _, lo, hi = k.model_metrics(model)
            v.scale_to(model, (hi[0] - lo[0], HEIGHT[name], hi[2] - lo[2]))
        if name in FIT:
            fit_box(model, *FIT[name])
        elif name in KEEP_XZ:
            v.floor_to_zero(model)
        else:
            k.normalize(model, None)
        # No uv layer (nothing is textured); triangulated by a fixed rule.
        while model.data.uv_layers:
            model.data.uv_layers.remove(model.data.uv_layers[0])
        k.apply_modifier(model, "TRIANGULATE", quad_method="FIXED", ngon_method="CLIP")
        size = (400, 512) if name in TALL else (512, 400)
        if name in VERTEX:
            colour_at, split = VERTEX[name]
            to_vertex_colours(model, colour_at, split)
            md.export_glb([model], name, budget)
        else:
            s.export_glb(model, name, budget)
        preview(model, name, VIEWS.get(name, (0.55, -0.72, 0.42)), size, dark=name in DARK)
