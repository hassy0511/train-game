"""The magnet light's things (じしゃくライトの しかけ, shared by 0-0, 0-4, 5-3, 6-1, 6-2 and every stage once it is
learned) — Claude Code. Ticket 0020 (the common section, PHASE9_CHAPTER5_6 第 2 部 M12).

The crafted look (つくりこみ) of chapters 1-4 (sky.py, volcano.py and mirror.py, whose helpers this script uses): flat
colours (the game bakes each model into one draw call; the odds and ends by the line are drawn instanced from the baked
model, src/view/three/iron-props.ts), round friendly toy shapes. Iron is a soft blue-grey, never dark or rusty. No faces:
the U magnet is any toy's horseshoe with its mouth up; rivets run in rows (never two side by side like eyes); no
letters or logos on the can, the bucket or the sign's plank; no beam, bolt or lightning shape anywhere.

Models (same names, sizes, origins and orientation as the code stand-ins they replace; origin at the bottom centre,
+Z forward, the model's own left is +X):
- magnet-mark 0.58 x 0.7 x 0.2: the red U magnet on the lead car's roof, its mouth up, white tips.
- rail-piece 2.4 x 0.32 x 8: 8 m of track (two rails, ten sleepers) along Z. The game builds the piece it pulls into a
  gap like the track round it; this one is for the model page.
- iron-door 6.95 x 6 x 1.1: two blue-grey iron leaves (a lighter top rim, rows of round rivets, two bands across) and
  a round cream cushion over the middle on -Z, the side the train comes from (z -0.77 to 0.33).
- crossing-bar-iron 6.75 x 3.15 x 0.3: this game's level crossing (1-1's colours): the silver post with its lamp box at
  x -3.2, its yellow and black bar across the line (to x 3.3) at 1.1 m.
- iron-star-small 0.57 x 0.54 x 0.1: a puffy five-pointed star, its facets iron and silver by turns, +Z the front.
- iron-bell-small 0.44 x 0.56 x 0.44: a light iron bell (its mouth hollow) with a dark ring on top, a gold ball inside.
- turn-mirror-small 3.3 x 4.75 x 0.3: a standing mirror on an iron foot, its glass whitish (+Z), its back iron.
- iron-can 0.12 x 0.2 x 0.12: a five-sided tin can with a sky-blue band (no letters).
- iron-bucket 0.34 x 0.46 x 0.34: a sky-blue tin bucket, hollow, a pale rim, a dark wire handle standing up.
- sign-bell 0.7 x 1.6 x 0.52: a wooden post, a plank with nothing written on it and an arm reaching +Z (to the
  rail); the gold bell is its own node "bell" with its origin at the top of its string, (0, 1.53, 0.38): the game
  draws the bell apart, stretching it out towards the train.
Output: public/models/<name>.glb and assets/previews/<name>.png.
Run: python3 scripts/run-bpy.py assets/blender/magnet-set.py [-- name ...]
"""
from __future__ import annotations

from pathlib import Path
import json
import math
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as k  # noqa: E402
import sky as s  # noqa: E402  (chapter 1's crafted helpers: fix_normals, plate, slab...)
import volcano as v  # noqa: E402  (chapter 2's: Paint, painted, lathe_y, lathe_z, beam, rounded, preview...)
import mirror as mw  # noqa: E402  (5-3's: prism, gem, bipyramid, quad, ring)
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

TAU = 2 * math.pi

# ---------------------------------------------------------------- palette (ticket 0020, 第 2 部 M12)

RED, RED_DEEP, WHITE = "#E0473C", "#C93A31", "#FFFFFF"
IRON, IRON_LIGHT, IRON_DARK, IRON_PALE = "#7A8CA3", "#A9B8CC", "#56657A", "#93A3B8"
CUSHION, CUSHION_SHADE = "#FFF3D6", "#F2E2BE"
RAIL, RAIL_DARK, SLEEPER, SLEEPER_DARK = "#8A96A3", "#6F7A86", "#8B6A4A", "#765839"
TIN, TIN_DARK, TIN_BAND = "#C9D3DC", "#AEB9C4", "#4FA3D9"
BUCKET, BUCKET_RIM, BUCKET_IN, HANDLE = "#8FD0E8", "#C8ECF7", "#79BBD4", "#2E3440"
GOLD, GOLD_DEEP = "#E5B93C", "#C99D2A"
POLE, POLE_DARK, PLANK, PLANK_EDGE = "#9C7A55", "#80623F", "#F2E3C6", "#DCC9A6"
SILVER, YELLOW, DARK, LAMP = "#DDE6EE", "#F2C230", "#2E3440", "#F07A55"
MIRROR_FRONT, MIRROR_SHINE = "#E9EEF6", "#FFFFFF"

# A little of their own colour as light, so iron stays a soft blue-grey (the door's face looks at the coming train,
# often away from the sun) and the pale parts stay pale in shade.
GLOW = {RED: 0.12, RED_DEEP: 0.08, WHITE: 0.35, IRON: 0.3, IRON_LIGHT: 0.3, IRON_DARK: 0.15, IRON_PALE: 0.3,
        CUSHION: 0.32, CUSHION_SHADE: 0.25, RAIL: 0.1, RAIL_DARK: 0.06, SLEEPER: 0.06, SLEEPER_DARK: 0.04,
        TIN: 0.2, TIN_DARK: 0.15, TIN_BAND: 0.15, BUCKET: 0.18, BUCKET_RIM: 0.25, BUCKET_IN: 0.12, HANDLE: 0.0,
        GOLD: 0.2, GOLD_DEEP: 0.12, POLE: 0.08, POLE_DARK: 0.05, PLANK: 0.25, PLANK_EDGE: 0.18,
        SILVER: 0.25, YELLOW: 0.15, DARK: 0.0, LAMP: 0.3, MIRROR_FRONT: 0.4, MIRROR_SHINE: 0.5}


def paints(roughness=0.5):
    return v.Paint(roughness, glow=dict(GLOW))


# ---------------------------------------------------------------- the train's magnet

def magnet_mark():
    """屋根の じしゃく: a red U (mouth up) cut from a 0.2 m slab with a round bend, white tips on its two legs."""
    paint = paints(0.4)
    parts: list = []
    cy, ro, ri, top, tip = 0.29, 0.29, 0.12, 0.7, 0.56
    outline = [(-ro, tip), (-ro, cy)]
    outline += [(math.cos(math.pi + math.pi * i / 6) * ro, cy + math.sin(math.pi + math.pi * i / 6) * ro) for i in range(1, 6)]
    outline += [(ro, cy), (ro, tip), (ri, tip), (ri, cy)]
    outline += [(math.cos(-math.pi * i / 6) * ri, cy + math.sin(-math.pi * i / 6) * ri) for i in range(1, 6)]
    outline += [(-ri, cy), (-ri, tip)]
    s.plate(parts, "u", (0.0, 0.0, 0.0), (1, 0, 0), (0, 1, 0), outline, 0.2, [paint(RED)])
    for side in (-1, 1):
        x = side * (ro + ri) / 2
        k.add_box(parts, f"tip-{side}", (ro - ri, top - tip, 0.2), (x, (tip + top) / 2, 0.0), paint(WHITE))
    # A darker band where red meets white (a little step, so the tips read as caps).
    for side in (-1, 1):
        x = side * (ro + ri) / 2
        k.add_box(parts, f"band-{side}", (ro - ri + 0.012, 0.03, 0.212), (x, tip - 0.012, 0.0), paint(RED_DEEP))
    return parts, 160


# ---------------------------------------------------------------- track

def rail_piece():
    """はなれた レールの かけら: 8 m of track along Z, as the game's track: ten sleepers 0.8 m apart and two rails (a
    head, a web and a foot) at x +-0.75 on them."""
    paint = paints(0.6)
    parts: list = []
    for i in range(10):
        z = -4.0 + 0.4 + 0.8 * i
        k.add_box(parts, f"sleeper-{i}", (2.4, 0.15, 0.25), (0.0, 0.075, z), paint(SLEEPER if i % 2 else SLEEPER_DARK))
    profile = [(-0.09, 0.0), (0.09, 0.0), (0.09, 0.03), (0.025, 0.05), (0.025, 0.12), (0.05, 0.135), (0.05, 0.17), (-0.05, 0.17),
               (-0.05, 0.135), (-0.025, 0.12), (-0.025, 0.05), (-0.09, 0.03)]
    for side in (-1, 1):
        x0 = side * 0.75
        sections = [(z, [(x0 + x, 0.15 + y) for x, y in profile]) for z in (-4.0, 4.0)]
        obj = k.add_loft_z(parts, f"rail-{side}", sections, [paint(RAIL), paint(RAIL_DARK)],
                           face_material=lambda c, n: 0 if n.y > 0.5 or abs(n.z) > 0.5 else 1)
        s.fix_normals(obj)
    return parts, 400


# ---------------------------------------------------------------- the iron door

def rivet(parts, m, name, center, radius, height, sides=5):
    """A low round rivet on a face looking -Z: a ring on the face and a point `height` out of it (open behind)."""
    x, y, z = center
    verts = [(x + math.cos(TAU * i / sides) * radius, y + math.sin(TAU * i / sides) * radius, z) for i in range(sides)]
    verts.append((x, y, z - height))
    obj = k.add_mesh(parts, name, verts, [(i, (i + 1) % sides, sides) for i in range(sides)], [m])
    return mw.face_to(obj, -1)


def iron_door():
    """てつの とびら: two iron leaves 3.45 x 5.7 x 0.6 with a lighter rim on top, two darker bands across and rows of
    round rivets along their outer edges and top on the side the train comes from (-Z); a round cream cushion over the
    middle of that side."""
    paint = paints(0.45)
    parts: list = []
    for side in (-1, 1):
        cx = side * 1.75
        k.add_box(parts, f"leaf-{side}", (3.45, 5.7, 0.6), (cx, 2.85, 0.0), paint(IRON), bevel=0.06, segments=1)
        k.add_box(parts, f"rim-{side}", (3.45, 0.3, 0.66), (cx, 5.85, 0.0), paint(IRON_LIGHT), bevel=0.04, segments=1)
        for y in (1.1, 4.4):
            k.add_box(parts, f"band-{side}-{y}", (3.3, 0.28, 0.08), (cx, y, -0.32), paint(IRON_PALE))
        # Rivets: a column along the outer edge and a row under the rim (never a pair side by side).
        spots = [(side * 3.1, y) for y in (0.5, 1.6, 2.7, 3.8, 4.9)] + [(cx + d, 5.35) for d in (-1.1, -0.35, 0.4, 1.15) if abs(cx + d) < 3.0]
        for i, (x, y) in enumerate(spots):
            rivet(parts, paint(IRON_DARK), f"rivet-{side}-{i}", (x, y, -0.3), 0.1, 0.06)
    cushion = v.lathe_z(parts, "cushion", [(-0.3, 0.0, CUSHION_SHADE), (-0.33, 1.3, CUSHION_SHADE), (-0.5, 1.4, CUSHION),
                                           (-0.72, 1.05, CUSHION), (-0.79, 0.0, CUSHION)], 0.0, 2.6, 12, paint, smooth=True)
    return parts, 600


# ---------------------------------------------------------------- the level crossing

def crossing_bar_iron():
    """さかさ ふみきり: the post (silver, yellow and black bands at its foot) on a dark base at x -3.2, the lamp box with
    one round lamp each way, the yellow hub and the striped bar across the line to x 3.3 with a blunt yellow tip."""
    paint = paints(0.45)
    parts: list = []
    px = -3.2
    k.add_box(parts, "base", (0.5, 0.2, 0.3), (px, 0.1, 0.0), paint(DARK))
    mw.prism(parts, paint, "post", (px, 0.0), 0.15, 2.7, 0.1, 0.085, 6, [SILVER], bottom=False, top=False)
    for i in range(3):
        mw.prism(parts, paint, f"post-band-{i}", (px, 0.0), 0.2 + 0.3 * i, 0.5 + 0.3 * i, 0.115, 0.112, 6, [YELLOW if i % 2 == 0 else DARK])
    k.add_box(parts, "lamp-box", (0.5, 0.48, 0.28), (px, 2.88, 0.0), paint(DARK), bevel=0.05, segments=1)
    for z in (-1, 1):
        v.lathe_z(parts, f"lamp-{z}", [(0.14 * z, 0.0, LAMP), (0.14 * z, 0.15, LAMP), (0.17 * z, 0.13, LAMP), (0.17 * z, 0.0, LAMP)],
                  px, 2.86, 8, paint, smooth=False)
    v.lathe_z(parts, "hub", [(-0.15, 0.0, YELLOW), (-0.15, 0.13, YELLOW), (0.15, 0.13, YELLOW), (0.15, 0.0, YELLOW)], px, 1.1, 8, paint,
              smooth=False)
    n = 7
    x0, x1 = px + 0.12, 3.18
    for i in range(n):
        a = x0 + (x1 - x0) * i / n
        b = x0 + (x1 - x0) * (i + 1) / n
        k.add_box(parts, f"bar-{i}", (b - a, 0.16, 0.12), ((a + b) / 2, 1.1, 0.0), paint(YELLOW if i % 2 == 0 else DARK))
    mw.gem(parts, paint, "tip", (3.16, 1.1, 0.0), (1.0, 0.0, 0.0), 0.14, 0.09, 6, [YELLOW, YELLOW, YELLOW, YELLOW], body=0.45, taper=0.9)
    return parts, 360


# ---------------------------------------------------------------- picks

def star_outline(r, inner=0.45):
    return [(math.cos(math.pi / 2 + i * math.pi / 5) * (r if i % 2 == 0 else r * inner),
             math.sin(math.pi / 2 + i * math.pi / 5) * (r if i % 2 == 0 else r * inner)) for i in range(10)]


def iron_star_small():
    """れんしゅうの てつの ほし: a puffy five-pointed star (0.6 m), its front and back each rising to a point in the
    middle, the facets iron and silver by turns, a thin edge all round. It glows a little more than the other iron (a
    shiny little thing the light finds; seen against the sky it would read as a dark cut-out)."""
    paint = v.Paint(0.35, glow={**GLOW, SILVER: 0.5, IRON_LIGHT: 0.42, IRON: 0.34})
    parts: list = []
    cy = 0.3
    pts = star_outline(0.3)
    verts = [(x, cy + y, 0.022) for x, y in pts] + [(x, cy + y, -0.022) for x, y in pts] + [(0.0, cy, 0.05), (0.0, cy, -0.05)]
    n = 10
    faces, colours = [], []
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, 2 * n))
        colours.append(SILVER if i % 2 == 0 else IRON_LIGHT)
    for i in range(n):
        j = (i + 1) % n
        faces.append((n + j, n + i, 2 * n + 1))
        colours.append(IRON_LIGHT if i % 2 == 0 else IRON)
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, n + i, n + j, j))
        colours.append(IRON)
    v.painted(parts, "star", verts, faces, paint, colours)
    return parts, 120


def iron_bell_small():
    """てつの すず: a light iron bell with a flared lip, hollow underneath, a gold ball inside and a dark ring on top."""
    paint = paints(0.4)
    parts: list = []
    profile = [(0.46, 0.0, IRON_LIGHT), (0.43, 0.11, IRON_LIGHT), (0.12, 0.2, IRON_LIGHT), (0.0, 0.22, IRON), (0.02, 0.17, IRON_DARK),
               (0.3, 0.0, IRON_DARK)]
    v.lathe(parts, "bell", profile, lambda y, a, r: (math.cos(a) * r, y, math.sin(a) * r), 8, paint, smooth=lambda c, n: abs(n.y) < 0.9)
    mw.bipyramid(parts, paint, "ball", (0.0, 0.1, 0.0), 0.07, 0.065, 0.065, 4, [GOLD_DEEP, GOLD], [GOLD], turn=math.pi / 4)
    loop = [(0.0, 0.45, -0.05), (0.0, 0.53, -0.04), (0.0, 0.56, 0.0), (0.0, 0.53, 0.04), (0.0, 0.45, 0.05)]
    obj = k.add_swept_tube(parts, "ring", loop, [0.02] * len(loop), [paint(IRON_DARK)] * (len(loop) - 1), sides=3, smooth=False)
    s.fix_normals(obj)
    return parts, 120


def turn_mirror_small():
    """そっぽの かがみ: a standing mirror 3.3 x 4.3 in a rounded iron frame, its glass whitish (+Z) with a shine streak,
    its back an iron plate, on an iron foot and post."""
    paint = paints(0.45)
    parts: list = []
    W, H, y0 = 3.3, 4.3, 0.45
    mid = y0 + H / 2
    outer = v.rounded(0.0, 0.0, W, H, 0.35, per=2)
    inner = v.rounded(0.0, 0.0, W - 0.36, H - 0.36, 0.18, per=2)
    mw.ring(parts, paint, "frame", outer, inner, mid, -0.12, 0.1, (IRON_LIGHT, IRON, IRON, IRON_DARK))
    k.add_box(parts, "back", (W - 0.3, H - 0.3, 0.06), (0.0, mid, -0.07), paint(IRON))
    hw, hh = (W - 0.36) / 2, (H - 0.36) / 2
    mw.quad(parts, "glass", [(-hw, mid - hh, -0.03), (hw, mid - hh, -0.03), (hw, mid + hh, -0.03), (-hw, mid + hh, -0.03)], paint(MIRROR_FRONT))
    mw.quad(parts, "shine", [(-0.9, mid - 0.6, -0.025), (-0.65, mid - 0.6, -0.025), (0.0, mid + 1.2, -0.025), (-0.25, mid + 1.2, -0.025)],
            paint(MIRROR_SHINE))
    k.add_box(parts, "foot", (1.4, 0.16, 0.3), (0.0, 0.08, 0.0), paint(IRON_DARK), bevel=0.04, segments=1)
    k.add_box(parts, "post", (0.24, 0.4, 0.2), (0.0, 0.33, -0.02), paint(IRON_DARK))
    return parts, 200


# ---------------------------------------------------------------- odds and ends by the line

def iron_can():
    """あきかん: a five-sided tin can, a sky-blue band round its middle (no letters)."""
    paint = paints(0.35)
    parts: list = []
    r = 0.06
    rings = [0.0, 0.045, 0.15, 0.2]
    cols = [TIN_DARK, TIN_BAND, TIN]
    verts = []
    for y in rings:
        verts += [(math.cos(TAU * i / 5 + 0.3) * r, y, math.sin(TAU * i / 5 + 0.3) * r) for i in range(5)]
    faces, colours = [], []
    for j in range(3):
        for i in range(5):
            faces.append((j * 5 + i, j * 5 + (i + 1) % 5, (j + 1) * 5 + (i + 1) % 5, (j + 1) * 5 + i))
            colours.append(cols[j])
    faces += [tuple(range(4, -1, -1)), tuple(range(15, 20))]
    colours += [TIN_DARK, TIN]
    v.painted(parts, "can", verts, faces, paint, colours)
    return parts, 40


def iron_bucket():
    """ブリキの バケツ: a sky-blue tin bucket, wider at the top, hollow (its inside a deeper blue), a pale rolled rim and
    a dark wire handle standing up over it."""
    paint = paints(0.4)
    parts: list = []
    profile = [(0.0, 0.0, BUCKET), (0.0, 0.12, BUCKET), (0.3, 0.16, BUCKET_RIM), (0.315, 0.17, BUCKET_RIM), (0.3, 0.15, BUCKET_IN),
               (0.02, 0.11, BUCKET_IN), (0.02, 0.0, BUCKET_IN)]
    v.lathe(parts, "bucket", profile, lambda y, a, r: (math.cos(a) * r, y, math.sin(a) * r), 8, paint, smooth=lambda c, n: abs(n.y) < 0.8,
            phase=TAU / 16)
    arc = [(math.cos(math.pi * i / 6) * 0.165, 0.29 + math.sin(math.pi * i / 6) * 0.165, 0.0) for i in range(7)]
    obj = k.add_swept_tube(parts, "handle", arc, [0.008] * len(arc), [paint(HANDLE)] * (len(arc) - 1), sides=3, smooth=False)
    s.fix_normals(obj)
    return parts, 140


BELL_AT = (0.0, 1.53, 0.38)


def sign_bell():
    """かんばんの ベル: a wooden post 1.6 m, a plank with nothing on it (a darker edge), an arm reaching +Z; the gold bell
    hangs from the arm's end on a short string (the node "bell", its origin where the string ties on)."""
    paint = paints(0.6)
    post: list = []
    mw.prism(post, paint, "pole", (0.0, 0.0), 0.0, 1.6, 0.05, 0.04, 5, [POLE, POLE_DARK], phase=math.pi / 2, bottom=False)
    s.plate(post, "plank-edge", (0.0, 1.22, 0.07), (1, 0, 0), (0, 1, 0), v.rounded(0.0, 0.0, 0.7, 0.4, 0.06, per=1), 0.04, [paint(PLANK_EDGE)])
    mw.quad(post, "plank", [(-0.31, 1.06, 0.0905), (0.31, 1.06, 0.0905), (0.31, 1.38, 0.0905), (-0.31, 1.38, 0.0905)], paint(PLANK))
    k.add_box(post, "arm", (0.04, 0.04, 0.44), (0.0, 1.55, 0.2), paint(POLE_DARK))
    bell: list = []
    bx, by, bz = BELL_AT
    mw.prism(bell, paint, "string", (bx, bz), by - 0.06, by, 0.008, 0.008, 3, [POLE_DARK], bottom=False, top=False)
    profile = [(-0.05, 0.0, GOLD), (-0.065, 0.045, GOLD), (-0.19, 0.1, GOLD_DEEP), (-0.17, 0.05, GOLD_DEEP), (-0.1, 0.0, GOLD_DEEP)]
    v.lathe(bell, "bell", profile, lambda y, a, r: (bx + math.cos(a) * r, by + y, bz + math.sin(a) * r), 6, paint,
            smooth=lambda c, n: abs(n.y) < 0.9)
    return post, bell, 100


# ---------------------------------------------------------------- export and preview

def node(parts, name, pivot):
    """The parts joined into the object `name` (a node of the GLB) with its origin at `pivot` (glTF)."""
    obj = k.join(parts, name)
    obj.data.validate()
    k.active(obj)
    bpy.context.scene.cursor.location = k.to_blender(pivot)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = (0, 0, 0)
    return obj


def finish(obj):
    while obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers[0])
    k.apply_modifier(obj, "TRIANGULATE", quad_method="FIXED", ngon_method="CLIP")


def export_nodes(objects, name, budget, max_kb=250):
    """Several named nodes in one GLB (the sign and its bell), measured where they stand."""
    tris = sum(k.triangles(o) for o in objects)
    if tris > budget:
        raise RuntimeError(f"{name}: {tris} triangles exceeds budget {budget}")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    glb = k.MODEL_DIR / f"{name}.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", export_yup=True, use_selection=True, export_texcoords=False)
    if glb.stat().st_size > max_kb * 1024:
        raise RuntimeError(f"{name}: GLB exceeds {max_kb} KB")
    pts = [k.gltf(o.matrix_world @ vert.co) for o in objects for vert in o.data.vertices]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    print("MODEL_METRICS=" + json.dumps({
        "model": name, "triangles": tris, "budget": budget, "dimensions": [round(hi[i] - lo[i], 3) for i in range(3)],
        "min": [round(x, 3) for x in lo], "max": [round(x, 3) for x in hi], "nodes": [o.name for o in objects],
        "file_bytes": glb.stat().st_size,
    }, sort_keys=True))


BUILDERS = {"magnet-mark": magnet_mark, "rail-piece": rail_piece, "iron-door": iron_door, "crossing-bar-iron": crossing_bar_iron,
            "iron-star-small": iron_star_small, "iron-bell-small": iron_bell_small, "turn-mirror-small": turn_mirror_small,
            "iron-can": iron_can, "iron-bucket": iron_bucket}
# Centred on their bounding box; the rest keep the x/z origin they were built about.
CENTRED = {"magnet-mark", "rail-piece", "iron-star-small", "iron-bell-small", "turn-mirror-small", "iron-can", "iron-bucket"}
VIEWS = {"iron-door": (0.5, 0.8, 0.3), "crossing-bar-iron": (0.4, 0.85, 0.3), "rail-piece": (0.7, -0.6, 0.5),
         "iron-bucket": (0.5, -0.7, 0.6), "iron-bell-small": (0.5, -0.75, 0.15), "sign-bell": (0.8, -0.55, 0.25)}
TALL = {"magnet-mark", "iron-bell-small", "turn-mirror-small", "iron-can", "iron-bucket", "sign-bell"}

if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if a in BUILDERS or a == "sign-bell"] or [*BUILDERS, "sign-bell"]
    for name in names:
        k.reset()
        size = (400, 512) if name in TALL else (512, 400)
        if name == "sign-bell":
            post_parts, bell_parts, budget = sign_bell()
            post = node(post_parts, name, (0.0, 0.0, 0.0))
            bell = node(bell_parts, "bell", BELL_AT)
            finish(post)
            finish(bell)
            export_nodes([post, bell], name, budget)
            k.active(bell)
            bpy.ops.object.duplicate()
            whole = k.join([post, bpy.context.object], f"{name}-preview")
            v.preview(whole, name, VIEWS[name], size)
            continue
        built, budget = BUILDERS[name]()
        model = k.join(built, name)
        model.name = name
        model.data.name = name
        model.data.validate()
        if name in CENTRED:
            k.normalize(model, None)
        else:
            v.floor_to_zero(model)
        finish(model)
        s.export_glb(model, name, budget)
        v.preview(model, name, VIEWS.get(name, (0.55, -0.72, 0.42)), size)
