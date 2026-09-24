"""Standing tabby cat — Claude Code version (compare with Codex's `cat-stand`).

Follows `assets/concepts/character-turnaround-c-cat.png`: long body along Z (the face looks +Z), tall
striped tail curling forward with a cream tip, cream chest / muzzle / paws, pink inner ears, big green eyes.
Run: python3 scripts/run-bpy.py assets/blender/cat-stand-cc.py
"""
from __future__ import annotations

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402  (imports bpy, which provides mathutils)
import character_common as cc  # noqa: E402
from cat_cc import CREAM, ORANGE, STRIPE, add_face, add_head, banded, leg_paint, tail_paint  # noqa: E402
from mathutils import Vector  # noqa: E402

NAME = "cat-stand-cc"
BUDGET = 5500
TAIL = [(0, 0.285, -0.225), (0, 0.345, -0.285), (0, 0.435, -0.312), (0, 0.515, -0.300),
        (0, 0.568, -0.262), (0, 0.588, -0.215), (0, 0.578, -0.172)]


def body_paint(p: Vector, n: Vector) -> str:
    if p.y < 0.185 or (p.z > 0.10 and p.y < 0.32 and n.z > 0.15 and abs(p.x) < 0.055):
        return CREAM  # belly and chest bib
    tilt = p.z + 0.45 * (p.y - 0.25)
    thickness = 0.42 if p.y > 0.24 else 0.30
    return STRIPE if p.y > 0.2 and banded(tilt + 0.3, 0.068, thickness) else ORANGE


def main() -> None:
    k.reset()
    clay_mat = k.mat("clay", ORANGE)
    clay: list = []

    def add(paint, fn, *args):
        parts: list = []
        fn(parts, *args)
        clay.extend((obj, paint) for obj in parts)

    E = cc.add_ellipsoid
    # Torso: chest, middle and rump volumes give the long, slightly arched back.
    add(body_paint, E, "chest", (0.160, 0.190, 0.200), (0, 0.240, 0.135), clay_mat, 24, 12)
    add(body_paint, E, "middle", (0.152, 0.168, 0.300), (0, 0.246, -0.020), clay_mat, 24, 12)
    add(body_paint, E, "rump", (0.160, 0.178, 0.180), (0, 0.246, -0.168), clay_mat, 24, 12)
    add(body_paint, E, "neck", (0.118, 0.140, 0.120), (0, 0.312, 0.185), clay_mat, 20, 10)
    add_head(clay, clay_mat, Vector((0, 0, 0)))
    for side in (-1, 1):
        add(leg_paint, cc.add_swept_tube, f"front-leg-{side}",
            [(side * 0.055, 0.245, 0.150), (side * 0.057, 0.130, 0.160), (side * 0.058, 0.040, 0.168)],
            [0.040, 0.034, 0.030], [clay_mat] * 2, 14)
        add(leg_paint, cc.add_swept_tube, f"rear-leg-{side}",
            [(side * 0.055, 0.200, -0.190), (side * 0.060, 0.110, -0.185), (side * 0.060, 0.040, -0.172)],
            [0.042, 0.034, 0.030], [clay_mat] * 2, 14)
        add(body_paint, E, f"haunch-{side}", (0.080, 0.150, 0.140), (side * 0.048, 0.225, -0.165), clay_mat, 16, 8)
        for z in (0.184, -0.156):
            add(CREAM, E, f"paw-{side}-{z}", (0.074, 0.052, 0.090), (side * 0.058, 0.021, z), clay_mat, 16, 8)
            for dx in (-0.019, 0.0, 0.019):
                add(CREAM, E, f"toe-{side}-{z}-{dx}", (0.024, 0.034, 0.030),
                    (side * 0.058 + dx, 0.019, z + 0.036), clay_mat, 10, 5)
    add(tail_paint(TAIL), cc.add_swept_tube, "tail", TAIL, [0.029, 0.028, 0.027, 0.027, 0.027, 0.027, 0.026],
        [clay_mat] * (len(TAIL) - 1), 14)
    add(tail_paint(TAIL), E, "tail-tip", (0.052, 0.052, 0.052), TAIL[-1], clay_mat, 14, 7)

    body = k.painted_clay(clay, NAME, voxel=0.0028, budget=4300, smooth=8)
    decals = add_face(body, Vector((0, 0, 0)), asleep=False)
    model = k.join([body, *decals], NAME)
    k.normalize(model, None)
    k.export(model, NAME, BUDGET, "cat-stand")


main()
