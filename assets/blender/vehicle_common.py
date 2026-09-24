"""ワンダー号 car bodies (Claude Code): shared by `train-proto` (lead car with cab) and `car-proto`.

Contract with the game (src/train/params.ts, src/view/three/ThreeSceneView.ts):
- 12 m long (Z -6..+6), 3 m wide, 3.6 m tall; origin under the car centre at rail-top height; +Z forward.
- Bogies at Z = ±4.0 (gauge 1.5 m). The door animation is drawn at the car centre (Z = 0), so each side
  has its door there.
- Lead car: the cab camera sits at (0, 2.4, 4.6) looking +Z. Exterior faces point outward and are culled
  from inside, so the cab shows only the interior walls, dashboard and the view through the window hole.
- No face on the train: one wide headlight band and a single explorer lamp on the roof (like ピコ's).
"""
from __future__ import annotations

import math

import cc_common as k

BLUE, DOOR, CREAM, STRIPE = "#3E9BD6", "#3183BA", "#F3EFE4", "#FFC93C"
DARK, GLASS, FRAME, WHEEL, HUB = "#3A3F47", "#1F2A44", "#E6ECF0", "#2E3238", "#AEB6BE"
INTERIOR, DASH, LAMP, LAMP_GLOW, LIGHT = "#44505E", "#23272B", "#F59E1B", "#FFF3C4", "#FFE9A0"

# Body cross-section (x, y), counter-clockwise seen from +Z. Extra rows at 1.30 / 1.46 / 1.55 / 1.72 / 2.0
# let the stripe and bands be coloured per face.
OUTLINE = [(-1.5, 1.0), (1.5, 1.0), (1.5, 1.30), (1.5, 1.46), (1.5, 1.55), (1.5, 1.72), (1.5, 2.0), (1.5, 3.1),
           (1.44, 3.33), (1.25, 3.48), (0.7, 3.57), (0.0, 3.6), (-0.7, 3.57), (-1.25, 3.48), (-1.44, 3.33),
           (-1.5, 3.1), (-1.5, 2.0), (-1.5, 1.72), (-1.5, 1.55), (-1.5, 1.46), (-1.5, 1.30)]


def mats() -> dict:
    return {name: k.mat(f"Wonder {name}", hex_, rough) for name, hex_, rough in (
        ("blue", BLUE, 0.45), ("door", DOOR, 0.45), ("cream", CREAM, 0.55), ("stripe", STRIPE, 0.45),
        ("dark", DARK, 0.7), ("glass", GLASS, 0.2), ("frame", FRAME, 0.5), ("wheel", WHEEL, 0.6),
        ("hub", HUB, 0.35), ("roof", "#7D8792", 0.6), ("interior", INTERIOR, 0.8), ("dash", DASH, 0.6), ("lamp", LAMP, 0.4),
        ("glow", LAMP_GLOW, 0.3), ("light", LIGHT, 0.3))}


def body_colour(c, n) -> int:
    """Material index into [blue, cream, stripe, dark] by face centre height."""
    if n.y < -0.5:
        return 3
    if c.y > 3.1:
        return 1
    if 1.55 < c.y < 1.72:
        return 2
    return 0


def section(z, sx=1.0, sy=1.0, rake=0.0):
    """Outline at z, scaled around the car centre line and floor, with the upper part pulled back by
    `rake` metres per metre above y=2.0 (raked windscreen)."""
    return [(x * sx, 1.0 + (y - 1.0) * sy, z - max(0.0, y - 2.0) * rake) for x, y in OUTLINE]


def loft(parts, name, rings, m):
    """Loft of per-vertex (x, y, z) rings (same count), capped at both ends, coloured by body_colour."""
    n = len(rings[0])
    verts = [v for ring in rings for v in ring]
    faces = [tuple(range(n - 1, -1, -1))]
    for i in range(len(rings) - 1):
        a, b = i * n, (i + 1) * n
        for j in range(n):
            faces.append((a + j, a + (j + 1) % n, b + (j + 1) % n, b + j))
    faces.append(tuple((len(rings) - 1) * n + j for j in range(n)))
    obj = k.add_mesh(parts, name, verts, faces, [m["blue"], m["cream"], m["stripe"], m["dark"]])
    from mathutils import Vector
    for polygon in obj.data.polygons:
        c, nrm = polygon.center, polygon.normal
        polygon.material_index = body_colour(Vector((c.x, c.z, -c.y)), Vector((nrm.x, nrm.z, -nrm.y)))
    return obj


def side_window(parts, m, z, width, y0=2.05, y1=3.0):
    for s in (-1, 1):
        k.add_box(parts, f"frame-{s}-{z}", (0.010, y1 - y0 + 0.10, width + 0.10), (s * 1.503, (y0 + y1) / 2, z), m["frame"])
        k.add_box(parts, f"glass-{s}-{z}", (0.012, y1 - y0, width), (s * 1.509, (y0 + y1) / 2, z), m["glass"])


def door(parts, m, z=0.0):
    for s in (-1, 1):
        k.add_box(parts, f"door-{s}", (0.012, 2.05, 1.30), (s * 1.506, 2.075, z), m["door"])
        k.add_box(parts, f"door-glass-{s}", (0.014, 0.75, 0.62), (s * 1.511, 2.62, z), m["glass"])
        k.add_box(parts, f"door-seam-{s}", (0.016, 1.95, 0.025), (s * 1.512, 2.075, z), m["dark"])


def running_gear(parts, m, ends=(True, True)):
    k.add_box(parts, "underframe", (2.5, 0.55, 11.0), (0, 0.725, 0), m["dark"], bevel=0.04)
    for bz in (-4.0, 4.0):
        k.add_box(parts, f"bogie-{bz}", (2.1, 0.32, 2.6), (0, 0.52, bz), m["dark"], bevel=0.05)
        for dz in (-0.75, 0.75):
            for s in (-1, 1):
                x = s * 0.75
                k.add_tapered_segment(parts, f"wheel-{bz}-{dz}-{s}", (x - 0.09 * s, 0.45, bz + dz),
                                      (x + 0.09 * s, 0.45, bz + dz), 0.45, 0.45, m["wheel"], 14, False)
                k.add_tapered_segment(parts, f"hub-{bz}-{dz}-{s}", (x + 0.09 * s, 0.45, bz + dz),
                                      (x + 0.13 * s, 0.45, bz + dz), 0.16, 0.12, m["hub"], 10, False)
    for end, present in zip((-1, 1), ends):
        if present:
            k.add_box(parts, f"coupler-{end}", (0.28, 0.22, 0.30), (0, 0.95, end * 6.1), m["dark"], bevel=0.03)
            k.add_box(parts, f"gangway-{end}", (1.25, 2.25, 0.22), (0, 2.25, end * 6.1), m["dark"], bevel=0.05)


def roof_gear(parts, m, zs=(-2.2, 2.2)):
    for z in zs:
        k.add_box(parts, f"roof-box-{z}", (0.80, 0.20, 1.2), (0, 3.64, z), m["roof"], bevel=0.05)


def finish(parts, name: str, budget: int) -> None:
    model = k.join(parts, name)
    k.smooth_by_angle(model, 34)
    k.normalize(model, None, center=False)
    k.export(model, name, budget, "world", 250)
