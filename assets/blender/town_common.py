from __future__ import annotations

from pathlib import Path
import json
import math

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / "public" / "models"
PREVIEW_DIR = ROOT / "assets" / "previews"

# Sizes are exported glTF X/Y/Z extents.  The platform entries follow the
# runtime contract in src/view/placeholder-sizes.ts: +Z is travel direction.
ASSET_SPECS = {
    "house-a": ((8.0, 7.0, 7.0), 200),
    "house-b": ((10.0, 8.0, 8.0), 240),
    "house-c": ((7.0, 9.0, 7.0), 240),
    "shop": ((12.0, 6.0, 8.0), 260),
    "tower": ((6.0, 18.0, 6.0), 200),
    # The building is 12 m high; the ticket explicitly requires a 16 m pole.
    "hq": ((20.0, 16.0, 14.0), 400),
    "platform": ((4.0, 1.0, 30.0), 80),
    "platform-roof": ((4.0, 4.2, 12.0), 160),
    "station-sign": ((2.4, 3.0, 0.3), 60),
    "crossing-gate": ((4.5, 3.2, 0.6), 120),
    "crossing-sign": ((1.2, 3.0, 0.2), 60),
    "cat-sleep": ((0.7, 0.35, 0.5), 160),
    "cat-stand": ((0.7, 0.6, 0.4), 200),
    "partner": ((0.6, 0.7, 0.5), 240),
    "amanojaku": ((0.9, 1.4, 0.6), 320),
    "passenger": ((0.6, 1.6, 0.4), 120),
    "parcel": ((0.6, 0.5, 0.6), 40),
    "goal-flag": ((1.6, 2.4, 0.2), 60),
}

_materials: dict[tuple[str, str], bpy.types.Material] = {}


def srgb_channel(value: int) -> float:
    channel = value / 255.0
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def material(name: str, hex_color: str) -> bpy.types.Material:
    key = (name, hex_color)
    if key in _materials:
        return _materials[key]
    rgb = tuple(srgb_channel(int(hex_color[index:index + 2], 16)) for index in (1, 3, 5))
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    value.use_backface_culling = True
    value.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*rgb, 1.0)
    value.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.82
    value.diffuse_color = (*rgb, 1.0)
    _materials[key] = value
    return value


def to_blender(point: tuple[float, float, float]) -> tuple[float, float, float]:
    """Map exported glTF (X, Y-up, Z-forward) to Blender source coordinates."""
    x, y, z = point
    return (x, -z, y)


def finish_primitive(
    obj: bpy.types.Object,
    mat: bpy.types.Material,
    smooth: bool = False,
) -> bpy.types.Object:
    obj.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = smooth
    return obj


def add_box(
    parts: list[bpy.types.Object],
    name: str,
    size: tuple[float, float, float],
    center: tuple[float, float, float],
    mat: bpy.types.Material,
) -> bpy.types.Object:
    width, height, depth = size
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=to_blender(center))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (width, depth, height)
    finish_primitive(obj, mat)
    parts.append(obj)
    return obj


def add_vertical_cylinder(
    parts: list[bpy.types.Object],
    name: str,
    radius: float,
    height: float,
    center: tuple[float, float, float],
    mat: bpy.types.Material,
    vertices: int = 8,
    smooth: bool = False,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=height,
        location=to_blender(center),
    )
    obj = bpy.context.object
    obj.name = name
    finish_primitive(obj, mat, smooth)
    parts.append(obj)
    return obj


def add_vertical_elliptic_cylinder(
    parts: list[bpy.types.Object],
    name: str,
    width: float,
    depth: float,
    height: float,
    center: tuple[float, float, float],
    mat: bpy.types.Material,
    vertices: int = 8,
    smooth: bool = False,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=1.0,
        depth=height,
        location=to_blender(center),
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = (width / 2.0, depth / 2.0, 1.0)
    finish_primitive(obj, mat, smooth)
    parts.append(obj)
    return obj


def add_vertical_cone(
    parts: list[bpy.types.Object],
    name: str,
    radius1: float,
    radius2: float,
    height: float,
    center: tuple[float, float, float],
    mat: bpy.types.Material,
    vertices: int = 8,
    smooth: bool = False,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=height,
        location=to_blender(center),
    )
    obj = bpy.context.object
    obj.name = name
    finish_primitive(obj, mat, smooth)
    parts.append(obj)
    return obj


def add_sphere(
    parts: list[bpy.types.Object],
    name: str,
    size: tuple[float, float, float],
    center: tuple[float, float, float],
    mat: bpy.types.Material,
    segments: int = 8,
    rings: int = 4,
    smooth: bool = False,
) -> bpy.types.Object:
    width, height, depth = size
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        radius=1.0,
        location=to_blender(center),
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = (width / 2.0, depth / 2.0, height / 2.0)
    finish_primitive(obj, mat, smooth)
    parts.append(obj)
    return obj


def add_tapered_segment(
    parts: list[bpy.types.Object],
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius_start: float,
    radius_end: float,
    mat: bpy.types.Material,
    vertices: int = 6,
    smooth: bool = True,
) -> bpy.types.Object:
    start_blender = Vector(to_blender(start))
    end_blender = Vector(to_blender(end))
    direction = end_blender - start_blender
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius_start,
        radius2=radius_end,
        depth=direction.length,
        location=(start_blender + end_blender) / 2.0,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    finish_primitive(obj, mat, smooth)
    parts.append(obj)
    return obj


def add_face_ellipse(
    parts: list[bpy.types.Object],
    name: str,
    center: tuple[float, float, float],
    radius_x: float,
    radius_y: float,
    mat: bpy.types.Material,
    vertices_count: int = 6,
    rotation: float = 0.0,
) -> bpy.types.Object:
    cx, cy, cz = center
    points = []
    for index in range(vertices_count):
        angle = rotation + 2 * math.pi * index / vertices_count
        points.append((cx + math.cos(angle) * radius_x, cy + math.sin(angle) * radius_y, cz))
    return add_mesh(parts, name, points, [tuple(range(vertices_count))], mat)


def add_arc_band(
    parts: list[bpy.types.Object],
    name: str,
    center: tuple[float, float, float],
    radius: float,
    thickness: float,
    start_angle: float,
    end_angle: float,
    mat: bpy.types.Material,
    segments: int = 3,
) -> bpy.types.Object:
    cx, cy, cz = center
    inner = max(radius - thickness / 2.0, 0.001)
    outer = radius + thickness / 2.0
    vertices = []
    for index in range(segments + 1):
        angle = start_angle + (end_angle - start_angle) * index / segments
        vertices.append((cx + math.cos(angle) * outer, cy + math.sin(angle) * outer, cz))
        vertices.append((cx + math.cos(angle) * inner, cy + math.sin(angle) * inner, cz))
    faces = [(index * 2, (index + 1) * 2, (index + 1) * 2 + 1, index * 2 + 1)
             for index in range(segments)]
    return add_mesh(parts, name, vertices, faces, mat)


def add_profiled_body(
    parts: list[bpy.types.Object],
    name: str,
    rings: list[tuple[float, float, float]],
    mat: bpy.types.Material,
    segments: int = 6,
    smooth: bool = True,
) -> bpy.types.Object:
    vertices = []
    for y, radius_x, radius_z in rings:
        for index in range(segments):
            angle = 2 * math.pi * index / segments
            vertices.append((math.cos(angle) * radius_x, y, math.sin(angle) * radius_z))
    faces: list[tuple[int, ...]] = [tuple(range(segments - 1, -1, -1))]
    for ring_index in range(len(rings) - 1):
        first = ring_index * segments
        second = (ring_index + 1) * segments
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((first + index, first + nxt, second + nxt, second + index))
    top = (len(rings) - 1) * segments
    faces.append(tuple(top + index for index in range(segments)))
    obj = add_mesh(parts, name, vertices, faces, mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = smooth
    return obj


def add_mesh(
    parts: list[bpy.types.Object],
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    mat: bpy.types.Material,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([to_blender(point) for point in vertices], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    parts.append(obj)
    return obj


def add_extruded_profile(
    parts: list[bpy.types.Object],
    name: str,
    profile: list[tuple[float, float]],
    z_min: float,
    z_max: float,
    mat: bpy.types.Material,
) -> bpy.types.Object:
    vertices = [(x, y, z_min) for x, y in profile] + [(x, y, z_max) for x, y in profile]
    count = len(profile)
    faces: list[tuple[int, ...]] = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    return add_mesh(parts, name, vertices, faces, mat)


def add_beam_xy(
    parts: list[bpy.types.Object],
    name: str,
    start: tuple[float, float],
    end: tuple[float, float],
    thickness: float,
    z_center: float,
    depth: float,
    mat: bpy.types.Material,
) -> bpy.types.Object:
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    length = math.hypot(dx, dy)
    px = -dy / length * thickness / 2.0
    py = dx / length * thickness / 2.0
    z0 = z_center - depth / 2.0
    z1 = z_center + depth / 2.0
    outline = [
        (start[0] + px, start[1] + py),
        (end[0] + px, end[1] + py),
        (end[0] - px, end[1] - py),
        (start[0] - px, start[1] - py),
    ]
    vertices = [(x, y, z0) for x, y in outline] + [(x, y, z1) for x, y in outline]
    faces = [
        (0, 3, 2, 1),
        (4, 5, 6, 7),
        (0, 1, 5, 4),
        (1, 2, 6, 5),
        (2, 3, 7, 6),
        (3, 0, 4, 7),
    ]
    return add_mesh(parts, name, vertices, faces, mat)


def add_disc_xy(
    parts: list[bpy.types.Object],
    name: str,
    center: tuple[float, float, float],
    radius: float,
    depth: float,
    mat: bpy.types.Material,
    vertices_count: int = 8,
) -> bpy.types.Object:
    cx, cy, cz = center
    ring_front = [
        (cx + math.cos(2 * math.pi * i / vertices_count) * radius,
         cy + math.sin(2 * math.pi * i / vertices_count) * radius,
         cz + depth / 2.0)
        for i in range(vertices_count)
    ]
    ring_back = [(x, y, cz - depth / 2.0) for x, y, _ in ring_front]
    vertices = ring_back + ring_front
    faces: list[tuple[int, ...]] = [
        tuple(range(vertices_count - 1, -1, -1)),
        tuple(range(vertices_count, vertices_count * 2)),
    ]
    for i in range(vertices_count):
        nxt = (i + 1) % vertices_count
        faces.append((i, nxt, vertices_count + nxt, vertices_count + i))
    return add_mesh(parts, name, vertices, faces, mat)


def join_parts(parts: list[bpy.types.Object], model_name: str) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    model = bpy.context.object
    model.name = model_name
    model.data.name = model_name
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    return model


def model_metrics(model: bpy.types.Object) -> tuple[int, list[float], list[float]]:
    model.data.calc_loop_triangles()
    points = []
    for vertex in model.data.vertices:
        point = model.matrix_world @ vertex.co
        points.append((point.x, point.z, -point.y))
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    return len(model.data.loop_triangles), minimum, maximum


def build_house_a(parts: list[bpy.types.Object]) -> None:
    wall = material("Warm cream wall", "#F6E7C9")
    roof = material("Coral roof", "#D9694F")
    wood = material("Wood door", "#6B4E2E")
    glass = material("Soft blue window", "#4F7FB0")
    add_box(parts, "walls", (8, 5.2, 7), (0, 2.6, 0), wall)
    add_extruded_profile(parts, "gable-roof", [(-4, 5.2), (0, 7), (4, 5.2)], -3.5, 3.5, roof)
    add_box(parts, "door", (1.4, 2.4, 0.08), (0, 1.2, 3.50), wood)
    for x in (-2.5, 2.5):
        add_box(parts, f"window-{x}", (1.2, 1.2, 0.06), (x, 3.0, 3.50), glass)


def build_house_b(parts: list[bpy.types.Object]) -> None:
    wall = material("Blue white wall", "#DCE9F5")
    roof = material("Blue roof", "#4F7FB0")
    glass = material("Navy window", "#1F2A44")
    door = material("Blue door", "#3FA7D6")
    add_box(parts, "walls", (10, 6.8, 8), (0, 3.4, 0), wall)
    add_box(parts, "square-roof", (10, 1.2, 8), (0, 7.4, 0), roof)
    add_box(parts, "door", (1.6, 2.6, 0.08), (0, 1.3, 4.00), door)
    for x in (-3.2, 3.2):
        for y in (2.0, 4.6):
            add_box(parts, f"window-{x}-{y}", (1.5, 1.15, 0.06), (x, y, 4.00), glass)


def build_house_c(parts: list[bpy.types.Object]) -> None:
    wall = material("Pink wall", "#F4D6E4")
    roof = material("Purple roof", "#8E5A9E")
    glass = material("Warm window", "#FFD166")
    door = material("Purple door", "#6B4E7A")
    add_box(parts, "walls", (7, 8.2, 7), (0, 4.1, 0), wall)
    add_box(parts, "roof", (7, 0.8, 7), (0, 8.6, 0), roof)
    add_box(parts, "floor-band", (7, 0.18, 0.08), (0, 4.2, 3.50), roof)
    add_box(parts, "door", (1.2, 2.2, 0.08), (0, 1.1, 3.50), door)
    for x in (-2.1, 2.1):
        for y in (2.8, 6.1):
            add_box(parts, f"window-{x}-{y}", (1.2, 1.25, 0.06), (x, y, 3.50), glass)


def build_shop(parts: list[bpy.types.Object]) -> None:
    wall = material("Butter wall", "#FFF1B8")
    coral = material("Coral awning", "#E9573F")
    white = material("White awning", "#FFFFFF")
    glass = material("Shop window", "#4F7FB0")
    add_box(parts, "shop-body", (12, 5.4, 6.5), (0, 2.7, -0.75), wall)
    add_box(parts, "flat-roof", (12, 0.6, 6.5), (0, 5.7, -0.75), coral)
    for index in range(10):
        x = -4.5 + index
        add_box(parts, f"awning-{index}", (1.0, 0.22, 1.5), (x, 3.5, 3.25), coral if index % 2 == 0 else white)
    add_box(parts, "shop-door", (1.5, 2.7, 0.08), (0, 1.35, 2.50), coral)
    for x in (-3.7, 3.7):
        add_box(parts, f"shop-window-{x}", (2.8, 2.2, 0.06), (x, 1.8, 2.50), glass)


def build_tower(parts: list[bpy.types.Object]) -> None:
    wall = material("Stone wall", "#E8E4D8")
    roof = material("Green roof", "#5B8C5A")
    clock = material("Clock face", "#FFF1B8")
    frame = material("Clock frame", "#6B6B6B")
    door = material("Tower door", "#6B4E2E")
    add_box(parts, "tower-body", (4.8, 15, 4.8), (0, 7.5, 0), wall)
    add_extruded_profile(parts, "tower-roof", [(-3, 15), (0, 18), (3, 15)], -3, 3, roof)
    add_disc_xy(parts, "clock", (0, 12.5, 2.42), 1.25, 0.12, clock, 12)
    add_disc_xy(parts, "clock-center", (0, 12.5, 2.49), 0.15, 0.02, frame, 8)
    add_box(parts, "tower-door", (1.4, 2.7, 0.08), (0, 1.35, 2.40), door)


def build_hq(parts: list[bpy.types.Object]) -> None:
    wall = material("HQ wall", "#F9F3E3")
    roof = material("HQ blue roof", "#3FA7D6")
    gold = material("HQ arch", "#FFD166")
    dark = material("HQ entrance", "#1F2A44")
    pole = material("Flag pole", "#6B6B6B")
    flag = material("Expedition flag", "#E9573F")
    add_box(parts, "hq-body", (20, 9, 14), (0, 4.5, 0), wall)
    profile = []
    for index in range(9):
        x = -10 + index * 2.5
        y = 9 + 3 * (1 - (x / 10) ** 2)
        profile.append((x, y))
    add_extruded_profile(parts, "barrel-roof", profile, -7, 7, roof)
    add_box(parts, "entrance", (5.5, 5.7, 0.08), (0, 2.85, 7.00), dark)
    add_box(parts, "arch-left", (0.32, 3.0, 0.12), (-2.85, 1.5, 7.00), gold)
    add_box(parts, "arch-right", (0.32, 3.0, 0.12), (2.85, 1.5, 7.00), gold)
    arc_points = []
    for index in range(7):
        angle = math.pi - index * math.pi / 6
        arc_points.append((math.cos(angle) * 2.85, 3.0 + math.sin(angle) * 2.85))
    for index in range(len(arc_points) - 1):
        add_beam_xy(parts, f"arch-{index}", arc_points[index], arc_points[index + 1], 0.32, 7.00, 0.12, gold)
    add_vertical_cylinder(parts, "flag-pole", 0.08, 16, (7.5, 8, 0), pole, 8)
    add_mesh(parts, "flag", [(7.5, 15.8, 0), (9.2, 15.2, 0), (7.5, 14.6, 0),
                             (7.5, 15.8, 0.08), (9.2, 15.2, 0.08), (7.5, 14.6, 0.08)],
             [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)], flag)


def build_platform(parts: list[bpy.types.Object]) -> None:
    body = material("Platform", "#BFB8AA")
    yellow = material("Safety strip", "#FFD166")
    # X=0 is the rail-side edge; the platform extends away in +X.
    add_box(parts, "platform-body", (4, 1, 30), (2, 0.5, 0), body)
    add_box(parts, "safety-strip", (0.3, 0.04, 30), (0.15, 1.0, 0), yellow)


def build_platform_roof(parts: list[bpy.types.Object]) -> None:
    column = material("Roof columns", "#6B6B6B")
    roof = material("Station blue roof", "#4F7FB0")
    for x in (0.4, 3.6):
        for z in (-5.2, 5.2):
            add_box(parts, f"column-{x}-{z}", (0.3, 3.6, 0.3), (x, 1.8, z), column)
    add_mesh(parts, "lean-to-roof",
             [(0, 3.6, -6), (4, 3.6, -6), (4, 4.2, -6), (0, 4.0, -6),
              (0, 3.6, 6), (4, 3.6, 6), (4, 4.2, 6), (0, 4.0, 6)],
             [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5),
              (2, 3, 7, 6), (3, 0, 4, 7)], roof)


def build_station_sign(parts: list[bpy.types.Object]) -> None:
    blue = material("Sign frame", "#3FA7D6")
    white = material("Sign face", "#FFFFFF")
    grey = material("Sign post", "#6B6B6B")
    add_box(parts, "sign-post", (0.18, 2.0, 0.18), (0, 1.0, 0), grey)
    add_box(parts, "sign-frame", (2.4, 1.0, 0.3), (0, 2.5, 0), blue)
    add_box(parts, "sign-face", (2.1, 0.72, 0.03), (0, 2.5, 0.155), white)


def build_crossing_gate(parts: list[bpy.types.Object]) -> None:
    yellow = material("Crossing yellow", "#FFD166")
    dark = material("Crossing dark", "#3A3F47")
    add_box(parts, "gate-post", (0.3, 3.2, 0.6), (2.1, 1.6, 0), dark)
    segment_width = 4.2 / 8
    for index in range(8):
        x = -2.25 + segment_width * (index + 0.5)
        add_box(parts, f"gate-bar-{index}", (segment_width, 0.15, 0.18), (x, 1.0, 0), yellow if index % 2 == 0 else dark)


def build_crossing_sign(parts: list[bpy.types.Object]) -> None:
    yellow = material("Crossbuck yellow", "#FFD166")
    dark = material("Crossbuck dark", "#3A3F47")
    grey = material("Crossbuck post", "#6B6B6B")
    add_box(parts, "sign-post", (0.12, 2.15, 0.12), (0, 1.075, 0), grey)
    starts = [(-0.52, 2.05), (-0.52, 2.95)]
    ends = [(0.52, 2.95), (0.52, 2.05)]
    for index, (start, end) in enumerate(zip(starts, ends)):
        add_beam_xy(parts, f"yellow-cross-{index}", start, end, 0.20, 0, 0.2, yellow)
        add_beam_xy(parts, f"dark-cross-{index}", start, end, 0.07, 0.095, 0.01, dark)


def cat_ear(parts: list[bpy.types.Object], name: str, x: float, y0: float, y1: float, z: float,
            mat: bpy.types.Material, inner: bpy.types.Material | None = None,
            width: float = 0.14, depth: float = 0.12) -> None:
    add_mesh(parts, name,
             [(x - width / 2, y0, z - depth / 2), (x + width / 2, y0, z - depth / 2),
              (x, y1, z), (x - width / 2, y0, z + depth / 2), (x + width / 2, y0, z + depth / 2)],
             [(0, 1, 2), (3, 2, 4), (0, 2, 3), (1, 4, 2), (0, 3, 4, 1)], mat)
    if inner:
        add_mesh(parts, name + "-inner",
                 [(x - 0.035, y0 + 0.015, z + depth / 2 + 0.002),
                  (x + 0.035, y0 + 0.015, z + depth / 2 + 0.002),
                  (x, y1 - 0.025, z + 0.002 + depth / 2)],
                 [(0, 1, 2)], inner)


def build_cat_sleep(parts: list[bpy.types.Object]) -> None:
    orange = material("Cat orange", "#F4A261")
    tail = material("Cat tail shading", "#D98245")
    inner = material("Cat ear inner", "#F6C1A0")
    cream = material("Cat muzzle", "#FFE3C2")
    dark = material("Cat face", "#74452F")
    add_sphere(parts, "curled-body", (0.70, 0.30, 0.50), (0, 0.15, 0), orange,
               segments=9, rings=4, smooth=True)
    add_sphere(parts, "resting-head", (0.34, 0.24, 0.32), (0.17, 0.21, 0.08), orange,
               segments=8, rings=4, smooth=True)
    cat_ear(parts, "left-ear", 0.08, 0.27, 0.35, 0.17, orange, inner, width=0.12, depth=0.09)
    cat_ear(parts, "right-ear", 0.25, 0.27, 0.35, 0.17, orange, inner, width=0.12, depth=0.09)
    add_face_ellipse(parts, "soft-muzzle", (0.17, 0.175, 0.245), 0.105, 0.050, cream, 6)
    add_mesh(parts, "closed-eye-left",
             [(0.070, 0.235, 0.248), (0.140, 0.230, 0.248),
              (0.140, 0.220, 0.248), (0.070, 0.225, 0.248)], [(0, 1, 2, 3)], dark)
    add_mesh(parts, "closed-eye-right",
             [(0.200, 0.230, 0.248), (0.270, 0.235, 0.248),
              (0.270, 0.225, 0.248), (0.200, 0.220, 0.248)], [(0, 1, 2, 3)], dark)
    add_mesh(parts, "nose", [(0.155, 0.195, 0.250), (0.185, 0.195, 0.250),
                              (0.170, 0.176, 0.250)], [(0, 1, 2)], dark)
    add_tapered_segment(parts, "curled-tail-base", (-0.20, 0.15, -0.12), (-0.31, 0.13, 0.02),
                        0.050, 0.045, tail, 5)
    add_tapered_segment(parts, "curled-tail-tip", (-0.31, 0.13, 0.02), (-0.24, 0.07, 0.18),
                        0.045, 0.030, tail, 5)


def build_cat_stand(parts: list[bpy.types.Object]) -> None:
    orange = material("Cat orange", "#F4A261")
    tail = material("Cat tail shading", "#D98245")
    inner = material("Cat ear inner", "#F6C1A0")
    cream = material("Cat muzzle", "#FFE3C2")
    dark = material("Cat face", "#74452F")
    eye = material("Cat eyes", "#3F5F48")
    shine = material("Cat eye shine", "#FFFFFF")
    add_sphere(parts, "pear-body", (0.42, 0.42, 0.32), (-0.02, 0.23, -0.02), orange,
               segments=8, rings=4, smooth=True)
    add_sphere(parts, "round-head", (0.50, 0.32, 0.40), (0.10, 0.43, 0), orange,
               segments=8, rings=4, smooth=True)
    for x in (-0.11, 0.12):
        add_tapered_segment(parts, f"front-leg-{x}", (x, 0.0, 0.08), (x, 0.21, 0.04),
                            0.055, 0.070, orange, 5)
    cat_ear(parts, "left-ear", -0.01, 0.52, 0.60, 0.04, orange, inner, width=0.13, depth=0.10)
    cat_ear(parts, "right-ear", 0.21, 0.52, 0.60, 0.04, orange, inner, width=0.13, depth=0.10)
    add_tapered_segment(parts, "upright-tail-base", (-0.18, 0.20, -0.08), (-0.31, 0.33, -0.05),
                        0.055, 0.045, tail, 5)
    add_tapered_segment(parts, "upright-tail-tip", (-0.31, 0.33, -0.05), (-0.29, 0.50, 0),
                        0.045, 0.032, tail, 5)
    add_face_ellipse(parts, "soft-muzzle", (0.10, 0.405, 0.203), 0.115, 0.060, cream, 5)
    add_face_ellipse(parts, "chest-fur", (0.02, 0.245, 0.143), 0.10, 0.13, cream, 6)
    add_face_ellipse(parts, "eye-left", (0.025, 0.468, 0.205), 0.024, 0.032, eye, 5)
    add_face_ellipse(parts, "eye-right", (0.175, 0.468, 0.205), 0.024, 0.032, eye, 5)
    add_mesh(parts, "eye-glint-left", [(0.018, 0.485, 0.208), (0.030, 0.487, 0.208),
                                        (0.021, 0.475, 0.208)], [(0, 1, 2)], shine)
    add_mesh(parts, "eye-glint-right", [(0.168, 0.485, 0.208), (0.180, 0.487, 0.208),
                                         (0.171, 0.475, 0.208)], [(0, 1, 2)], shine)
    add_mesh(parts, "nose", [(0.083, 0.425, 0.208), (0.117, 0.425, 0.208),
                              (0.100, 0.401, 0.208)], [(0, 1, 2)], dark)
    add_arc_band(parts, "smile", (0.10, 0.410, 0.209), 0.047, 0.010,
                 math.pi, 2 * math.pi, dark, 3)
    add_mesh(parts, "left-toes", [(-0.135, 0.030, 0.138), (-0.085, 0.030, 0.138),
                                   (-0.085, 0.020, 0.138), (-0.135, 0.020, 0.138)],
             [(0, 1, 2, 3)], dark)
    add_mesh(parts, "right-toes", [(0.095, 0.030, 0.138), (0.145, 0.030, 0.138),
                                    (0.145, 0.020, 0.138), (0.095, 0.020, 0.138)],
             [(0, 1, 2, 3)], dark)


def build_partner(parts: list[bpy.types.Object]) -> None:
    blue = material("Piko blue", "#8BD3DD")
    white = material("Piko belly", "#F7FCFC")
    dark = material("Piko eyes", "#23272B")
    cheek = material("Piko cheeks", "#F3A6B5")
    yellow = material("Piko lamp", "#FFD166")
    add_sphere(parts, "soft-body", (0.54, 0.52, 0.50), (0, 0.31, 0), blue,
               segments=12, rings=4, smooth=True)
    patch_vertices = [(0, 0.205, 0.231)]
    patch_count = 12
    for index in range(patch_count):
        angle = 2 * math.pi * index / patch_count
        x = math.cos(angle) * 0.145
        y = 0.205 + math.sin(angle) * 0.105
        normalized = (x / 0.27) ** 2 + ((y - 0.31) / 0.26) ** 2
        z = 0.25 * math.sqrt(max(0.0, 1.0 - normalized)) + 0.003
        patch_vertices.append((x, y, z))
    patch = add_mesh(parts, "belly-patch", patch_vertices,
                     [(0, index + 1, (index + 1) % patch_count + 1)
                      for index in range(patch_count)], white)
    for polygon in patch.data.polygons:
        polygon.use_smooth = True
    for x in (-0.105, 0.105):
        add_face_ellipse(parts, f"eye-{x}", (x, 0.430, 0.255), 0.036, 0.048, dark, 6)
        add_mesh(parts, f"eye-glint-{x}",
                 [(x - 0.010, 0.455, 0.258), (x + 0.004, 0.458, 0.258),
                  (x - 0.006, 0.442, 0.258)], [(0, 1, 2)], white)
    for x in (-0.18, 0.18):
        add_face_ellipse(parts, f"cheek-{x}", (x, 0.345, 0.256), 0.031, 0.020, cheek, 5)
    add_arc_band(parts, "friendly-smile", (0, 0.355, 0.258), 0.050, 0.012,
                 math.pi, 2 * math.pi, dark, 3)
    add_tapered_segment(parts, "left-arm", (-0.22, 0.36, 0), (-0.27, 0.23, 0.03),
                        0.052, 0.035, blue, 6)
    add_tapered_segment(parts, "right-arm", (0.22, 0.36, 0), (0.27, 0.23, 0.03),
                        0.052, 0.035, blue, 6)
    for x in (-0.15, 0.15):
        add_vertical_elliptic_cylinder(parts, f"foot-{x}", 0.18, 0.20, 0.10,
                                       (x, 0.05, 0.06), blue, 6, smooth=True)
    add_box(parts, "lamp-stem", (0.040, 0.080, 0.040), (0, 0.600, 0), yellow)
    add_sphere(parts, "lamp", (0.12, 0.12, 0.12), (0, 0.64, 0), yellow,
               segments=6, rings=3, smooth=True)


def build_amanojaku(parts: list[bpy.types.Object]) -> None:
    body = material("Amanojaku body", "#B4A7D6")
    body_shadow = material("Amanojaku accents", "#8272B2")
    purple = material("Spiral hat purple", "#8E5A9E")
    yellow = material("Spiral hat yellow", "#FFD166")
    cheek = material("Amanojaku cheeks", "#E5A6C6")
    white = material("Amanojaku eye glint", "#FFFFFF")
    dark = material("Friendly face", "#3A3F47")
    add_sphere(parts, "slender-body", (0.58, 0.84, 0.50), (0, 0.51, 0), body,
               segments=8, rings=4, smooth=True)
    add_sphere(parts, "round-face", (0.56, 0.40, 0.52), (0, 0.86, 0.02), body,
               segments=8, rings=4, smooth=True)
    for x in (-0.17, 0.17):
        add_vertical_elliptic_cylinder(parts, f"shoe-{x}", 0.24, 0.30, 0.14,
                                       (x, 0.07, 0.06), body_shadow, 6, smooth=True)
    add_tapered_segment(parts, "left-arm", (-0.27, 0.72, 0), (-0.34, 0.38, 0.04),
                        0.070, 0.052, body, 6)
    add_tapered_segment(parts, "right-arm", (0.27, 0.72, 0), (0.34, 0.38, 0.04),
                        0.070, 0.052, body, 6)
    add_vertical_elliptic_cylinder(parts, "soft-hat-brim", 0.90, 0.60, 0.07,
                                   (0, 1.075, 0), purple, 8, smooth=True)
    add_vertical_cone(parts, "soft-hat", 0.30, 0.045, 0.31, (0, 1.25, 0), purple, 8, smooth=True)
    add_sphere(parts, "hat-tip", (0.10, 0.10, 0.10), (0.07, 1.35, 0), purple,
               segments=6, rings=3, smooth=True)
    for index, (start, end, z) in enumerate((
        ((-0.25, 1.16), (0.22, 1.20), 0.235),
        ((0.17, 1.25), (-0.17, 1.29), 0.170),
        ((-0.09, 1.34), (0.09, 1.365), 0.105),
    )):
        add_beam_xy(parts, f"hat-spiral-{index}", start, end, 0.035, z, 0.010, yellow)
    for x in (-0.105, 0.105):
        add_face_ellipse(parts, f"eye-{x}", (x, 0.895, 0.283), 0.035, 0.046, dark, 6)
        add_mesh(parts, f"eye-glint-{x}",
                 [(x - 0.010, 0.919, 0.286), (x + 0.004, 0.921, 0.286),
                  (x - 0.006, 0.906, 0.286)], [(0, 1, 2)], white)
    for x in (-0.17, 0.17):
        add_face_ellipse(parts, f"cheek-{x}", (x, 0.805, 0.284), 0.038, 0.022, cheek, 5)
    add_arc_band(parts, "mischievous-smile", (0, 0.825, 0.286), 0.105, 0.018,
                 math.pi, 2 * math.pi, dark, 4)


def build_passenger(parts: list[bpy.types.Object]) -> None:
    skin = material("Passenger skin", "#F6D6B8")
    blue = material("Passenger body", "#4F7FB0")
    dark = material("Passenger face", "#3A3F47")
    hair = material("Passenger hair", "#6B4E2E")
    white = material("Passenger collar", "#F7F5EE")
    add_profiled_body(parts, "rounded-coat",
                      [(0.00, 0.20, 0.15), (0.18, 0.24, 0.17),
                       (0.84, 0.28, 0.18), (1.04, 0.18, 0.14)],
                      blue, segments=6, smooth=True)
    add_sphere(parts, "head", (0.60, 0.56, 0.40), (0, 1.32, 0), skin,
               segments=8, rings=4, smooth=True)
    add_profiled_body(parts, "hair-cap", [(1.47, 0.26, 0.16), (1.60, 0.12, 0.08)],
                      hair, segments=5, smooth=True)
    for x in (-0.095, 0.095):
        add_face_ellipse(parts, f"eye-{x}", (x, 1.335, 0.203), 0.022, 0.030, dark, 4)
    add_mesh(parts, "nose", [(-0.012, 1.290, 0.205), (0.012, 1.290, 0.205),
                              (0, 1.272, 0.205)], [(0, 1, 2)], dark)
    add_arc_band(parts, "smile", (0, 1.285, 0.207), 0.052, 0.010,
                 math.pi, 2 * math.pi, dark, 2)
    add_mesh(parts, "collar-left", [(-0.16, 1.04, 0.145), (0, 0.91, 0.183),
                                     (0, 1.04, 0.145)], [(0, 1, 2)], white)
    add_mesh(parts, "collar-right", [(0, 1.04, 0.145), (0, 0.91, 0.183),
                                      (0.16, 1.04, 0.145)], [(0, 1, 2)], white)


def build_parcel(parts: list[bpy.types.Object]) -> None:
    cardboard = material("Parcel cardboard", "#C89B6D")
    ribbon = material("Parcel ribbon", "#E9573F")
    add_box(parts, "parcel-box", (0.6, 0.5, 0.6), (0, 0.25, 0), cardboard)
    add_box(parts, "ribbon-x", (0.12, 0.51, 0.62), (0, 0.255, 0), ribbon)
    add_box(parts, "ribbon-z", (0.62, 0.52, 0.12), (0, 0.26, 0), ribbon)


def build_goal_flag(parts: list[bpy.types.Object]) -> None:
    red = material("Goal flag", "#E9573F")
    pole = material("Goal pole", "#6B6B6B")
    add_vertical_cylinder(parts, "flag-pole", 0.05, 2.4, (-0.75, 1.2, 0), pole, 6)
    add_mesh(parts, "triangle-flag",
             [(-0.75, 2.35, -0.1), (0.8, 1.85, -0.1), (-0.75, 1.45, -0.1),
              (-0.75, 2.35, 0.1), (0.8, 1.85, 0.1), (-0.75, 1.45, 0.1)],
             [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)], red)


BUILDERS = {
    "house-a": build_house_a,
    "house-b": build_house_b,
    "house-c": build_house_c,
    "shop": build_shop,
    "tower": build_tower,
    "hq": build_hq,
    "platform": build_platform,
    "platform-roof": build_platform_roof,
    "station-sign": build_station_sign,
    "crossing-gate": build_crossing_gate,
    "crossing-sign": build_crossing_sign,
    "cat-sleep": build_cat_sleep,
    "cat-stand": build_cat_stand,
    "partner": build_partner,
    "amanojaku": build_amanojaku,
    "passenger": build_passenger,
    "parcel": build_parcel,
    "goal-flag": build_goal_flag,
}


def setup_preview(model: bpy.types.Object, model_name: str, minimum: list[float], maximum: list[float]) -> None:
    scene = bpy.context.scene
    character_names = {"cat-sleep", "cat-stand", "partner", "amanojaku", "passenger"}
    is_character = model_name in character_names
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 3
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(PREVIEW_DIR / f"{model_name}.png")
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = bpy.data.worlds.new("Preview World")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (
        (0.20, 0.22, 0.24, 1.0) if is_character else (0.72, 0.72, 0.72, 1.0)
    )
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.40 if is_character else 0.45

    width = maximum[0] - minimum[0]
    height = maximum[1] - minimum[1]
    depth = maximum[2] - minimum[2]
    center = ((minimum[0] + maximum[0]) / 2, (minimum[1] + maximum[1]) / 2,
              (minimum[2] + maximum[2]) / 2)
    span = max(width, height, depth)
    ground_size = max(width, depth, 1.0) * 2.8
    ground_mat = material("Preview ground", "#C6CCCF" if is_character else "#D8D8D4")
    bpy.ops.mesh.primitive_plane_add(size=ground_size, location=(center[0], -center[2], -0.012))
    bpy.context.object.data.materials.append(ground_mat)

    target_height = max(height * (0.48 if is_character else 0.42), center[1] * 0.8)
    target = Vector(to_blender((center[0], target_height, center[2])))
    camera_location = target + Vector((span * (0.95 if is_character else 1.15),
                                       -span * (2.15 if is_character else 1.90),
                                       span * (0.58 if is_character else 1.00)))
    bpy.ops.object.camera_add(location=camera_location)
    camera = bpy.context.object
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 58.0
    scene.camera = camera

    bpy.ops.object.light_add(type="AREA", location=target + Vector((span * 0.7, -span * 0.8, span * 1.1)))
    bpy.context.object.data.energy = max(42, span * 38) if is_character else max(120, span * 55)
    bpy.context.object.data.shape = "DISK"
    bpy.context.object.data.size = max(span * 0.90, 1.2) if is_character else max(span * 0.75, 2.0)
    bpy.ops.object.light_add(type="AREA", location=target + Vector((-span * 0.8, span * 0.2, span * 0.5)))
    bpy.context.object.data.energy = max(16, span * 16) if is_character else max(60, span * 25)
    bpy.context.object.data.size = max(span * 0.65, 0.8) if is_character else max(span * 0.5, 1.5)
    bpy.ops.render.render(write_still=True)


def generate(model_name: str) -> None:
    if model_name not in BUILDERS:
        raise ValueError(f"Unknown town asset: {model_name}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _materials.clear()
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    parts: list[bpy.types.Object] = []
    BUILDERS[model_name](parts)
    model = join_parts(parts, model_name)
    triangles, minimum, maximum = model_metrics(model)
    budget = ASSET_SPECS[model_name][1]
    if triangles > budget:
        raise RuntimeError(f"{model_name}: {triangles} triangles exceeds budget {budget}")

    bpy.ops.object.select_all(action="DESELECT")
    model.select_set(True)
    bpy.context.view_layer.objects.active = model
    glb_path = MODEL_DIR / f"{model_name}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        export_yup=True,
        use_selection=True,
    )
    setup_preview(model, model_name, minimum, maximum)
    print("ASSET_METRICS=" + json.dumps({
        "model": model_name,
        "triangles": triangles,
        "budget": budget,
        "bbox": {"min": minimum, "max": maximum},
        "dimensions": [maximum[i] - minimum[i] for i in range(3)],
        "file_bytes": glb_path.stat().st_size,
    }, sort_keys=True))
