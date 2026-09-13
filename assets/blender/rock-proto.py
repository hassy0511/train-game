from pathlib import Path
import json
import random

import bpy
from mathutils import Vector


MODEL_NAME = "rock-proto"
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


def normalize_axis(vertices, axis, minimum, maximum):
    old_minimum = min(vertex.co[axis] for vertex in vertices)
    old_maximum = max(vertex.co[axis] for vertex in vertices)
    old_range = old_maximum - old_minimum
    for vertex in vertices:
        ratio = (vertex.co[axis] - old_minimum) / old_range
        vertex.co[axis] = minimum + ratio * (maximum - minimum)


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
    bpy.ops.mesh.primitive_plane_add(size=9.0, location=(0.0, 0.0, -0.01))
    bpy.context.object.data.materials.append(ground_material)

    bpy.ops.object.light_add(type="AREA", location=(3.5, -4.5, 5.5))
    bpy.context.object.data.energy = 500.0
    bpy.context.object.data.size = 4.0
    bpy.ops.object.light_add(type="AREA", location=(-3.0, -1.0, 2.5))
    bpy.context.object.data.energy = 220.0
    bpy.context.object.data.size = 3.0

    bpy.ops.object.camera_add(location=(3.2, -4.2, 2.6))
    camera = bpy.context.object
    direction = Vector((0.0, 0.0, 0.55)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 62.0
    scene.camera = camera
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    PREVIEW_PATH.parent.mkdir(parents=True, exist_ok=True)

    rock_material = make_material("Rock", "#8E8E8E")
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.0, location=(0.0, 0.0, 0.0))
    model = bpy.context.object
    model.name = MODEL_NAME
    model.data.name = MODEL_NAME
    model.data.materials.append(rock_material)

    rng = random.Random(240913)
    for vertex in model.data.vertices:
        radial = 1.0 + rng.uniform(-0.16, 0.16)
        vertex.co *= radial
        vertex.co.x += rng.uniform(-0.06, 0.06)
        vertex.co.y += rng.uniform(-0.05, 0.05)
        vertex.co.z += rng.uniform(-0.04, 0.04)

    normalize_axis(model.data.vertices, 0, -1.0, 1.0)
    normalize_axis(model.data.vertices, 1, -0.8, 0.8)
    normalize_axis(model.data.vertices, 2, 0.0, 1.2)
    for vertex in model.data.vertices:
        if vertex.co.z < 0.24:
            vertex.co.z = 0.0
    model.data.update()
    for polygon in model.data.polygons:
        polygon.use_smooth = False
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")

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
        "seed": 240913,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
