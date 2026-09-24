"""Dinosaur valley (stage 1-2) — Claude Code. The world set of ticket 0005 (creatures are in dinos.py).

Plants: fern-a, fern-b, cycad. Rock: cliff-a, cliff-b (wall panels, ends cut flat at x = ±6 so they tile),
rock-a, rock-b, boulder. Trackside: direction-sign (post and board; the arrow is drawn by the game so it can
swing round), jump-unit (the jump device on the lead car's roof). Records: dino-egg, footprint-slab.
Origin at the bottom centre, front (the side facing the rail or the train) +Z. Leaves are closed flat
diamonds so they show from both sides in the game (which culls back faces).
Run: python3 scripts/run-bpy.py assets/blender/valley.py [-- name ...]
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


def fix_normals(obj):
    """Consistent winding, then outward: a closed part with negative signed volume is turned inside in.
    (recalc_face_normals alone can pick the wrong side on very thin shapes such as leaves.)"""
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


def frond(parts, name, angle, reach, rise, droop, width, m_top, m_under, sections=7, thick=0.05, base=(0, 0, 0), lift=0.0,
          lobes=False):
    """One leaf blade: a closed, flat diamond section swept along an arching path. Top and underside colours."""
    ca, sa = math.cos(angle), math.sin(angle)
    verts, faces, mats = [], [], []
    for i in range(sections + 1):
        t = i / sections
        r = reach * t
        h = lift + rise * math.sin(t * math.pi * 0.62) - droop * t ** 3
        w = width * math.sin(math.pi * min(1.0, 0.1 + 0.9 * t)) * (1.0 - 0.15 * t)
        if lobes and 0 < i < sections:
            w *= 1.0 if i % 2 else 0.55  # leaflet lobes along the blade
        cx, cy, cz = base[0] + sa * r, base[1] + h, base[2] + ca * r
        # Across the blade (horizontal, perpendicular to the path) and a small V-fold for the midrib.
        ax, az = ca, -sa
        verts += [(cx + ax * w, cy, cz + az * w), (cx, cy + thick + w * 0.15, cz),
                  (cx - ax * w, cy, cz - az * w), (cx, cy - thick, cz)]
    for i in range(sections):
        a, b = 4 * i, 4 * (i + 1)
        for j in range(4):
            n = (j + 1) % 4
            faces.append((a + j, a + n, b + n, b + j))
            mats.append(0 if j in (0, 1) else 1)
    faces.append((0, 1, 2, 3))
    mats.append(1)
    obj = k.add_mesh(parts, name, verts, faces, [m_top, m_under], mats, smooth=True)
    fix_normals(obj)
    return obj


def fern(parts, prefix, count, reach, rise, droop, width, seed, m_top, m_under, sections=7):
    rng = random.Random(seed)
    for i in range(count):
        a = 2 * math.pi * i / count + rng.uniform(-0.2, 0.2)
        frond(parts, f"{prefix}-{i}", a, reach * rng.uniform(0.85, 1.1), rise * rng.uniform(0.85, 1.15), droop, width, m_top, m_under,
              sections=sections, lobes=True)
    # Upright young fronds in the middle.
    for i in range(3):
        a = 2 * math.pi * i / 3 + 0.5
        frond(parts, f"{prefix}-young-{i}", a, reach * 0.3, rise * 1.3, 0.0, width * 0.5, m_top, m_under, sections=5)


def fern_a():
    top, under = k.mat("Fern", "#5FB877", 0.7), k.mat("Fern under", "#3E8E5A", 0.8)
    parts = []
    fern(parts, "frond", 7, 1.3, 1.1, 0.8, 0.36, 4, top, under)
    k.add_ellipsoid(parts, "crown", (0.35, 0.3, 0.35), (0, 0.1, 0), under, segments=8, rings=4)
    return parts, 600


def fern_b():
    top, under = k.mat("Fern", "#5FB877", 0.7), k.mat("Fern under", "#3E8E5A", 0.8)
    parts = []
    fern(parts, "frond", 5, 0.75, 0.7, 0.5, 0.24, 9, top, under, sections=6)
    return parts, 400


def cycad():
    bark, ring = k.mat("Cycad bark", "#7A5A3A", 0.9), k.mat("Cycad ring", "#946C44", 0.9)
    top, under = k.mat("Fern", "#5FB877", 0.7), k.mat("Fern under", "#3E8E5A", 0.8)
    parts = []
    # Stout trunk with four scaly bulges.
    rings_ = []
    for i in range(9):
        y = 4.1 * i / 8
        bulge = 0.06 if i % 2 else 0.0
        r = 0.46 - 0.12 * (i / 8) + bulge
        rings_.append((y, r, r, 0, 0))
    fix_normals(k.add_profiled_volume(parts, "trunk", rings_, bark, segments=10))
    for i in range(4):
        y0 = 0.5 + i * 0.95
        scale = k.add_profiled_volume(parts, f"scale-{i}", [(y0, 0.5 - i * 0.04, 0.5 - i * 0.04, 0, 0),
                                                    (y0 + 0.2, 0.53 - i * 0.04, 0.53 - i * 0.04, 0, 0),
                                                    (y0 + 0.32, 0.4 - i * 0.04, 0.4 - i * 0.04, 0, 0)], ring, segments=10)
        fix_normals(scale)
    rng = random.Random(21)
    for i in range(10):
        a = 2 * math.pi * i / 10 + rng.uniform(-0.1, 0.1)
        frond(parts, f"leaf-{i}", a, 1.55 * rng.uniform(0.9, 1.05), 0.75, 1.45, 0.24, top, under, sections=5, base=(0, 4.05, 0))
    k.add_ellipsoid(parts, "heart", (0.5, 0.4, 0.5), (0, 4.15, 0), under, segments=8, rings=4)
    return parts, 900


def cliff(name, height, grass_top=True):
    """Layered rock wall panel 12 m wide, 6 m deep; the rail side is +Z; the ends at x = ±6 are flat."""
    rock, band, grass = k.mat("Cliff", "#9A8B7A", 0.95), k.mat("Cliff band", "#B8A48E", 0.95), k.mat("Cliff grass", "#6CBF3F", 0.85)
    h = height
    # (z, y) profile from the back bottom, over the top, down the front face with ledges; material per edge.
    profile = [(-3.0, 0.0), (-3.0, h - 0.3), (-2.6, h), (1.2, h), (1.5, h - 0.25), (1.7, 0.78 * h), (2.2, 0.74 * h),
               (2.3, 0.5 * h), (2.7, 0.46 * h), (2.8, 0.22 * h), (3.0, 0.18 * h), (3.0, 0.0)]
    edge_mats = [0, 0, 2, 2, 0, 1, 0, 1, 0, 1, 0]  # rock / band / grass per profile edge
    cols = 13
    rng = random.Random(len(name) * 7 + int(h))
    jitter = [[0.0] * len(profile) for _ in range(cols)]
    for c in range(1, cols - 1):
        for p in range(3, len(profile) - 1):
            jitter[c][p] = rng.uniform(-0.28, 0.28)
    verts = []
    for c in range(cols):
        x = -6.0 + 12.0 * c / (cols - 1)
        for p, (z, y) in enumerate(profile):
            verts.append((x, y + (0.25 * jitter[c][p] if 0 < y < h else 0.0), z + jitter[c][p]))
    n = len(profile)
    faces, mats = [], []
    for c in range(cols - 1):
        for p in range(n - 1):
            a, b = c * n + p, (c + 1) * n + p
            faces.append((a, a + 1, b + 1, b))
            mats.append(edge_mats[p])
        a, b = c * n + n - 1, (c + 1) * n + n - 1
        faces.append((a, c * n, (c + 1) * n, b))  # bottom
        mats.append(0)
    faces.append(tuple(range(n)))
    mats.append(0)
    last = (cols - 1) * n
    faces.append(tuple(last + p for p in range(n - 1, -1, -1)))
    mats.append(0)
    parts = []
    obj = k.add_mesh(parts, "wall", verts, faces, [rock, band, grass], mats)
    fix_normals(obj)
    return parts


def cliff_a():
    return cliff("cliff-a", 10.0), 900


def cliff_b():
    parts = cliff("cliff-b", 14.0)
    top, under = k.mat("Fern", "#5FB877", 0.7), k.mat("Fern under", "#3E8E5A", 0.8)
    for i, (x, z) in enumerate(((-3.5, 0.2), (2.8, -0.6))):
        for j in range(4):
            frond(parts, f"top-fern-{i}-{j}", 2 * math.pi * j / 4 + i, 0.8, 0.6, 0.5, 0.18, top, under, sections=4, base=(x, 13.95, z))
    return parts, 1000


def faceted_rock(parts, name, size, center_y, m_side, m_top, seed, subdivisions=2):
    # bmesh counts the base icosahedron as 1: 2 = 80 faces, 3 = 320.
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=1.0)
    rng = random.Random(seed)
    for v in bm.verts:
        v.co *= 1.0 + rng.uniform(-0.12, 0.12)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    w, h, d = size
    obj.scale = (w / 2, d / 2, h / 2)
    obj.location = (0, 0, center_y)
    mesh.materials.append(m_side)
    mesh.materials.append(m_top)
    k.active(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for poly in mesh.polygons:
        poly.material_index = 1 if poly.normal.z > 0.55 else 0
    parts.append(obj)
    return obj


def cut_bottom(obj):
    k.active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bisect(plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def rock_a():
    parts = []
    obj = faceted_rock(parts, "rock", (2.0, 1.8, 1.8), 0.5, k.mat("Rock", "#8E8E8E", 0.9), k.mat("Rock top", "#A7A49D", 0.9), 5)
    cut_bottom(obj)
    return parts, 300


def rock_b():
    side, top = k.mat("Rock", "#8E8E8E", 0.9), k.mat("Rock top", "#A7A49D", 0.9)
    parts = []
    obj = faceted_rock(parts, "rock", (3.5, 3.0, 3.0), 0.9, side, top, 8)
    cut_bottom(obj)
    faceted_rock(parts, "pebble-1", (0.7, 0.5, 0.6), 2.35, side, top, 2, subdivisions=1)
    faceted_rock(parts, "pebble-2", (0.5, 0.4, 0.5), 2.3, side, top, 3, subdivisions=1)
    parts[-1].location = (0.6, 0.3, 0)
    parts[-2].location = (-0.3, -0.2, 0)
    return parts, 400


def boulder():
    # Ticket 0005 wanted the origin at the centre (it rolls); models keep it at the bottom (check-models),
    # and the game lifts it by its radius when it rolls.
    parts = []
    faceted_rock(parts, "boulder", (2.2, 2.2, 2.2), 1.1, k.mat("Boulder", "#A08C78", 0.9), k.mat("Boulder top", "#B39E88", 0.9), 13, 3)
    return parts, 400


def direction_sign():
    navy, rim, post = k.mat("Sign board", "#1F2A44", 0.6), k.mat("Sign rim", "#FFD166", 0.5), k.mat("Sign post", "#3A3F47", 0.7)
    parts = []
    k.add_box(parts, "post", (0.14, 2.3, 0.14), (0, 1.15, -0.1), post, bevel=0.03, segments=1)
    k.add_box(parts, "rim", (1.34, 0.92, 0.08), (0, 2.55, -0.02), rim, bevel=0.04, segments=1)
    k.add_box(parts, "board", (1.2, 0.78, 0.1), (0, 2.55, 0.0), navy, bevel=0.02, segments=1)
    k.add_box(parts, "cap", (0.22, 0.08, 0.22), (0, 3.0, -0.1), post)
    return parts, 500


def jump_unit():
    blue, yellow, dark = k.mat("Unit body", "#3FA7D6", 0.5), k.mat("Unit stripe", "#FFD166", 0.5), k.mat("Unit dark", "#3A3F47", 0.6)
    parts = []
    k.add_box(parts, "plate", (1.6, 0.12, 1.2), (0, 0.06, 0), dark, bevel=0.03, segments=1)
    k.add_box(parts, "body", (1.3, 0.28, 0.9), (0, 0.3, 0.05), blue, bevel=0.08, segments=2)
    k.add_box(parts, "stripe", (1.32, 0.08, 0.92), (0, 0.32, 0.05), yellow, bevel=0.02, segments=1)
    for side in (-1, 1):
        # A spring under each side and a nozzle pointing back.
        coil = []
        for i in range(15):
            a = i / 14 * 2 * math.pi * 2.5
            coil.append((side * 0.55 + math.cos(a) * 0.1, 0.12 + 0.3 * i / 14, 0.35 + math.sin(a) * 0.1))
        k.add_swept_tube(parts, f"spring-{side}", coil, [0.028] * len(coil), [yellow] * (len(coil) - 1), sides=5)
        k.add_tapered_segment(parts, f"nozzle-{side}", (side * 0.4, 0.32, -0.35), (side * 0.4, 0.32, -0.62), 0.12, 0.18, dark, vertices=10)
    return parts, 600


def lumpy_slab(name, size, m_side, m_top, seed, flat_top=0.55):
    """A squashed, slightly irregular stone cut flat at the bottom (glTF size w, h, d)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    rng = random.Random(seed)
    for v in bm.verts:
        v.co *= 1.0 + rng.uniform(-0.08, 0.08)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    w, h, d = size
    obj.scale = (w / 2, d / 2, h)  # blender: x, y (= -Z), z (= up); cut in half below
    mesh.materials.append(m_side)
    mesh.materials.append(m_top)
    k.active(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bisect(plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    for poly in mesh.polygons:
        poly.material_index = 1 if poly.normal.z > flat_top else 0
    return obj


def dino_egg():
    shell = k.mat("Egg shell", "#F4ECD6", 0.55)
    spot = k.mat("Egg spot", "#B9C98A", 0.6)
    twig = k.mat("Nest twig", "#8A6440", 0.9)
    straw = k.mat("Nest straw", "#C9A96A", 0.9)
    parts = []
    # Egg: a slightly pointed ellipsoid (narrower top half), standing in the nest.
    egg = k.add_ellipsoid(parts, "egg", (0.46, 0.66, 0.46), (0, 0.43, 0), shell, segments=20, rings=12)
    for v in egg.data.vertices:
        if v.co.z > 0:
            f = 1.0 - 0.18 * v.co.z
            v.co.x *= f
            v.co.y *= f
    # Soft green spots, as small flattened lumps on the shell.
    rng = random.Random(3)
    for i in range(7):
        a = rng.uniform(0, 2 * math.pi)
        y = rng.uniform(0.28, 0.62)
        r = 0.225 * math.sqrt(max(0.0, 1 - ((y - 0.43) / 0.33) ** 2)) * (1 - 0.18 * max(0.0, (y - 0.43) / 0.33))
        k.add_ellipsoid(parts, f"spot-{i}", (0.09, 0.08, 0.03), (math.sin(a) * r, y, math.cos(a) * r), spot, segments=8, rings=4)
        parts[-1].rotation_euler = (0, 0, -a)
    # Nest: a ring of twigs and a straw bed.
    ring = []
    for i in range(25):
        a = 2 * math.pi * i / 24
        ring.append((math.sin(a) * 0.36, 0.12 + 0.03 * math.sin(a * 5), math.cos(a) * 0.36))
    k.add_swept_tube(parts, "nest-ring", ring, [0.1] * len(ring), [twig] * (len(ring) - 1), sides=8)
    k.add_ellipsoid(parts, "straw", (0.8, 0.16, 0.8), (0, 0.08, 0), straw, segments=16, rings=6)
    # A few loose sticks lying across the rim.
    for i in range(5):
        a = 2 * math.pi * i / 5 + 0.3
        k.add_box(parts, f"stick-{i}", (0.045, 0.045, 0.34), (math.sin(a) * 0.4, 0.2, math.cos(a) * 0.4), twig)
        parts[-1].rotation_euler = (0.25, 0, a + math.pi / 2)
    return parts, 1600


def footprint_slab():
    side = k.mat("Slab side", "#8C8579", 0.9)
    top = k.mat("Slab top", "#B3AA98", 0.9)
    dent = k.mat("Footprint", "#5E5548", 0.95)
    parts = [lumpy_slab("slab", (3.0, 0.42, 2.4), side, top, seed=11)]
    # A three-toed print pressed into the top: heel pad plus three toes, each a flat dark lens.
    y = 0.41
    k.add_ellipsoid(parts, "heel", (0.62, 0.05, 0.56), (0.1, y, 0.35), dent, segments=14, rings=5)
    for i, ang in enumerate((-0.5, 0.0, 0.5)):
        length = 0.78 if i == 1 else 0.62
        cx = 0.1 + math.sin(ang) * (0.28 + length / 2)
        cz = 0.35 - math.cos(ang) * (0.28 + length / 2)
        toe = k.add_ellipsoid(parts, f"toe-{i}", (0.2, 0.05, length), (cx, y, cz), dent, segments=12, rings=5)
        toe.rotation_euler = (0, 0, -ang)  # long axis follows the toe direction
    return parts, 900


BUILDERS = {"fern-a": fern_a, "fern-b": fern_b, "cycad": cycad, "cliff-a": cliff_a, "cliff-b": cliff_b,
            "rock-a": rock_a, "rock-b": rock_b, "boulder": boulder, "direction-sign": direction_sign,
            "jump-unit": jump_unit, "dino-egg": dino_egg, "footprint-slab": footprint_slab}

names = [a for a in sys.argv[1:] if a in BUILDERS] or list(BUILDERS)
for name in names:
    k.reset()
    parts, budget = BUILDERS[name]()
    model = k.join(parts, name)
    k.smooth_by_angle(model, 30)
    k.normalize(model, None)
    k.export(model, name, budget, "world", 250)
