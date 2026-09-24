"""Shared pipeline for Claude Code's character models (`*-cc`).

1. Clay: overlapping volumes (each with a paint rule) are fused into one surface by a voxel remesh.
2. Paint: every vertex of that dense surface takes the colour of the nearest source volume's rule
   (rules may depend on position and normal, e.g. tabby stripes or boot bands).
3. Bake: a decimated copy is UV-unwrapped and the dense colours are baked into one small texture, so
   colour edges stay crisp at a low triangle count.
4. Solids (hats, capes, rings) keep their own flat materials; faces are decals projected onto the clay.

Coordinates in this module are glTF metres: X right, Y up, Z forward (the face looks toward +Z).
"""
from __future__ import annotations

from pathlib import Path
from typing import Callable, Union
import json
import math
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402  (must come first: it provides bmesh and mathutils)
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

Paint = Union[str, Callable[[Vector, Vector], str]]
SCRATCH = Path(tempfile.gettempdir()) / "cc-bake"
ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / "public" / "models"
PREVIEW_DIR = ROOT / "assets" / "previews"
_materials: dict[tuple[str, str], bpy.types.Material] = {}


# ---------------------------------------------------------------- primitives (glTF coordinates)

def srgb_channel(value: int) -> float:
    channel = value / 255.0
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def material(name: str, hex_color: str, roughness: float = 0.65) -> bpy.types.Material:
    key = (name, hex_color)
    if key in _materials:
        return _materials[key]
    rgb = tuple(srgb_channel(int(hex_color[i:i + 2], 16)) for i in (1, 3, 5))
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    value.use_backface_culling = True
    shader = value.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (*rgb, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    value.diffuse_color = (*rgb, 1.0)
    _materials[key] = value
    return value


def to_blender(point) -> tuple[float, float, float]:
    x, y, z = point
    return (x, -z, y)


def _finish(obj: bpy.types.Object, mat: bpy.types.Material, smooth: bool) -> bpy.types.Object:
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = smooth
    return obj


def add_mesh(parts, name, vertices, faces, materials, material_indices=None, smooth=False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([to_blender(p) for p in vertices], [], faces)
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


def add_ellipsoid(parts, name, size, center, mat, segments=20, rings=10, smooth=True):
    width, height, depth = size
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1.0,
                                         location=to_blender(center))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (width / 2.0, depth / 2.0, height / 2.0)
    _finish(obj, mat, smooth)
    parts.append(obj)
    return obj


def add_box(parts, name, size, center, mat, bevel=0.0, segments=2, smooth=False):
    width, height, depth = size
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=to_blender(center))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (width, depth, height)
    _finish(obj, mat, smooth)
    if bevel > 0:
        modifier = obj.modifiers.new(name="bevel", type="BEVEL")
        modifier.width = bevel
        modifier.segments = segments
        modifier.limit_method = "ANGLE"
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        for polygon in obj.data.polygons:
            polygon.use_smooth = smooth
    parts.append(obj)
    return obj


def add_tapered_segment(parts, name, start, end, radius_start, radius_end, mat, vertices=12, smooth=True):
    start_b, end_b = Vector(to_blender(start)), Vector(to_blender(end))
    direction = end_b - start_b
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius_start, radius2=radius_end,
                                    depth=direction.length, location=(start_b + end_b) / 2.0)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    _finish(obj, mat, smooth)
    parts.append(obj)
    return obj


def add_swept_tube(parts, name, points, radii, segment_materials, sides=12, smooth=True):
    """Closed tube along a polyline; one material per segment (used for stripes)."""
    vectors = [Vector(p) for p in points]
    verts = []
    for index, center in enumerate(vectors):
        previous = vectors[max(index - 1, 0)]
        following = vectors[min(index + 1, len(vectors) - 1)]
        tangent = (following - previous).normalized()
        reference = Vector((0, 0, 1)) if abs(tangent.z) < 0.9 else Vector((1, 0, 0))
        normal = tangent.cross(reference).normalized()
        binormal = tangent.cross(normal).normalized()
        for side in range(sides):
            angle = 2 * math.pi * side / sides
            verts.append(tuple(center + normal * (math.cos(angle) * radii[index])
                               + binormal * (math.sin(angle) * radii[index])))
    faces = [tuple(range(sides - 1, -1, -1))]
    indices = [0]
    for segment in range(len(points) - 1):
        a, b = segment * sides, (segment + 1) * sides
        for side in range(sides):
            n = (side + 1) % sides
            faces.append((a + side, a + n, b + n, b + side))
            indices.append(segment)
    last = (len(points) - 1) * sides
    faces.append(tuple(last + side for side in range(sides)))
    indices.append(len(segment_materials) - 1)
    return add_mesh(parts, name, verts, faces, segment_materials, material_indices=indices, smooth=smooth)


def add_profiled_volume(parts, name, rings, mat, segments=20, smooth=True):
    """Stack of horizontal ellipses (y, radius_x, radius_z, center_x, center_z), capped at both ends."""
    verts = []
    for y, rx, rz, cx, cz in rings:
        for i in range(segments):
            a = 2 * math.pi * i / segments
            verts.append((cx + math.cos(a) * rx, y, cz + math.sin(a) * rz))
    faces = [tuple(range(segments - 1, -1, -1))]
    for r in range(len(rings) - 1):
        a, b = r * segments, (r + 1) * segments
        for i in range(segments):
            n = (i + 1) % segments
            faces.append((a + i, a + n, b + n, b + i))
    last = (len(rings) - 1) * segments
    faces.append(tuple(last + i for i in range(segments)))
    return add_mesh(parts, name, verts, faces, [mat], smooth=smooth)


def add_loft_z(parts, name, sections, materials, face_material=None, smooth=False):
    """Loft closed outlines along Z. `sections` = [(z, [(x, y), ...])] with equal point counts, outlines
    counter-clockwise when seen from +Z. `face_material(center, normal) -> index` colours each face
    (glTF coordinates); caps included."""
    n = len(sections[0][1])
    verts = [(x, y, z) for z, outline in sections for x, y in outline]
    faces = [tuple(range(n - 1, -1, -1))]
    for i in range(len(sections) - 1):
        a, b = i * n, (i + 1) * n
        for j in range(n):
            m = (j + 1) % n
            faces.append((a + j, a + m, b + m, b + j))
    last = (len(sections) - 1) * n
    faces.append(tuple(last + j for j in range(n)))
    obj = add_mesh(parts, name, verts, faces, materials, smooth=smooth)
    if face_material:
        for polygon in obj.data.polygons:
            c = polygon.center
            nrm = polygon.normal
            polygon.material_index = face_material(Vector((c.x, c.z, -c.y)), Vector((nrm.x, nrm.z, -nrm.y)))
    return obj


def smooth_by_angle(obj: bpy.types.Object, degrees: float = 32.0) -> None:
    """Smooth shading with hard edges above `degrees` (exported as split normals)."""
    active(obj)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(degrees))


def model_metrics(model: bpy.types.Object) -> tuple[int, list[float], list[float]]:
    model.data.calc_loop_triangles()
    pts = [model.matrix_world @ v.co for v in model.data.vertices]
    pts = [(p.x, p.z, -p.y) for p in pts]
    minimum = [min(p[a] for p in pts) for a in range(3)]
    maximum = [max(p[a] for p in pts) for a in range(3)]
    return len(model.data.loop_triangles), minimum, maximum


# ---------------------------------------------------------------- basics

def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _materials.clear()


def mat(name: str, hex_color: str, roughness: float = 0.65) -> bpy.types.Material:
    return material(name, hex_color, roughness)


def active(obj: bpy.types.Object) -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
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
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
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


def triangles(obj: bpy.types.Object) -> int:
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def hex_linear(hex_color: str) -> tuple[float, float, float]:
    return tuple(srgb_channel(int(hex_color[i:i + 2], 16)) for i in (1, 3, 5))


def gltf(v: Vector) -> Vector:
    return Vector((v.x, v.z, -v.y))


# ---------------------------------------------------------------- decals

def disc_decal(parts, name, center, size, material, rings=3, segments=18, tilt=0.0, facing=1):
    """Flat ellipse facing +Z (or -Z with facing=-1), usually projected onto a surface afterwards."""
    cx, cy, cz = center
    w, h = size
    verts = [(cx, cy, cz)]
    for ring in range(1, rings + 1):
        r = ring / rings
        for s in range(segments):
            a = 2 * math.pi * s / segments
            x, y = math.cos(a) * w / 2 * r, math.sin(a) * h / 2 * r
            verts.append((cx + x * math.cos(tilt) - y * math.sin(tilt),
                          cy + x * math.sin(tilt) + y * math.cos(tilt), cz))
    faces = [(0, 1 + s, 1 + (s + 1) % segments) for s in range(segments)]
    for ring in range(1, rings):
        a0, a1 = 1 + (ring - 1) * segments, 1 + ring * segments
        for s in range(segments):
            n = (s + 1) % segments
            faces.append((a0 + s, a1 + s, a1 + n, a0 + n))
    if facing < 0:
        faces = [tuple(reversed(f)) for f in faces]
    return add_mesh(parts, name, verts, faces, [material], smooth=True)


def poly_decal(parts, name, outline, z, material, rings=3):
    """Flat star-shaped polygon (outline listed counter-clockwise as seen from +Z) at depth z."""
    cx = sum(p[0] for p in outline) / len(outline)
    cy = sum(p[1] for p in outline) / len(outline)
    n = len(outline)
    verts = [(cx, cy, z)]
    for ring in range(1, rings + 1):
        r = ring / rings
        for x, y in outline:
            verts.append((cx + (x - cx) * r, cy + (y - cy) * r, z))
    faces = [(0, 1 + s, 1 + (s + 1) % n) for s in range(n)]
    for ring in range(1, rings):
        a0, a1 = 1 + (ring - 1) * n, 1 + ring * n
        for s in range(n):
            m = (s + 1) % n
            faces.append((a0 + s, a1 + s, a1 + m, a0 + m))
    return add_mesh(parts, name, verts, faces, [material], smooth=True)


def ribbon_decal(parts, name, points, width, material, taper=True):
    """Flat strip along a polyline of (x, y, z) points, facing +Z."""
    verts = []
    for i, (x, y, z) in enumerate(points):
        a = points[max(i - 1, 0)]
        b = points[min(i + 1, len(points) - 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        length = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / length, tx / length
        k = 0.55 + 0.45 * math.sin(math.pi * i / (len(points) - 1)) if taper else 1.0
        half = width / 2 * k
        verts.append((x + nx * half, y + ny * half, z))
        verts.append((x - nx * half, y - ny * half, z))
    faces = [(2 * i + 1, 2 * i + 3, 2 * i + 2, 2 * i) for i in range(len(points) - 1)]
    return add_mesh(parts, name, verts, faces, [material], smooth=True)


def arc_points(center, half_width, bend, z, samples=11, tilt=0.0):
    cx, cy = center
    pts = []
    for i in range(samples):
        t = -1 + 2 * i / (samples - 1)
        pts.append((cx + t * half_width, cy + bend * (1 - t * t) + tilt * t, z))
    return pts


def wrap_onto(decal: bpy.types.Object, target: bpy.types.Object, offset: float) -> None:
    """Project the decal straight back along Z onto the target surface, like a pressed sticker."""
    apply_modifier(decal, "SHRINKWRAP", target=target, wrap_method="PROJECT",
                   use_project_y=True, use_negative_direction=True, use_positive_direction=True,
                   wrap_mode="ON_SURFACE", offset=offset)


# ---------------------------------------------------------------- clay + paint + bake

def world_tree(obj: bpy.types.Object) -> BVHTree:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


def painted_clay(parts: list[tuple[bpy.types.Object, Paint]], name: str, voxel: float, budget: int,
                 texture: int = 512, ground: bool = True, smooth: int = 3) -> bpy.types.Object:
    """Fuse the volumes, paint the dense surface, bake it onto a decimated copy. Returns the low mesh."""
    bpy.context.view_layer.update()
    rules = [(world_tree(obj), paint) for obj, paint in parts]

    high = join([obj for obj, _ in parts], f"{name}-high")
    apply_modifier(high, "REMESH", mode="VOXEL", voxel_size=voxel, adaptivity=0.0)
    if ground:
        active(high)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.bisect(plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
        bpy.ops.object.mode_set(mode="OBJECT")
    if smooth:
        apply_modifier(high, "SMOOTH", factor=0.5, iterations=smooth)

    # Paint: nearest source volume decides which rule colours the vertex.
    mesh = high.data
    cache: dict[str, tuple[float, float, float]] = {}
    colours: list[float] = []
    for vertex in mesh.vertices:
        co = vertex.co
        best, best_d = None, math.inf
        for tree, paint in rules:
            hit = tree.find_nearest(co)
            if hit[3] is not None and hit[3] < best_d:
                best, best_d = paint, hit[3]
        hex_color = best if isinstance(best, str) else best(gltf(co), gltf(vertex.normal))
        rgb = cache.get(hex_color) or cache.setdefault(hex_color, hex_linear(hex_color))
        colours.extend((*rgb, 1.0))
    attribute = mesh.color_attributes.new(name="paint", type="FLOAT_COLOR", domain="POINT")
    attribute.data.foreach_set("color", colours)

    source = bpy.data.materials.new(f"{name}-bake-source")
    source.use_nodes = True
    nodes = source.node_tree.nodes
    nodes.clear()
    attr = nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "paint"
    emit = nodes.new("ShaderNodeEmission")
    out = nodes.new("ShaderNodeOutputMaterial")
    source.node_tree.links.new(attr.outputs["Color"], emit.inputs["Color"])
    source.node_tree.links.new(emit.outputs[0], out.inputs["Surface"])
    mesh.materials.clear()
    mesh.materials.append(source)

    low = high.copy()
    low.data = high.data.copy()
    low.name = name
    low.data.name = name
    bpy.context.collection.objects.link(low)
    low.data.color_attributes.remove(low.data.color_attributes["paint"])
    apply_modifier(low, "DECIMATE", decimate_type="COLLAPSE", ratio=min(1.0, budget / triangles(high)),
                   use_collapse_triangulate=True)
    set_smooth(low)
    active(low)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.012)
    bpy.ops.object.mode_set(mode="OBJECT")

    image = bpy.data.images.new(f"{name}-skin", texture, texture, alpha=False)
    skin = bpy.data.materials.new(f"{name} skin")
    skin.use_nodes = True
    tree = skin.node_tree
    bsdf = tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.65
    tex = tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Linear"
    tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    tree.nodes.active = tex
    low.data.materials.clear()
    low.data.materials.append(skin)

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 4
    bpy.ops.object.select_all(action="DESELECT")
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.bake(type="EMIT", use_selected_to_active=True, cage_extrusion=voxel * 1.5,
                        max_ray_distance=voxel * 6, margin=6, use_clear=True)
    SCRATCH.mkdir(parents=True, exist_ok=True)
    image.filepath_raw = str(SCRATCH / f"{name}-skin.png")
    image.file_format = "PNG"
    image.save()

    bpy.data.objects.remove(high, do_unlink=True)
    return low


def flat_clay(objects: list[bpy.types.Object], name: str, material_: bpy.types.Material, voxel: float,
              budget: int, ground: bool = False, smooth: int = 3) -> bpy.types.Object:
    """Fuse same-colour volumes into one smooth surface with a single flat material (no texture)."""
    clay = join(objects, name)
    apply_modifier(clay, "REMESH", mode="VOXEL", voxel_size=voxel, adaptivity=0.0)
    if ground:
        active(clay)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.bisect(plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
        bpy.ops.object.mode_set(mode="OBJECT")
    if smooth:
        apply_modifier(clay, "SMOOTH", factor=0.5, iterations=smooth)
    apply_modifier(clay, "DECIMATE", decimate_type="COLLAPSE", ratio=min(1.0, budget / max(triangles(clay), 1)),
                   use_collapse_triangulate=True)
    clay.data.materials.clear()
    clay.data.materials.append(material_)
    set_smooth(clay)
    return clay


# ---------------------------------------------------------------- finish

def normalize(model: bpy.types.Object, height: float | None, center: bool = True) -> None:
    """Uniform scale to `height` (None keeps the modelled size), then bottom-centre origin.
    `center=False` keeps the modelled X/Z origin (vehicles: the car centre, not the bbox centre)."""
    if height is not None:
        _, minimum, maximum = model_metrics(model)
        scale = height / (maximum[1] - minimum[1])
        model.scale = (scale, scale, scale)
        active(model)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _, minimum, maximum = model_metrics(model)
    if center:
        model.location += Vector((-(minimum[0] + maximum[0]) / 2, (minimum[2] + maximum[2]) / 2, -minimum[1]))
    else:
        model.location += Vector((0, 0, -minimum[1]))
    active(model)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")


def _studio(scene, target: Vector, span: float, width: int, height: int, path: Path) -> None:
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.compression = 90
    scene.render.filepath = str(path)
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    world = bpy.data.worlds.new("studio")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.93, 0.92, 0.90, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.85
    floor = material("studio floor", "#F4F1EA", 0.9)
    bpy.ops.mesh.primitive_plane_add(size=span * 40, location=(target.x, target.y, -0.002))
    bpy.context.object.data.materials.append(floor)
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 10), rotation=(math.radians(40), 0, math.radians(25)))
    bpy.context.object.data.energy = 2.4
    bpy.context.object.data.angle = math.radians(14)


def preview_character(model: bpy.types.Object, name: str) -> None:
    """Front, three-quarter and side views on one strip (orthographic, same scale)."""
    _, minimum, maximum = model_metrics(model)
    width, height, depth = (maximum[i] - minimum[i] for i in range(3))
    span = max(width, depth)
    spacing = span * 1.25
    for i, rot in enumerate((0.0, math.radians(-35), math.radians(-90))):
        view = model if i == 0 else model.copy()
        if i:
            view.data = model.data.copy()
            bpy.context.collection.objects.link(view)
        view.location = ((i - 1) * spacing, 0, 0)
        view.rotation_euler[2] = rot
    scene = bpy.context.scene
    target = Vector((0, 0, height * 0.5))
    _studio(scene, target, max(span, height), 1200, 525, PREVIEW_DIR / f"{name}.png")
    bpy.ops.object.camera_add(location=(0, -max(height, span) * 8, height * 0.5))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = max((spacing * 2 + span) * 1.08, height * (1200 / 525) * 1.1)
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    bpy.ops.render.render(write_still=True)


def preview_world(model: bpy.types.Object, name: str, facing: int = 1) -> None:
    """One three-quarter view of the readable side (+Z, or -Z with facing=-1), fitted to the bounding
    sphere, 512 x 512."""
    _, minimum, maximum = model_metrics(model)
    size = Vector([maximum[i] - minimum[i] for i in range(3)])
    center = Vector(to_blender([(maximum[i] + minimum[i]) / 2 for i in range(3)]))
    span = max(size)
    radius = size.length / 2
    scene = bpy.context.scene
    _studio(scene, center, span, 512, 512, PREVIEW_DIR / f"{name}.png")
    direction = Vector((0.55, -0.72 * facing, 0.42)).normalized()
    bpy.ops.object.camera_add(location=center + direction * radius * 2.9)
    camera = bpy.context.object
    camera.data.lens = 50
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    bpy.ops.render.render(write_still=True)


def export(model: bpy.types.Object, name: str, budget: int, kind: str = "character", max_kb: int = 350,
           facing: int = 1) -> None:
    """Export the GLB (JPEG textures) and a preview; fails loudly when over budget."""
    tris, minimum, maximum = model_metrics(model)
    if tris > budget:
        raise RuntimeError(f"{name}: {tris} triangles exceeds budget {budget}")
    dims = [maximum[i] - minimum[i] for i in range(3)]
    active(model)
    glb = MODEL_DIR / f"{name}.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", export_yup=True, use_selection=True,
                              export_image_format="JPEG", export_image_quality=88)
    if glb.stat().st_size > max_kb * 1024:
        raise RuntimeError(f"{name}: GLB exceeds {max_kb} KB")
    if kind == "character":
        preview_character(model, name)
    else:
        preview_world(model, name, facing)
    print("MODEL_METRICS=" + json.dumps({
        "model": name, "triangles": tris, "budget": budget, "dimensions": [round(d, 3) for d in dims],
        "min_y": round(minimum[1], 4), "file_bytes": glb.stat().st_size,
    }, sort_keys=True))
