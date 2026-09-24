"""Town of stage 1-1 — Claude Code.

Buildings (origin at the bottom centre, street side +Z): house-a, house-b, house-c, shop, tower, hq.
Trackside and props: crossing-gate, crossing-sign, parcel, goal-flag, rock.
Style: chunky toy town — plinths, thick roofs with overhang, framed recessed windows, door canopies.
Run: python3 scripts/run-bpy.py assets/blender/town.py [-- name ...]
"""
from __future__ import annotations

from pathlib import Path
import math
import random
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import bmesh  # noqa: E402
import bpy  # noqa: E402


def B(parts, name, size, center, m, bevel=0.0, segments=1):
    return k.add_box(parts, name, size, center, m, bevel=bevel, segments=segments)


def fix_normals(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()


def prism_x(parts, name, outline_zy, x0, x1, m):
    """Prism along X from an outline in the (z, y) plane."""
    n = len(outline_zy)
    verts = [(x0, y, z) for z, y in outline_zy] + [(x1, y, z) for z, y in outline_zy]
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    obj = k.add_mesh(parts, name, verts, faces, [m])
    fix_normals(obj)
    return obj


def prism_z(parts, name, outline_xy, z0, z1, m):
    n = len(outline_xy)
    verts = [(x, y, z0) for x, y in outline_xy] + [(x, y, z1) for x, y in outline_xy]
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    obj = k.add_mesh(parts, name, verts, faces, [m])
    fix_normals(obj)
    return obj


def gable_x(parts, name, half_w, half_d, eave, ridge, thick, m):
    """Roof slab with the ridge along X (slopes face ±Z)."""
    return prism_x(parts, name, [(half_d, eave), (0, ridge), (-half_d, eave), (-half_d, eave - thick),
                                 (0, ridge - thick * 1.4), (half_d, eave - thick)], -half_w, half_w, m)


def gable_z(parts, name, half_w, half_d, eave, ridge, thick, m):
    """Roof slab with the ridge along Z (gable end faces the street)."""
    return prism_z(parts, name, [(half_w, eave), (0, ridge), (-half_w, eave), (-half_w, eave - thick),
                                 (0, ridge - thick * 1.4), (half_w, eave - thick)], -half_d, half_d, m)


def hipped(parts, name, bw, bd, tw, td, y0, y1, m):
    """Hipped roof: base rectangle bw x bd at y0 rising to a ridge rectangle tw x td at y1."""
    v = [(-bw, y0, -bd), (bw, y0, -bd), (bw, y0, bd), (-bw, y0, bd),
         (-tw, y1, -td), (tw, y1, -td), (tw, y1, td), (-tw, y1, td)]
    f = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    obj = k.add_mesh(parts, name, v, f, [m])
    fix_normals(obj)
    return obj


class Kit:
    """Shared palette for windows and doors."""

    def __init__(self, trim="#FBF6EC", glass="#2B4A6B", door="#6B4E2E"):
        self.trim = k.mat("Trim", trim, 0.6)
        self.glass = k.mat("Glass", glass, 0.25)
        self.door = k.mat("Door", door, 0.6)
        self.knob = k.mat("Door knob", "#E8B64A", 0.4)

    def window(self, p, name, face, u, y, w, h, wall, mullion=True):
        """Framed window on a wall face: face in front/back/left/right, `wall` = distance of that wall
        from the centre, `u` = position along the wall."""
        f = 0.09
        items = [((w, h, 0.05), (u, y, 0.015), self.glass),
                 ((w + 2 * f, f, 0.12), (u, y + h / 2 + f / 2, 0.05), self.trim),
                 ((w + 2 * f + 0.1, 0.10, 0.20), (u, y - h / 2 - 0.05, 0.08), self.trim),
                 ((f, h, 0.12), (u - w / 2 - f / 2, y, 0.05), self.trim),
                 ((f, h, 0.12), (u + w / 2 + f / 2, y, 0.05), self.trim)]
        if mullion:
            items.append(((0.05, h, 0.08), (u, y, 0.035), self.trim))
        for i, ((sx, sy, sz), (cx, cy, cz), m) in enumerate(items):
            if face == "front":
                B(p, f"{name}-{i}", (sx, sy, sz), (cx, cy, wall + cz), m)
            elif face == "back":
                B(p, f"{name}-{i}", (sx, sy, sz), (-cx, cy, -wall - cz), m)
            elif face == "right":
                B(p, f"{name}-{i}", (sz, sy, sx), (wall + cz, cy, -cx), m)
            else:
                B(p, f"{name}-{i}", (sz, sy, sx), (-wall - cz, cy, cx), m)

    def door_front(self, p, name, u, w, h, wall, y0=0.3, canopy=None):
        B(p, f"{name}-panel", (w, h, 0.06), (u, y0 + h / 2, wall + 0.02), self.door)
        B(p, f"{name}-frame-top", (w + 0.24, 0.12, 0.14), (u, y0 + h + 0.06, wall + 0.05), self.trim)
        for s in (-1, 1):
            B(p, f"{name}-frame-{s}", (0.12, h, 0.14), (u + s * (w / 2 + 0.06), y0 + h / 2, wall + 0.05), self.trim)
        B(p, f"{name}-knob", (0.08, 0.08, 0.08), (u + w * 0.32, y0 + h * 0.48, wall + 0.08), self.knob)
        B(p, f"{name}-step", (w + 0.5, 0.18, 0.5), (u, 0.09, wall + 0.25), self.trim)
        if canopy:
            B(p, f"{name}-canopy", (w + 0.8, 0.14, 0.75), (u, y0 + h + 0.35, wall + 0.37), canopy, bevel=0.04)


# ---------------------------------------------------------------- buildings

def house_a():
    kit = Kit()
    wall = k.mat("House-a wall", "#F6E7C9", 0.8)
    roof = k.mat("House-a roof", "#D9694F", 0.6)
    plinth = k.mat("Plinth", "#B9AE9B", 0.85)
    brick = k.mat("Chimney", "#A5563F", 0.8)
    p: list = []
    B(p, "plinth", (6.8, 0.3, 6.0), (0, 0.15, 0), plinth, bevel=0.05)
    B(p, "walls", (6.4, 4.2, 5.6), (0, 2.4, 0), wall)
    prism_x(p, "gable-fill", [(2.8, 4.5), (0, 6.5), (-2.8, 4.5)], -3.2, 3.2, wall)
    gable_x(p, "roof", 3.6, 3.4, 4.35, 6.95, 0.32, roof)
    B(p, "chimney", (0.7, 1.8, 0.7), (1.9, 6.2, -1.2), brick, bevel=0.04)
    B(p, "chimney-cap", (0.9, 0.16, 0.9), (1.9, 7.1, -1.2), plinth)
    kit.door_front(p, "door", 0, 1.1, 2.2, 2.8, canopy=roof)
    for u in (-1.9, 1.9):
        kit.window(p, f"front-{u}", "front", u, 2.6, 1.2, 1.3, 2.8)
        kit.window(p, f"back-{u}", "back", u, 2.6, 1.2, 1.3, 2.8)
    for face in ("left", "right"):
        kit.window(p, f"side-{face}", face, 0, 2.6, 1.2, 1.3, 3.2)
    return p, 2400


def house_b():
    kit = Kit(glass="#1F2A44")
    wall = k.mat("House-b wall", "#DCE9F5", 0.8)
    roof = k.mat("House-b roof", "#4F7FB0", 0.6)
    plinth = k.mat("Plinth", "#B9AE9B", 0.85)
    band = k.mat("House-b band", "#F7F3E8", 0.7)
    p: list = []
    B(p, "plinth", (9.0, 0.3, 7.0), (0, 0.15, 0), plinth, bevel=0.05)
    B(p, "walls", (8.6, 5.6, 6.6), (0, 3.1, 0), wall)
    B(p, "floor-band", (8.8, 0.22, 6.8), (0, 3.1, 0), band)
    B(p, "eave", (9.8, 0.34, 7.8), (0, 6.07, 0), roof, bevel=0.06)
    hipped(p, "roof", 4.7, 3.7, 1.6, 0.6, 6.24, 8.0, roof)
    kit.door_front(p, "door", 0, 1.2, 2.3, 3.3, canopy=band)
    for u in (-2.8, 2.8):
        kit.window(p, f"g-{u}", "front", u, 1.9, 1.3, 1.3, 3.3)
    for u in (-2.8, 0, 2.8):
        kit.window(p, f"u-{u}", "front", u, 4.5, 1.2, 1.2, 3.3)
        kit.window(p, f"b-{u}", "back", u, 4.5, 1.2, 1.2, 3.3)
    for face in ("left", "right"):
        for y in (1.9, 4.5):
            kit.window(p, f"s-{face}-{y}", face, 0, y, 1.2, 1.2, 4.3)
    return p, 3200


def house_c():
    kit = Kit(glass="#2B3F5E")
    wall = k.mat("House-c wall", "#F4D6E4", 0.8)
    roof = k.mat("House-c roof", "#8E5A9E", 0.6)
    plinth = k.mat("Plinth", "#B9AE9B", 0.85)
    band = k.mat("House-c band", "#FBF6EC", 0.7)
    p: list = []
    B(p, "plinth", (6.0, 0.3, 6.0), (0, 0.15, 0), plinth, bevel=0.05)
    B(p, "walls", (5.6, 6.2, 5.6), (0, 3.4, 0), wall)
    B(p, "floor-band", (5.8, 0.2, 5.8), (0, 3.4, 0), band)
    prism_z(p, "gable-fill", [(2.8, 6.5), (0, 8.4), (-2.8, 6.5)], -2.8, 2.8, wall)
    gable_z(p, "roof", 3.4, 3.4, 6.35, 8.95, 0.3, roof)
    kit.door_front(p, "door", -1.1, 1.0, 2.2, 2.8, canopy=roof)
    kit.window(p, "g", "front", 1.2, 1.9, 0.9, 1.5, 2.8)
    for u in (-1.2, 1.2):
        kit.window(p, f"u-{u}", "front", u, 4.9, 0.9, 1.6, 2.8)
        kit.window(p, f"b-{u}", "back", u, 4.9, 0.9, 1.6, 2.8)
    for face in ("left", "right"):
        kit.window(p, f"s-{face}", face, 0, 4.9, 0.9, 1.6, 2.8)
    k.disc_decal(p, "attic-rim", (0, 7.2, 2.86), (1.0, 1.0), band, 1, 16)
    k.disc_decal(p, "attic", (0, 7.2, 2.87), (0.74, 0.74), kit.glass, 1, 16)
    return p, 2600


def shop():
    kit = Kit(glass="#2B4A6B")
    wall = k.mat("Shop wall", "#F3E3C3", 0.8)
    plinth = k.mat("Plinth", "#B9AE9B", 0.85)
    red = k.mat("Awning red", "#D64545", 0.6)
    white = k.mat("Awning white", "#F7F3E8", 0.6)
    sign = k.mat("Shop sign", "#3E9BD6", 0.5)
    gold = k.mat("Shop gold", "#FFC93C", 0.4)
    roof = k.mat("Shop roof", "#8C6A55", 0.8)
    p: list = []
    B(p, "plinth", (11.6, 0.3, 7.4), (0, 0.15, 0), plinth, bevel=0.05)
    B(p, "walls", (11.2, 4.6, 7.0), (0, 2.6, 0), wall)
    B(p, "roof", (11.6, 0.3, 7.4), (0, 5.05, 0), roof, bevel=0.05)
    B(p, "parapet", (11.8, 0.7, 0.3), (0, 5.45, 3.6), wall, bevel=0.05)
    B(p, "sign-band", (7.6, 0.9, 0.16), (0, 4.45, 3.6), sign, bevel=0.05)
    B(p, "sign-trim", (7.8, 0.08, 0.2), (0, 3.97, 3.6), gold)
    # Striped awning: sloped strips over the shop windows.
    n = 10
    for i in range(n):
        x0 = -5.2 + 10.4 * i / n
        x1 = x0 + 10.4 / n
        prism_x(p, f"awning-{i}", [(3.5, 3.75), (5.0, 3.1), (5.0, 2.98), (3.5, 3.63)], x0, x1, red if i % 2 == 0 else white)
    kit.door_front(p, "door", 0, 1.4, 2.4, 3.5)
    for u in (-3.3, 3.3):
        kit.window(p, f"shop-{u}", "front", u, 1.9, 3.2, 2.0, 3.5)
    for face in ("left", "right"):
        kit.window(p, f"s-{face}", face, 0, 2.4, 1.4, 1.4, 5.6)
    return p, 3200


def tower():
    stone = k.mat("Tower stone", "#B9AE9B", 0.85)
    shaft = k.mat("Tower shaft", "#F3E6CF", 0.8)
    trim = k.mat("Tower trim", "#D9694F", 0.6)
    roof = k.mat("Tower roof", "#3E7C8E", 0.6)
    face = k.mat("Clock face", "#FBF6EC", 0.5)
    hand = k.mat("Clock hands", "#2B2F35", 0.5)
    gold = k.mat("Tower gold", "#FFC93C", 0.4)
    dark = k.mat("Belfry dark", "#2B3440", 0.8)
    p: list = []
    B(p, "base", (5.8, 2.0, 5.8), (0, 1.0, 0), stone, bevel=0.08)
    B(p, "shaft", (4.4, 12.0, 4.4), (0, 8.0, 0), shaft)
    for x in (-1, 1):
        for z in (-1, 1):
            B(p, f"pilaster-{x}-{z}", (0.6, 12.0, 0.6), (x * 2.1, 8.0, z * 2.1), stone)
    for y in (2.1, 7.0, 11.2):
        B(p, f"band-{y}", (4.9, 0.3, 4.9), (0, y, 0), trim, bevel=0.04)
    B(p, "cornice", (5.4, 0.4, 5.4), (0, 14.2, 0), trim, bevel=0.06)
    for ang in range(4):
        a = ang * math.pi / 2
        s, c = math.sin(a), math.cos(a)
        # Clock on each face.
        clock = k.disc_decal(p, f"clock-rim-{ang}", (0, 12.6, 2.23), (2.3, 2.3), gold, 1, 24)
        clock_face = k.disc_decal(p, f"clock-{ang}", (0, 12.6, 2.24), (2.0, 2.0), face, 1, 24)
        h1 = k.ribbon_decal(p, f"hand-h-{ang}", [(0, 12.6, 2.25), (0.45, 12.9, 2.25)], 0.12, hand, False)
        h2 = k.ribbon_decal(p, f"hand-m-{ang}", [(0, 12.6, 2.25), (0, 13.4, 2.25)], 0.09, hand, False)
        for obj in (clock, clock_face, h1, h2):  # decals sit at the world origin: rotating moves them to each face
            obj.rotation_euler[2] = a
        # Belfry opening on each face (boxes rotate about their own centre, so place them directly).
        size = (1.6, 1.6, 0.05) if ang % 2 == 0 else (0.05, 1.6, 1.6)
        B(p, f"belfry-{ang}", size, (2.21 * s, 9.2, 2.21 * c), dark)
    hipped(p, "roof", 2.9, 2.9, 0.12, 0.12, 14.4, 17.4, roof)
    k.add_tapered_segment(p, "finial", (0, 17.3, 0), (0, 18.0, 0), 0.10, 0.04, gold, 8, False)
    return p, 2600


def hq():
    wall = k.mat("HQ wall", "#F3EFE4", 0.8)
    roof = k.mat("HQ roof", "#3E9BD6", 0.5)
    rib = k.mat("HQ rib", "#2F7FB3", 0.5)
    stone = k.mat("Plinth", "#B9AE9B", 0.85)
    gold = k.mat("HQ gold", "#FFC93C", 0.4)
    dark = k.mat("HQ door", "#2B3440", 0.7)
    glass = k.mat("Glass", "#2B4A6B", 0.25)
    white = k.mat("HQ white", "#FBF6EC", 0.5)
    pole = k.mat("Flag pole", "#9AA3AC", 0.4)
    flag = k.mat("HQ flag", "#3E9BD6", 0.6)
    p: list = []
    B(p, "plinth", (20.4, 0.6, 14.4), (0, 0.3, 0), stone, bevel=0.08)
    # Quonset hall: half-ellipse loft along Z; front/back caps are the walls.
    arch = [(9.6 * math.cos(math.pi * i / 16), 0.6 + 8.2 * math.sin(math.pi * i / 16)) for i in range(17)]
    outline = [(-9.6, 0.6)] + [a for a in reversed(arch)][:-1]
    outline = arch[::-1] + []
    k.add_loft_z(p, "hall", [(-6.8, arch[::-1]), (6.8, arch[::-1])], [roof, wall],
                 face_material=lambda c, n: 1 if abs(n.z) > 0.9 else 0)
    hall = p[-1]
    fix_normals(hall)
    for z in (-5.1, -1.7, 1.7, 5.1):
        k.add_swept_tube(p, f"rib-{z}", [(9.75 * math.cos(math.pi * i / 16), 0.6 + 8.35 * math.sin(math.pi * i / 16), z)
                                          for i in range(17)], [0.16] * 17, [rib] * 16, 6, False)
    # Front: arched double door, windows, team emblem.
    door = [(-2.2, 0.6), (2.2, 0.6), (2.2, 3.6)] + [(2.2 * math.cos(math.pi * i / 8), 3.6 + 1.4 * math.sin(math.pi * i / 8)) for i in range(1, 8)] + [(-2.2, 3.6)]
    frame = [(x * 1.12, 0.6 + (y - 0.6) * 1.08) for x, y in door]
    k.poly_decal(p, "door-frame", frame, 6.83, gold, 1)
    k.poly_decal(p, "door", door, 6.86, dark, 1)
    B(p, "door-seam", (0.08, 4.2, 0.02), (0, 2.75, 6.88), gold)
    for x in (-6.0, -3.6, 3.6, 6.0):
        B(p, f"window-frame-{x}", (1.5, 1.7, 0.10), (x, 3.0, 6.84), white)
        B(p, f"window-{x}", (1.2, 1.4, 0.06), (x, 3.0, 6.88), glass)
    k.disc_decal(p, "emblem-ring", (0, 6.6, 6.86), (2.2, 2.2), gold, 1, 24)
    k.disc_decal(p, "emblem", (0, 6.6, 6.88), (1.8, 1.8), roof, 1, 24)
    B(p, "emblem-rail", (1.5, 0.12, 0.02), (0, 6.6, 6.90), white)
    k.disc_decal(p, "emblem-lamp", (0, 6.6, 6.91), (0.42, 0.42), gold, 1, 16)
    # Flag pole at the front-right corner.
    k.add_tapered_segment(p, "pole", (8.6, 0.6, 6.2), (8.6, 15.8, 6.2), 0.14, 0.10, pole, 10, False)
    k.add_ellipsoid(p, "pole-top", (0.4, 0.4, 0.4), (8.6, 15.9, 6.2), gold, 10, 5)
    wave = []
    for i in range(7):
        t = i / 6
        wave.append((8.6 - 3.2 * t, 15.4 - 0.9 * t * 0, 6.2 + 0.25 * math.sin(t * math.pi * 1.5)))
    fv, ff = [], []
    for i, (x, y, z) in enumerate(wave):
        h = 1.9 * (1 - 0.55 * i / 6)
        fv += [(x, y, z), (x, y - h, z)]
    for i in range(6):
        ff.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
    fl = k.add_mesh(p, "flag", fv, ff, [flag])
    k.apply_modifier(fl, "SOLIDIFY", thickness=0.05, offset=0.0)
    return p, 4200


# ---------------------------------------------------------------- trackside and props

def crossing_gate():
    yellow = k.mat("Crossing yellow", "#FFC93C", 0.5)
    black = k.mat("Crossing black", "#2B2F35", 0.6)
    steel = k.mat("Crossing steel", "#8A939C", 0.5)
    red = k.mat("Crossing lamp", "#E0483E", 0.4)
    p: list = []
    # Post at X +2.0 (the track side once placed); the arm runs along -X across the road.
    B(p, "base", (0.7, 0.3, 0.6), (2.0, 0.15, 0), black, bevel=0.05)
    B(p, "post", (0.26, 2.8, 0.26), (2.0, 1.7, 0), steel, bevel=0.03)
    for i in range(5):
        B(p, f"post-band-{i}", (0.28, 0.25, 0.28), (2.0, 0.6 + i * 0.5, 0), black if i % 2 else yellow)
    B(p, "lamp-box", (0.5, 0.5, 0.36), (2.0, 3.0, 0), black, bevel=0.06)
    k.add_tapered_segment(p, "lamp", (2.0, 3.0, 0.18), (2.0, 3.0, 0.26), 0.17, 0.17, red, 16, False)
    k.add_tapered_segment(p, "lamp-back", (2.0, 3.0, -0.18), (2.0, 3.0, -0.26), 0.17, 0.17, red, 16, False)
    k.add_tapered_segment(p, "pivot", (2.0, 1.2, 0.14), (2.0, 1.2, 0.30), 0.22, 0.22, yellow, 14, False)
    n = 8
    for i in range(n):
        x0 = 1.85 - 4.1 * i / n
        B(p, f"arm-{i}", (4.1 / n, 0.16, 0.14), (x0 - 4.1 / n / 2, 1.2, 0.22), yellow if i % 2 == 0 else black)
    k.add_ellipsoid(p, "arm-tip", (0.2, 0.2, 0.2), (-2.25, 1.2, 0.22), yellow, 10, 5)
    return p, 900


def crossing_sign():
    yellow = k.mat("Crossbuck yellow", "#FFC93C", 0.5)
    black = k.mat("Crossbuck black", "#2B2F35", 0.6)
    steel = k.mat("Sign post", "#8A939C", 0.5)
    white = k.mat("Plate white", "#F7F3E8", 0.5)
    p: list = []
    B(p, "base", (0.46, 0.20, 0.20), (0, 0.10, 0), black, bevel=0.04)
    B(p, "post", (0.14, 2.9, 0.14), (0, 1.45, 0), steel, bevel=0.02)
    for sgn in (-1, 1):
        a = math.atan2(0.9, 1.1) * sgn
        bar = B(p, f"bar-{sgn}", (1.30, 0.22, 0.06), (0, 2.55, 0.10), yellow, bevel=0.02)
        edge = B(p, f"bar-edge-{sgn}", (1.36, 0.28, 0.04), (0, 2.55, 0.07), black)
        for obj in (bar, edge):
            obj.rotation_euler[1] = a
    # Plate under the crossbuck: a simple generic train pictogram, so an upside-down sign reads clearly.
    B(p, "plate", (0.62, 0.40, 0.05), (0, 1.85, 0.08), white, bevel=0.02)
    for z in (0.106, -0.106):
        d = 1 if z > 0 else -1
        B(p, f"pict-body-{z}", (0.40, 0.14, 0.01), (0, 1.88, z * 1.0 + 0.08 * (d < 0) * 0), black)
        for x in (-0.12, 0.12):
            k.disc_decal(p, f"pict-wheel-{z}-{x}", (x, 1.77, z), (0.08, 0.08), black, 1, 10, facing=d)
    B(p, "plate-back", (0.62, 0.40, 0.03), (0, 1.85, 0.04), white)
    return p, 600


def parcel():
    card = k.mat("Parcel card", "#C08A55", 0.8)
    tape = k.mat("Parcel tape", "#D64545", 0.6)
    tag = k.mat("Parcel tag", "#F7F3E8", 0.6)
    p: list = []
    B(p, "box", (0.58, 0.44, 0.58), (0, 0.22, 0), card, bevel=0.03)
    B(p, "tape-x", (0.60, 0.46, 0.09), (0, 0.22, 0), tape)
    B(p, "tape-z", (0.09, 0.46, 0.60), (0, 0.22, 0), tape)
    k.add_ellipsoid(p, "bow-l", (0.16, 0.07, 0.10), (-0.07, 0.465, 0), tape, 10, 5)
    k.add_ellipsoid(p, "bow-r", (0.16, 0.07, 0.10), (0.07, 0.465, 0), tape, 10, 5)
    B(p, "tag", (0.16, 0.10, 0.012), (0.18, 0.30, 0.296), tag)
    return p, 600


def goal_flag():
    red = k.mat("Goal flag", "#E9573F", 0.6)
    pole = k.mat("Goal pole", "#6B6B6B", 0.5)
    gold = k.mat("Goal gold", "#FFC93C", 0.4)
    p: list = []
    B(p, "base", (0.30, 0.14, 0.20), (-0.66, 0.07, 0), pole, bevel=0.03)
    k.add_tapered_segment(p, "pole", (-0.66, 0.1, 0), (-0.66, 2.3, 0), 0.05, 0.04, pole, 10, False)
    k.add_ellipsoid(p, "finial", (0.16, 0.16, 0.16), (-0.66, 2.32, 0), gold, 12, 6)
    fv, ff = [], []
    for i in range(7):
        t = i / 6
        x = -0.62 + 1.38 * t
        z = 0.06 * math.sin(t * math.pi * 1.6)
        h = 0.78 * (1 - t) + 0.02
        fv += [(x, 2.24, z), (x, 2.24 - h, z)]
    for i in range(6):
        ff.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
    fl = k.add_mesh(p, "flag", fv, ff, [red])
    k.apply_modifier(fl, "SOLIDIFY", thickness=0.03, offset=0.0)
    return p, 400


def rock():
    grey = k.mat("Rock", "#8E8E8E", 0.9)
    light = k.mat("Rock top", "#A7A49D", 0.9)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    rng = random.Random(7)
    for v in bm.verts:
        v.co *= 1.0 + rng.uniform(-0.12, 0.12)
    mesh = bpy.data.meshes.new("rock")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("rock", mesh)
    bpy.context.collection.objects.link(obj)
    obj.scale = (1.0, 0.8, 0.75)  # blender axes: x, y (= -Z), z (= up)
    obj.location = (0, 0, 0.45)
    mesh.materials.append(grey)
    mesh.materials.append(light)
    k.active(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bisect(plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    for poly in mesh.polygons:
        poly.material_index = 1 if poly.normal.z > 0.6 else 0
    return [obj], 400


BUILDERS = {"house-a": house_a, "house-b": house_b, "house-c": house_c, "shop": shop, "tower": tower, "hq": hq,
            "crossing-gate": crossing_gate, "crossing-sign": crossing_sign, "parcel": parcel,
            "goal-flag": goal_flag, "rock": rock}

names = [a for a in sys.argv[1:] if a in BUILDERS] or list(BUILDERS)
for name in names:
    k.reset()
    parts, budget = BUILDERS[name]()
    model = k.join(parts, name)
    k.smooth_by_angle(model, 30)
    k.normalize(model, None)
    k.export(model, name, budget, "world", 250)
