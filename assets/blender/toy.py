"""Stage 5-2 (おもちゃのまち) — Claude Code. Ticket 0019.

The crafted look (つくりこみ) of chapters 1-4 (sky.py, volcano.py, river.py, village.py and snow.py, whose helpers this
script uses): flat colours (the game bakes each model into one draw call), round friendly shapes. A toy town on a big
pastel play mat: building blocks with rounded edges in bright toy colours, silver screws, gold wind-up keys. Pale
colours keep a little of their own colour as light (GLOW), so cream and white stay bright on their shaded side.
Faces are two dot eyes at most (the chicks also a short beak; the band and the block folk are toy figures); the car,
the block train, the paper plane and the spinning fork's flag have no face. Nothing is modelled on a known toy: no
studs on any block, no C hands, no nutcracker or guard (the band wear soft berets and mint jackets), the car is long
on four small wheels of the same size, the block train has no chimney, the castle is stubby stacked blocks; no
letters, crests or marks (the flags carry a star).

Models (same names, origins and orientation as the code stand-ins they replace, sizes within 0.1 m of theirs, so the
stage JSON does not change; origin at the bottom centre, +Z forward, the model's own left is +X):
- block-house-a 8.49 x 10.2 x 8.49 (a yellow block, a coral pyramid roof, round windows, the door +Z), block-house-b
  6.8 x 12 x 6.8 (a blue round block, a mint cone roof), block-house-c 12 x 8.8 x 4.06 (a block arch: two pink
  pillars, a coral lintel, a yellow half-round on top).
- screw-post 1.2 x 7.94 x 1.2: a silver screw lamp post: a nut at its foot, the shank's thread in two silvers, a flat
  slotted head and a round yellow lamp with a little flat top (5-2's short one carries record ① on it).
- screw-tower 23.64 x 31.5 x 24: the big screw in the middle of the spiral: a washer on the mat, the shank (radius 6.2)
  with five turns of thread out to 8 m (the spiral's rail runs at 30 m round it), a round head of 12 m with a cross on top.
- windup-key 0.66 x 0.52 x 0.1: a gold key (two round lobes on a hub, a short shaft; its foot is the origin).
- windup-chick, windup-chick-back 0.93 x 1.14 x 1.0 / 0.95: a round yellow chick (dot eyes, a short orange beak, little
  wings and feet), a gold key in its back (-Z); "-back" leans back and its key has Sakasa's pink swirl.
- windup-car, windup-car-back 1.38 x 1.6 x 2.9: a long light blue car with a lighter cabin, four small dark wheels of
  the same size, a big gold key on the roof turned along the car (-back: the pink swirl on both sides of it). No lamps.
- band-flag, band-trumpet, band-glock, band-cymbal, band-drum (1.36 x 2.8 x 0.78, 0.98 x 2.02 x 1.32, 0.98 x 2.02 x
  1.12, 1.03 x 2.02 x 0.87, 0.98 x 2.02 x 1.49): toy players, the origin between their feet: a round mint jacket, a
  cream head with dot eyes, a soft blue beret, a key in the back, and their instrument (a round yellow flag with a
  star, a yellow trumpet, a rainbow glockenspiel, gold cymbals, a white drum with red rims).
- spin-turntable 12 x 1.27 x 12.41: a round block striped yellow and blue, a pink ring on its cream top, three big keys
  standing at its rim. spin-arrow 0.44 x 4.92 x 3.82: two nodes, "spin-pole" (cream) and "spin-flag" (the arrow,
  pointing +Z, and the ball on top: its own red material, which the game tints green). spin-star 1.81 x 3.05 x 0.16.
- ball-pit 24 x 2.5 x 24: a light blue rim round a bed of coloured balls. toy-ball 0.71 across (icosahedron).
- toybox-lid 16.4 x 14.94 x 5.48: the box's front round a 10 x 9 m mouth (as the game's box inside), the lid open
  back over -Z; +Z is the outside.
- toy-slide-rail 0.2 x 1.2 x 4, sign-slide-toy 1 x 2.3 x 0.15 (a pink slide on a white board, picture +Z).
- toy-castle 40.8 x 28 x 30.8: stacked blocks in lavender, pink and cream, four round towers with cone roofs and
  star flags, the gate +Z.
- castle-key, castle-key-back 8.7 x 7.05 x 1.2 / 1.22: the castle's big key (rings in the XY plane); -back: the swirl
  on both faces.
- block-folk-a 0.68 x 1.9 x 0.72, block-folk-b 0.68 x 2 x 0.72: wooden peg people, eyes only (b wears a little hat).
- toy-block-train 0.84 x 1.1 x 2.3: three pastel blocks on a plank on six round wheels, front +Z.
- toy-plane 0.6 x 0.12 x 0.8: a folded paper plane (white on top, light blue under), nose +Z.
- toy-shelf 8 x 7 x 2 (front +Z, its top at 6.98: record ③ waits there), toy-blocks-loose 8.3 x 2.26 x 4.47.
- Records gold-screw 0.4 x 0.78 x 0.4 (standing on its head), glow-marble 0.3 (glows), tin-key 0.74 x 0.59 x 0.11.
Output: public/models/<name>.glb and assets/previews/<name>.png.
Run: python3 scripts/run-bpy.py assets/blender/toy.py [-- name ...]
"""
from __future__ import annotations

from pathlib import Path
import math
import random
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import sky as s  # noqa: E402  (chapter 1's crafted helpers: fix_normals, ring_faces, plate, slab, rounded_rect...)
import volcano as v  # noqa: E402  (chapter 2's: Paint, painted, lathe, lathe_y, sticker, eye, look, scale_to, preview...)
import river as rv  # noqa: E402  (chapter 3's: body, painted_clay, recolour)
import village as vl  # noqa: E402  (chapter 4's: arch, loft, tube)
import snow as sn  # noqa: E402  (chapter 4's: ball, lathe_at)
import meadow as md  # noqa: E402  (export and preview of several nodes)
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

TAU = 2 * math.pi

# ---------------------------------------------------------------- palette (ticket 0019)

YELLOW, BLUE, PINK, CORAL, MINT = "#F6D365", "#8FD3F4", "#F7A8C4", "#EF6F6C", "#7FD8BE"
YELLOW_DEEP, BLUE_DEEP, PINK_DEEP, MINT_DEEP = "#EDC04A", "#6FBDE6", "#EE8DB0", "#62C4A8"
WINDOW, FRAME, CREAM, WHITE = "#FFE27A", "#FFFDF6", "#FFF1D6", "#FFFFFF"
WOOD, WOOD_DARK, WOOD_LIGHT, DOOR = "#D9A86C", "#B7874E", "#E6BE88", "#B7874E"
SILVER, SILVER_LIGHT, SILVER_DARK, STEEL, HEAD = "#C9D3DC", "#E8EDF2", "#A3AFBB", "#8A96A2", "#D9E1E8"
GOLD, GOLD_LIGHT, GOLD_PALE, GOLD_DEEP = "#C9A227", "#E5B93C", "#F5D873", "#B08A1C"
TIN, TIN_LIGHT, TIN_DARK = "#B9C4CF", "#D6DEE6", "#98A4B1"
CHICK, CHICK_SHADE, CHICK_BELLY, BEAK = "#FFD84D", "#F2C230", "#FFE88A", "#FF9A3C"
CAR, CAR_TOP, CAR_GLASS, TYRE, HUB = "#6EC6FF", "#A8DDFF", "#DFF3FF", "#3A3A4A", "#E8EDF2"
JACKET, JACKET_DEEP, FACE, BERET, TROUSERS, SHOE = "#7FD8BE", "#66C7AA", "#FFF1D6", "#6C8CFF", "#4A5A8A", "#3B4466"
BRASS, BRASS_DEEP, DRUM, DRUM_RIM = "#F2C14E", "#DDA736", "#FFFFFF", "#E0474C"
LAVENDER, LAVENDER_DEEP, CASTLE_PINK = "#B8A4FF", "#A08BEF", "#FFD6E8"
SWIRL, SWIRL_LIGHT = "#E0569F", "#FF8FC8"
SKIN, HAIR = "#F4DDB8", "#9A6A44"
PIT_RIM, PIT_TOP, PIT_FLOOR = "#8FD3F4", "#BDE6FA", "#CFEFFF"
PAPER, PAPER_BLUE = "#FFFFFF", "#A8DDFF"
MARBLE, MARBLE_LIGHT, MARBLE_SWIRL = "#9FE8FF", "#DDF8FF", "#3AA8E0"
EYE = v.EYE
BALLS = ["#EF6F6C", "#F6D365", "#7FD8BE", "#6EC6FF", "#B8A4FF", "#FF9FC8"]

# Every colour keeps some of its own colour as light (as the snow of chapter 4 does): the game lights physically, and a
# toy colour's shaded side otherwise turns a dull olive or grey on the bright play mat. Bright toy colours keep 0.3,
# pale ones a little more, metal less (it keeps its shine), the dark bits (eyes, tyres, shoes, wood) little or none;
# the lamps and windows look lit, the marble glows in the dark toy box.
GLOW_DEFAULT = 0.3
GLOW = {CREAM: 0.36, FRAME: 0.4, WHITE: 0.4, WINDOW: 0.5, PAPER: 0.4, DRUM: 0.38, FACE: 0.36, SKIN: 0.3, CASTLE_PINK: 0.34,
        PIT_TOP: 0.34, PIT_FLOOR: 0.34, CAR_GLASS: 0.38, SWIRL: 0.35, SWIRL_LIGHT: 0.35,
        SILVER: 0.18, SILVER_LIGHT: 0.22, SILVER_DARK: 0.14, HEAD: 0.2, STEEL: 0.08, TIN: 0.2, TIN_LIGHT: 0.22, TIN_DARK: 0.14,
        GOLD: 0.22, GOLD_LIGHT: 0.26, GOLD_PALE: 0.32, GOLD_DEEP: 0.12,
        WOOD: 0.22, WOOD_LIGHT: 0.25, WOOD_DARK: 0.12, DOOR: 0.12, HAIR: 0.12, TYRE: 0.0, SHOE: 0.05, TROUSERS: 0.12, EYE: 0.0,
        MARBLE: 0.55, MARBLE_LIGHT: 0.6, MARBLE_SWIRL: 0.5}


class Paint(v.Paint):
    """volcano.Paint, every colour not in its table glowing by GLOW_DEFAULT."""

    def __call__(self, hex_color: str):
        return v.mat(f"Flat {hex_color}", hex_color, self.roughness, self.glow.get(hex_color, GLOW_DEFAULT))


def paints(roughness=0.7, **extra):
    table = dict(GLOW)
    table.update(extra)
    return Paint(roughness, glow=table)


# ---------------------------------------------------------------- helpers (glTF coordinates)

def rot_y(p, yaw):
    """p turned about the vertical by yaw (radians; +Z toward +X)."""
    x, y, z = p
    c, sn_ = math.cos(yaw), math.sin(yaw)
    return (x * c + z * sn_, y, -x * sn_ + z * c)


def area2(outline):
    return sum(outline[i][0] * outline[(i + 1) % len(outline)][1] - outline[(i + 1) % len(outline)][0] * outline[i][1]
               for i in range(len(outline)))


def flat_poly(parts, name, outline, center, u, w, m, lift=0.0):
    """A flat polygon (a fan from its centroid: star-shaped outlines) in the plane through `center` spanned by u and w,
    facing u x w, `lift` m out along that normal."""
    u, w = Vector(u).normalized(), Vector(w).normalized()
    nrm = u.cross(w).normalized()
    if area2(outline) < 0:
        outline = list(outline)[::-1]
    c = Vector(center) + nrm * lift
    ca = sum(p[0] for p in outline) / len(outline)
    cb = sum(p[1] for p in outline) / len(outline)
    verts = [tuple(c + u * ca + w * cb)] + [tuple(c + u * a + w * b) for a, b in outline]
    n = len(outline)
    faces = [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
    return k.add_mesh(parts, name, verts, faces, [m])


def ring_plate(parts, name, center, u, w, r_out, r_in, thick, n, m, phase=0.0):
    """A flat ring (a washer) in the plane of u and w, `thick` across it: closed, wound outward."""
    u, w = Vector(u).normalized(), Vector(w).normalized()
    nrm = u.cross(w).normalized()
    c = Vector(center)
    verts = []
    for side in (-1, 1):
        for r in (r_out, r_in):
            for i in range(n):
                a = phase + TAU * i / n
                verts.append(tuple(c + u * (math.cos(a) * r) + w * (math.sin(a) * r) + nrm * (side * thick / 2)))
    fo, fi, bo, bi = 0, n, 2 * n, 3 * n
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces += [(fo + i, fo + j, fi + j, fi + i), (bo + i, bi + i, bi + j, bo + j), (fo + i, bo + i, bo + j, fo + j),
                  (fi + i, fi + j, bi + j, bi + i)]
    return s.solid(parts, name, verts, faces, [m], None, [False] * len(faces))


def obox(parts, name, center, ax, ay, half, m):
    """A box at `center` with its sides along ax, ay and ax x ay (half sizes `half`): 12 triangles."""
    ax, ay = Vector(ax).normalized(), Vector(ay).normalized()
    az = ax.cross(ay).normalized()
    c = Vector(center)
    hx, hy, hz = half
    verts = [tuple(c + ax * (sx * hx) + ay * (sy * hy) + az * (sz * hz)) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return s.solid(parts, name, verts, faces, [m], None, [False] * 6)


def circle(n, r, phase=0.0, cx=0.0, cy=0.0):
    return [(cx + math.cos(phase + TAU * i / n) * r, cy + math.sin(phase + TAU * i / n) * r) for i in range(n)]


def star(r, inner=0.45, cx=0.0, cy=0.0):
    """A five-pointed star outline (a point straight up)."""
    pts = []
    for i in range(10):
        a = math.pi / 2 + TAU * i / 10
        rr = r if i % 2 == 0 else r * inner
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    return pts


def chamfer_rect(w, h, c, cx=0.0, cy=0.0):
    """A w x h rectangle with its corners cut by c (8 points)."""
    x, y = w / 2, h / 2
    return [(cx + a, cy + b) for a, b in ((x, y - c), (x - c, y), (-x + c, y), (-x, y - c), (-x, -y + c), (-x + c, -y), (x - c, -y),
                                          (x, -y + c))]


def swirl(parts, name, center, u, w, radius, m, turns=1.9, steps=14, width=None, lift=0.0):
    """Sakasa's swirl: a flat spiral ribbon in the plane of u and w (facing u x w), from the middle out to `radius`."""
    u, w = Vector(u).normalized(), Vector(w).normalized()
    nrm = u.cross(w).normalized()
    c = Vector(center) + nrm * lift
    width = width or radius * 0.2
    verts = []
    for i in range(steps + 1):
        t = i / steps
        a = TAU * turns * t
        r = radius * (0.12 + 0.88 * t)
        half = width / 2 * (0.6 + 0.4 * t)
        for d in (-half, half):
            rr = r + d
            verts.append(tuple(c + u * (math.cos(a) * rr) + w * (math.sin(a) * rr)))
    faces = []
    for i in range(steps):
        a, b = 2 * i, 2 * i + 2
        faces.append((a, b, b + 1, a + 1))
    obj = k.add_mesh(parts, name, verts, faces, [m], smooth=False)
    for poly in obj.data.polygons:
        if k.gltf(poly.normal).dot(nrm) < 0:
            poly.flip()
    obj.data.update()
    return obj


def key(parts, paint, colour, base, s_=1.0, ux=(1.0, 0.0, 0.0), uy=(0.0, 1.0, 0.0), plane_v=None, holes=False, lobe_n=8,
        swirl_faces=(), shaft=0.27, reach=0.37, shaft_n=4, hub="box", tag="key"):
    """A wind-up key from `base` (the foot of its shaft) along uy: a shaft, a hub and two round lobes either side of it
    along ux, in the plane of ux and `plane_v` (uy for a key as it is made; another for a key seen face-on from behind,
    its bow across the shaft). 0.66 x 0.52 x 0.1 at s_ 1 standing up. `holes`: ring lobes. `hub`: "box", or "disc" (a
    round hub that carries Sakasa's pink swirl, on the faces `swirl_faces` (+1 / -1 along ux x plane_v))."""
    ux_, uy_ = Vector(ux).normalized(), Vector(uy).normalized()
    pv = Vector(plane_v).normalized() if plane_v else uy_
    nrm = ux_.cross(pv).normalized()
    b = Vector(base)
    m = paint(colour)
    k.add_tapered_segment(parts, f"{tag}-shaft", tuple(b), tuple(b + uy_ * (shaft * s_)), 0.038 * s_, 0.038 * s_, m, vertices=shaft_n,
                          smooth=False)
    mid = b + uy_ * (reach * s_)
    if hub == "disc":
        s.plate(parts, f"{tag}-hub", tuple(mid), ux_, pv, circle(8, 0.125 * s_, math.pi / 8), 0.1 * s_, [m])
    else:
        obox(parts, f"{tag}-hub", tuple(b + uy_ * ((reach - 0.03) * s_)), ux_, pv, (0.075 * s_, 0.075 * s_, 0.05 * s_), m)
    for side in (-1, 1):
        c = tuple(mid + ux_ * (side * 0.18 * s_))
        if holes:
            ring_plate(parts, f"{tag}-lobe-{side}", c, ux_, pv, 0.15 * s_, 0.075 * s_, 0.08 * s_, lobe_n, m, phase=math.pi / lobe_n)
        else:
            s.plate(parts, f"{tag}-lobe-{side}", c, ux_, pv, circle(lobe_n, 0.15 * s_, math.pi / lobe_n), 0.08 * s_, [m])
    for f in swirl_faces:
        swirl(parts, f"{tag}-swirl-{f}", tuple(mid + nrm * (f * 0.05 * s_)), ux_ * f, pv, 0.115 * s_, paint(SWIRL), turns=1.7, steps=12,
              width=0.032 * s_, lift=0.004 * s_)
    return parts


# The key in a toy's back, seen face-on from behind: its shaft straight out of the back (-Z), the bow across it.
BACK_KEY = dict(ux=(1.0, 0.0, 0.0), uy=(0.0, 0.0, -1.0), plane_v=(0.0, 1.0, 0.0), shaft=0.12, reach=0.15)


def windows_ring(parts, paint, center, normal, r, segments=10, frame=FRAME, glass=WINDOW, lift=0.02, tag="win", body=None):
    """A round window: a light frame disc and the glass on it, pressed on a face at `center` facing `normal` (on a
    curved `body`: pressed onto its surface)."""
    a = v.sticker(parts, f"{tag}-frame", center, normal, (2 * r, 2 * r), paint(frame), segments, lift=lift)
    g = v.sticker(parts, f"{tag}-glass", center, normal, (1.56 * r, 1.56 * r), paint(glass), segments, lift=lift + 0.015)
    if body is not None:
        v.hug(a, body, 0.02)
        v.hug(g, body, 0.04)


def arch_door(parts, paint, x, y0, z, w, h, colour=DOOR, knob=True, tag="door", thick=0.12):
    """An arched door standing on y0 at the face z (+Z), a small gold knob."""
    s.plate(parts, tag, (x, y0, z), (1, 0, 0), (0, 1, 0), vl.arch(w, h, 7), thick, [paint(colour)])
    if knob:
        v.sticker(parts, f"{tag}-knob", (x + w * 0.3, y0 + h * 0.42, z + thick / 2), (0, 0, 1), (0.16 * w / 1.4, 0.16 * w / 1.4),
                  paint(GOLD_LIGHT), 6, lift=0.01)


# ---------------------------------------------------------------- block houses

def block_house_a():
    """つみきの いえ A: a yellow block with rounded edges under a coral pyramid roof (its eaves a little out over the
    walls), a pink chimney block, round yellow windows in white frames on every side, an arched wooden door +Z."""
    paint = paints()
    parts: list = []
    k.add_box(parts, "walls", (8.0, 7.0, 8.0), (0.0, 3.5, 0.0), paint(YELLOW), bevel=0.28, segments=1)
    s.slab(parts, "eaves", [(4.24, 4.24), (-4.24, 4.24), (-4.24, -4.24), (4.24, -4.24)], 6.95, 7.3, paint(CORAL), bevel=0.08)
    s.pyramid(parts, "roof", (0.0, 7.3, 0.0), (0.0, 10.2, 0.0), (3.98, 0.0, 3.98), (3.98, 0.0, -3.98), paint(CORAL))
    k.add_box(parts, "chimney", (0.9, 1.5, 0.9), (2.0, 9.0, -1.6), paint(PINK))
    arch_door(parts, paint, 0.0, 0.0, 4.0, 1.7, 2.9)
    k.add_box(parts, "step", (2.2, 0.18, 0.3), (0.0, 0.09, 4.14), paint(CREAM))
    for x in (-2.35, 2.35):
        windows_ring(parts, paint, (x, 4.5, 4.0), (0, 0, 1), 0.85, 12, tag=f"win-front-{x}")
    for sx in (-1, 1):
        windows_ring(parts, paint, (sx * 4.0, 4.5, 0.0), (sx, 0, 0), 0.85, 12, tag=f"win-side-{sx}")
    windows_ring(parts, paint, (0.0, 4.5, -4.0), (0, 0, -1), 0.85, 12, tag="win-back")
    return parts, 300


def block_house_b():
    """つみきの いえ B: a blue round block, a mint cone roof with a yellow bead on top, an arched door +Z under a round
    window, round windows at its sides."""
    paint = paints()
    parts: list = []
    seg = 16
    walls = v.lathe_y(parts, "walls", [(0.0, 3.0, BLUE), (8.0, 3.0, BLUE)], (0.0, 0.0), seg, paint, smooth=lambda c, n: abs(n.y) < 0.9)
    v.lathe_y(parts, "roof", [(7.95, 3.4, MINT), (8.3, 3.4, MINT), (11.62, 0.0, MINT)], (0.0, 0.0), seg, paint,
              smooth=lambda c, n: n.y > 0.2 and n.y < 0.95)
    sn.ball(parts, "bead", (0.0, 11.78, 0.0), 0.22, paint, lambda y: YELLOW, segments=6, rings=3)
    # The door on the curved wall: a plate reaching back into it.
    arch_door(parts, paint, 0.0, 0.0, 3.0, 1.5, 2.6, thick=0.26)
    windows_ring(parts, paint, (0.0, 5.3, 3.0), (0, 0, 1), 0.7, 12, lift=0.09, tag="win-front", body=walls)
    for sx in (-1, 1):
        windows_ring(parts, paint, (sx * 3.0, 4.2, 0.0), (sx, 0, 0), 0.7, 12, lift=0.09, tag=f"win-side-{sx}", body=walls)
    return parts, 300


def block_house_c():
    """つみきの いえ C: a building-block arch: two pink pillars with round windows, a coral lintel across them, a yellow
    half-round block on top."""
    paint = paints()
    parts: list = []
    for x in (-4.5, 4.5):
        k.add_box(parts, f"pillar-{x}", (3.0, 5.0, 4.0), (x, 2.5, 0.0), paint(PINK), bevel=0.2, segments=1)
    k.add_box(parts, "lintel", (12.0, 1.6, 4.0), (0.0, 5.8, 0.0), paint(CORAL), bevel=0.2, segments=1)
    half = [(math.cos(math.pi * i / 9) * 2.2, math.sin(math.pi * i / 9) * 2.2) for i in range(10)]
    s.plate(parts, "half-round", (0.0, 6.6, 0.0), (1, 0, 0), (0, 1, 0), half, 3.9, [paint(YELLOW)])
    for x in (-4.5, 4.5):
        for sz in (-1, 1):
            windows_ring(parts, paint, (x, 3.0, sz * 2.0), (0, 0, sz), 0.72, 10, lift=0.015, tag=f"win-{x}-{sz}")
    windows_ring(parts, paint, (0.0, 7.55, 1.95), (0, 0, 1), 0.5, 10, lift=0.015, tag="win-top")
    return parts, 300


# ---------------------------------------------------------------- screws

def helix(parts, name, radius, y0, y1, turns, per_turn, width, m, radius_top=None):
    """A screw's thread as a band winding round a shank (`radius` out, narrowing to `radius_top`), facing out: a ridge
    seen from outside."""
    steps = max(2, round(turns * per_turn))
    verts = []
    for i in range(steps + 1):
        t = i / steps
        a = TAU * turns * t
        y = y0 + (y1 - y0) * t
        r = radius + ((radius_top if radius_top is not None else radius) - radius) * t
        for dy in (-width / 2, width / 2):
            verts.append((math.cos(a) * r, y + dy, math.sin(a) * r))
    faces = [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(steps)]
    obj = k.add_mesh(parts, name, verts, faces, [m], smooth=True)
    for poly in obj.data.polygons:
        c = k.gltf(poly.center)
        if k.gltf(poly.normal).dot(Vector((c.x, 0.0, c.z))) < 0:
            poly.flip()
    obj.data.update()
    return obj


def screw_post():
    """ねじの はしら: a silver screw standing up as a lamp post: a hexagonal nut at its foot, the shank's thread in two
    silvers winding up it, a flat round head with a slot, and a round yellow lamp on top (a little flat cap)."""
    paint = paints(0.45)
    parts: list = []
    v.lathe_y(parts, "nut", [(0.0, 0.6, SILVER_DARK), (0.38, 0.6, SILVER_DARK)], (0.0, 0.0), 6, paint)
    v.lathe_y(parts, "shank", [(0.36, 0.29, SILVER), (6.84, 0.29, SILVER)], (0.0, 0.0), 8, paint, smooth=lambda c, n: abs(n.y) < 0.9)
    helix(parts, "thread", 0.315, 0.62, 6.62, 2.6, 10, 0.15, paint(SILVER_DARK))
    v.lathe_y(parts, "head", [(6.8, 0.6, SILVER_LIGHT), (7.12, 0.6, SILVER_LIGHT), (7.22, 0.5, SILVER_LIGHT)], (0.0, 0.0), 8, paint,
              smooth=lambda c, n: abs(n.y) < 0.9)
    k.add_box(parts, "slot", (0.86, 0.05, 0.12), (0.0, 7.235, 0.0), paint(STEEL))
    v.lathe_y(parts, "lamp", [(7.2, 0.13, STEEL), (7.32, 0.33, WINDOW), (7.72, 0.3, WINDOW), (7.94, 0.12, SILVER_LIGHT)],
              (0.0, 0.0), 6, paint, smooth=lambda c, n: abs(n.y) < 0.8)
    return parts, 200


def screw_tower():
    """らせんの まんなかの ねじ: a giant silver screw standing in the play mat: a washer, a smooth shank, five turns of
    a bold thread (light on top, darker underneath), and a round head with a dark cross on top."""
    paint = paints(0.4, **{SILVER: 0.06, SILVER_LIGHT: 0.14})
    parts: list = []
    seg = 24
    v.lathe_y(parts, "washer", [(0.0, 9.4, SILVER_DARK), (0.6, 9.4, SILVER), (0.9, 8.4, SILVER)], (0.0, 0.0), seg, paint,
              smooth=lambda c, n: abs(n.y) < 0.9)
    v.lathe_y(parts, "shank", [(0.7, 6.2, SILVER), (26.2, 6.2, SILVER)], (0.0, 0.0), seg, paint, smooth=lambda c, n: abs(n.y) < 0.9)
    # The thread: a ridge of triangular section wound five times from y 1.6 to 24.6, from inside the shank out to 8 m.
    steps, turns, y0, y1 = 120, 5.0, 1.6, 24.6
    rings = []
    for i in range(steps + 1):
        t = i / steps
        a = TAU * turns * t
        y = y0 + (y1 - y0) * t
        grow = min(1.0, min(t, 1 - t) * 10)  # the ends run out into the shank
        out = 6.0 + 2.0 * grow
        rings.append([(math.cos(a) * 5.9, y - 0.95, math.sin(a) * 5.9), (math.cos(a) * out, y + 0.1 * grow, math.sin(a) * out),
                      (math.cos(a) * 5.9, y + 0.95, math.sin(a) * 5.9)])
    verts, faces, tags = rv.body(rings)
    v.painted(parts, "thread", verts, faces, paint, lambda c, n: SILVER_LIGHT if n.y > 0.05 else SILVER_DARK,
              smooth=lambda c, n: True)
    v.lathe_y(parts, "head", [(25.9, 6.6, SILVER_DARK), (26.3, 11.5, HEAD), (26.8, 12.0, HEAD), (30.6, 12.0, HEAD), (31.3, 11.3, HEAD),
                              (31.5, 10.6, HEAD)], (0.0, 0.0), seg, paint, smooth=lambda c, n: abs(n.y) < 0.95)
    # The cross: two dark bars on the head (a plus is not star-shaped round its middle for one fan).
    for i, (a, b) in enumerate((((9.0, 1.1), (-9.0, -1.1)), ((1.1, 9.0), (-1.1, -9.0)))):
        rect = [(a[0], a[1]), (b[0], a[1]), (b[0], b[1]), (a[0], b[1])]
        flat_poly(parts, f"cross-{i}", rect, (0.0, 31.5, 0.0), (1, 0, 0), (0, 0, -1), paint(STEEL), lift=0.02 + 0.01 * i)
    return parts, 1500


# ---------------------------------------------------------------- wind-up toys

def windup_key():
    """ぜんまいの ねじ: a gold wind-up key (the toys and the band carry one in their back)."""
    paint = paints(0.4)
    return key([], paint, GOLD, (0.0, 0.0, 0.0), 1.0, lobe_n=8), 80


def chick(back):
    """ぜんまいの ひよこ: a round yellow chick, body and head in one soft shape (a paler belly, darker wings and tail),
    two dot eyes and a short orange beak (no mouth), little orange feet, a gold key in its back. `back`: Sakasa's pink
    swirl on the key (the model is leant back afterwards)."""
    paint = paints(0.6)
    vols = [((0.8, 0.74, 0.84), (0.0, 0.44, -0.02)),           # body
            ((0.54, 0.52, 0.52), (0.0, 0.86, 0.1)),            # head
            ((0.16, 0.36, 0.42), (0.39, 0.5, -0.04)),          # wings
            ((0.16, 0.36, 0.42), (-0.39, 0.5, -0.04)),
            ((0.3, 0.22, 0.26), (0.0, 0.58, -0.4)),            # tail
            ((0.42, 0.4, 0.3), (0.0, 0.4, 0.2))]               # belly
    colours = [lambda c, n: CHICK_SHADE if n.y < -0.5 else CHICK, CHICK, CHICK_SHADE, CHICK_SHADE, CHICK_SHADE, CHICK_BELLY]
    body = rv.painted_clay(paint, vols, colours, "chick-body", 212, 0.02)
    parts: list = [body]
    tree = k.world_tree(body)
    head = Vector((0.0, 0.86, 0.1))
    for side in (-1, 1):
        v.eye(parts, paint, tree, tuple(head), v.look(side * math.radians(28), math.radians(10)), (0.075, 0.09), f"eye-{side}", body)
    tip = head + Vector((0.0, -0.05, 0.4))
    root = head + Vector((0.0, -0.03, 0.2))
    k.add_tapered_segment(parts, "beak", tuple(root), tuple(tip), 0.075, 0.0, paint(BEAK), vertices=5, smooth=False)
    s.fix_normals(parts[-1])
    for side in (-1, 1):
        s.plate(parts, f"foot-{side}", (side * 0.14, 0.025, 0.12), (1, 0, 0), (0, 0, -1),
                [(-0.08, -0.1), (0.08, -0.1), (0.1, 0.06), (0.0, 0.14), (-0.1, 0.06)], 0.05, [paint(BEAK)])
    key(parts, paint, GOLD, (0.0, 0.4, -0.38), 0.62, lobe_n=7, hub="disc", swirl_faces=(-1,) if back else (), **BACK_KEY)
    return parts, 400


def car(back):
    """ぜんまいの くるま: a long light blue car (rounded, a white stripe along each side), a lighter cabin set back with
    pale windows all round, four small dark wheels of the same size with light hubs, a gold key on the roof turned
    along the car. No lamps, no grille: no face. `back`: the pink swirl on both sides of the key."""
    paint = paints(0.5)
    parts: list = []
    k.add_box(parts, "body", (1.3, 0.46, 2.9), (0.0, 0.43, 0.0), paint(CAR), bevel=0.14, segments=1)
    k.add_box(parts, "cabin", (1.1, 0.44, 1.36), (0.0, 0.86, -0.22), paint(CAR_TOP), bevel=0.1, segments=1)
    glass = paint(CAR_GLASS)
    for sx in (-1, 1):
        flat_poly(parts, f"window-{sx}", [(-0.5, 0.0), (0.5, 0.0), (0.44, 0.21), (-0.44, 0.21)], (sx * 0.551, 0.76, -0.22),
                  (0, 0, -sx), (0, 1, 0), glass)
        flat_poly(parts, f"stripe-{sx}", [(-1.28, -0.04), (1.28, -0.04), (1.28, 0.04), (-1.28, 0.04)], (sx * 0.651, 0.47, 0.0),
                  (0, 0, -sx), (0, 1, 0), paint(WHITE))
    for sz in (-1, 1):
        flat_poly(parts, f"screen-{sz}", [(-0.42, 0.0), (0.42, 0.0), (0.36, 0.2), (-0.36, 0.2)], (0.0, 0.76, -0.22 + sz * 0.681),
                  (sz, 0, 0), (0, 1, 0), glass)
    for x in (-0.6, 0.6):
        for z in (-0.95, 0.95):
            k.add_tapered_segment(parts, f"wheel-{x}-{z}", (x - 0.07 * (1 if x > 0 else -1), 0.2, z), (x + 0.09 * (1 if x > 0 else -1), 0.2, z),
                                  0.2, 0.2, paint(TYRE), vertices=8, smooth=False)
            v.sticker(parts, f"hub-{x}-{z}", (x + 0.09 * (1 if x > 0 else -1), 0.2, z), (1 if x > 0 else -1, 0, 0), (0.17, 0.17), paint(HUB),
                      6, lift=0.005)
    for sz in (-1, 1):
        k.add_box(parts, f"bumper-{sz}", (1.12, 0.12, 0.1), (0.0, 0.32, sz * 1.42), paint(WHITE))
    key(parts, paint, GOLD, (0.0, 1.05, -0.22), 1.1, ux=(0.0, 0.0, 1.0), lobe_n=8, hub="disc" if back else "box",
        swirl_faces=(-1, 1) if back else ())
    return parts, 500


# ---------------------------------------------------------------- the toy band

def player(paint, parts, arms):
    """One player of the toy band, the origin between its feet: navy legs and shoes, a round mint jacket with a cream
    collar and two yellow buttons, a cream head with two dot eyes, a soft blue beret tipped to one side, a gold key in
    its back. `arms`: the hands' places (left +X, right -X)."""
    for sx in (-1, 1):
        k.add_box(parts, f"shoe-{sx}", (0.17, 0.1, 0.26), (sx * 0.12, 0.05, 0.03), paint(SHOE))
        k.add_tapered_segment(parts, f"leg-{sx}", (sx * 0.12, 0.08, 0.0), (sx * 0.12, 0.56, 0.0), 0.085, 0.085, paint(TROUSERS),
                              vertices=6, smooth=True)
    jacket = v.lathe_y(parts, "jacket", [(0.5, 0.31, JACKET), (0.95, 0.35, JACKET), (1.26, 0.32, CREAM), (1.36, 0.2, CREAM)], (0.0, 0.0), 10,
                       paint, smooth=lambda c, n: abs(n.y) < 0.95)
    for i, y in enumerate((0.78, 1.05)):
        button = v.sticker(parts, f"button-{i}", (0.0, y, 0.35), (0, 0, 1), (0.07, 0.07), paint(BRASS), 6, lift=0.006)
        v.hug(button, jacket, 0.006)
    for (sx, hand) in zip((1, -1), arms):
        shoulder = (sx * 0.38, 1.21, 0.0)
        k.add_tapered_segment(parts, f"arm-{sx}", shoulder, hand, 0.08, 0.065, paint(JACKET_DEEP), vertices=6, smooth=True)
        k.add_ellipsoid(parts, f"hand-{sx}", (0.15, 0.15, 0.15), hand, paint(FACE), segments=5, rings=3)
    head = k.add_ellipsoid(parts, "head", (0.6, 0.58, 0.58), (0.0, 1.62, 0.0), paint(FACE), segments=10, rings=5)
    tree = k.world_tree(head)
    for sx in (-1, 1):
        v.eye(parts, paint, tree, (0.0, 1.62, 0.0), v.look(sx * math.radians(22), math.radians(8)), (0.065, 0.08), f"eye-{sx}", head)
    beret = k.add_ellipsoid(parts, "beret", (0.66, 0.2, 0.64), (0.04, 1.86, -0.03), paint(BERET), segments=10, rings=4)
    beret.rotation_euler = (math.radians(-6), math.radians(12), 0.0)  # tipped back and to its left
    k.add_tapered_segment(parts, "beret-tip", (0.08, 1.93, -0.02), (0.1, 2.02, -0.02), 0.035, 0.012, paint(BERET), vertices=4, smooth=False)
    key(parts, paint, GOLD, (0.0, 0.95, -0.3), 0.6, lobe_n=7, **BACK_KEY)


def band(name):
    """がくたい: a toy player and its instrument (see player)."""
    paint = paints(0.6)
    parts: list = []
    if name == "band-flag":
        player(paint, parts, [(0.42, 1.18, 0.2), (-0.36, 0.84, 0.06)])
        k.add_tapered_segment(parts, "pole", (0.42, 0.3, 0.2), (0.42, 2.62, 0.2), 0.035, 0.03, paint(WOOD_DARK), vertices=5, smooth=False)
        s.plate(parts, "flag", (0.42, 2.35, 0.2), (1, 0, 0), (0, 1, 0), circle(12, 0.45, math.pi / 12), 0.04, [paint(BRASS)])
        for f in (1, -1):
            flat_poly(parts, f"star-{f}", star(0.3), (0.42, 2.35, 0.2 + f * 0.02), (f, 0, 0), (0, 1, 0), paint(CORAL), lift=0.004)
    elif name == "band-trumpet":
        player(paint, parts, [(0.1, 1.42, 0.42), (-0.1, 1.42, 0.42)])
        k.add_tapered_segment(parts, "tube", (0.0, 1.47, 0.26), (0.0, 1.47, 0.64), 0.035, 0.035, paint(BRASS), vertices=5, smooth=True)
        k.add_tapered_segment(parts, "bell", (0.0, 1.47, 0.62), (0.0, 1.47, 0.9), 0.045, 0.16, paint(BRASS), vertices=10, smooth=True)
        k.add_box(parts, "valves", (0.06, 0.12, 0.16), (0.0, 1.54, 0.42), paint(BRASS_DEEP))
    elif name == "band-glock":
        player(paint, parts, [(0.3, 1.04, 0.42), (-0.3, 1.04, 0.42)])
        k.add_box(parts, "frame", (0.78, 0.06, 0.44), (0.0, 0.99, 0.5), paint(WOOD))
        for i, c in enumerate(BALLS):
            k.add_box(parts, f"bar-{i}", (0.1, 0.05, 0.4 - i * 0.04), (-0.3 + i * 0.12, 1.045, 0.5), paint(c))
    elif name == "band-cymbal":
        player(paint, parts, [(0.44, 1.12, 0.2), (-0.44, 1.12, 0.2)])
        for sx in (-1, 1):
            k.add_tapered_segment(parts, f"cymbal-{sx}", (sx * 0.455, 1.15, 0.2), (sx * 0.515, 1.15, 0.2), 0.26, 0.07, paint(GOLD_LIGHT),
                                  vertices=10, smooth=True)
    elif name == "band-drum":
        player(paint, parts, [(0.3, 1.08, 0.36), (-0.36, 1.2, 0.5)])
        v.lathe(parts, "drum", [(-0.25, 0.48, DRUM), (-0.24, 0.52, DRUM_RIM), (-0.18, 0.52, DRUM), (0.18, 0.52, DRUM_RIM), (0.24, 0.48, DRUM)],
                lambda t, a, r: (t, 1.0 + math.cos(a) * r, 0.55 + math.sin(a) * r), 10, paint, lambda c, n: abs(n.x) < 0.9)
        k.add_tapered_segment(parts, "mallet", (-0.36, 1.2, 0.5), (-0.3, 1.38, 0.86), 0.022, 0.04, paint(WOOD_DARK), vertices=4, smooth=False)
    return parts, 600


# ---------------------------------------------------------------- the spinning fork

def spin_turntable():
    """くるくる ポイントの だい: a round block, its side striped yellow and blue, a pink ring on its cream top, three
    big gold keys standing at its rim."""
    paint = paints(0.6)
    parts: list = []
    seg = 20
    table = v.lathe_y(parts, "table", [(0.0, 6.0, YELLOW), (0.86, 6.0, YELLOW), (1.0, 5.84, CREAM)], (0.0, 0.0), seg, paint,
                      smooth=lambda c, n: abs(n.y) < 0.9)

    def stripes(c, n):
        if n.y > 0.9:
            return CREAM
        a = math.atan2(c.z, c.x) % TAU
        return YELLOW if int(a / (TAU / 10)) % 2 == 0 else BLUE
    rv.recolour(table, paint, stripes)
    v.sticker(parts, "ring", (0.0, 1.0, 0.0), (0, 1, 0), (10.6, 10.6), paint(PINK), seg, lift=0.01)
    v.sticker(parts, "top", (0.0, 1.0, 0.0), (0, 1, 0), (9.4, 9.4), paint(CREAM), seg, lift=0.02)
    for i in range(3):
        a = TAU * i / 3 + 0.5
        key(parts, paint, GOLD, (math.cos(a) * 6.3, 0.0, math.sin(a) * 6.3), 2.44, ux=(-math.sin(a), 0.0, math.cos(a)), lobe_n=8, tag=f"key-{i}")
    return parts, 400


def spin_arrow():
    """ゆびさしの はた: a cream pole on a little foot ("spin-pole") and the arrow flag pointing +Z with the ball on top
    ("spin-flag", one red material the game tints green when it points the good way)."""
    paint = paints(0.6)
    pole: list = []
    v.lathe_y(pole, "pole", [(0.0, 0.22, CREAM), (0.12, 0.22, CREAM), (0.2, 0.12, CREAM), (4.62, 0.1, CREAM)], (0.0, 0.0), 8, paint,
              smooth=lambda c, n: abs(n.y) < 0.9)
    flag: list = []
    red = k.material("spin-flag", CORAL, 0.6)
    outline = [(0.08, 3.9), (2.2, 3.9), (2.2, 3.5), (3.6, 4.15), (2.2, 4.8), (2.2, 4.4), (0.08, 4.4)]
    s.plate(flag, "arrow", (0.0, 0.0, 0.0), (0, 0, 1), (0, 1, 0), outline, 0.07, [red])
    k.add_ellipsoid(flag, "ball", (0.44, 0.44, 0.44), (0.0, 4.7, 0.0), red, segments=8, rings=5)
    return (pole, flag), 150


def spin_star():
    """いい ほうの ほしの ふだ: a star-shaped yellow board with a paler star on each face, on a wooden post."""
    paint = paints(0.6)
    parts: list = []
    k.add_tapered_segment(parts, "post", (0.0, 0.0, 0.0), (0.0, 1.9, 0.0), 0.08, 0.07, paint(WOOD_DARK), vertices=6, smooth=False)
    s.plate(parts, "star", (0.0, 2.1, 0.0), (1, 0, 0), (0, 1, 0), star(0.95), 0.16, [paint(YELLOW)])
    for f in (1, -1):
        flat_poly(parts, f"inner-{f}", star(0.55, cy=-0.02), (0.0, 2.1, f * 0.08), (f, 0, 0), (0, 1, 0), paint(GOLD_PALE), lift=0.004)
    return parts, 100


# ---------------------------------------------------------------- the ball pit

def ball_pit():
    """ボールプール: a light blue rim round a pit (rounded on top), filled with a bed of little facets in the six ball
    colours (from the bridge it reads as a heap of balls) and a few whole balls lying on it."""
    paint = paints(0.55)
    parts: list = []
    rng = random.Random(52)
    # The rim: a closed ring of rounded section round the square, its corners cut.
    outline = chamfer_rect(1.0, 1.0, 0.12)

    def at(off, y):
        half = 12.0 - off
        return [(x * 2 * half, y, z * 2 * half) for x, z in [(p[0] * 1.0, p[1] * 1.0) for p in outline]]
    section = [(0.0, 0.0), (0.0, 2.3), (0.22, 2.5), (0.78, 2.5), (1.0, 2.3), (1.0, 0.0)]
    rings = [at(off, y) for off, y in section]
    n = len(outline)
    verts = [p for r in rings for p in r]
    faces = []
    for a in range(len(rings)):
        b = (a + 1) % len(rings)
        for i in range(n):
            j = (i + 1) % n
            faces.append((a * n + i, a * n + j, b * n + j, b * n + i))
    v.painted(parts, "rim", verts, faces, paint, lambda c, nm: PIT_TOP if nm.y > 0.3 else PIT_RIM, smooth=lambda c, nm: 0.3 < nm.y < 0.95)
    # The bed: a closed block filling the pit, its top a grid of bumps coloured like balls.
    cells, half, top = 15, 11.1, 1.45
    grid = []
    for j in range(cells + 1):
        row = []
        for i in range(cells + 1):
            x, z = -half + 2 * half * i / cells, -half + 2 * half * j / cells
            edge = i in (0, cells) or j in (0, cells)
            row.append((x, top - (0.25 if edge else rng.uniform(-0.2, 0.2)), z))
        grid.append(row)
    verts = [p for row in grid for p in row] + [(-half, 0.05, -half), (half, 0.05, -half), (half, 0.05, half), (-half, 0.05, half)]
    idx = lambda i, j: j * (cells + 1) + i  # noqa: E731
    faces, cols = [], []
    for j in range(cells):
        for i in range(cells):
            faces += [(idx(i, j), idx(i, j + 1), idx(i + 1, j + 1)), (idx(i, j), idx(i + 1, j + 1), idx(i + 1, j))]
            cols += [rng.choice(BALLS), rng.choice(BALLS)]
    b0 = (cells + 1) ** 2
    sides = [[idx(i, 0) for i in range(cells + 1)], [idx(cells, j) for j in range(cells + 1)],
             [idx(i, cells) for i in range(cells, -1, -1)], [idx(0, j) for j in range(cells, -1, -1)]]
    corners = [(b0, b0 + 1), (b0 + 1, b0 + 2), (b0 + 2, b0 + 3), (b0 + 3, b0)]
    for edge, (c0, c1) in zip(sides, corners):
        faces.append(tuple(edge) + (c1, c0))
        cols.append(PIT_FLOOR)
    faces.append((b0 + 3, b0 + 2, b0 + 1, b0))
    cols.append(PIT_FLOOR)
    v.painted(parts, "bed", verts, faces, paint, cols, smooth=False)
    # Balls half sunk in the bed, in loose clusters.
    placed = []
    count = 0
    while count < 9:
        x, z = rng.uniform(-10.2, 10.2), rng.uniform(-10.2, 10.2)
        if any(math.hypot(x - a, z - b) < 0.95 for a, b in placed):
            continue
        placed.append((x, z))
        sn.ball(parts, f"ball-{count}", (x, top + 0.12, z), 0.4, paint, lambda y, c=BALLS[count % 6]: c, segments=5, rings=3)
        count += 1
    return parts, 800


def toy_ball():
    """ボール: one ball of the pit (a smooth icosahedron)."""
    paint = paints(0.5)
    parts: list = []
    sn.bobble(parts, "ball", (0.0, 0.4, 0.0), 0.38, paint(CORAL), 3, sub=1, rough=0.0)
    return parts, 20


# ---------------------------------------------------------------- the toy box's mouth, the slide

def toybox_lid():
    """おもちゃばこの くち: the front of the big toy box round its 10 x 9 m mouth: pink pillars and lintel with rounded
    edges, cream trim round the mouth and along the top, coloured dots, a cream plate with a yellow star; the lid stands
    open, leaning back over the box (-Z) on two gold hinges. +Z is the outside."""
    paint = paints(0.6)
    parts: list = []
    for x in (-6.5, 6.5):
        k.add_box(parts, f"pillar-{x}", (3.0, 9.0, 3.0), (x, 4.5, 0.0), paint(PINK), bevel=0.22, segments=1)
    k.add_box(parts, "lintel", (16.0, 1.6, 3.0), (0.0, 9.8, 0.0), paint(PINK), bevel=0.22, segments=1)
    k.add_box(parts, "rim", (16.4, 0.4, 3.4), (0.0, 10.8, 0.0), paint(CREAM), bevel=0.12, segments=1)
    # Cream trim round the mouth (on the front, +Z).
    for x in (-5.15, 5.15):
        k.add_box(parts, f"trim-{x}", (0.3, 9.0, 0.12), (x, 4.5, 1.52), paint(CREAM))
    k.add_box(parts, "trim-top", (10.6, 0.3, 0.12), (0.0, 9.15, 1.52), paint(CREAM))
    # The lid, open and leaning back, with its cream edge and two hinges.
    # The lid: hinged along the top's back edge, standing up and leaning back over the box (64 degrees up).
    hinge, length, tilt = Vector((0.0, 10.9, -1.5)), 4.35, math.radians(64)
    along = Vector((0.0, math.sin(tilt), -math.cos(tilt)))
    lid = k.add_box(parts, "lid", (16.0, 0.5, length), tuple(hinge + along * (length / 2)), paint(PINK), bevel=0.15, segments=1)
    lid.rotation_euler = (tilt, 0.0, 0.0)  # its length (local Z) along the line `along` (either way)
    edge = k.add_box(parts, "lid-edge", (16.2, 0.62, 0.3), tuple(hinge + along * (length - 0.15)), paint(CREAM))
    edge.rotation_euler = lid.rotation_euler
    for x in (-4.5, 4.5):
        k.add_tapered_segment(parts, f"hinge-{x}", (x - 0.7, 10.9, -1.5), (x + 0.7, 10.9, -1.5), 0.22, 0.22, paint(GOLD_LIGHT), vertices=6,
                              smooth=True)
    k.add_box(parts, "plate", (2.2, 2.2, 0.2), (0.0, 9.8, 1.6), paint(CREAM), bevel=0.08, segments=1)
    flat_poly(parts, "star", star(0.85, cy=-0.04), (0.0, 9.8, 1.7), (1, 0, 0), (0, 1, 0), paint(YELLOW), lift=0.01)
    for i, (x, y, c) in enumerate(((-6.9, 7.6, MINT), (-6.1, 5.4, YELLOW), (-7.0, 3.0, BLUE), (6.3, 7.2, YELLOW), (7.0, 4.6, MINT),
                                   (6.2, 2.4, BLUE))):
        v.sticker(parts, f"dot-{i}", (x, y, 1.5), (0, 0, 1), (0.75, 0.75), paint(c), 8, lift=0.01)
    return parts, 500


def toy_slide_rail():
    """すべりだいの てすり: 4 m of the slide's pink handrail along +Z on a post, rounded ends."""
    paint = paints(0.5)
    parts: list = []
    k.add_tapered_segment(parts, "rail", (0.0, 1.1, -2.0), (0.0, 1.1, 2.0), 0.1, 0.1, paint("#FF9FC8"), vertices=8, smooth=True)
    k.add_tapered_segment(parts, "post", (0.0, 0.0, 0.0), (0.0, 1.04, 0.0), 0.06, 0.06, paint("#FF9FC8"), vertices=6, smooth=True)
    return parts, 600


def sign_slide_toy():
    """すべりだいの ふだ: a pink-edged white board on a wooden post, on its face (+Z) a pink slide: a ladder up and a
    curving chute down to a little splash of balls (no face)."""
    paint = paints(0.6)
    parts: list = []
    k.add_box(parts, "post", (0.12, 1.45, 0.08), (0.0, 0.725, -0.035), paint(WOOD_DARK))
    s.plate(parts, "board", (0.0, 1.85, 0.0), (1, 0, 0), (0, 1, 0), chamfer_rect(1.0, 0.9, 0.12), 0.1, [paint(SWIRL_LIGHT)])
    flat_poly(parts, "face", chamfer_rect(0.86, 0.76, 0.08), (0.0, 1.85, 0.05), (1, 0, 0), (0, 1, 0), paint(WHITE), lift=0.002)
    z = 0.056
    tri = lambda pts: v.flat_tris(parts, f"pic-{len(parts)}", pts, z, paint(SWIRL))  # noqa: E731
    # The ladder (two rails, two rungs) on the left, the chute curving down to the right.
    y0 = 1.85 - 0.3
    for x in (-0.3, -0.2):
        tri([((x - 0.018, y0), (x + 0.018, y0), (x + 0.018, y0 + 0.5)), ((x - 0.018, y0), (x + 0.018, y0 + 0.5), (x - 0.018, y0 + 0.5))])
    for y in (y0 + 0.17, y0 + 0.34):
        tri([((-0.3, y - 0.015), (-0.2, y - 0.015), (-0.2, y + 0.015)), ((-0.3, y - 0.015), (-0.2, y + 0.015), (-0.3, y + 0.015))])
    chute = [(-0.2, y0 + 0.5), (-0.02, y0 + 0.4), (0.12, y0 + 0.2), (0.32, y0 + 0.04)]
    band = []
    for a, b in zip(chute, chute[1:]):
        band += [((a[0], a[1] - 0.05), (b[0], b[1] - 0.05), (b[0], b[1])), ((a[0], a[1] - 0.05), (b[0], b[1]), (a[0], a[1]))]
    tri(band)
    return parts, 80


# ---------------------------------------------------------------- the castle

def toy_castle():
    """おもちゃの おしろ: stubby stacked building blocks: a lavender base with cream and pink blocks along its top, a
    pink block and a cream block stacked on it, a coral pyramid with a yellow bead on top; four round pink towers with
    cream rings under lavender cone roofs, each with a yellow flag (a red star on it) flying out to the side; an
    arched wooden door +Z in a cream arch between two yellow round blocks, round windows. Not the outline of any real
    or theme-park castle."""
    paint = paints(0.65)
    parts: list = []
    B = k.add_box
    B(parts, "base", (30.0, 10.0, 22.0), (0.0, 5.0, 0.0), paint(LAVENDER), bevel=0.45, segments=1)
    # Blocks along the top of the base: front and sides, alternately cream and pink.
    i = 0
    for x in (-10.8, -7.2, -3.6, 0.0, 3.6, 7.2, 10.8):
        B(parts, f"block-f-{x}", (2.4, 2.0, 2.4), (x, 11.0, 9.6), paint(CREAM if i % 2 == 0 else CASTLE_PINK), bevel=0.15, segments=1)
        i += 1
    for sx in (-1, 1):
        for z in (-5.4, -1.8, 1.8, 5.4):
            B(parts, f"block-s-{sx}-{z}", (2.4, 2.0, 2.4), (sx * 13.6, 11.0, z), paint(CASTLE_PINK if int(z) % 2 else CREAM), bevel=0.15, segments=1)
    B(parts, "middle", (20.0, 7.0, 14.0), (0.0, 13.5, -1.0), paint(CASTLE_PINK), bevel=0.4, segments=1)
    B(parts, "top", (10.0, 5.0, 8.0), (0.0, 19.5, -1.0), paint(CREAM), bevel=0.3, segments=1)
    s.slab(parts, "roof-eaves", [(5.6, 4.6), (-5.6, 4.6), (-5.6, -6.6), (5.6, -6.6)], 21.95, 22.35, paint(CORAL), bevel=0.08)
    s.pyramid(parts, "roof", (0.0, 22.35, -1.0), (0.0, 27.3, -1.0), (5.3, 0.0, 0.0), (0.0, 0.0, 5.3), paint(CORAL))
    sn.ball(parts, "bead", (0.0, 27.55, -1.0), 0.42, paint, lambda y: YELLOW, segments=8, rings=4)
    flat_poly(parts, "star", star(1.6), (0.0, 19.6, 3.0), (1, 0, 0), (0, 1, 0), paint(YELLOW), lift=0.02)
    # Windows: the middle block's front, the base's front either side of the gate.
    for x in (-6.0, 0.0, 6.0):
        windows_ring(parts, paint, (x, 14.2, 6.0), (0, 0, 1), 1.1, 12, tag=f"win-mid-{x}")
    for x in (-9.5, 9.5):
        windows_ring(parts, paint, (x, 5.6, 11.0), (0, 0, 1), 1.2, 12, tag=f"win-base-{x}")
    # The gate: a cream arch, the wooden door in it, two yellow round blocks beside it.
    s.plate(parts, "gate-arch", (0.0, 0.0, 11.08), (1, 0, 0), (0, 1, 0), vl.arch(7.6, 9.0, 9), 0.3, [paint(CREAM)])
    arch_door(parts, paint, 0.0, 0.0, 11.25, 6.0, 7.8, colour=WOOD_DARK, knob=False, thick=0.2)
    for x in (-1.5, 1.5):
        flat_poly(parts, f"plank-{x}", [(x - 0.06, 0.2), (x + 0.06, 0.2), (x + 0.06, 6.5), (x - 0.06, 6.5)], (0.0, 0.0, 11.35), (1, 0, 0), (0, 1, 0),
                  paint(WOOD), lift=0.005)
    v.sticker(parts, "door-window", (0.0, 5.9, 11.35), (0, 0, 1), (1.3, 1.3), paint(WINDOW), 10, lift=0.01)
    for x in (-5.0, 5.0):
        v.lathe_y(parts, f"gatepost-{x}", [(0.0, 1.1, YELLOW), (4.0, 1.1, YELLOW), (4.0, 0.0, YELLOW)], (x, 12.0), 10, paint,
                  smooth=lambda c, n: abs(n.y) < 0.9)
        sn.ball(parts, f"gatepost-bead-{x}", (x, 4.0, 12.0), 0.8, paint, lambda y: MINT, segments=8, rings=4, cut=4.0)
    # The towers.
    for tx in (-16.0, 16.0):
        for tz in (-11.0, 11.0):
            c = (tx, tz)
            tower = v.lathe_y(parts, f"tower-{tx}-{tz}", [(0.0, 3.8, CASTLE_PINK), (15.8, 3.6, CREAM), (15.8, 4.0, CREAM), (16.8, 4.0, CREAM)],
                              c, 16, paint, smooth=lambda c_, n: abs(n.y) < 0.9)
            v.lathe_y(parts, f"cone-{tx}-{tz}", [(16.75, 4.4, LAVENDER), (17.05, 4.4, LAVENDER), (23.5, 0.0, LAVENDER)], c, 16, paint,
                      smooth=lambda c_, n: 0.2 < n.y < 0.95)
            k.add_tapered_segment(parts, f"pole-{tx}-{tz}", (tx, 23.2, tz), (tx, 27.6, tz), 0.1, 0.08, paint(WOOD_DARK), vertices=5, smooth=False)
            sn.ball(parts, f"pole-bead-{tx}-{tz}", (tx, 27.72, tz), 0.24, paint, lambda y: YELLOW, segments=6, rings=3)
            out = 1 if tx > 0 else -1
            fx = tx + out * 0.08
            s.plate(parts, f"flag-{tx}-{tz}", (fx, 26.6, tz), (out, 0, 0), (0, 1, 0), [(0.0, -0.65), (2.0, -0.55), (2.1, 0.55), (0.0, 0.65)], 0.08,
                    [paint(YELLOW)])
            for f in (1, -1):
                flat_poly(parts, f"flag-star-{tx}-{tz}-{f}", star(0.42), (fx + out * 1.05, 26.6, tz + f * 0.04), (f, 0, 0), (0, 1, 0), paint(CORAL),
                          lift=0.003)
            # Round windows on the tower's outer faces (toward the front and the sides).
            for yy, yaw in ((8.0, 0.0 if tz > 0 else math.pi), (12.0, math.pi / 2 * out)):
                nrm = rot_y((0, 0, 1), yaw)
                p = (tx + nrm[0] * 3.7, yy, tz + nrm[2] * 3.7)
                windows_ring(parts, paint, p, nrm, 0.9, 10, lift=0.12, tag=f"win-t-{tx}-{tz}-{yy}", body=tower)
    return parts, 3000


def castle_key(back):
    """おしろの おおぜんまい: the castle's big gold key: two rings and a hub in the XY plane, the shaft down to the
    origin. `back`: Sakasa's pink swirl on both faces of the hub."""
    paint = paints(0.4)
    parts: list = []
    m = paint(GOLD_LIGHT)
    for sx in (-1, 1):
        ring_plate(parts, f"ring-{sx}", (sx * 2.2, 4.9, 0.0), (1, 0, 0), (0, 1, 0), 2.15, 1.2, 0.9, 12, m)
    k.add_box(parts, "hub", (2.2, 2.2, 1.2), (0.0, 4.9, 0.0), m, bevel=0.2, segments=1)
    v.lathe_y(parts, "shaft", [(0.0, 0.45, GOLD), (3.8, 0.45, GOLD)], (0.0, 0.0), 6, paint, smooth=lambda c, n: abs(n.y) < 0.9)
    if back:
        for f in (1, -1):
            swirl(parts, f"swirl-{f}", (0.0, 4.9, f * 0.6), (f, 0, 0), (0, 1, 0), 0.95, paint(SWIRL), turns=1.8, steps=10, width=0.22,
                  lift=0.012)
    return parts, 300


# ---------------------------------------------------------------- people, Sakasa's train, planes, the shelf

def block_folk(name):
    """みものの つみきの ひと: a wooden peg person: a round body (a), b in blue with a cream band and a little yellow
    hat), a round head of light wood with two dot eyes (a's hair painted on); no studs, no hands."""
    paint = paints(0.65)
    parts: list = []
    body, band = (CORAL, CREAM) if name == "block-folk-a" else ("#6EC6FF", CREAM)
    v.lathe_y(parts, "body", [(0.0, 0.34, body), (0.95, 0.31, band), (1.08, 0.3, body), (1.3, 0.24, body)], (0.0, 0.0), 8, paint,
              smooth=lambda c, n: abs(n.y) < 0.9, phase=math.pi / 8)
    head = sn.ball(parts, "head", (0.0, 1.6, 0.0), 0.29, paint, lambda y: SKIN, segments=8, rings=5)
    if name == "block-folk-a":
        rv.recolour(head, paint, lambda c, n: HAIR if (c.y > 1.7 or (n.z < -0.2 and c.y > 1.45)) else SKIN)
        sn.ball(parts, "bun", (0.0, 1.88, -0.08), 0.1, paint, lambda y: HAIR, segments=5, rings=3)
    else:
        v.lathe_y(parts, "hat", [(1.8, 0.31, YELLOW), (1.85, 0.31, YELLOW), (1.86, 0.2, YELLOW), (2.0, 0.18, YELLOW)], (0.0, 0.0), 8, paint,
                  smooth=lambda c, n: abs(n.y) < 0.9)
    tree = k.world_tree(head)
    for sx in (-1, 1):
        p, nrm = v.on_surface(tree, tuple(Vector((0.0, 1.6, 0.0)) + v.look(sx * math.radians(22), math.radians(6)) * 0.6), (0.0, 1.6, 0.0))
        v.sticker(parts, f"eye-{sx}", tuple(p), tuple(nrm), (0.06, 0.075), paint(EYE), 6, lift=0.004)
    return parts, 200


def toy_block_train():
    """サカサの つみきの でんしゃ: three pastel building blocks (blue, pink, yellow; the front one taller with a round
    window each side) on a wooden plank on six small round wheels. No face, no chimney. Front +Z."""
    paint = paints(0.6)
    parts: list = []
    k.add_box(parts, "plank", (0.6, 0.08, 2.24), (0.0, 0.26, 0.0), paint(WOOD))
    for i, (colour, h) in enumerate(((BLUE, 0.8), (PINK, 0.55), (YELLOW, 0.55))):
        z = 0.8 - i * 0.8
        k.add_box(parts, f"block-{i}", (0.68, h, 0.68), (0.0, 0.3 + h / 2, z), paint(colour), bevel=0.05, segments=1)
        for x in (-0.38, 0.38):
            k.add_tapered_segment(parts, f"wheel-{i}-{x}", (x * 0.79, 0.15, z), (x * 1.105, 0.15, z), 0.15, 0.15, paint(TYRE), vertices=6, smooth=False)
    for sx in (-1, 1):
        v.sticker(parts, f"window-{sx}", (sx * 0.34, 0.78, 0.8), (sx, 0, 0), (0.26, 0.26), paint(CREAM), 8, lift=0.006)
    return parts, 300


def toy_plane():
    """かみひこうき: a folded paper plane, its nose +Z: two thin wings (white on top, light blue underneath) and the
    fold hanging under them."""
    paint = paints(0.7)
    parts: list = []
    for sx in (-1, 1):
        verts = []
        for dy in (0.0, 0.012):
            verts += [(0.0, 0.1 + dy, 0.4), (sx * 0.3, 0.115 + dy, -0.4), (0.0, 0.1 + dy, -0.4)]
        faces = [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
        v.painted(parts, f"wing-{sx}", verts, faces, paint, lambda c, n: PAPER if n.y > 0.3 else PAPER_BLUE)
    verts = []
    for dx in (-0.006, 0.006):
        verts += [(dx, 0.1, 0.38), (dx, 0.1, -0.4), (dx, 0.0, -0.32)]
    v.painted(parts, "fold", verts, [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], paint, PAPER)
    return parts, 40


def toy_shelf():
    """記録③の たな: a wooden toy shelf (front +Z): two sides with rounded tops, three shelves and a back board, toys on
    the shelves (a block, a ball, a little stack, a toy drum); the tin key waits on its top."""
    paint = paints(0.7)
    parts: list = []
    for x in (-3.8, 3.8):
        k.add_box(parts, f"side-{x}", (0.4, 6.65, 2.0), (x, 3.325, 0.0), paint(WOOD_DARK), bevel=0.06, segments=1)
    for y in (0.3, 3.4):
        k.add_box(parts, f"shelf-{y}", (7.2, 0.35, 1.9), (0.0, y, 0.0), paint(WOOD))
    k.add_box(parts, "top", (8.0, 0.35, 2.0), (0.0, 6.825, 0.0), paint(WOOD))
    k.add_box(parts, "back", (7.3, 6.4, 0.12), (0.0, 3.4, -0.9), paint(WOOD_LIGHT))
    k.add_box(parts, "toy-block", (1.3, 1.3, 1.3), (-2.0, 4.23, 0.1), paint(BLUE))
    sn.ball(parts, "toy-ball", (0.3, 4.15, 0.1), 0.58, paint, lambda y: CORAL, segments=6, rings=4)
    k.add_box(parts, "stack-0", (1.1, 0.7, 1.1), (2.3, 3.93, 0.2), paint(YELLOW))
    k.add_box(parts, "stack-1", (0.8, 0.6, 0.8), (2.35, 4.58, 0.15), paint(MINT))
    v.lathe_y(parts, "toy-drum", [(0.47, 0.6, DRUM_RIM), (0.6, 0.6, DRUM), (1.2, 0.6, DRUM_RIM), (1.32, 0.6, DRUM)], (-1.6, 0.2), 8, paint,
              smooth=lambda c, n: abs(n.y) < 0.9)
    k.add_box(parts, "toy-blocks", (1.6, 0.8, 0.9), (1.7, 0.87, 0.25), paint(PINK))
    return parts, 300


def toy_blocks_loose():
    """はなれた つみき: a heap of building blocks with silver iron plates on their tops (for the magnet light), 8.3 m long."""
    paint = paints(0.6)
    parts: list = []
    rng = random.Random(19)
    colours = [YELLOW, BLUE, PINK, MINT]
    spots = [(-3.4, -1.2, 0), (-2.0, 0.6, 0), (-0.5, -0.7, 0), (0.6, 0.9, 0), (1.5, -0.9, 0), (3.0, 0.1, 0),
             (-2.8, -0.3, 1), (0.0, 0.1, 1), (2.2, -0.3, 1)]
    for i, (x, z, layer) in enumerate(spots):
        b = k.add_box(parts, f"block-{i}", (1.2, 1.06, 1.2), (x, 0.53 + layer * 1.06, z), paint(colours[i % 4]), bevel=0.06, segments=1)
        b.rotation_euler = (0.0, 0.0, rng.uniform(-0.5, 0.5))
        # The iron plate: its top (and the top's rounded edge) in silver.
        rv.recolour(b, paint, lambda c, n, col=colours[i % 4]: SILVER if n.y > 0.5 else col)
    return parts, 400


# ---------------------------------------------------------------- records

def gold_screw():
    """記録① きんいろの ねじ: a shining gold screw standing on its round head, the thread winding up its shank to the
    point, a slot across the head."""
    paint = paints(0.3)
    parts: list = []
    v.lathe_y(parts, "head", [(0.0, 0.17, GOLD), (0.04, 0.2, GOLD_PALE), (0.1, 0.2, GOLD_PALE), (0.14, 0.15, GOLD_LIGHT)], (0.0, 0.0), 8,
              paint, smooth=lambda c, n: abs(n.y) < 0.9)
    k.add_box(parts, "slot", (0.3, 0.03, 0.05), (0.0, 0.142, 0.0), paint(GOLD_DEEP))
    v.lathe_y(parts, "shank", [(0.13, 0.075, GOLD_PALE), (0.6, 0.05, GOLD_PALE), (0.78, 0.0, GOLD_PALE)], (0.0, 0.0), 8, paint, smooth=True)
    helix(parts, "thread", 0.084, 0.2, 0.62, 3.0, 8, 0.05, paint(GOLD), radius_top=0.058)
    return parts, 150


def glow_marble():
    """記録② ひかる ビーだま: a light blue marble, two deeper blue and two white stripes twisting round it from bottom to
    top (its swirl: the ball's rings turn a little more each), glowing softly (it lies in the dark of the toy box)."""
    paint = paints(0.2)
    parts: list = []
    seg, levels, twist = 10, 6, 0.55
    rings = []
    for j in range(1, levels):
        phi = math.pi * j / levels
        tw = TAU * twist * j / levels
        r = math.sin(phi) * 0.15
        rings.append([(math.cos(tw + TAU * i / seg) * r, 0.15 - math.cos(phi) * 0.15, math.sin(tw + TAU * i / seg) * r) for i in range(seg)])
    verts, faces, tags = rv.body(rings, top=(0.0, 0.3, 0.0), bottom=(0.0, 0.0, 0.0))
    stripe = {0: MARBLE_SWIRL, 5: MARBLE_SWIRL, 2: MARBLE_LIGHT, 7: MARBLE_LIGHT}
    v.painted(parts, "marble", verts, faces, paint, [stripe.get(tag[-1], MARBLE) for tag in tags], smooth=True)
    return parts, 120


def tin_key():
    """記録③ ブリキの ねじまき: a small tin wind-up key: two ring lobes, a hub and its shaft (standing on the shaft)."""
    paint = paints(0.35)
    return key([], paint, TIN, (0.0, 0.0, 0.0), 1.12, holes=True, lobe_n=8, shaft_n=3), 150


# ---------------------------------------------------------------- export and preview

BUILDERS = {"block-house-a": block_house_a, "block-house-b": block_house_b, "block-house-c": block_house_c, "screw-post": screw_post,
            "screw-tower": screw_tower, "windup-key": windup_key, "windup-chick": lambda: chick(False),
            "windup-chick-back": lambda: chick(True), "windup-car": lambda: car(False), "windup-car-back": lambda: car(True),
            "band-flag": lambda: band("band-flag"), "band-trumpet": lambda: band("band-trumpet"), "band-glock": lambda: band("band-glock"),
            "band-cymbal": lambda: band("band-cymbal"), "band-drum": lambda: band("band-drum"), "spin-turntable": spin_turntable,
            "spin-arrow": spin_arrow, "spin-star": spin_star, "ball-pit": ball_pit, "toy-ball": toy_ball, "toybox-lid": toybox_lid,
            "toy-slide-rail": toy_slide_rail, "sign-slide-toy": sign_slide_toy, "toy-castle": toy_castle,
            "castle-key": lambda: castle_key(False), "castle-key-back": lambda: castle_key(True),
            "block-folk-a": lambda: block_folk("block-folk-a"), "block-folk-b": lambda: block_folk("block-folk-b"),
            "toy-block-train": toy_block_train, "toy-plane": toy_plane, "toy-shelf": toy_shelf, "toy-blocks-loose": toy_blocks_loose,
            "gold-screw": gold_screw, "glow-marble": glow_marble, "tin-key": tin_key}
# The stand-ins' exact sizes (w, h, d), for the shapes not built to size: scaled about the origin to them.
EXACT = {"screw-tower": (23.64, 31.5, 24.0), "windup-chick": (0.93, 1.14, 1.0), "windup-chick-back": (0.93, 1.14, 0.95),
         "block-folk-a": (0.68, 1.9, 0.72), "block-folk-b": (0.68, 2.0, 0.72), "glow-marble": (0.3, 0.3, 0.3),
         "toy-blocks-loose": (8.29, 2.26, 4.47)}
# The chick leans back as it walks backwards (radians about X, its top toward -Z), as the stand-in did.
LEAN = {"windup-chick-back": -0.18}
# Centred on their bounding box (x, z); the rest keep the origin they are built about.
CENTRED = {"windup-chick", "windup-chick-back", "toy-blocks-loose", "glow-marble", "toy-ball"}
VIEWS = {"block-house-a": (0.55, -0.75, 0.35), "block-house-b": (0.55, -0.75, 0.3), "block-house-c": (0.45, -0.85, 0.3),
         "screw-post": (0.45, -0.85, 0.25), "screw-tower": (0.55, -0.75, 0.3), "windup-key": (0.3, -0.92, 0.2),
         "windup-chick": (0.6, -0.7, 0.3), "windup-chick-back": (-0.6, 0.7, 0.3), "windup-car": (0.7, -0.6, 0.35),
         "windup-car-back": (0.7, 0.6, 0.35), "spin-turntable": (0.55, -0.72, 0.45), "spin-arrow": (0.85, -0.45, 0.25),
         "spin-star": (0.35, -0.9, 0.15), "ball-pit": (0.55, -0.7, 0.6), "toybox-lid": (0.5, -0.8, 0.3), "toy-slide-rail": (0.8, -0.5, 0.3),
         "sign-slide-toy": (0.3, -0.92, 0.15), "toy-castle": (0.55, -0.75, 0.3), "castle-key": (0.35, -0.9, 0.2),
         "castle-key-back": (0.35, -0.9, 0.2), "toy-block-train": (0.75, -0.55, 0.35), "toy-plane": (0.55, -0.6, 0.6),
         "toy-shelf": (0.4, -0.85, 0.25), "gold-screw": (0.45, -0.85, 0.3), "glow-marble": (0.45, -0.8, 0.4), "tin-key": (0.3, -0.92, 0.2)}
TALL = {"screw-post", "screw-tower", "windup-key", "spin-arrow", "spin-star", "sign-slide-toy", "block-folk-a", "block-folk-b",
        "gold-screw", "tin-key", "band-flag", "band-trumpet", "band-glock", "band-cymbal", "band-drum", "block-house-b"}


def finish(model):
    """No uv layer (nothing is textured); triangulated by a fixed rule."""
    while model.data.uv_layers:
        model.data.uv_layers.remove(model.data.uv_layers[0])
    k.apply_modifier(model, "TRIANGULATE", quad_method="FIXED", ngon_method="CLIP")


if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if a in BUILDERS] or list(BUILDERS)
    for name in names:
        k.reset()
        built, budget = BUILDERS[name]()
        size = (400, 512) if name in TALL else (512, 400)
        if name == "spin-arrow":
            # Two nodes about the same pivot (the pole's foot): the pole, and the flag the game turns and tints.
            pole_parts, flag_parts = built
            objects = []
            for node, group in (("spin-pole", pole_parts), ("spin-flag", flag_parts)):
                obj = k.join(group, node)
                obj.data.validate()
                finish(obj)
                objects.append(obj)
            md.export_glb(objects, name, budget)
            md.preview(objects, name, VIEWS.get(name, (0.55, -0.72, 0.42)), size)
            continue
        model = k.join(built, name)
        model.name = name
        model.data.name = name
        model.data.validate()
        if name in LEAN:
            model.rotation_euler = (LEAN[name], 0.0, 0.0)
            k.active(model)
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        if name in EXACT:
            v.scale_to(model, EXACT[name])
        if name in CENTRED:
            k.normalize(model, None)
        else:
            v.floor_to_zero(model)
        finish(model)
        s.export_glb(model, name, budget)
        v.preview(model, name, VIEWS.get(name, (0.55, -0.72, 0.42)), size)
