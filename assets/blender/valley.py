"""Dinosaur valley (stage 1-2) — Claude Code.

Records: dino-egg (an egg in a twig nest), footprint-slab (a flat stone with a three-toed print).
Origin at the bottom centre, front +Z. Ticket 0005 adds the rest of the valley set here.
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


BUILDERS = {"dino-egg": dino_egg, "footprint-slab": footprint_slab}

names = [a for a in sys.argv[1:] if a in BUILDERS] or list(BUILDERS)
for name in names:
    k.reset()
    parts, budget = BUILDERS[name]()
    model = k.join(parts, name)
    k.smooth_by_angle(model, 30)
    k.normalize(model, None)
    k.export(model, name, budget, "world", 250)
