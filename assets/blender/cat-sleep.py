"""Sleeping tabby cat (Claude Code).

Same cat as `cat-stand` curled up: body lying across X, head at +X resting on the front paws and
facing +Z, eyes closed, striped tail wrapped around the front with its cream tip.
Run: python3 scripts/run-bpy.py assets/blender/cat-sleep-k.py
"""
from __future__ import annotations

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402  (imports bpy, which provides mathutils)
from cat_cc import CREAM, HEAD, ORANGE, STRIPE, add_face, add_head, banded, tail_paint  # noqa: E402
from mathutils import Vector  # noqa: E402

NAME = "cat-sleep"
BUDGET = 3500
HEAD_AT = Vector((0.150, 0.135, 0.060))
OFFSET = HEAD_AT - HEAD
TAIL = [(-0.215, 0.070, -0.070), (-0.250, 0.050, 0.010), (-0.215, 0.036, 0.100), (-0.135, 0.030, 0.160),
        (-0.040, 0.029, 0.188), (0.040, 0.030, 0.192)]


def body_paint(p: Vector, n: Vector) -> str:
    if p.y < 0.035 or (p.x > 0.04 and p.y < 0.13 and n.z > 0.25 and p.z > 0.05):
        return CREAM  # underside and chest showing under the chin
    tilt = p.x + 0.35 * (p.y - 0.10)
    return STRIPE if p.y > 0.06 and banded(tilt + 0.3, 0.066, 0.42) else ORANGE


def main() -> None:
    k.reset()
    clay_mat = k.mat("clay", ORANGE)
    clay: list = []

    def add(paint, fn, *args):
        parts: list = []
        fn(parts, *args)
        clay.extend((obj, paint) for obj in parts)

    E = k.add_ellipsoid
    add(body_paint, E, "body", (0.400, 0.190, 0.270), (-0.030, 0.100, -0.010), clay_mat, 28, 14)
    add(body_paint, E, "rump", (0.190, 0.180, 0.230), (-0.140, 0.105, -0.020), clay_mat, 20, 10)
    add(body_paint, E, "haunch", (0.150, 0.130, 0.130), (-0.120, 0.090, 0.075), clay_mat, 16, 8)
    add(body_paint, E, "shoulders", (0.180, 0.160, 0.200), (0.100, 0.095, 0.020), clay_mat, 20, 10)
    add_head(clay, clay_mat, OFFSET)
    for x in (0.105, 0.200):
        add(CREAM, E, f"front-paw-{x}", (0.074, 0.052, 0.100), (x, 0.026, 0.132), clay_mat, 16, 8)
        for dx in (-0.019, 0.0, 0.019):
            add(CREAM, E, f"toe-{x}-{dx}", (0.024, 0.032, 0.030), (x + dx, 0.024, 0.176), clay_mat, 10, 5)
    add(CREAM, E, "rear-paw", (0.070, 0.050, 0.090), (-0.030, 0.025, 0.125), clay_mat, 16, 8)
    add(tail_paint(TAIL), k.add_swept_tube, "tail", TAIL, [0.030, 0.029, 0.028, 0.027, 0.027, 0.026],
        [clay_mat] * (len(TAIL) - 1), 14)
    add(tail_paint(TAIL), E, "tail-tip", (0.052, 0.050, 0.052), TAIL[-1], clay_mat, 14, 7)

    body = k.painted_clay(clay, NAME, voxel=0.0028, budget=2900, smooth=8)
    decals = add_face(body, OFFSET, asleep=True)
    model = k.join([body, *decals], NAME)
    k.normalize(model, None)
    k.export(model, NAME, BUDGET, "character")


main()
