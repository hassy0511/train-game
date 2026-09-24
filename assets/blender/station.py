"""Station set — Claude Code. Builds platform, platform-roof, station-sign, stop-line, stop-board and
buffer-stop-proto with the origins the placement code expects (src/view/three/actors.ts, rail-mesh.ts):

- platform: 4 x 1.0 x 45 m. Origin = centre of the rail-side edge at the bottom; the platform extends +X.
- platform-roof: stands on the platform top; X 0..4 like the platform, 12 m long, about 4.2 m tall.
- station-sign: 2.4 x 3.0 x 0.3 m, readable on both faces (±Z), origin at the base.
- stop-line: 3.4 x 0.03 x 0.4 m white marking on the rails.
- stop-board: 0.9 x 2.2 x 0.15 m, readable face toward -Z (the approaching train).
- buffer-stop-proto: 3.2 x 1.2 x 1.0 m, buffer face toward -Z, braces toward +Z.

Run: python3 scripts/run-bpy.py assets/blender/station.py [name ...]
"""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import bpy  # noqa: E402



def B(parts, name, size, center, m, bevel=0.0, segments=1, smooth=False):
    """Box with single-segment bevels by default (cheap, still catches a highlight)."""
    return k.add_box(parts, name, size, center, m, bevel=bevel, segments=segments, smooth=smooth)


def platform():
    side = k.mat("Platform side", "#9A958C", 0.85)
    panel = k.mat("Platform panel", "#86817A", 0.85)
    top = k.mat("Platform paving", "#D3CCBE", 0.9)
    seam = k.mat("Platform seam", "#BDB5A6", 0.9)
    coping = k.mat("Platform coping", "#EEE8DC", 0.8)
    strip = k.mat("Platform safety strip", "#FFC93C", 0.6)
    p: list = []
    B(p, "body", (3.9, 0.86, 45.0), (2.0, 0.43, 0), side, bevel=0.05)
    B(p, "top", (3.72, 0.10, 44.9), (2.12, 0.91, 0), top, bevel=0.03)
    B(p, "coping", (0.30, 0.12, 45.0), (0.15, 0.94, 0), coping, bevel=0.03)
    B(p, "safety-strip", (0.32, 0.03, 44.8), (0.52, 0.965, 0), strip)
    for i in range(-14, 15):
        B(p, f"seam-{i}", (3.3, 0.012, 0.05), (2.30, 0.962, i * 1.5), seam)
    for i in range(-5, 6):
        B(p, f"panel-{i}", (0.03, 0.52, 3.4), (0.0, 0.40, i * 4.0), panel)
    return p, 900


def platform_roof():
    post = k.mat("Roof post", "#3A5A6E", 0.6)
    beam = k.mat("Roof beam", "#2F4A5C", 0.6)
    roof = k.mat("Roof deck", "#D9694F", 0.6)
    fascia = k.mat("Roof fascia", "#F3EFE4", 0.6)
    wood = k.mat("Bench wood", "#B7824B", 0.7)
    p: list = []
    for x in (0.9, 3.3):
        for z in (-4.8, 4.8):
            B(p, f"post-{x}-{z}", (0.18, 3.15, 0.18), (x, 1.575, z), post, bevel=0.03)
            B(p, f"foot-{x}-{z}", (0.36, 0.12, 0.36), (x, 0.06, z), beam, bevel=0.03)
        B(p, f"beam-{x}", (0.24, 0.24, 11.2), (x, 3.22, 0), beam, bevel=0.03)
    for z in (-4.8, 0.0, 4.8):
        B(p, f"cross-{z}", (3.0, 0.18, 0.18), (2.1, 3.40, z), beam, bevel=0.03)
    k.add_mesh(p, "deck", [(0.0, 3.52, -6), (4.0, 3.80, -6), (4.0, 3.96, -6), (0.0, 3.68, -6),
                           (0.0, 3.52, 6), (4.0, 3.80, 6), (4.0, 3.96, 6), (0.0, 3.68, 6)],
               [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], [roof])
    B(p, "fascia-front", (0.10, 0.26, 12.1), (0.0, 3.58, 0), fascia, bevel=0.02)
    B(p, "fascia-back", (0.10, 0.26, 12.1), (4.0, 3.86, 0), fascia, bevel=0.02)
    # Bench under the roof, away from the edge.
    B(p, "bench-seat", (0.45, 0.07, 2.2), (3.05, 0.46, 0), wood, bevel=0.02)
    B(p, "bench-back", (0.07, 0.40, 2.2), (3.26, 0.74, 0), wood, bevel=0.02)
    for z in (-0.9, 0.9):
        B(p, f"bench-leg-{z}", (0.40, 0.44, 0.07), (3.08, 0.22, z), post)
    return p, 2000


def station_sign():
    frame = k.mat("Sign frame", "#3FA7D6", 0.5)
    frame_dark = k.mat("Sign frame dark", "#2B7BA8", 0.5)
    face = k.mat("Sign face", "#F7F0DE", 0.6)
    post = k.mat("Sign post", "#5E656D", 0.6)
    p: list = []
    for x in (-0.95, 0.95):
        B(p, f"post-{x}", (0.12, 2.0, 0.12), (x, 1.0, 0), post, bevel=0.02)
        B(p, f"foot-{x}", (0.30, 0.10, 0.28), (x, 0.05, 0), frame_dark, bevel=0.02)
    B(p, "frame", (2.4, 1.0, 0.24), (0, 2.45, 0), frame, bevel=0.10, segments=3, smooth=True)
    for z in (-0.125, 0.125):
        B(p, f"face-{z}", (2.08, 0.70, 0.02), (0, 2.45, z), face, bevel=0.04)
    B(p, "cap", (2.55, 0.10, 0.30), (0, 2.99, 0), frame_dark, bevel=0.04)
    return p, 600


def stop_line():
    white = k.mat("Stop line", "#F7F3E8", 0.6)
    p: list = []
    B(p, "line", (3.4, 0.03, 0.4), (0, 0.015, 0), white, bevel=0.008)
    return p, 80


def stop_board():
    red = k.mat("Stop board red", "#D64545", 0.5)
    white = k.mat("Stop board white", "#F7F3E8", 0.5)
    frame = k.mat("Stop board frame", "#8F3035", 0.5)
    post = k.mat("Stop board post", "#5E656D", 0.6)
    p: list = []
    B(p, "foot", (0.60, 0.14, 0.15), (0, 0.07, 0), post, bevel=0.03)
    B(p, "post", (0.12, 1.22, 0.10), (0, 0.69, 0), post, bevel=0.02)
    B(p, "board", (0.9, 0.98, 0.10), (0, 1.71, 0), frame, bevel=0.05, segments=2)
    for i in range(6):
        B(p, f"stripe-{i}", (0.78, 0.14, 0.02), (0, 1.30 + i * 0.165, -0.058), red if i % 2 == 0 else white)
    k.disc_decal(p, "roundel-rim", (0, 1.71, -0.072), (0.42, 0.42), frame, 1, 20, facing=-1)
    k.disc_decal(p, "roundel", (0, 1.71, -0.074), (0.32, 0.32), white, 1, 20, facing=-1)
    return p, 900


def buffer_stop():
    red = k.mat("Buffer red", "#D64545", 0.5)
    stripe = k.mat("Buffer stripe", "#F7F3E8", 0.5)
    steel = k.mat("Buffer steel", "#4A5058", 0.6)
    pad = k.mat("Buffer pad", "#2B2F35", 0.7)
    p: list = []
    B(p, "beam", (3.2, 0.42, 0.24), (0, 0.80, -0.30), red, bevel=0.04)
    for x in (-1.0, 0.0, 1.0):
        B(p, f"stripe-{x}", (0.30, 0.43, 0.012), (x, 0.80, -0.426), stripe)
    for x in (-0.75, 0.75):
        k.add_tapered_segment(p, f"pad-{x}", (x, 0.80, -0.42), (x, 0.80, -0.50), 0.13, 0.13, pad, 14, False)
        B(p, f"upright-{x}", (0.16, 1.0, 0.16), (x * 1.25, 0.50, -0.30), steel, bevel=0.02)
        k.add_tapered_segment(p, f"brace-{x}", (x * 1.25, 0.95, -0.25), (x * 1.25, 0.05, 0.50), 0.07, 0.07, steel, 8, False)
        B(p, f"foot-{x}", (0.24, 0.10, 1.0), (x * 1.25, 0.05, 0.0), steel)
    return p, 400


BUILDERS = {"platform": platform, "platform-roof": platform_roof, "station-sign": station_sign,
            "stop-line": stop_line, "stop-board": stop_board, "buffer-stop-proto": buffer_stop}

names = [a for a in sys.argv[1:] if a in BUILDERS] or list(BUILDERS)
for name in names:
    k.reset()
    parts, budget = BUILDERS[name]()
    model = k.join(parts, name)
    k.smooth_by_angle(model, 34)
    if name in ("platform", "platform-roof"):
        k.normalize(model, None, center=False)  # X = 0 is the rail-side edge, not the bbox centre
    else:
        k.normalize(model, None)
    k.export(model, name, budget, "world", 250, facing=-1 if name in ("stop-board", "buffer-stop-proto") else 1)
