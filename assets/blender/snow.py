"""Stage 4-3 (ゆきやまのトンネル) — Claude Code. Ticket 0017.

The crafted look (つくりこみ) of chapters 1-3 (sky.py, volcano.py and river.py, whose helpers this script uses): flat
colours (the game bakes each model into one draw call), round friendly snow, faceted rock and ice. A snowy ridge under
a bright overcast sky: snow is never plain white but shades to a light blue, and the snow, the ice and the icicles give
off a little of their own colour as light, so their shaded side stays soft and bright. Only the snowmen and the hare
have faces: two round dark eyes (and the snowmen's small orange nose); no mouth, teeth or brows, no top hat, pipe or
twig hair (like no known snowman). The snow wave has no face at all: round soft balls of snow, no spikes.

Models (same names, sizes, origins and orientation as the code stand-ins they replace, so the stage JSON does not
change; origin at the bottom centre, +Z forward, the model's own left is +X):
- snow-wave 36 x 9 x 16 (its front, +Z, at z 8: snow.ts puts the front WAVE_NOSE = 8 m ahead of the origin) and
  snow-wave-small, the same at half size: nine round balls of snow side by side, five bigger ones behind and above,
  little snowballs rolling at its foot; white on top to a light blue below.
- snowman 3.2 x 2.8 x 1.8 (the body 1.8 wide, its twig arms reach 1.6 out), face +Z; snowman-big the same 2.2 times;
  snowman-upside 2.4 x 2.8 x 1.9: the big ball on top (eyes and nose), the hat upside down round the small one.
- snow-pile 3 x 1.6 x 2.5 (the heap 1.3 high, a twig sticking out of it).
- snow-ridge 1100 x 200 x 500: the ridge's surface is exactly the stand-in's (scripts/layout-4-3.mjs puts the pines on
  it and checks the tunnel's roof by the same formula): level at 200 within 80 m of its middle line, down to 88 at
  214 m out, a steep cliff to 0 at 242 m; the ends rounded down past 480 m. Where the tunnel comes out of the cliffs
  (read from src/stages/4-3.json) the snow is cut back under the portal's hood, so the tunnel is open (see
  tunnel-portal). A flat bottom at y -0.01 out to 250 m closes it.
- snow-knoll 104 x 40.2 x 154: the same rings as the stand-in (and layout-4-3.mjs), the pond's hole 34 x 84 in its
  flat top (the pond's water, walls and floor are drawn by the game, water.ts).
- tunnel-portal 14 x 12 x 10.8: z from -2.4 (inside the mouth) to 8.4 (outside), as the stand-in. The opening is the
  tube's (9 wide, the arch's top 8 m over the origin, which the game sets on the tube's floor). A dark plate across the
  opening 4.3 m out (its inner side light) shows the tunnel's dark from outside and hides the cliff's cut there.
- ice-hall 76 x 18 x 172 (the stage draws it 1.25 times): a closed shell, so its inside is seen from inside; doorways
  where main's tube comes in (read from the stage JSON); ice crystals and icicles clear of every rail.
- ice-pillar 3 x 18 x 3, fake-exit 10 x 8 x 1.1 (picture +Z; materials "fake-exit-light" and "fake-exit-swirl", which
  the game swaps for a light the fog does not hide and the swirl it lights when the light sees through it,
  src/view/three/snow-models.ts), exit-glow 8 x 7 (both sides, material "exit-glow", made a fog-free light by the game).
- snow-fence 70.2 x 5.8 x 1.2: a gate over the track (6.3 m clear between the posts, 5 m under the beam) and a wooden
  fence 30 m each side along X.
- lodge 14 x 10 x 10: a log cabin, door +Z.
- Records snow-hare 0.6 x 0.55 x 0.8, ice-flower 1.2 x 0.8 x 1.2, sleigh-bell 0.5 x 0.6 x 0.5.
Output: public/models/<name>.glb and assets/previews/<name>.png.
Run: python3 scripts/run-bpy.py assets/blender/snow.py [-- name ...]
"""
from __future__ import annotations

from pathlib import Path
import json
import math
import random
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import sky as s  # noqa: E402  (chapter 1's crafted helpers: fix_normals, ring_faces, plate, split_at, pebble...)
import volcano as v  # noqa: E402  (chapter 2's: Paint, painted, lathe_y, lumpy_stone, eye, look, scale_to, preview...)
import river as r  # noqa: E402  (chapter 3's: clay, recolour, painted_clay, floor_to_zero, centre_xz...)
import meadow as md  # noqa: E402  (vertex-coloured paint: paint_material, bake_colours)
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

TAU = 2 * math.pi
Paint = v.Paint
hexmix = v.hexmix

# ---------------------------------------------------------------- palette (ticket 0017)

SNOW, SNOW_SOFT, SNOW_SHADE, SNOW_DEEP = "#FBFDFF", "#EEF3F8", "#DCE6F2", "#C9DBEA"
ROCK, ROCK_LIGHT, ROCK_DARK = "#8A96A3", "#A3AEBA", "#707C89"
STONE, STONE_LIGHT, STONE_DARK, MOUTH = "#7C8591", "#959DA8", "#666F7B", "#2E3646"
ICE, ICE_LIGHT, ICE_MID, ICE_DEEP, ICICLE = "#BFE3F5", "#E2F4FC", "#98C6E0", "#6C93B5", "#D8F0FF"
HAT, HAT_DARK, POMPOM = "#4FA36B", "#3F8C5A", "#FFFFFF"
SCARF, SCARF_DARK = "#F2C14E", "#E5A93A"
TWIG, TWIG_DARK, NOSE = "#7A5234", "#634229", "#F28A3B"
LOG, LOG_LIGHT, LOG_DARK, LOG_END = "#A8744A", "#B88352", "#8A5C36", "#D9AE7E"
ROOF_WOOD, PLANK, DOOR, DOOR_DARK = "#6E4A34", "#9C6A44", "#6B4E3A", "#57402F"
WINDOW, WINDOW_FRAME, LANTERN = "#FFD45C", "#F4E6CF", "#FFC861"
FENCE, FENCE_DARK, FENCE_LIGHT = "#9A6B45", "#7A5234", "#AD7C52"
HARE, HARE_SHADE, HARE_EAR = "#FFFFFF", "#EEF1F6", "#D9B99B"
GOLD, GOLD_LIGHT, GOLD_DARK, CORD, CORD_DARK = "#E8B93A", "#F6D46A", "#B98A28", "#D9483B", "#B8352B"
SWIRL, EXIT_LIGHT, PINE_SHADOW, HILL_SHADOW = "#FF7FBF", "#F7FBFF", "#9FB7C9", "#C4D6E4"
EYE = v.EYE

# A little of their own colour as light (the code stand-ins lit snow by 0.45 of its colour): the snow stays white and
# soft blue on its shaded side, the ice and the icicles glint, the lodge's windows are warm.
GLOW = {SNOW: 0.38, SNOW_SOFT: 0.4, SNOW_SHADE: 0.42, SNOW_DEEP: 0.38, ICE: 0.3, ICE_LIGHT: 0.34, ICE_MID: 0.26,
        ICE_DEEP: 0.2, ICICLE: 0.4, HARE: 0.3, HARE_SHADE: 0.26, POMPOM: 0.3, WINDOW: 0.65, LANTERN: 0.7,
        GOLD_LIGHT: 0.18, GOLD: 0.12, EXIT_LIGHT: 0.6, HILL_SHADOW: 0.3, SWIRL: 0.2, ROCK: 0.3, ROCK_LIGHT: 0.32,
        ROCK_DARK: 0.24}


def snow_paint(roughness=0.9):
    return Paint(roughness, glow=GLOW)


def snow_band(top, low):
    """White above `top`, the soft tone down to `low`, the light blue below."""
    return lambda y: SNOW if y >= top else (SNOW_SOFT if y >= low else SNOW_SHADE)


# ---------------------------------------------------------------- mesh helpers (glTF coordinates)

def ball(parts, name, center, radius, paint, colour_at, segments=10, rings=6, squash=1.0, cut=None, phase=0.0,
         smooth=True, point=None):
    """A ball turned about the vertical (v.lathe_y), `squash` times as high as wide, each band coloured by
    colour_at(y of its lower ring); `cut` flattens its bottom at that height. `point(x, y, z)` may move the vertices
    (a tilted hat)."""
    cx, cy, cz = center
    ry = radius * squash
    t0 = math.acos(max(-1.0, min(1.0, (cy - cut) / ry))) if cut is not None and cy - ry < cut else 0.0
    profile = []
    for i in range(rings + 1):
        t = t0 + (math.pi - t0) * i / rings
        y = cy - math.cos(t) * ry
        rr = 0.0 if i == rings or (i == 0 and t0 == 0.0) else math.sin(t) * radius
        profile.append((y, rr, colour_at(y)))
    place = (lambda y, a, rr: point((cx + math.cos(a) * rr, y, cz + math.sin(a) * rr))) if point else \
        (lambda y, a, rr: (cx + math.cos(a) * rr, y, cz + math.sin(a) * rr))
    return v.lathe(parts, name, profile, place, segments, paint, smooth, phase)


def lathe_at(parts, name, profile, center, segments, paint, smooth=True, phase=0.0, point=None):
    """v.lathe_y about the vertical through `center` (x, z), with an optional vertex move `point`."""
    cx, cz = center
    place = (lambda y, a, rr: point((cx + math.cos(a) * rr, y, cz + math.sin(a) * rr))) if point else \
        (lambda y, a, rr: (cx + math.cos(a) * rr, y, cz + math.sin(a) * rr))
    return v.lathe(parts, name, profile, place, segments, paint, smooth, phase)


def turner(pivot, rx=0.0, ry=0.0, rz=0.0):
    """A function turning glTF points about `pivot` by rx, then rz, then ry (radians)."""
    px, py, pz = pivot

    def turn(p):
        x, y, z = p[0] - px, p[1] - py, p[2] - pz
        y, z = y * math.cos(rx) - z * math.sin(rx), y * math.sin(rx) + z * math.cos(rx)
        x, y = x * math.cos(rz) - y * math.sin(rz), x * math.sin(rz) + y * math.cos(rz)
        x, z = x * math.cos(ry) + z * math.sin(ry), -x * math.sin(ry) + z * math.cos(ry)
        return (x + px, y + py, z + pz)
    return turn


def bobble(parts, name, center, radius, m, seed, sub=1, rough=0.12):
    """A little faceted ball (a jittered icosphere: 20 faces, or 80 with sub=2), one material, smooth."""
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
    rx, ry, rz = radius if isinstance(radius, tuple) else (radius, radius, radius)
    obj.scale = (rx, rz, ry)
    obj.location = k.to_blender(center)
    mesh.materials.append(m)
    k.active(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    s.fix_normals(obj)
    k.set_smooth(obj, True)
    parts.append(obj)
    return obj


def torus(parts, name, center, big, small, segments, sides, paint, colour_of, tilt=None, stretch=(1.0, 1.0)):
    """A ring about the vertical through `center`: tube radius `small` (stretched (across, up)), colour_of(segment)."""
    cx, cy, cz = center
    verts, faces, cols = [], [], []
    for i in range(segments):
        a = TAU * i / segments
        for j in range(sides):
            b = TAU * j / sides + math.pi / sides
            rr = big + math.cos(b) * small * stretch[0]
            p = (cx + math.cos(a) * rr, cy + math.sin(b) * small * stretch[1], cz + math.sin(a) * rr)
            verts.append(tilt(p) if tilt else p)
    for i in range(segments):
        a, b = i * sides, ((i + 1) % segments) * sides
        for j in range(sides):
            faces.append((a + j, a + (j + 1) % sides, b + (j + 1) % sides, b + j))
            cols.append(colour_of(i))
    return v.painted(parts, name, verts, faces, paint, cols, smooth=True)


def strip(parts, name, points, width, thick, up_hint, paint, colour_of, smooth=True):
    """A closed flat band through `points` (a scarf's tail, a cord): `width` across (perpendicular to the path and
    `up_hint`), `thick` through; colour_of(segment index)."""
    pts = [Vector(p) for p in points]
    verts = []
    for i, p in enumerate(pts):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        along = (b - a).normalized()
        across = along.cross(Vector(up_hint)).normalized()
        through = across.cross(along).normalized()
        for sa, st in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
            verts.append(tuple(p + across * (sa * width / 2) + through * (st * thick / 2)))
    faces, cols = [(3, 2, 1, 0)], [colour_of(0)]
    for i in range(len(pts) - 1):
        a, b = i * 4, (i + 1) * 4
        for j in range(4):
            faces.append((a + j, a + (j + 1) % 4, b + (j + 1) % 4, b + j))
            cols.append(colour_of(i))
    last = (len(pts) - 1) * 4
    faces.append((last, last + 1, last + 2, last + 3))
    cols.append(colour_of(len(pts) - 2))
    return v.painted(parts, name, verts, faces, paint, cols, smooth=smooth)


def eye(parts, paint, tree, center, radius, direction, size, name, body):
    """v.eye for a head of any size: the ray that finds the surface starts outside it (`radius` from `center`)."""
    shifted = tuple(Vector(center) + direction * (radius + 0.5 - 0.6))
    v.eye(parts, paint, tree, shifted, direction, size, name, body)


def twig(parts, name, a, b, r0, r1, m, sides=4):
    obj = k.add_tapered_segment(parts, name, a, b, r0, r1, m, vertices=sides, smooth=False)
    s.fix_normals(obj)
    return obj


def prism(parts, name, outline, y0, y1, paint, colour, top=None, bottom=None, smooth=False):
    """A slab standing on the outline [(x, z)] from y0 to y1 (closed). `top`/`bottom` colour those caps."""
    n = len(outline)
    verts = [(x, y0, z) for x, z in outline] + [(x, y1, z) for x, z in outline]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + s.ring_faces(0, n, n)
    cols = [bottom or colour, top or colour] + [colour] * n
    return v.painted(parts, name, verts, faces, paint, cols, smooth=smooth)


def slab_z(parts, name, outline, z0, z1, paint, colour, front=None, back=None, side=None):
    """A slab on the outline [(x, y)] (a picture's shape) from z0 to z1 (closed); `front` colours the +Z face."""
    n = len(outline)
    verts = [(x, y, z0) for x, y in outline] + [(x, y, z1) for x, y in outline]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + s.ring_faces(0, n, n)
    cols = [back or colour, front or colour] + [side or colour] * n
    return v.painted(parts, name, verts, faces, paint, cols, smooth=False)


def sheet(parts, name, outline, z, m, both=None, offset=0.0):
    """A flat picture in the plane z, facing +Z (a fan from its middle); `both` adds the back (-Z) on its own vertices
    in that material, `offset` m behind."""
    n = len(outline)
    cx = sum(p[0] for p in outline) / n
    cy = sum(p[1] for p in outline) / n
    verts = [(cx, cy, z)] + [(x, y, z) for x, y in outline]
    area = sum(outline[i][0] * outline[(i + 1) % n][1] - outline[(i + 1) % n][0] * outline[i][1] for i in range(n))
    ccw = area > 0
    faces = [(0, 1 + i, 1 + (i + 1) % n) if ccw else (0, 1 + (i + 1) % n, 1 + i) for i in range(n)]
    materials = [m]
    indices = [0] * n
    if both is not None:
        verts += [(cx, cy, z - offset)] + [(x, y, z - offset) for x, y in outline]
        faces += [tuple(n + 1 + i for i in reversed(f)) for f in faces[:n]]
        if both is not m:
            materials.append(both)
        indices += [len(materials) - 1] * n
    return k.add_mesh(parts, name, verts, faces, materials, indices, smooth=False)


def arch_outline(half, spring, rise, segments, y0=0.0):
    """The tunnel opening's shape [(x, y)], counter-clockwise from the bottom right: straight sides up to `spring`, a
    half ellipse `half` wide and `rise` high over them."""
    pts = [(half, y0), (half, spring)]
    for i in range(1, segments):
        a = math.pi * i / segments
        pts.append((math.cos(a) * half, spring + math.sin(a) * rise))
    pts += [(-half, spring), (-half, y0)]
    return pts


def snow_mass(name, size, volumes, budget, voxel, bands, smooth=4):
    """Round volumes [(radii, centre)] fused into one soft heap (voxel remesh, smoothed), flat underneath, exactly
    `size` (w, h, d) with its bottom centre at the origin; coloured in level bands [(y from, hex)] from the top down,
    each band's line cut cleanly (sky.split_at). Fewer than `budget` triangles."""
    paint = snow_paint()
    made: list = []
    for i, (radii, center) in enumerate(volumes):
        k.add_ellipsoid(made, f"{name}-v{i}", tuple(2 * x for x in radii), center, paint(SNOW), segments=24, rings=12)
    dense = k.join(made, f"{name}-dense")
    k.apply_modifier(dense, "REMESH", mode="VOXEL", voxel_size=voxel, adaptivity=0.0)
    if smooth:
        k.apply_modifier(dense, "SMOOTH", factor=0.5, iterations=smooth)
    k.active(dense)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bisect(plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    w, h, d = size
    target = budget * 0.85
    while True:
        heap = dense.copy()
        heap.data = dense.data.copy()
        bpy.context.collection.objects.link(heap)
        k.apply_modifier(heap, "DECIMATE", decimate_type="COLLAPSE", ratio=min(1.0, target / max(k.triangles(dense), 1)),
                         use_collapse_triangulate=True)
        r.drop_crumbs(heap, keep=8)
        _, lo, hi = k.model_metrics(heap)
        heap.scale = (w / (hi[0] - lo[0]), d / (hi[2] - lo[2]), h / (hi[1] - lo[1]))
        k.active(heap)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        k.normalize(heap, None)
        for y, _ in bands[:-1]:
            s.split_at(heap, y)
        heap.data.update()
        bm = bmesh.new()
        bm.from_mesh(heap.data)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.to_mesh(heap.data)
        bm.free()
        if k.triangles(heap) <= budget:
            break
        target -= k.triangles(heap) - budget + 6
        bpy.data.objects.remove(heap, do_unlink=True)
    bpy.data.objects.remove(dense, do_unlink=True)
    heap.name = name
    heap.data.name = name
    heap.data.materials.clear()
    slots: dict[str, int] = {}
    for poly in heap.data.polygons:
        c, nm = k.gltf(poly.center), k.gltf(poly.normal)
        colour = next(hx for y, hx in bands if c.y >= y)
        if nm.y < -0.98:
            colour = bands[-1][1]
        if colour not in slots:
            slots[colour] = len(heap.data.materials)
            heap.data.materials.append(paint(colour))
        poly.material_index = slots[colour]
        poly.use_smooth = nm.y > -0.98
    s.fix_normals(heap)
    return heap


def stage_json():
    return json.loads((k.ROOT / "src" / "stages" / "4-3.json").read_text())


def rail_points(rail_id, step=2.0):
    """4-3's rail as points (x, y, z) every `step` m (world)."""
    pts = next(rl["points"] for rl in stage_json()["rails"] if rl["id"] == rail_id)
    out = []
    for a, b in zip(pts, pts[1:]):
        length = math.dist(a, b)
        n = max(1, int(length / step))
        out += [tuple(a[j] + (b[j] - a[j]) * i / n for j in range(3)) for i in range(n)]
    out.append(tuple(pts[-1]))
    return out


def rail_at(rail_id, at):
    """Where 4-3's rail is `at` m along (x, y, z) and its unit direction (x, z) there."""
    pts = next(rl["points"] for rl in stage_json()["rails"] if rl["id"] == rail_id)
    run = 0.0
    for a, b in zip(pts, pts[1:]):
        length = math.dist(a, b)
        if run + length >= at:
            t = (at - run) / length
            flat = math.hypot(b[0] - a[0], b[2] - a[2])
            return tuple(a[j] + (b[j] - a[j]) * t for j in range(3)), ((b[0] - a[0]) / flat, (b[2] - a[2]) / flat)
        run += length
    raise ValueError(at)


def prop_of(model):
    return next(p for p in stage_json()["props"] if p["model"] == model)


# ---------------------------------------------------------------- the snow wave

def snow_wave(scale=1.0, name="snow-wave"):
    """ゆきの なみ「もこもこ」: nine round balls of snow side by side along its front, five bigger ones behind and above
    them, a few small puffs on top and little snowballs rolling at its foot; each ball white on top to a light blue
    underneath, smooth and round. No face, no spikes, no teeth. Its front is +Z (z 8, where snow.ts expects it)."""
    paint = snow_paint()
    rng = random.Random(43)
    parts: list = []
    sc = scale

    def shade(top, low):
        return lambda y: SNOW if y >= top * sc else (SNOW_SOFT if y >= low * sc else SNOW_SHADE)

    for i in range(9):
        x = -14.6 + 3.65 * i + rng.uniform(-0.25, 0.25)
        rad = 3.05 + rng.uniform(-0.2, 0.3)
        cy = rad * 0.62
        ball(parts, f"front-{i}", (x * sc, cy * sc, (8.0 - rad) * sc), rad * sc, paint, shade(cy + rad * 0.35, cy - rad * 0.2),
             segments=9, rings=5, squash=0.86, cut=0.0, phase=i * 0.37)
    for i in range(5):
        x = -12.8 + 6.4 * i + rng.uniform(-0.3, 0.3)
        rad = 4.45 + rng.uniform(-0.15, 0.3)
        cy = rad * 0.86 + 0.3
        ball(parts, f"back-{i}", (x * sc, cy * sc, (-1.7 + rng.uniform(-0.3, 0.3)) * sc), rad * sc, paint, shade(cy + rad * 0.3, cy - rad * 0.3),
             segments=9, rings=5, squash=0.98, cut=0.0, phase=i * 0.53)
    for i, (x, y, z, rad) in enumerate(((-9.6, 8.1, -0.6, 1.2), (0.2, 8.3, -0.2, 1.15), (9.8, 8.0, -0.8, 1.25))):
        bobble(parts, f"puff-{i}", (x * sc, y * sc, z * sc), rad * sc, paint(SNOW), 60 + i, sub=1, rough=0.06)
    # Snowballs rolling ahead of it at its foot.
    for i, (x, rad) in enumerate(((-12.6, 0.8), (-5.4, 1.0), (1.8, 0.85), (8.4, 1.05), (14.4, 0.75))):
        bobble(parts, f"snowball-{i}", (x * sc, rad * sc, (7.9 - rad) * sc), rad * sc, paint(SNOW_SOFT), 70 + i, sub=1, rough=0.05)
    return parts, 1500


# ---------------------------------------------------------------- snowmen

def snowman_parts(paint, upside=False):
    """The snowman's parts at its own size (1.8 m body): see snowman() and snowman_upside()."""
    parts: list = []
    twig_m = paint(TWIG)
    if not upside:
        body = ball(parts, "body", (0.0, 0.88, 0.0), 0.9, paint, snow_band(1.05, 0.4), segments=10, rings=5, squash=0.97,
                    cut=0.0)
        head_c = (0.0, 1.92, 0.03)
        head = ball(parts, "head", head_c, 0.55, paint, snow_band(1.95, 1.7), segments=10, rings=5)
        # The knitted hat, tipped a little back and to one side: a ribbed cuff, the crown, a white pompom.
        tip = turner((0.0, 2.15, 0.0), rx=-0.12, rz=0.1)
        lathe_at(parts, "cuff", [(2.07, 0.555, HAT_DARK), (2.27, 0.575, HAT_DARK), (2.28, 0.53, HAT), (2.46, 0.47, HAT),
                                 (2.6, 0.33, HAT), (2.68, 0.0, HAT)], (0.0, 0.03), 10, paint, point=tip)
        bobble(parts, "pompom", tip((0.0, 2.72, 0.03)), 0.12, paint(POMPOM), 7)
        # The scarf round the neck (two-tone stripes) and its tail hanging down the front.
        torus(parts, "scarf", (0.0, 1.6, 0.02), 0.5, 0.11, 10, 4, paint, lambda i: SCARF_DARK if i % 3 == 0 else SCARF,
              stretch=(0.8, 1.15))
        tail = []
        for t in (0.0, 0.35, 0.7, 1.0):
            a = math.radians(30 + 8 * t)
            y = 1.58 - 0.5 * t
            rr = math.sqrt(max(0.0, 0.9 ** 2 - (y - 0.88) ** 2)) + 0.05 if y < 1.6 else 0.55
            tail.append((math.sin(a) * rr, y, math.cos(a) * rr))
        strip(parts, "scarf-tail", tail, 0.2, 0.06, (0, 0, 1), paint, lambda i: SCARF_DARK if i == 2 else SCARF)
        # Twig arms, raised a little, each with a fork near the end.
        for side in (-1, 1):
            twig(parts, f"arm-{side}", (side * 0.72, 1.18, 0.0), (side * 1.55, 1.56, 0.08), 0.045, 0.025, twig_m)
            twig(parts, f"fork-{side}", (side * 1.2, 1.38, 0.04), (side * 1.42, 1.74, 0.1), 0.03, 0.015, twig_m)
        eyes_on, eye_c, eye_r, nose_el = head, head_c, 0.55, -0.06
    else:
        small = ball(parts, "small", (0.0, 0.5, 0.0), 0.5, paint, snow_band(0.7, 0.3), segments=10, rings=5, cut=0.03)
        body = ball(parts, "big", (0.0, 1.88, 0.0), 0.9, paint, snow_band(2.15, 1.45), segments=10, rings=5, squash=0.98)
        # The hat upside down round the small ball, its cuff up, the pompom on the snow.
        lathe_at(parts, "hat", [(0.06, 0.0, HAT), (0.12, 0.3, HAT), (0.26, 0.47, HAT), (0.41, 0.55, HAT),
                                (0.42, 0.59, HAT_DARK), (0.62, 0.6, HAT_DARK)], (0.0, 0.0), 10, paint)
        bobble(parts, "pompom", (0.04, 0.09, 0.05), 0.11, paint(POMPOM), 9)
        # The scarf at the waist with its tail sticking up, the wrong way.
        torus(parts, "scarf", (0.0, 1.06, 0.0), 0.5, 0.1, 10, 4, paint, lambda i: SCARF_DARK if i % 3 == 0 else SCARF,
              stretch=(0.8, 1.15))
        tail = [(0.3, 1.12, 0.45), (0.36, 1.32, 0.58), (0.4, 1.52, 0.72), (0.42, 1.68, 0.8)]
        strip(parts, "scarf-tail", tail, 0.19, 0.06, (0, 0, 1), paint, lambda i: SCARF_DARK if i == 1 else SCARF)
        # Twig arms out of the small ball, pointing down to the snow.
        for side in (-1, 1):
            twig(parts, f"arm-{side}", (side * 0.35, 0.62, 0.0), (side * 1.18, 0.28, 0.1), 0.04, 0.022, twig_m)
            twig(parts, f"fork-{side}", (side * 0.85, 0.42, 0.05), (side * 1.05, 0.12, 0.2), 0.026, 0.014, twig_m)
        eyes_on, eye_c, eye_r, nose_el = body, (0.0, 1.88, 0.0), 0.9, -0.02
    # Two round dark eyes with a shine and a small orange carrot nose (no mouth).
    tree = k.world_tree(eyes_on)
    spread, rise, size = (0.36, 0.2, (0.12, 0.14)) if not upside else (0.3, 0.2, (0.17, 0.2))
    for side in (-1, 1):
        eye(parts, paint, tree, eye_c, eye_r, v.look(side * spread, rise), size, f"eye-{side}", eyes_on)
    out = Vector(v.look(0.0, nose_el))
    root = Vector(eye_c) + out * (eye_r - 0.05)
    tip = Vector(eye_c) + out * (eye_r + (0.27 if not upside else 0.3)) + Vector((0.0, -0.03, 0.0))
    nose = k.add_tapered_segment(parts, "nose", tuple(root), tuple(tip), 0.07 if not upside else 0.09, 0.0, paint(NOSE),
                                 vertices=6, smooth=False)
    s.fix_normals(nose)
    return parts


def snowman():
    """ゆきだるま: a big ball (1.8 m) and a head (1.1 m) of soft snow, a green knitted hat (a ribbed cuff, a white pompom)
    tipped a little, a yellow striped scarf with its tail down the front, twig arms raised a little; two round dark
    eyes with a shine and a small orange carrot nose. Face +Z."""
    return snowman_parts(snow_paint()), 500


def snowman_upside():
    """さかさ ゆきだるま (Sakasa made it): the big ball on top of the small one, the green hat upside down round the
    small ball with its pompom on the snow, the scarf at the waist with its tail sticking up, the twig arms pointing
    down; eyes and nose on the big ball. Face +Z."""
    return snowman_parts(snow_paint(), upside=True), 500


def snow_pile():
    """ゆきの やま: a soft heap of snow fallen off a pine's boughs onto the track: a round wobbly mound with three
    lumps on it, white on top to a light blue at its foot, a little twig sticking out of it."""
    paint = snow_paint()
    parts: list = []
    rings = [(0.0, 1.5, SNOW_SHADE), (0.3, 1.44, SNOW_SHADE), (0.62, 1.2, SNOW_SOFT), (0.88, 0.86, SNOW), (1.05, 0.45, SNOW),
             (1.1, 0.0, SNOW)]

    def wobble(p):
        x, y, z = p
        a = math.atan2(z, x)
        f = 1.0 + 0.07 * math.sin(3 * a + 0.6) + 0.04 * math.sin(5 * a + 2.0) if y < 1.09 else 1.0
        return (x * f, y, z * f * (2.5 / 3.0))
    lathe_at(parts, "mound", rings, (0.0, 0.0), 11, paint, point=wobble)
    for i, (center, rad) in enumerate((((0.55, 0.78, 0.28), (0.42, 0.34, 0.4)), ((-0.62, 0.62, -0.3), (0.46, 0.36, 0.42)),
                                       ((0.05, 1.0, -0.12), (0.36, 0.28, 0.34)))):
        bobble(parts, f"lump-{i}", center, rad, paint(SNOW), 21 + i, rough=0.08)
    twig(parts, "twig", (-0.2, 0.85, 0.05), (-0.55, 1.55, -0.1), 0.04, 0.018, paint(TWIG))
    twig(parts, "twig-fork", (-0.38, 1.2, -0.03), (-0.18, 1.45, 0.05), 0.022, 0.01, paint(TWIG))
    return parts, 200


# ---------------------------------------------------------------- the ridge

RIDGE_TOP, RIDGE_FLAT, RIDGE_SHOULDER, RIDGE_FOOT = 200.0, 80.0, 214.0, 242.0


def ridge_across(d):
    a = abs(d)
    if a <= RIDGE_FLAT:
        return RIDGE_TOP
    if a <= RIDGE_SHOULDER:
        return RIDGE_TOP - 112.0 * (1.0 - math.cos((a - RIDGE_FLAT) / 134.0 * (math.pi / 2)))
    if a <= RIDGE_FOOT:
        return 88.0 * (1.0 - (a - RIDGE_SHOULDER) / 28.0)
    return 0.0


def ridge_along(x):
    a = abs(x)
    return 1.0 if a < 480.0 else max(0.0, math.cos((a - 480.0) / 70.0 * (math.pi / 2)))


def ridge_h(x, z):
    return ridge_across(z) * ridge_along(x)


def ridge_mouths():
    """Where 4-3's tunnel comes out of the ridge (ridge coordinates): [(x, |z|, side, floor y, roof y)]."""
    data = stage_json()
    ridge = prop_of("snow-ridge")["position"]
    tunnel = next(g for g in data["gimmicks"] if g["type"] == "tunnel" and g["railId"] == "main")
    out = []
    for at in (tunnel["from"], tunnel["to"]):
        (x, y, z), _ = rail_at("main", at)
        lz = z - ridge[2]
        out.append((x - ridge[0], abs(lz), 1 if lz > 0 else -1, y - 0.8, y + 7.2))
    return out


def snow_ridge():
    """ゆきやまの 尾根: the stand-in's surface exactly (level top, rounded shoulders, steep cliffs at both feet, rounded
    ends), its vertices jittered only along the surface so the facets look hand-cut. Snow on the top and the slopes
    (soft tones by facet), grey rock ribs here and there down the slopes, the cliffs in bands of rock with snow ledges;
    a few rock outcrops with snow on top high on the slopes. Where the tunnel comes out of the cliffs the snow is cut
    back to under the floor 4 m out, under the portal's hood (the portal's dark plate hides the cut)."""
    paint = Paint(0.95, glow=GLOW)
    rng = random.Random(17)
    mouths = ridge_mouths()
    mx = sum(m[0] for m in mouths) / len(mouths)
    # Columns: dense over the rounded ends, every ~40 m along the middle, and close round the tunnel's line.
    ends = [480.0, 492.0, 505.0, 518.0, 532.0, 550.0]
    middle = [480.0 * i / 12 for i in range(1, 12)]
    near = [mx - 7.6, mx - 4.9, mx, mx + 4.9, mx + 7.6]
    xs = sorted(set([-x for x in ends] + [-x for x in middle] + near + middle + ends))
    xs = [x for x in xs if all(abs(x - n) > 6 or x in near for n in near)]
    # Rows (|z|): the flat top in one step, the shoulders, the cliffs, and the tunnel's mouths (each side its own).
    half = [RIDGE_FLAT, 100.0, 125.0, 150.0, 172.0, 190.0, 205.0, RIDGE_SHOULDER, 219.0, 230.5, 234.0, 238.0, RIDGE_FOOT]
    rows = []
    for side in (-1, 1):
        mouth = next(m for m in mouths if m[2] == side)
        extra = [mouth[1], mouth[1] + 3.9, mouth[1] + 4.1]
        rows += [side * zz for zz in sorted(set(half + extra))]
    zs = sorted(rows)
    notch = 5.3

    def height(x, z):
        y = ridge_h(x, z)
        for mx_, mz, side, floor, roof in mouths:
            if (z > 0) != (side > 0) or abs(x - mx_) > notch:
                continue
            az = abs(z)
            if mz - 0.01 <= az <= mz + 3.95:
                y = max(y, roof + 0.5)
            elif mz + 4.05 <= az <= mz + 9.0:
                y = min(y, floor - 0.5)
        return y

    grid = []
    for j, z in enumerate(zs):
        row = []
        for i, x in enumerate(xs):
            jx = x
            jz = z
            fixed_x = abs(x) >= 470 or any(abs(x - n) < 0.01 for n in near)
            if not fixed_x:
                jx = x + rng.uniform(-9.0, 9.0)
            az = abs(z)
            if 95.0 < az < 200.0 and not fixed_x:
                jz = z + rng.uniform(-5.0, 5.0)
            row.append((jx, height(jx, jz), jz))
        grid.append(row)
    nx = len(xs)
    verts = [p for row in grid for p in row]
    faces, cols = [], []

    def quad_colour(i, j, quad):
        """One colour per grid cell (both its triangles): clean strata on the cliffs, ribs on the shoulders."""
        c = sum((Vector(p) for p in quad), Vector()) / 4
        az = abs(c.z)
        if az > RIDGE_SHOULDER and c.y < 88:
            stratum = j if c.z > 0 else len(zs) - j
            if stratum % 3 != 0 or v.hash01(i // 2, stratum, 3) > 0.85:
                return SNOW_SHADE if stratum % 3 == 1 else SNOW_SOFT
            return ROCK_LIGHT if v.hash01(i // 3, stratum, 5) > 0.3 else ROCK
        if 186 < az < RIDGE_SHOULDER and v.hash01(i, 0, 11) > 0.6:
            return ROCK_LIGHT if az < 200 else ROCK
        if c.y > RIDGE_TOP - 1:
            return SNOW
        return SNOW if v.hash01(i, j, 1) > 0.3 else SNOW_SOFT

    for j in range(len(zs) - 1):
        for i in range(nx - 1):
            a, b, c, d = j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i
            # Split each quad along its shorter diagonal (closest to the formula's surface).
            pa, pc = Vector(verts[a]), Vector(verts[c])
            pb, pd = Vector(verts[b]), Vector(verts[d])
            if (pa - pc).length <= (pb - pd).length:
                faces += [(a, d, c), (a, c, b)]
            else:
                faces += [(a, d, b), (b, d, c)]
            colour = quad_colour(i, j, [verts[a], verts[b], verts[c], verts[d]])
            cols += [colour, colour]

    parts: list = []
    surface = v.painted(parts, "ridge", verts, faces, paint, cols, smooth=False, closed=False)
    # Faces must look up (a heightfield): wound so.
    for poly in surface.data.polygons:
        if poly.normal.z < 0:
            poly.flip()
    surface.data.update()
    # The flat bottom (under the ground, facing down): closes it for the views from below.
    k.add_mesh(parts, "bottom", [(-550.0, -0.01, -250.0), (550.0, -0.01, -250.0), (550.0, -0.01, 250.0), (-550.0, -0.01, 250.0)],
               [(0, 1, 2, 3)], [paint(SNOW_DEEP)])
    # Rock outcrops high on the slopes, snow on top (never above the top, never on the mouths' line).
    for i, (x, z) in enumerate(((-300.0, 120.0), (-120.0, 160.0), (240.0, 135.0), (-380.0, -130.0), (-150.0, -150.0),
                                (200.0, -125.0))):
        y = ridge_h(x, z)
        size = (26.0 + 8 * v.hash01(i, 1, 1), 15.0 + 6 * v.hash01(i, 2, 1), 20.0 + 6 * v.hash01(i, 3, 1))
        cy = min(y + size[1] * 0.12, RIDGE_TOP - size[1] * 0.62 - 0.5)
        v.lumpy_stone(parts, f"crag-{i}", size, (x, cy, z), paint(ROCK), paint(SNOW), 70 + i, sub=1, top_from=0.55, rough=0.22)
    return parts, 2500


def snow_knoll():
    """ゆきどけの いけの 小山: the mountain's lower slope with a flat snowy top (y 40.2) round the pond's hole (34 x 84 m,
    round ends), its sides falling in soft steps to the ground, a few rock patches on the steep part. The rings are the
    stand-in's (layout-4-3.mjs checks the rails clear them); a lip inside the hole meets the pond's walls (water.ts)."""
    paint = Paint(0.95, glow=GLOW)
    straight, per_half = 25.0, 12

    def outline(radius, y, jitter=0.0, seed=0):
        rng = random.Random(seed)
        pts = []
        for cz, a0 in ((straight, 0.0), (-straight, math.pi)):
            for i in range(per_half + 1):
                a = a0 + math.pi * i / per_half
                rr = radius + (rng.uniform(-jitter, jitter) if jitter else 0.0)
                pts.append((math.cos(a) * rr, y, cz + math.sin(a) * rr))
        return pts

    rings = [outline(17.15, 39.6), outline(17.0, 40.2), outline(27.0, 40.2), outline(36.0, 31.0, 0.6, 3),
             outline(45.0, 13.0, 0.9, 5), outline(52.0, 0.0)]
    n = len(rings[0])
    verts = [p for ring in rings for p in ring]
    faces = []
    for j in range(len(rings) - 1):
        faces += [(j * n + i, j * n + (i + 1) % n, (j + 1) * n + (i + 1) % n, (j + 1) * n + i) for i in range(n)]
    # The hole's lip closed underneath and the bottom: one closed body.
    faces.append(tuple(range(n)))
    last = (len(rings) - 1) * n
    faces.append(tuple(range(last + n - 1, last - 1, -1)))

    def colour(c, nm):
        d = math.hypot(c.x, max(0.0, abs(c.z) - straight))
        if nm.y < -0.5:
            return SNOW_DEEP
        if d < 17.6:
            return SNOW_SHADE
        if c.y > 40.0:
            return SNOW
        return SNOW_SOFT if c.y > 22 or v.hash01(round(c.x / 12.0), round(c.z / 12.0), 4) > 0.6 else SNOW_SHADE

    parts: list = []
    v.painted(parts, "knoll", verts, faces, paint, colour, smooth=False)
    # A few rocks showing through the snow on its steep side, snow on their tops.
    for i, (a, side) in enumerate(((0.6, 1), (2.3, -1), (4.4, 1))):
        x = side * math.cos(a) * 41.0
        z = math.sin(a) * 41.0 + (straight if a < math.pi / 2 else -straight) * side
        v.lumpy_stone(parts, f"rock-{i}", (7.0, 5.0, 6.0), (x, 20.0 - 4 * i, z), paint(ROCK), paint(SNOW), 90 + i, sub=1,
                      top_from=0.5, rough=0.2)
    return parts, 400


# ---------------------------------------------------------------- the tunnel

TUBE_HALF, TUBE_SPRING = 4.5, 3.5  # the tube's opening over the portal's origin (its floor): 9 wide, 8 high


def tunnel_portal():
    """トンネルの 口: a stone vault coming out of the cliff (z -2.4 to 8.4, +Z outside) with a headwall at its front:
    the arch exactly the tube's opening, a ring of voussoirs with a keystone proud of the face, impost blocks, a coping
    along the top, a deep soft cushion of snow on it with drips over the front and a roll of snow along the vault's
    crown, seven icicles along the arch's lip; a snowy floor inside. A dark plate across the opening 4.3 m out shows
    the tunnel's dark from outside (and hides where the cliff is cut back behind it); its inner side is light, as the
    daylight seen from inside."""
    paint = Paint(0.85, glow=GLOW)
    parts: list = []
    z0, zw, z1 = -2.4, 6.7, 8.0
    seg = 8  # the tube's arch: TUNNEL.segments - 4 pieces
    inner = arch_outline(TUBE_HALF, TUBE_SPRING, TUBE_HALF, seg)
    outer = arch_outline(5.8, TUBE_SPRING, 5.8, seg)
    # The vault: a thick arch from inside the mouth to the headwall (one closed body, its lining wound inward).
    ring = inner + list(reversed(outer))
    m = len(ring)
    verts = [(x, y, z0) for x, y in ring] + [(x, y, zw + 0.2) for x, y in ring]
    faces = [tuple(range(m - 1, -1, -1)), tuple(range(m, 2 * m))] + s.ring_faces(0, m, m)
    cols = [STONE_DARK, STONE] + [STONE_DARK if i < len(inner) - 1 else STONE for i in range(m)]
    v.painted(parts, "vault", verts, faces, paint, cols, smooth=False)
    # The headwall: each half a block from the outer arch out to its battered side and up to the coping.
    for side in (-1, 1):
        pts = [(side * 7.0, 0.0), (side * 5.95, 0.0), (side * 5.95, TUBE_SPRING)]
        for i in range(1, seg // 2 + 1):
            a = math.pi * i / seg
            pts.append((side * math.cos(a) * 5.95, TUBE_SPRING + math.sin(a) * 5.95))
        pts += [(0.0, 9.55), (side * 6.6, 9.55)]
        if side < 0:
            pts = list(reversed(pts))
        nn = len(pts)
        verts = [(x, y, zw) for x, y in pts] + [(x, y, z1) for x, y in pts]
        faces = [tuple(range(nn - 1, -1, -1)), tuple(range(nn, 2 * nn))] + s.ring_faces(0, nn, nn)
        v.painted(parts, f"headwall-{side}", verts, faces, paint, [STONE, STONE_LIGHT] + [STONE] * nn, smooth=False)
        # A buttress at each end, battered (wider at its foot).
        out_ = [(side * 6.3, zw - 0.3), (side * 7.0, zw - 0.6), (side * 7.0, z1 + 0.42), (side * 6.3, z1 + 0.3)]
        verts = [(x, 0.0, z) for x, z in out_] + [(x - side * (0.25 if abs(x) > 6.9 else 0.0), 7.6, z - (0.25 if z > z1 else 0.0))
                                                 for x, z in out_]
        faces = [(3, 2, 1, 0), (4, 5, 6, 7)] + s.ring_faces(0, 4, 4)
        v.painted(parts, f"buttress-{side}", verts, faces, paint, [STONE_DARK, STONE_LIGHT] + [STONE] * 4, smooth=False)
    # Voussoirs: a ring of wedges proud of the face, alternating tones, a bigger keystone.
    count = 9
    for i in range(count):
        a0 = math.pi * i / count + 0.012
        a1 = math.pi * (i + 1) / count - 0.012
        key = i == count // 2
        r0, r1 = TUBE_HALF - 0.05, 6.0
        pts = [(math.cos(a) * r0, TUBE_SPRING + math.sin(a) * r0) for a in (a0, a1)]
        pts += [(math.cos(a) * r1, TUBE_SPRING + math.sin(a) * r1) for a in (a1, a0)]
        tone = STONE_LIGHT if key or i % 2 == 0 else STONE
        slab_z(parts, f"voussoir-{i}", list(reversed(pts)), z1 - 0.05, z1 + (0.48 if key else 0.36), paint, tone, side=STONE_DARK)
    for side in (-1, 1):
        slab_z(parts, f"impost-{side}", [(side * 4.45, 3.15), (side * 6.5, 3.15), (side * 6.5, 3.65), (side * 4.45, 3.65)],
               z1 - 0.05, z1 + 0.45, paint, STONE_LIGHT, side=STONE_DARK)
    prism(parts, "coping", [(-7.0, zw - 0.25), (7.0, zw - 0.25), (7.0, z1 + 0.4), (-7.0, z1 + 0.4)], 9.5, 10.0, paint, STONE_LIGHT,
          top=STONE)
    # The snow: a deep soft cushion on the coping (overhanging the front a little) and a roll along the vault's crown.
    verts, faces = [], []
    sides = 12
    cap = [(9.9, 6.95, 1.0, 7.35), (10.75, 7.0, 1.05, 7.38), (11.45, 6.3, 0.85, 7.35), (11.85, 4.4, 0.55, 7.3)]
    for j, (y, rx, rz, cz) in enumerate(cap):
        for i in range(sides):
            a = TAU * i / sides
            ca, sa = math.cos(a), math.sin(a)
            fx = math.copysign(abs(ca) ** (2 / 3.0), ca)
            fz = math.copysign(abs(sa) ** (2 / 3.0), sa)
            sag = -0.16 * math.sin(i * 1.7 + j) if j in (1, 2) else 0.0
            verts.append((fx * rx, y + sag, cz + fz * rz))
    top = len(verts)
    verts.append((0.0, 11.98, 7.3))
    for j in range(len(cap) - 1):
        a, b = j * sides, (j + 1) * sides
        faces += [(a + i, a + (i + 1) % sides, b + (i + 1) % sides, b + i) for i in range(sides)]
    last = (len(cap) - 1) * sides
    faces += [(last + i, last + (i + 1) % sides, top) for i in range(sides)]
    faces.append(tuple(range(sides - 1, -1, -1)))
    v.painted(parts, "snow-cap", verts, faces, paint, lambda c, nm: SNOW if nm.y > 0.5 else (SNOW_SOFT if nm.y > -0.3 else SNOW_SHADE),
              smooth=lambda c, nm: nm.y > -0.9)
    for i, (x, w, drop) in enumerate(((-3.8, 1.5, 0.5), (0.2, 2.2, 0.85), (4.3, 1.3, 0.4))):
        bobble(parts, f"drip-{i}", (x, 10.0 - drop * 0.3, z1 + 0.22), (w / 2, drop * 0.7 + 0.32, 0.2), paint(SNOW), 30 + i, rough=0.06)
    crown = []
    for i, z in enumerate((z0 + 0.3, 0.4, 3.0, 5.6, zw)):
        crown.append((0.12 * math.sin(i * 1.9), TUBE_SPRING + 5.8 - 0.05 + 0.1 * math.cos(i * 1.3), z))
    strip(parts, "crown-snow", crown, 5.6, 1.1, (0, 1, 0), paint, lambda i: SNOW)
    # Seven icicles along the arch's lip (under the voussoirs), longest in the middle.
    for i in range(7):
        a = math.pi * (i + 1) / 8
        length = 0.55 + 0.75 * math.sin(a) ** 2 + 0.25 * v.hash01(i, 2, 7)
        base = (math.cos(a) * (TUBE_HALF + 0.12), TUBE_SPRING + math.sin(a) * (TUBE_HALF + 0.12) - 0.04, z1 + 0.18)
        tip = (base[0] * 0.98, base[1] - length, base[2] + 0.02)
        ice = k.add_tapered_segment(parts, f"icicle-{i}", base, tip, 0.13, 0.0, paint(ICICLE), vertices=4, smooth=False)
        s.fix_normals(ice)
    # The floor inside (snowy, the tube's floor level) and the dark plate across the opening.
    prism(parts, "floor", [(-TUBE_HALF, z0), (TUBE_HALF, z0), (TUBE_HALF, z1 + 0.4), (-TUBE_HALF, z1 + 0.4)], 0.0, 0.04,
          paint, SNOW_SHADE)
    sheet(parts, "mouth", arch_outline(TUBE_HALF - 0.04, TUBE_SPRING, TUBE_HALF - 0.04, seg, 0.02), 4.3, paint(MOUTH),
          both=paint(SNOW_SOFT), offset=0.03)
    return parts, 600


def exit_glow():
    """トンネルの 出口の 光: the daylight at a tunnel's far end, an arch 8 x 7 like the opening, seen from both sides (its
    own material "exit-glow": the game makes it a light the fog does not hide)."""
    light = s.mat("exit-glow", EXIT_LIGHT, 0.9, 0.6)
    parts: list = []
    sheet(parts, "glow", arch_outline(4.0, 3.0, 4.0, 6), 0.0, light, both=light, offset=0.0)
    return parts, 20


def ice_hall():
    """こおりの ひろま: a great dome of pale blue ice inside the mountain, seen from inside: a closed shell (its inner
    side faceted in light and deep ice, lighter up top), a snowy floor, doorways where main's tube comes in and goes out
    (the stage's rails, the hall drawn 1.25 times), clusters of ice crystals round the foot of its wall and icicles
    hanging from its roof, all clear of every rail."""
    paint = Paint(0.6, glow=GLOW)
    prop = prop_of("ice-hall")
    hx, hy, hz = prop["position"]
    sc = prop.get("scale", 1.0)
    rx, ry, rz = 38.0, 18.0, 86.0  # the outer surface (the stand-in's size); the hall inside is `thick` smaller
    thick = 0.6
    seg, rings = 28, 9
    rng = random.Random(5)

    def shell_point(i, j, outer):
        """Ring j (0 at the foot, `rings` at the top) of the inner or outer surface."""
        th = (math.pi / 2) * (1 - j / rings)
        a = TAU * i / seg
        grow = 0.0 if outer else -thick
        wob = 1.0 if outer or j == 0 else 0.988 - 0.008 * math.sin(i * 2.3 + j * 1.7) - rng.uniform(0.0, 0.006)
        x = math.cos(a) * math.sin(th) * (rx + grow) * wob
        z = math.sin(a) * math.sin(th) * (rz + grow) * wob
        y = math.cos(th) * (ry + grow) * (wob if j < rings else 1.0)
        return (x, y, z)

    verts, faces = [], []
    for j in range(rings):
        verts += [shell_point(i, j, True) for i in range(seg)]
    outer_top = len(verts)
    verts.append((0.0, ry, 0.0))
    inner0 = len(verts)
    for j in range(rings):
        verts += [shell_point(i, j, False) for i in range(seg)]
    inner_top = len(verts)
    verts.append((0.0, (ry - thick) * 0.99, 0.0))
    for j in range(rings - 1):
        a, b = j * seg, (j + 1) * seg
        faces += [(a + i, a + (i + 1) % seg, b + (i + 1) % seg, b + i) for i in range(seg)]
        a, b = inner0 + j * seg, inner0 + (j + 1) * seg
        faces += [(a + i, b + i, b + (i + 1) % seg, a + (i + 1) % seg) for i in range(seg)]
    last = (rings - 1) * seg
    faces += [(last + i, last + (i + 1) % seg, outer_top) for i in range(seg)]
    last = inner0 + (rings - 1) * seg
    faces += [(last + i, inner_top, last + (i + 1) % seg) for i in range(seg)]
    faces += [(i, inner0 + i, inner0 + (i + 1) % seg, (i + 1) % seg) for i in range(seg)]

    def dome_colour(c, nm):
        rad = math.sqrt((c.x / rx) ** 2 + (c.y / ry) ** 2 + (c.z / rz) ** 2)
        if rad > 0.996 or c.y < 0.05:
            return ICE_DEEP
        t = c.y / ry
        pick = v.hash01(round(c.x * 0.4), round(c.y * 0.6), round(c.z * 0.4))
        if t > 0.72:
            return ICE_LIGHT if pick > 0.4 else ICE
        if t > 0.4:
            return ICE if pick > 0.45 else ICE_MID
        return ICE_MID if pick > 0.5 else ICE_DEEP

    parts: list = []
    dome = v.painted(parts, "dome", verts, faces, paint, dome_colour, smooth=False)
    # Doorways for main's tube (the tube's opening, a little inside it), cut through the shell where it comes in.
    lines = {rid: [((x - hx) / sc, (y - hy) / sc, (z - hz) / sc) for x, y, z in rail_points(rid, 2.0)] for rid in ("main", "nise")}
    tunnel = next(g for g in stage_json()["gimmicks"] if g["type"] == "tunnel" and g["railId"] == "main")
    hall = tunnel["params"]["hall"]
    for at0, at1 in ((hall["from"] - 30.0, hall["from"] + 3.0), (hall["to"] - 3.0, hall["to"] + 30.0)):
        (pa, _), (pb, _) = rail_at("main", at0), rail_at("main", at1)
        a_ = Vector(((pa[0] - hx) / sc, (pa[1] - hy) / sc, (pa[2] - hz) / sc))
        b_ = Vector(((pb[0] - hx) / sc, (pb[1] - hy) / sc, (pb[2] - hz) / sc))
        along = (b_ - a_).normalized()
        across = Vector((along.z, 0.0, -along.x)).normalized()
        opening = arch_outline((TUBE_HALF - 0.15) / sc, (TUBE_SPRING - 0.1) / sc, (TUBE_HALF - 0.15) / sc, 10,
                               -0.6 / sc)
        cut_verts = []
        for end in (a_, b_):
            floor = end + Vector((0.0, -0.8 / sc, 0.0))
            cut_verts += [tuple(floor + across * x + Vector((0.0, y, 0.0))) for x, y in opening]
        nn = len(opening)
        cut_faces = [tuple(range(nn - 1, -1, -1)), tuple(range(nn, 2 * nn))] + s.ring_faces(0, nn, nn)
        cutters: list = []
        cutter = k.add_mesh(cutters, "door-cutter", cut_verts, cut_faces, [paint(ICE)])
        s.fix_normals(cutter)
        k.active(dome)
        mod = dome.modifiers.new(name="door", type="BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.solver = "EXACT"
        mod.material_mode = "TRANSFER"
        mod.object = cutter
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter, do_unlink=True)
    for poly in dome.data.polygons:
        poly.use_smooth = False
    s.fix_normals(dome)
    # The snowy floor: a thin closed slab inside the foot of the wall.
    floor_pts = [(math.cos(TAU * i / seg) * (rx - 0.4), math.sin(TAU * i / seg) * (rz - 0.4)) for i in range(seg)]
    prism(parts, "floor", floor_pts, 0.0, 0.05, paint, SNOW_SOFT, top=SNOW_SOFT, bottom=SNOW_DEEP)

    def clear(x, z, d):
        return all((px - x) ** 2 + (pz - z) ** 2 >= d * d for line in lines.values() for px, _, pz in line)

    # How high the (lowest possible) inner roof stands over the loop and over main in the hall (world m).
    inner = (rx - thick, ry - thick, rz - thick)
    over = {}
    for rid, line in lines.items():
        least = math.inf
        for x, y, z in line:
            q = 1 - (x / inner[0]) ** 2 - (z / inner[2]) ** 2
            if q <= 0:
                continue
            roof = inner[1] * 0.974 * math.sqrt(q)
            if rid == "main" and roof - y < 9.0 / sc:
                continue  # the tube's stretch
            least = min(least, (roof - y) * sc)
        over[rid] = round(least, 1)
    print("HALL_CLEARANCE=" + json.dumps(over))

    # Crystal clusters round the foot of the wall (inside it, pointing in and up), clear of the rails by 6 m.
    tones = [paint(ICE_LIGHT), paint(ICE), paint(ICICLE)]
    placed = 0
    for i in range(80):
        if placed >= 12:
            break
        a = TAU * (i * 0.618 % 1.0)
        f = 0.9 - 0.06 * v.hash01(i, 1, 3)
        x, z = math.cos(a) * rx * f, math.sin(a) * rz * f
        if not clear(x, z, 6.0 / sc + 2.5):
            continue
        inward = Vector((-math.cos(a) / rx, 0.0, -math.sin(a) / rz)).normalized()
        for c in range(3):
            lean = inward * (0.35 + 0.25 * c) + Vector((0.0, 1.0, 0.0))
            off = Vector((math.cos(a + c * 2.1), 0.0, math.sin(a + c * 2.1))) * 0.9
            length = (4.2 - 1.1 * c) * (0.8 + 0.4 * v.hash01(i, c, 5))
            crystal = s.crystal(parts, f"crystal-{i}-{c}", (x + off.x, -0.3, z + off.z), tuple(lean), length, 0.55 - 0.1 * c, 0.4 * c + i,
                                tones)
            v.cut_below(crystal, 0.0)
        placed += 1
    # Icicles from the roof where it is high (well over every train).
    for i in range(14):
        a = TAU * (i * 0.381 % 1.0)
        f = 0.25 + 0.4 * v.hash01(i, 4, 4)
        x, z = math.cos(a) * rx * f, math.sin(a) * rz * f
        top = (ry - thick) * 0.974 * math.sqrt(max(0.0, 1 - (x / rx) ** 2 - (z / rz) ** 2))
        if top < 13.0:
            continue
        for c in range(2):
            length = 1.6 + 1.4 * v.hash01(i, c, 8)
            base = (x + c * 0.8, top + 0.3, z + c * 0.5)
            ice = k.add_tapered_segment(parts, f"roof-icicle-{i}-{c}", base, (base[0], top - length, base[2]), 0.38 - c * 0.08, 0.0,
                                        paint(ICICLE), vertices=5, smooth=False)
            s.fix_normals(ice)
    return parts, 3000


def ice_pillar():
    """ひろまの 柱: a column of clear blue ice, floor to roof, a little narrower in the middle, flaring at foot and top
    like an icicle meeting a stalagmite; its faces in light and deep tones, a few shards at its foot."""
    paint = Paint(0.4, glow=GLOW)
    parts: list = []
    sides = 6
    profile = [(0.0, 1.48), (0.9, 1.32), (3.2, 1.08), (7.0, 0.92), (11.0, 0.95), (14.6, 1.08), (17.0, 1.3), (18.0, 1.48)]
    verts = []
    for j, (y, rad) in enumerate(profile):
        for i in range(sides):
            a = TAU * i / sides + j * 0.22
            verts.append((math.cos(a) * rad, y, math.sin(a) * rad))
    faces = [tuple(range(sides - 1, -1, -1))]
    cols = [ICE_DEEP]
    for j in range(len(profile) - 1):
        a, b = j * sides, (j + 1) * sides
        faces += [(a + i, a + (i + 1) % sides, b + (i + 1) % sides, b + i) for i in range(sides)]
        cols += [(ICE_LIGHT if (i + j) % 3 == 0 else (ICE if (i + j) % 3 == 1 else ICE_MID)) for i in range(sides)]
    last = (len(profile) - 1) * sides
    faces.append(tuple(range(last, last + sides)))
    cols.append(ICE)
    v.painted(parts, "pillar", verts, faces, paint, cols, smooth=False)
    tones = [paint(ICE_LIGHT), paint(ICE), paint(ICICLE)]
    for i, (a, lean, length) in enumerate(((0.4, 0.5, 1.5), (2.5, 0.7, 1.1))):
        base = (math.cos(a) * 1.15, -0.1, math.sin(a) * 1.15)
        s.crystal(parts, f"shard-{i}", base, (math.cos(a) * lean, 1.0, math.sin(a) * lean), length, 0.3, a, tones)
    return parts, 150


def fake_exit():
    """にせの でぐちの え (Sakasa painted it on the ice wall): a slab of ice with a white round-topped way out painted on
    it (material "fake-exit-light": the game lights it like the real exit), blue-grey snowy hills and pine shadows in it,
    snow on the slab's top, and in the middle Sakasa's swirl (material "fake-exit-swirl": hardly seen until the light
    shows it, then it glows pink). The picture faces +Z."""
    paint = Paint(0.6, glow=GLOW)
    light = s.mat("fake-exit-light", EXIT_LIGHT, 0.9, 0.6)
    swirl = s.mat("fake-exit-swirl", SWIRL, 0.6, 0.2)
    parts: list = []
    # The slab of ice: its face a little bevelled, rougher at the edges.
    w, h = 5.0, 7.75
    rim = [(w, 0.0), (w, h - 0.7), (w - 0.6, h), (-w + 0.5, h), (-w, h - 0.6), (-w, 0.0)]
    slab_z(parts, "slab", rim, -0.5, 0.42, paint, ICE_MID, front=ICE, side=ICE_DEEP)
    bevel = [(w - 0.35, 0.0), (w - 0.35, h - 0.8), (w - 0.8, h - 0.35), (-w + 0.75, h - 0.35), (-w + 0.35, h - 0.75), (-w + 0.35, 0.0)]
    slab_z(parts, "face", bevel, 0.4, 0.5, paint, ICE_LIGHT, front=ICE_LIGHT, side=ICE)
    # Snow along the top.
    prism(parts, "snow-top", [(-w + 0.2, -0.6), (w - 0.3, -0.6), (w - 0.5, 0.62), (-w + 0.4, 0.62)], h - 0.1, h + 0.2, paint,
          SNOW, top=SNOW)
    bobble(parts, "snow-lump", (-2.6, h + 0.02, 0.1), (1.2, 0.2, 0.5), paint(SNOW), 12, rough=0.05)
    # The painted way out (the light), its hills and pine shadows, then the swirl.
    opening = arch_outline(3.2, 1.6, 4.4, 10, 0.0)
    sheet(parts, "way-out", opening, 0.52, light)
    hills = [(-3.2, 0.0), (3.2, 0.0), (3.2, 1.0), (2.2, 1.55), (1.0, 1.25), (-0.4, 1.7), (-1.8, 1.3), (-3.2, 1.6)]
    sheet(parts, "hills", hills, 0.545, paint(HILL_SHADOW))
    for i, (x, size) in enumerate(((-2.5, 0.95), (2.35, 1.2), (2.95, 0.75))):
        tri = []
        for tier in range(3):
            base_y = 1.2 + size * (0.15 + tier * 0.55)
            half = size * (0.62 - tier * 0.15)
            tri.append(((x - half, base_y), (x + half, base_y), (x, base_y + size * 0.85)))
        for tier, one in enumerate(tri):
            v.flat_tris(parts, f"pine-{i}-{tier}", [one], 0.556 + 0.005 * tier, paint(PINE_SHADOW))
    pts = []
    turns, steps = 2.2, 40
    for i in range(steps + 1):
        a = i / steps * turns * TAU
        rr = 0.12 + i / steps * 1.45
        pts.append((math.cos(a) * rr, 3.4 + math.sin(a) * rr, 0.6))
    k.ribbon_decal(parts, "swirl", pts, 0.26, swirl, taper=False)
    return parts, 300


# ---------------------------------------------------------------- the way down

def snow_fence():
    """ゆきよけの さく: where the snow wave runs into it and stops. A wooden gate over the track (posts 6.3 m apart, a
    beam 5 m over the rail with a little roof of snow on it) and a fence 30 m each side along X: posts with snowy tops,
    two rails, a long soft roll of snow along the top rail."""
    paint = snow_paint(0.85)
    parts: list = []
    wood, dark = paint(FENCE), paint(FENCE_DARK)
    for side in (-1, 1):
        k.add_box(parts, f"gate-post-{side}", (0.55, 5.0, 0.55), (side * 3.45, 2.5, 0.0), wood)
        bobble(parts, f"gate-post-snow-{side}", (side * 3.45, 5.55, 0.0), (0.42, 0.18, 0.4), paint(SNOW), 50 + side, rough=0.08)
        # Posts every 3.75 m (each with a little cap of snow), two rails along them.
        for p in range(9):
            x = side * (5.0 + p * 3.75)
            k.add_box(parts, f"post-{side}-{p}", (0.28, 2.45, 0.28), (x, 1.225, 0.0), wood if p % 2 else dark)
        for y in (0.95, 2.05):
            k.add_box(parts, f"rail-{side}-{y}", (30.2, 0.3, 0.14), (side * 20.0, y, 0.18), dark if y < 1 else wood)
        roll = []
        for i in range(9):
            x = side * (4.85 + 30.3 * i / 8)
            roll.append((x, 2.36 + 0.06 * math.sin(i * 2.1), 0.08 + 0.05 * math.cos(i * 1.3)))
        strip(parts, f"snow-roll-{side}", roll, 0.56, 0.4, (0, 1, 0), paint, lambda i: SNOW)
    k.add_box(parts, "beam", (7.6, 0.45, 0.6), (0.0, 5.22, 0.0), wood)
    # The snow on the beam, a soft roof with a drip each end.
    roll = [(-3.9, 5.58, 0.0), (-2.0, 5.66, 0.02), (0.0, 5.7, 0.0), (2.0, 5.66, -0.02), (3.9, 5.58, 0.0)]
    strip(parts, "beam-snow", roll, 0.72, 0.28, (0, 1, 0), paint, lambda i: SNOW)
    for side in (-1, 1):
        k.add_box(parts, f"brace-{side}", (0.22, 1.3, 0.22), (side * 2.85, 4.62, 0.0), dark).rotation_euler = (0.0, -side * 0.7, 0.0)
    return parts, 600


def lodge():
    """やまごや: a log cabin, 12 x 8 m of round logs whose ends cross at the corners, a steep gable roof under a deep
    soft roll of snow overhanging its eaves with icicles, a stone chimney capped with snow, two warm yellow windows with
    frames and crossbars either side of a plank door with a little snowy step and a lantern, a window in each end wall."""
    paint = Paint(0.8, glow=GLOW)
    parts: list = []
    logs, log_r = 8, 0.3
    wall_h = logs * 2 * log_r * 0.92

    def wall(name, length, at, along_x, phase):
        """A wall of round logs (a loft of bumps) along X (or Z) through `at`, its log ends sticking out past the
        corners; `phase` lifts it half a log (the walls' logs interleave at the corners)."""
        prof = [(0.0, phase)]
        for i in range(logs):
            y0 = phase + i * 2 * log_r * 0.92
            prof += [(log_r * 0.72, y0 + log_r * 0.92), (0.0, y0 + 2 * log_r * 0.92)]
        top = prof[-1][1]
        outline = prof + [(-log_r * 0.6, top), (-log_r * 0.6, phase)]
        sections = []
        for x in (-length / 2, length / 2):
            if along_x:
                sections.append([(x, y, at + (o if at > 0 else -o)) for o, y in outline])
            else:
                sections.append([(at + (o if at > 0 else -o), y, x) for o, y in outline])
        nn = len(outline)
        verts = [p for sec in sections for p in sec]
        faces = [tuple(range(nn - 1, -1, -1)), tuple(range(nn, 2 * nn))] + s.ring_faces(0, nn, nn)
        cols = [LOG_END, LOG_END] + [(LOG_LIGHT if i % 2 else LOG) if i < len(prof) - 1 else LOG_DARK for i in range(nn)]
        return v.painted(parts, name, verts, faces, paint, cols, smooth=lambda c, nm: abs(nm.y) < 0.95)

    wall("front", 13.2, 4.0, True, 0.0)
    wall("back", 13.2, -4.0, True, 0.0)
    wall("left", 9.2, 6.0, False, log_r * 0.92)
    wall("right", 9.2, -6.0, False, log_r * 0.92)
    # Gable ends (vertical boards) up to the ridge.
    ridge_y, eave_y = 8.9, wall_h + 0.1
    for side in (-1, 1):
        x = side * 5.95
        tri = [(x, eave_y - 0.2, -4.2), (x, eave_y - 0.2, 4.2), (x, ridge_y - 0.3, 0.0)]
        verts = tri + [(x - side * 0.5, p[1], p[2]) for p in tri]
        faces = [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
        v.painted(parts, f"gable-{side}", verts, faces, paint, [PLANK, PLANK, PLANK, PLANK, PLANK])
    # The roof boards (dark eaves seen under the snow) and the snow on them.
    over_x, eave_z = 6.75, 4.6
    for side in (-1, 1):
        verts = []
        for x in (-over_x, over_x):
            verts += [(x, ridge_y, 0.0), (x, eave_y - 0.15, side * eave_z), (x, eave_y - 0.45, side * eave_z), (x, ridge_y - 0.32, 0.0)]
        faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        v.painted(parts, f"roof-{side}", verts, faces, paint, ROOF_WOOD)
    prof = [(-eave_z - 0.25, eave_y - 0.2), (-eave_z - 0.42, eave_y + 0.18), (-eave_z - 0.2, eave_y + 0.55),
            (-2.4, (ridge_y + eave_y) / 2 + 0.95), (0.0, ridge_y + 0.95), (2.4, (ridge_y + eave_y) / 2 + 0.95),
            (eave_z + 0.2, eave_y + 0.55), (eave_z + 0.42, eave_y + 0.18), (eave_z + 0.25, eave_y - 0.2),
            (eave_z * 0.5, (ridge_y + eave_y) / 2 + 0.05), (0.0, ridge_y + 0.02), (-eave_z * 0.5, (ridge_y + eave_y) / 2 + 0.05)]
    sections = []
    for i, x in enumerate((-over_x - 0.25, -3.5, 0.0, 3.5, over_x + 0.25)):
        sag = 0.12 * math.sin(i * 2.2) if 0 < i < 4 else -0.1
        sections.append([(x, y + (sag if j < 9 else 0.0), z) for j, (z, y) in enumerate(prof)])
    nn = len(prof)
    verts = [p for sec in sections for p in sec]
    faces = [tuple(range(nn - 1, -1, -1))]
    for i in range(len(sections) - 1):
        faces += s.ring_faces(i * nn, (i + 1) * nn, nn)
    faces.append(tuple(range((len(sections) - 1) * nn, len(sections) * nn)))
    v.painted(parts, "roof-snow", verts, faces, paint, lambda c, nm: SNOW if nm.y > 0.3 else (SNOW_SOFT if nm.y > -0.4 else SNOW_SHADE),
              smooth=lambda c, nm: True)
    # Icicles under the front and back eaves.
    for side in (-1, 1):
        for i, x in enumerate((-5.4, -2.3, 1.2, 4.8)):
            length = 0.45 + 0.45 * v.hash01(i, side, 3)
            base = (x, eave_y - 0.15, side * (eave_z + 0.1))
            ice = k.add_tapered_segment(parts, f"icicle-{side}-{i}", base, (x, base[1] - length, base[2]), 0.09, 0.0,
                                        paint(ICICLE), vertices=4, smooth=False)
            s.fix_normals(ice)
    # The chimney (stone, a darker top) through the back of the roof, snow on its cap.
    k.add_box(parts, "chimney", (1.2, 4.0, 1.2), (3.6, 7.75, -1.6), paint(STONE))
    k.add_box(parts, "chimney-top", (1.4, 0.3, 1.4), (3.6, 9.7, -1.6), paint(STONE_DARK))
    bobble(parts, "chimney-snow", (3.6, 9.86, -1.6), (0.66, 0.14, 0.66), paint(SNOW), 41, rough=0.04)
    # Windows: warm glass in a light frame with a crossbar; two in front, one in each end wall.
    glass, frame = paint(WINDOW), paint(WINDOW_FRAME)
    for name, center, normal in (("window-l", (-3.3, 2.5, 4.0), (0, 0, 1)), ("window-r", (3.3, 2.5, 4.0), (0, 0, 1)),
                                 ("window-e", (6.0, 2.5, 0.0), (1, 0, 0)), ("window-w", (-6.0, 2.5, 0.0), (-1, 0, 0))):
        nrm = Vector(normal)
        across = Vector((0, 1, 0)).cross(nrm).normalized()
        c = Vector(center) + nrm * 0.18
        s.plate(parts, f"{name}-frame", tuple(c), tuple(across), (0, 1, 0), [(-0.95, -0.8), (0.95, -0.8), (0.95, 0.8), (-0.95, 0.8)],
                0.18, [frame])
        s.plate(parts, f"{name}-glass", tuple(c + nrm * 0.07), tuple(across), (0, 1, 0), [(-0.75, -0.6), (0.75, -0.6), (0.75, 0.6), (-0.75, 0.6)],
                0.08, [glass])
        s.plate(parts, f"{name}-bar", tuple(c + nrm * 0.13), tuple(across), (0, 1, 0), [(-0.75, -0.06), (0.75, -0.06), (0.75, 0.06), (-0.75, 0.06)],
                0.05, [frame])
        s.plate(parts, f"{name}-bar2", tuple(c + nrm * 0.13), tuple(across), (0, 1, 0), [(-0.06, -0.6), (0.06, -0.6), (0.06, 0.6), (-0.06, 0.6)],
                0.05, [frame])
    # The door (planks in a frame), its step of snow and a little lantern.
    s.plate(parts, "door-frame", (0.0, 1.3, 4.2), (1, 0, 0), (0, 1, 0), [(-0.95, -1.3), (0.95, -1.3), (0.95, 1.3), (-0.95, 1.3)], 0.2,
            [paint(DOOR_DARK)])
    s.plate(parts, "door", (0.0, 1.22, 4.32), (1, 0, 0), (0, 1, 0), [(-0.72, -1.22), (0.72, -1.22), (0.72, 1.18), (-0.72, 1.18)], 0.08,
            [paint(DOOR)])
    k.add_box(parts, "step", (2.4, 0.3, 0.9), (0.0, 0.15, 4.75), paint(SNOW_SOFT))
    k.add_box(parts, "lantern", (0.26, 0.36, 0.26), (1.25, 2.55, 4.42), paint(LANTERN))
    k.add_box(parts, "lantern-cap", (0.34, 0.08, 0.34), (1.25, 2.77, 4.42), paint(STONE_DARK))
    return parts, 800


# ---------------------------------------------------------------- records

def snow_hare():
    """記録①「ゆきうさぎ」: a white hare curled up in the snow, round as a snowball, its ears laid back along its back
    with light brown tips, a round tail, little front paws; two round dark eyes, nothing else on its face."""
    paint = Paint(0.75, glow=GLOW)
    vols = [((0.5, 0.38, 0.6), (0.0, 0.19, -0.06)), ((0.32, 0.3, 0.3), (0.0, 0.3, 0.2)),
            ((0.1, 0.1, 0.42), (0.075, 0.44, -0.05)), ((0.1, 0.1, 0.42), (-0.075, 0.44, -0.05)),
            ((0.15, 0.15, 0.15), (0.0, 0.22, -0.37)), ((0.1, 0.1, 0.16), (0.08, 0.07, 0.2)),
            ((0.1, 0.1, 0.16), (-0.08, 0.07, 0.2))]
    tip = lambda c, n: HARE_EAR if c.z < -0.18 and c.y > 0.41 else HARE  # noqa: E731
    colours = [lambda c, n: HARE_SHADE if n.y < -0.3 else HARE, HARE, tip, tip, HARE, HARE_SHADE, HARE_SHADE]
    skin = r.painted_clay(paint, vols, colours, "snow-hare", 250, 0.016)
    parts: list = [skin]
    tree = k.world_tree(skin)
    for side in (-1, 1):
        v.eye(parts, paint, tree, (side * 0.04, 0.33, 0.21), v.look(side * math.radians(48), math.radians(10)), (0.055, 0.065),
              f"eye-{side}", skin)
    return parts, 300


def ice_flower():
    """記録②「いけの こおりばな」: a flower of ice from the bottom of the pond: six clear blue petals cupped open round
    six small upright inner ones, a white crystal heart, on a round little pad of ice."""
    paint = Paint(0.35, glow=GLOW)
    parts: list = []
    lathe_at(parts, "pad", [(0.0, 0.34, ICE_MID), (0.06, 0.36, ICE), (0.1, 0.26, ICE_LIGHT), (0.11, 0.0, ICE_LIGHT)], (0.0, 0.0), 10,
             paint, smooth=False)

    def petal(name, a, length, width, lift, colour_top, colour_side, root=0.08):
        """A pointed petal of ice (a flat bipyramid) from the middle out at angle `a`, rising by `lift` (radians)."""
        out = Vector((math.cos(a), 0.0, math.sin(a)))
        up = Vector((0.0, 1.0, 0.0))
        dirv = (out * math.cos(lift) + up * math.sin(lift)).normalized()
        side = out.cross(up).normalized()
        normal = side.cross(dirv).normalized()
        base = Vector((0.0, 0.14, 0.0)) + out * root
        mid = base + dirv * (length * 0.45)
        tipv = base + dirv * length
        verts = [tuple(base), tuple(mid + side * width / 2), tuple(tipv), tuple(mid - side * width / 2),
                 tuple(mid + normal * width * 0.18), tuple(mid - normal * width * 0.14)]
        faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (1, 0, 5), (2, 1, 5), (3, 2, 5), (0, 3, 5)]
        cols = [colour_top] * 4 + [colour_side] * 4
        return v.painted(parts, name, verts, faces, paint, cols, smooth=False)

    for i in range(6):
        a = TAU * i / 6
        petal(f"petal-{i}", a, 0.62, 0.38, math.radians(30), ICE_LIGHT if i % 2 else ICE, ICE_MID)
        petal(f"inner-{i}", a + TAU / 12, 0.48, 0.24, math.radians(62), ICE if i % 2 else ICE_LIGHT, ICE_MID, root=0.04)
    s.crystal(parts, "heart", (0.0, 0.14, 0.0), (0.0, 1.0, 0.0), 0.6, 0.09, 0.3, [paint(ICE_LIGHT), paint(SNOW), paint(SNOW)])
    for i in range(3):
        a = TAU * i / 3 + 0.5
        s.crystal(parts, f"stamen-{i}", (math.cos(a) * 0.07, 0.16, math.sin(a) * 0.07), (math.cos(a) * 0.5, 1.0, math.sin(a) * 0.5),
                  0.36, 0.045, a, [paint(ICE_LIGHT), paint(SNOW), paint(SNOW)])
    return parts, 300


def sleigh_bell():
    """記録③「ゆきに うまった すず」: three round golden bells in a little bunch (lighter on top, a darker band round the
    middle) on short red cords tied in a bow above them. No holes, no slits (nothing that could read as a face)."""
    paint = Paint(0.35, glow=GLOW)
    parts: list = []
    knot = (0.0, 0.36, 0.0)
    for i, (x, z, rad) in enumerate(((-0.12, 0.06, 0.125), (0.12, 0.06, 0.125), (0.0, -0.12, 0.13))):
        cy = rad
        ball(parts, f"bell-{i}", (x, cy, z), rad, paint, lambda y, c=cy: GOLD_LIGHT if y > c + 0.03 else (GOLD_DARK if y > c - 0.04 else GOLD),
             segments=8, rings=4, phase=0.4 * i)
        top = (x * 0.9, cy + rad - 0.015, z * 0.9)
        strip(parts, f"cord-{i}", [top, knot], 0.03, 0.022, (0, 0, 1) if abs(z) < 0.1 else (1, 0, 0), paint, lambda j: CORD)
    # The bow: two round loops out to the sides and two short tails.
    for side in (-1, 1):
        loop = [(-side * 0.015, 0.36, 0.0), (side * 0.1, 0.445, 0.01), (side * 0.2, 0.41, 0.01), (side * 0.14, 0.32, 0.0),
                (side * 0.0, 0.35, 0.0)]
        strip(parts, f"bow-{side}", loop, 0.06, 0.022, (0, 0, 1), paint, lambda j: CORD)
        strip(parts, f"tail-{side}", [(0.0, 0.35, 0.012), (side * 0.06, 0.27, 0.03)], 0.045, 0.018, (0, 0, 1), paint, lambda j: CORD_DARK)
    bobble(parts, "knot", knot, (0.035, 0.03, 0.03), paint(CORD_DARK), 3, sub=1, rough=0.0)
    return parts, 300


# ---------------------------------------------------------------- export and preview

def export_glb(model, name, budget, max_kb=250):
    """The GLB without texture coordinates (nothing here has a texture)."""
    tris, lo, hi = k.model_metrics(model)
    if tris > budget:
        raise RuntimeError(f"{name}: {tris} triangles exceeds budget {budget}")
    if abs(lo[1]) > 0.012:
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


def preview(model, name, direction, size, exposure=-0.55):
    """volcano.preview (a three-quarter view in a pale sky, the camera fitted to the model), darker by `exposure` stops
    with the sky raised to match: the snow lights itself a little, which would burn out white in Blender's light."""
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
    scene.view_settings.exposure = exposure
    world = bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    tree = world.node_tree
    seen = tree.nodes["Background"]
    seen.inputs["Color"].default_value = (0.50, 0.70, 0.90, 1)
    seen.inputs["Strength"].default_value = 2.0 ** -exposure
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
    for vert in model.data.vertices:
        coords.extend(model.matrix_world @ vert.co)
    location, _ = camera.camera_fit_coords(bpy.context.evaluated_depsgraph_get(), coords)
    center = Vector(k.to_blender([(hi[i] + lo[i]) / 2 for i in range(3)]))
    camera.location = location + view * (Vector(location) - center).length * 0.12
    bpy.ops.render.render(write_still=True)


def soft_snow(model):
    """The snow wave in one vertex-coloured material: light blue at its foot fading to white by 60 % of its height
    (smooth, no bands), lighting itself a little as the flat snow colours do."""
    _, lo, hi = k.model_metrics(model)
    height = hi[1] - lo[1]
    paint = md.paint_material("snow wave", 0.9)
    bsdf = paint.node_tree.nodes["Principled BSDF"]
    glow = GLOW[SNOW]
    bsdf.inputs["Emission Color"].default_value = (glow, glow, glow, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 1.0

    def shade(_name, p):
        t = max(0.0, min(1.0, (p.y - lo[1]) / (0.6 * height)))
        t = t * t * (3 - 2 * t)
        return hexmix(SNOW_DEEP, SNOW, t) if t < 0.35 else hexmix(SNOW_SHADE, SNOW, t)
    md.bake_colours(model, paint, shade=shade)


def scaled(build, factor, name):
    def make():
        parts, budget = build()
        for obj in parts:
            k.active(obj)
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            obj.scale = (factor, factor, factor)
            obj.location = (0, 0, 0)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        return parts, budget
    return make


BUILDERS = {"snow-wave": snow_wave, "snow-wave-small": lambda: snow_wave(0.5, "snow-wave-small"), "snowman": snowman,
            "snowman-big": scaled(snowman, 2.2, "snowman-big"), "snowman-upside": snowman_upside, "snow-pile": snow_pile,
            "snow-ridge": snow_ridge, "snow-knoll": snow_knoll, "tunnel-portal": tunnel_portal, "ice-hall": ice_hall,
            "ice-pillar": ice_pillar, "fake-exit": fake_exit, "exit-glow": exit_glow, "snow-fence": snow_fence, "lodge": lodge,
            "snow-hare": snow_hare, "ice-flower": ice_flower, "sleigh-bell": sleigh_bell}
# Origins: the bottom centre, the bounding box centred over it, but for those modelled where the game needs them (the
# portal reaches 2.4 m into the mouth and 8.4 m out of it; the snowmen stand on their own axis; the ridge, the knoll,
# the hall and the fence are modelled about their middle).
KEEP_XZ = {"tunnel-portal", "snowman", "snowman-big", "snowman-upside", "snow-ridge", "snow-knoll", "ice-hall", "fake-exit",
           "exit-glow", "snow-fence", "lodge"}
# Exact sizes (w, h, d) the round hand-made shapes are trimmed to (the stand-ins' or the ticket's).
EXACT = {"ice-pillar": (3.0, 18.0, 3.0), "snow-hare": (0.6, 0.55, 0.8), "snow-wave": (36.0, 9.0, 16.0),
         "snow-wave-small": (18.0, 4.5, 8.0)}
# Scaled evenly to this width (the flower and the bells keep their shape).
WIDTH = {"ice-flower": 1.2, "sleigh-bell": 0.5}
VIEWS = {"snow-ridge": (0.45, -0.8, 0.35), "snow-knoll": (0.5, -0.7, 0.55), "tunnel-portal": (0.5, -0.75, 0.3),
         "ice-hall": (0.55, -0.72, 0.5), "fake-exit": (0.3, -0.9, 0.15), "exit-glow": (0.3, -0.9, 0.15),
         "snow-fence": (0.3, -0.9, 0.3), "snow-wave": (0.6, -0.65, 0.35), "snow-wave-small": (0.6, -0.65, 0.35),
         "snow-hare": (0.55, -0.7, 0.4), "ice-flower": (0.45, -0.6, 0.65), "lodge": (0.6, -0.7, 0.4)}
TALL = {"ice-pillar", "snowman", "snowman-big", "snowman-upside", "sleigh-bell"}

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
        if name in WIDTH:
            _, lo, hi = k.model_metrics(model)
            f = WIDTH[name] / max(hi[0] - lo[0], hi[2] - lo[2])
            v.scale_to(model, tuple((hi[i] - lo[i]) * f for i in range(3)))
        if name not in KEEP_XZ:
            r.centre_xz(model)
        r.floor_to_zero(model)
        if name in ("snow-wave", "snow-wave-small"):
            soft_snow(model)
        export_glb(model, name, budget)
        preview(model, name, VIEWS.get(name, (0.55, -0.72, 0.42)), (400, 512) if name in TALL else (512, 400))
