"""たんけんたいの なかま (passenger) — Claude Code.

Follows `assets/concepts/character-turnaround-c-passenger.png`: brown bob, puffy blue cap with a small
team lamp (same yellow as ピコ's), blue A-line coat with gold buttons and turned-up cuffs, white shirt
collar, grey shorts, navy socks, brown shoes. 1.35 m tall.

Every colour is its own flat material (no texture), because the game tints the material whose name
contains "coat" to vary passengers (src/view/three/actors.ts).
Run: python3 scripts/run-bpy.py assets/blender/passenger.py
"""
from __future__ import annotations

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import bpy  # noqa: E402

NAME = "passenger"
BUDGET = 8200
VOXEL = 0.005


def group(fn_calls) -> list:
    parts: list = []
    for fn, *args in fn_calls:
        fn(parts, *args)
    return parts


def main() -> None:
    k.reset()
    skin = k.mat("Passenger skin", "#F2C29A", 0.7)
    hair = k.mat("Passenger hair", "#7A4E2D", 0.7)
    cap = k.mat("Passenger cap", "#2F57A8", 0.65)
    coat = k.mat("Passenger coat", "#2F57A8", 0.65)
    shorts = k.mat("Passenger shorts", "#5A5A5E", 0.75)
    socks = k.mat("Passenger socks", "#2B3550", 0.75)
    shoes = k.mat("Passenger shoes", "#7A4A2A", 0.6)
    gold = k.mat("Passenger buttons", "#E8A93A", 0.4)
    E, T, S, P = k.add_ellipsoid, k.add_tapered_segment, k.add_swept_tube, k.add_profiled_volume

    skin_parts = group([
        (E, "head", (0.250, 0.260, 0.240), (0, 1.080, 0.0), skin, 28, 14),
        (E, "cheeks", (0.230, 0.150, 0.200), (0, 1.040, 0.020), skin, 20, 10),
        (T, "neck", (0, 0.900, 0), (0, 0.990, 0), 0.042, 0.040, skin, 14),
    ])
    for s in (-1, 1):
        palm = (s * 0.215, 0.515, 0.012)
        skin_parts += group([(E, f"palm-{s}", (0.072, 0.092, 0.042), palm, skin, 16, 8)])
        for i, dx in enumerate((-0.021, 0.0, 0.021)):
            fx = palm[0] + s * dx
            skin_parts += group([
                (S, f"finger-{s}-{i}", [(fx, 0.505, 0.014), (fx + s * dx * 0.2, 0.462, 0.016)], [0.0135, 0.0125], [skin], 10),
                (E, f"tip-{s}-{i}", (0.024, 0.024, 0.024), (fx + s * dx * 0.2, 0.462, 0.016), skin, 10, 5),
            ])
        skin_parts += group([(S, f"thumb-{s}", [(palm[0] - s * 0.030, 0.525, 0.020), (palm[0] - s * 0.040, 0.490, 0.032)],
                              [0.013, 0.012], [skin], 10)])
    body = k.flat_clay(skin_parts, "skin", skin, VOXEL, 1300)

    hair_parts = group([
        (E, "bob", (0.315, 0.245, 0.270), (0, 1.108, -0.048), hair, 24, 12),
        (E, "fringe", (0.215, 0.050, 0.070), (0, 1.192, 0.090), hair, 18, 9),
    ])
    for s in (-1, 1):
        hair_parts += group([
            (E, f"side-{s}", (0.095, 0.170, 0.160), (s * 0.142, 1.035, -0.040), hair, 16, 8),
            (T, f"tip-{s}", (s * 0.150, 1.000, -0.012), (s * 0.188, 0.955, -0.006), 0.038, 0.008, hair, 12),
            (T, f"tip-back-{s}", (s * 0.120, 1.000, -0.080), (s * 0.150, 0.950, -0.100), 0.045, 0.010, hair, 12),
        ])
    hair_clay = k.flat_clay(hair_parts, "hair", hair, VOXEL, 1100)

    cap_parts = group([
        (E, "crown", (0.370, 0.150, 0.345), (0, 1.285, -0.010), cap, 24, 12),
        (T, "band", (0, 1.197, -0.004), (0, 1.252, -0.004), 0.140, 0.150, cap, 24),
        (E, "brim", (0.230, 0.022, 0.160), (0, 1.207, 0.125), cap, 20, 6),
    ])
    cap_clay = k.flat_clay(cap_parts, "cap", cap, VOXEL, 800)

    coat_parts = group([
        (P, "coat", [(0.370, 0.205, 0.130, 0, 0.0), (0.450, 0.190, 0.122, 0, 0.0), (0.600, 0.162, 0.108, 0, 0.004),
                     (0.750, 0.146, 0.098, 0, 0.006), (0.860, 0.152, 0.096, 0, 0.004), (0.920, 0.132, 0.086, 0, 0.0),
                     (0.955, 0.070, 0.060, 0, 0.0)], coat, 28),
        (T, "collar", (0, 0.905, 0), (0, 0.965, 0), 0.080, 0.062, coat, 18),
    ])
    for s in (-1, 1):
        coat_parts += group([
            (S, f"sleeve-{s}", [(s * 0.120, 0.915, 0.0), (s * 0.165, 0.800, 0.004), (s * 0.198, 0.620, 0.010)],
             [0.058, 0.052, 0.048], [coat] * 2, 16),
            (T, f"cuff-{s}", (s * 0.192, 0.648, 0.009), (s * 0.206, 0.572, 0.011), 0.064, 0.066, coat, 18),
        ])
    coat_clay = k.flat_clay(coat_parts, "coat", coat, VOXEL, 2000)

    shorts_parts = group([(E, "hips", (0.270, 0.130, 0.190), (0, 0.400, 0.0), shorts, 20, 10)])
    sock_parts, shoe_parts = [], []
    for s in (-1, 1):
        shorts_parts += group([(T, f"short-{s}", (s * 0.066, 0.405, 0), (s * 0.078, 0.215, 0.004), 0.074, 0.070, shorts, 18)])
        sock_parts += group([(T, f"sock-{s}", (s * 0.078, 0.240, 0.004), (s * 0.080, 0.090, 0.010), 0.038, 0.037, socks, 14)])
        shoe_parts += group([
            (E, f"shoe-{s}", (0.128, 0.130, 0.270), (s * 0.080, 0.050, 0.040), shoes, 20, 10),
            (E, f"shoe-top-{s}", (0.110, 0.080, 0.130), (s * 0.080, 0.100, 0.010), shoes, 16, 8),
        ])
    shorts_clay = k.flat_clay(shorts_parts, "shorts", shorts, VOXEL, 500)
    socks_clay = k.flat_clay(sock_parts, "socks", socks, VOXEL, 220)
    shoes_clay = k.flat_clay(shoe_parts, "shoes", shoes, VOXEL, 520, ground=True)

    # Face on the skin, collar and seam on the coat.
    eye = k.mat("Passenger eye", "#2A1E18", 0.35)
    shine = k.mat("Passenger eye shine", "#FFFDF4", 0.3)
    line = k.mat("Passenger line", "#6B3D2A", 0.6)
    blush = k.mat("Passenger blush", "#F2A38E", 0.7)
    shirt = k.mat("Passenger shirt", "#F6F1E6", 0.7)
    seam = k.mat("Passenger coat seam", "#243F7A", 0.7)
    decals: list = []
    z = 0.30
    for s in (-1, 1):
        k.wrap_onto(k.disc_decal(decals, f"eye-{s}", (s * 0.050, 1.108, z), (0.041, 0.057), eye, 2, 16), body, 0.0015)
        k.wrap_onto(k.disc_decal(decals, f"shine-{s}", (s * 0.050 - 0.008, 1.121, z), (0.013, 0.015), shine, 1, 10),
                    body, 0.0026)
        k.wrap_onto(k.ribbon_decal(decals, f"brow-{s}", k.arc_points((s * 0.052, 1.156), 0.020, 0.005, z, 9),
                                   0.0060, line), body, 0.0015)
        k.wrap_onto(k.disc_decal(decals, f"blush-{s}", (s * 0.078, 1.062, z), (0.030, 0.018), blush, 1, 14), body, 0.0012)
    k.wrap_onto(k.ribbon_decal(decals, "smile", k.arc_points((0, 1.046), 0.020, -0.008, z, 11), 0.0050, line), body, 0.0015)
    k.wrap_onto(k.disc_decal(decals, "nose", (0, 1.078, z), (0.014, 0.010), k.mat("Passenger nose", "#E0A882", 0.7), 1, 10),
                body, 0.0014)
    k.wrap_onto(k.poly_decal(decals, "shirt-collar", [(0.0, 0.852), (0.050, 0.950), (-0.050, 0.950)], z, shirt, 3),
                coat_clay, 0.0030)
    k.wrap_onto(k.ribbon_decal(decals, "coat-seam", [(0.0, 0.84, z), (0.0, 0.60, z), (0.0, 0.38, z)], 0.0045, seam, False),
                coat_clay, 0.0020)

    solids: list = []
    for i, y in enumerate((0.790, 0.700, 0.605)):
        k.add_ellipsoid(solids, f"button-{i}", (0.030, 0.030, 0.018), (0.012, y, 0.108), gold, 12, 6)
    k.add_ellipsoid(solids, "cap-button", (0.034, 0.034, 0.020), (-0.170, 1.245, 0.050), gold, 12, 6)
    # Team lamp on the cap front, same colours as ピコ's lamp.
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.026, depth=0.020,
                                        location=k.to_blender((0, 1.279, 0.168)), rotation=(1.5708, 0, 0))
    lamp = bpy.context.object
    lamp.data.materials.append(k.mat("Passenger lamp", "#F59E1B", 0.45))
    k.set_smooth(lamp)
    solids.append(lamp)
    k.disc_decal(solids, "lamp-glow", (0, 1.279, 0.1785), (0.030, 0.030), k.mat("Passenger lamp glow", "#FFF3C4", 0.3), 1, 16)

    model = k.join([body, hair_clay, cap_clay, coat_clay, shorts_clay, socks_clay, shoes_clay, *decals, *solids], NAME)
    k.normalize(model, 1.35)
    k.export(model, NAME, BUDGET, "character")


main()
