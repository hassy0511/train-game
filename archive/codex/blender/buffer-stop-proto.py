from pathlib import Path
import json
import math

import bpy
from mathutils import Vector


MODEL_NAME = "buffer-stop-proto"
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


def add_diagonal_brace(name, x_center, material):
    bottom_y = -0.42
    top_y = -0.10
    delta_y = top_y - bottom_y
    delta_z = 1.05
    length = math.hypot(delta_y, delta_z)
    half = 0.075
    perpendicular_y = -delta_z / length * half
    perpendicular_z = delta_y / length * half
    bottom_z = abs(perpendicular_z)
    top_z = 1.2 - abs(perpendicular_z)
    centers = ((bottom_y, bottom_z), (top_y, top_z))
    vertices = []
    for center_y, center_z in centers:
        for offset in (-1.0, 1.0):
            y = center_y + perpendicular_y * offset
            z = center_z + perpendicular_z * offset
            vertices.append((x_center - half, y, z))
            vertices.append((x_center + half, y, z))
    faces = [
        (0, 2, 3, 1),
        (4, 5, 7, 6),
        (0, 1, 5, 4),
        (1, 3, 7, 5),
        (3, 2, 6, 7),
        (2, 0, 4, 6),
    ]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
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
    bpy.ops.mesh.primitive_plane_add(size=10.0, location=(0.0, 0.0, -0.01))
    bpy.context.object.data.materials.append(ground_material)

    bpy.ops.object.light_add(type="AREA", location=(4.0, -4.5, 5.0))
    bpy.context.object.data.energy = 550.0
    bpy.context.object.data.size = 4.0
    bpy.ops.object.light_add(type="AREA", location=(-3.0, -1.0, 2.5))
    bpy.context.object.data.energy = 250.0
    bpy.context.object.data.size = 3.0

    bpy.ops.object.camera_add(location=(4.4, -5.6, 2.8))
    camera = bpy.context.object
    direction = Vector((0.0, 0.0, 0.6)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 60.0
    scene.camera = camera
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    PREVIEW_PATH.parent.mkdir(parents=True, exist_ok=True)

    board_material = make_material("Stop Board", "#D64545")
    support_material = make_material("Supports", "#3A3F47")
    parts = [add_box("board", (3.2, 0.2, 0.4), (0.0, 0.0, 0.8), board_material)]
    for x_center in (-1.2, 1.2):
        parts.append(add_box(f"foot-{x_center}", (0.15, 1.0, 0.15), (x_center, 0.0, 0.075), support_material))
        parts.append(add_diagonal_brace(f"brace-{x_center}", x_center, support_material))

    model = join_parts(parts)
    bpy.ops.object.select_all(action="DESELECT")
    model.select_set(True)
    bpy.context.view_layer.objects.active = model
    bpy.ops.export_scene.gltf(filepath=str(GLB_PATH), export_format="GLB", export_yup=True, use_selection=True)

    triangles, minimum, maximum = gltf_metrics(model)
    render_preview(model)
    print("ASSET_METRICS=" + json.dumps({
        "model": MODEL_NAME,
        "triangles": triangles,
        "bbox": {"min": minimum, "max": maximum},
        "file_bytes": GLB_PATH.stat().st_size,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
