"""Stage 3-3 (ほしのうみ) — Claude Code. Ticket 0013.

The crafted look (つくりこみ) of chapters 1 and 2 (sky.py and volcano.py, whose helpers this script uses): flat colours
(the game bakes each model into one draw call), faceted rock, round friendly shapes. An evening sea and a made-up
harbour's star festival: the lighthouse is white with mint bands and like no real one, the lanterns carry no letters,
patterns or crests, the sea creatures are round with eyes only (no mouth, no teeth, no spikes, no stingers).
Glowing things (the trench's specks, the coral, the lanterns, the jellyfish, the star sand) have a little of their own
colour as light, so they read in the dusk, under water and in the trench's dark fog.

Models (same names, sizes, origins and orientation as the code stand-ins they replace, so the stage JSON does not
change; origin at the bottom centre, +Z forward, the model's own left is +X):
- cape-rock 60 x 34.6 x 110: a flat grass top (y 34.6, a rounded rectangle exactly 60 x 110 at its lip) on pink-grey
  cliffs. 3-3 lays it three times: under the rail at みさきえき (the rail along x 0 over its whole length, the
  platform out to x 7), under the lighthouse (at its centre; the rail's last 25 m at x -4) and on the shore (the
  houses at x 0 and x -12): grass tufts, flowers and stones stand on the top only at x > 9 or x < -17 (they reach
  1.3 m above it, so the model is 35.9 tall; the top itself is where the stand-in had it).
- lighthouse 8 x 24 x 8: door +Z. The lamp room's glass is centred on y 20.6, where harbour.ts lights its lamp (a
  sphere of radius 1.6 that glows through the panes).
- harbour-house 6 x 6 x 6: front +Z (the track side), windows lit.
- trench-wall 40 x 24 x 12: the face with the glowing specks is +Z (turned to the track); its ends taper, so walls
  side by side meet as separate rocks.
- glow-coral 3 x 3 x 3, festival-raft 8 x 3 x 6 (its four lanterns centred on (+-2.6, 2.6, +-1.6), where harbour.ts
  brightens them at the festival), lantern-jelly 1.6 x 2.4 x 1.6 (the ribbons' tips at y 0), lantern-post
  0.6 x 3.5 x 0.6.
- sea-turtle-sleep 3 x 1.2 x 4 (asleep on the rail: flippers folded, eyes closed) and sea-turtle 3.4 x 1.4 x 4
  (swimming: flippers spread, round eyes); head +Z.
- Records starfish 0.8 x 0.21 x 0.76 (scaled evenly, so its five arms stay even), star-sand 1 x 0.6 x 1 (an open
  shell, its hinge at the back, -Z), festival-bell 0.6 x 0.7 x 0.6.
Each is built at about its size; the round ones are then trimmed to the stand-in's exact size (EXACT, a few per cent).
Output: public/models/<name>.glb and assets/previews/<name>.png.
Run: python3 scripts/run-bpy.py assets/blender/harbour.py [-- name ...]
"""
from __future__ import annotations

from pathlib import Path
import math
import random
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import sky as s  # noqa: E402  (chapter 1's crafted helpers: fix_normals, ring_faces, tuft, flower_clump, plate, outline...)
import volcano as v  # noqa: E402  (chapter 2's: Paint, painted, lathe, ellipsoid, sticker, eye, surface_line, preview...)
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

TAU = 2 * math.pi

# ---------------------------------------------------------------- palette (ticket 0013)

CAPE, CAPE_LIGHT, CAPE_DARK, CAPE_DEEP = "#9C8A8E", "#B8A8B0", "#86757C", "#77708A"
GRASS, TUFT, STONE_TOP = "#7FAF5A", "#6A9E4A", "#C9BCC0"
FLOWER_WHITE, FLOWER_PINK, FLOWER_GOLD = "#FFFFFF", "#F59AC6", "#FFD166"

WHITE, MINT, MINT_DARK = "#F7F7F2", "#8FD3C1", "#5FA99A"
PLINTH, PLINTH_DARK = "#C9C2B6", "#ADA597"
DOOR, WINDOW_GLASS, LAMP_GLASS, GOLD = "#4FA3A5", "#3E5A78", "#D4ECF2", "#FFD166"

HOUSE_WALL, HOUSE_TRIM, HOUSE_DOOR = "#F2E6D8", "#FBF6EC", "#8A6A48"
ROOF_CORAL, ROOF_BLUE, ROOF_GREEN = "#D98A8A", "#8AB4D9", "#9CCB8A"
LIT_WINDOW = "#FFE08A"

TRENCH, TRENCH_DEEP, TRENCH_TOP, TRENCH_EDGE = "#2B3F6E", "#1E2F58", "#3A5288", "#24365F"
SPECK, SPECK_STAR = "#9FE8FF", "#FFF3A8"

CORAL_BLUE, CORAL_LILAC, CORAL_BLUE_TIP, CORAL_LILAC_TIP, CORAL_FOOT = "#7FD6FF", "#C9A0E0", "#C4F0FF", "#EAD6F6", "#3A4F80"

WOOD, WOOD_LIGHT, WOOD_DARK, WOOD_END = "#B98A5E", "#A87B50", "#8A6A48", "#E2C49A"
LANTERN, LANTERN_CAP = "#FFD08A", "#C0503F"
BUNTING = ["#FF8A7A", "#FFD166", "#7CC6F2", "#8CD68A", "#C9A0E0"]

JELLY, JELLY_LIGHT, JELLY_INNER, JELLY_CORE, JELLY_RIBBON = "#FFC9E8", "#FFE3F2", "#FFB3DA", "#FFF3C4", "#FFB8DC"

SHELL, SHELL_SEAM, SHELL_SPINE, SHELL_RIM = "#8CCB9E", "#6FB287", "#9FD6AE", "#B9E3C3"
SKIN, BELLY, EYE = "#BFE3C8", "#EEF0CC", "#2B3A4A"

STAR_ORANGE, STAR_EDGE, STAR_DOT = "#F59B6B", "#FFC49E", "#FBB287"
SHELL_PINK, SHELL_PINK_DEEP, SHELL_INSIDE, SAND, STAR_GRAIN = "#F4E2EC", "#E3C2D4", "#FBF1F5", "#F2E2B0", "#FFF3A8"
BELL, BELL_LIGHT, BELL_DARK, CORD = "#C9B26A", "#E3CE86", "#5A4A2A", "#E86A6A"

hexmix = v.hexmix


# ---------------------------------------------------------------- small helpers (glTF coordinates)

def tube(parts, name, points, radii, m, sides=5):
    """A closed tube along a polyline (one material), wound outward."""
    obj = k.add_swept_tube(parts, name, points, radii, [m] * (len(points) - 1), sides=sides)
    s.fix_normals(obj)
    return obj


def lathe_oval(parts, name, profile, center, segments, paint, sx=1.0, sz=1.0, smooth=True, phase=0.0):
    """v.lathe about the vertical through `center` (x, z), its rings stretched by sx across and sz along."""
    cx, cz = center
    return v.lathe(parts, name, profile, lambda y, a, r: (cx + math.cos(a) * r * sx, y, cz + math.sin(a) * r * sz),
                   segments, paint, smooth, phase)


def double_strip(parts, name, points, widths, normal_hint, m):
    """A thin ribbon both sides can see (two coincident faces wound opposite ways): `points` along its middle,
    `widths` across, the across direction perpendicular to the strip and `normal_hint`."""
    verts = []
    for i, p in enumerate(points):
        a, b = Vector(points[max(i - 1, 0)]), Vector(points[min(i + 1, len(points) - 1)])
        side = (b - a).cross(Vector(normal_hint)).normalized()
        c = Vector(p)
        verts += [tuple(c + side * widths[i] / 2), tuple(c - side * widths[i] / 2)]
    n = len(points)
    front = [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(n - 1)]
    # The back side on its own copy of the vertices: faces on the same vertices would be dropped as duplicates.
    back = [tuple(2 * n + j for j in reversed(f)) for f in front]
    return k.add_mesh(parts, name, verts + verts, front + back, [m], smooth=True)


def star_outline(cx, cz, r_out, r_in, points=5, turn=0.0):
    return [(cx + math.cos(turn + math.pi * i / points) * (r_out if i % 2 == 0 else r_in),
             cz + math.sin(turn + math.pi * i / points) * (r_out if i % 2 == 0 else r_in)) for i in range(2 * points)]


def grain(parts, name, center, up, size, m, turn=0.0):
    """A little five-pointed star (a flat bipyramid, 20 triangles) lying across `up`."""
    q = s.rotate_to(up)
    ring = [s.place(center, q, (x, 0.0, z)) for x, z in star_outline(0.0, 0.0, size, size * 0.45, 5, turn)]
    top = s.place(center, q, (0, size * 0.32, 0))
    bottom = s.place(center, q, (0, -size * 0.22, 0))
    verts = ring + [top, bottom]
    n = len(ring)
    faces = [(i, (i + 1) % n, n) for i in range(n)] + [((i + 1) % n, i, n + 1) for i in range(n)]
    obj = k.add_mesh(parts, name, verts, faces, [m])
    s.fix_normals(obj)
    return obj


# ---------------------------------------------------------------- cape-rock

CAPE_W, CAPE_H, CAPE_D = 60.0, 34.6, 110.0


class Pal:
    """The few island colours s.grass_cap and the plant helpers ask for."""

    def __init__(self, paint):
        self.grass = paint(GRASS)
        self.tuft = paint(TUFT)
        self.white = paint(FLOWER_WHITE)
        self.pink = paint(FLOWER_PINK)
        self.gold = paint(FLOWER_GOLD)


def cape_rock():
    """みさきの いわば: a flat grass top on low cliffs of sunset-tinted rock. The top is a rounded rectangle exactly
    60 x 110 (the lip), the cliffs are tucked in under it in two strata (a proud pale band, a darker recessed one)
    and run on down to the sea floor 34.6 m below, where only fish see them. Built with the top at y 0 (moved up at
    the end)."""
    paint = v.Paint(0.92, glow={GRASS: 0.06})
    pal = Pal(paint)
    parts: list = []
    n = 26
    pts = s.outline(CAPE_W, CAPE_D, n, 33, lobe=0.025, power=3.4)
    nrm = s.outward_normals(pts)
    drip = s.drips_for(n, 34, 0.55, every=(3, 6))
    s.grass_cap(parts, "grass", pts, nrm, 0.5, 0.8, drip, pal)
    # The cliff: rings under the lip, each column a little in or out, banded by colour.
    rng = random.Random(35)
    nr = 18
    base = []
    for j in range(nr):
        i = round(j * n / nr) % n
        base.append((pts[i], nrm[i]))
    jitter = [rng.uniform(-0.25, 0.25) for _ in range(nr)]
    rings_spec = [(-0.42, 0.68, CAPE_LIGHT), (-1.7, 0.3, CAPE_LIGHT), (-2.7, 0.42, CAPE_DARK), (-2.82, 1.25, CAPE),
                  (-9.0, 0.9, CAPE_DEEP), (-CAPE_H, 0.95, CAPE_DEEP)]
    verts, faces, cols = [], [], []
    for r, (y, inset, colour) in enumerate(rings_spec):
        wob = [rng.uniform(-0.2, 0.2) if 0 < r < len(rings_spec) - 1 else 0.0 for _ in range(nr)]
        for j, ((x, z), (nx, nz)) in enumerate(base):
            d = max(0.12, inset + (jitter[j] if r >= 2 else 0.0))
            verts.append((x - d * nx, y + wob[j], z - d * nz))
    for r in range(len(rings_spec) - 1):
        faces += s.ring_faces(r * nr, (r + 1) * nr, nr)
        cols += [rings_spec[r][2]] * nr
    faces.append(tuple(range(nr)))
    cols.append(CAPE_LIGHT)
    last = (len(rings_spec) - 1) * nr
    faces.append(tuple(range(last, last + nr)))
    cols.append(CAPE_DEEP)
    v.painted(parts, "cliff", verts, faces, paint, cols, smooth=False)
    # Plants and stones on the top, only where none of 3-3's three copies has a rail, a platform, the lighthouse or a
    # house (x > 9 or x < -17), and 2.5 m in from the edge.
    decor = [(14.0, -30.0, "rock", 2.4), (19.0, -24.5, "tuft", 1.1), (21.0, 8.0, ("white", "gold"), 1.4), (15.5, 30.0, "tuft", 1.0),
             (-22.0, -18.0, ("pink", "white"), 1.4), (-24.0, 14.0, "rock", 2.2)]
    for c, (x, z, kind, size) in enumerate(decor):
        if kind == "rock":
            s.pebble(parts, f"top-rock-{c}", (size, size * 0.62, size * 0.85), (x, size * 0.16, z), paint(CAPE), paint(STONE_TOP), 60 + c)
        elif kind == "tuft":
            s.tuft(parts, f"top-tuft-{c}", (x, 0.0, z), size, 5, 80 + c, pal.tuft, spread=0.3 * size)
        else:
            s.flower_clump(parts, f"top-flowers-{c}", (x, 0.0, z), size, 90 + c, pal, [getattr(pal, col) for col in kind])
    return parts, 600


# ---------------------------------------------------------------- lighthouse

LAMP_Y = 20.6  # harbour.ts LAMP_HEIGHT: the lamp's centre


def lighthouse():
    """とうだい: a round white tower with two mint bands on a stone plinth, a porch with a teal door at the front (+Z)
    under a mint awning, three small arched windows up the front, a gallery with a railing, an octagonal lamp room of
    pale glass with mint frames (the game's lamp, radius 1.6 at y 20.6, glows through the panes) and a mint domed
    roof with a gold knob. A toy lighthouse: like no real one."""
    paint = v.Paint(0.7, glow={WHITE: 0.16, MINT: 0.1, LAMP_GLASS: 0.15, GOLD: 0.2, PLINTH: 0.06})
    parts: list = []
    v.lathe_y(parts, "plinth", [(0.0, 4.08, PLINTH_DARK), (0.32, 4.08, PLINTH), (1.05, 3.85, PLINTH), (1.25, 3.55, PLINTH)], (0, 0), 16,
              paint, smooth=False, phase=TAU / 32)
    # The tower: tapering from r 3.0 to 2.25, mint bands flush with the white.
    r = lambda y: 3.0 - 0.75 * (y - 1.25) / (18.4 - 1.25)  # noqa: E731
    bands = [(1.25, WHITE), (6.0, MINT), (7.7, WHITE), (12.2, MINT), (13.7, WHITE), (18.4, WHITE)]
    v.lathe_y(parts, "tower", [(y, r(y), c) for y, c in bands], (0, 0), 16, paint, smooth=True, phase=TAU / 32)
    # Porch and door.
    k.add_box(parts, "porch", (1.9, 2.75, 1.0), (0, 1.25 + 1.375, 2.85), paint(WHITE), bevel=0.06, segments=1)
    arch = [(0.45, 1.33), (0.45, 2.95)] + \
           [(0.45 * math.cos(math.radians(a)), 2.95 + 0.45 * math.sin(math.radians(a))) for a in range(30, 151, 30)] + \
           [(-0.45, 2.95), (-0.45, 1.33)]
    k.poly_decal(parts, "door", arch, 3.355, paint(DOOR), rings=1)
    k.disc_decal(parts, "knob", (0.26, 2.15, 3.36), (0.1, 0.1), paint(GOLD), 1, 6)
    s.plate(parts, "awning", (0, 4.12, 3.05), (1, 0, 0), (0, 0.3, 1), [(-1.15, -0.62), (1.15, -0.62), (1.15, 0.62), (-1.15, 0.62)], 0.12,
            [paint(MINT)])
    k.add_box(parts, "step", (1.5, 0.22, 0.42), (0, 1.36, 3.55), paint(PLINTH))
    # Three small arched windows up the front, between the bands, each in a mint frame.
    for i, y in enumerate((5.0, 10.0, 16.1)):
        zf = r(y) + 0.05
        frame = [(0.42, -0.62), (0.42, 0.25)] + \
                [(0.42 * math.cos(math.radians(a)), 0.25 + 0.42 * math.sin(math.radians(a))) for a in range(36, 145, 36)] + \
                [(-0.42, 0.25), (-0.42, -0.62)]
        k.poly_decal(parts, f"window-frame-{i}", [(x, y + q) for x, q in frame], zf, paint(MINT), rings=1)
        glass = [(x * 0.66, q * 0.7 + 0.03) for x, q in frame]
        k.poly_decal(parts, f"window-{i}", [(x, y + q) for x, q in glass], zf + 0.02, paint(WINDOW_GLASS), rings=1)
    # The gallery: a flared ledge under a white deck with a mint edge, and a railing round it.
    v.lathe_y(parts, "gallery", [(18.1, 2.3, WHITE), (18.65, 3.0, MINT), (18.95, 3.0, WHITE)], (0, 0), 16, paint, smooth=False,
              phase=TAU / 32)
    for i in range(10):
        a = TAU * (i + 0.5) / 10
        x, z = math.cos(a) * 2.86, math.sin(a) * 2.86
        k.add_tapered_segment(parts, f"post-{i}", (x, 18.94, z), (x, 19.92, z), 0.055, 0.05, paint(MINT_DARK), vertices=3, smooth=False)
    ring = []
    for i in range(14):
        a = TAU * i / 14
        ring.append((math.cos(a) * 2.86, 19.92, math.sin(a) * 2.86))
    ring_verts, ring_faces = [], []
    sides = 3
    for i, c in enumerate(ring):
        radial = Vector((c[0], 0, c[2])).normalized()
        for j in range(sides):
            b = TAU * j / sides
            p = Vector(c) + radial * (0.07 * math.cos(b)) + Vector((0, 0.07 * math.sin(b), 0))
            ring_verts.append(tuple(p))
    for i in range(len(ring)):
        a, b = i * sides, ((i + 1) % len(ring)) * sides
        ring_faces += [(a + j, a + (j + 1) % sides, b + (j + 1) % sides, b + j) for j in range(sides)]
    v.painted(parts, "rail", ring_verts, ring_faces, paint, MINT_DARK, smooth=True)
    # The lamp room: a white parapet, eight pale glass panes (circumradius 1.5, so the lamp's sphere shows through
    # them), mint frames outside the glass, a mint cap and the domed roof.
    v.lathe_y(parts, "parapet", [(18.95, 1.95, WHITE), (19.6, 1.95, WHITE)], (0, 0), 16, paint, smooth=False, phase=TAU / 32)
    v.lathe_y(parts, "glass", [(LAMP_Y - 1.0, 1.5, LAMP_GLASS), (LAMP_Y + 1.0, 1.5, LAMP_GLASS)], (0, 0), 8, paint, smooth=False, phase=TAU / 16)
    for i in range(8):
        a = TAU * i / 8 + TAU / 16  # the corners of the glass
        x, z = math.cos(a) * 1.6, math.sin(a) * 1.6
        k.add_tapered_segment(parts, f"frame-{i}", (x, LAMP_Y - 1.05, z), (x, LAMP_Y + 1.05, z), 0.07, 0.07, paint(MINT_DARK), vertices=3,
                              smooth=False)
    roof = [(21.6, 2.2, MINT), (21.85, 2.3, MINT), (22.15, 2.05, MINT), (22.75, 1.45, MINT), (23.2, 0.7, MINT), (23.42, 0.0, MINT)]
    v.lathe_y(parts, "roof", roof, (0, 0), 16, paint, smooth=lambda c, nm: nm.y < 0.95 and c.y > 21.9, phase=TAU / 32)
    v.ellipsoid(parts, "knob", (0.5, 0.5, 0.5), (0, 23.62, 0), paint(GOLD), 8, 4)
    k.add_tapered_segment(parts, "spike", (0, 23.8, 0), (0, 24.0, 0), 0.06, 0.0, paint(GOLD), vertices=4, smooth=False)
    return parts, 1200


# ---------------------------------------------------------------- harbour-house

def harbour_house():
    """みなとの いえ: a cream house on a stone plinth, its gable to the front (+Z, the track) under a coral roof, a
    blue-roofed lean-to on its left (+X), a green canopy over the wooden door, warm lit windows (front, lean-to, the
    far side and a round one in the gable) and a chimney. The three roofs in three colours."""
    paint = v.Paint(0.8, glow={LIT_WINDOW: 0.8, HOUSE_WALL: 0.1, ROOF_CORAL: 0.1, ROOF_BLUE: 0.1, ROOF_GREEN: 0.1})
    parts: list = []
    B = k.add_box
    B(parts, "plinth", (4.7, 0.3, 4.9), (-0.55, 0.15, 0.0), paint(PLINTH_DARK))
    B(parts, "walls", (4.2, 3.0, 4.4), (-0.55, 1.8, 0.0), paint(HOUSE_WALL))
    # The front gable fill (up under the roof) and the coral roof slab, ridge along z.
    gable = [(-2.65, 3.3), (1.55, 3.3), (-0.55, 4.95)]
    v.painted(parts, "gable", [(x, y, -2.2) for x, y in gable] + [(x, y, 2.2) for x, y in gable],
              [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)], paint, HOUSE_WALL)
    hw, eave, ridge, th = 2.55, 3.05, 5.15, 0.3
    outline = [(hw, eave), (0, ridge), (-hw, eave), (-hw, eave - th), (0, ridge - th * 1.4), (hw, eave - th)]
    verts = [(x - 0.55, y, -2.9) for x, y in outline] + [(x - 0.55, y, 2.9) for x, y in outline]
    m = len(outline)
    faces = [tuple(range(m)), tuple(range(2 * m - 1, m - 1, -1))] + [(i, (i + 1) % m, m + (i + 1) % m, m + i) for i in range(m)]
    v.painted(parts, "roof", verts, faces, paint, ROOF_CORAL)
    # The lean-to on the left (+X), its blue roof sloping down from the main wall.
    B(parts, "lean-to", (1.4, 2.1, 3.2), (2.2, 1.35, 0.2), paint(HOUSE_WALL))
    s.plate(parts, "lean-to-roof", (2.25, 2.62, 0.2), (0.93, -0.37, 0), (0, 0, 1), [(-0.9, -1.95), (0.9, -1.95), (0.9, 1.95), (-0.9, 1.95)],
            0.2, [paint(ROOF_BLUE)])
    # The chimney through the roof's right slope.
    B(parts, "chimney", (0.55, 1.7, 0.55), (-1.75, 5.0, -1.0), paint(PLINTH))
    B(parts, "chimney-cap", (0.72, 0.14, 0.72), (-1.75, 5.88, -1.0), paint(PLINTH_DARK))
    # Door with its green canopy and step, windows lit warm.
    B(parts, "door", (0.95, 1.9, 0.08), (0.25, 0.3 + 0.95, 2.22), paint(HOUSE_DOOR))
    B(parts, "canopy", (1.5, 0.14, 0.7), (0.25, 2.42, 2.52), paint(ROOF_GREEN))
    B(parts, "step", (1.3, 0.2, 0.45), (0.25, 0.4, 2.42), paint(PLINTH))
    B(parts, "window-front", (1.0, 0.95, 0.08), (-1.6, 1.85, 2.22), paint(LIT_WINDOW))
    B(parts, "sill-front", (1.2, 0.14, 0.22), (-1.6, 1.32, 2.28), paint(HOUSE_TRIM))
    B(parts, "window-lean", (0.7, 0.75, 0.08), (2.2, 1.45, 1.82), paint(LIT_WINDOW))
    B(parts, "window-side", (0.08, 0.95, 1.1), (-2.67, 1.85, 0.3), paint(LIT_WINDOW))
    B(parts, "sill-side", (0.22, 0.14, 1.3), (-2.72, 1.32, 0.3), paint(HOUSE_TRIM))
    k.disc_decal(parts, "attic-rim", (-0.55, 3.82, 2.21), (0.7, 0.7), paint(HOUSE_TRIM), 1, 10)
    k.disc_decal(parts, "attic", (-0.55, 3.82, 2.225), (0.5, 0.5), paint(LIT_WINDOW), 1, 10)
    return parts, 300


# ---------------------------------------------------------------- trench-wall

TW_W, TW_H, TW_D = 40.0, 24.0, 12.0


def tw_taper(x):
    """How much of the full thickness and height the wall keeps at x: 1 over the middle, down toward the ends."""
    e = min(1.0, abs(x) / (TW_W / 2))
    return 0.22 + 0.78 * math.sqrt(max(0.0, 1.0 - e ** 5))


def tw_height(x):
    e = min(1.0, abs(x) / (TW_W / 2))
    wave = 1.0 + 0.05 * math.sin(x * 0.31 + 0.6) + 0.03 * math.sin(x * 0.77 + 2.0)
    return TW_H * (0.7 + 0.3 * math.sqrt(max(0.0, 1.0 - e ** 3))) * wave / 1.06


def tw_front(x, y):
    """The front face's z at (x, y): leaning back toward the top, a soft bulge low down, a ledge at mid height."""
    h = tw_height(x)
    u = y / h
    z = TW_D / 2 * (1.0 - 0.32 * u)
    z += 0.9 * math.exp(-((u - 0.25) / 0.14) ** 2) * (0.6 + 0.4 * math.sin(x * 0.4 + 1.0))
    z += 0.7 * (1.0 if 0.52 < u < 0.6 else 0.0) * (0.7 + 0.3 * math.sin(x * 0.23))
    return z * tw_taper(x)


def trench_wall():
    """ほしの みぞの かべ: a wall of round indigo rock, leaning back as it rises, a soft bulge low down and a ledge at
    mid height, darker below and lighter on top, its ends tapering; little glowing specks (うみぼたる) on its face (+Z),
    most sky blue, a few pale yellow like stars."""
    paint = v.Paint(0.9, glow={SPECK: 0.95, SPECK_STAR: 0.85, TRENCH_TOP: 0.05})
    parts: list = []
    cols_x = [-20.0 + 40.0 * i / 11 for i in range(12)]
    rows = [0.0, 0.12, 0.25, 0.4, 0.52, 0.6, 0.75, 0.9, 1.0]  # front rows, as fractions of the height
    rings = []
    for x in cols_x:
        h = tw_height(x)
        t = tw_taper(x)
        ring = [(x, u * h * (0.985 if u == 1.0 else 1.0), tw_front(x, u * h)) for u in rows]
        ring.append((x, h * 0.99, TW_D / 2 * 0.25 * t))  # over the top
        ring.append((x, h * 0.93, -TW_D / 2 * 0.6 * t))
        ring.append((x, h * 0.55, -TW_D / 2 * 0.92 * t))
        ring.append((x, 0.0, -TW_D / 2 * t))
        rings.append(ring)
    m = len(rings[0])
    verts = [p for r in rings for p in r]
    faces = []
    for i in range(len(rings) - 1):
        faces += [(i * m + j, i * m + (j + 1) % m, (i + 1) * m + (j + 1) % m, (i + 1) * m + j) for j in range(m)]
    faces.append(tuple(range(m)))
    last = (len(rings) - 1) * m
    faces.append(tuple(range(last + m - 1, last - 1, -1)))

    def colour(c, n):
        if n.y < -0.9:
            return TRENCH_DEEP
        if abs(n.x) > 0.85:
            return TRENCH_EDGE
        if n.y > 0.55:
            return TRENCH_TOP
        u = c.y / TW_H
        return TRENCH_DEEP if u < 0.2 else TRENCH if u < 0.68 else TRENCH_TOP

    v.painted(parts, "rock", verts, faces, paint, colour, smooth=lambda c, n: abs(n.y) < 0.9)
    # The specks: little round (five-sided) stickers on the front, scattered (none on the narrow ends).
    rng = random.Random(41)
    placed = 0
    tries = 0
    while placed < 32 and tries < 2000:
        tries += 1
        x = rng.uniform(-17.0, 17.0)
        h = tw_height(x)
        y = rng.uniform(0.08, 0.92) * h
        if 0.5 < y / h < 0.62:
            continue
        z = tw_front(x, y)
        dzdx = (tw_front(x + 0.05, y) - tw_front(x - 0.05, y)) / 0.1
        dzdy = (tw_front(x, y + 0.05) - tw_front(x, y - 0.05)) / 0.1
        nrm = Vector((-dzdx, -dzdy, 1.0)).normalized()
        size = rng.uniform(0.5, 0.85) if placed % 5 else rng.uniform(1.0, 1.35)
        colour_ = SPECK_STAR if placed % 7 == 3 else SPECK
        v.sticker(parts, f"speck-{placed}", (x, y, z), tuple(nrm), (size, size), paint(colour_), 5, tilt=rng.uniform(0, 1.5), lift=0.12)
        placed += 1
    return parts, 500


# ---------------------------------------------------------------- glow-coral

def finger(parts, name, base, tip, r0, r1, rb, paint, stalk, knob, segments=7):
    """A soft round branch: a four-sided stalk (open at both ends, which sit inside the stone and the bulb) from
    `base` toward `tip`, and a round bulb of radius `rb` (`segments` round, five rings high) in the paler colour, its top
    at `tip`."""
    base, tip = Vector(base), Vector(tip)
    axis = (tip - base).normalized()
    ref = Vector((1, 0, 0)) if abs(axis.x) < 0.9 else Vector((0, 0, 1))
    u = axis.cross(ref).normalized()
    w = axis.cross(u).normalized()
    centre = tip - axis * rb
    verts = []
    for c, r in ((base, r0), (centre, r1)):
        verts += [tuple(c + (u * math.cos(TAU * j / 4 + 0.4) + w * math.sin(TAU * j / 4 + 0.4)) * r) for j in range(4)]
    obj = k.add_mesh(parts, f"{name}-stalk", verts, s.ring_faces(0, 4, 4), [paint(stalk)], smooth=True)
    # Outward: the first face's normal away from the stalk's axis.
    poly = obj.data.polygons[0]
    c = k.gltf(poly.center)
    foot = base + axis * (c - base).dot(axis)
    if k.gltf(poly.normal).dot(c - foot) < 0:
        obj.data.flip_normals()
    bulb = v.ellipsoid(parts, f"{name}-bulb", (rb * 2, rb * 2, rb * 2), tuple(centre), paint(knob), segments, 5)
    # Two-toned, so it reads round although it glows: the pale colour on top, the branch's underneath.
    bulb.data.materials.append(paint(stalk))
    for poly in bulb.data.polygons:
        poly.material_index = 0 if poly.normal.z > -0.15 else 1


def glow_coral():
    """ひかる さんご: four slender branches growing up and out of a low indigo stone, sky blue and lilac by turns, each
    ending in a big round bulb, pale on top; they glow a little (the bulbs more)."""
    paint = v.Paint(0.6, glow={CORAL_BLUE: 0.36, CORAL_LILAC: 0.36, CORAL_BLUE_TIP: 0.45, CORAL_LILAC_TIP: 0.45, CORAL_FOOT: 0.04})
    parts: list = []
    # A low indigo stone (a squashed five-sided bipyramid) the branches grow out of.
    s.bloom(parts, "foot", (0.0, 0.12, 0.0), 0.62, paint(CORAL_FOOT), seed=3)
    # (angle, how far out, height, stalk radius at the foot and under the bulb, the bulb's radius, its segments)
    # Spread so the coral is 3 x 3 x 3 as built (EXACT only trims it: the bulbs stay round).
    for i, (a, out, up, r0, r1, rb, seg) in enumerate([(0.0, 1.32, 2.2, 0.21, 0.16, 0.36, 7), (1.57, 1.33, 1.55, 0.2, 0.15, 0.33, 6),
                                                       (3.14, 1.31, 2.7, 0.22, 0.17, 0.38, 7), (4.71, 1.32, 1.85, 0.2, 0.15, 0.34, 6)]):
        blue = i % 2 == 0
        base = (math.cos(a) * 0.12, 0.1, math.sin(a) * 0.12)
        tip = (math.cos(a) * out, 0.3 + up, math.sin(a) * out)
        finger(parts, f"branch-{i}", base, tip, r0, r1, rb, paint, CORAL_BLUE if blue else CORAL_LILAC, CORAL_BLUE_TIP if blue else CORAL_LILAC_TIP,
               seg)
    return parts, 250


# ---------------------------------------------------------------- festival-raft

RAFT_LANTERNS = [(-2.6, 2.6, -1.6), (-2.6, 2.6, 1.6), (2.6, 2.6, -1.6), (2.6, 2.6, 1.6)]  # harbour.ts


def paper_lantern(parts, name, center, paint, height=0.72, radius=0.36, segments=8):
    """A round paper lantern (no letters, no pattern): a glowing warm body between two small red caps."""
    cx, cy, cz = center
    h = height / 2
    prof = [(cy - h, radius * 0.45, LANTERN_CAP), (cy - h * 0.62, radius * 0.9, LANTERN), (cy + h * 0.05, radius, LANTERN),
            (cy + h * 0.66, radius * 0.86, LANTERN_CAP), (cy + h, radius * 0.45, LANTERN_CAP)]
    obj = v.lathe_y(parts, name, prof, (cx, cz), segments, paint, smooth=lambda c, n: abs(n.y) < 0.9, phase=TAU / (2 * segments))
    # Red rims: the caps and the steep bands at top and bottom; the round middle glows.
    names = [m.name for m in obj.data.materials]
    body, rim = names.index(paint(LANTERN).name), names.index(paint(LANTERN_CAP).name)
    for poly in obj.data.polygons:
        poly.material_index = body if abs(k.gltf(poly.normal).y) < 0.6 else rim
    return obj


def festival_raft():
    """ちょうちんの いかだ: six round logs side by side (light cut ends), two cross beams, and at each side a T-shaped
    wooden stand holding two round paper lanterns (the four at (+-2.6, 2.6, +-1.6)), a string of little flags in
    festival colours between the stands."""
    paint = v.Paint(0.8, glow={LANTERN: 0.62})
    parts: list = []
    for i in range(6):
        z, r = -2.5 + i, 0.48
        ring = [(r * math.cos(TAU * j / 6 + TAU / 12), r * math.sin(TAU * j / 6 + TAU / 12)) for j in range(6)]
        verts = [(-4.0, 0.48 + b, z + a) for a, b in ring] + [(4.0, 0.48 + b, z + a) for a, b in ring]
        faces = [tuple(range(6)), tuple(range(11, 5, -1))] + [(j, (j + 1) % 6, 6 + (j + 1) % 6, 6 + j) for j in range(6)]
        v.painted(parts, f"log-{i}", verts, faces, paint, lambda c, n, i=i: WOOD_END if abs(n.x) > 0.9 else (WOOD if i % 2 else WOOD_LIGHT),
                  smooth=lambda c, n: abs(n.x) < 0.9)
    for x in (-2.6, 2.6):
        k.add_box(parts, f"beam-{x}", (0.36, 0.22, 6.0), (x, 1.03, 0.0), paint(WOOD_DARK))
        k.add_tapered_segment(parts, f"pole-{x}", (x, 1.1, 0.0), (x, 3.0, 0.0), 0.1, 0.085, paint(WOOD_DARK), vertices=5, smooth=False)
        k.add_box(parts, f"bar-{x}", (0.14, 0.12, 3.7), (x, 2.94, 0.0), paint(WOOD_DARK))
    for i, c in enumerate(RAFT_LANTERNS):
        paper_lantern(parts, f"lantern-{i}", c, paint)
    # A string of flags between the two pole tops, sagging a little (both sides of each flag are seen).
    pts = []
    for i in range(7):
        t = i / 6
        pts.append((-2.6 + 5.2 * t, 2.8 - 0.35 * math.sin(math.pi * t), 0.0))
    tube(parts, "string", pts, [0.025] * len(pts), paint(WOOD_END), sides=3)
    for i in range(5):
        t = (i + 1) / 6
        x, y = -2.6 + 5.2 * t, 2.8 - 0.35 * math.sin(math.pi * t)
        tri = [(x - 0.17, y - 0.01), (x + 0.17, y - 0.01), (x, y - 0.38)]
        verts = [(a, b, -0.015) for a, b in tri] + [(a, b, 0.015) for a, b in tri]
        obj = k.add_mesh(parts, f"flag-{i}", verts, [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)],
                         [paint(BUNTING[i % len(BUNTING)])])
        s.fix_normals(obj)
    return parts, 600


# ---------------------------------------------------------------- lantern-jelly

def lantern_jelly():
    """くらげの ちょうちん: a round pink cap glowing a little (paler on top, its rim softly scalloped), a warm light inside
    it seen under the rim, and four short soft ribbons hanging from under it (ribbons, not stinging legs). No face."""
    paint = v.Paint(0.55, glow={JELLY: 0.42, JELLY_LIGHT: 0.48, JELLY_INNER: 0.5, JELLY_CORE: 0.85, JELLY_RIBBON: 0.4})
    parts: list = []
    cap = [(1.42, 0.0, JELLY_INNER), (1.46, 0.5, JELLY_INNER), (1.3, 0.8, JELLY), (1.52, 0.8, JELLY), (1.82, 0.74, JELLY),
           (2.08, 0.6, JELLY_LIGHT), (2.28, 0.38, JELLY_LIGHT), (2.4, 0.0, JELLY_LIGHT)]
    obj = v.lathe_y(parts, "cap", cap, (0, 0), 10, paint, smooth=lambda c, n: True)
    # Scallops: every other vertex of the rim ring (y 1.3) tucked in a little.
    for vert in obj.data.vertices:
        p = k.gltf(vert.co)
        if abs(p.y - 1.3) < 1e-3:
            a = math.atan2(p.z, p.x)
            if round(a / (TAU / 10)) % 2:
                vert.co.x *= 0.88
                vert.co.y *= 0.88
                vert.co.z += 0.06
    v.ellipsoid(parts, "light", (0.62, 0.42, 0.62), (0, 1.48, 0), paint(JELLY_CORE), 6, 3)
    for i in range(4):
        a = TAU * i / 4 + 0.6
        rx, rz = math.cos(a), math.sin(a)
        pts, widths = [], []
        for j in range(4):
            t = j / 3
            w = 0.14 * math.sin(t * math.pi * 1.6 + i * 1.3)
            r_ = 0.46 + 0.1 * t
            pts.append((rx * r_ - rz * w, 1.38 - 1.38 * t, rz * r_ + rx * w))
            widths.append(0.3 * (1 - 0.3 * t))
        double_strip(parts, f"ribbon-{i}", pts, widths, (rx, 0, rz), paint(JELLY_RIBBON))
    return parts, 200


# ---------------------------------------------------------------- lantern-post

def lantern_post():
    """ホームの ちょうちんの はしら: a wooden post, a little dish at its top holding one round paper lantern, a small
    wooden hat over it."""
    paint = v.Paint(0.8, glow={LANTERN: 0.62})
    parts: list = []
    k.add_tapered_segment(parts, "post", (0, 0, 0), (0, 2.8, 0), 0.085, 0.07, paint(WOOD_DARK), vertices=5, smooth=False)
    v.lathe_y(parts, "dish", [(2.74, 0.09, WOOD_DARK), (2.83, 0.2, WOOD_DARK)], (0, 0), 6, paint, smooth=False)
    paper_lantern(parts, "lantern", (0, 3.12, 0), paint, height=0.58, radius=0.27)
    v.lathe_y(parts, "hat", [(3.38, 0.3, WOOD_DARK), (3.5, 0.0, WOOD_DARK)], (0, 0), 8, paint, smooth=False, phase=0.0)
    return parts, 150


# ---------------------------------------------------------------- sea turtles

SHELL_Z = -0.2       # the shell's centre along z
SHELL_RX, SHELL_SZ = 1.12, 1.3  # its radius across and how much longer it is
SHELL_H = 0.78                  # the dome's height over its rim band


def turtle_shell(parts, paint, lift):
    """The shell: a round dome (an ellipsoid, darker green between the plates) on a pale rim, its lowest band the
    lighter green of the edge plates, and seven raised hexagonal plates on top (three down the spine a shade paler),
    each a low hexagonal pillow sitting just over the dome."""
    by = lift + 0.32
    rz = SHELL_RX * SHELL_SZ

    def top(x, z):
        u = (x / SHELL_RX) ** 2 + ((z - SHELL_Z) / rz) ** 2
        return by + 0.06 + SHELL_H * math.sqrt(max(0.0, 1.0 - u))

    prof = [(by - 0.07, SHELL_RX * 0.9, SHELL_RIM), (by, SHELL_RX + 0.05, SHELL_RIM), (by + 0.06, SHELL_RX, SHELL)]
    for deg in (22, 44, 63, 80):
        a = math.radians(deg)
        prof.append((by + 0.06 + SHELL_H * math.sin(a), SHELL_RX * math.cos(a), SHELL_SEAM))
    prof.append((by + 0.06 + SHELL_H, 0.0, SHELL_SEAM))
    dome = lathe_oval(parts, "shell", prof, (0, SHELL_Z), 14, paint, 1.0, SHELL_SZ, smooth=lambda c, n: n.y > -0.9)
    R, sz = 0.4 * 0.84, 1.2
    centres = [(0.0, 0.0, SHELL_SPINE), (0.0, 0.83, SHELL_SPINE), (0.0, -0.83, SHELL_SPINE),
               (0.6, 0.415, SHELL), (0.6, -0.415, SHELL), (-0.6, 0.415, SHELL), (-0.6, -0.415, SHELL)]
    for i, (cx, cz, colour) in enumerate(centres):
        cz += SHELL_Z
        corners = [(cx + math.cos(TAU * j / 6) * R, cz + math.sin(TAU * j / 6) * R * sz) for j in range(6)]
        verts = [(cx, top(cx, cz) + 0.1, cz)] + [(x, top(x, z) + 0.035, z) for x, z in corners]
        faces = [(0, 1 + (j + 1) % 6, 1 + j) for j in range(6)]
        obj = k.add_mesh(parts, f"plate-{i}", verts, faces, [paint(colour)], smooth=True)
        if k.gltf(obj.data.polygons[0].normal).y < 0:
            obj.data.flip_normals()
    return dome


def flipper(parts, paint, name, root, size, yaw, pitch=0.0):
    """A soft paddle (a flattened oval) reaching out from `root`: yaw 0 points along +X, a positive yaw turns it
    toward the back (-Z); pitch > 0 tips it down."""
    w, h, d = size
    reach = w / 2 * 0.85
    c = Vector(root) + Vector((math.cos(yaw) * math.cos(pitch), -math.sin(pitch), -math.sin(yaw) * math.cos(pitch))) * reach
    obj = v.ellipsoid(parts, name, (w, h, d), tuple(c), paint(SKIN), 8, 3)
    obj.rotation_euler = (0.0, pitch, yaw)  # Blender axes: x, y (= glTF -z), z (up); applied x, then y, then z
    return obj


def side_yaw(side, deg):
    """A flipper's yaw on the turtle's left (+X, side 1) or right (side -1), `deg` back from straight out."""
    return math.radians(deg) if side > 0 else math.radians(180 - deg)


def sea_turtle(awake):
    paint = v.Paint(0.7, glow={SHELL: 0.14, SHELL_SPINE: 0.14, SHELL_SEAM: 0.08, SHELL_RIM: 0.16, SKIN: 0.16, BELLY: 0.12})
    parts: list = []
    lift = 0.22 if awake else 0.0
    turtle_shell(parts, paint, lift)
    v.ellipsoid(parts, "belly", (2.06, 0.5, 2.7), (0, lift + 0.3, SHELL_Z), paint(BELLY), 12, 4)
    head_c = (0, lift + (0.62 if awake else 0.42), 1.62 if awake else 1.5)
    head = v.ellipsoid(parts, "head", (0.72, 0.62, 0.8), head_c, paint(SKIN), 10, 6)
    tree = k.world_tree(head)
    if awake:
        for side in (-1, 1):
            v.eye(parts, paint, tree, head_c, v.look(side * math.radians(38), math.radians(14)), (0.12, 0.14), f"eye-{side}", head)
        # Front flippers spread wide and swept back, rear ones trailing down behind.
        for side in (-1, 1):
            flipper(parts, paint, f"front-{side}", (side * 0.8, lift + 0.42, 0.72), (1.1, 0.14, 0.48), side_yaw(side, 22), math.radians(-6))
            flipper(parts, paint, f"back-{side}", (side * 0.5, lift + 0.24, -1.5), (0.68, 0.12, 0.34), side_yaw(side, 52), math.radians(26))
    else:
        for side in (-1, 1):
            pts = []
            for t in (0.0, 0.25, 0.5, 0.75, 1.0):
                d = v.look(side * math.radians(38) + side * math.radians(14) * (2 * t - 1),
                           math.radians(12) - math.radians(7) * (1 - (2 * t - 1) ** 2))
                pts.append(v.on_surface(tree, tuple(Vector(head_c) + d * 0.8), head_c))
            v.hug(v.surface_line(parts, f"eye-{side}", pts, 0.035, paint(EYE)), head, 0.006)
            # Flippers folded back along the sides, the rear ones tucked in.
            flipper(parts, paint, f"front-{side}", (side * 0.85, 0.2, 0.75), (0.95, 0.13, 0.42), side_yaw(side, 45))
            flipper(parts, paint, f"back-{side}", (side * 0.55, 0.15, -1.45), (0.55, 0.11, 0.3), side_yaw(side, 55))
    k.add_tapered_segment(parts, "tail", (0, lift + 0.28, -1.75), (0, lift + 0.22, -2.0), 0.12, 0.0, paint(SKIN), vertices=5, smooth=True)
    return parts, 800 if awake else 600


# ---------------------------------------------------------------- records

def starfish():
    """ゆうやけ ひとで: a plump five-armed star in sunset orange, a lighter line down each arm, its rim paler."""
    paint = v.Paint(0.75, glow={STAR_ORANGE: 0.08, STAR_EDGE: 0.1, STAR_DOT: 0.1})
    parts: list = []
    outline = []
    for i in range(5):
        a = TAU * i / 5 + math.pi / 2
        for da, rr in ((-0.15, 0.355), (0.0, 0.4), (0.15, 0.355)):
            outline.append((math.cos(a + da) * rr, -math.sin(a + da) * rr))
        av = a + TAU / 10
        outline.append((math.cos(av) * 0.17, -math.sin(av) * 0.17))
    m = len(outline)
    verts = [(0.0, 0.2, 0.0)]
    verts += [(x * 0.5, 0.14, z * 0.5) for x, z in outline]
    verts += [(x * 0.92, 0.055, z * 0.92) for x, z in outline]
    verts += [(x, 0.0, z) for x, z in outline]
    faces, cols = [], []
    for j in range(m):
        nj = (j + 1) % m
        faces.append((0, 1 + j, 1 + nj))
        cols.append(STAR_DOT if j % 4 in (0, 1) else STAR_ORANGE)  # the two faces on each arm's spine
    for ring, colour in ((0, STAR_ORANGE), (1, STAR_EDGE)):
        a0, a1 = 1 + ring * m, 1 + (ring + 1) * m
        for j in range(m):
            nj = (j + 1) % m
            faces.append((a0 + j, a1 + j, a1 + nj, a0 + nj))
            cols.append(colour)
    faces.append(tuple(range(1 + 3 * m - 1, 1 + 2 * m - 1, -1)))
    cols.append(STAR_EDGE)
    v.painted(parts, "star", verts, faces, paint, cols, smooth=lambda c, nrm: nrm.y > -0.9)
    return parts, 120


def star_sand():
    """ほしの すな: a little scallop shell, pink-white, lying open: its ribbed lower half (a round bowl, the hinge at the
    back) holds a mound of sand with star grains glowing pale yellow, its smaller upper half stands open over the
    hinge like a lid."""
    paint = v.Paint(0.6, glow={STAR_GRAIN: 0.85, SAND: 0.12, SHELL_PINK: 0.08, SHELL_INSIDE: 0.12})
    parts: list = []
    seg = 7

    def valve(name, hinge, radius, depth, open_deg):
        """A ribbed round valve: ribs from the hinge out to a rim that is nearly a circle (radius `radius`, the hinge just
        inside its back edge), bowed `depth` in its middle (down for the lower one, a bowl) and less at the rim; outside in
        two pinks, inside paler; closed. Opened by `open_deg` about the hinge's axis (x)."""
        ang = math.radians(open_deg)
        rim = []
        for i in range(seg + 1):
            th = math.radians(-128 + 256 * i / seg)
            rim.append((math.sin(th) * radius, radius * 0.92 + math.cos(th) * radius))

        def put(lx, lz, bow):
            y = -bow * math.cos(ang) + lz * math.sin(ang)
            z = lz * math.cos(ang) + bow * math.sin(ang)
            return (hinge[0] + lx, hinge[1] + y, hinge[2] + z)

        verts = [hinge]
        for skin, (lift, shrink) in enumerate(((0.0, 1.0), (0.03, 0.96))):
            for row in (0.5, 1.0):
                for i, (rx, rz) in enumerate(rim):
                    lx, lz = rx * row * shrink, rz * row * shrink
                    bow = (depth - lift) * (1 - (lx / radius) ** 2 * 0.6) * (1.0 if row < 1 else 0.3) + (0.02 if (i % 2 and skin == 0) else 0.0)
                    verts.append(put(lx, lz, bow - lift))
        w = seg + 1
        o0, o1, i0, i1 = 1, 1 + w, 1 + 2 * w, 1 + 3 * w
        faces, cols = [], []
        for i in range(seg):
            rib = SHELL_PINK_DEEP if i % 2 else SHELL_PINK
            faces += [(0, o0 + i + 1, o0 + i), (o0 + i, o0 + i + 1, o1 + i + 1, o1 + i), (0, i0 + i, i0 + i + 1),
                      (i0 + i + 1, i0 + i, i1 + i, i1 + i + 1), (o1 + i, o1 + i + 1, i1 + i + 1, i1 + i)]
            cols += [rib, rib, SHELL_INSIDE, SHELL_INSIDE, SHELL_PINK]
        faces += [(0, o0, o1, i1, i0), (0, i0 + seg, i1 + seg, o1 + seg, o0 + seg)]
        cols += [SHELL_PINK, SHELL_PINK]
        return v.painted(parts, name, verts, faces, paint, cols, smooth=lambda c, n: True)

    valve("lower", (0.0, 0.16, -0.46), 0.5, 0.14, 0.0)
    valve("upper", (0.0, 0.17, -0.47), 0.34, -0.09, 43.0)
    lathe_oval(parts, "sand", [(0.04, 0.27, SAND), (0.14, 0.25, SAND), (0.21, 0.13, SAND), (0.23, 0.0, SAND)], (0.0, 0.0), 7, paint, 1.0, 1.1)
    for i, (x, z, up, size, turn) in enumerate([(0.0, 0.02, (0.0, 1.0, 0.1), 0.095, 0.2), (0.14, -0.04, (0.3, 1.0, 0.0), 0.075, 0.9),
                                               (-0.13, 0.08, (-0.3, 1.0, 0.2), 0.08, 0.5), (0.05, 0.19, (0.1, 1.0, 0.4), 0.07, 1.3)]):
        y = 0.24 - (x * x + z * z) * 1.9
        grain(parts, f"grain-{i}", (x, y + 0.015, z), up, size, paint(STAR_GRAIN), turn)
    return parts, 250


def festival_bell():
    """まつりの すず: a round gold bell (paler on top), the seam round its middle, its slit underneath, a small knob on top
    and a red cord tied to it: a short loop up top, its two ends lying down the bell's front."""
    paint = v.Paint(0.35, glow={BELL: 0.3, BELL_LIGHT: 0.35, CORD: 0.15})
    parts: list = []
    r = 0.28
    cy = 0.28
    prof = [(cy - r, 0.0, BELL)]
    for j in range(1, 6):
        a = math.pi * j / 6
        y = cy - math.cos(a) * r
        prof.append((y, math.sin(a) * r, BELL if y < cy + 0.06 else BELL_LIGHT))
    prof.append((cy + r, 0.0, BELL_LIGHT))
    bell = v.lathe_y(parts, "bell", prof, (0, 0), 10, paint, smooth=lambda c, n: True)
    tree = k.world_tree(bell)
    # The seam round its middle (a little proud, darker gold) and the slit underneath.
    seam = []
    for yy, rr in ((cy - 0.022, r + 0.012), (cy + 0.022, r + 0.012)):
        seam += [(math.cos(TAU * j / 10) * rr, yy, math.sin(TAU * j / 10) * rr) for j in range(10)]
    obj = k.add_mesh(parts, "seam", seam, s.ring_faces(0, 10, 10), [paint(hexmix(BELL, BELL_DARK, 0.35))], smooth=True)
    c0 = k.gltf(obj.data.polygons[0].center)
    if k.gltf(obj.data.polygons[0].normal).dot(Vector((c0.x, 0, c0.z))) < 0:
        obj.data.flip_normals()
    pts = []
    for t in (-1.0, -0.5, 0.0, 0.5, 1.0):
        d = Vector((math.sin(t * 0.7), -2.2, math.cos(t * 0.7))).normalized()
        pts.append(v.on_surface(tree, tuple(Vector((0, cy, 0)) + d * 0.6), (0, cy, 0)))
    v.hug(v.surface_line(parts, "slit", pts, 0.045, paint(BELL_DARK)), bell, 0.004)
    # The knob on top, the cord's short loop over it and its two ends down the sides (just off the bell).
    v.lathe_y(parts, "knob", [(cy + r - 0.03, 0.05, BELL), (cy + r + 0.045, 0.04, BELL)], (0, 0), 5, paint, smooth=False)
    top = cy + r + 0.03
    loop = [(0.0, top, 0.0), (0.055, top + 0.06, 0.0), (0.0, top + 0.115, 0.0), (-0.055, top + 0.06, 0.0), (0.0, top, 0.0)]
    tube(parts, "cord", loop, [0.024] * len(loop), paint(CORD), sides=3)
    for side in (-1, 1):
        ends = []
        for t in (0.0, 0.5, 1.0):
            a = math.radians(16 + 52 * t)
            ends.append((side * math.sin(a) * (r + 0.026) * (0.3 + 0.1 * t), cy + math.cos(a) * (r + 0.026),
                         math.sin(a) * (r + 0.026) * (0.95 - 0.02 * t)))
        tube(parts, f"end-{side}", ends, [0.026, 0.026, 0.03], paint(CORD), sides=3)
    return parts, 200


# ---------------------------------------------------------------- export and preview

def preview(model, name, direction=(0.55, -0.72, 0.42), size=(512, 400), dark=False):
    """volcano.preview's three-quarter view; `dark` for the glowing ones: an evening-blue sky and a dimmer light, so
    their glow can be judged."""
    v.preview(model, name, direction, size)
    if not dark:
        return
    scene = bpy.context.scene
    tree = scene.world.node_tree
    seen = tree.nodes["Background"]
    seen.inputs["Color"].default_value = (0.05, 0.08, 0.2, 1)
    for node in tree.nodes:
        if node.type == "BACKGROUND" and node is not seen:
            node.inputs["Strength"].default_value = 0.35
    for obj in scene.objects:
        if obj.type == "LIGHT":
            obj.data.energy = 1.0
    bpy.ops.render.render(write_still=True)


BUILDERS = {"cape-rock": cape_rock, "lighthouse": lighthouse, "harbour-house": harbour_house, "trench-wall": trench_wall,
            "glow-coral": glow_coral, "festival-raft": festival_raft, "lantern-jelly": lantern_jelly, "lantern-post": lantern_post,
            "sea-turtle-sleep": lambda: sea_turtle(False), "sea-turtle": lambda: sea_turtle(True), "starfish": starfish,
            "star-sand": star_sand, "festival-bell": festival_bell}
# Exact stand-in sizes (w, h, d) the shapes are scaled to (the others are built to size).
EXACT = {"glow-coral": (3.0, 3.0, 3.0), "lantern-jelly": (1.6, 2.4, 1.6), "sea-turtle-sleep": (3.0, 1.2, 4.0), "sea-turtle": (3.4, 1.4, 4.0),
         "star-sand": (1.0, 0.6, 1.0), "festival-bell": (0.6, 0.7, 0.6), "harbour-house": (6.0, 6.0, 6.0),
         "trench-wall": (TW_W, TW_H, TW_D), "festival-raft": (8.0, 3.0, 6.0), "lantern-post": (0.6, 3.5, 0.6)}
# Scaled evenly so the wider of their footprint's sides is this (their five-fold shape stays even).
UNIFORM = {"starfish": 0.8}
# Centred on their bounding box (the round things); the rest keep the x/z origin they were built about.
CENTRED = {"glow-coral", "lantern-jelly", "sea-turtle-sleep", "sea-turtle", "starfish", "star-sand", "festival-bell", "harbour-house",
           "trench-wall"}
DARK = {"trench-wall", "glow-coral", "lantern-jelly", "star-sand"}
VIEWS = {"cape-rock": (0.62, -0.62, 0.42), "lighthouse": (0.45, -0.85, 0.2), "trench-wall": (0.3, -0.9, 0.25),
         "festival-raft": (0.55, -0.72, 0.38), "sea-turtle-sleep": (0.55, -0.7, 0.45), "sea-turtle": (0.55, -0.7, 0.45),
         "starfish": (0.4, -0.55, 0.75), "star-sand": (0.45, -0.75, 0.55), "lantern-jelly": (0.55, -0.72, 0.15)}
TALL = {"lighthouse", "lantern-post", "lantern-jelly", "festival-bell"}

if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if a in BUILDERS] or list(BUILDERS)
    for name in names:
        k.reset()
        built, budget = BUILDERS[name]()
        model = k.join(built, name)
        model.name = name
        model.data.name = name
        model.data.validate()
        if name in UNIFORM:
            _, lo, hi = k.model_metrics(model)
            f = UNIFORM[name] / max(hi[0] - lo[0], hi[2] - lo[2])
            model.scale = (f, f, f)
            k.active(model)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        elif name in EXACT:
            v.scale_to(model, EXACT[name])
        if name in CENTRED:
            k.normalize(model, None)
        else:
            v.floor_to_zero(model)
        # No uv layer: nothing here is textured, and the parts made from raw vertices have none, so the joined layer held
        # whatever was in memory there (it changed the file, and split vertices, from build to build). Triangulated by a
        # fixed rule. (The exporter may still order a few triangles differently from build to build; the shape is the
        # same.)
        while model.data.uv_layers:
            model.data.uv_layers.remove(model.data.uv_layers[0])
        k.apply_modifier(model, "TRIANGULATE", quad_method="FIXED", ngon_method="CLIP")
        s.export_glb(model, name, budget)
        preview(model, name, VIEWS.get(name, (0.55, -0.72, 0.42)), size=(400, 512) if name in TALL else (512, 400), dark=name in DARK)
