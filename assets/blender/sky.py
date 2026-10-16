"""Stage 1-3 (くものうえ) — Claude Code. Ticket 0006 (and 1-3's record of ticket 0021).

The crafted look (つくりこみ), chosen for every model on 2026-10-15 (docs/ASSET_PIPELINE.md §1).
island-a, island-b, island-c (floating islands), island-flip (the slab the rail wraps round) and island-flip-cap (its
rounded end), cloud-a, cloud-b, cloud-bounce, sky-buoy; the gimmicks jump-pad and updraft-ring; the records
cloud-crystal, weathervane and upside-flower. Same names, sizes, origins and orientation as the code stand-ins they
replace, so the stage JSON does not change:
- Islands: origin at the top centre, the grass top at y = 0, the rock below (y < 0).
  island-a 24 x 12 x 24, island-b 40 x 16 x 28, island-c 12 x 8 x 12 (w x h x d, h measured down from the top).
  island-flip 30.4 x 18.8 x 40: grass on top (y = 0) and underneath (y = -18.8), rock sides; the ends at z = +-20 are
  cut flat with one cross-section, so slabs line up end to end and the cap closes the last one.
  island-flip-cap: the half-round end (grass radius 9.4 about y = -9.4, z = 0), out toward +Z; origin at the top of
  the end it closes.
- upside-flower: origin at the root of its stem (the top), the flower hanging below it (it grows down from the
  underside of the upside-down island-c behind さかさのえき).
- Everything else: origin at the bottom centre. +Z is forward (the rail's direction for the buoy, the jump pad and the
  updraft ring; the side facing the rail for the records).
Wherever 1-3 runs a rail across an island top, the top stays flat and clear: island-b's whole top is crossed by some
copy, so its charm is all on the rim (grass lip with drips, moss ledge, strata, roots, floating pebbles); island-a and
island-c carry tufts and flowers only in the corners no rail crosses; the slab and cap keep |x| < 10 clear (rails at
x = +-6 on top, an S-curve between them underneath). Those plants stand on the surfaces, so they reach past the sizes
above (island-a up to y = 1.3, island-c 0.75, the slab 0.9 over the top and 0.85 under the underside, the cap 0.6 out
from its curve); the surfaces themselves are exactly where the stand-ins had them.
Output: public/models/<name>.glb and assets/previews/<name>.png.
Run: python3 scripts/run-bpy.py assets/blender/sky.py [-- name ...]
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

# Palette (ticket 0006) and a few accents.
GRASS = "#8ED66B"
MOSS = "#76C257"
TUFT = "#5FB548"
ROCK = "#C9B8A8"
ROCK_DARK = "#A8978A"
ROOT = "#9A7452"
CLOUD = "#FFFFFF"
CLOUD_SHADE = "#DCE9F5"
GOLD = "#FFD166"
WHITE = "#FFFFFF"
PINK = "#F59AC6"
NAVY = "#3A3F47"
CORAL = "#E9573F"


def mat(name: str, hex_color: str, roughness: float = 0.85, glow: float = 0.0) -> bpy.types.Material:
    """Flat colour; `glow` adds that much of the colour as emission (clouds stay white on their shaded side)."""
    m = k.material(name, hex_color, roughness)
    if glow:
        bsdf = m.node_tree.nodes["Principled BSDF"]
        rgb = k.hex_linear(hex_color)
        bsdf.inputs["Emission Color"].default_value = (rgb[0] * glow, rgb[1] * glow, rgb[2] * glow, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 1.0
    return m


class Palette:
    """The island colours. `under=True`: the grass and plants of the flip slab's underside, which glow a little so
    the upside-down side (lit only by the sky's weak light from below) stays as bright and friendly as the top."""

    def __init__(self, under=False):
        glow, tag = (0.32, " under") if under else (0.0, "")
        self.grass = mat("Grass" + tag, GRASS, 0.9, glow)
        self.moss = mat("Moss", MOSS, 0.9)
        self.tuft = mat("Tuft" + tag, TUFT, 0.9, glow)
        self.rock = mat("Rock", ROCK, 0.95)
        self.rock_dark = mat("Rock dark", ROCK_DARK, 0.95)
        self.root = mat("Root", ROOT, 0.9)
        self.white = mat("Flower white" + tag, WHITE, 0.7, glow)
        self.gold = mat("Flower gold" + tag, GOLD, 0.7, glow)
        self.pink = mat("Flower pink" + tag, PINK, 0.7, glow)


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


def solid(parts, name, verts, faces, materials, indices=None, smooth_faces=None):
    """A closed part: faces wound outward afterwards. `smooth_faces[i]` picks smooth shading per face."""
    obj = k.add_mesh(parts, name, verts, faces, materials, indices)
    if smooth_faces is not None:
        for poly, smooth in zip(obj.data.polygons, smooth_faces):
            poly.use_smooth = smooth
    fix_normals(obj)
    return obj


def ring_faces(a: int, b: int, n: int):
    """Quads joining ring a (n vertices from index a) to ring b."""
    return [(a + i, a + (i + 1) % n, b + (i + 1) % n, b + i) for i in range(n)]


def rotate_to(up):
    """Quaternion turning +Y onto `up`."""
    return Vector((0, 1, 0)).rotation_difference(Vector(up).normalized())


def place(base, q, local):
    p = q @ Vector(local)
    return (base[0] + p.x, base[1] + p.y, base[2] + p.z)


def tuft(parts, name, base, height, blades, seed, m, up=(0, 1, 0), spread=0.22):
    """A clump of grass blades, each a thin closed pyramid leaning out from `base` along `up`."""
    rng = random.Random(seed)
    q = rotate_to(up)
    verts, faces = [], []
    for b in range(blades):
        a = TAU * b / blades + rng.uniform(-0.4, 0.4)
        r = spread * rng.uniform(0.3, 1.0)
        ox, oz = math.cos(a) * r, math.sin(a) * r
        w = height * 0.16
        i0 = len(verts)
        for j in range(3):
            t = a + TAU * j / 3
            verts.append(place(base, q, (ox + math.cos(t) * w, -0.06, oz + math.sin(t) * w)))
        lean = rng.uniform(0.35, 0.7)
        verts.append(place(base, q, (ox * (1 + lean * 2.2), height * rng.uniform(0.75, 1.0), oz * (1 + lean * 2.2))))
        faces += [(i0, i0 + 1, i0 + 2), (i0, i0 + 3, i0 + 1), (i0 + 1, i0 + 3, i0 + 2), (i0 + 2, i0 + 3, i0)]
    obj = k.add_mesh(parts, name, verts, faces, [m])
    fix_normals(obj)
    return obj


def bloom(parts, name, center, radius, m, up=(0, 1, 0), seed=0):
    """A flower head: a squashed five-point bipyramid (10 triangles) facing along `up`."""
    q = rotate_to(up)
    rng = random.Random(seed)
    turn = rng.uniform(0, TAU)
    verts = [place(center, q, (0, radius * 0.45, 0)), place(center, q, (0, -radius * 0.4, 0))]
    for i in range(5):
        a = turn + TAU * i / 5
        verts.append(place(center, q, (math.cos(a) * radius, 0.0, math.sin(a) * radius)))
    faces = []
    for i in range(5):
        a, b = 2 + i, 2 + (i + 1) % 5
        faces += [(0, a, b), (1, b, a)]
    obj = k.add_mesh(parts, name, verts, faces, [m])
    fix_normals(obj)
    return obj


def stalk(parts, name, base, top, width, m, q):
    """A thin three-sided spike from base to top (closed); its foot lies across `q`'s up."""
    verts = [place(base, q, (width * math.cos(a), 0.0, width * math.sin(a))) for a in (0.0, TAU / 3, 2 * TAU / 3)] + [top]
    obj = k.add_mesh(parts, name, verts, [(0, 1, 2), (0, 3, 1), (1, 3, 2), (2, 3, 0)], [m])
    fix_normals(obj)
    return obj


def flower_clump(parts, name, base, size, seed, pal, colours, up=(0, 1, 0)):
    """Tuft with a few flowers standing out of it."""
    rng = random.Random(seed)
    q = rotate_to(up)
    tuft(parts, f"{name}-tuft", base, 0.55 * size, 5, seed, pal.tuft, up=up, spread=0.3 * size)
    for i, colour in enumerate(colours):
        a = TAU * i / len(colours) + rng.uniform(-0.3, 0.3)
        r = 0.22 * size * rng.uniform(0.5, 1.0)
        h = size * rng.uniform(0.6, 0.85)
        head = place(base, q, (math.cos(a) * r, h, math.sin(a) * r))
        stalk(parts, f"{name}-stalk-{i}", place(base, q, (math.cos(a) * r * 0.4, -0.05, math.sin(a) * r * 0.4)), head, 0.035 * size, pal.tuft, q)
        bloom(parts, f"{name}-bloom-{i}", head, 0.21 * size, colour, up=up, seed=seed * 7 + i)


def pebble(parts, name, size, center, m_side, m_top, seed, top_from=0.5):
    """A faceted stone (jittered icosahedron, 20 faces); faces turned up take the top colour."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    rng = random.Random(seed)
    for v in bm.verts:
        v.co *= 1.0 + rng.uniform(-0.16, 0.16)
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
    fix_normals(obj)
    parts.append(obj)
    return obj


# ---------------------------------------------------------------- floating islands

def outline(w, d, n, seed, lobe=0.05, power=2.4):
    """Closed top outline: a rounded rectangle (superellipse) with a few soft lobes, fitted to exactly w x d."""
    rng = random.Random(seed)
    waves = [(3, lobe, rng.uniform(0, TAU)), (5, lobe * 0.6, rng.uniform(0, TAU)), (8, lobe * 0.35, rng.uniform(0, TAU))]
    raw = []
    for i in range(n):
        t = TAU * i / n
        c, s = math.cos(t), math.sin(t)
        r = (abs(c) ** power + abs(s) ** power) ** (-1.0 / power)
        r *= 1 + sum(a * math.sin(f * t + p) for f, a, p in waves)
        raw.append((c * r, s * r))
    xs, zs = [p[0] for p in raw], [p[1] for p in raw]
    cx, cz = (max(xs) + min(xs)) / 2, (max(zs) + min(zs)) / 2
    sx, sz = (max(xs) - min(xs)) / 2, (max(zs) - min(zs)) / 2
    return [((x - cx) / sx * w / 2, (z - cz) / sz * d / 2) for x, z in raw]


def outward_normals(pts):
    n = len(pts)
    out = []
    for i in range(n):
        (ax, az), (bx, bz) = pts[i - 1], pts[(i + 1) % n]
        nx, nz = bz - az, -(bx - ax)
        length = math.hypot(nx, nz) or 1.0
        nx, nz = nx / length, nz / length
        if nx * pts[i][0] + nz * pts[i][1] < 0:
            nx, nz = -nx, -nz
        out.append((nx, nz))
    return out


def drips_for(n, seed, scale, every=(2, 5)):
    """Lengths of the grass lip hanging down at each outline vertex: rounded tongues here and there."""
    rng = random.Random(seed)
    drip = [0.0] * n
    i = rng.randrange(n)
    placed = 0
    while placed < n:
        length = rng.uniform(0.5, 1.35) * scale
        for o, f in ((-1, 0.4), (0, 1.0), (1, 0.4)):
            j = (i + o) % n
            drip[j] = max(drip[j], length * f)
        step = rng.randint(*every)
        i = (i + step) % n
        placed += step
    return drip


def grass_cap(parts, name, pts, nrm, lip, lip_in, drip, pal):
    """The grass top: a flat top face, a rounded lip with drips, tucked under onto the rock."""
    n = len(pts)

    def ring(inset, y):
        return [(x - inset * nx, y[i] if isinstance(y, list) else y, z - inset * nz) for i, ((x, z), (nx, nz)) in enumerate(zip(pts, nrm))]

    rings = [
        ring(0.34, 0.0),
        ring(0.05, -0.18),
        ring(0.0, [-lip - d for d in drip]),
        [(x - lip_in * (1 - 0.3 * min(1.0, d)) * nx, -lip + 0.04 - 0.6 * d, z - lip_in * (1 - 0.3 * min(1.0, d)) * nz)
         for (x, z), (nx, nz), d in zip(pts, nrm, drip)],
    ]
    verts = [p for r in rings for p in r]
    faces = [tuple(range(n))]
    smooth = [False]
    for r in range(len(rings) - 1):
        faces += ring_faces(r * n, (r + 1) * n, n)
        smooth += [True] * n
    faces.append(tuple(range(3 * n + n - 1, 3 * n - 1, -1)))
    smooth.append(False)
    return solid(parts, name, verts, faces, [pal.grass], None, smooth)


class Rock:
    """Ring data of an island's rock, for the parts hung on it."""

    def __init__(self, base, column, h, ledges):
        self.base, self.column, self.h, self.ledges = base, column, h, ledges

    @staticmethod
    def taper(u):
        """Radius (fraction of the top) at depth fraction u: a full belly narrowing to a point."""
        return max(0.0, math.cos(min(1.0, u) * math.pi / 2)) ** 0.75

    def at(self, j, u, out=0.0):
        """Point on (or `out` m outside) the rock surface over column j at depth fraction u."""
        bx, bz = self.base[j]
        rad = math.hypot(bx, bz)
        f = self.taper(u) * (1 + self.column[j]) + out / rad
        return (bx * f, -u * self.h, bz * f)


def rock_body(parts, name, pts, nrm, h, nr, lip_in, bands, seed, pal):
    """The rock under the grass: a faceted bowl narrowing to a point at y = -h, in wavy strata of two colours. The
    first band ends in an uneven mossy ledge. Returns the ring data the roots, spurs and pebbles hang on."""
    rng = random.Random(seed)
    n = len(pts)
    base = []
    for j in range(nr):
        i = round(j * n / nr) % n
        (x, z), (nx, nz) = pts[i], nrm[i]
        base.append((x - (lip_in - 0.12) * nx, z - (lip_in - 0.12) * nz))
    column = [rng.uniform(-0.16, 0.06) for _ in range(nr)]
    rings, materials, ledges = [], [], []
    rings.append([(x, -0.42, z) for x, z in base])

    def ring(u, wobble, jitter, extra=None):
        s = Rock.taper(u)
        return [(x * (s * (1 + column[j]) + jitter[j] + (extra[j] if extra else 0)), -u * h + wobble[j],
                 z * (s * (1 + column[j]) + jitter[j] + (extra[j] if extra else 0))) for j, (x, z) in enumerate(base)]

    for u, band_mat, ledge, ledge_mat in bands:
        wobble = [rng.uniform(-0.045, 0.045) * h for _ in range(nr)]
        jitter = [rng.uniform(-0.05, 0.04) for _ in range(nr)]
        rings.append(ring(u, wobble, jitter))
        materials.append(band_mat)
        if ledge:
            out = [ledge * rng.uniform(0.4, 1.3) for _ in range(nr)]
            rings.append(ring(u, wobble, jitter, out))
            materials.append(ledge_mat)
            ledges.append(ring(u, wobble, jitter, [o * 0.5 for o in out]))
    verts = [p for r in rings for p in r]
    tip = len(verts)
    r0 = min(math.hypot(x, z) for x, z in base)
    a = rng.uniform(0, TAU)
    verts.append((math.cos(a) * r0 * 0.05, -h, math.sin(a) * r0 * 0.05))
    mats = [pal.rock, pal.rock_dark, pal.moss]
    index = {pal.rock: 0, pal.rock_dark: 1, pal.moss: 2}
    faces, idx = [tuple(range(nr))], [0]
    for r in range(len(rings) - 1):
        faces += ring_faces(r * nr, (r + 1) * nr, nr)
        idx += [index[materials[r]]] * nr
    last = (len(rings) - 1) * nr
    tip_mat = 0 if materials[-1] is pal.rock_dark else 1  # the point is one more stratum
    for j in range(nr):
        faces.append((last + j, last + (j + 1) % nr, tip))
        idx.append(tip_mat)
    solid(parts, name, verts, faces, mats, idx, [False] * len(faces))
    return Rock(base, column, h, ledges)


def spur(parts, name, rock, j, u0, u1, w, seed, pal, bands):
    """A smaller point of rock hanging off the bowl under column j (a faceted cone from depth u0, rooted inside the
    bowl, to its tip at u1 just outside it), coloured by the strata it crosses."""
    rng = random.Random(seed)
    top = rock.at(j, u0, -w * 0.2)
    tip = rock.at(j, u1, w * 0.75)
    sides = 6
    verts = []
    for t, r in ((0.0, w / 2), (0.5, w * 0.3)):
        cx, cy, cz = (top[i] + (tip[i] - top[i]) * t for i in range(3))
        for i in range(sides):
            a = TAU * i / sides + rng.uniform(-0.25, 0.25)
            rr = r * rng.uniform(0.8, 1.15)
            verts.append((cx + math.cos(a) * rr, cy + rng.uniform(-0.12, 0.12) * w, cz + math.sin(a) * rr))
    verts.append(tip)
    faces = [tuple(range(sides))] + ring_faces(0, sides, sides) + [(sides + i, sides + (i + 1) % sides, 2 * sides) for i in range(sides)]
    idx = []
    for f in faces:
        y = sum(verts[v][1] for v in f) / len(f) / rock.h
        band = next((b for b in bands if -y <= b[0]), bands[-1])
        idx.append(1 if band[1] is pal.rock_dark else 0)
    solid(parts, name, verts, faces, [pal.rock, pal.rock_dark], idx, [False] * len(faces))


def island(w, h, d, seed, n, nr, pal, *, lip_in, drip_scale, bands, roots, spurs, pebbles, ledge_tufts, decor=()):
    """A floating island w x d, h deep under its flat top (y = 0). `n` outline points for the grass, `nr` columns
    for the rock. bands: (depth fraction of the band's foot, colour, ledge out, ledge colour); roots: (column,
    length, radius); spurs: (column, from, to, width); pebbles: (column, depth, size); ledge_tufts: columns;
    decor: (x, z, size, flower colours | "tuft" | "rock") on the top, placed where no rail of 1-3 runs."""
    pts = outline(w, d, n, seed)
    nrm = outward_normals(pts)
    parts: list = []
    grass_cap(parts, "grass", pts, nrm, 0.6, lip_in, drips_for(n, seed + 1, drip_scale), pal)
    rock = rock_body(parts, "rock", pts, nrm, h, nr, lip_in, bands, seed + 2, pal)
    for i, (j, u0, u1, size) in enumerate(spurs):
        spur(parts, f"spur-{i}", rock, j, u0, u1, size, seed + 20 + i, pal, bands)
    rng = random.Random(seed + 3)
    # Roots come out under the lip, hug the rock over the mossy ledge, then dangle free where it tapers away.
    for r, (j, length, thick) in enumerate(roots):
        bx, bz = rock.base[j]
        tx, tz = -bz, bx  # along the rim, for a little sway
        tl = math.hypot(tx, tz) or 1.0
        tx, tz = tx / tl, tz / tl
        sway = rng.uniform(0.6, 1.0) * rng.choice((-1, 1)) * thick * 4
        path, radii = [], []
        for t, f, rad in ((0.0, 0.95, 1.0), (0.1, 0.99, 0.9), (0.3, 1.0, 0.72), (0.55, 1.0, 0.5), (0.8, 1.01, 0.32), (1.0, 1.03, 0.12)):
            y = -0.55 - t * length
            off = sway * math.sin(t * math.pi * 1.2)
            path.append((bx * f + tx * off, y, bz * f + tz * off))
            radii.append(thick * rad)
        tube = k.add_swept_tube(parts, f"root-{r}", path, radii, [pal.root] * (len(path) - 1), sides=4)
        fix_normals(tube)
    # Floating pebbles below, out from the taper; the bigger one has a scrap of grass on it.
    for p, (j, u, size) in enumerate(pebbles):
        pebble(parts, f"pebble-{p}", size, rock.at(j, u, size[0] * 0.8 + 0.6), pal.rock_dark, pal.grass if p == 0 else pal.rock,
               seed + 10 + p, top_from=0.55)
    # Tufts on the mossy first ledge (always below the top, so never on a rail).
    if rock.ledges:
        for t, j in enumerate(ledge_tufts):
            tuft(parts, f"ledge-tuft-{t}", rock.ledges[0][j], 0.5 * drip_scale + 0.2, 4, seed + 40 + t, pal.tuft)
    # Plants on the top, only where no rail of 1-3 crosses.
    for c, (x, z, size, colours) in enumerate(decor):
        if colours == "rock":
            pebble(parts, f"top-rock-{c}", (size, size * 0.7, size * 0.85), (x, size * 0.18, z), pal.rock_dark, pal.rock, seed + 60 + c)
            tuft(parts, f"top-rock-tuft-{c}", (x + size * 0.5, 0.0, z + size * 0.35), 0.5, 4, seed + 70 + c, pal.tuft)
        elif colours == "tuft":
            tuft(parts, f"top-tuft-{c}", (x, 0.0, z), size, 5, seed + 80 + c, pal.tuft, spread=0.3 * size)
        else:
            flower_clump(parts, f"top-flowers-{c}", (x, 0.0, z), size, seed + 90 + c, pal, [getattr(pal, col) for col in colours])
    return parts


def island_a():
    pal = Palette()
    L, D = pal.rock, pal.rock_dark
    parts = island(
        24, 12, 24, 11, 40, 14, pal, lip_in=0.95, drip_scale=0.85,
        bands=[(0.16, L, 0.06, pal.moss), (0.36, D, 0, None), (0.55, L, 0, None), (0.72, D, 0, None), (0.87, L, 0, None)],
        roots=[(2, 5.4, 0.42), (6, 4.4, 0.36), (11, 3.6, 0.32)],
        spurs=[(4, 0.42, 0.8, 3.6), (9, 0.5, 0.86, 2.8)],
        pebbles=[(5, 0.8, (1.6, 1.2, 1.4)), (12, 0.92, (1.0, 0.8, 0.9))],
        ledge_tufts=[1, 4, 8, 12],
        # Rails cross island-a along x or z within 1.8 m of the centre (and the shell record floats at (-6.8, -5.6)).
        decor=[(6.4, 6.0, 1.4, ("white", "gold", "white")), (8.4, 4.6, 0.7, "tuft"), (-6.2, 6.6, 1.3, ("pink", "white", "gold")),
               (-8.7, 4.6, 0.65, "tuft"), (7.0, -6.4, 1.5, "rock"), (5.4, -8.0, 1.1, ("gold", "white"))],
    )
    return parts, 1500


def island_b():
    pal = Palette()
    L, D = pal.rock, pal.rock_dark
    parts = island(
        40, 16, 28, 23, 44, 16, pal, lip_in=1.15, drip_scale=1.0,
        bands=[(0.15, L, 0.05, pal.moss), (0.34, D, 0, None), (0.53, L, 0, None), (0.7, D, 0, None), (0.86, L, 0, None)],
        roots=[(1, 7.4, 0.52), (7, 6.2, 0.46), (12, 5.2, 0.42)],
        spurs=[(3, 0.4, 0.8, 5.6), (9, 0.48, 0.86, 4.4), (14, 0.36, 0.7, 3.6)],
        pebbles=[(5, 0.8, (2.2, 1.6, 2.0)), (11, 0.93, (1.4, 1.1, 1.2))],
        ledge_tufts=[0, 4, 8, 12],
        decor=(),  # the whole top is crossed by a rail in some copy of island-b: no hill, nothing on it
    )
    return parts, 2000


def island_c():
    pal = Palette()
    L, D = pal.rock, pal.rock_dark
    parts = island(
        12, 8, 12, 37, 28, 10, pal, lip_in=0.7, drip_scale=0.6,
        bands=[(0.2, L, 0.07, pal.moss), (0.45, D, 0, None), (0.68, L, 0, None), (0.86, D, 0, None)],
        roots=[(1, 3.2, 0.26), (6, 2.6, 0.22)],
        spurs=[(3, 0.42, 0.82, 2.0)],
        pebbles=[(4, 0.8, (1.0, 0.8, 0.9)), (8, 0.92, (0.7, 0.55, 0.6))],
        ledge_tufts=[1, 5, 8],
        decor=[(-4.3, -1.5, 0.8, ("white", "gold")), (4.2, 2.3, 0.7, ("pink", "white"))],
    )
    return parts, 1000


# ---------------------------------------------------------------- the flip slab and its cap

SLAB_THICK = 18.8
SLAB_MID = -SLAB_THICK / 2
ROCK_RADIUS = 8.9  # cap rock, under the grass shell (outer 9.4)
# Strata of the slab's sides and the cap's ends, top to bottom: (y top, y bottom, x of the face).
STRATA = [(-0.5, -3.6, 15.0), (-3.6, -6.4, 14.55), (-6.4, -12.4, 15.0), (-12.4, -15.2, 14.55), (-15.2, -18.3, 15.0)]


def lip_section(drip_r, drip_l):
    """Cross-section (x, depth below the grass face) of a grass layer: flat face, rounded lip on both sides with
    drips hanging toward the rock, tucked in under the face."""
    def side(sign, d):
        return [(sign * 14.9, 0.0), (sign * 15.16, -0.17), (sign * 15.2, -0.6 - d), (sign * 14.4, -0.56 - 0.5 * d)]
    right = side(1, drip_r)
    left = side(-1, drip_l)
    return right + left[::-1]


def strip_drips(count, seed, scale=1.0):
    """Drips along a straight lip, zero at both ends (slabs and the cap meet there)."""
    rng = random.Random(seed)
    drip = [0.0] * (count + 1)
    i = rng.randint(2, 3)
    while i < count - 1:
        length = rng.uniform(0.4, 1.0) * scale
        drip[i] = max(drip[i], length)
        drip[i - 1] = max(drip[i - 1], length * 0.4)
        drip[i + 1] = max(drip[i + 1], length * 0.4)
        i += rng.randint(3, 5)
    return drip


def loft(parts, name, rings, materials, idx_fn, smooth_fn, cap_ends=True):
    """Closed loft through rings of equal length (3D points); faces coloured by idx_fn(center, normal)."""
    n = len(rings[0])
    verts = [p for r in rings for p in r]
    faces = []
    for r in range(len(rings) - 1):
        faces += ring_faces(r * n, (r + 1) * n, n)
    if cap_ends:
        faces.append(tuple(range(n - 1, -1, -1)))
        last = (len(rings) - 1) * n
        faces.append(tuple(range(last, last + n)))
    obj = k.add_mesh(parts, name, verts, faces, materials)
    fix_normals(obj)
    for poly in obj.data.polygons:
        c, nm = k.gltf(poly.center), k.gltf(poly.normal)
        poly.material_index = idx_fn(c, nm)
        poly.use_smooth = smooth_fn(c, nm)
    return obj


def slab_grass(parts, name, columns, seed, pal, underside):
    """The grass layer along the slab (z = -20 .. 20), on top or (underside, `pal` the glowing one) mirrored to
    y = -18.8."""
    dr, dl = strip_drips(columns, seed), strip_drips(columns, seed + 1)
    rings = []
    for c in range(columns + 1):
        z = -20 + 40 * c / columns
        sec = lip_section(dr[c], dl[c])
        rings.append([(x, (-SLAB_THICK - y) if underside else y, z) for x, y in sec])
    return loft(parts, name, rings, [pal.grass], lambda c, n: 0, lambda c, n: abs(n.y) < 0.97)


def slab_rock(parts, name, columns, seed, pal):
    """Rock core of the slab: strata bands along z, proud and recessed, wavy inside, exact at the ends."""
    rng = random.Random(seed)
    rings = []
    for c in range(columns + 1):
        z = -20 + 40 * c / columns
        inner = 0 < c < columns
        right, left = [], []
        for sign, out in ((1, right), (-1, left)):
            dy = [rng.uniform(-0.35, 0.35) if inner else 0.0 for _ in range(len(STRATA) + 1)]
            dx = [rng.uniform(-0.22, 0.12) if inner else 0.0 for _ in STRATA]
            dy[0] = dy[-1] = 0.0  # the hidden top and bottom stay straight
            for b, (y0, y1, x) in enumerate(STRATA):
                out.append((sign * (x + dx[b]), y0 + dy[b], z))
                out.append((sign * (x + dx[b]), y1 + dy[b + 1], z))
        rings.append(right + left[::-1])

    def colour(cen, nm):
        if abs(nm.y) > 0.6:  # ledges: the side facing the nearer grass face is mossy
            return 2 if (nm.y > 0) == (cen.y > SLAB_MID) and abs(abs(cen.x) - 14.8) < 0.5 else 0
        band = next((b for b, (y0, y1, _) in enumerate(STRATA) if y1 <= cen.y <= y0 + 0.4), 2)
        return 1 if STRATA[band][2] < 14.8 else 0

    return loft(parts, name, rings, [pal.rock, pal.rock_dark, pal.moss], colour, lambda c, n: False)


def slab_plants(parts, pal, under_pal, seed):
    """Tufts and flowers along the outer strips (|x| > 10.5): rails run at x = +-6 on top and between x = -6 and 6.2
    underneath (with さかさのえき's platform out to x = 11.7 below, so the +x side underneath keeps x > 12.3)."""
    # (On slab 520 the ura siding comes in over the +x strip, between z = -11 and 14, from 3 m up: keep it low there.)
    top = [(-12.6, -14.0, "flowers"), (-11.4, 3.0, "tuft"), (-13.3, 13.5, "flowers2"), (12.0, -17.5, "tuft"),
           (13.3, -13.5, "flowers"), (11.8, 11.0, "tuft")]
    under = [(-12.2, -9.0, "flowers2"), (-13.4, 8.5, "tuft"), (-11.3, 17.0, "tuft"), (13.4, -4.0, "flowers"),
             (13.2, 12.5, "tuft")]
    for face, plants in (("top", top), ("under", under)):
        up = (0, 1, 0) if face == "top" else (0, -1, 0)
        p = pal if face == "top" else under_pal
        y = 0.0 if face == "top" else -SLAB_THICK
        for i, (x, z, kind) in enumerate(plants):
            s = seed + i + (100 if face == "under" else 0)
            if kind == "tuft":
                tuft(parts, f"{face}-tuft-{i}", (x, y, z), 0.6, 5, s, p.tuft, up=up, spread=0.3)
            else:
                colours = [p.white, p.gold] if kind == "flowers" else [p.pink, p.white, p.gold]
                flower_clump(parts, f"{face}-flowers-{i}", (x, y, z), 0.95, s, p, colours, up=up)


def island_flip():
    pal, under = Palette(), Palette(under=True)
    parts: list = []
    slab_grass(parts, "grass-top", 20, 51, pal, underside=False)
    slab_grass(parts, "grass-under", 20, 53, under, underside=True)
    slab_rock(parts, "rock", 10, 55, pal)
    slab_plants(parts, pal, under, 57)
    return parts, 2000


def cap_point(x, depth, phi):
    """A point `depth` (<= 0) below the cap's grass face at angle phi (0 = top, pi = underneath)."""
    rho = 9.4 + depth
    return (x, SLAB_MID + rho * math.cos(phi), rho * math.sin(phi))


def island_flip_cap():
    pal, under = Palette(), Palette(under=True)
    parts: list = []
    steps = 20
    dr, dl = strip_drips(steps, 61, 0.9), strip_drips(steps, 62, 0.9)
    rings = []
    for s in range(steps + 1):
        phi = math.pi * s / steps
        rings.append([cap_point(x, y, phi) for x, y in lip_section(dr[s], dl[s])])
    # The lower half of the curve, turned to the ground, takes the underside's glowing grass.
    loft(parts, "grass", rings, [pal.grass, under.grass], lambda c, n: 1 if c.y < SLAB_MID - 2.0 else 0, lambda c, n: abs(n.x) < 0.97)
    # Rock: each stratum is a slice of the half disc, pushed out along x to its face.
    for b, (y0, y1, xb) in enumerate(STRATA):
        a0 = math.acos(max(-1.0, min(1.0, (y0 - SLAB_MID) / ROCK_RADIUS)))
        a1 = math.acos(max(-1.0, min(1.0, (y1 - SLAB_MID) / ROCK_RADIUS)))
        count = max(2, round((a1 - a0) / (math.pi / steps)))
        outline_zy = [(0.0, y0)]
        for i in range(count + 1):
            a = a0 + (a1 - a0) * i / count
            z, y = ROCK_RADIUS * math.sin(a), SLAB_MID + ROCK_RADIUS * math.cos(a)
            if z > 1e-4:
                outline_zy.append((z, y))
        outline_zy.append((0.0, y1))
        m = len(outline_zy)
        verts = [(-xb, y, z) for z, y in outline_zy] + [(xb, y, z) for z, y in outline_zy]
        faces = [tuple(range(m)), tuple(range(2 * m - 1, m - 1, -1))]
        faces += [(i, (i + 1) % m, m + (i + 1) % m, m + i) for i in range(m)]
        obj = k.add_mesh(parts, f"rock-{b}", verts, faces, [pal.rock, pal.rock_dark, pal.moss])
        fix_normals(obj)
        proud = xb > 14.8
        for poly in obj.data.polygons:
            c, nm = k.gltf(poly.center), k.gltf(poly.normal)
            # A proud band's face toward the nearer grass shows as a ledge beside the recessed one: mossy, as on the slab.
            ledge = proud and abs(nm.y) > 0.9 and (nm.y > 0) == (c.y > SLAB_MID)
            poly.material_index = 2 if ledge else (0 if proud else 1)
            poly.use_smooth = False
    # Plants on the outer strips of the curve (rails wrap at x = +-6), standing out from it.
    plants = [(-12.4, 0.55, "flowers"), (-13.2, 1.55, "tuft"), (-11.6, 2.45, "flowers2"),
              (12.8, 0.85, "tuft"), (11.9, 1.75, "flowers"), (13.4, 2.6, "tuft")]
    for i, (x, phi, kind) in enumerate(plants):
        base = cap_point(x, 0.0, phi)
        up = (0, math.cos(phi), math.sin(phi))
        p = under if base[1] < SLAB_MID - 2.0 else pal
        if kind == "tuft":
            tuft(parts, f"tuft-{i}", base, 0.6, 5, 70 + i, p.tuft, up=up, spread=0.3)
        else:
            colours = [p.white, p.gold] if kind == "flowers" else [p.pink, p.white, p.gold]
            flower_clump(parts, f"flowers-{i}", base, 0.95, 80 + i, p, colours, up=up)
    return parts, 1200


# ---------------------------------------------------------------- clouds

def split_at(obj, height):
    """Cut every face crossing the horizontal plane y = height, so a colour can change along a clean line there."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, height), plane_no=(0, 0, 1))
    bm.to_mesh(obj.data)
    bm.free()


def cloud_shape(name, size, puffs, budget, voxel, glow=0.42, shade_below=0.3):
    """Puffs fused into one soft surface (voxel remesh), flat underneath; white above, blue-white below a level line
    (the cut keeps that line clean instead of following the jagged triangles of the decimated surface)."""
    parts: list = []
    white = mat("Cloud", CLOUD, 0.9, glow)
    shade = mat("Cloud shade", CLOUD_SHADE, 0.9, glow)
    for i, (x, y, z, rx, ry, rz) in enumerate(puffs):
        k.add_ellipsoid(parts, f"puff-{i}", (2 * rx, 2 * ry, 2 * rz), (x, y, z), white, segments=20, rings=10)
    dense = k.join(parts, f"{name}-dense")
    k.apply_modifier(dense, "REMESH", mode="VOXEL", voxel_size=voxel, adaptivity=0.0)
    k.apply_modifier(dense, "SMOOTH", factor=0.6, iterations=6)
    k.active(dense)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bisect(plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    w, h, d = size
    target = budget * 0.86
    while True:
        clay = dense.copy()
        clay.data = dense.data.copy()
        bpy.context.collection.objects.link(clay)
        k.apply_modifier(clay, "DECIMATE", decimate_type="COLLAPSE", ratio=min(1.0, target / max(k.triangles(dense), 1)),
                         use_collapse_triangulate=True)
        # Exact size, bottom centre at the origin.
        _, lo, hi = k.model_metrics(clay)
        clay.scale = (w / (hi[0] - lo[0]), d / (hi[2] - lo[2]), h / (hi[1] - lo[1]))
        k.active(clay)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        k.normalize(clay, None)
        split_at(clay, shade_below * h)
        clay.data.update()
        if k.triangles(clay) <= budget:
            break
        target -= k.triangles(clay) - budget + 8
        bpy.data.objects.remove(clay, do_unlink=True)
    bpy.data.objects.remove(dense, do_unlink=True)
    clay.name = name
    clay.data.name = name
    clay.data.materials.clear()
    clay.data.materials.append(white)
    clay.data.materials.append(shade)
    for poly in clay.data.polygons:
        c, nm = k.gltf(poly.center), k.gltf(poly.normal)
        poly.material_index = 1 if c.y < shade_below * h else 0
        poly.use_smooth = nm.y > -0.98  # the flat bottom stays flat
    fix_normals(clay)
    return clay


def cloud_a():
    puffs = [(0.0, 1.35, 0.0, 2.1, 1.65, 1.9), (-2.2, 0.95, 0.3, 1.5, 1.2, 1.4), (2.3, 0.9, -0.2, 1.45, 1.15, 1.35),
             (-0.9, 2.05, 0.25, 1.25, 1.0, 1.15), (0.95, 1.95, -0.2, 1.15, 0.95, 1.1), (-3.4, 0.6, -0.1, 0.85, 0.75, 0.9),
             (3.4, 0.55, 0.35, 0.8, 0.7, 0.85), (0.3, 0.7, 1.3, 1.4, 0.9, 1.0), (-0.4, 0.7, -1.3, 1.3, 0.85, 0.95)]
    return cloud_shape("cloud-a", (8, 3, 5), puffs, 500, 0.12), 500


def cloud_b():
    puffs = [(0, 1.7, 0, 3.0, 2.1, 2.8), (-3.4, 1.3, 0.4, 2.3, 1.7, 2.2), (3.5, 1.25, -0.3, 2.4, 1.6, 2.1),
             (-6.0, 0.8, -0.1, 1.3, 1.0, 1.4), (6.1, 0.75, 0.4, 1.2, 0.95, 1.3), (-1.5, 2.8, 0.2, 1.7, 1.25, 1.6),
             (1.6, 2.7, -0.4, 1.5, 1.2, 1.5), (4.6, 1.9, 0.5, 1.3, 1.0, 1.2), (-4.6, 2.0, -0.5, 1.2, 1.0, 1.2),
             (0.5, 0.9, 2.0, 2.0, 1.0, 1.4), (-0.5, 0.9, -2.0, 2.0, 1.0, 1.4)]
    return cloud_shape("cloud-b", (14, 4, 8), puffs, 700, 0.16), 700


def cloud_bounce():
    """The cushion cloud that catches a falling train: a shallow dish inside a ring of round puffs."""
    puffs = [(0.0, 1.35, 0.0, 7.0, 1.95, 7.0)]
    for i in range(11):
        a = TAU * i / 11
        puffs.append((math.cos(a) * 5.7, 3.0, math.sin(a) * 5.7, 2.35, 1.9, 2.35))
    for i in range(11):
        a = TAU * (i + 0.5) / 11
        puffs.append((math.cos(a) * 6.6, 1.3, math.sin(a) * 6.6, 1.6, 1.2, 1.6))
    return cloud_shape("cloud-bounce", (16, 5, 16), puffs, 900, 0.2, shade_below=0.42), 900


# ---------------------------------------------------------------- buoy

def sky_buoy():
    """A floating marker beside the line: a gold float with a white band, a little mast and a pennant pointing on
    along the rail (+Z), and a weight hanging under it."""
    gold = mat("Buoy gold", GOLD, 0.45, 0.3)
    white = mat("Buoy band", WHITE, 0.5, 0.2)
    navy = mat("Buoy mast", NAVY, 0.6)
    coral = mat("Buoy pennant", CORAL, 0.6, 0.15)
    parts: list = []
    ball = k.add_ellipsoid(parts, "float", (1.0, 1.0, 1.0), (0, 1.1, 0), gold, segments=12, rings=8)
    ball.data.materials.append(white)
    for poly in ball.data.polygons:
        if -0.2 < poly.center.z < 0:  # local coordinates: the row just under the equator, like a waterline
            poly.material_index = 1
    k.add_tapered_segment(parts, "mast", (0, 1.5, 0), (0, 2.33, 0), 0.05, 0.04, navy, vertices=6)
    k.add_ellipsoid(parts, "knob", (0.16, 0.16, 0.16), (0, 2.32, 0), gold, segments=6, rings=4)
    # Pennant: a thin closed wedge from the mast toward +Z.
    pen = [(0.04, 2.24), (0.04, 1.9), (0.49, 2.06)]
    verts = [(-0.02, y, z) for z, y in pen] + [(0.02, y, z) for z, y in pen]
    obj = k.add_mesh(parts, "pennant", verts, [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], [coral])
    fix_normals(obj)
    k.add_tapered_segment(parts, "weight", (0, 0.72, 0), (0, 0.0, 0), 0.2, 0.0, navy, vertices=8)
    for obj in parts:
        if obj.name.startswith(("mast", "weight", "pennant")):
            k.set_smooth(obj, False)
    return parts, 400


# ---------------------------------------------------------------- flat parts (gimmicks and records)

GLOW = "#FFF3B0"


def rounded_rect(x0, x1, z0, z1, r_back, r_front, per_corner=4):
    """Outline (x, z) of the rectangle x0..x1 by z0..z1, its back corners (z0) rounded by r_back and its front ones
    (z1) by r_front."""
    pts = []
    for cx, cz, r, a0 in ((x1 - r_front, z1 - r_front, r_front, 0), (x0 + r_front, z1 - r_front, r_front, 90),
                          (x0 + r_back, z0 + r_back, r_back, 180), (x1 - r_back, z0 + r_back, r_back, 270)):
        for i in range(per_corner + 1):
            a = math.radians(a0 + 90 * i / per_corner)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def inset(pts, d):
    """The outline moved `d` m inward (about its centroid)."""
    cx = sum(p[0] for p in pts) / len(pts)
    cz = sum(p[1] for p in pts) / len(pts)
    nrm = outward_normals([(x - cx, z - cz) for x, z in pts])
    return [(x - d * nx, z - d * nz) for (x, z), (nx, nz) in zip(pts, nrm)]


def slab(parts, name, pts, y0, y1, m, bevel=0.0):
    """A flat slab standing on the outline `pts` (x, z) from y0 to y1; `bevel` chamfers its top edge."""
    n = len(pts)
    rings = [[(x, y0, z) for x, z in pts]]
    if bevel:
        rings.append([(x, y1 - bevel, z) for x, z in pts])
        rings.append([(x, y1, z) for x, z in inset(pts, bevel)])
    else:
        rings.append([(x, y1, z) for x, z in pts])
    verts = [p for r in rings for p in r]
    faces = [tuple(range(n - 1, -1, -1))]
    for r in range(len(rings) - 1):
        faces += ring_faces(r * n, (r + 1) * n, n)
    last = (len(rings) - 1) * n
    faces.append(tuple(range(last, last + n)))
    return solid(parts, name, verts, faces, [m], None, [False] * len(faces))


def plate(parts, name, center, u, v, outline, thick, materials, indices=None):
    """A flat closed plate: `outline` [(a, b)] in the plane through `center` spanned by u and v, `thick` m thick
    across it. Faces: the two sides first, then the edge quads."""
    u, v = Vector(u).normalized(), Vector(v).normalized()
    nrm = u.cross(v).normalized()
    c = Vector(center)
    m = len(outline)
    verts = [tuple(c + u * a + v * b + nrm * (s * thick / 2)) for s in (-1, 1) for a, b in outline]
    faces = [tuple(range(m)), tuple(range(2 * m - 1, m - 1, -1))] + [(i, (i + 1) % m, m + (i + 1) % m, m + i) for i in range(m)]
    return solid(parts, name, verts, faces, materials, indices, [False] * len(faces))


def disc(parts, name, center, radius, y0, y1, m, segments=16, dome=0.0):
    """A round flat disc on the floor plane (y0..y1), its top a little domed by `dome` m."""
    rings = [(y0, radius, radius, center[0], center[1]), (y1, radius, radius, center[0], center[1])]
    if dome:
        rings.append((y1 + dome * 0.75, radius * 0.72, radius * 0.72, center[0], center[1]))
        rings.append((y1 + dome, radius * 0.3, radius * 0.3, center[0], center[1]))
    obj = k.add_profiled_volume(parts, name, rings, m, segments=segments, smooth=bool(dome))
    fix_normals(obj)
    return obj


def pyramid(parts, name, base, tip, a, b, m):
    """A four-sided point from the diamond base (base +- a, base +- b) to `tip` (6 triangles)."""
    p = [Vector(base) + Vector(a), Vector(base) + Vector(b), Vector(base) - Vector(a), Vector(base) - Vector(b), Vector(tip)]
    obj = k.add_mesh(parts, name, [tuple(v) for v in p], [(0, 1, 2, 3), (0, 4, 1), (1, 4, 2), (2, 4, 3), (3, 4, 0)], [m])
    fix_normals(obj)
    return obj


# ---------------------------------------------------------------- gimmicks

def jump_pad():
    """The vanishing jump pad (a whistle brings it out for a few seconds): a low deck over the track, 4 x 6 m, gold
    round a sky-blue inlay, its front edge curled up to 0.6 m like a ski tip, a round glowing middle (#FFF3B0) in a gold
    ring and two coral arrows pointing on along the rail (+Z). Everything glows a little: it is magic, and it shows up
    against the white of the sky. 'pad' look only (3-1's whale and 4-2's ski jump are other models)."""
    gold = mat("Pad gold", GOLD, 0.45, 0.25)
    inlay = mat("Pad deck", "#CDE7F7", 0.6, 0.12)
    glow = mat("Pad glow", GLOW, 0.4, 0.45)
    coral = mat("Pad arrow", CORAL, 0.55, 0.2)
    parts: list = []
    deck_top = 0.18
    # The curled front: a 0.12 m plate following a circle (radius R) up to 55 degrees, its top flush with the deck at
    # z0; R and z0 put the tip's top at y = 0.6 and its front at z = 3.0.
    t, theta, yc0 = 0.12, math.radians(55), deck_top - 0.06
    radius = (0.6 - yc0 - t / 2 * math.cos(theta)) / (1 - math.cos(theta))
    z0 = 3.0 - (radius + t / 2) * math.sin(theta)
    top, bottom = [], []
    for i in range(7):
        a = theta * i / 6
        cz, cy = z0 + radius * math.sin(a), yc0 + radius * (1 - math.cos(a))
        top.append((cz - t / 2 * math.sin(a), cy + t / 2 * math.cos(a)))
        bottom.append((cz + t / 2 * math.sin(a), cy - t / 2 * math.cos(a)))
    cz, cy = z0 + radius * math.sin(theta), yc0 + radius * (1 - math.cos(theta))
    rim = (cz + t * 0.4 * math.cos(theta), cy + t * 0.4 * math.sin(theta))  # the tip's rounded edge
    profile = top + [rim] + bottom[::-1]
    verts = [(sx * 2.0, y, z) for sx in (-1, 1) for z, y in profile]
    m = len(profile)
    faces = [tuple(range(m)), tuple(range(2 * m - 1, m - 1, -1))] + [(i, (i + 1) % m, m + (i + 1) % m, m + i) for i in range(m)]
    solid(parts, "lip", verts, faces, [gold], None, [False, False] + [True] * m)
    # The deck (gold, rounded at the back) and its sky-blue inlay, a little proud of it.
    slab(parts, "deck", rounded_rect(-2.0, 2.0, -3.0, z0, 0.5, 0.08), 0.0, deck_top, gold, bevel=0.05)
    slab(parts, "inlay", rounded_rect(-1.7, 1.7, -2.7, z0 - 0.25, 0.3, 0.12), deck_top - 0.03, deck_top + 0.025, inlay)
    # The glowing middle in its gold ring, then the arrows toward the lip.
    middle = -0.75
    disc(parts, "glow-ring", (0.0, middle), 1.28, deck_top, deck_top + 0.06, gold)
    disc(parts, "glow", (0.0, middle), 1.08, deck_top + 0.02, deck_top + 0.08, glow, dome=0.05)
    chevron = [(0.0, 0.42), (0.62, -0.08), (0.46, -0.24), (0.0, 0.16), (-0.46, -0.24), (-0.62, -0.08)]
    for i, z in enumerate((0.75, 1.3)):
        plate(parts, f"arrow-{i}", (0.0, deck_top + 0.035, z), (1, 0, 0), (0, 0, 1), chevron, 0.05, [coral])
    return parts, 500


def updraft_ring():
    """A hoop of wind the train runs through on an updraft stretch: centre 3.6 m over the rail, radius 3.4 m, so its
    foot just touches the rail; glowing white (its inner side a pale blue), and four sky-blue arrowheads on it
    pointing on along the rail (+Z)."""
    white = mat("Ring", CLOUD, 0.8, 0.45)
    shade = mat("Ring inside", CLOUD_SHADE, 0.8, 0.5)
    blue = mat("Ring arrow", "#6EC1F2", 0.5, 0.3)
    parts: list = []
    seg, sides, big, small, cy = 24, 5, 3.4, 0.2, 3.6
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
    ring = solid(parts, "ring", verts, faces, [white, shade], None, [True] * len(faces))
    for poly in ring.data.polygons:
        c, nm = k.gltf(poly.center), k.gltf(poly.normal)
        toward = Vector((-c.x, cy - c.y, 0.0)).normalized()
        poly.material_index = 1 if nm.dot(toward) > 0.3 else 0
    for i in range(4):
        a = TAU * (i + 0.5) / 4
        radial = Vector((math.cos(a), math.sin(a), 0.0))
        along = Vector((-math.sin(a), math.cos(a), 0.0))
        base = Vector((0.0, cy, -0.32)) + radial * big
        pyramid(parts, f"arrow-{i}", base, base + Vector((0.0, 0.0, 0.92)), radial * 0.36, along * 0.2, blue)
    return parts, 300


# ---------------------------------------------------------------- records

def crystal(parts, name, base, up, length, radius, turn, materials):
    """A six-sided crystal from `base` along `up`, ending in a point (22 triangles). Its sides alternate two tones;
    the point's facets are white."""
    q = rotate_to(up)
    body = length * 0.74
    verts = []
    for y in (0.0, body):
        for i in range(6):
            a = turn + TAU * i / 6
            verts.append(place(base, q, (math.cos(a) * radius, y, math.sin(a) * radius)))
    verts.append(place(base, q, (0.0, length, 0.0)))
    faces = [tuple(range(5, -1, -1))] + ring_faces(0, 6, 6) + [(6 + i, 6 + (i + 1) % 6, 12) for i in range(6)]
    indices = [0] + [i % 2 for i in range(6)] + [2] * 6
    return solid(parts, name, verts, faces, materials, indices, [False] * len(faces))


def cloud_crystal():
    """Record "くもの けっしょう": a cluster of pale blue-white hexagonal crystals (#DCE9F5, not see-through) growing
    out of a little puff of cloud; they glow a little so they glitter at the island's edge."""
    cloud = mat("Cloud", CLOUD, 0.9, 0.42)
    tones = [mat("Crystal", CLOUD_SHADE, 0.35, 0.35), mat("Crystal light", "#EEF5FD", 0.35, 0.35), mat("Crystal tip", WHITE, 0.3, 0.45)]
    parts: list = []
    for i, (x, y, z, w, h, d) in enumerate([(0.0, 0.07, 0.0, 0.5, 0.2, 0.46), (0.17, 0.06, 0.1, 0.28, 0.15, 0.28),
                                            (-0.15, 0.05, -0.12, 0.3, 0.14, 0.28)]):
        k.add_ellipsoid(parts, f"puff-{i}", (w, h, d), (x, y, z), cloud, segments=8, rings=4)
    for i, (x, z, lean_x, lean_z, length, radius, turn) in enumerate([
            (0.0, 0.0, 0.0, 0.05, 0.84, 0.085, 0.2), (0.12, 0.06, 0.45, 0.2, 0.5, 0.065, 0.7),
            (-0.1, 0.08, -0.4, 0.35, 0.44, 0.06, 0.1), (0.04, -0.12, 0.15, -0.45, 0.4, 0.055, 0.9),
            (-0.12, -0.06, -0.5, -0.2, 0.3, 0.045, 0.4)]):
        crystal(parts, f"crystal-{i}", (x, 0.04, z), (lean_x, 1.0, lean_z), length, radius, turn, tones)
    return parts, 300


def weathervane():
    """Record "かざみどり", found in the cloud by the light: a navy post on a scrap of rock and grass, a gold knob, the
    four compass arms with diamond plates (no letters), the arrow (gold head toward +Z, coral tail feathers) and, on
    it, a round made-up bird (sky blue, a cream breast, a gold beak; no comb, nothing like a real rooster)."""
    pal = Palette()
    navy = mat("Vane post", NAVY, 0.6)
    gold = mat("Vane gold", GOLD, 0.45, 0.15)
    coral = mat("Vane tail", CORAL, 0.6, 0.1)
    blue = mat("Bird", "#5FA8E6", 0.6)
    cream = mat("Bird breast", "#F4EEDC", 0.6)
    dark = mat("Bird eye", NAVY, 0.4)
    parts: list = []
    pebble(parts, "foot", (0.62, 0.34, 0.54), (0.0, 0.12, 0.0), pal.rock_dark, pal.grass, 5, top_from=0.45)
    tuft(parts, "foot-tuft", (0.2, 0.22, 0.12), 0.24, 4, 9, pal.tuft, spread=0.1)
    k.add_tapered_segment(parts, "post", (0, 0.2, 0), (0, 2.78, 0), 0.05, 0.035, navy, vertices=6, smooth=False)
    k.add_ellipsoid(parts, "knob", (0.15, 0.15, 0.15), (0, 2.02, 0), gold, segments=8, rings=4)
    # Compass arms (x and z) with a diamond plate at each end, the front one coral.
    k.add_box(parts, "arm-x", (1.14, 0.035, 0.035), (0, 2.25, 0), gold)
    k.add_box(parts, "arm-z", (0.035, 0.035, 1.14), (0, 2.25, 0), gold)
    diamond = [(0.0, 0.1), (0.1, 0.0), (0.0, -0.1), (-0.1, 0.0)]
    for i, (x, z) in enumerate(((0.58, 0), (-0.58, 0), (0, 0.58), (0, -0.52))):
        u = (0, 0, 1) if x else (1, 0, 0)
        plate(parts, f"plate-{i}", (x, 2.25, z), u, (0, 1, 0), [(a * 0.8, b) for a, b in diamond], 0.03,
              [coral if z > 0 else gold])
    # The arrow: shaft, gold head (+Z) and two coral tail feathers.
    k.add_box(parts, "shaft", (0.04, 0.04, 1.0), (0, 2.78, -0.02), gold)
    plate(parts, "head", (0, 2.78, 0.48), (0, 0, 1), (0, 1, 0), [(0.12, 0.0), (-0.05, 0.11), (0.0, 0.0), (-0.05, -0.11)], 0.04, [gold])
    for i, s in enumerate((1, -1)):
        plate(parts, f"feather-{i}", (0, 2.78, -0.5), (0, 0, 1), (0, 1, 0),
              [(0.12, 0.0), (-0.1, s * 0.16), (-0.04, s * 0.02)], 0.03, [coral])
    # The bird, standing on the arrow over the post, looking along it.
    k.add_ellipsoid(parts, "body", (0.32, 0.28, 0.44), (0, 2.96, -0.04), blue, segments=10, rings=6)
    k.add_ellipsoid(parts, "breast", (0.22, 0.2, 0.2), (0, 2.93, 0.1), cream, segments=8, rings=5)
    k.add_ellipsoid(parts, "head", (0.2, 0.2, 0.2), (0, 3.1, 0.13), blue, segments=8, rings=5)
    k.add_tapered_segment(parts, "beak", (0, 3.1, 0.21), (0, 3.09, 0.31), 0.035, 0.0, gold, vertices=4, smooth=False)
    for s in (-1, 1):
        k.add_ellipsoid(parts, f"eye-{s}", (0.03, 0.04, 0.03), (s * 0.085, 3.13, 0.17), dark, segments=6, rings=3)
        wing = k.add_ellipsoid(parts, f"wing-{s}", (0.06, 0.16, 0.3), (s * 0.15, 2.98, -0.07), blue, segments=6, rings=4)
        wing.rotation_euler = (math.radians(-12), 0, 0)
    plate(parts, "tail", (0, 3.0, -0.3), (0, 0, 1), (0, 1, 0), [(0.06, -0.02), (-0.14, 0.1), (-0.17, 0.0), (-0.12, -0.08)], 0.05, [blue])
    return parts, 700


def upside_flower():
    """Record "さかさじまの うら": a pink flower blooming upside down under the upside-down island. Origin at the root of
    the stem (the top); the stem with two leaves hangs down to a bell of five pointed petals opening downward (deep
    pink at its top, pink petals curling out, pink inside round a small yellow heart) and a stamen hanging out of it."""
    green = mat("Stem", "#5DAE4B", 0.7)
    leaf_green = mat("Leaf", "#7CC85E", 0.7)
    deep = mat("Petal deep", "#E75BA0", 0.55, 0.15)
    pink = mat("Petal", "#F59AC6", 0.55, 0.15)
    yellow = mat("Heart", "#FFE27A", 0.5, 0.25)
    parts: list = []
    k.add_tapered_segment(parts, "stem", (0, 0, 0), (0.02, -0.36, 0.01), 0.026, 0.022, green, vertices=5)
    for i, (s, y) in enumerate(((1, -0.11), (-1, -0.21))):
        base, tip = Vector((0.01 * s, y, 0)), Vector((0.19 * s, y - 0.08, 0.04 * s))
        mid = base + (tip - base) * 0.45
        side = Vector((-0.035, 0, 0.085 * s))
        verts = [tuple(base), tuple(mid + side), tuple(tip), tuple(mid - side), tuple(mid + Vector((0, 0.02, 0))), tuple(mid - Vector((0, 0.02, 0)))]
        leaf = k.add_mesh(parts, f"leaf-{i}", verts, [(0, 1, 4), (0, 4, 3), (0, 3, 5), (0, 5, 1), (2, 4, 1), (2, 3, 4), (2, 5, 3), (2, 1, 5)], [leaf_green], smooth=True)
        fix_normals(leaf)
    # The bell: ten-sided rings down to the rim, a five-pointed star whose points flare out and curl up a little, then
    # back up inside to the yellow heart.
    seg = 10
    rings = [(-0.33, 0.035, 0.0, 0.0), (-0.48, 0.16, 0.08, 0.0), (-0.68, 0.25, 0.3, 0.08), (-0.61, 0.09, 0.0, 0.0)]
    verts = []
    for y, r, lobe, curl in rings:
        for i in range(seg):
            a = TAU * i / seg
            point = i % 2 == 0
            rr = r * (1 + lobe if point else 1 - lobe * 0.6)
            verts.append((math.cos(a) * rr + 0.02, y + (curl if point else 0.0), math.sin(a) * rr + 0.01))
    faces = [tuple(range(seg))]
    indices = [0]
    for r in range(len(rings) - 1):
        faces += ring_faces(r * seg, (r + 1) * seg, seg)
        indices += [0 if r == 0 else 1] * seg
    faces.append(tuple(range(len(verts) - 1, len(verts) - seg - 1, -1)))
    indices.append(2)
    bell = k.add_mesh(parts, "bell", verts, faces, [deep, pink, yellow], indices)
    fix_normals(bell)  # a closed shell: outside down to the rim, then back up inside to the heart
    for poly in bell.data.polygons:
        poly.use_smooth = poly.material_index != 2
    k.add_tapered_segment(parts, "stamen", (0.02, -0.61, 0.01), (0.02, -0.8, 0.01), 0.035, 0.0, yellow, vertices=5)
    return parts, 120


# ---------------------------------------------------------------- export and preview

ISLANDS = {"island-a", "island-b", "island-c", "island-flip", "island-flip-cap"}
# Not set on the floor by normalize(): the islands and the hanging flower keep their origin at the top; the ring stays
# centred on its rail, the weathervane on its post.
KEEP_ORIGIN = ISLANDS | {"upside-flower"}
KEEP_XZ = {"updraft-ring", "weathervane"}


def export_glb(model, name, budget, max_kb=250):
    tris, lo, hi = k.model_metrics(model)
    if tris > budget:
        raise RuntimeError(f"{name}: {tris} triangles exceeds budget {budget}")
    k.MODEL_DIR.mkdir(parents=True, exist_ok=True)
    k.active(model)
    glb = k.MODEL_DIR / f"{name}.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", export_yup=True, use_selection=True)
    if glb.stat().st_size > max_kb * 1024:
        raise RuntimeError(f"{name}: GLB exceeds {max_kb} KB")
    print("MODEL_METRICS=" + json.dumps({
        "model": name, "triangles": tris, "budget": budget, "dimensions": [round(hi[i] - lo[i], 3) for i in range(3)],
        "min": [round(v, 3) for v in lo], "max": [round(v, 3) for v in hi], "materials": len(model.data.materials),
        "file_bytes": glb.stat().st_size,
    }, sort_keys=True))


def preview(model, name, direction=(0.55, -0.72, 0.42), size=(512, 400), exposure=0.0):
    """A three-quarter view in a pale sky (no floor: the islands float), fitted to the model, longest side 512 px.
    `exposure` < 0 for the glowing clouds, which would otherwise burn out white (the sky is raised to match)."""
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
    scene.render.dither_intensity = 0.0  # a flat sky packs small
    scene.render.filepath = str(k.PREVIEW_DIR / f"{name}.png")
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = exposure
    # The camera sees a pale sky; the model is lit by a neutral one, so the colours stay true.
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
    bpy.ops.object.camera_add(location=(0, 0, 0))
    camera = bpy.context.object
    camera.data.lens = 50
    camera.data.sensor_fit = "HORIZONTAL"
    view = Vector(direction).normalized()
    camera.rotation_euler = (-view).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    bpy.context.view_layer.update()
    coords = []
    for v in model.data.vertices:
        coords.extend(model.matrix_world @ v.co)
    location, _ = camera.camera_fit_coords(bpy.context.evaluated_depsgraph_get(), coords)
    # Fit leaves no margin: step back a little along the view.
    _, lo, hi = k.model_metrics(model)
    center = Vector(k.to_blender([(hi[i] + lo[i]) / 2 for i in range(3)]))
    camera.location = location + view * (Vector(location) - center).length * 0.12
    bpy.ops.render.render(write_still=True)


BUILDERS = {"island-a": island_a, "island-b": island_b, "island-c": island_c, "island-flip": island_flip,
            "island-flip-cap": island_flip_cap, "cloud-a": cloud_a, "cloud-b": cloud_b, "cloud-bounce": cloud_bounce,
            "sky-buoy": sky_buoy, "jump-pad": jump_pad, "updraft-ring": updraft_ring, "cloud-crystal": cloud_crystal,
            "weathervane": weathervane, "upside-flower": upside_flower}
# Camera directions (Blender axes: -Y is the model's front, +Z up). The jump pad is seen as the train comes to it.
VIEWS = {"island-flip": (0.62, -0.62, -0.38), "island-flip-cap": (0.8, -0.55, 0.25), "sky-buoy": (0.75, -0.55, 0.3),
         "island-a": (0.55, -0.72, 0.32), "island-b": (0.55, -0.72, 0.32), "island-c": (0.55, -0.72, 0.32),
         "jump-pad": (0.5, 0.62, 0.6), "updraft-ring": (0.72, -0.62, 0.22), "weathervane": (0.6, -0.72, 0.3),
         "upside-flower": (0.6, -0.72, -0.3)}
TALL = {"weathervane", "upside-flower", "cloud-crystal"}

if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if a in BUILDERS] or list(BUILDERS)
    for name in names:
        k.reset()
        built, budget = BUILDERS[name]()
        model = built if isinstance(built, bpy.types.Object) else k.join(built, name)
        model.name = name
        model.data.name = name
        if name not in KEEP_ORIGIN:
            k.normalize(model, None, center=name not in KEEP_XZ)
        export_glb(model, name, budget)
        preview(model, name, VIEWS.get(name, (0.55, -0.72, 0.42)), size=(400, 512) if name in TALL else (512, 400),
                exposure=-1.0 if name.startswith("cloud") else 0.0)
