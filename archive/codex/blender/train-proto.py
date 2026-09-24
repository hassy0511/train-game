from pathlib import Path
import json
import math

import bpy
from mathutils import Vector


MODEL_NAME = "train-proto"
ROOT = Path(__file__).resolve().parents[2]
GLB_PATH = ROOT / "public" / "models" / f"{MODEL_NAME}.glb"
PREVIEW_PATH = ROOT / "assets" / "previews" / f"{MODEL_NAME}.png"


def srgb_channel(value):
    value /= 255.0
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def make_material(name, hex_color):
    rgb = tuple(srgb_channel(int(hex_color[index:index + 2], 16)) for index in (1, 3, 5))
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = True
    material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*rgb, 1.0)
    material.diffuse_color = (*rgb, 1.0)
    return material


def add_box(name, dimensions, location, material):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return obj


def add_quad(name, vertices, material):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [(0, 1, 2, 3)])
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def add_body(body_material, roof_material):
    rings = [
        ((1.5, 6.0), 1.0),
        ((1.5, 6.0), 3.3),
        ((1.5, 6.0), 3.4),
        ((1.3, 5.8), 3.6),
    ]
    vertices = []
    for (half_x, half_y), height in rings:
        vertices.extend([
            (-half_x, -half_y, height),
            (half_x, -half_y, height),
            (half_x, half_y, height),
            (-half_x, half_y, height),
        ])
    faces = []
    material_indices = []
    for ring_index in range(len(rings) - 1):
        base = ring_index * 4
        next_base = base + 4
        for side in range(4):
            next_side = (side + 1) % 4
            faces.append((base + side, base + next_side, next_base + next_side, next_base + side))
            material_indices.append(0 if ring_index == 0 else 1)
    faces.append((0, 3, 2, 1))
    material_indices.append(0)
    faces.append((12, 13, 14, 15))
    material_indices.append(1)

    mesh = bpy.data.meshes.new("body")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(body_material)
    mesh.materials.append(roof_material)
    for polygon, material_index in zip(mesh.polygons, material_indices):
        polygon.material_index = material_index
    obj = bpy.data.objects.new("body", mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def join_parts(parts):
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    model = bpy.context.object
    model.name = MODEL_NAME
    model.data.name = MODEL_NAME
    for polygon in model.data.polygons:
        polygon.use_smooth = False
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    return model


def gltf_metrics(model):
    model.data.calc_loop_triangles()
    points = []
    for vertex in model.data.vertices:
        point = model.matrix_world @ vertex.co
        points.append((point.x, point.z, -point.y))
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    return len(model.data.loop_triangles), minimum, maximum


def render_preview(model):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(PREVIEW_PATH)

    world = bpy.data.worlds.new("Preview World")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.72, 0.72, 0.72, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.7

    ground_material = make_material("Preview Ground", "#D8D8D4")
    bpy.ops.mesh.primitive_plane_add(size=34.0, location=(0.0, 0.0, -0.01))
    bpy.context.object.data.materials.append(ground_material)

    bpy.ops.object.light_add(type="AREA", location=(8.0, -10.0, 12.0))
    bpy.context.object.data.energy = 1100.0
    bpy.context.object.data.shape = "DISK"
    bpy.context.object.data.size = 7.0
    bpy.ops.object.light_add(type="AREA", location=(-7.0, -2.0, 7.0))
    bpy.context.object.data.energy = 500.0
    bpy.context.object.data.size = 6.0

    bpy.ops.object.camera_add(location=(10.5, -16.0, 8.2))
    camera = bpy.context.object
    direction = Vector((0.0, 0.0, 1.7)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 56.0
    scene.camera = camera
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    PREVIEW_PATH.parent.mkdir(parents=True, exist_ok=True)

    body_material = make_material("Body", "#3FA7D6")
    roof_material = make_material("Roof Band", "#F4F4F0")
    underbody_material = make_material("Underbody and Wheels", "#3A3F47")
    window_material = make_material("Windows", "#1F2A44")
    headlight_material = make_material("Headlight Band", "#FFE066")
    interior_material = make_material("Cab Interior", "#2E3238")
    dashboard_material = make_material("Dashboard", "#23272B")

    parts = [
        add_body(body_material, roof_material),
        add_box("underbody", (2.4, 11.2, 0.65), (0.0, 0.0, 0.675), underbody_material),
    ]

    for x_center in (-0.75, 0.75):
        for gltf_z in (-4.0, 4.0):
            bpy.ops.mesh.primitive_cylinder_add(
                vertices=8,
                radius=0.45,
                depth=0.2,
                location=(x_center, -gltf_z, 0.45),
                rotation=(0.0, math.radians(90.0), 0.0),
            )
            wheel = bpy.context.object
            wheel.name = f"wheel-{x_center}-{gltf_z}"
            wheel.data.materials.append(underbody_material)
            parts.append(wheel)

    front_y = -6.01
    parts.append(add_quad("front-window", [
        (-1.2, front_y, 2.0),
        (1.2, front_y, 2.0),
        (1.2, front_y, 3.2),
        (-1.2, front_y, 3.2),
    ], window_material))
    parts.append(add_quad("headlight-band", [
        (-0.8, front_y, 1.3),
        (0.8, front_y, 1.3),
        (0.8, front_y, 1.5),
        (-0.8, front_y, 1.5),
    ], headlight_material))

    for gltf_z in (-4.2, -1.4, 1.4, 4.2):
        source_y = -gltf_z
        y_min = source_y - 0.8
        y_max = source_y + 0.8
        parts.append(add_quad(f"right-window-{gltf_z}", [
            (1.51, y_min, 2.0),
            (1.51, y_max, 2.0),
            (1.51, y_max, 3.0),
            (1.51, y_min, 3.0),
        ], window_material))
        parts.append(add_quad(f"left-window-{gltf_z}", [
            (-1.51, y_max, 2.0),
            (-1.51, y_min, 2.0),
            (-1.51, y_min, 3.0),
            (-1.51, y_max, 3.0),
        ], window_material))

    inner_front_y = -5.95
    for name, x_min, x_max, z_min, z_max in (
        ("cab-front-left", -1.45, -1.2, 1.0, 3.5),
        ("cab-front-right", 1.2, 1.45, 1.0, 3.5),
        ("cab-front-bottom", -1.2, 1.2, 1.0, 2.0),
        ("cab-front-top", -1.2, 1.2, 3.2, 3.5),
    ):
        parts.append(add_quad(name, [
            (x_min, inner_front_y, z_min),
            (x_min, inner_front_y, z_max),
            (x_max, inner_front_y, z_max),
            (x_max, inner_front_y, z_min),
        ], interior_material))

    cab_back_y = -3.0
    parts.append(add_quad("cab-floor", [
        (-1.45, inner_front_y, 1.0),
        (1.45, inner_front_y, 1.0),
        (1.45, cab_back_y, 1.0),
        (-1.45, cab_back_y, 1.0),
    ], interior_material))
    parts.append(add_quad("cab-ceiling", [
        (-1.45, cab_back_y, 3.5),
        (1.45, cab_back_y, 3.5),
        (1.45, inner_front_y, 3.5),
        (-1.45, inner_front_y, 3.5),
    ], interior_material))
    parts.append(add_quad("cab-left-wall", [
        (-1.45, inner_front_y, 1.0),
        (-1.45, cab_back_y, 1.0),
        (-1.45, cab_back_y, 3.5),
        (-1.45, inner_front_y, 3.5),
    ], interior_material))
    parts.append(add_quad("cab-right-wall", [
        (1.45, cab_back_y, 1.0),
        (1.45, inner_front_y, 1.0),
        (1.45, inner_front_y, 3.5),
        (1.45, cab_back_y, 3.5),
    ], interior_material))
    parts.append(add_box("dashboard", (2.8, 0.6, 0.3), (0.0, -5.6, 1.85), dashboard_material))

    model = join_parts(parts)
    bpy.ops.object.select_all(action="DESELECT")
    model.select_set(True)
    bpy.context.view_layer.objects.active = model
    bpy.ops.export_scene.gltf(filepath=str(GLB_PATH), export_format="GLB", export_yup=True, use_selection=True)

    triangles, minimum, maximum = gltf_metrics(model)
    preview_roof_color = roof_material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value
    interior_material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = preview_roof_color
    interior_material.diffuse_color = preview_roof_color
    render_preview(model)
    print("ASSET_METRICS=" + json.dumps({
        "model": MODEL_NAME,
        "triangles": triangles,
        "bbox": {"min": minimum, "max": maximum},
        "file_bytes": GLB_PATH.stat().st_size,
        "cab_camera_gltf": [0.0, 2.4, 4.6],
    }, sort_keys=True))


if __name__ == "__main__":
    main()
