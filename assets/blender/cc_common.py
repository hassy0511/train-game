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

import character_common as cc  # noqa: E402
from town_common import ASSET_SPECS, MODEL_DIR  # noqa: E402

Paint = Union[str, Callable[[Vector, Vector], str]]
SCRATCH = Path(tempfile.gettempdir()) / "cc-bake"


# ---------------------------------------------------------------- basics

def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cc._materials.clear()


def mat(name: str, hex_color: str, roughness: float = 0.65) -> bpy.types.Material:
    return cc.material(name, hex_color, roughness)


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
    return tuple(cc.srgb_channel(int(hex_color[i:i + 2], 16)) for i in (1, 3, 5))


def gltf(v: Vector) -> Vector:
    return Vector((v.x, v.z, -v.y))


# ---------------------------------------------------------------- decals

def disc_decal(parts, name, center, size, material, rings=3, segments=18, tilt=0.0):
    """Flat ellipse facing +Z, later projected onto the surface."""
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
    return cc.add_mesh(parts, name, verts, faces, [material], smooth=True)


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
    return cc.add_mesh(parts, name, verts, faces, [material], smooth=True)


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
    return cc.add_mesh(parts, name, verts, faces, [material], smooth=True)


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


# ---------------------------------------------------------------- finish

def normalize(model: bpy.types.Object, height: float | None) -> None:
    """Uniform scale to `height` (None keeps the modelled size), then bottom-centre origin."""
    if height is not None:
        _, minimum, maximum = cc.model_metrics(model)
        scale = height / (maximum[1] - minimum[1])
        model.scale = (scale, scale, scale)
        active(model)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _, minimum, maximum = cc.model_metrics(model)
    model.location += Vector((-(minimum[0] + maximum[0]) / 2, (minimum[2] + maximum[2]) / 2, -minimum[1]))
    active(model)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")


def export(model: bpy.types.Object, name: str, budget: int, compare_with: str) -> None:
    """Export the GLB and a turnaround preview framed exactly like Codex's `compare_with` model."""
    tris, minimum, maximum = cc.model_metrics(model)
    if tris > budget:
        raise RuntimeError(f"{name}: {tris} triangles exceeds budget {budget}")
    dims = [maximum[i] - minimum[i] for i in range(3)]
    active(model)
    glb = MODEL_DIR / f"{name}.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", export_yup=True, use_selection=True,
                              export_image_format="JPEG", export_image_quality=88)
    if glb.stat().st_size > 350 * 1024:
        raise RuntimeError(f"{name}: GLB exceeds 350 KB")
    ASSET_SPECS[name] = (ASSET_SPECS[compare_with][0], budget)
    cc.setup_turnaround_preview(model, name)
    print("CHARACTER_METRICS=" + json.dumps({
        "model": name, "triangles": tris, "budget": budget, "dimensions": dims,
        "bbox": {"min": minimum, "max": maximum}, "file_bytes": glb.stat().st_size,
    }, sort_keys=True))
