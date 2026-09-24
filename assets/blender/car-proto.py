"""ワンダー号 passenger car (`car-proto`) — Claude Code. Same body as the lead car without the nose.
Run: python3 scripts/run-bpy.py assets/blender/car-proto.py
"""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import vehicle_common as v  # noqa: E402

k.reset()
m = v.mats()
parts: list = []
v.loft(parts, "body", [v.section(-6.0, 0.96, 0.98), v.section(-5.85), v.section(5.85), v.section(6.0, 0.96, 0.98)], m)
v.door(parts, m)
for z in (-4.6, -3.1, -1.65, 1.65, 3.1, 4.6):
    v.side_window(parts, m, z, 1.05)
v.running_gear(parts, m)
v.roof_gear(parts, m)
v.finish(parts, "car-proto", 2800)
