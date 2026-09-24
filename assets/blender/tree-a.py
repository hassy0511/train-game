"""Pointed town tree (tree-a) — Claude Code. 3.2 x 4.2 x 3.2 m, origin at the trunk base.
Run: python3 scripts/run-bpy.py assets/blender/tree-a.py
"""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402

k.reset()
bark = k.mat("Tree bark", "#7A5A3A", 0.8)
leaf = k.mat("Tree-a leaf", "#3E8E5A", 0.75)
shade = k.mat("Tree-a leaf shade", "#2F7448", 0.75)
parts: list = []
k.add_tapered_segment(parts, "trunk", (0, 0, 0), (0, 1.25, 0), 0.22, 0.22, bark, 8, False)
for i, y in enumerate((0.25, 0.6, 0.95)):
    k.add_tapered_segment(parts, f"scale-{i}", (0, y - 0.09, 0), (0, y + 0.09, 0), 0.30, 0.22, bark, 8, False)
for i, (base, radius, height) in enumerate(((1.0, 1.6, 1.7), (2.0, 1.25, 1.5), (2.85, 0.85, 1.35))):
    # A short inverted rim under each tier makes the foliage edge read as thick.
    k.add_tapered_segment(parts, f"lip-{i}", (0, base - 0.28, 0), (0, base, 0), radius - 0.3, radius, shade, 8, False)
    k.add_tapered_segment(parts, f"tier-{i}", (0, base, 0), (0, base + height, 0), radius, 0.001, leaf, 8, False)
model = k.join(parts, "tree-a")
k.normalize(model, None)
k.export(model, "tree-a", 500, "world", 60)
