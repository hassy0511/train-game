"""ピコ (partner) — Claude Code.

- Proportions follow `assets/concepts/character-turnaround-c-piko.png`, scaled uniformly to 0.70 m tall.
- The blue body is overlapping clay volumes fused by a voxel remesh and decimated, so the neck, shoulders,
  hips, fingers and toes join without seams.
- Eyes, brows, mouth and the belly panel are decals projected onto that surface (nothing floats in profile).

Run: python3 scripts/run-bpy.py assets/blender/partner.py
"""
from __future__ import annotations

from pathlib import Path
import math
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import bpy  # noqa: E402

NAME = "partner"
HEIGHT = 0.70
BUDGET = 5600
VOXEL = 0.0032
BODY_TRIANGLES = 3400

BLUE = "#3DB0DA"
BLUE_SHADE = "#2A8DB8"
CREAM = "#F1E7D0"
EYE_WHITE = "#F7F1E3"
PUPIL = "#1E1612"
LINE = "#173F5A"
LAMP = "#F59E1B"
LAMP_FACE = "#FFCB3D"
LAMP_GLOW = "#FFF3C4"


# ---------------------------------------------------------------- clay body

def build_clay(blue) -> bpy.types.Object:
    parts: list[bpy.types.Object] = []
    # Head: round skull, slightly fuller at the back, soft muzzle under the eyes.
    k.add_ellipsoid(parts, "skull", (0.245, 0.205, 0.205), (0, 0.472, 0.0), blue, 32, 16)
    k.add_ellipsoid(parts, "occiput", (0.215, 0.180, 0.170), (0, 0.482, -0.030), blue, 24, 12)
    k.add_ellipsoid(parts, "muzzle", (0.150, 0.085, 0.110), (0, 0.428, 0.050), blue, 24, 12)
    k.add_tapered_segment(parts, "neck", (0, 0.345, 0), (0, 0.405, 0), 0.026, 0.024, blue, 16)

    # Slender pear torso: (y, half width, half depth, x, z).
    k.add_profiled_volume(parts, "torso", [
        (0.168, 0.020, 0.018, 0, 0.000),
        (0.182, 0.040, 0.032, 0, 0.002),
        (0.205, 0.048, 0.037, 0, 0.004),
        (0.240, 0.045, 0.037, 0, 0.005),
        (0.280, 0.041, 0.035, 0, 0.004),
        (0.320, 0.044, 0.033, 0, 0.002),
        (0.345, 0.045, 0.030, 0, 0.000),
        (0.360, 0.030, 0.024, 0, 0.000),
    ], blue, 24)

    for side in (-1, 1):
        # Arms in the turnaround's relaxed A pose.
        k.add_swept_tube(parts, f"arm-{side}",
                          [(side * 0.030, 0.345, 0.0), (side * 0.052, 0.337, 0.0),
                           (side * 0.098, 0.278, 0.006), (side * 0.136, 0.216, 0.010)],
                          [0.019, 0.019, 0.0155, 0.0135], [blue] * 3, 14)
        k.add_ellipsoid(parts, f"shoulder-{side}", (0.042, 0.040, 0.038),
                         (side * 0.050, 0.336, 0.0), blue, 16, 8)
        k.add_ellipsoid(parts, f"elbow-{side}", (0.031, 0.031, 0.030),
                         (side * 0.098, 0.278, 0.006), blue, 12, 6)
        # Mitten hand: palm broad across X, three grooved fingers and an inner thumb.
        palm = (side * 0.150, 0.190, 0.012)
        k.add_ellipsoid(parts, f"palm-{side}", (0.050, 0.054, 0.030), palm, blue, 16, 8)
        for index, dx in enumerate((0.019, 0.0, -0.019)):
            fx = palm[0] + side * dx
            k.add_swept_tube(parts, f"finger-{side}-{index}",
                              [(fx, 0.185, 0.013), (fx + side * dx * 0.15, 0.160, 0.014),
                               (fx + side * dx * 0.25, 0.146, 0.015)],
                              [0.0105, 0.0100, 0.0090], [blue] * 2, 10)
            k.add_ellipsoid(parts, f"fingertip-{side}-{index}", (0.019, 0.017, 0.018),
                             (fx + side * dx * 0.25, 0.146, 0.015), blue, 10, 5)
        thumb_root = (palm[0] - side * 0.022, 0.196, 0.016)
        k.add_swept_tube(parts, f"thumb-{side}",
                          [thumb_root, (thumb_root[0] - side * 0.010, 0.172, 0.022)],
                          [0.010, 0.0085], [blue], 10)
        k.add_ellipsoid(parts, f"thumbtip-{side}", (0.017, 0.017, 0.017),
                         (thumb_root[0] - side * 0.010, 0.172, 0.022), blue, 10, 5)

        # Legs: fuller thigh, straight shin, slightly splayed.
        k.add_swept_tube(parts, f"leg-{side}",
                          [(side * 0.028, 0.200, 0.0), (side * 0.046, 0.110, 0.003),
                           (side * 0.060, 0.040, 0.004)],
                          [0.029, 0.021, 0.019], [blue] * 2, 16)
        k.add_ellipsoid(parts, f"knee-{side}", (0.041, 0.040, 0.040),
                         (side * 0.046, 0.110, 0.003), blue, 12, 6)
        # Big paddle foot with three toe bumps (grooves appear between them).
        foot_x = side * 0.068
        k.add_ellipsoid(parts, f"foot-{side}", (0.092, 0.088, 0.140), (foot_x, 0.018, 0.028), blue, 24, 12)
        for index, dx in enumerate((-0.027, 0.0, 0.027)):
            k.add_ellipsoid(parts, f"toe-{side}-{index}", (0.034, 0.046, 0.052),
                             (foot_x + dx, 0.020, 0.080), blue, 14, 7)

    # Lamp stalk: rises from the back of the crown and hooks forward.
    k.add_swept_tube(parts, "stalk",
                      [(0, 0.540, -0.040), (0, 0.585, -0.042), (0, 0.628, -0.030),
                       (0, 0.655, -0.004), (0, 0.664, 0.030), (0, 0.662, 0.066)],
                      [0.028, 0.021, 0.017, 0.0155, 0.015, 0.015], [blue] * 5, 14)

    return k.flat_clay(parts, "piko-body", blue, VOXEL, BODY_TRIANGLES, ground=True, smooth=3)


# ---------------------------------------------------------------- details

def build_details(clay, mats) -> list[bpy.types.Object]:
    decals: list[bpy.types.Object] = []
    front = 0.14  # start in front of the face; the wrap pulls each decal onto the surface

    # Belly panel: shield that tapers to a soft point at the crotch.
    shield = []
    for i in range(15):
        t = i / 14
        y = 0.346 - t * 0.166
        if t < 0.12:  # rounded top edge under the neck
            half = 0.026 + 0.010 * math.sin(t / 0.12 * math.pi / 2)
        elif t < 0.62:
            half = 0.036 - 0.004 * math.sin((t - 0.12) / 0.5 * math.pi)
        else:  # taper to a soft point at the crotch
            half = 0.036 * math.cos((t - 0.62) / 0.38 * math.pi / 2) ** 0.9
        shield.append((y, max(half, 0.002)))
    verts, faces = [], []
    cols = 8
    for y, half in shield:
        for c in range(cols + 1):
            verts.append((-half + 2 * half * c / cols, y, 0.08))
    for r in range(len(shield) - 1):
        for c in range(cols):
            a = r * (cols + 1) + c
            b = (r + 1) * (cols + 1) + c
            faces.append((a, b, b + 1, a + 1))
    belly = k.add_mesh(decals, "belly", verts, faces, [mats["cream"]], smooth=True)
    k.wrap_onto(belly, clay, 0.0012)

    for side in (-1, 1):
        ex = side * 0.057
        sclera = k.disc_decal(decals, f"eye-{side}", (ex, 0.470, front), (0.050, 0.064), mats["eye"],
                            tilt=side * 0.10)
        k.wrap_onto(sclera, clay, 0.0012)
        pupil = k.disc_decal(decals, f"pupil-{side}", (ex - side * 0.005, 0.465, front), (0.034, 0.046),
                           mats["pupil"], rings=2, segments=16, tilt=side * 0.10)
        k.wrap_onto(pupil, clay, 0.0024)
        shine = k.disc_decal(decals, f"shine-{side}", (ex - side * 0.010, 0.478, front), (0.009, 0.010),
                           mats["eye"], rings=1, segments=10)
        k.wrap_onto(shine, clay, 0.0034)
        brow = k.ribbon_decal(decals, f"brow-{side}",
                            k.arc_points((side * 0.059, 0.517), 0.022, 0.008, front, tilt=side * 0.003),
                            0.0060, mats["line"])
        k.wrap_onto(brow, clay, 0.0014)

    mouth = k.ribbon_decal(decals, "mouth", k.arc_points((0, 0.420), 0.030, -0.011, front), 0.0050, mats["line"])
    k.wrap_onto(mouth, clay, 0.0014)
    for side in (-1, 1):
        cheek = k.ribbon_decal(decals, f"smile-end-{side}",
                             [(side * 0.028, 0.423, front), (side * 0.034, 0.428, front)], 0.0036,
                             mats["line"])
        k.wrap_onto(cheek, clay, 0.0014)
    nose = k.disc_decal(decals, "nose", (0, 0.437, front), (0.019, 0.012), mats["shade"], rings=2, segments=12)
    k.wrap_onto(nose, clay, 0.0016)
    return decals


def build_lamp(mats) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    center_y, back_z, depth, radius = 0.657, 0.058, 0.040, 0.043
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=depth,
                                        location=k.to_blender((0, center_y, back_z + depth / 2)),
                                        rotation=(math.pi / 2, 0, 0))
    shell = bpy.context.object
    shell.name = "lamp-shell"
    shell.data.materials.append(mats["lamp"])
    k.apply_modifier(shell, "BEVEL", width=0.008, segments=3, limit_method="ANGLE")
    k.set_smooth(shell)
    parts.append(shell)
    front_z = back_z + depth + 0.0008
    parts.append(k.disc_decal(parts, "lamp-face", (0, center_y, front_z), (0.058, 0.058), mats["lamp_face"],
                            rings=2, segments=24))
    parts.append(k.disc_decal(parts, "lamp-glow", (0, center_y, front_z + 0.0008), (0.032, 0.032),
                            mats["lamp_glow"], rings=1, segments=20))
    return list(dict.fromkeys(parts))


# ---------------------------------------------------------------- main

def main() -> None:
    k.reset()
    mats = {
        "blue": k.mat("Piko blue", BLUE, 0.62),
        "shade": k.mat("Piko shade", BLUE_SHADE, 0.62),
        "cream": k.mat("Piko belly", CREAM, 0.7),
        "eye": k.mat("Piko eye white", EYE_WHITE, 0.45),
        "pupil": k.mat("Piko pupil", PUPIL, 0.35),
        "line": k.mat("Piko line", LINE, 0.6),
        "lamp": k.mat("Piko lamp", LAMP, 0.45),
        "lamp_face": k.mat("Piko lamp face", LAMP_FACE, 0.4),
        "lamp_glow": k.mat("Piko lamp glow", LAMP_GLOW, 0.3),
    }
    clay = build_clay(mats["blue"])
    decals = build_details(clay, mats)
    lamp = build_lamp(mats)
    model = k.join([clay, *decals, *lamp], NAME)
    k.normalize(model, HEIGHT)
    k.export(model, NAME, BUDGET, "character")


main()
