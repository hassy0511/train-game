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
    # Revised for the user-approved Variant C style. These remain tiny against
    # the 100k on-screen budget while allowing controlled rounded transitions.
    "cat-sleep": ((0.7, 0.35, 0.5), 1400),
    "cat-stand": ((0.7, 0.6, 0.4), 1800),
    "partner": ((0.6, 0.7, 0.5), 1800),
    "amanojaku": ((0.9, 1.4, 0.6), 2600),
    "passenger": ((0.6, 1.6, 0.4), 2400),
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


def add_beveled_box(
    parts: list[bpy.types.Object],
    name: str,
    size: tuple[float, float, float],
    center: tuple[float, float, float],
    mat: bpy.types.Material,
    bevel: float,
    smooth: bool = False,
) -> bpy.types.Object:
    obj = add_box(parts, name, size, center, mat)
    modifier = obj.modifiers.new(name="Controlled bevel", type="BEVEL")
    modifier.width = bevel
    modifier.segments = 1
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = smooth
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


def add_bent_tube(
    parts: list[bpy.types.Object],
    name: str,
    points: list[tuple[float, float, float]],
    radii: list[float],
    segment_materials: list[bpy.types.Material],
    sides: int = 5,
    smooth: bool = True,
) -> bpy.types.Object:
    """Create one continuous low-resolution tube with one material per path segment."""
    if len(points) != len(radii) or len(segment_materials) != len(points) - 1:
        raise ValueError(f"{name}: point, radius, and material counts do not match")
    vertices: list[tuple[float, float, float]] = []
    for index, point in enumerate(points):
        previous = Vector(points[max(0, index - 1)])
        following = Vector(points[min(len(points) - 1, index + 1)])
        tangent = following - previous
        tangent.z = 0
        tangent.normalize()
        normal = Vector((-tangent.y, tangent.x, 0))
        center = Vector(point)
        for side in range(sides):
            angle = 2 * math.pi * side / sides
            offset = normal * (math.cos(angle) * radii[index])
            offset.z += math.sin(angle) * radii[index]
            value = center + offset
            vertices.append((value.x, value.y, value.z))

    faces: list[tuple[int, ...]] = [tuple(range(sides - 1, -1, -1))]
    for segment in range(len(points) - 1):
        first = segment * sides
        second = (segment + 1) * sides
        for side in range(sides):
            nxt = (side + 1) % sides
            faces.append((first + side, first + nxt, second + nxt, second + side))
    final = (len(points) - 1) * sides
    faces.append(tuple(final + side for side in range(sides)))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([to_blender(point) for point in vertices], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for mat in segment_materials:
        mesh.materials.append(mat)
    mesh.polygons[0].material_index = 0
    for segment in range(len(segment_materials)):
        for polygon_index in range(1 + segment * sides, 1 + (segment + 1) * sides):
            mesh.polygons[polygon_index].material_index = segment
            mesh.polygons[polygon_index].use_smooth = smooth
    mesh.polygons[-1].material_index = len(segment_materials) - 1
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


def bevel_object(obj: bpy.types.Object, width: float, segments: int = 2) -> bpy.types.Object:
    modifier = obj.modifiers.new(name="Soft profile edge", type="BEVEL")
    modifier.width = width
    modifier.segments = segments
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


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


def add_character_eye(
    parts: list[bpy.types.Object],
    name: str,
    center: tuple[float, float, float],
    size: tuple[float, float],
    sclera: bpy.types.Material,
    iris: bpy.types.Material,
    pupil: bpy.types.Material,
    iris_scale: float = 0.58,
    pupil_scale: float = 0.47,
    rotation: float = 0.0,
) -> None:
    """Layer a readable, graphic eye on the forward-facing character plane."""
    x, y, z = center
    radius_x, radius_y = size
    add_face_ellipse(parts, f"{name}-sclera", (x, y, z), radius_x, radius_y,
                     sclera, 12, rotation)
    add_face_ellipse(parts, f"{name}-iris", (x, y, z + 0.002),
                     radius_x * iris_scale, radius_y * iris_scale, iris, 10, rotation)
    add_face_ellipse(parts, f"{name}-pupil", (x, y, z + 0.004),
                     radius_x * iris_scale * pupil_scale,
                     radius_y * iris_scale * pupil_scale, pupil, 10, rotation)
    add_face_ellipse(parts, f"{name}-highlight",
                     (x - radius_x * 0.18, y + radius_y * 0.24, z + 0.006),
                     radius_x * 0.13, radius_y * 0.13, sclera, 8)


def add_mitten_hand(
    parts: list[bpy.types.Object],
    name: str,
    center: tuple[float, float, float],
    mat: bpy.types.Material,
    size: float,
    facing: float,
) -> None:
    """A broad palm with two finger lobes, sized for the approved 2D silhouettes."""
    x, y, z = center
    add_sphere(parts, f"{name}-palm", (size, size * 1.12, size * 0.72), center, mat,
               segments=10, rings=5, smooth=True)
    add_sphere(parts, f"{name}-outer-finger", (size * 0.34, size * 0.58, size * 0.40),
               (x + facing * size * 0.42, y - size * 0.28, z + size * 0.05), mat,
               segments=8, rings=4, smooth=True)


def build_cat_sleep(parts: list[bpy.types.Object]) -> None:
    orange = material("Cat orange", "#EE8732")
    stripe = material("Cat broad stripes", "#B95D27")
    inner = material("Cat ear inner", "#EFA08E")
    cream = material("Cat cream", "#F9DFC0")
    dark = material("Cat face", "#4B2E25")
    pink = material("Cat nose", "#B75C59")

    # A long feline curl, with the haunch distinct from the rib cage.
    add_sphere(parts, "curled-ribcage", (0.58, 0.24, 0.42), (0.00, 0.13, -0.02), orange,
               segments=16, rings=8, smooth=True)
    add_sphere(parts, "rounded-haunch", (0.32, 0.25, 0.36), (-0.19, 0.145, -0.07), orange,
               segments=10, rings=5, smooth=True)
    add_sphere(parts, "resting-head", (0.35, 0.23, 0.27), (0.17, 0.205, 0.115), orange,
               segments=16, rings=8, smooth=True)
    cat_ear(parts, "left-ear", 0.095, 0.245, 0.35, 0.105, orange, inner,
            width=0.10, depth=0.075)
    cat_ear(parts, "right-ear", 0.245, 0.245, 0.35, 0.105, orange, inner,
            width=0.10, depth=0.075)
    for x in (0.09, 0.235):
        add_sphere(parts, f"front-paw-{x}", (0.135, 0.065, 0.17), (x, 0.033, 0.18),
                   cream, segments=10, rings=5, smooth=True)

    # The cheeks sit proud of the face, avoiding the mask-like black shapes of v1.
    add_sphere(parts, "left-cheek", (0.15, 0.075, 0.040), (0.135, 0.19, 0.252), cream,
               segments=10, rings=5, smooth=True)
    add_sphere(parts, "right-cheek", (0.15, 0.075, 0.040), (0.215, 0.19, 0.252), cream,
               segments=10, rings=5, smooth=True)
    add_arc_band(parts, "closed-eye-left", (0.105, 0.235, 0.274), 0.038, 0.009,
                 0, math.pi, dark, 4)
    add_arc_band(parts, "closed-eye-right", (0.235, 0.235, 0.274), 0.038, 0.009,
                 0, math.pi, dark, 4)
    add_mesh(parts, "nose", [(0.155, 0.202, 0.278), (0.185, 0.202, 0.278),
                              (0.170, 0.182, 0.278)], [(0, 1, 2)], pink)
    add_arc_band(parts, "sleeping-smile", (0.170, 0.174, 0.279), 0.035, 0.008,
                 math.pi, 2 * math.pi, dark, 3)

    # Tail wraps around the body and remains clearly striped from the front camera.
    tail_points = [(-0.22, 0.15, -0.14), (-0.33, 0.13, -0.05),
                   (-0.32, 0.09, 0.10), (-0.23, 0.075, 0.21),
                   (-0.09, 0.065, 0.235)]
    tail_mats = [stripe, orange, stripe, cream]
    for index in range(len(tail_points) - 1):
        add_tapered_segment(parts, f"curled-tail-{index}", tail_points[index],
                            tail_points[index + 1], 0.052 - index * 0.006,
                            0.047 - index * 0.006, tail_mats[index], 8, smooth=True)
    add_mesh(parts, "sleep-stripe-a",
             [(-0.17, 0.235, 0.205), (-0.08, 0.25, 0.205), (-0.12, 0.15, 0.215)],
             [(0, 1, 2)], stripe)
    add_mesh(parts, "sleep-stripe-b",
             [(-0.01, 0.25, 0.205), (0.08, 0.235, 0.205), (0.03, 0.15, 0.215)],
             [(0, 1, 2)], stripe)


def build_cat_stand(parts: list[bpy.types.Object]) -> None:
    orange = material("Cat orange", "#EE8732")
    stripe = material("Cat broad stripes", "#B95D27")
    inner = material("Cat ear inner", "#EFA08E")
    cream = material("Cat cream", "#F9DFC0")
    dark = material("Cat face", "#38271F")
    iris = material("Cat green iris", "#829640")
    pink = material("Cat nose", "#B75C59")

    add_sphere(parts, "feline-ribcage", (0.40, 0.29, 0.34), (0, 0.265, -0.055), orange,
               segments=14, rings=7, smooth=True)
    add_sphere(parts, "feline-head", (0.45, 0.27, 0.29), (0, 0.445, 0.075), orange,
               segments=16, rings=8, smooth=True)
    add_sphere(parts, "left-cheek", (0.17, 0.09, 0.045), (-0.055, 0.405, 0.226), cream,
               segments=10, rings=5, smooth=True)
    add_sphere(parts, "right-cheek", (0.17, 0.09, 0.045), (0.055, 0.405, 0.226), cream,
               segments=10, rings=5, smooth=True)
    add_sphere(parts, "chest-ruff", (0.20, 0.24, 0.035), (0, 0.265, 0.122), cream,
               segments=10, rings=5, smooth=True)

    for x in (-0.12, 0.12):
        add_tapered_segment(parts, f"front-leg-{x}", (x, 0.055, 0.105),
                            (x, 0.285, 0.085), 0.062, 0.052, orange, 8, smooth=True)
        add_vertical_elliptic_cylinder(parts, f"front-leg-stripe-{x}", 0.132, 0.132,
                                       0.028, (x, 0.17, 0.098), stripe, 8, smooth=True)
        add_sphere(parts, f"front-paw-{x}", (0.145, 0.07, 0.17), (x, 0.035, 0.135),
                   cream, segments=10, rings=5, smooth=True)
    for x in (-0.13, 0.13):
        add_tapered_segment(parts, f"hind-leg-{x}", (x, 0.055, -0.13),
                            (x, 0.22, -0.12), 0.066, 0.055, orange, 8, smooth=True)
        add_sphere(parts, f"hind-paw-{x}", (0.15, 0.07, 0.16), (x, 0.035, -0.14),
                   orange, segments=10, rings=5, smooth=True)
    cat_ear(parts, "left-ear", -0.12, 0.505, 0.60, 0.055, orange, inner,
            width=0.15, depth=0.09)
    cat_ear(parts, "right-ear", 0.12, 0.505, 0.60, 0.055, orange, inner,
            width=0.15, depth=0.09)

    tail_points = [(-0.16, 0.25, -0.15), (-0.29, 0.34, -0.11),
                   (-0.34, 0.47, -0.05), (-0.31, 0.56, 0.01),
                   (-0.26, 0.59, 0.055)]
    tail_mats = [orange, stripe, orange, cream]
    for index in range(len(tail_points) - 1):
        add_tapered_segment(parts, f"upright-tail-{index}", tail_points[index],
                            tail_points[index + 1], 0.052 - index * 0.005,
                            0.047 - index * 0.005, tail_mats[index], 8, smooth=True)

    for side, x in (("left", -0.09), ("right", 0.09)):
        add_character_eye(parts, f"{side}-eye", (x, 0.475, 0.224), (0.052, 0.066),
                          cream, iris, dark, iris_scale=0.63, pupil_scale=0.58)
        add_arc_band(parts, f"{side}-upper-lid", (x, 0.475, 0.231), 0.055, 0.008,
                     0.12 * math.pi, 0.88 * math.pi, dark, 4)
    add_mesh(parts, "nose", [(-0.020, 0.420, 0.244), (0.020, 0.420, 0.244),
                              (0, 0.394, 0.244)], [(0, 1, 2)], pink)
    add_arc_band(parts, "left-smile", (-0.027, 0.385, 0.245), 0.035, 0.008,
                 math.pi, 2 * math.pi, dark, 3)
    add_arc_band(parts, "right-smile", (0.027, 0.385, 0.245), 0.035, 0.008,
                 math.pi, 2 * math.pi, dark, 3)
    add_mesh(parts, "forehead-stripe", [(-0.045, 0.555, 0.205), (0.045, 0.555, 0.205),
                                         (0, 0.485, 0.229)], [(0, 1, 2)], stripe)
    for index, x in enumerate((-0.16, 0.16)):
        add_mesh(parts, f"cheek-stripe-{index}",
                 [(x * 1.15, 0.445, 0.217), (x * 0.68, 0.430, 0.235),
                  (x * 0.90, 0.390, 0.235)], [(0, 1, 2)], stripe)


def build_partner(parts: list[bpy.types.Object]) -> None:
    blue = material("Piko blue", "#36B5D1")
    blue_shadow = material("Piko blue shadow", "#2795B5")
    white = material("Piko belly", "#F5F1DE")
    dark = material("Piko eyes", "#2A211C")
    yellow = material("Piko lamp", "#F5AB2C")

    add_profiled_body(parts, "slender-torso",
                      [(0.16, 0.075, 0.070), (0.28, 0.115, 0.095),
                       (0.40, 0.105, 0.085), (0.43, 0.080, 0.070)],
                      blue, segments=10, smooth=True)
    add_sphere(parts, "piko-head", (0.37, 0.22, 0.42), (0, 0.535, 0.020), blue,
               segments=16, rings=8, smooth=True)
    for x in (-0.075, 0.075):
        add_tapered_segment(parts, f"leg-{x}", (x, 0.075, 0), (x, 0.225, 0),
                            0.043, 0.035, blue, 8, smooth=True)
        add_sphere(parts, f"foot-{x}", (0.19, 0.075, 0.235),
                   (x + (-0.018 if x < 0 else 0.018), 0.038, 0.035), blue_shadow,
                   segments=10, rings=5, smooth=True)

    # One relaxed arm and one characteristic explaining gesture.
    add_tapered_segment(parts, "left-upper-arm", (-0.10, 0.39, 0), (-0.21, 0.27, 0.035),
                        0.038, 0.030, blue, 8, smooth=True)
    add_tapered_segment(parts, "left-forearm", (-0.21, 0.27, 0.035), (-0.245, 0.17, 0.065),
                        0.030, 0.025, blue, 8, smooth=True)
    add_mitten_hand(parts, "left-hand", (-0.25, 0.145, 0.07), blue, 0.075, -1)
    add_tapered_segment(parts, "right-upper-arm", (0.10, 0.39, 0), (0.205, 0.30, 0.035),
                        0.038, 0.030, blue, 8, smooth=True)
    add_tapered_segment(parts, "right-forearm", (0.205, 0.30, 0.035), (0.235, 0.42, 0.070),
                        0.030, 0.025, blue, 8, smooth=True)
    add_sphere(parts, "right-palm", (0.078, 0.085, 0.060), (0.235, 0.445, 0.073), blue,
               segments=10, rings=5, smooth=True)
    add_tapered_segment(parts, "raised-index", (0.246, 0.455, 0.075),
                        (0.246, 0.545, 0.078), 0.018, 0.014, blue, 8, smooth=True)

    add_sphere(parts, "belly-panel", (0.17, 0.245, 0.030), (0, 0.285, 0.103), white,
               segments=10, rings=5, smooth=True)
    for side, x in (("left", -0.082), ("right", 0.082)):
        add_character_eye(parts, f"{side}-eye", (x, 0.555, 0.233), (0.047, 0.060),
                          white, dark, dark, iris_scale=0.58, pupil_scale=0.82)
        add_arc_band(parts, f"{side}-brow", (x, 0.567, 0.241), 0.056, 0.007,
                     0.18 * math.pi, 0.82 * math.pi, dark, 4)
    add_mesh(parts, "small-nose", [(-0.016, 0.518, 0.241), (0.016, 0.518, 0.241),
                                    (0, 0.502, 0.242)], [(0, 1, 2)], blue_shadow)
    add_arc_band(parts, "friendly-smile", (0, 0.492, 0.242), 0.048, 0.007,
                 math.pi, 2 * math.pi, dark, 6)

    add_tapered_segment(parts, "lamp-stalk-a", (0, 0.63, 0), (-0.025, 0.655, 0.015),
                        0.022, 0.019, blue, 8, smooth=True)
    add_tapered_segment(parts, "lamp-stalk-b", (-0.025, 0.655, 0.015),
                        (-0.010, 0.670, 0.040), 0.019, 0.016, blue, 8, smooth=True)
    add_disc_xy(parts, "exploration-lamp", (-0.010, 0.665, 0.055), 0.035, 0.030,
                yellow, vertices_count=12)
    add_face_ellipse(parts, "lamp-glow", (-0.010, 0.665, 0.072), 0.020, 0.020, white, 10)


def build_amanojaku(parts: list[bpy.types.Object]) -> None:
    body = material("Sakasa lavender skin", "#A995DB")
    purple = material("Sakasa deep purple", "#59337F")
    purple_light = material("Sakasa hair", "#72459A")
    yellow = material("Sakasa gold", "#F4AA2A")
    white = material("Sakasa eye whites", "#FFF2D7")
    dark = material("Sakasa face", "#2C2035")

    # Long legs and narrow torso restore the controlled, non-toddler silhouette.
    for x in (-0.105, 0.105):
        add_tapered_segment(parts, f"leg-{x}", (x, 0.14, 0), (x, 0.66, 0),
                            0.048, 0.042, body, 8, smooth=True)
        add_sphere(parts, f"shoe-{x}", (0.26, 0.14, 0.34),
                   (x + (-0.025 if x < 0 else 0.025), 0.07, 0.055), purple,
                   segments=10, rings=5, smooth=True)
        add_vertical_cylinder(parts, f"ankle-cuff-{x}", 0.080, 0.075,
                              (x, 0.17, 0), purple, vertices=10, smooth=True)
    add_profiled_body(parts, "slender-body",
                      [(0.58, 0.105, 0.085), (0.70, 0.135, 0.105),
                       (0.86, 0.145, 0.115), (0.92, 0.115, 0.095)],
                      body, segments=10, smooth=True)

    # Cape sits behind the body; mantle and sash remain readable from the front.
    cape = add_extruded_profile(parts, "cape-back",
                                [(-0.265, 0.88), (-0.22, 0.57), (0, 0.48),
                                 (0.22, 0.57), (0.265, 0.88)], -0.28, -0.08, purple)
    bevel_object(cape, 0.018, 2)
    add_vertical_elliptic_cylinder(parts, "shoulder-mantle", 0.52, 0.40, 0.085,
                                   (0, 0.875, 0), purple, 10, smooth=True)
    add_mesh(parts, "gold-sash",
             [(-0.20, 0.84, 0.155), (0.19, 0.78, 0.155),
              (0.14, 0.66, 0.155), (-0.10, 0.72, 0.155)],
             [(0, 1, 2, 3)], yellow)

    add_sphere(parts, "sakasa-head", (0.43, 0.29, 0.36), (0, 1.005, 0.025), body,
               segments=16, rings=8, smooth=True)
    hair_profiles = {
        "left-hair-upper": [(-0.16, 1.09), (-0.31, 1.00), (-0.24, 0.92), (-0.08, 1.01)],
        "left-hair-lower": [(-0.16, 1.01), (-0.29, 0.88), (-0.17, 0.86), (-0.07, 0.98)],
        "right-hair-upper": [(0.16, 1.09), (0.31, 1.00), (0.24, 0.92), (0.08, 1.01)],
        "right-hair-lower": [(0.16, 1.01), (0.29, 0.88), (0.17, 0.86), (0.07, 0.98)],
    }
    for name, profile in hair_profiles.items():
        lock = add_extruded_profile(parts, name, profile, -0.07, 0.125, purple_light)
        bevel_object(lock, 0.012, 2)

    add_tapered_segment(parts, "left-arm", (-0.15, 0.84, 0), (-0.35, 0.48, 0.055),
                        0.047, 0.035, body, 8, smooth=True)
    add_tapered_segment(parts, "right-arm", (0.15, 0.84, 0), (0.35, 0.48, 0.055),
                        0.047, 0.035, body, 8, smooth=True)
    add_vertical_elliptic_cylinder(parts, "left-wrist-cuff", 0.13, 0.12, 0.07,
                                   (-0.35, 0.50, 0.055), purple, 8, smooth=True)
    add_vertical_elliptic_cylinder(parts, "right-wrist-cuff", 0.13, 0.12, 0.07,
                                   (0.35, 0.50, 0.055), purple, 8, smooth=True)
    add_mitten_hand(parts, "left-hand", (-0.38, 0.40, 0.07), body, 0.105, -1)
    add_mitten_hand(parts, "right-hand", (0.38, 0.40, 0.07), body, 0.105, 1)

    # The hat is one continuous curved taper with material bands per path segment.
    hat_points = [(0, 1.105, 0), (0, 1.235, 0), (0.055, 1.35, 0),
                  (0.155, 1.375, 0), (0.255, 1.31, 0), (0.29, 1.22, 0)]
    hat_radii = [0.205, 0.175, 0.125, 0.09, 0.062, 0.035]
    hat_mats = [yellow, purple, yellow, purple, yellow]
    add_bent_tube(parts, "continuous-striped-hat", hat_points, hat_radii,
                  hat_mats, sides=10, smooth=True)
    add_sphere(parts, "hat-pom", (0.10, 0.10, 0.10), (0.30, 1.19, 0), yellow,
               segments=10, rings=5, smooth=True)

    for side, x, rotation in (("left", -0.09, -0.10), ("right", 0.09, 0.10)):
        add_character_eye(parts, f"{side}-eye", (x, 1.03, 0.208), (0.075, 0.050),
                          white, yellow, dark, iris_scale=0.48, pupil_scale=0.48,
                          rotation=rotation)
        add_arc_band(parts, f"{side}-upper-lid", (x, 1.03, 0.216), 0.074, 0.010,
                     0.10 * math.pi, 0.90 * math.pi, dark, 4)
    add_mesh(parts, "left-lash", [(-0.160, 1.055, 0.218), (-0.188, 1.070, 0.218),
                                   (-0.164, 1.045, 0.218)], [(0, 1, 2)], dark)
    add_mesh(parts, "right-lash", [(0.160, 1.055, 0.218), (0.188, 1.070, 0.218),
                                    (0.164, 1.045, 0.218)], [(0, 1, 2)], dark)
    add_mesh(parts, "left-brow", [(-0.15, 1.095, 0.217), (-0.04, 1.105, 0.217),
                                   (-0.04, 1.096, 0.218), (-0.145, 1.087, 0.218)],
             [(0, 1, 2, 3)], purple)
    add_mesh(parts, "right-brow", [(0.04, 1.105, 0.217), (0.15, 1.095, 0.217),
                                    (0.145, 1.087, 0.218), (0.04, 1.096, 0.218)],
             [(0, 1, 2, 3)], purple)
    add_mesh(parts, "small-nose", [(-0.018, 0.982, 0.216), (0.018, 0.982, 0.216),
                                    (0, 0.964, 0.217)], [(0, 1, 2)], purple_light)
    add_arc_band(parts, "mischievous-smile", (0, 0.948, 0.218), 0.060, 0.009,
                 math.pi, 2 * math.pi, dark, 4)
    add_face_ellipse(parts, "gold-clasp", (0, 0.865, 0.210), 0.055, 0.055, yellow, 12)
    add_face_ellipse(parts, "clasp-center", (0, 0.865, 0.213), 0.029, 0.029, purple, 10)
    for x in (-0.13, 0.13):
        add_mesh(parts, f"shoe-stripe-{x}",
                 [(x - 0.035, 0.025, 0.225), (x + 0.035, 0.025, 0.225),
                  (x + 0.015, 0.125, 0.225), (x - 0.015, 0.125, 0.225)],
                 [(0, 1, 2, 3)], yellow)


def build_passenger(parts: list[bpy.types.Object]) -> None:
    skin = material("Passenger skin", "#EFB484")
    blue = material("Passenger coat", "#275C9A")
    blue_dark = material("Passenger coat shadow", "#173F73")
    dark = material("Passenger face", "#30241E")
    hair = material("Passenger hair", "#623A25")
    white = material("Passenger collar", "#F5EDDD")
    brown = material("Passenger shoes", "#684327")
    gold = material("Passenger brass", "#E6A42C")
    charcoal = material("Passenger shorts", "#33343B")

    # Legs remain visible below a tailored coat, preserving the childlike four-head ratio.
    for x in (-0.105, 0.105):
        add_vertical_elliptic_cylinder(parts, f"sock-{x}", 0.105, 0.13, 0.29,
                                       (x, 0.32, 0), charcoal, 8, smooth=True)
        add_sphere(parts, f"shoe-{x}", (0.23, 0.14, 0.29),
                   (x + (-0.012 if x < 0 else 0.012), 0.07, 0.045), brown,
                   segments=10, rings=5, smooth=True)
        add_box(parts, f"shorts-leg-{x}", (0.15, 0.14, 0.16), (x, 0.51, 0), charcoal)

    add_profiled_body(parts, "tailored-coat",
                      [(0.47, 0.205, 0.125), (0.62, 0.225, 0.140),
                       (0.84, 0.185, 0.125), (1.08, 0.225, 0.145),
                       (1.15, 0.165, 0.115)], blue, segments=10, smooth=True)
    add_tapered_segment(parts, "left-sleeve", (-0.19, 1.08, 0), (-0.27, 0.64, 0.055),
                        0.055, 0.043, blue, 8, smooth=True)
    add_tapered_segment(parts, "right-sleeve", (0.19, 1.08, 0), (0.27, 0.64, 0.055),
                        0.055, 0.043, blue, 8, smooth=True)
    add_vertical_elliptic_cylinder(parts, "left-cuff", 0.12, 0.11, 0.075,
                                   (-0.27, 0.67, 0.055), blue_dark, 8, smooth=True)
    add_vertical_elliptic_cylinder(parts, "right-cuff", 0.12, 0.11, 0.075,
                                   (0.27, 0.67, 0.055), blue_dark, 8, smooth=True)
    add_mitten_hand(parts, "left-hand", (-0.285, 0.565, 0.07), skin, 0.095, -1)
    add_mitten_hand(parts, "right-hand", (0.285, 0.565, 0.07), skin, 0.095, 1)

    # Hair is a back shell plus separated side locks; the face is not a featureless sphere.
    add_sphere(parts, "hair-shell", (0.43, 0.31, 0.34), (0, 1.31, -0.025), hair,
               segments=16, rings=8, smooth=True)
    add_sphere(parts, "child-face", (0.37, 0.29, 0.30), (0, 1.315, 0.035), skin,
               segments=16, rings=8, smooth=True)
    add_sphere(parts, "left-ear", (0.075, 0.09, 0.055), (-0.195, 1.315, 0.035), skin,
               segments=8, rings=4, smooth=True)
    add_sphere(parts, "right-ear", (0.075, 0.09, 0.055), (0.195, 1.315, 0.035), skin,
               segments=8, rings=4, smooth=True)
    for x in (-0.185, 0.185):
        lock = add_extruded_profile(parts, f"side-hair-{x}",
                                    [(x - 0.055, 1.36), (x + 0.045, 1.36),
                                     (x + 0.065, 1.20), (x, 1.16), (x - 0.06, 1.23)],
                                    -0.08, 0.08, hair)
        bevel_object(lock, 0.010, 2)
    add_mesh(parts, "front-fringe",
             [(-0.14, 1.43, 0.172), (0.13, 1.43, 0.172),
              (0.07, 1.36, 0.184), (0.01, 1.405, 0.184),
              (-0.04, 1.35, 0.184), (-0.09, 1.40, 0.184)],
             [(0, 1, 2, 3, 4, 5)], hair)

    add_sphere(parts, "cap-crown", (0.45, 0.17, 0.34), (0, 1.515, -0.005), blue,
               segments=14, rings=7, smooth=True)
    add_beveled_box(parts, "cap-band", (0.43, 0.055, 0.32), (0, 1.465, 0.00),
                    blue_dark, bevel=0.014, smooth=True)
    add_beveled_box(parts, "cap-brim", (0.44, 0.042, 0.36), (0, 1.445, 0.075),
                    blue, bevel=0.014, smooth=True)
    add_face_ellipse(parts, "cap-badge", (0.17, 1.505, 0.179), 0.030, 0.030, gold, 10)

    for side, x in (("left", -0.082), ("right", 0.082)):
        add_character_eye(parts, f"{side}-eye", (x, 1.335, 0.189), (0.042, 0.052),
                          white, dark, dark, iris_scale=0.55, pupil_scale=0.82)
        add_arc_band(parts, f"{side}-upper-lid", (x, 1.335, 0.197), 0.049, 0.008,
                     0.12 * math.pi, 0.88 * math.pi, dark, 4)
    add_mesh(parts, "left-eyebrow", [(-0.13, 1.395, 0.200), (-0.045, 1.405, 0.200),
                                      (-0.046, 1.396, 0.201), (-0.127, 1.387, 0.201)],
             [(0, 1, 2, 3)], hair)
    add_mesh(parts, "right-eyebrow", [(0.045, 1.405, 0.200), (0.13, 1.395, 0.200),
                                       (0.127, 1.387, 0.201), (0.046, 1.396, 0.201)],
             [(0, 1, 2, 3)], hair)
    add_mesh(parts, "nose", [(-0.015, 1.292, 0.196), (0.015, 1.292, 0.196),
                              (0, 1.278, 0.197)], [(0, 1, 2)], skin)
    add_arc_band(parts, "smile", (0, 1.262, 0.198), 0.050, 0.008,
                 math.pi, 2 * math.pi, dark, 4)
    add_mesh(parts, "left-lapel", [(-0.19, 1.10, 0.150), (-0.025, 0.94, 0.154),
                                    (0, 1.07, 0.154), (-0.09, 1.14, 0.150)],
             [(0, 1, 2, 3)], blue_dark)
    add_mesh(parts, "right-lapel", [(0.19, 1.10, 0.150), (0.025, 0.94, 0.154),
                                     (0, 1.07, 0.154), (0.09, 1.14, 0.150)],
             [(0, 1, 2, 3)], blue_dark)
    add_mesh(parts, "shirt-collar", [(-0.10, 1.11, 0.157), (0, 1.00, 0.160),
                                      (0.10, 1.11, 0.157)], [(0, 1, 2)], white)
    for index, y in enumerate((0.91, 0.78, 0.65)):
        add_face_ellipse(parts, f"coat-button-{index}", (0.06, y, 0.151),
                         0.025, 0.025, gold, 10)


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
        (0.66, 0.57, 0.47, 1.0) if is_character else (0.72, 0.72, 0.72, 1.0)
    )
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.32 if is_character else 0.45

    width = maximum[0] - minimum[0]
    height = maximum[1] - minimum[1]
    depth = maximum[2] - minimum[2]
    center = ((minimum[0] + maximum[0]) / 2, (minimum[1] + maximum[1]) / 2,
              (minimum[2] + maximum[2]) / 2)
    span = max(width, height, depth)
    ground_size = max(width, depth, 1.0) * 2.8
    ground_mat = material("Preview ground", "#DED5C8" if is_character else "#D8D8D4")
    bpy.ops.mesh.primitive_plane_add(size=ground_size, location=(center[0], -center[2], -0.012))
    bpy.context.object.data.materials.append(ground_mat)

    target_height = max(height * (0.48 if is_character else 0.42), center[1] * 0.8)
    target = Vector(to_blender((center[0], target_height, center[2])))
    camera_location = target + Vector((span * (0.55 if is_character else 1.15),
                                       -span * (2.60 if is_character else 1.90),
                                       span * (0.18 if is_character else 1.00)))
    bpy.ops.object.camera_add(location=camera_location)
    camera = bpy.context.object
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    if is_character:
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = span * 1.30
    else:
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
