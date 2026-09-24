"""ワンダー号 lead car (`train-proto`, kept for the game's model name) — Claude Code.
Raked nose with a projected windscreen, headlight band, explorer lamp on the roof, cab interior.
Run: python3 scripts/run-bpy.py assets/blender/train-proto.py
"""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import bpy  # noqa: E402
import vehicle_common as v  # noqa: E402

k.reset()
m = v.mats()
parts: list = []
body_parts: list = []
body = v.loft(body_parts, "body", [
    v.section(-6.0), v.section(4.6), v.section(5.40, 0.985, 1.0, 0.10),
    v.section(5.82, 0.95, 0.985, 0.20), v.section(6.0, 0.88, 0.965, 0.26)], m)
parts += body_parts

# Windscreen and headlight band, pressed onto the nose from the front.
decals: list = []
cols, rows = 12, 6
verts, faces = [], []
for r in range(rows + 1):
    for c in range(cols + 1):
        verts.append((-1.12 + 2.24 * c / cols, 2.15 + 0.97 * r / rows, 7.0))
for r in range(rows):
    for c in range(cols):
        a = r * (cols + 1) + c
        faces.append((a, a + 1, a + cols + 2, a + cols + 1))
k.wrap_onto(k.add_mesh(decals, "windscreen", verts, faces, [m["glass"]]), body, 0.012)
k.wrap_onto(k.poly_decal(decals, "headlight", [(-0.85, 1.33), (0.85, 1.33), (0.85, 1.45), (-0.85, 1.45)], 7.0,
                         m["light"], 2), body, 0.012)
parts += decals

v.door(parts, m)
v.side_window(parts, m, 4.15, 0.70)
for z in (-4.8, -3.3, -1.75, 1.75, 3.05):
    v.side_window(parts, m, z, 1.05)
v.running_gear(parts, m, ends=(True, False))
v.roof_gear(parts, m, (-3.0, 0.8))

# Explorer lamp on the roof front (one lamp, not a face).
bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.20, depth=0.16,
                                    location=k.to_blender((0, 3.78, 4.55)), rotation=(1.5708, 0, 0))
lamp = bpy.context.object
lamp.data.materials.append(m["lamp"])
parts.append(lamp)
k.add_box(parts, "lamp-stand", (0.16, 0.22, 0.16), (0, 3.62, 4.45), m["dark"])
k.disc_decal(parts, "lamp-glow", (0, 3.78, 4.632), (0.26, 0.26), m["glow"], 1, 20)

# Cab interior, seen from the camera at (0, 2.4, 4.6) looking +Z. The front wall sits ~0.9 m ahead so the
# bottom of the view shows a dashboard band; the window hole is x ±1.12, y 2.15..3.12.
wall_z = 5.50
k.add_box(parts, "cab-wall-low", (2.80, 1.15, 0.05), (0, 1.575, wall_z), m["interior"])
k.add_box(parts, "cab-wall-top", (2.60, 0.18, 0.05), (0, 3.21, wall_z), m["interior"])
for s in (-1, 1):
    k.add_box(parts, f"cab-pillar-{s}", (0.28, 0.97, 0.05), (s * 1.26, 2.635, wall_z), m["interior"])
    k.add_box(parts, f"cab-side-{s}", (0.04, 2.25, 2.1), (s * 1.40, 2.175, 4.45), m["interior"])
k.add_box(parts, "cab-ceiling", (2.80, 0.04, 2.1), (0, 3.30, 4.45), m["interior"])
k.add_box(parts, "cab-floor", (2.80, 0.04, 2.1), (0, 1.04, 4.45), m["dash"])
k.add_box(parts, "dashboard", (2.6, 0.30, 0.34), (0, 2.00, 5.30), m["dash"], bevel=0.04)

v.finish(parts, "train-proto", 3200)
