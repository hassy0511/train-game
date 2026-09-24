"""Round town tree (tree-b) — Claude Code. About 3.5 x 4.6 x 3.55 m, origin at the trunk base.
Run: python3 scripts/run-bpy.py assets/blender/tree-b.py
"""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402

k.reset()
bark = k.mat("Tree bark", "#7A5A3A", 0.8)
leaf = k.mat("Tree-b leaf", "#6CBF3F", 0.75)
shade = k.mat("Tree-b leaf shade", "#4FA332", 0.75)
parts: list = []
k.add_tapered_segment(parts, "trunk", (0, 0, 0), (0, 1.7, 0), 0.30, 0.30, bark, 8, False)
k.add_tapered_segment(parts, "flare", (0, 0, 0), (0, 0.3, 0), 0.42, 0.30, bark, 8, False)
for name, size, center, m in (("main", (3.0, 2.7, 3.55), (0.0, 2.85, 0.0), shade),
                               ("left", (1.9, 1.7, 1.9), (-0.85, 2.55, 0.35), shade),
                               ("right", (2.0, 1.8, 2.0), (0.8, 2.75, -0.3), leaf),
                               ("top", (1.9, 1.6, 1.9), (0.1, 3.8, 0.1), leaf)):
    k.add_ellipsoid(parts, f"blob-{name}", size, center, m, 10, 6)
model = k.join(parts, "tree-b")
k.normalize(model, None)
k.export(model, "tree-b", 600, "world", 60)
