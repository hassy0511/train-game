from __future__ import annotations

from pathlib import Path
import json
import math

import bpy
from mathutils import Vector

from town_common import ASSET_SPECS, MODEL_DIR, PREVIEW_DIR


CHARACTER_NAMES = {"cat-sleep", "cat-stand", "partner", "amanojaku", "passenger"}
_materials: dict[tuple[str, str], bpy.types.Material] = {}


def srgb_channel(value: int) -> float:
    channel = value / 255.0
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def material(name: str, hex_color: str, roughness: float = 0.72) -> bpy.types.Material:
    key = (name, hex_color)
    if key in _materials:
        return _materials[key]
    rgb = tuple(srgb_channel(int(hex_color[index:index + 2], 16)) for index in (1, 3, 5))
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    value.use_backface_culling = True
    shader = value.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (*rgb, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    value.diffuse_color = (*rgb, 1.0)
    _materials[key] = value
    return value


def to_blender(point: tuple[float, float, float]) -> tuple[float, float, float]:
    x, y, z = point
    return (x, -z, y)


def finish_primitive(obj: bpy.types.Object, mat: bpy.types.Material, smooth: bool = True) -> bpy.types.Object:
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = smooth
    return obj


def add_ellipsoid(
    parts: list[bpy.types.Object],
    name: str,
    size: tuple[float, float, float],
    center: tuple[float, float, float],
    mat: bpy.types.Material,
    segments: int = 20,
    rings: int = 10,
    smooth: bool = True,
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


def add_profiled_volume(
    parts: list[bpy.types.Object],
    name: str,
    rings: list[tuple[float, float, float, float, float]],
    mat: bpy.types.Material,
    segments: int = 20,
    smooth: bool = True,
) -> bpy.types.Object:
    """Build horizontal ellipse rings: (y, radius_x, radius_z, center_x, center_z)."""
    vertices: list[tuple[float, float, float]] = []
    for y, radius_x, radius_z, center_x, center_z in rings:
        for index in range(segments):
            angle = 2 * math.pi * index / segments
            vertices.append((
                center_x + math.cos(angle) * radius_x,
                y,
                center_z + math.sin(angle) * radius_z,
            ))
    faces: list[tuple[int, ...]] = [tuple(range(segments - 1, -1, -1))]
    for ring_index in range(len(rings) - 1):
        first = ring_index * segments
        second = (ring_index + 1) * segments
        for index in range(segments):
            nxt = (index + 1) % segments
            # Ring vertices advance from +X toward +Z.  Connecting upward in
            # this order keeps side normals facing out; the reverse order made
            # GLB front faces disappear under back-face culling.
            faces.append((first + index, second + index, second + nxt, first + nxt))
    final = (len(rings) - 1) * segments
    faces.append(tuple(final + index for index in range(segments)))
    return add_mesh(parts, name, vertices, faces, [mat], smooth=smooth)


def add_mesh(
    parts: list[bpy.types.Object],
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    materials: list[bpy.types.Material],
    material_indices: list[int] | None = None,
    smooth: bool = False,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([to_blender(point) for point in vertices], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for mat in materials:
        mesh.materials.append(mat)
    for index, polygon in enumerate(mesh.polygons):
        polygon.use_smooth = smooth
        if material_indices and index < len(material_indices):
            polygon.material_index = material_indices[index]
    parts.append(obj)
    return obj


def fuse_skin_parts(
    skin_parts: list[bpy.types.Object],
    name: str,
    voxel_size: float,
    target_triangles: int,
) -> bpy.types.Object:
    """Fuse overlapping anatomical forms into one continuous watertight skin."""
    if not skin_parts:
        raise ValueError(f"{name}: no skin parts to fuse")
    for part in skin_parts:
        bpy.ops.object.select_all(action="DESELECT")
        part.select_set(True)
        bpy.context.view_layer.objects.active = part
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    bpy.ops.object.select_all(action="DESELECT")
    for part in skin_parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = skin_parts[0]
    bpy.ops.object.join()
    skin = bpy.context.object
    skin.name = name
    skin.data.name = name

    remesh = skin.modifiers.new(name="Seamless anatomical union", type="REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = voxel_size
    remesh.adaptivity = 0.0
    remesh.use_smooth_shade = True
    remesh.use_remove_disconnected = True
    bpy.ops.object.modifier_apply(modifier=remesh.name)

    smooth = skin.modifiers.new(name="Continuous joint transitions", type="SMOOTH")
    smooth.factor = 0.22
    smooth.iterations = 2
    bpy.ops.object.modifier_apply(modifier=smooth.name)

    skin.data.calc_loop_triangles()
    triangle_count = len(skin.data.loop_triangles)
    if triangle_count > target_triangles:
        decimate = skin.modifiers.new(name="Character surface budget", type="DECIMATE")
        decimate.decimate_type = "COLLAPSE"
        decimate.ratio = target_triangles / triangle_count
        decimate.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=decimate.name)
    for polygon in skin.data.polygons:
        polygon.use_smooth = True
    return skin


def bevel_object(obj: bpy.types.Object, width: float, segments: int = 2, smooth: bool = True) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new(name="Controlled edge softness", type="BEVEL")
    modifier.width = width
    modifier.segments = segments
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = smooth
    return obj


def add_beveled_prism(
    parts: list[bpy.types.Object],
    name: str,
    profile: list[tuple[float, float]],
    z_min: float,
    z_max: float,
    mat: bpy.types.Material,
    bevel: float,
    smooth: bool = True,
) -> bpy.types.Object:
    count = len(profile)
    vertices = [(x, y, z_min) for x, y in profile] + [(x, y, z_max) for x, y in profile]
    faces: list[tuple[int, ...]] = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    obj = add_mesh(parts, name, vertices, faces, [mat])
    return bevel_object(obj, bevel, 2, smooth)


def add_tapered_segment(
    parts: list[bpy.types.Object],
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius_start: float,
    radius_end: float,
    mat: bpy.types.Material,
    vertices: int = 12,
) -> bpy.types.Object:
    start_b = Vector(to_blender(start))
    end_b = Vector(to_blender(end))
    direction = end_b - start_b
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius_start,
        radius2=radius_end,
        depth=direction.length,
        location=(start_b + end_b) / 2.0,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    finish_primitive(obj, mat, True)
    parts.append(obj)
    return obj


def add_swept_tube(
    parts: list[bpy.types.Object],
    name: str,
    points: list[tuple[float, float, float]],
    radii: list[float],
    segment_materials: list[bpy.types.Material],
    sides: int = 12,
) -> bpy.types.Object:
    if len(points) != len(radii) or len(segment_materials) != len(points) - 1:
        raise ValueError(f"{name}: incompatible path data")
    vectors = [Vector(point) for point in points]
    vertices: list[tuple[float, float, float]] = []
    for index, center in enumerate(vectors):
        previous = vectors[max(index - 1, 0)]
        following = vectors[min(index + 1, len(vectors) - 1)]
        tangent = (following - previous).normalized()
        reference = Vector((0, 0, 1)) if abs(tangent.z) < 0.9 else Vector((1, 0, 0))
        normal = tangent.cross(reference).normalized()
        binormal = tangent.cross(normal).normalized()
        for side in range(sides):
            angle = 2 * math.pi * side / sides
            point = center + normal * (math.cos(angle) * radii[index])
            point += binormal * (math.sin(angle) * radii[index])
            vertices.append(tuple(point))
    faces: list[tuple[int, ...]] = [tuple(range(sides - 1, -1, -1))]
    material_indices = [0]
    for segment in range(len(points) - 1):
        first = segment * sides
        second = (segment + 1) * sides
        for side in range(sides):
            nxt = (side + 1) % sides
            faces.append((first + side, first + nxt, second + nxt, second + side))
            material_indices.append(segment)
    last = (len(points) - 1) * sides
    faces.append(tuple(last + side for side in range(sides)))
    material_indices.append(len(segment_materials) - 1)
    return add_mesh(parts, name, vertices, faces, segment_materials,
                    material_indices=material_indices, smooth=True)


def add_arc_tube(
    parts: list[bpy.types.Object],
    name: str,
    center: tuple[float, float, float],
    radius_x: float,
    radius_y: float,
    start_angle: float,
    end_angle: float,
    thickness: float,
    mat: bpy.types.Material,
    samples: int = 9,
) -> bpy.types.Object:
    cx, cy, cz = center
    points = [
        (cx + math.cos(start_angle + (end_angle - start_angle) * i / (samples - 1)) * radius_x,
         cy + math.sin(start_angle + (end_angle - start_angle) * i / (samples - 1)) * radius_y,
         cz)
        for i in range(samples)
    ]
    return add_swept_tube(parts, name, points, [thickness] * samples, [mat] * (samples - 1), 6)


def add_face_ellipse(
    parts: list[bpy.types.Object],
    name: str,
    center: tuple[float, float, float],
    size: tuple[float, float],
    mat: bpy.types.Material,
    yaw: float = 0.0,
    normal_offset: float = 0.0,
    segments: int = 20,
) -> bpy.types.Object:
    """Create a graphic ellipse tangent to the face instead of a protruding eyeball."""
    center_v = Vector(center)
    horizontal = Vector((math.cos(yaw), 0.0, -math.sin(yaw)))
    vertical = Vector((0.0, 1.0, 0.0))
    normal = horizontal.cross(vertical).normalized()
    center_v += normal * normal_offset
    width, height = size
    vertices = []
    for index in range(segments):
        angle = 2.0 * math.pi * index / segments
        point = (
            center_v
            + horizontal * (math.cos(angle) * width * 0.5)
            + vertical * (math.sin(angle) * height * 0.5)
        )
        vertices.append(tuple(point))
    return add_mesh(parts, name, vertices, [tuple(range(segments))], [mat], smooth=False)


def add_face_arc(
    parts: list[bpy.types.Object],
    name: str,
    center: tuple[float, float, float],
    radius_x: float,
    radius_y: float,
    start_angle: float,
    end_angle: float,
    thickness: float,
    mat: bpy.types.Material,
    yaw: float = 0.0,
    normal_offset: float = 0.0,
    samples: int = 11,
) -> bpy.types.Object:
    """Create a thin facial ribbon so profile views do not expose tube ends."""
    center_v = Vector(center)
    horizontal = Vector((math.cos(yaw), 0.0, -math.sin(yaw)))
    vertical = Vector((0.0, 1.0, 0.0))
    normal = horizontal.cross(vertical).normalized()
    center_v += normal * normal_offset
    outer: list[tuple[float, float, float]] = []
    inner: list[tuple[float, float, float]] = []
    for index in range(samples):
        angle = start_angle + (end_angle - start_angle) * index / (samples - 1)
        outer_point = (
            center_v
            + horizontal * (math.cos(angle) * (radius_x + thickness * 0.5))
            + vertical * (math.sin(angle) * (radius_y + thickness * 0.5))
        )
        inner_point = (
            center_v
            + horizontal * (math.cos(angle) * (radius_x - thickness * 0.5))
            + vertical * (math.sin(angle) * (radius_y - thickness * 0.5))
        )
        outer.append(tuple(outer_point))
        inner.append(tuple(inner_point))
    vertices = outer + inner
    faces = [(index, index + 1, samples + index + 1, samples + index)
             for index in range(samples - 1)]
    return add_mesh(parts, name, vertices, faces, [mat], smooth=False)


def add_front_torus(
    parts: list[bpy.types.Object],
    name: str,
    center: tuple[float, float, float],
    major_radius: float,
    minor_radius: float,
    mat: bpy.types.Material,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=24,
        minor_segments=8,
        location=to_blender(center),
        rotation=(math.pi / 2, 0, 0),
    )
    obj = bpy.context.object
    obj.name = name
    finish_primitive(obj, mat, True)
    parts.append(obj)
    return obj


def add_vertical_torus(
    parts: list[bpy.types.Object],
    name: str,
    center: tuple[float, float, float],
    major_radius: float,
    minor_radius: float,
    mat: bpy.types.Material,
) -> bpy.types.Object:
    """Ring around the exported +Y body axis, for boot and sleeve cuffs."""
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=20,
        minor_segments=6,
        location=to_blender(center),
    )
    obj = bpy.context.object
    obj.name = name
    finish_primitive(obj, mat, True)
    parts.append(obj)
    return obj


def add_eye(
    parts: list[bpy.types.Object],
    name: str,
    center: tuple[float, float, float],
    size: tuple[float, float],
    sclera: bpy.types.Material,
    iris: bpy.types.Material,
    pupil: bpy.types.Material,
    highlight: bpy.types.Material,
    iris_ratio: tuple[float, float] = (0.52, 0.72),
    pupil_ratio: tuple[float, float] = (0.48, 0.62),
    look_x: float = 0.0,
) -> None:
    x, y, z = center
    width, height = size
    # Facial detail is kept as shallow relief.  Earlier versions stacked deep
    # ellipsoids, which looked acceptable from the front but floated off the face
    # in profile.
    add_ellipsoid(parts, f"{name}-white", (width, height, 0.014), (x, y, z), sclera,
                  16, 8, True)
    iris_center = (x + look_x, y, z + 0.007)
    add_ellipsoid(parts, f"{name}-iris", (width * iris_ratio[0], height * iris_ratio[1], 0.010),
                  iris_center, iris, 14, 7, True)
    add_ellipsoid(parts, f"{name}-pupil",
                  (width * iris_ratio[0] * pupil_ratio[0],
                   height * iris_ratio[1] * pupil_ratio[1], 0.008),
                  (iris_center[0], iris_center[1], z + 0.013), pupil, 12, 6, True)
    add_ellipsoid(parts, f"{name}-highlight", (width * 0.10, height * 0.10, 0.006),
                  (iris_center[0] - width * 0.08, y + height * 0.15, z + 0.018),
                  highlight, 10, 5, True)


def add_almond_eye(
    parts: list[bpy.types.Object],
    name: str,
    center: tuple[float, float, float],
    size: tuple[float, float],
    sclera: bpy.types.Material,
    iris: bpy.types.Material,
    pupil: bpy.types.Material,
    highlight: bpy.types.Material,
    look_x: float = 0.0,
    slant: float = 0.0,
) -> None:
    x, y, z = center
    width, height = size
    profile = [
        (x - width * 0.50, y - slant),
        (x - width * 0.18, y + height * 0.48),
        (x + width * 0.16, y + height * 0.46),
        (x + width * 0.50, y + slant),
        (x + width * 0.16, y - height * 0.46),
        (x - width * 0.18, y - height * 0.48),
    ]
    add_beveled_prism(parts, f"{name}-white", profile, z - 0.005, z + 0.005,
                      sclera, 0.004, True)
    iris_x = x + look_x
    add_ellipsoid(parts, f"{name}-iris", (width * 0.38, height * 0.78, 0.009),
                  (iris_x, y, z + 0.009), iris, 14, 7, True)
    add_ellipsoid(parts, f"{name}-pupil", (width * 0.16, height * 0.58, 0.007),
                  (iris_x, y, z + 0.014), pupil, 12, 6, True)
    add_ellipsoid(parts, f"{name}-highlight", (width * 0.075, height * 0.10, 0.005),
                  (iris_x - width * 0.045, y + height * 0.18, z + 0.018),
                  highlight, 10, 5, True)


def add_mitten(
    parts: list[bpy.types.Object],
    name: str,
    center: tuple[float, float, float],
    mat: bpy.types.Material,
    width: float,
    height: float,
    facing: int,
) -> None:
    x, y, z = center
    add_ellipsoid(parts, f"{name}-palm", (width, height, width * 0.72), center, mat, 16, 8, True)
    add_ellipsoid(parts, f"{name}-thumb", (width * 0.34, height * 0.52, width * 0.36),
                  (x + facing * width * 0.43, y - height * 0.12, z + width * 0.08),
                  mat, 12, 6, True)


def add_fingered_hand(
    parts: list[bpy.types.Object],
    name: str,
    center: tuple[float, float, float],
    mat: bpy.types.Material,
    width: float,
    height: float,
    facing: int,
) -> None:
    """Readable three-finger hand that remains practical at game scale."""
    x, y, z = center
    palm_y = y + height * 0.12
    add_ellipsoid(parts, f"{name}-palm", (width * 0.72, height * 0.58, width * 0.52),
                  (x, palm_y, z), mat, 14, 7, True)
    for index, offset in enumerate((-0.24, 0.0, 0.24)):
        finger_x = x + width * offset
        end_x = finger_x + width * offset * 0.20
        add_tapered_segment(
            parts, f"{name}-finger-{index}",
            (finger_x, y + height * 0.02, z + width * 0.03),
            (end_x, y - height * 0.36, z + width * 0.06),
            width * 0.115, width * 0.095, mat, 9,
        )
        add_ellipsoid(parts, f"{name}-finger-tip-{index}",
                      (width * 0.20, width * 0.21, width * 0.19),
                      (end_x, y - height * 0.39, z + width * 0.06),
                      mat, 10, 5, True)
    add_ellipsoid(parts, f"{name}-thumb", (width * 0.28, height * 0.42, width * 0.28),
                  (x + facing * width * 0.38, y + height * 0.02, z + width * 0.04),
                  mat, 12, 6, True)


def add_cat_ear(
    parts: list[bpy.types.Object],
    name: str,
    x: float,
    base_y: float,
    tip_y: float,
    center_z: float,
    outer: bpy.types.Material,
    inner: bpy.types.Material,
    width: float,
) -> None:
    profile = [(x - width / 2, base_y), (x + width / 2, base_y), (x, tip_y)]
    add_beveled_prism(parts, name, profile, center_z - 0.055, center_z + 0.055,
                      outer, 0.012, True)
    inset = [(x - width * 0.25, base_y + 0.018), (x + width * 0.25, base_y + 0.018),
             (x, tip_y - 0.035)]
    add_beveled_prism(parts, f"{name}-inner", inset, center_z + 0.058, center_z + 0.070,
                      inner, 0.005, True)


def add_cat_face(
    parts: list[bpy.types.Object],
    center: tuple[float, float, float],
    scale: float,
    cream: bpy.types.Material,
    iris: bpy.types.Material,
    dark: bpy.types.Material,
    pink: bpy.types.Material,
    closed: bool = False,
) -> None:
    cx, cy, front = center
    add_ellipsoid(parts, "left-muzzle", (0.16 * scale, 0.095 * scale, 0.034 * scale),
                  (cx - 0.045 * scale, cy - 0.055 * scale, front), cream, 16, 8, True)
    add_ellipsoid(parts, "right-muzzle", (0.16 * scale, 0.095 * scale, 0.034 * scale),
                  (cx + 0.045 * scale, cy - 0.055 * scale, front), cream, 16, 8, True)
    if closed:
        for side, x in (("left", cx - 0.085 * scale), ("right", cx + 0.085 * scale)):
            add_arc_tube(parts, f"{side}-closed-eye", (x, cy + 0.035 * scale, front + 0.024 * scale),
                         0.045 * scale, 0.025 * scale, 0.08 * math.pi, 0.92 * math.pi,
                         0.006 * scale, dark, 8)
    else:
        white = cream
        for side, x in (("left", cx - 0.078 * scale), ("right", cx + 0.078 * scale)):
            add_eye(parts, f"{side}-eye", (x, cy + 0.035 * scale, front + 0.010 * scale),
                    (0.086 * scale, 0.118 * scale), white, iris, dark, white,
                    iris_ratio=(0.62, 0.78), pupil_ratio=(0.58, 0.68))
            add_arc_tube(parts, f"{side}-upper-lid",
                         (x, cy + 0.030 * scale, front + 0.026 * scale),
                         0.046 * scale, 0.060 * scale, 0.12 * math.pi, 0.88 * math.pi,
                         0.006 * scale, dark, 8)
    add_beveled_prism(parts, "cat-nose",
                      [(cx - 0.022 * scale, cy - 0.030 * scale),
                       (cx + 0.022 * scale, cy - 0.030 * scale),
                       (cx, cy - 0.058 * scale)],
                      front + 0.025 * scale, front + 0.034 * scale, pink, 0.003 * scale)
    add_arc_tube(parts, "left-mouth", (cx - 0.030 * scale, cy - 0.075 * scale,
                                       front + 0.032 * scale),
                 0.030 * scale, 0.025 * scale, math.pi, 2 * math.pi,
                 0.005 * scale, dark, 7)
    add_arc_tube(parts, "right-mouth", (cx + 0.030 * scale, cy - 0.075 * scale,
                                        front + 0.032 * scale),
                 0.030 * scale, 0.025 * scale, math.pi, 2 * math.pi,
                 0.005 * scale, dark, 7)


def build_cat_stand(parts: list[bpy.types.Object]) -> None:
    orange = material("Cat orange", "#A83B08")
    stripe = material("Cat stripe", "#702305")
    cream = material("Cat cream", "#F7DDBB")
    inner = material("Cat ear pink", "#E99587")
    iris = material("Cat olive iris", "#819447")
    dark = material("Cat facial line", "#39261F")
    pink = material("Cat nose", "#B65C5B")

    add_profiled_volume(parts, "cat-ribcage", [
        (0.10, 0.13, 0.17, 0, -0.075), (0.18, 0.18, 0.21, 0, -0.075),
        (0.31, 0.185, 0.22, 0, -0.060), (0.40, 0.15, 0.17, 0, -0.025),
    ], orange, 22, True)
    add_profiled_volume(parts, "cat-head", [
        (0.35, 0.085, 0.075, 0, 0.070), (0.38, 0.145, 0.115, 0, 0.078),
        (0.42, 0.180, 0.137, 0, 0.080), (0.47, 0.195, 0.145, 0, 0.076),
        (0.515, 0.182, 0.138, 0, 0.068), (0.55, 0.15, 0.112, 0, 0.058),
        (0.57, 0.08, 0.060, 0, 0.048),
    ], orange, 24, True)
    add_cat_ear(parts, "left-ear", -0.105, 0.525, 0.64, 0.055, orange, inner, 0.13)
    add_cat_ear(parts, "right-ear", 0.105, 0.525, 0.64, 0.055, orange, inner, 0.13)

    for x in (-0.12, 0.12):
        add_tapered_segment(parts, f"front-leg-{x}", (x, 0.065, 0.115),
                            (x, 0.34, 0.09), 0.060, 0.048, orange)
        add_ellipsoid(parts, f"front-paw-{x}", (0.135, 0.075, 0.16),
                      (x, 0.038, 0.135), cream, 16, 8, True)
        add_ellipsoid(parts, f"leg-band-{x}", (0.135, 0.035, 0.135),
                      (x, 0.17, 0.102), stripe, 14, 7, True)
        for toe_offset in (-0.020, 0.020):
            add_tapered_segment(parts, f"front-toe-{x}-{toe_offset}",
                                (x + toe_offset, 0.065, 0.216),
                                (x + toe_offset, 0.030, 0.218),
                                0.0035, 0.0030, dark, 8)
    for x in (-0.13, 0.13):
        add_tapered_segment(parts, f"hind-leg-{x}", (x, 0.06, -0.12),
                            (x, 0.24, -0.12), 0.067, 0.058, orange)
        add_ellipsoid(parts, f"hind-paw-{x}", (0.16, 0.075, 0.16),
                      (x, 0.038, -0.14), orange, 16, 8, True)

    tail_points = [(-0.16, 0.25, -0.14), (-0.30, 0.34, -0.10),
                   (-0.36, 0.48, -0.04), (-0.34, 0.59, 0.02),
                   (-0.27, 0.64, 0.07)]
    add_swept_tube(parts, "striped-tail", tail_points,
                   [0.060, 0.057, 0.052, 0.045, 0.032],
                   [orange, stripe, orange, cream], 14)
    add_ellipsoid(parts, "chest-ruff", (0.18, 0.25, 0.038), (0, 0.292, 0.148),
                  cream, 18, 9, True)
    add_cat_face(parts, (0, 0.455, 0.210), 0.92, cream, iris, dark, pink)

    add_beveled_prism(parts, "forehead-stripe",
                      [(-0.050, 0.565), (0.050, 0.565), (0, 0.495)],
                      0.172, 0.184, stripe, 0.004)
    for name, profile in {
        "left-cheek-stripe": [(-0.185, 0.455), (-0.11, 0.435), (-0.14, 0.395)],
        "right-cheek-stripe": [(0.185, 0.455), (0.11, 0.435), (0.14, 0.395)],
    }.items():
        add_beveled_prism(parts, name, profile, 0.195, 0.214, stripe, 0.004)
    for name, profile in {
        "left-body-stripe": [(-0.18, 0.34), (-0.10, 0.31), (-0.145, 0.245)],
        "right-body-stripe": [(0.18, 0.34), (0.10, 0.31), (0.145, 0.245)],
    }.items():
        add_beveled_prism(parts, name, profile, 0.145, 0.160, stripe, 0.004)


def build_cat_sleep(parts: list[bpy.types.Object]) -> None:
    orange = material("Cat orange", "#A83B08")
    stripe = material("Cat stripe", "#702305")
    cream = material("Cat cream", "#F7DDBB")
    inner = material("Cat ear pink", "#E99587")
    dark = material("Cat facial line", "#39261F")
    pink = material("Cat nose", "#B65C5B")
    iris = material("Cat olive iris", "#819447")

    add_ellipsoid(parts, "sleeping-body", (0.58, 0.25, 0.43), (-0.03, 0.135, -0.02),
                  orange, 24, 12, True)
    add_ellipsoid(parts, "sleeping-haunch", (0.33, 0.26, 0.36), (-0.18, 0.145, -0.07),
                  orange, 20, 10, True)
    add_profiled_volume(parts, "resting-head", [
        (0.09, 0.085, 0.075, 0.17, 0.12), (0.12, 0.14, 0.115, 0.17, 0.12),
        (0.17, 0.18, 0.14, 0.17, 0.12), (0.23, 0.18, 0.14, 0.17, 0.12),
        (0.28, 0.15, 0.115, 0.17, 0.115), (0.30, 0.09, 0.065, 0.17, 0.11),
    ], orange, 22, True)
    add_cat_ear(parts, "left-ear", 0.095, 0.255, 0.37, 0.105, orange, inner, 0.10)
    add_cat_ear(parts, "right-ear", 0.245, 0.255, 0.37, 0.105, orange, inner, 0.10)
    for x in (0.09, 0.235):
        add_ellipsoid(parts, f"sleep-paw-{x}", (0.14, 0.07, 0.17), (x, 0.038, 0.19),
                      cream, 16, 8, True)
    add_cat_face(parts, (0.17, 0.205, 0.252), 0.78, cream, iris, dark, pink, closed=True)
    tail_points = [(-0.20, 0.16, -0.14), (-0.34, 0.13, -0.05),
                   (-0.34, 0.085, 0.10), (-0.25, 0.07, 0.21),
                   (-0.10, 0.06, 0.245)]
    add_swept_tube(parts, "sleep-tail", tail_points,
                   [0.058, 0.054, 0.049, 0.041, 0.028],
                   [orange, stripe, orange, cream], 14)
    for index, profile in enumerate((
        [(-0.18, 0.245), (-0.08, 0.26), (-0.12, 0.15)],
        [(-0.01, 0.26), (0.09, 0.245), (0.04, 0.15)],
    )):
        add_beveled_prism(parts, f"sleep-body-stripe-{index}", profile,
                          0.198, 0.218, stripe, 0.004)


def build_partner(parts: list[bpy.types.Object]) -> None:
    blue = material("Piko cyan", "#159CB8")
    blue_shadow = material("Piko cyan shadow", "#087A96")
    white = material("Piko warm white", "#F5EEDC")
    dark = material("Piko facial line", "#2D251F")
    gold = material("Piko lamp gold", "#F0A62A")

    # All cyan anatomical masses are authored with deliberate overlap, then
    # voxel-unioned into one watertight skin.  This makes shoulder, elbow,
    # wrist, hip, knee, ankle, neck, hand, and foot transitions genuinely
    # continuous instead of hiding intersections between separate primitives.
    skin_parts: list[bpy.types.Object] = []
    torso_rings = [
        (0.188, 0.050, 0.049, 0, -0.004),
        (0.205, 0.063, 0.058, 0, -0.002),
        (0.230, 0.075, 0.067, 0, 0.000),
        (0.260, 0.082, 0.074, 0, 0.002),
        (0.295, 0.085, 0.078, 0, 0.002),
        (0.330, 0.082, 0.075, 0, 0.000),
        (0.360, 0.075, 0.069, 0, -0.002),
        (0.387, 0.068, 0.062, 0, -0.003),
        (0.407, 0.061, 0.055, 0, -0.003),
        (0.418, 0.056, 0.050, 0, -0.002),
    ]
    add_profiled_volume(skin_parts, "piko-torso-skin", torso_rings, blue, 32, True)

    # A shorter, wider cranium matches the approved 2D head ratio (about
    # 1.28:1 width-to-height) while keeping a shorter face and fuller rear mass.
    head_rings = [
        (0.398, 0.043, 0.046, 0, 0.010),
        (0.414, 0.076, 0.079, 0, 0.015),
        (0.438, 0.107, 0.107, 0, 0.017),
        (0.468, 0.124, 0.120, 0, 0.014),
        (0.502, 0.128, 0.123, 0, 0.005),
        (0.533, 0.120, 0.118, 0, -0.003),
        (0.560, 0.101, 0.103, 0, -0.009),
        (0.579, 0.070, 0.073, 0, -0.010),
        (0.590, 0.036, 0.038, 0, -0.009),
        (0.594, 0.012, 0.013, 0, -0.008),
    ]
    add_profiled_volume(skin_parts, "piko-head-skin", head_rings, blue, 36, True)

    def head_surface_z(x: float, y: float) -> float:
        lower = head_rings[0]
        upper = head_rings[-1]
        for ring_index in range(len(head_rings) - 1):
            if head_rings[ring_index][0] <= y <= head_rings[ring_index + 1][0]:
                lower = head_rings[ring_index]
                upper = head_rings[ring_index + 1]
                break
        blend = (y - lower[0]) / max(upper[0] - lower[0], 1e-6)
        radius_x = lower[1] + (upper[1] - lower[1]) * blend
        radius_z = lower[2] + (upper[2] - lower[2]) * blend
        center_z = lower[4] + (upper[4] - lower[4]) * blend
        normalized_x = min(abs(x) / max(radius_x, 1e-6), 0.995)
        return center_z + radius_z * math.sqrt(1.0 - normalized_x * normalized_x)

    # Continuous tapered legs.  The hip and ankle endpoints are buried in the
    # torso and feet so the union produces one uninterrupted silhouette.
    for x in (-0.060, 0.060):
        hip_x = x * 0.77
        add_swept_tube(
            skin_parts,
            f"piko-leg-skin-{x}",
            [
                (hip_x, 0.246, -0.003),
                (x * 0.90, 0.205, 0.000),
                (x, 0.153, 0.004),
                (x, 0.105, 0.009),
                (x, 0.057, 0.014),
            ],
            [0.035, 0.034, 0.030, 0.027, 0.025],
            [blue, blue, blue, blue],
            14,
        )
        foot_x = x + (-0.008 if x < 0 else 0.008)
        add_profiled_volume(skin_parts, f"piko-foot-skin-{x}", [
            (0.003, 0.055, 0.084, foot_x, 0.033),
            (0.014, 0.062, 0.100, foot_x, 0.036),
            (0.029, 0.060, 0.097, foot_x, 0.034),
            (0.044, 0.049, 0.073, foot_x, 0.024),
            (0.058, 0.033, 0.043, x, 0.014),
        ], blue, 18, True)

    # The arms use single swept cages instead of upper-arm / elbow / forearm
    # primitives.  Their 32--46 mm diameter follows the approved thin-limb
    # proportion and eliminates the previous oversized shoulder cones.
    add_swept_tube(skin_parts, "piko-left-arm-skin", [
        (-0.058, 0.393, -0.001),
        (-0.087, 0.367, 0.005),
        (-0.126, 0.320, 0.014),
        (-0.148, 0.268, 0.024),
        (-0.160, 0.231, 0.032),
        (-0.175, 0.196, 0.040),
    ], [0.029, 0.025, 0.021, 0.019, 0.017, 0.016],
       [blue, blue, blue, blue, blue], 14)
    add_ellipsoid(skin_parts, "piko-left-palm-skin", (0.064, 0.073, 0.052),
                  (-0.178, 0.175, 0.043), blue, 16, 8, True)
    for finger_index, finger_x in enumerate((-0.194, -0.174)):
        add_ellipsoid(skin_parts, f"piko-left-finger-skin-{finger_index}",
                      (0.027, 0.052, 0.030), (finger_x, 0.147, 0.046),
                      blue, 12, 6, True)
    add_ellipsoid(skin_parts, "piko-left-thumb-skin", (0.029, 0.048, 0.031),
                  (-0.148, 0.173, 0.047), blue, 12, 6, True)

    add_swept_tube(skin_parts, "piko-right-arm-skin", [
        (0.058, 0.393, -0.001),
        (0.088, 0.375, 0.005),
        (0.132, 0.348, 0.016),
        (0.151, 0.320, 0.025),
        (0.160, 0.340, 0.032),
        (0.169, 0.370, 0.040),
        (0.170, 0.392, 0.045),
    ], [0.029, 0.025, 0.021, 0.019, 0.018, 0.017, 0.016],
       [blue, blue, blue, blue, blue, blue], 14)
    add_ellipsoid(skin_parts, "piko-right-palm-skin", (0.056, 0.064, 0.050),
                  (0.165, 0.393, 0.047), blue, 16, 8, True)
    for finger_index, finger_x in enumerate((0.150, 0.164)):
        add_ellipsoid(skin_parts, f"piko-right-folded-finger-skin-{finger_index}",
                      (0.025, 0.035, 0.039), (finger_x, 0.377, 0.052),
                      blue, 12, 6, True)
    add_swept_tube(skin_parts, "piko-raised-index-skin", [
        (0.174, 0.401, 0.047),
        (0.181, 0.421, 0.049),
        (0.183, 0.445, 0.049),
        (0.181, 0.460, 0.048),
    ], [0.016, 0.015, 0.014, 0.0115], [blue, blue, blue], 12)
    add_ellipsoid(skin_parts, "piko-index-tip-skin", (0.024, 0.028, 0.024),
                  (0.181, 0.464, 0.048), blue, 12, 6, True)

    add_swept_tube(skin_parts, "piko-lamp-stalk-skin", [
        (0.000, 0.585, -0.007),
        (-0.006, 0.611, 0.002),
        (-0.017, 0.635, 0.026),
        (-0.021, 0.653, 0.056),
        (-0.012, 0.665, 0.080),
    ], [0.020, 0.019, 0.017, 0.015, 0.013],
       [blue, blue, blue, blue], 12)

    skin = fuse_skin_parts(skin_parts, "piko-continuous-skin", 0.0045, 4550)
    parts.append(skin)

    def torso_surface_z(x: float, y: float) -> float:
        lower = torso_rings[0]
        upper = torso_rings[-1]
        for ring_index in range(len(torso_rings) - 1):
            if torso_rings[ring_index][0] <= y <= torso_rings[ring_index + 1][0]:
                lower = torso_rings[ring_index]
                upper = torso_rings[ring_index + 1]
                break
        blend = (y - lower[0]) / max(upper[0] - lower[0], 1e-6)
        radius_x = lower[1] + (upper[1] - lower[1]) * blend
        radius_z = lower[2] + (upper[2] - lower[2]) * blend
        center_z = lower[4] + (upper[4] - lower[4]) * blend
        normalized_x = min(abs(x) / max(radius_x, 1e-6), 0.995)
        return center_z + radius_z * math.sqrt(1.0 - normalized_x * normalized_x)

    # Cream areas are thin surface graphics rather than separate neck/torso
    # solids, so their color boundary cannot reintroduce anatomical seams.
    belly_rows = [
        (0.198, 0.010, None), (0.207, 0.026, None),
        (0.226, 0.044, None), (0.255, 0.056, None),
        (0.290, 0.060, None), (0.322, 0.056, None),
        (0.348, 0.042, None), (0.365, 0.032, None),
        (0.377, 0.032, 0.062), (0.392, 0.033, 0.064),
        (0.405, 0.033, 0.076), (0.417, 0.032, 0.094),
        (0.428, 0.027, 0.108),
    ]
    belly_columns = 9
    belly_vertices: list[tuple[float, float, float]] = []
    for y, half_width, front_override in belly_rows:
        for column in range(belly_columns):
            x = -half_width + 2.0 * half_width * column / (belly_columns - 1)
            if front_override is None:
                front_z = torso_surface_z(x, y) + 0.0055
            else:
                curve = 1.0 - (x / max(half_width, 1e-6)) ** 2
                front_z = front_override + 0.004 * curve
            belly_vertices.append((x, y, front_z))
    belly_faces: list[tuple[int, ...]] = []
    for row in range(len(belly_rows) - 1):
        first = row * belly_columns
        second = (row + 1) * belly_columns
        for column in range(belly_columns - 1):
            belly_faces.append((
                first + column,
                first + column + 1,
                second + column + 1,
                second + column,
            ))
    add_mesh(parts, "piko-belly-and-neck", belly_vertices, belly_faces, [white], smooth=True)

    # The approved face uses cream eye shapes without a heavy full outline.
    # Slightly asymmetric pupils look toward Piko's raised hand as in the style
    # key; restrained upper lids and brows preserve the gentle expression.
    eye_outline = [
        (-0.48, 0.05), (-0.43, 0.29), (-0.28, 0.45), (-0.05, 0.50),
        (0.18, 0.46), (0.39, 0.30), (0.49, 0.05), (0.45, -0.24),
        (0.28, -0.44), (0.02, -0.50), (-0.24, -0.44), (-0.43, -0.23),
    ]
    pupil_outline = [
        (math.cos(2.0 * math.pi * index / 16) * 0.5,
         math.sin(2.0 * math.pi * index / 16) * 0.5)
        for index in range(16)
    ]
    def add_head_patch(
        name: str,
        center: tuple[float, float],
        size: tuple[float, float],
        outline: list[tuple[float, float]],
        mat: bpy.types.Material,
        offset: float,
    ) -> None:
        cx, cy = center
        width, height = size
        vertices = []
        for local_x, local_y in outline:
            x = cx + local_x * width
            y = cy + local_y * height
            vertices.append((x, y, head_surface_z(x, y) + offset))
        add_mesh(parts, name, vertices, [tuple(range(len(vertices)))], [mat], smooth=False)

    def add_head_arc_patch(
        name: str,
        center: tuple[float, float],
        radius: tuple[float, float],
        start_angle: float,
        end_angle: float,
        thickness: float,
        mat: bpy.types.Material,
        offset: float,
        samples: int,
    ) -> None:
        cx, cy = center
        radius_x, radius_y = radius
        outer = []
        inner = []
        for index in range(samples):
            angle = start_angle + (end_angle - start_angle) * index / (samples - 1)
            outer.append((
                cx + math.cos(angle) * (radius_x + thickness * 0.5),
                cy + math.sin(angle) * (radius_y + thickness * 0.5),
            ))
            inner.append((
                cx + math.cos(angle) * (radius_x - thickness * 0.5),
                cy + math.sin(angle) * (radius_y - thickness * 0.5),
            ))
        vertices = [
            (x, y, head_surface_z(x, y) + offset)
            for x, y in outer + list(reversed(inner))
        ]
        add_mesh(parts, name, vertices, [tuple(range(len(vertices)))], [mat], smooth=False)

    ellipse_12 = [
        (math.cos(2.0 * math.pi * index / 12) * 0.5,
         math.sin(2.0 * math.pi * index / 12) * 0.5)
        for index in range(12)
    ]
    for side, x in (("left", -0.052), ("right", 0.052)):
        eye_center = (x, 0.505)
        add_head_patch(f"piko-{side}-eye", eye_center,
                       (0.049, 0.070), eye_outline, white, 0.0030)
        gaze_x = x + 0.007
        add_head_patch(f"piko-{side}-pupil", (gaze_x, 0.502),
                       (0.024, 0.048), pupil_outline, dark, 0.0051)
        add_head_patch(f"piko-{side}-highlight", (gaze_x - 0.004, 0.516),
                       (0.0055, 0.010), ellipse_12, white, 0.0063)
        add_head_arc_patch(f"piko-{side}-upper-lid", eye_center,
                           (0.0255, 0.035), 0.08 * math.pi, 0.91 * math.pi,
                           0.0023, dark, 0.0060, 10)
        add_head_arc_patch(f"piko-{side}-brow", (x, 0.550),
                           (0.024, 0.012), 0.17 * math.pi, 0.82 * math.pi,
                           0.0030, dark, 0.0032, 8)

    add_head_patch("piko-nose", (0.0, 0.473), (0.020, 0.016),
                   [(-0.5, 0.20), (0.5, 0.20), (0.0, -0.40)],
                   blue_shadow, 0.0034)
    add_head_arc_patch("piko-smile", (0.0, 0.451), (0.032, 0.016),
                       math.pi, 2 * math.pi, 0.0032, dark, 0.0040, 11)

    for x in (-0.060, 0.060):
        foot_x = x + (-0.008 if x < 0 else 0.008)
        for groove_index, offset in enumerate((-0.016, 0.016)):
            add_swept_tube(
                parts,
                f"piko-foot-{x}-groove-{groove_index}",
                [(foot_x + offset, 0.010, 0.137),
                 (foot_x + offset * 0.82, 0.038, 0.139)],
                [0.0020, 0.0020], [blue_shadow], 5,
            )
    add_swept_tube(parts, "piko-right-palm-groove",
                   [(0.152, 0.371, 0.071), (0.153, 0.390, 0.072)],
                   [0.0019, 0.0019], [blue_shadow], 5)

    add_ellipsoid(parts, "piko-lamp-rim", (0.078, 0.078, 0.029),
                  (-0.012, 0.667, 0.096), gold, 20, 10, True)
    add_face_ellipse(parts, "piko-lamp-glow", (-0.012, 0.667, 0.111),
                     (0.048, 0.048), white, 0.0, 0.0, 20)


def build_amanojaku(parts: list[bpy.types.Object]) -> None:
    skin = material("Sakasa lavender skin", "#927CC8")
    purple = material("Sakasa deep purple", "#461D6B")
    hair = material("Sakasa hair", "#603487")
    gold = material("Sakasa gold", "#EEA52A")
    white = material("Sakasa eye white", "#FFF0D5")
    dark = material("Sakasa facial line", "#2D2133")

    for x in (-0.105, 0.105):
        add_tapered_segment(parts, f"sakasa-leg-{x}", (x, 0.15, 0),
                            (x, 0.67, 0), 0.052, 0.043, skin, 14)
        shoe_x = x + (-0.018 if x < 0 else 0.018)
        add_beveled_prism(parts, f"sakasa-boot-{x}", [
            (shoe_x - 0.112, 0.018), (shoe_x + 0.112, 0.018),
            (shoe_x + 0.112, 0.090), (shoe_x + 0.072, 0.155),
            (shoe_x - 0.072, 0.155), (shoe_x - 0.112, 0.085),
        ], -0.135, 0.175, purple, 0.022, True)
        add_vertical_torus(parts, f"sakasa-boot-cuff-{x}", (x, 0.17, 0),
                           0.062, 0.016, purple)

    add_profiled_volume(parts, "sakasa-torso", [
        (0.56, 0.10, 0.08, 0, 0), (0.66, 0.13, 0.10, 0, 0),
        (0.80, 0.15, 0.115, 0, 0), (0.91, 0.13, 0.10, 0, 0),
        (0.95, 0.10, 0.08, 0, 0),
    ], skin, 22, True)

    cape = add_beveled_prism(parts, "sakasa-cape",
                             [(-0.25, 0.90), (-0.22, 0.63), (0, 0.49),
                              (0.22, 0.63), (0.25, 0.90)],
                             -0.19, -0.115, purple, 0.018, True)
    cape.data.polygons.foreach_set("use_smooth", [True] * len(cape.data.polygons))
    add_beveled_prism(parts, "sakasa-left-cape-lining",
                      [(-0.245, 0.86), (-0.22, 0.64), (-0.10, 0.57), (-0.16, 0.84)],
                      -0.108, -0.088, gold, 0.007, True)
    add_beveled_prism(parts, "sakasa-right-cape-lining",
                      [(0.245, 0.86), (0.22, 0.64), (0.10, 0.57), (0.16, 0.84)],
                      -0.108, -0.088, gold, 0.007, True)
    add_profiled_volume(parts, "sakasa-mantle", [
        (0.84, 0.24, 0.18, 0, 0), (0.89, 0.27, 0.20, 0, 0),
        (0.94, 0.22, 0.17, 0, 0),
    ], purple, 24, True)
    add_beveled_prism(parts, "sakasa-gold-sash",
                      [(-0.20, 0.84), (0.20, 0.78), (0.15, 0.66), (-0.10, 0.72)],
                      0.154, 0.178, gold, 0.008, True)

    add_profiled_volume(parts, "sakasa-head", [
        (0.88, 0.09, 0.08, 0, 0.018), (0.91, 0.15, 0.13, 0, 0.020),
        (0.95, 0.195, 0.155, 0, 0.022), (1.01, 0.215, 0.168, 0, 0.022),
        (1.07, 0.205, 0.158, 0, 0.020), (1.12, 0.17, 0.13, 0, 0.015),
        (1.15, 0.10, 0.075, 0, 0.008),
    ], skin, 24, True)

    hair_profiles = {
        "sakasa-left-upper-hair": [(-0.13, 1.10), (-0.275, 1.02), (-0.23, 0.96), (-0.08, 1.01)],
        "sakasa-left-lower-hair": [(-0.14, 1.02), (-0.265, 0.91), (-0.17, 0.88), (-0.055, 0.98)],
        "sakasa-right-upper-hair": [(0.13, 1.10), (0.275, 1.02), (0.23, 0.96), (0.08, 1.01)],
        "sakasa-right-lower-hair": [(0.14, 1.02), (0.265, 0.91), (0.17, 0.88), (0.055, 0.98)],
    }
    for name, profile in hair_profiles.items():
        add_beveled_prism(parts, name, profile, -0.105, 0.085, hair, 0.014, True)

    for side, x, hand_x in (("left", -0.15, -0.39), ("right", 0.15, 0.39)):
        elbow_x = -0.28 if x < 0 else 0.28
        add_tapered_segment(parts, f"sakasa-{side}-upper-arm", (x, 0.87, 0),
                            (elbow_x, 0.64, 0.04), 0.048, 0.038, skin, 14)
        add_ellipsoid(parts, f"sakasa-{side}-elbow", (0.082, 0.082, 0.075),
                      (elbow_x, 0.64, 0.04), skin, 14, 7, True)
        add_tapered_segment(parts, f"sakasa-{side}-forearm", (elbow_x, 0.64, 0.04),
                            (hand_x, 0.43, 0.075), 0.038, 0.030, skin, 14)
        add_vertical_torus(parts, f"sakasa-{side}-wrist-cuff", (hand_x * 0.94, 0.49, 0.06),
                           0.052, 0.016, purple)
        add_fingered_hand(parts, f"sakasa-{side}-hand", (hand_x, 0.40, 0.08), skin,
                          0.115, 0.145, -1 if x < 0 else 1)

    hat_points = [(0, 1.12, 0), (0, 1.23, 0), (0.02, 1.33, 0),
                  (0.08, 1.39, 0), (0.17, 1.40, 0), (0.24, 1.36, 0),
                  (0.285, 1.29, 0), (0.305, 1.23, 0)]
    add_swept_tube(parts, "sakasa-striped-hat", hat_points,
                   [0.185, 0.165, 0.132, 0.103, 0.078, 0.058, 0.038, 0.020],
                   [purple, gold, purple, gold, purple, gold, purple], 18)
    add_ellipsoid(parts, "sakasa-hat-pom", (0.095, 0.095, 0.095),
                  (0.31, 1.215, 0), gold, 16, 8, True)

    for side, x in (("left", -0.075), ("right", 0.075)):
        look = 0.008 if side == "left" else 0.004
        add_almond_eye(parts, f"sakasa-{side}-eye", (x, 1.035, 0.188),
                       (0.105, 0.078), white, gold, dark, white,
                       look_x=look, slant=0.006 if side == "left" else -0.006)
        add_arc_tube(parts, f"sakasa-{side}-upper-lid", (x, 1.035, 0.198),
                     0.055, 0.043, 0.10 * math.pi, 0.90 * math.pi, 0.005, dark, 8)
        add_arc_tube(parts, f"sakasa-{side}-brow", (x, 1.085, 0.198),
                     0.052, 0.026, 0.18 * math.pi, 0.82 * math.pi, 0.0045, purple, 8)
    add_ellipsoid(parts, "sakasa-nose", (0.036, 0.026, 0.022),
                  (0, 0.995, 0.198), hair, 12, 6, True)
    add_arc_tube(parts, "sakasa-smile", (0, 0.970, 0.201), 0.052, 0.032,
                 math.pi, 2 * math.pi, 0.005, dark, 9)
    add_front_torus(parts, "sakasa-clasp", (0, 0.875, 0.215), 0.047, 0.014, gold)
    add_ellipsoid(parts, "sakasa-clasp-center", (0.054, 0.054, 0.022),
                  (0, 0.875, 0.225), purple, 14, 7, True)
    for x in (-0.13, 0.13):
        add_beveled_prism(parts, f"sakasa-boot-stripe-{x}",
                          [(x - 0.040, 0.02), (x + 0.040, 0.02),
                           (x + 0.018, 0.135), (x - 0.018, 0.135)],
                          0.178, 0.192, gold, 0.004, True)


def build_passenger(parts: list[bpy.types.Object]) -> None:
    skin = material("Passenger warm skin", "#E58C52")
    blue = material("Passenger coat blue", "#082864")
    blue_dark = material("Passenger coat shadow", "#051B46")
    hair = material("Passenger brown hair", "#3E1E10")
    white = material("Passenger warm white", "#F4ECD9")
    dark = material("Passenger facial line", "#30231C")
    charcoal = material("Passenger shorts", "#34343A")
    brown = material("Passenger shoes", "#3C200F")
    gold = material("Passenger brass", "#E5A12A")

    for x in (-0.105, 0.105):
        add_tapered_segment(parts, f"passenger-sock-{x}", (x, 0.14, 0),
                            (x, 0.47, 0), 0.050, 0.055, charcoal, 14)
        shoe_x = x + (-0.018 if x < 0 else 0.018)
        add_beveled_prism(parts, f"passenger-shoe-{x}", [
            (shoe_x - 0.105, 0.018), (shoe_x + 0.105, 0.018),
            (shoe_x + 0.105, 0.085), (shoe_x + 0.068, 0.145),
            (shoe_x - 0.068, 0.145), (shoe_x - 0.105, 0.082),
        ], -0.11, 0.16, brown, 0.020, True)
        add_beveled_prism(parts, f"passenger-short-{x}",
                          [(x - 0.075, 0.43), (x + 0.075, 0.43),
                           (x + 0.07, 0.58), (x - 0.08, 0.58)],
                          -0.08, 0.08, charcoal, 0.015, True)

    add_profiled_volume(parts, "passenger-tailored-coat", [
        (0.48, 0.205, 0.125, 0, 0), (0.58, 0.225, 0.138, 0, 0),
        (0.72, 0.205, 0.132, 0, 0), (0.86, 0.175, 0.120, 0, 0),
        (1.03, 0.220, 0.145, 0, 0), (1.12, 0.205, 0.138, 0, 0),
        (1.16, 0.160, 0.105, 0, 0),
    ], blue, 24, True)
    for side, x in (("left", -0.19), ("right", 0.19)):
        elbow_x = -0.25 if x < 0 else 0.25
        hand_x = -0.285 if x < 0 else 0.285
        add_tapered_segment(parts, f"passenger-{side}-upper-sleeve", (x, 1.08, 0),
                            (elbow_x, 0.83, 0.035), 0.060, 0.050, blue, 14)
        add_ellipsoid(parts, f"passenger-{side}-elbow", (0.105, 0.105, 0.095),
                      (elbow_x, 0.83, 0.035), blue, 14, 7, True)
        add_tapered_segment(parts, f"passenger-{side}-forearm", (elbow_x, 0.83, 0.035),
                            (hand_x, 0.64, 0.07), 0.050, 0.042, blue, 14)
        add_vertical_torus(parts, f"passenger-{side}-cuff", (hand_x * 0.95, 0.69, 0.055),
                           0.050, 0.014, blue_dark)
        add_fingered_hand(parts, f"passenger-{side}-hand", (hand_x, 0.585, 0.075), skin,
                          0.100, 0.125, -1 if x < 0 else 1)

    add_ellipsoid(parts, "passenger-hair-shell", (0.43, 0.32, 0.34),
                  (0, 1.315, -0.025), hair, 24, 12, True)
    add_profiled_volume(parts, "passenger-face", [
        (1.17, 0.085, 0.075, 0, 0.028), (1.20, 0.145, 0.125, 0, 0.030),
        (1.25, 0.180, 0.150, 0, 0.032), (1.32, 0.195, 0.158, 0, 0.032),
        (1.39, 0.182, 0.145, 0, 0.028), (1.44, 0.145, 0.110, 0, 0.022),
        (1.46, 0.085, 0.060, 0, 0.015),
    ], skin, 24, True)
    for x in (-0.195, 0.195):
        add_ellipsoid(parts, f"passenger-ear-{x}", (0.075, 0.095, 0.060),
                      (x, 1.315, 0.035), skin, 14, 7, True)

    for side, profile in {
        "left": [(-0.19, 1.38), (-0.25, 1.30), (-0.22, 1.17), (-0.14, 1.14), (-0.13, 1.34)],
        "right": [(0.19, 1.38), (0.25, 1.30), (0.22, 1.17), (0.14, 1.14), (0.13, 1.34)],
    }.items():
        add_beveled_prism(parts, f"passenger-{side}-hair", profile, -0.105, 0.075,
                          hair, 0.018, True)
    add_beveled_prism(parts, "passenger-fringe",
                      [(-0.15, 1.435), (0.14, 1.435), (0.08, 1.36),
                       (0.02, 1.405), (-0.04, 1.35), (-0.10, 1.40)],
                      0.172, 0.187, hair, 0.006, True)

    add_profiled_volume(parts, "passenger-cap-crown", [
        (1.43, 0.19, 0.15, 0, -0.005), (1.49, 0.225, 0.17, 0, -0.005),
        (1.57, 0.20, 0.15, 0, -0.010), (1.61, 0.12, 0.09, 0, -0.010),
    ], blue, 24, True)
    add_beveled_prism(parts, "passenger-cap-band",
                      [(-0.22, 1.43), (0.22, 1.43), (0.21, 1.48), (-0.21, 1.48)],
                      -0.16, 0.16, blue_dark, 0.012, True)
    add_beveled_prism(parts, "passenger-cap-brim",
                      [(-0.23, 1.415), (0.23, 1.415), (0.19, 1.455), (-0.19, 1.455)],
                      0.10, 0.22, blue, 0.014, True)
    add_ellipsoid(parts, "passenger-cap-badge", (0.058, 0.058, 0.020),
                  (0.17, 1.505, 0.175), gold, 14, 7, True)
    # The expedition-team lamp echoes Piko's antenna without turning the
    # passenger into a robot. Keep it broad enough to read on a phone screen.
    add_tapered_segment(parts, "passenger-lamp-stalk",
                        (0, 1.555, -0.010), (-0.015, 1.665, 0.025),
                        0.023, 0.017, blue_dark, 8)
    add_ellipsoid(parts, "passenger-lamp", (0.060, 0.060, 0.045),
                  (-0.015, 1.700, 0.036), gold, 10, 5, True)

    for side, x in (("left", -0.073), ("right", 0.073)):
        add_eye(parts, f"passenger-{side}-eye", (x, 1.335, 0.193), (0.075, 0.102),
                white, dark, dark, white, iris_ratio=(0.52, 0.68),
                pupil_ratio=(0.72, 0.78), look_x=0.004)
        add_arc_tube(parts, f"passenger-{side}-upper-lid", (x, 1.335, 0.203),
                     0.041, 0.053, 0.12 * math.pi, 0.88 * math.pi, 0.005, dark, 8)
        add_arc_tube(parts, f"passenger-{side}-brow", (x, 1.385, 0.204),
                     0.043, 0.027, 0.18 * math.pi, 0.82 * math.pi, 0.0045, hair, 8)
    add_ellipsoid(parts, "passenger-nose", (0.035, 0.027, 0.022),
                  (0, 1.285, 0.204), skin, 12, 6, True)
    add_arc_tube(parts, "passenger-smile", (0, 1.260, 0.206), 0.050, 0.032,
                 math.pi, 2 * math.pi, 0.005, dark, 9)

    add_beveled_prism(parts, "passenger-left-lapel",
                      [(-0.20, 1.10), (-0.025, 0.94), (0, 1.07), (-0.09, 1.15)],
                      0.150, 0.178, blue_dark, 0.008, True)
    add_beveled_prism(parts, "passenger-right-lapel",
                      [(0.20, 1.10), (0.025, 0.94), (0, 1.07), (0.09, 1.15)],
                      0.150, 0.178, blue_dark, 0.008, True)
    add_beveled_prism(parts, "passenger-shirt-collar",
                      [(-0.095, 1.105), (0, 1.015), (0.095, 1.105)],
                      0.176, 0.198, white, 0.006, True)
    add_beveled_prism(parts, "passenger-coat-seam",
                      [(-0.009, 0.52), (0.009, 0.52), (0.009, 1.00), (-0.009, 1.00)],
                      0.142, 0.151, blue_dark, 0.003, True)
    for index, y in enumerate((0.91, 0.78, 0.65)):
        add_ellipsoid(parts, f"passenger-button-{index}", (0.046, 0.046, 0.020),
                      (0.055, y, 0.155), gold, 12, 6, True)


BUILDERS = {
    "cat-sleep": build_cat_sleep,
    "cat-stand": build_cat_stand,
    "partner": build_partner,
    "amanojaku": build_amanojaku,
    "passenger": build_passenger,
}


def join_parts(parts: list[bpy.types.Object], model_name: str) -> bpy.types.Object:
    # Joining keeps the active object's rotation.  Several characters begin with
    # a slanted limb, so bake every part's local rotation first; otherwise the
    # completed character acquires that limb rotation and turnaround renders can
    # show its back as the nominal front view.
    for part in parts:
        bpy.ops.object.select_all(action="DESELECT")
        part.select_set(True)
        bpy.context.view_layer.objects.active = part
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    model = bpy.context.object
    model.name = model_name
    model.data.name = model_name
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


def normalize_model(model: bpy.types.Object, target: tuple[float, float, float]) -> None:
    _, minimum, maximum = model_metrics(model)
    dimensions = [maximum[index] - minimum[index] for index in range(3)]
    scale_x = target[0] / dimensions[0]
    scale_y = target[1] / dimensions[1]
    scale_z = target[2] / dimensions[2]
    model.scale = (scale_x, scale_z, scale_y)
    bpy.context.view_layer.objects.active = model
    model.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    _, minimum, maximum = model_metrics(model)
    center_x = (minimum[0] + maximum[0]) / 2.0
    center_z = (minimum[2] + maximum[2]) / 2.0
    model.location += Vector((-center_x, center_z, -minimum[1]))
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")


def normalize_model_uniform(model: bpy.types.Object, target_height: float) -> None:
    """Preserve authored character proportions while normalizing only total height."""
    _, minimum, maximum = model_metrics(model)
    height = maximum[1] - minimum[1]
    scale = target_height / height
    model.scale = (scale, scale, scale)
    bpy.context.view_layer.objects.active = model
    model.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    _, minimum, maximum = model_metrics(model)
    center_x = (minimum[0] + maximum[0]) / 2.0
    center_z = (minimum[2] + maximum[2]) / 2.0
    model.location += Vector((-center_x, center_z, -minimum[1]))
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")


def aim_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_turnaround_preview(model: bpy.types.Object, model_name: str) -> None:
    target_size = ASSET_SPECS[model_name][0]
    width, height, depth = target_size
    span = max(width, depth)
    spacing = span * 1.10
    rotations = (0.0, -math.radians(35), -math.radians(90), -math.radians(180))
    offsets = [spacing * (index - 1.5) for index in range(4)]
    views = [(model, offsets[0], rotations[0])]
    for x, rotation in zip(offsets[1:], rotations[1:]):
        duplicate = model.copy()
        duplicate.data = model.data.copy()
        bpy.context.collection.objects.link(duplicate)
        views.append((duplicate, x, rotation))
    for obj, x, rotation in views:
        obj.location = (x, 0, 0)
        obj.rotation_euler[2] = rotation

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 3
    scene.render.resolution_x = 2000
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(PREVIEW_DIR / f"{model_name}.png")
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -1.0

    world = bpy.data.worlds.new("Character Preview World")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.28, 0.25, 0.21, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.20

    backdrop = material("Warm preview backdrop", "#EEE9DF", 0.9)
    backdrop_shader = backdrop.node_tree.nodes["Principled BSDF"]
    emission_color = backdrop_shader.inputs.get("Emission Color") or backdrop_shader.inputs.get("Emission")
    emission_strength = backdrop_shader.inputs.get("Emission Strength")
    if emission_color is not None:
        emission_color.default_value = backdrop_shader.inputs["Base Color"].default_value
    if emission_strength is not None:
        emission_strength.default_value = 0.05
    ground_width = max(spacing * 3.2, 4.0)
    backdrop_size = max(ground_width * 4.0, 40.0)
    bpy.ops.mesh.primitive_plane_add(size=backdrop_size, location=(0, 0, -0.008))
    bpy.context.object.data.materials.append(backdrop)
    bpy.ops.mesh.primitive_plane_add(
        size=backdrop_size,
        location=(0, max(depth, 0.8), height * 0.65),
        rotation=(math.pi / 2, 0, 0),
    )
    bpy.context.object.data.materials.append(backdrop)

    target = Vector((0, 0, height * 0.50))
    bpy.ops.object.camera_add(location=(0, -max(height, span) * 7.0, height * 0.52))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    horizontal_need = spacing * 3 + span
    vertical_need = height * (2000 / 700)
    camera.data.ortho_scale = max(horizontal_need * 1.05, vertical_need * 1.08)
    aim_at(camera, target)
    scene.camera = camera

    light_span = max(height, horizontal_need)
    bpy.ops.object.light_add(type="AREA", location=(-light_span, -light_span * 1.3, height * 2.1))
    bpy.context.object.data.energy = 260
    bpy.context.object.data.size = light_span * 1.2
    bpy.ops.object.light_add(type="AREA", location=(light_span, -light_span * 0.4, height * 1.1))
    bpy.context.object.data.energy = 120
    bpy.context.object.data.size = light_span
    bpy.ops.render.render(write_still=True)


def generate_character(model_name: str) -> None:
    if model_name not in BUILDERS:
        raise ValueError(f"Unknown character model: {model_name}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _materials.clear()
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

    parts: list[bpy.types.Object] = []
    BUILDERS[model_name](parts)
    model = join_parts(parts, model_name)
    target, budget = ASSET_SPECS[model_name]
    if model_name == "partner":
        normalize_model_uniform(model, target[1])
    else:
        normalize_model(model, target)
    triangles, minimum, maximum = model_metrics(model)
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
    if glb_path.stat().st_size > 350 * 1024:
        raise RuntimeError(f"{model_name}: GLB exceeds 350 KB")
    setup_turnaround_preview(model, model_name)
    print("CHARACTER_METRICS=" + json.dumps({
        "model": model_name,
        "triangles": triangles,
        "budget": budget,
        "bbox": {"min": minimum, "max": maximum},
        "dimensions": [maximum[index] - minimum[index] for index in range(3)],
        "file_bytes": glb_path.stat().st_size,
    }, sort_keys=True))
