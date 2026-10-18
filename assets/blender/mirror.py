"""Stage 5-3 (かがみのせかい) — Claude Code. Ticket 0020 (the 5-3 section).

The crafted look (つくりこみ) of chapters 1-4 (sky.py, volcano.py and ice.py, whose helpers this script uses): flat
colours (the game bakes each model into one draw call), round friendly shapes. The mirror world, lavender and white on a
bright day: glass trees and sparkly crystals cut in flat facets (two tones side by side, so they glitter as they turn),
silver frames with lavender rims, cream boards. The pale colours keep about half of their own colour as light (GLOW, as
ice.py's snow): the game's lights would turn a pale face in shade grey, and the world is never dark or cold. No faces
anywhere (no eyes or mouths on the trees, cushions, frames or boards); no mirror is ever cracked; nothing is modelled on
a real building, fairground mirror maze or famous story's mirror.

Models (same names, sizes, origins and orientation as the code stand-ins they replace, so the stage JSON does not
change; origin at the bottom centre, +Z forward, the model's own left is +X):
- crystal-tree-a 2.24 x 4.16 x 2.24 (lavender) and crystal-tree-b 3.92 x 7.28 x 3.92 (mint): a pale trunk, a crown cut
  like a gem (two points), side crystals and a white sparkle. Some 200 stand along 5-3 (drawn together).
- crystal-rock 2.28 x 2.59 x 2.1: a chunky faceted rock with two crystals growing out of it, cut off flat at y 0.
- mirror-pillar 1.4 x 8.1 x 1.4: a square lavender plinth, a six-sided silver column, a lavender gem on top (shiny; it
  reflects nothing).
- mirror-shelf 2.1 x 3.2 x 1.45: a lavender foot, a silver post, a lavender trim and the cream board on top (its top at
  y 3.2, where a star or a record rests; the board reaches further to +Z, z -0.4 to 0.8). `scale` makes it taller.
- mirror-cushion 6 x 3.1 x 1.98: the soft lavender cushion at the end of a false way (its origin is the rail's end):
  it lies past the end (z 0.2 to 2.18), its round front with a white rim to -Z, where the train comes from.
- mirror-frame 21.2 x 14.8 x 1.6 and turn-mirror 13.2 x 10.8 x 1.6: a framed mirror (20 x 13 and 12 x 9 of glass) on
  two feet 1.2 m high: a silver frame 0.6 thick with rounded corners, a lavender rim, the glass in pale lavender bands
  (white below, lavender above, as the game's mirrors look from afar) with two shine streaks, a lavender stud on the top
  bar, and the iron back with Sakasa's pink swirl (-Z). The game draws 5-3's own mirrors itself (ice.ts, any size,
  with their reflection); these are for 6-2, the movies, the map and the model page. turn-mirror also has the silver
  axle it turns on under its middle.
- Records mirror-board 1.3 x 1.75 x 0.09 (record 1: a little sign, a pink rim round a cream face on a silver leg; the
  face is the material "mirror-board-face", which src/view/three/mirror-models.ts paints with "ようこそ" written
  mirror-wise), hand-mirror 0.4 x 0.69 x 0.07 (record 2: an iron hand mirror, the round glass +Z, a pink swirl on the
  back), sakasa-doodle 1.12 x 1.5 x 0.6 (record 3: a wooden easel, the paper +Z is the material "sakasa-doodle-paper",
  which mirror-models.ts paints with Sakasa's crayon drawing; the easel's back leg reaches to z -0.6).
- note-pink 0.7 x 0.43 x 0.02: the partner's two cream notes side by side, a pink mark and a pencil stroke on each (on
  different places, so the two never read as a pair of eyes).
- mirror-stand-small 1.2 x 2 x 0.9: the platform's little mirror on a stand, its glass +Z.
amanojaku-wave and amanojaku-shy are not built here: the game poses the built amanojaku (src/view/three/models.ts).
Output: public/models/<name>.glb and assets/previews/<name>.png.
Run: python3 scripts/run-bpy.py assets/blender/mirror.py [-- name ...]
"""
from __future__ import annotations

from pathlib import Path
import math
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import sky as s  # noqa: E402  (chapter 1's crafted helpers: fix_normals, rotate_to, place, plate, slab...)
import volcano as v  # noqa: E402  (chapter 2's: Paint, painted, lathe_y, lathe_z, beam, sticker, rounded, preview...)
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

TAU = 2 * math.pi

# ---------------------------------------------------------------- palette (ticket 0020, 第 6 部 §8)

LAVENDER, LAVENDER_DEEP, LAVENDER_LIGHT, LAVENDER_PALE, LAVENDER_MID = "#CDB8F2", "#B9A8EC", "#DDD0F8", "#ECE6FC", "#A897E3"
MINT, MINT_DEEP, MINT_LIGHT = "#A8E6D8", "#8FD6C6", "#CDF3EA"
CRYSTAL, CRYSTAL_LIGHT = "#D6CCF5", "#E8E1FB"
SILVER, SILVER_LIGHT, SILVER_DARK = "#D9D6EA", "#ECEAF6", "#C3BFD8"
WHITE, TRUNK = "#FFFFFF", "#E8E4F4"
GLASS = "#EAF4FF"
GLASS_BANDS = ["#F6F2FE", "#ECE6FC", "#DED6F7", "#CFC6F2"]  # bottom to top (ice.ts FRAME_GLASS_BOTTOM / _TOP)
CREAM, BOARD, PAPER = "#FFF8E6", "#FFF3D6", "#FFFAF0"
PINK, SWIRL, INK = "#E8579F", "#E75BA0", "#5A4A3A"
IRON, IRON_LIGHT, IRON_DARK = "#7A8CA3", "#9AAABE", "#56657A"
WOOD, WOOD_DARK = "#C89B6A", "#A97F55"

# Some of their own colour as light (ice.py): the mirror world is pale, and the game's lights would turn a pale face in
# shade grey. Less than ice.py's snow (about 0.3 for the crystals): more washes the lavender and mint out to white.
# Iron, wood and the pink swirl keep only a little.
GLOW = {LAVENDER: 0.28, LAVENDER_DEEP: 0.24, LAVENDER_LIGHT: 0.32, LAVENDER_PALE: 0.4, LAVENDER_MID: 0.24,
        MINT: 0.28, MINT_DEEP: 0.24, MINT_LIGHT: 0.32, CRYSTAL: 0.3, CRYSTAL_LIGHT: 0.34,
        SILVER: 0.34, SILVER_LIGHT: 0.4, SILVER_DARK: 0.28, WHITE: 0.55, TRUNK: 0.4, GLASS: 0.3,
        CREAM: 0.5, BOARD: 0.5, PAPER: 0.5, PINK: 0.3, SWIRL: 0.3, INK: 0.0,
        IRON: 0.3, IRON_LIGHT: 0.3, IRON_DARK: 0.15, WOOD: 0.2, WOOD_DARK: 0.15}
for _band in GLASS_BANDS:
    GLOW[_band] = 0.6


def paints(roughness=0.55, extra=None):
    """The flat colour materials of a model, each glowing by GLOW (and `extra`, hex -> amount)."""
    table = dict(GLOW)
    table.update(extra or {})
    return v.Paint(roughness, glow=table)


# ---------------------------------------------------------------- shapes (glTF coordinates)

def prism(parts, paint, name, center, y0, y1, r0, r1, sides, tones, phase=0.0, bottom=True, top=True, cap=None):
    """A straight `sides`-sided frustum standing at `center` (x, z) from y0 (radius r0) to y1 (r1); its sides take the
    `tones` in turn (two tones side by side glitter), the caps `cap` (default the first tone). `bottom`/`top`: capped."""
    cx, cz = center
    verts = []
    for y, r in ((y0, r0), (y1, r1)):
        verts += [(cx + math.cos(phase + TAU * i / sides) * r, y, cz + math.sin(phase + TAU * i / sides) * r) for i in range(sides)]
    n = sides
    # Wound outward as built (an open frustum, a trunk or post whose ends are hidden, is not turned by fix_normals): the
    # angle grows from +X toward +Z, so the sides go up then round, the bottom cap round, the top cap back round.
    faces = [(i, n + i, n + (i + 1) % n, (i + 1) % n) for i in range(n)]
    colours = [tones[i % len(tones)] for i in range(n)]
    if bottom:
        faces.append(tuple(range(n)))
        colours.append(cap or tones[0])
    if top:
        faces.append(tuple(range(2 * n - 1, n - 1, -1)))
        colours.append(cap or tones[0])
    return v.painted(parts, name, verts, faces, paint, colours, closed=bottom and top)


def gem(parts, paint, name, base, up, length, radius, sides, tones, turn=0.0, body=0.7, taper=1.0, cap=True):
    """A crystal from `base` along `up`: a `sides`-sided prism for `body` of its length (its top `taper` times the base
    radius), then a point. tones = (side, side 2, point, point 2): the faces alternate (4 * sides - 2 triangles)."""
    q = s.rotate_to(up)
    verts = []
    for y, r in ((0.0, radius), (length * body, radius * taper)):
        verts += [s.place(base, q, (math.cos(turn + TAU * i / sides) * r, y, math.sin(turn + TAU * i / sides) * r)) for i in range(sides)]
    verts.append(s.place(base, q, (0.0, length, 0.0)))
    n = sides
    faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)] + [(n + i, n + (i + 1) % n, 2 * n) for i in range(n)]
    colours = [tones[i % 2] for i in range(n)] + [tones[2 + i % 2] for i in range(n)]
    if cap:
        faces.append(tuple(range(n - 1, -1, -1)))
        colours.append(tones[1])
    return v.painted(parts, name, verts, faces, paint, colours)


def bipyramid(parts, paint, name, center, radius, down, up, sides, low, high, turn=0.0, squash=1.0):
    """A gem with two points: a ring of `sides` round `center`, a point `down` below and one `up` above. The lower and
    upper facets take the tones `low` and `high` in turn (4 * sides triangles... 2 * sides)."""
    cx, cy, cz = center
    verts = [(cx + math.cos(turn + TAU * i / sides) * radius, cy, cz + math.sin(turn + TAU * i / sides) * radius * squash) for i in range(sides)]
    verts += [(cx, cy - down, cz), (cx, cy + up, cz)]
    n = sides
    faces = [((i + 1) % n, i, n) for i in range(n)] + [(i, (i + 1) % n, n + 1) for i in range(n)]
    colours = [low[i % len(low)] for i in range(n)] + [high[i % len(high)] for i in range(n)]
    return v.painted(parts, name, verts, faces, paint, colours)


def crown(parts, paint, name, center, rings, top, bottom, sides, tones, turn=0.0):
    """A gem crown through `rings` [(y, radius)] (bottom first) round the vertical through `center` (x, z), closed by
    points at `bottom` and `top` (y). tones[j]: the colours of the j-th row of facets (bottom fan first), in turn."""
    cx, cz = center
    n = sides
    verts = []
    for j, (y, r) in enumerate(rings):
        a0 = turn + (TAU / n / 2 if j % 2 else 0.0)
        verts += [(cx + math.cos(a0 + TAU * i / n) * r, y, cz + math.sin(a0 + TAU * i / n) * r) for i in range(n)]
    b = len(verts)
    verts += [(cx, bottom, cz), (cx, top, cz)]
    faces, colours = [], []
    row = 0
    for i in range(n):
        faces.append(((i + 1) % n, i, b))
        colours.append(tones[row][i % len(tones[row])])
    for j in range(len(rings) - 1):
        row += 1
        a, c = j * n, (j + 1) * n
        for i in range(n):
            # Rings turned half a step against each other: the band is two triangles per step, facets like a cut gem.
            if j % 2 == 0:
                faces.append((a + i, a + (i + 1) % n, c + i))
                faces.append((a + (i + 1) % n, c + (i + 1) % n, c + i))
            else:
                faces.append((a + i, a + (i + 1) % n, c + (i + 1) % n))
                faces.append((a + i, c + (i + 1) % n, c + i))
            colours += [tones[row][(2 * i) % len(tones[row])], tones[row][(2 * i + 1) % len(tones[row])]]
    row += 1
    last = (len(rings) - 1) * n
    for i in range(n):
        faces.append((last + i, last + (i + 1) % n, b + 1))
        colours.append(tones[row][i % len(tones[row])])
    return v.painted(parts, name, verts, faces, paint, colours)


def face_to(obj, z_sign):
    """Turns a flat part so it faces +Z (z_sign 1) or -Z (-1), whichever way it was wound."""
    if (k.gltf(obj.data.polygons[0].normal).z > 0) != (z_sign > 0):
        obj.data.flip_normals()
    return obj


def quad(parts, name, corners, m, z_sign=1):
    """One flat quad (four glTF points round it), facing +Z or -Z."""
    return face_to(k.add_mesh(parts, name, corners, [(0, 1, 2, 3)], [m]), z_sign)


def ring(parts, paint, name, outer, inner, y_mid, z0, z1, colours):
    """A closed flat ring standing in the XY plane round (0, y_mid): the loops `outer` and `inner` (equal lengths of
    (x, y) about that middle) from z0 (back) to z1 (front). colours: (front, back, outside, inside)."""
    n = len(outer)
    verts = [(x, y_mid + y, z1) for x, y in outer] + [(x, y_mid + y, z1) for x, y in inner]
    verts += [(x, y_mid + y, z0) for x, y in outer] + [(x, y_mid + y, z0) for x, y in inner]
    of, inf, ob, ib = 0, n, 2 * n, 3 * n
    faces, cols = [], []
    for i in range(n):
        j = (i + 1) % n
        faces += [(of + i, of + j, inf + j, inf + i), (ob + j, ob + i, ib + i, ib + j), (ob + i, ob + j, of + j, of + i),
                  (ib + j, ib + i, inf + i, inf + j)]
        cols += list(colours)
    return v.painted(parts, name, verts, faces, paint, cols)


def spiral(parts, name, center, r0, r1, turns, steps, width, z, m, z_sign=-1):
    """Sakasa's swirl: a flat ribbon winding out from r0 to r1 round `center` (x, y) in the plane z."""
    cx, cy = center
    pts = []
    for i in range(steps + 1):
        t = i / steps
        a = t * turns * TAU
        r = r0 + (r1 - r0) * t
        pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r, z))
    obj = k.ribbon_decal(parts, name, pts, width, m, taper=False)
    return face_to(obj, z_sign)


# ---------------------------------------------------------------- the glass trees and crystals

def crystal_tree_a():
    """ガラスの 木 (4 m): a pale trunk, a lavender crown cut like a gem (a point below and one above), two side crystals
    (one mint) and a little white sparkle near the top."""
    paint = paints(0.8)
    parts: list = []
    prism(parts, paint, "trunk", (0.0, 0.0), 0.0, 1.75, 0.2, 0.12, 5, [TRUNK, LAVENDER_PALE], top=False)
    crown(parts, paint, "crown", (0.0, 0.0), [(2.35, 0.98), (3.05, 0.8)], 4.16, 1.35, 6,
          [[LAVENDER_MID, LAVENDER_DEEP], [LAVENDER_DEEP, LAVENDER], [LAVENDER, LAVENDER_LIGHT]])
    gem(parts, paint, "side-1", (0.55, 2.2, 0.1), (0.9, 0.75, 0.15), 0.62, 0.17, 5, [LAVENDER, LAVENDER_DEEP, WHITE, LAVENDER_LIGHT])
    gem(parts, paint, "side-2", (-0.5, 2.55, -0.15), (-0.85, 0.8, -0.2), 0.55, 0.15, 5, [MINT, MINT_DEEP, WHITE, MINT_LIGHT], turn=0.4)
    gem(parts, paint, "sparkle", (0.18, 3.35, 0.38), (0.35, 1.0, 0.5), 0.4, 0.09, 4, [WHITE, LAVENDER_PALE, WHITE, WHITE])
    return parts, 90


def crystal_tree_b():
    """ガラスの 木 (7 m): taller, in mint: a pale trunk, a wide lower crown and a smaller upper one, three side crystals
    (one lavender) and a white sparkle."""
    paint = paints(0.8)
    parts: list = []
    prism(parts, paint, "trunk", (0.0, 0.0), 0.0, 2.9, 0.3, 0.18, 5, [TRUNK, LAVENDER_PALE], top=False)
    crown(parts, paint, "crown", (0.0, 0.0), [(3.55, 1.62), (4.55, 1.3)], 5.75, 2.2, 6,
          [[MINT_DEEP, MINT], [MINT_DEEP, MINT], [MINT, MINT_LIGHT]])
    gem(parts, paint, "top", (0.0, 5.1, 0.0), (0.05, 1.0, 0.02), 2.18, 0.62, 6, [MINT, MINT_DEEP, MINT_LIGHT, WHITE], body=0.55, taper=0.8)
    gem(parts, paint, "side-1", (0.9, 3.4, 0.2), (0.9, 0.7, 0.2), 1.15, 0.26, 5, [MINT, MINT_DEEP, WHITE, MINT_LIGHT])
    gem(parts, paint, "side-2", (-0.85, 3.9, -0.25), (-0.85, 0.75, -0.3), 1.0, 0.24, 5, [LAVENDER, LAVENDER_DEEP, WHITE, LAVENDER_LIGHT], turn=0.5)
    gem(parts, paint, "sparkle", (0.3, 6.05, -0.32), (0.4, 1.0, -0.45), 0.6, 0.12, 4, [WHITE, LAVENDER_PALE, WHITE, WHITE])
    return parts, 120


def crystal_rock():
    """きらきらの 岩: a chunky faceted lavender rock (its top facets lighter) with two crystals growing out of it, one
    standing up and one leaning out, cut off flat at y 0."""
    paint = paints(0.8)
    parts: list = []
    v.lumpy_stone(parts, "rock", (2.0, 1.5, 1.8), (0.0, 0.45, 0.0), paint(LAVENDER_DEEP), paint(CRYSTAL), 53, sub=1, top_from=0.35, rough=0.14)
    gem(parts, paint, "up", (0.15, 0.5, 0.05), (0.12, 1.0, 0.06), 2.1, 0.42, 5, [CRYSTAL, LAVENDER_DEEP, CRYSTAL_LIGHT, WHITE], turn=0.2)
    gem(parts, paint, "lean", (-0.35, 0.5, -0.15), (-0.75, 0.75, -0.45), 1.25, 0.3, 4, [LAVENDER, LAVENDER_MID, LAVENDER_LIGHT, CRYSTAL_LIGHT],
        turn=0.5)
    for obj in parts:
        v.cut_below(obj)
    return parts, 60


def mirror_pillar():
    """かがみの 柱: a square lavender plinth, a six-sided silver column (two tones that glitter as it turns), a lavender
    gem on top. It shines; it reflects nothing."""
    paint = paints(0.35)
    parts: list = []
    prism(parts, paint, "plinth", (0.0, 0.0), 0.0, 0.38, 0.99, 0.8, 4, [LAVENDER_DEEP], phase=math.pi / 4)
    prism(parts, paint, "column", (0.0, 0.0), 0.3, 7.25, 0.5, 0.44, 6, [SILVER, SILVER_LIGHT], bottom=False, cap=SILVER_LIGHT)
    bipyramid(parts, paint, "gem", (0.0, 7.6, 0.0), 0.64, 0.5, 0.5, 6, [LAVENDER_DEEP, LAVENDER], [LAVENDER_LIGHT, WHITE])
    return parts, 48


def mirror_shelf():
    """かがみの たな: a lavender foot, a six-sided silver post, a lavender trim and the cream board on top (y 3.2), its
    corners rounded; the board reaches further to +Z (the side turned to the rail)."""
    paint = paints(0.45)
    parts: list = []
    prism(parts, paint, "foot", (0.0, 0.0), 0.0, 0.2, 0.6, 0.5, 6, [LAVENDER_DEEP, LAVENDER])
    prism(parts, paint, "post", (0.0, 0.0), 0.15, 2.9, 0.38, 0.3, 6, [SILVER, SILVER_LIGHT], bottom=False, top=False)
    k.add_box(parts, "trim", (2.1, 0.1, 1.3), (0.0, 2.9, 0.2), paint(LAVENDER))
    board = [(z, x) for x, z in v.rounded(0.2, 0.0, 1.2, 2.0, 0.12, per=1)]
    s.slab(parts, "board", board, 2.95, 3.2, paint(BOARD))
    return parts, 80


def mirror_cushion():
    """まぼろしの いきどまりの クッション: a soft lavender pillow lying across the end of the false way, its round front
    (-Z, where the train comes from) ringed by a white rim, its back lavender."""
    paint = paints(0.8)
    parts: list = []
    profile = [(0.2, 0.0, LAVENDER_LIGHT), (0.3, 0.62, LAVENDER), (0.55, 0.9, WHITE), (0.82, 1.0, LAVENDER),
               (1.75, 0.94, LAVENDER), (2.08, 0.55, LAVENDER_DEEP), (2.175, 0.0, LAVENDER_DEEP)]
    obj = v.lathe_z(parts, "pillow", profile, 0.0, 0.0, 12, paint, smooth=True, phase=0.0)
    obj.scale = (3.0, 1.0, 1.55)  # Blender axes: x, y (= glTF -z), z (= up)
    k.active(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.location = k.to_blender((0.0, 1.55, 0.0))
    return parts, 160


# ---------------------------------------------------------------- framed mirrors

PLINTH = 1.2
FRAME = 0.6


def framed(W, H, axle):
    """A framed mirror: W x H of glass on two feet PLINTH high, the frame FRAME thick (z -0.45 to 0.05), the iron back
    with Sakasa's pink swirl (-Z); `axle`: the silver axle it turns on, under its middle."""
    paint = paints(0.4)
    parts: list = []
    mid = PLINTH + H / 2
    outer = v.rounded(0.0, 0.0, W + 2 * FRAME, H + 2 * FRAME, 0.55, per=2)
    inner = v.rounded(0.0, 0.0, W, H, 0.06, per=2)
    ring(parts, paint, "frame", outer, inner, mid, -0.45, 0.05, (SILVER, SILVER_DARK, SILVER_LIGHT, SILVER_DARK))
    rim_o = [(x, y) for x, y in ((W / 2 + 0.02, H / 2 + 0.02), (-W / 2 - 0.02, H / 2 + 0.02), (-W / 2 - 0.02, -H / 2 - 0.02), (W / 2 + 0.02, -H / 2 - 0.02))]
    rim_i = [(x, y) for x, y in ((W / 2 - 0.2, H / 2 - 0.2), (-W / 2 + 0.2, H / 2 - 0.2), (-W / 2 + 0.2, -H / 2 + 0.2), (W / 2 - 0.2, -H / 2 + 0.2))]
    ring(parts, paint, "rim", rim_o, rim_i, mid, -0.3, 0.12, (LAVENDER, LAVENDER_DEEP, LAVENDER, LAVENDER_DEEP))
    # The glass: pale bands, white below to lavender above, and two shine streaks.
    n = len(GLASS_BANDS)
    x0, x1 = -W / 2 + 0.2, W / 2 - 0.2
    for i, hex_color in enumerate(GLASS_BANDS):
        y0 = PLINTH + 0.2 + (H - 0.4) * i / n
        y1 = PLINTH + 0.2 + (H - 0.4) * (i + 1) / n
        quad(parts, f"glass-{i}", [(x0, y0, 0.05), (x1, y0, 0.05), (x1, y1, 0.05), (x0, y1, 0.05)], paint(hex_color))
    for i, (u, w) in enumerate(((0.18, 0.07), (0.27, 0.035))):
        xa = x0 + (x1 - x0) * u
        lean = H * 0.32
        quad(parts, f"shine-{i}", [(xa, PLINTH + H * 0.35, 0.058), (xa + W * w, PLINTH + H * 0.35, 0.058),
                                   (xa + W * w + lean, PLINTH + H * 0.85, 0.058), (xa + lean, PLINTH + H * 0.85, 0.058)], paint(WHITE))
    # A lavender stud on the front of the top bar.
    bipyramid(parts, paint, "stud", (0.0, PLINTH + H + FRAME / 2, 0.08), 0.32, 0.3, 0.3, 4, [LAVENDER_DEEP], [LAVENDER_LIGHT],
              turn=math.pi / 4, squash=0.4)
    # The feet, on lavender pads.
    for side in (-1, 1):
        x = side * W / 3
        k.add_box(parts, f"foot-{side}", (0.5, PLINTH + 0.1, 0.5), (x, (PLINTH + 0.1) / 2, -0.2), paint(SILVER))
        k.add_box(parts, f"pad-{side}", (1.4, 0.2, 1.6), (x, 0.1, -0.2), paint(LAVENDER_DEEP))
    # The iron back and Sakasa's swirl on it.
    k.add_box(parts, "back", (W + 0.2, H + 0.2, 0.2), (0.0, mid, -0.4), paint(IRON))
    r = min(W, H) * 0.32
    spiral(parts, "swirl", (0.0, mid), r * 0.06, r, 2.3, 30, r * 0.12, -0.505, paint(SWIRL))
    if axle:
        prism(parts, paint, "axle-base", (0.0, -0.2), 0.0, 0.25, 0.75, 0.6, 6, [SILVER_DARK, SILVER])
        prism(parts, paint, "axle", (0.0, -0.2), 0.2, PLINTH + 0.1, 0.18, 0.15, 6, [SILVER, SILVER_LIGHT], bottom=False, top=False)
    return parts


def mirror_frame():
    return framed(20.0, 13.0, False), 300


def turn_mirror():
    return framed(12.0, 9.0, True), 420


# ---------------------------------------------------------------- records and the ending's things

def mirror_board():
    """記録① かがみの なかの かんばん: a little cream sign in a pink rounded rim on a silver leg with a lavender foot. The
    face (material "mirror-board-face", +Z at z 0.03) gets its mirror-written "ようこそ" from the game."""
    paint = paints(0.6)
    parts: list = []
    k.add_box(parts, "foot", (0.34, 0.06, 0.14), (0.0, 0.03, -0.02), paint(LAVENDER_DEEP))
    k.add_box(parts, "leg", (0.09, 0.86, 0.09), (0.0, 0.48, -0.02), paint(SILVER))
    s.plate(parts, "rim", (0.0, 1.3, -0.02), (1, 0, 0), (0, 1, 0), v.rounded(0.0, 0.0, 1.3, 0.9, 0.12, per=1), 0.08, [paint(PINK)])
    face = k.material("mirror-board-face", CREAM, 0.6)
    quad(parts, "face", [(-0.6, 0.9, 0.03), (0.6, 0.9, 0.03), (0.6, 1.7, 0.03), (-0.6, 1.7, 0.03)], face)
    return parts, 60


def hand_mirror():
    """記録② てつの てかがみ: a round iron hand mirror (the glass +Z, a lighter rim, a white shine), a five-sided handle
    with a knob, and Sakasa's pink swirl on the back."""
    paint = paints(0.45)
    parts: list = []
    cy = 0.49
    profile = [(-0.03, 0.0, IRON), (-0.03, 0.2, IRON), (0.03, 0.2, IRON_LIGHT), (0.03, 0.155, GLASS), (0.024, 0.0, GLASS)]
    v.lathe_z(parts, "disc", profile, 0.0, cy, 10, paint, smooth=False, phase=math.pi / 2)
    k.add_tapered_segment(parts, "handle", (0.0, 0.05, 0.0), (0.0, 0.31, 0.0), 0.03, 0.038, paint(IRON), vertices=5, smooth=False)
    s.fix_normals(parts[-1])
    bipyramid(parts, paint, "knob", (0.0, 0.045, 0.0), 0.05, 0.045, 0.03, 4, [IRON_DARK], [IRON_DARK, IRON], turn=math.pi / 4)
    v.sticker(parts, "shine", (0.06, cy + 0.06, 0.026), (0, 0, 1), (0.1, 0.045), paint(WHITE), segments=6, tilt=0.7)
    spiral(parts, "swirl", (0.0, cy), 0.015, 0.14, 1.6, 8, 0.03, -0.032, paint(SWIRL))
    return parts, 120


def sakasa_doodle():
    """記録③ かがみの うらの らくがき: a little wooden easel (two splayed front legs, a back leg, a ledge, a board behind
    the paper and a clip on top). The paper (material "sakasa-doodle-paper", +Z, leaning back 0.12 rad) gets Sakasa's
    crayon drawing from the game."""
    paint = paints(0.75)
    parts: list = []
    for side in (-1, 1):
        v.beam(parts, f"leg-{side}", (side * 0.52, 0.0, -0.05), (side * 0.4, 1.47, -0.25), 0.06, 0.06, paint(WOOD))
    v.beam(parts, "back-leg", (0.0, 0.0, -0.57), (0.0, 1.4, -0.27), 0.06, 0.06, paint(WOOD_DARK))
    k.add_box(parts, "ledge", (1.12, 0.05, 0.14), (0.0, 0.52, -0.08), paint(WOOD_DARK))
    tilt = -0.12
    up = Vector((0.0, math.cos(tilt), math.sin(tilt)))
    centre = Vector((0.0, 0.95, -0.13))
    nrm = Vector((0.0, -math.sin(tilt), math.cos(tilt)))

    def at(x, y, lift):
        p = centre + Vector((x, 0.0, 0.0)) + up * y + nrm * lift
        return (p.x, p.y, p.z)

    s.plate(parts, "board", at(0.0, 0.0, -0.03), (1, 0, 0), tuple(up), [(-0.52, -0.42), (0.52, -0.42), (0.52, 0.42), (-0.52, 0.42)], 0.03,
            [paint(WOOD)])
    paper = k.material("sakasa-doodle-paper", PAPER, 0.8)
    face_to(k.add_mesh(parts, "paper", [at(-0.5, -0.4, -0.012), at(0.5, -0.4, -0.012), at(0.5, 0.4, -0.012), at(-0.5, 0.4, -0.012)],
                       [(0, 1, 2, 3)], [paper]), 1)
    k.add_box(parts, "clip", (0.14, 0.07, 0.07), at(0.0, 0.42, 0.0), paint(WOOD_DARK))
    parts[-1].rotation_euler = (-tilt, 0.0, 0.0)  # Blender x: the same tilt back
    return parts, 80


def note_pink():
    """ピコが もつ 2 まいの 紙: two cream notes side by side, each a front and a back, a pink mark and a pencil stroke on
    the front (on different places of the two notes)."""
    paint = paints(0.8)
    parts: list = []
    for i, (x, turn, mark, stroke) in enumerate((
            (-0.18, 0.11, ((0.06, 0.29), 0.05), ((-0.09, 0.12), (0.09, 0.11), (-0.08, 0.135))),
            (0.18, -0.1, ((-0.07, 0.12), 0.045), ((-0.08, 0.3), (0.08, 0.27), (-0.07, 0.315))))):
        c, sn = math.cos(turn), math.sin(turn)

        def p(a, b, z, x=x, c=c, sn=sn):
            return (x + a * c - (b - 0.2) * sn, 0.2 + a * sn + (b - 0.2) * c, z)

        quad(parts, f"front-{i}", [p(-0.15, 0.0, 0.0), p(0.15, 0.0, 0.0), p(0.15, 0.4, 0.0), p(-0.15, 0.4, 0.0)], paint(CREAM), 1)
        quad(parts, f"back-{i}", [p(-0.15, 0.0, -0.004), p(0.15, 0.0, -0.004), p(0.15, 0.4, -0.004), p(-0.15, 0.4, -0.004)], paint(CREAM), -1)
        (mx, my), mr = mark
        blob = [p(mx + math.cos(TAU * j / 5 + 0.3) * mr, my + math.sin(TAU * j / 5 + 0.3) * mr, 0.003) for j in range(5)]
        face_to(k.add_mesh(parts, f"mark-{i}", blob, [(0, 1, 2), (0, 2, 3), (0, 3, 4)], [paint(PINK)]), 1)
        face_to(k.add_mesh(parts, f"stroke-{i}", [p(a, b, 0.003) for a, b in stroke], [(0, 1, 2)], [paint(INK)]), 1)
    return parts, 16


def mirror_stand_small():
    """ホームの 小さな かがみ: a round lavender foot, a thin silver post, a lavender frame with rounded corners, the glass
    (+Z) and a shine streak."""
    paint = paints(0.45)
    parts: list = []
    prism(parts, paint, "foot", (0.0, 0.0), 0.0, 0.12, 0.45, 0.36, 6, [LAVENDER_DEEP, LAVENDER], phase=math.pi / 2)
    prism(parts, paint, "post", (0.0, 0.0), 0.1, 0.75, 0.05, 0.05, 4, [SILVER, SILVER_LIGHT], phase=math.pi / 4, bottom=False, top=False)
    s.plate(parts, "frame", (0.0, 1.35, -0.02), (1, 0, 0), (0, 1, 0), v.rounded(0.0, 0.0, 1.2, 1.3, 0.14, per=1), 0.1, [paint(LAVENDER_DEEP)])
    quad(parts, "glass", [(-0.525, 0.775, 0.035), (0.525, 0.775, 0.035), (0.525, 1.925, 0.035), (-0.525, 1.925, 0.035)], paint(GLASS))
    quad(parts, "shine", [(-0.3, 1.05, 0.038), (-0.2, 1.05, 0.038), (0.05, 1.7, 0.038), (-0.05, 1.7, 0.038)], paint(WHITE))
    return parts, 60


# ---------------------------------------------------------------- export and preview

BUILDERS = {"crystal-tree-a": crystal_tree_a, "crystal-tree-b": crystal_tree_b, "crystal-rock": crystal_rock,
            "mirror-pillar": mirror_pillar, "mirror-shelf": mirror_shelf, "mirror-cushion": mirror_cushion,
            "mirror-frame": mirror_frame, "turn-mirror": turn_mirror, "mirror-board": mirror_board, "hand-mirror": hand_mirror,
            "sakasa-doodle": sakasa_doodle, "note-pink": note_pink, "mirror-stand-small": mirror_stand_small}
# Exact stand-in sizes (w, h, d) the hand-tuned shapes are scaled to (about their origin).
EXACT = {"crystal-tree-a": (2.24, 4.16, 2.24), "crystal-tree-b": (3.92, 7.28, 3.92), "crystal-rock": (2.28, 2.59, 2.1)}
# Centred on their bounding box; the rest keep the x/z origin they were built about.
CENTRED = {"crystal-rock", "note-pink"}
VIEWS = {"mirror-cushion": (0.5, 0.8, 0.3), "mirror-frame": (0.45, -0.85, 0.2), "turn-mirror": (-0.6, 0.7, 0.25),
         "mirror-board": (0.35, -0.9, 0.2), "hand-mirror": (0.4, -0.85, 0.25), "sakasa-doodle": (0.45, -0.85, 0.25),
         "note-pink": (0.25, -0.95, 0.15), "mirror-stand-small": (0.4, -0.85, 0.25), "mirror-shelf": (0.55, -0.75, 0.4)}
TALL = {"crystal-tree-a", "crystal-tree-b", "mirror-pillar", "mirror-shelf", "mirror-board", "hand-mirror", "sakasa-doodle",
        "mirror-stand-small"}

if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if a in BUILDERS] or list(BUILDERS)
    for name in names:
        k.reset()
        built, budget = BUILDERS[name]()
        model = k.join(built, name)
        model.name = name
        model.data.name = name
        model.data.validate()
        if name in EXACT:
            v.scale_to(model, EXACT[name])
        if name in CENTRED:
            k.normalize(model, None)
        else:
            v.floor_to_zero(model)
        # No uv layer (the two painted faces get theirs from the game), triangulated by a fixed rule (harbour.py).
        while model.data.uv_layers:
            model.data.uv_layers.remove(model.data.uv_layers[0])
        k.apply_modifier(model, "TRIANGULATE", quad_method="FIXED", ngon_method="CLIP")
        s.export_glb(model, name, budget)
        v.preview(model, name, VIEWS.get(name, (0.55, -0.72, 0.42)), (400, 512) if name in TALL else (512, 400))
