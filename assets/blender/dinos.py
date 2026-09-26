"""Dinosaur valley residents (stage 1-2) — Claude Code. Creatures of ticket 0005.

dino-mid-sleep / dino-mid-stand: a round, periwinkle plant-eater with soft peach back plates (asleep curled
on the rail; awake on four legs, tail up). dino-small-walk: a big-headed young one mid-step.
dino-large-body + dino-large-neck: a long-necked giant standing astride the rail — the belly is 5.7 m up and
the legs stand more than 5 m apart so the train passes underneath; the neck is a separate model whose
origin is the joint (NECK_PIVOT in src/view/three/actors.ts) and the game swings it down over the rail.
ptero: a gliding flyer for the flock overhead. ptero-far: the same flyer for flocks seen from 40 m and more —
a few hundred triangles of plain body and wing colours, no texture, built from the same volumes.
Friendly on purpose: no teeth or claws, closed or sleepy eyes, round shapes. Faces look +Z.
Run: python3 scripts/run-bpy.py assets/blender/dinos.py [-- name ...]
"""
from __future__ import annotations

from pathlib import Path
import math
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import bpy  # noqa: E402
import bmesh  # noqa: E402

E = k.add_ellipsoid
T = k.add_swept_tube

LINE = "#2A2438"


class Clay:
    """Collects (volume, paint) pairs for k.painted_clay."""

    def __init__(self) -> None:
        self.mat = k.mat("clay", "#CCCCCC")
        self.parts: list = []

    def add(self, paint, fn, *args, **kwargs):
        made: list = []
        obj = fn(made, *args, **kwargs)
        self.parts.extend((o, paint) for o in made)
        return obj


def eyes(body, centers, z, size, asleep, heavy=False):
    """Closed arcs, or dark eyes with a shine (heavy = sleepy half lids), projected back onto `body`."""
    ink = k.mat("Dino eye", "#1F2A44", 0.4)
    shine = k.mat("Dino eye shine", "#FFFDF4", 0.3)
    lid = k.mat("Dino lid line", LINE, 0.5)
    decals: list = []
    w, h = size
    for i, (x, y) in enumerate(centers):
        if asleep:
            k.wrap_onto(k.ribbon_decal(decals, f"closed-{i}", k.arc_points((x, y), w * 0.55, -h * 0.28, z, 11), w * 0.14, lid),
                        body, w * 0.03)
            continue
        k.wrap_onto(k.disc_decal(decals, f"eye-{i}", (x, y, z), (w, h), ink), body, w * 0.03)
        k.wrap_onto(k.disc_decal(decals, f"shine-{i}", (x + w * 0.18, y + h * 0.2, z), (w * 0.3, h * 0.3), shine, 1, 10), body, w * 0.06)
        if heavy:
            k.wrap_onto(k.ribbon_decal(decals, f"lid-{i}", k.arc_points((x, y + h * 0.12), w * 0.62, h * 0.18, z, 11), w * 0.16, lid),
                        body, w * 0.08)
    return decals


def smile(body, center, half, bend, z, width):
    line = k.mat("Dino mouth", LINE, 0.6)
    decals: list = []
    k.wrap_onto(k.ribbon_decal(decals, "smile", k.arc_points(center, half, bend, z, 11), width, line), body, width * 0.2)
    return decals


# ------------------------------------------------------------------ middle-sized plant-eater

MID, MID_BELLY, MID_PLATE, BUBBLE = "#8E9BD6", "#F4EEDC", "#F2B880", "#DDF1FF"


def mid_body_paint(p, n):
    if n.y < -0.35 or p.y < 0.28:
        return MID_BELLY
    return MID


def mid_common(clay: Clay, lift: float, head, tail, standing: bool):
    m = clay.mat
    clay.add(mid_body_paint, E, "body", (2.5, 1.55, 3.7), (0, 0.78 + lift, -0.2), m, 28, 14)
    clay.add(mid_body_paint, E, "shoulders", (2.1, 1.3, 1.6), (0, 0.8 + lift, 1.3), m, 22, 11)
    clay.add(MID, E, "head", (1.15, 0.9, 1.25), head, m, 22, 11)
    hx, hy, hz = head
    clay.add(MID_BELLY, E, "snout", (0.85, 0.6, 0.75), (hx, hy - 0.12, hz + 0.55), m, 18, 9)
    clay.add(MID, E, "neck", (1.1, 0.9, 1.0), ((hx) * 0.5, (hy + 0.9 + lift) * 0.5, (hz + 1.3) * 0.5 + 0.3), m, 18, 9)
    # Soft, rounded back plates along the spine (not spikes).
    for i, (z, s) in enumerate(((1.25, 0.42), (0.55, 0.55), (-0.2, 0.6), (-0.95, 0.5), (-1.6, 0.36))):
        top = 0.78 + lift + 0.72 * math.sqrt(max(0.0, 1 - ((z + 0.2) / 1.9) ** 2)) + 0.05
        clay.add(MID_PLATE, E, f"plate-{i}", (0.16, s * 1.3, s * 1.2), (0, top + s * 0.35, z), m, 14, 7)
    radii = [0.55, 0.45, 0.32, 0.2, 0.12][: len(tail)]
    clay.add(mid_body_paint, T, "tail", tail, radii, [m] * (len(tail) - 1), 14)
    clay.add(MID, E, "tail-tip", (radii[-1] * 2.2,) * 3, tail[-1], m, 12, 6)


def dino_mid_sleep():
    clay = Clay()
    head = (0.25, 0.46, 2.05)
    tail = [(0, 0.55, -1.8), (0.7, 0.4, -2.55), (1.55, 0.3, -2.3), (2.0, 0.22, -1.5), (2.0, 0.18, -0.8)]
    mid_common(clay, 0.0, head, tail, standing=False)
    m = clay.mat
    for side in (-1, 1):  # legs tucked under
        clay.add(MID, E, f"front-leg-{side}", (0.6, 0.5, 0.9), (side * 1.05, 0.25, 1.1), m, 14, 7)
        clay.add(MID, E, f"rear-leg-{side}", (0.7, 0.55, 1.0), (side * 1.1, 0.27, -1.2), m, 14, 7)
    bubble_parts: list = []
    E(bubble_parts, "bubble", (0.34, 0.34, 0.34), (0.4, 1.0, 2.95), m, 14, 7)
    clay.parts.append((bubble_parts[0], BUBBLE))
    body = k.painted_clay(clay.parts, "dino-mid-sleep", voxel=0.035, budget=5000, smooth=6)
    decals = eyes(body, [(0.02, 0.72), (0.5, 0.72)], 3.4, (0.26, 0.2), asleep=True)
    decals += smile(body, (0.25, 0.28), 0.14, -0.05, 3.4, 0.045)
    return [body, *decals], 6000


def dino_mid_stand():
    clay = Clay()
    lift = 0.75
    head = (0, 2.2, 2.5)
    tail = [(0, 1.45, -1.9), (0, 1.7, -2.75), (0, 2.1, -3.25), (0, 2.45, -3.4)]
    mid_common(clay, lift, head, tail, standing=True)
    m = clay.mat
    for side in (-1, 1):
        for z, r in ((1.2, 0.44), (-1.1, 0.5)):
            clay.add(MID, T, f"leg-{side}-{z}", [(side * 0.85, 1.25, z), (side * 0.9, 0.65, z), (side * 0.9, 0.12, z + 0.05)],
                     [r, r * 0.9, r * 0.95], [m] * 2, 14)
            clay.add(MID_BELLY, E, f"foot-{side}-{z}", (r * 2.5, 0.28, r * 2.8), (side * 0.9, 0.12, z + 0.12), m, 14, 7)
    body = k.painted_clay(clay.parts, "dino-mid-stand", voxel=0.035, budget=5800, smooth=6)
    decals = eyes(body, [(-0.24, 2.45), (0.24, 2.45)], 3.8, (0.2, 0.24), asleep=False)
    decals += smile(body, (0, 1.95), 0.16, -0.06, 3.8, 0.045)
    return [body, *decals], 7000


# ------------------------------------------------------------------ young one

SMALL, SMALL_BELLY = "#7FC8A9", "#F4EEDC"


def small_paint(p, n):
    return SMALL_BELLY if (n.z > 0.45 and p.y < 0.95 and abs(p.x) < 0.2) else SMALL


def dino_small_walk():
    clay = Clay()
    m = clay.mat
    clay.add(small_paint, E, "body", (0.62, 0.72, 0.78), (0, 0.66, -0.05), m, 22, 11)
    clay.add(SMALL, E, "head", (0.7, 0.62, 0.72), (0, 1.12, 0.22), m, 22, 11)
    clay.add(SMALL_BELLY, E, "snout", (0.46, 0.34, 0.38), (0, 1.02, 0.52), m, 16, 8)
    clay.add(SMALL, T, "tail", [(0, 0.6, -0.35), (0, 0.5, -0.75), (0, 0.44, -1.1)], [0.2, 0.13, 0.05], [m] * 2, 12)
    for side in (-1, 1):
        clay.add(SMALL, E, f"arm-{side}", (0.12, 0.22, 0.14), (side * 0.27, 0.78, 0.25), m, 10, 5)
        raised = side > 0
        knee = (side * 0.17, 0.36 if not raised else 0.44, 0.02 if not raised else 0.18)
        foot = (side * 0.17, 0.07 if not raised else 0.24, 0.12 if not raised else 0.3)
        clay.add(SMALL, T, f"leg-{side}", [(side * 0.17, 0.55, -0.05), knee, foot], [0.13, 0.11, 0.1], [m] * 2, 12)
        clay.add(SMALL_BELLY, E, f"foot-{side}", (0.2, 0.12, 0.28), (foot[0], foot[1] - 0.02, foot[2] + 0.06), m, 12, 6)
    body = k.painted_clay(clay.parts, "dino-small-walk", voxel=0.011, budget=4200, smooth=5)
    decals = eyes(body, [(-0.15, 1.22), (0.15, 1.22)], 0.8, (0.12, 0.15), asleep=False)
    decals += smile(body, (0, 1.0), 0.08, -0.03, 0.8, 0.022)
    return [body, *decals], 5000


# ------------------------------------------------------------------ the giant

LARGE, LARGE_BELLY = "#B8A46A", "#F4EEDC"
NECK_PIVOT = (0.0, 8.0, 4.8)  # keep in sync with src/view/three/actors.ts


def large_paint(p, n):
    return LARGE_BELLY if n.y < -0.5 else LARGE


def dino_large_body():
    clay = Clay()
    m = clay.mat
    # Belly bottom at 5.8 m, legs 5.2 m apart on the inside: the train (3 m wide, 4.5 m with the jump unit) fits under.
    clay.add(large_paint, E, "body", (6.4, 4.4, 11.0), (0, 8.0, 0), m, 28, 14)
    clay.add(LARGE, E, "shoulder", (3.8, 3.4, 3.6), NECK_PIVOT, m, 22, 11)
    clay.add(LARGE, T, "tail", [(0, 8.4, -4.8), (0, 7.8, -7.5), (0, 6.2, -10.0), (0, 4.6, -11.6), (0, 3.9, -12.2)],
             [1.8, 1.3, 0.8, 0.42, 0.2], [m] * 4, 16)
    clay.add(LARGE, E, "tail-tip", (0.45, 0.45, 0.45), (0, 3.9, -12.2), m, 10, 5)
    for side in (-1, 1):
        for z in (3.0, -3.0):
            clay.add(LARGE, T, f"leg-{side}-{z}", [(side * 2.6, 7.6, z), (side * 3.4, 4.0, z), (side * 3.7, 0.5, z)],
                     [1.35, 1.15, 1.1], [m] * 2, 16)
            clay.add(LARGE_BELLY, E, f"foot-{side}-{z}", (2.5, 0.9, 2.7), (side * 3.75, 0.4, z + 0.25), m, 16, 8)
    body = k.painted_clay(clay.parts, "dino-large-body", voxel=0.07, budget=5600, smooth=6)
    return [body], 6000


def dino_large_neck():
    clay = Clay()
    m = clay.mat
    path = [(0, -0.6, -0.6), (0, 0.0, 0.0), (0, 1.6, 1.0), (0, 3.1, 2.3), (0, 4.0, 3.9)]
    clay.add(large_paint, T, "neck", path, [1.05, 0.95, 0.7, 0.55, 0.48], [m] * 4, 16)
    clay.add(LARGE, E, "nape", (1.05, 1.05, 1.1), (0, 4.05, 4.05), m, 16, 8)
    clay.add(LARGE, E, "head", (1.6, 1.3, 2.0), (0, 4.35, 4.85), m, 20, 10)
    clay.add(LARGE_BELLY, E, "snout", (1.25, 0.85, 1.1), (0, 4.15, 5.65), m, 18, 9)
    body = k.painted_clay(clay.parts, "dino-large-neck", voxel=0.04, budget=2500, ground=False, smooth=6)
    decals = eyes(body, [(-0.42, 4.7), (0.42, 4.7)], 6.8, (0.28, 0.3), asleep=False, heavy=True)
    decals += smile(body, (0, 3.95), 0.24, -0.07, 6.8, 0.06)
    return [body, *decals], 3000


# ------------------------------------------------------------------ flyer

PTERO, WING = "#E0A458", "#F4D6A0"
# Shared by ptero and ptero-far so the far flyer keeps the same silhouette: (name, colour, size, centre).
PTERO_PARTS = (("body", PTERO, (0.45, 0.4, 1.1), (0, 0.5, 0)), ("head", PTERO, (0.36, 0.34, 0.5), (0, 0.62, 0.62)),
               ("beak", WING, (0.16, 0.14, 0.55), (0, 0.58, 1.0)), ("crest", PTERO, (0.08, 0.3, 0.45), (0, 0.78, 0.38)))
# Right wing: the leading-edge bone (points, radii), then membranes (reach, back) of 0.9 x 0.06 x 0.7, 0.6 + 0.04 j high.
WING_PATH = [(0.15, 0.55, 0.15), (0.9, 0.62, 0.05), (1.6, 0.7, -0.25), (1.95, 0.72, -0.55)]
WING_RADII = [0.09, 0.08, 0.06, 0.03]
MEMBRANES = ((0.9, -0.35), (1.4, -0.5))


def ptero():
    clay = Clay()
    m = clay.mat
    for (name, paint, size, center), (segments, rings) in zip(PTERO_PARTS, ((16, 8), (14, 7), (10, 5), (10, 5))):
        clay.add(paint, E, name, size, center, m, segments, rings)
    for side in (-1, 1):
        # Wing: a thin soft membrane sweeping out and back, thick enough to be a closed volume.
        clay.add(WING, T, f"wing-{side}", [(side * x, y, z) for x, y, z in WING_PATH], WING_RADII, [m] * 3, 10)
        for j, (reach, back) in enumerate(MEMBRANES):
            clay.add(WING, E, f"membrane-{side}-{j}", (0.9, 0.06, 0.7), (side * reach, 0.6 + 0.04 * j, back), m, 12, 4)
    body = k.painted_clay(clay.parts, "ptero", voxel=0.012, budget=2200, ground=False, smooth=3)
    return [body], 2500


def outward(obj):
    """Wind every face of a closed part outward (the game draws front faces only)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def spindle(parts, name, size, center, mat, segments, rings, phase=0.0):
    """Low-poly ellipsoid with its poles on the Z axis, so a long part keeps its exact tip."""
    w, h, d = size
    cx, cy, cz = center
    verts = [(cx, cy, cz - d / 2)]
    for r in range(1, rings + 1):
        lat = math.pi * r / (rings + 1)
        for i in range(segments):
            a = phase + 2 * math.pi * i / segments
            verts.append((cx + math.cos(a) * math.sin(lat) * w / 2, cy + math.sin(a) * math.sin(lat) * h / 2,
                          cz - math.cos(lat) * d / 2))
    verts.append((cx, cy, cz + d / 2))
    tip = len(verts) - 1
    faces = [(0, 1 + (i + 1) % segments, 1 + i) for i in range(segments)]
    for r in range(rings - 1):
        a, b = 1 + r * segments, 1 + (r + 1) * segments
        faces += [(a + i, a + (i + 1) % segments, b + (i + 1) % segments, b + i) for i in range(segments)]
    last = 1 + (rings - 1) * segments
    faces += [(last + i, last + (i + 1) % segments, tip) for i in range(segments)]
    obj = k.add_mesh(parts, name, verts, faces, [mat], smooth=True)
    outward(obj)
    return obj


def wing_section(x):
    """Right-wing cross-section at span x: the bone's front, top, the trailing edge (top, bottom) and bottom."""
    i = max(0, min(len(WING_PATH) - 2, next((j for j in range(len(WING_PATH) - 1) if x <= WING_PATH[j + 1][0]), len(WING_PATH) - 2)))
    (x0, y0, z0), (x1, y1, z1) = WING_PATH[i], WING_PATH[i + 1]
    t = max(0.0, min(1.0, (x - x0) / (x1 - x0)))
    y, z, r = y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, WING_RADII[i] + (WING_RADII[i + 1] - WING_RADII[i]) * t
    trail, trail_y, half = z - r * 1.2, y, r * 0.6
    for j, (reach, back) in enumerate(MEMBRANES):
        u = (x - reach) / 0.45
        if abs(u) < 1 and back - 0.35 * math.sqrt(1 - u * u) < trail:
            trail, trail_y, half = back - 0.35 * math.sqrt(1 - u * u), 0.6 + 0.04 * j, 0.025
    return [(x, y, z + r), (x, y + r, z), (x, trail_y + half, trail), (x, trail_y - half, trail), (x, y - r, z)]


def wing_slab(parts, name, side, spans, mat):
    """The bone and its membranes as one thin closed slab lofted along the span (root inside the body)."""
    sections = [wing_section(x) for x in spans]
    n = len(sections[0])
    verts = [(side * x, y, z) for section in sections for x, y, z in section]
    faces = [tuple(range(n - 1, -1, -1))]
    for s in range(len(sections) - 1):
        a, b = s * n, (s + 1) * n
        faces += [(a + j, a + (j + 1) % n, b + (j + 1) % n, b + j) for j in range(n)]
    faces.append(tuple((len(sections) - 1) * n + j for j in range(n)))
    obj = k.add_mesh(parts, name, verts, faces, [mat])
    outward(obj)
    k.smooth_by_angle(obj, 40)
    return obj


def ptero_far():
    body = k.mat("Ptero far body", PTERO)
    wing = k.mat("Ptero far wing", WING)
    parts: list = []
    detail = {"body": (12, 5, 0.0), "head": (8, 3, 0.0), "beak": (6, 3, math.pi / 2), "crest": (4, 3, math.pi / 2)}
    for name, paint, size, center in PTERO_PARTS:
        spindle(parts, name, size, center, wing if paint == WING else body, *detail[name])
    for side in (-1, 1):
        wing_slab(parts, f"wing-{side}", side, (0.08, 0.3, 0.6, 0.9, 1.4, 1.72, 1.86, 1.95), wing)
    return parts, 400


BUILDERS = {"dino-mid-sleep": dino_mid_sleep, "dino-mid-stand": dino_mid_stand, "dino-small-walk": dino_small_walk,
            "dino-large-body": dino_large_body, "dino-large-neck": dino_large_neck, "ptero": ptero,
            "ptero-far": ptero_far}

names = [a for a in sys.argv[1:] if a in BUILDERS] or list(BUILDERS)
for name in names:
    k.reset()
    parts, budget = BUILDERS[name]()
    model = k.join(parts, name) if len(parts) > 1 else parts[0]
    if name == "dino-large-neck":
        # Keep the joint at the origin (the game rotates the neck about it); only name and export.
        k.export(model, name, budget, "character")
        continue
    k.normalize(model, None, center=name != "dino-large-body")
    k.export(model, name, budget, "character")
