"""ピコ (partner) — Claude Code version, built for a side-by-side comparison with Codex's `partner`.

Differences from the Codex pipeline:
- Proportions follow `assets/concepts/character-turnaround-c-piko.png` and are scaled *uniformly* to
  0.70 m tall. (Codex's generate_character stretches each axis to the 0.6 x 0.7 x 0.5 ticket box, which
  widens the head and flattens the feet away from the turnaround.)
- The blue body is modelled as overlapping clay volumes, fused into one surface with a voxel remesh and
  then decimated, so the neck, shoulders, hips, fingers and toes join without visible seams.
- Eyes, brows, mouth and the belly panel are thin decals shrink-wrapped onto that surface, so nothing
  floats off the face in profile.

Output: public/models/partner-cc.glb and assets/previews/partner-cc.png (front / 3-4 / side).
Run: python3 scripts/run-bpy.py assets/blender/partner-cc.py   (or blender -b --python ...)
"""
from __future__ import annotations

from pathlib import Path
import json
import math
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import character_common as cc  # noqa: E402
from town_common import ASSET_SPECS, MODEL_DIR  # noqa: E402

MODEL_NAME = "partner-cc"
HEIGHT = 0.70
BUDGET = 5600
VOXEL = 0.0032
BODY_TRIANGLES = 3400

BLUE = "#3DB0DA"
BLUE_SHADE = "#2A8DB8"
CREAM = "#F1E7D0"
EYE_WHITE = "#F7F1E3"
PUPIL = "#1E1612"
LINE = "#173F5A"
LAMP = "#F59E1B"
LAMP_FACE = "#FFCB3D"
LAMP_GLOW = "#FFF3C4"


# ---------------------------------------------------------------- helpers

def active(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_modifier(obj: bpy.types.Object, kind: str, **settings) -> None:
    active(obj)
    modifier = obj.modifiers.new(name=kind, type=kind)
    for key, value in settings.items():
        setattr(modifier, key, value)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def join(objects: list[bpy.types.Object], name: str) -> bpy.types.Object:
    for obj in objects:
        active(obj)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    result = bpy.context.object
    result.name = name
    result.data.name = name
    return result


def set_smooth(obj: bpy.types.Object, smooth: bool = True) -> None:
    for polygon in obj.data.polygons:
        polygon.use_smooth = smooth


def disc_decal(parts, name, center, size, mat, rings=3, segments=18, tilt=0.0):
    """Flat elliptical disc facing +Z (glTF), later wrapped onto the surface."""
    cx, cy, cz = center
    w, h = size
    verts = [(cx, cy, cz)]
    for ring in range(1, rings + 1):
        r = ring / rings
        for s in range(segments):
            a = 2 * math.pi * s / segments
            x, y = math.cos(a) * w / 2 * r, math.sin(a) * h / 2 * r
            xr = x * math.cos(tilt) - y * math.sin(tilt)
            yr = x * math.sin(tilt) + y * math.cos(tilt)
            verts.append((cx + xr, cy + yr, cz))
    faces = []
    for s in range(segments):
        faces.append((0, 1 + s, 1 + (s + 1) % segments))
    for ring in range(1, rings):
        a0 = 1 + (ring - 1) * segments
        a1 = 1 + ring * segments
        for s in range(segments):
            n = (s + 1) % segments
            faces.append((a0 + s, a1 + s, a1 + n, a0 + n))
    return cc.add_mesh(parts, name, verts, faces, [mat], smooth=True)


def ribbon_decal(parts, name, points, width, mat):
    """Flat strip along a 2D polyline (x, y) at depth z, facing +Z."""
    verts = []
    for i, (x, y, z) in enumerate(points):
        a = points[max(i - 1, 0)]
        b = points[min(i + 1, len(points) - 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        length = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / length, tx / length
        taper = 0.55 + 0.45 * math.sin(math.pi * i / (len(points) - 1))
        half = width / 2 * taper
        verts.append((x + nx * half, y + ny * half, z))
        verts.append((x - nx * half, y - ny * half, z))
    faces = []
    for i in range(len(points) - 1):
        faces.append((2 * i + 1, 2 * i + 3, 2 * i + 2, 2 * i))
    return cc.add_mesh(parts, name, verts, faces, [mat], smooth=True)


def arc_points(center, half_width, bend, z, samples=11, tilt=0.0):
    cx, cy = center
    pts = []
    for i in range(samples):
        t = -1 + 2 * i / (samples - 1)
        x = t * half_width
        y = bend * (1 - t * t) + tilt * t
        pts.append((cx + x, cy + y, z))
    return pts


def wrap_onto(decal: bpy.types.Object, target: bpy.types.Object, offset: float) -> None:
    """Project the decal straight back (glTF -Z) onto the surface, like a sticker pressed from the front."""
    apply_modifier(decal, "SHRINKWRAP", target=target, wrap_method="PROJECT",
                   use_project_y=True, use_negative_direction=True, use_positive_direction=True,
                   wrap_mode="ON_SURFACE", offset=offset)


# ---------------------------------------------------------------- clay body

def build_clay(blue) -> bpy.types.Object:
    parts: list[bpy.types.Object] = []
    # Head: round skull, slightly fuller at the back, soft muzzle under the eyes.
    cc.add_ellipsoid(parts, "skull", (0.245, 0.205, 0.205), (0, 0.472, 0.0), blue, 32, 16)
    cc.add_ellipsoid(parts, "occiput", (0.215, 0.180, 0.170), (0, 0.482, -0.030), blue, 24, 12)
    cc.add_ellipsoid(parts, "muzzle", (0.150, 0.085, 0.110), (0, 0.428, 0.050), blue, 24, 12)
    cc.add_tapered_segment(parts, "neck", (0, 0.345, 0), (0, 0.405, 0), 0.026, 0.024, blue, 16)

    # Slender pear torso: (y, half width, half depth, x, z).
    cc.add_profiled_volume(parts, "torso", [
        (0.168, 0.020, 0.018, 0, 0.000),
        (0.182, 0.040, 0.032, 0, 0.002),
        (0.205, 0.048, 0.037, 0, 0.004),
        (0.240, 0.045, 0.037, 0, 0.005),
        (0.280, 0.041, 0.035, 0, 0.004),
        (0.320, 0.044, 0.033, 0, 0.002),
        (0.345, 0.045, 0.030, 0, 0.000),
        (0.360, 0.030, 0.024, 0, 0.000),
    ], blue, 24)

    for side in (-1, 1):
        # Arms in the turnaround's relaxed A pose.
        cc.add_swept_tube(parts, f"arm-{side}",
                          [(side * 0.030, 0.345, 0.0), (side * 0.052, 0.337, 0.0),
                           (side * 0.098, 0.278, 0.006), (side * 0.136, 0.216, 0.010)],
                          [0.019, 0.019, 0.0155, 0.0135], [blue] * 3, 14)
        cc.add_ellipsoid(parts, f"shoulder-{side}", (0.042, 0.040, 0.038),
                         (side * 0.050, 0.336, 0.0), blue, 16, 8)
        cc.add_ellipsoid(parts, f"elbow-{side}", (0.031, 0.031, 0.030),
                         (side * 0.098, 0.278, 0.006), blue, 12, 6)
        # Mitten hand: palm broad across X, three grooved fingers and an inner thumb.
        palm = (side * 0.150, 0.190, 0.012)
        cc.add_ellipsoid(parts, f"palm-{side}", (0.050, 0.054, 0.030), palm, blue, 16, 8)
        for index, dx in enumerate((0.019, 0.0, -0.019)):
            fx = palm[0] + side * dx
            cc.add_swept_tube(parts, f"finger-{side}-{index}",
                              [(fx, 0.185, 0.013), (fx + side * dx * 0.15, 0.160, 0.014),
                               (fx + side * dx * 0.25, 0.146, 0.015)],
                              [0.0105, 0.0100, 0.0090], [blue] * 2, 10)
            cc.add_ellipsoid(parts, f"fingertip-{side}-{index}", (0.019, 0.017, 0.018),
                             (fx + side * dx * 0.25, 0.146, 0.015), blue, 10, 5)
        thumb_root = (palm[0] - side * 0.022, 0.196, 0.016)
        cc.add_swept_tube(parts, f"thumb-{side}",
                          [thumb_root, (thumb_root[0] - side * 0.010, 0.172, 0.022)],
                          [0.010, 0.0085], [blue], 10)
        cc.add_ellipsoid(parts, f"thumbtip-{side}", (0.017, 0.017, 0.017),
                         (thumb_root[0] - side * 0.010, 0.172, 0.022), blue, 10, 5)

        # Legs: fuller thigh, straight shin, slightly splayed.
        cc.add_swept_tube(parts, f"leg-{side}",
                          [(side * 0.028, 0.200, 0.0), (side * 0.046, 0.110, 0.003),
                           (side * 0.060, 0.040, 0.004)],
                          [0.029, 0.021, 0.019], [blue] * 2, 16)
        cc.add_ellipsoid(parts, f"knee-{side}", (0.041, 0.040, 0.040),
                         (side * 0.046, 0.110, 0.003), blue, 12, 6)
        # Big paddle foot with three toe bumps (grooves appear between them).
        foot_x = side * 0.068
        cc.add_ellipsoid(parts, f"foot-{side}", (0.092, 0.088, 0.140), (foot_x, 0.018, 0.028), blue, 24, 12)
        for index, dx in enumerate((-0.027, 0.0, 0.027)):
            cc.add_ellipsoid(parts, f"toe-{side}-{index}", (0.034, 0.046, 0.052),
                             (foot_x + dx, 0.020, 0.080), blue, 14, 7)

    # Lamp stalk: rises from the back of the crown and hooks forward.
    cc.add_swept_tube(parts, "stalk",
                      [(0, 0.540, -0.040), (0, 0.585, -0.042), (0, 0.628, -0.030),
                       (0, 0.655, -0.004), (0, 0.664, 0.030), (0, 0.662, 0.066)],
                      [0.028, 0.021, 0.017, 0.0155, 0.015, 0.015], [blue] * 5, 14)

    clay = join(parts, "piko-clay")
    apply_modifier(clay, "REMESH", mode="VOXEL", voxel_size=VOXEL, adaptivity=0.0)

    # Flat soles: drop everything below the ground plane.
    active(clay)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bisect(plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
    bpy.ops.object.mode_set(mode="OBJECT")

    apply_modifier(clay, "SMOOTH", factor=0.5, iterations=3)
    tris = sum(len(p.vertices) - 2 for p in clay.data.polygons)
    apply_modifier(clay, "DECIMATE", decimate_type="COLLAPSE", ratio=min(1.0, BODY_TRIANGLES / tris),
                   use_collapse_triangulate=True)
    clay.data.materials.clear()
    clay.data.materials.append(blue)
    set_smooth(clay)
    return clay


# ---------------------------------------------------------------- details

def build_details(clay, mats) -> list[bpy.types.Object]:
    decals: list[bpy.types.Object] = []
    front = 0.14  # start in front of the face; the wrap pulls each decal onto the surface

    # Belly panel: shield that tapers to a soft point at the crotch.
    shield = []
    for i in range(15):
        t = i / 14
        y = 0.346 - t * 0.166
        if t < 0.12:  # rounded top edge under the neck
            half = 0.026 + 0.010 * math.sin(t / 0.12 * math.pi / 2)
        elif t < 0.62:
            half = 0.036 - 0.004 * math.sin((t - 0.12) / 0.5 * math.pi)
        else:  # taper to a soft point at the crotch
            half = 0.036 * math.cos((t - 0.62) / 0.38 * math.pi / 2) ** 0.9
        shield.append((y, max(half, 0.002)))
    verts, faces = [], []
    cols = 8
    for y, half in shield:
        for c in range(cols + 1):
            verts.append((-half + 2 * half * c / cols, y, 0.08))
    for r in range(len(shield) - 1):
        for c in range(cols):
            a = r * (cols + 1) + c
            b = (r + 1) * (cols + 1) + c
            faces.append((a, b, b + 1, a + 1))
    belly = cc.add_mesh(decals, "belly", verts, faces, [mats["cream"]], smooth=True)
    wrap_onto(belly, clay, 0.0012)

    for side in (-1, 1):
        ex = side * 0.057
        sclera = disc_decal(decals, f"eye-{side}", (ex, 0.470, front), (0.050, 0.064), mats["eye"],
                            tilt=side * 0.10)
        wrap_onto(sclera, clay, 0.0012)
        pupil = disc_decal(decals, f"pupil-{side}", (ex - side * 0.005, 0.465, front), (0.034, 0.046),
                           mats["pupil"], rings=2, segments=16, tilt=side * 0.10)
        wrap_onto(pupil, clay, 0.0024)
        shine = disc_decal(decals, f"shine-{side}", (ex - side * 0.010, 0.478, front), (0.009, 0.010),
                           mats["eye"], rings=1, segments=10)
        wrap_onto(shine, clay, 0.0034)
        brow = ribbon_decal(decals, f"brow-{side}",
                            arc_points((side * 0.059, 0.517), 0.022, 0.008, front, tilt=side * 0.003),
                            0.0060, mats["line"])
        wrap_onto(brow, clay, 0.0014)

    mouth = ribbon_decal(decals, "mouth", arc_points((0, 0.420), 0.030, -0.011, front), 0.0050, mats["line"])
    wrap_onto(mouth, clay, 0.0014)
    for side in (-1, 1):
        cheek = ribbon_decal(decals, f"smile-end-{side}",
                             [(side * 0.028, 0.423, front), (side * 0.034, 0.428, front)], 0.0036,
                             mats["line"])
        wrap_onto(cheek, clay, 0.0014)
    nose = disc_decal(decals, "nose", (0, 0.437, front), (0.019, 0.012), mats["shade"], rings=2, segments=12)
    wrap_onto(nose, clay, 0.0016)
    return decals


def build_lamp(mats) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    center_y, back_z, depth, radius = 0.657, 0.058, 0.040, 0.043
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=depth,
                                        location=cc.to_blender((0, center_y, back_z + depth / 2)),
                                        rotation=(math.pi / 2, 0, 0))
    shell = bpy.context.object
    shell.name = "lamp-shell"
    shell.data.materials.append(mats["lamp"])
    apply_modifier(shell, "BEVEL", width=0.008, segments=3, limit_method="ANGLE")
    set_smooth(shell)
    parts.append(shell)
    front_z = back_z + depth + 0.0008
    parts.append(disc_decal(parts, "lamp-face", (0, center_y, front_z), (0.058, 0.058), mats["lamp_face"],
                            rings=2, segments=24))
    parts.append(disc_decal(parts, "lamp-glow", (0, center_y, front_z + 0.0008), (0.032, 0.032),
                            mats["lamp_glow"], rings=1, segments=20))
    return list(dict.fromkeys(parts))


# ---------------------------------------------------------------- main

def normalize_uniform(model: bpy.types.Object) -> None:
    _, minimum, maximum = cc.model_metrics(model)
    scale = HEIGHT / (maximum[1] - minimum[1])
    model.scale = (scale, scale, scale)
    active(model)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _, minimum, maximum = cc.model_metrics(model)
    cx = (minimum[0] + maximum[0]) / 2
    cz = (minimum[2] + maximum[2]) / 2
    model.location += Vector((-cx, cz, -minimum[1]))
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cc._materials.clear()
    mats = {
        "blue": cc.material("Piko blue", BLUE, 0.62),
        "shade": cc.material("Piko shade", BLUE_SHADE, 0.62),
        "cream": cc.material("Piko belly", CREAM, 0.7),
        "eye": cc.material("Piko eye white", EYE_WHITE, 0.45),
        "pupil": cc.material("Piko pupil", PUPIL, 0.35),
        "line": cc.material("Piko line", LINE, 0.6),
        "lamp": cc.material("Piko lamp", LAMP, 0.45),
        "lamp_face": cc.material("Piko lamp face", LAMP_FACE, 0.4),
        "lamp_glow": cc.material("Piko lamp glow", LAMP_GLOW, 0.3),
    }
    clay = build_clay(mats["blue"])
    decals = build_details(clay, mats)
    lamp = build_lamp(mats)
    model = join([clay, *decals, *lamp], MODEL_NAME)
    normalize_uniform(model)

    triangles, minimum, maximum = cc.model_metrics(model)
    if triangles > BUDGET:
        raise RuntimeError(f"{MODEL_NAME}: {triangles} triangles exceeds budget {BUDGET}")
    dims = [maximum[i] - minimum[i] for i in range(3)]

    active(model)
    glb_path = MODEL_DIR / f"{MODEL_NAME}.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format="GLB", export_yup=True,
                              use_selection=True)
    # Render with the same nominal box as Codex's `partner`, so camera, spacing and lights match exactly.
    ASSET_SPECS[MODEL_NAME] = (ASSET_SPECS["partner"][0], BUDGET)
    cc.setup_turnaround_preview(model, MODEL_NAME)
    print("CHARACTER_METRICS=" + json.dumps({
        "model": MODEL_NAME, "triangles": triangles, "budget": BUDGET,
        "dimensions": dims, "bbox": {"min": minimum, "max": maximum},
        "file_bytes": glb_path.stat().st_size,
    }, sort_keys=True))


main()
