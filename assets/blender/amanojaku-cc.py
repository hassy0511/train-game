"""サカサ (amanojaku) — Claude Code version (compare with Codex's `amanojaku`).

Follows `assets/concepts/character-turnaround-c-sakasa.png`: slim lilac body, purple bob with flicks,
tall striped hat curling to the side with a pompom, cape with gold lining and trim that flares to a point
at the back, gold brooch and sash, purple wrist cuffs, purple boots with gold bands. Scaled to 1.40 m.
Run: python3 scripts/run-bpy.py assets/blender/amanojaku-cc.py
"""
from __future__ import annotations

from pathlib import Path
import math
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402  (imports bpy, which provides mathutils)
import bpy  # noqa: E402
import character_common as cc  # noqa: E402
from mathutils import Vector  # noqa: E402

NAME = "amanojaku-cc"
BUDGET = 8200
SKIN, HAIR, PURPLE, GOLD = "#B9A2E6", "#8F6FD0", "#5E3C99", "#F2B33D"


SASH = [(-0.072, 0.846), (-0.054, 0.798), (0.076, 0.816), (0.058, 0.864)]


def torso_paint(p: Vector, n: Vector) -> str:
    """Lilac body with the gold sash painted across the chest (front-facing points only)."""
    if n.z > 0.2 and p.z > 0.0:
        inside = True
        for (ax, ay), (bx, by) in zip(SASH, SASH[1:] + SASH[:1]):
            if (bx - ax) * (p.y - ay) - (by - ay) * (p.x - ax) < 0:
                inside = False
        if inside:
            return GOLD
    return SKIN


def boot_paint(p: Vector, n: Vector) -> str:
    z = p.z
    return GOLD if (0.020 < z < 0.058) or (0.108 < z < 0.146) else PURPLE


def catmull(points, samples):
    pts = [Vector(p) for p in points]
    out = []
    for i in range(len(pts) - 1):
        p0, p1, p2 = pts[max(i - 1, 0)], pts[i], pts[i + 1]
        p3 = pts[min(i + 2, len(pts) - 1)]
        for s in range(samples):
            t = s / samples
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
    out.append(pts[-1])
    return out


def build_hat(solids, purple, gold):
    spine = [(0, 1.105, -0.005), (0.0, 1.195, -0.010), (0.028, 1.275, -0.015), (0.085, 1.330, -0.018),
             (0.165, 1.352, -0.018), (0.238, 1.320, -0.014), (0.282, 1.250, -0.010), (0.296, 1.170, -0.006),
             (0.292, 1.098, -0.002)]
    radii = [0.168, 0.152, 0.128, 0.100, 0.076, 0.059, 0.046, 0.037, 0.031]
    path = catmull(spine, 3)
    rad = []
    for i in range(len(path)):
        t = i / (len(path) - 1) * (len(radii) - 1)
        a = min(int(t), len(radii) - 2)
        rad.append(radii[a] + (radii[a + 1] - radii[a]) * (t - a))
    # Stripes by arc length: a wide gold band at the brim, then alternating purple / gold.
    seg_mats, travelled = [], 0.0
    for a, b in zip(path, path[1:]):
        mid = travelled + (b - a).length / 2
        travelled += (b - a).length
        seg_mats.append(gold if mid < 0.055 else (purple if int((mid - 0.055) / 0.085) % 2 == 0 else gold))
    cc.add_swept_tube(solids, "hat", [tuple(p) for p in path], rad, seg_mats, 14)
    tip = path[-1]
    cc.add_ellipsoid(solids, "hat-pompom", (0.100, 0.100, 0.100), (tip.x, tip.y - 0.045, tip.z), gold, 16, 8)


def build_cape(solids, purple, gold):
    theta0, theta1, cols, rows = math.radians(72), math.radians(288), 26, 9
    verts, faces = [], []
    for r in range(rows + 1):
        v = r / (rows - 1 + 1)
        for c in range(cols + 1):
            th = theta0 + (theta1 - theta0) * c / cols
            back = max(0.0, -math.cos(th)) ** 1.6
            hem = 0.525 + (0.445 - 0.525) * back
            y = 0.905 + (hem - 0.905) * v
            ease = v ** 0.72
            rx = 0.104 + (0.250 - 0.104) * ease
            rz = 0.074 + (0.200 + 0.110 * back - 0.074) * ease
            verts.append((math.sin(th) * rx, y, math.cos(th) * rz))
    for r in range(rows):
        for c in range(cols):
            a = r * (cols + 1) + c
            b = a + cols + 1
            faces.append((a, a + 1, b + 1, b))
    cape = cc.add_mesh(solids, "cape", verts, faces, [purple, gold], smooth=True)
    k.active(cape)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    k.apply_modifier(cape, "SOLIDIFY", thickness=0.012, offset=-1.0, material_offset=1, material_offset_rim=1)
    k.set_smooth(cape)
    for c in (0, cols // 2, cols):
        x, y, z = verts[rows * (cols + 1) + c]
        cc.add_ellipsoid(solids, f"cape-pompom-{c}", (0.058, 0.058, 0.058), (x, y - 0.018, z), gold, 14, 7)


def main() -> None:
    k.reset()
    clay_mat = k.mat("clay", SKIN)
    clay: list = []

    def add(paint, fn, *args):
        parts: list = []
        fn(parts, *args)
        clay.extend((obj, paint) for obj in parts)

    E = cc.add_ellipsoid
    add(SKIN, E, "skull", (0.215, 0.215, 0.205), (0, 1.030, 0.0), clay_mat, 28, 14)
    add(SKIN, E, "jaw", (0.165, 0.120, 0.160), (0, 0.985, 0.022), clay_mat, 20, 10)
    add(SKIN, cc.add_tapered_segment, "neck", (0, 0.875, 0), (0, 0.955, 0), 0.029, 0.027, clay_mat, 14)
    add(torso_paint, cc.add_profiled_volume, "torso", [
        (0.585, 0.040, 0.035, 0, 0), (0.605, 0.066, 0.048, 0, 0), (0.650, 0.068, 0.050, 0, 0.002),
        (0.720, 0.058, 0.044, 0, 0.002), (0.790, 0.066, 0.046, 0, 0.002), (0.850, 0.080, 0.050, 0, 0),
        (0.885, 0.070, 0.045, 0, 0), (0.905, 0.035, 0.030, 0, 0)], clay_mat, 24)
    add(HAIR, E, "hair", (0.268, 0.172, 0.218), (0, 1.055, -0.030), clay_mat, 24, 12)
    for side in (-1, 1):
        s = side
        # Bob that flares outward into two soft pointed flicks per side.
        add(HAIR, E, f"bob-{side}", (0.130, 0.120, 0.170), (s * 0.090, 1.010, -0.030), clay_mat, 18, 9)
        for i, (a, b, r) in enumerate((((0.110, 1.020, -0.010), (0.222, 0.965, -0.010), 0.046),
                                       ((0.105, 0.985, -0.050), (0.200, 0.915, -0.060), 0.042))):
            add(HAIR, cc.add_tapered_segment, f"flick-{side}-{i}", (s * a[0], a[1], a[2]), (s * b[0], b[1], b[2]),
                r, 0.008, clay_mat, 14)
        add(SKIN, cc.add_swept_tube, f"arm-{side}",
            [(s * 0.050, 0.872, 0.0), (s * 0.082, 0.866, 0.0), (s * 0.180, 0.735, 0.012), (s * 0.255, 0.600, 0.022)],
            [0.030, 0.030, 0.023, 0.020], [clay_mat] * 3, 14)
        add(SKIN, E, f"shoulder-{side}", (0.062, 0.058, 0.056), (s * 0.080, 0.866, 0.0), clay_mat, 14, 7)
        add(PURPLE, cc.add_tapered_segment, f"cuff-{side}", (s * 0.233, 0.640, 0.018), (s * 0.262, 0.586, 0.024),
            0.038, 0.039, clay_mat, 16)
        palm = (s * 0.285, 0.535, 0.028)
        add(SKIN, E, f"palm-{side}", (0.074, 0.084, 0.036), palm, clay_mat, 16, 8)
        for i, dx in enumerate((-0.022, 0.0, 0.022)):
            fx = palm[0] + s * dx
            add(SKIN, cc.add_swept_tube, f"finger-{side}-{i}",
                [(fx, 0.528, 0.030), (fx + s * dx * 0.2, 0.490, 0.032), (fx + s * dx * 0.3, 0.470, 0.033)],
                [0.0135, 0.0125, 0.0115], [clay_mat] * 2, 10)
            add(SKIN, E, f"fingertip-{side}-{i}", (0.023, 0.022, 0.023), (fx + s * dx * 0.3, 0.470, 0.033),
                clay_mat, 10, 5)
        add(SKIN, cc.add_swept_tube, f"thumb-{side}", [(palm[0] - s * 0.030, 0.545, 0.036),
                                                        (palm[0] - s * 0.040, 0.508, 0.046)],
            [0.013, 0.011], [clay_mat], 10)
        add(SKIN, cc.add_swept_tube, f"leg-{side}",
            [(s * 0.045, 0.600, 0.0), (s * 0.075, 0.405, 0.010), (s * 0.092, 0.215, 0.0)],
            [0.036, 0.028, 0.026], [clay_mat] * 2, 16)
        add(SKIN, E, f"knee-{side}", (0.058, 0.058, 0.058), (s * 0.075, 0.405, 0.010), clay_mat, 12, 6)
        add(PURPLE, cc.add_tapered_segment, f"boot-cuff-{side}", (s * 0.092, 0.135, 0.0), (s * 0.092, 0.222, 0.0),
            0.060, 0.064, clay_mat, 18)
        add(boot_paint, E, f"boot-{side}", (0.150, 0.180, 0.290), (s * 0.094, 0.072, 0.040), clay_mat, 24, 12)
        add(boot_paint, E, f"boot-toe-{side}", (0.140, 0.140, 0.130), (s * 0.094, 0.062, 0.125), clay_mat, 18, 9)

    body = k.painted_clay(clay, NAME, voxel=0.0045, budget=4300, smooth=5)

    purple = k.mat("Sakasa purple", PURPLE, 0.6)
    gold = k.mat("Sakasa gold", GOLD, 0.45)
    solids: list = []
    build_hat(solids, purple, gold)
    build_cape(solids, purple, gold)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.074, minor_radius=0.030, major_segments=20, minor_segments=10,
                                     location=cc.to_blender((0, 0.902, -0.004)))
    collar = bpy.context.object
    collar.data.materials.append(purple)
    k.set_smooth(collar)
    solids.append(collar)
    cc.add_ellipsoid(solids, "hood", (0.170, 0.095, 0.105), (0, 0.935, -0.058), purple, 16, 8)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.026, minor_radius=0.0085, major_segments=14, minor_segments=6,
                                     location=cc.to_blender((0, 0.878, 0.106)), rotation=(math.pi / 2, 0, 0))
    brooch = bpy.context.object
    brooch.data.materials.append(gold)
    k.set_smooth(brooch)
    solids.append(brooch)

    # Face and sash decals.
    eye_gold = k.mat("Sakasa iris", "#F2C14E", 0.35)
    pupil = k.mat("Sakasa pupil", "#1B1224", 0.3)
    lid = k.mat("Sakasa lid", "#2A1B3D", 0.5)
    shine = k.mat("Sakasa shine", "#FFFDF4", 0.3)
    nose = k.mat("Sakasa nose", "#9A84C9", 0.6)
    mouth = k.mat("Sakasa mouth", "#4A2E6B", 0.6)
    decals: list = []
    z = 0.25
    for side in (-1, 1):
        cx, cy, w, h = side * 0.047, 1.040, 0.054, 0.036
        almond = [(cx + side * w / 2, cy + 0.006), (cx + side * w * 0.15, cy + h / 2), (cx - side * w * 0.25, cy + h * 0.42),
                  (cx - side * w / 2, cy - 0.002), (cx - side * w * 0.15, cy - h / 2), (cx + side * w * 0.25, cy - h * 0.40)]
        if side < 0:
            almond = list(reversed(almond))
        k.wrap_onto(k.poly_decal(decals, f"eye-{side}", almond, z, eye_gold, 3), body, 0.0015)
        k.wrap_onto(k.disc_decal(decals, f"pupil-{side}", (cx - side * 0.004, cy - 0.001, z), (0.015, 0.030), pupil,
                                 2, 14), body, 0.0026)
        k.wrap_onto(k.disc_decal(decals, f"shine-{side}", (cx - side * 0.008, cy + 0.008, z), (0.006, 0.007), shine,
                                 1, 8), body, 0.0036)
        lid_pts = [(cx - side * w * 0.52, cy - 0.001, z), (cx - side * w * 0.2, cy + h * 0.46, z),
                   (cx + side * w * 0.2, cy + h * 0.47, z), (cx + side * w * 0.55, cy + 0.009, z),
                   (cx + side * w * 0.70, cy + 0.016, z)]
        k.wrap_onto(k.ribbon_decal(decals, f"lid-{side}", lid_pts, 0.0065, lid), body, 0.0030)
    k.wrap_onto(k.poly_decal(decals, "nose", [(-0.008, 1.010), (0.008, 1.010), (0.0, 1.000)], z, nose, 2), body, 0.0015)
    k.wrap_onto(k.ribbon_decal(decals, "smile", k.arc_points((0.002, 0.978), 0.024, -0.008, z, 11, tilt=0.003),
                               0.0045, mouth), body, 0.0015)

    model = k.join([body, *solids, *decals], NAME)
    k.normalize(model, 1.40)
    k.export(model, NAME, BUDGET, "amanojaku")


main()
