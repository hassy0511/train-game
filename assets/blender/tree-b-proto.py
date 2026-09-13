from pathlib import Path
import json

import bpy
from mathutils import Vector


MODEL_NAME = "tree-b-proto"
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
    mesh = model.data
    mesh.calc_loop_triangles()
    points = []
    for vertex in mesh.vertices:
        point = model.matrix_world @ vertex.co
        points.append((point.x, point.z, -point.y))
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    return len(mesh.loop_triangles), minimum, maximum


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
    bpy.ops.mesh.primitive_plane_add(size=14.0, location=(0.0, 0.0, -0.01))
    bpy.context.object.data.materials.append(ground_material)

    bpy.ops.object.light_add(type="AREA", location=(4.5, -5.5, 7.0))
    bpy.context.object.data.energy = 650.0
    bpy.context.object.data.shape = "DISK"
    bpy.context.object.data.size = 5.0
    bpy.ops.object.light_add(type="AREA", location=(-4.0, -1.5, 4.0))
    bpy.context.object.data.energy = 300.0
    bpy.context.object.data.size = 4.0

    bpy.ops.object.camera_add(location=(6.0, -7.8, 5.1))
    camera = bpy.context.object
    direction = Vector((0.0, 0.0, 2.2)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 58.0
    scene.camera = camera
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    PREVIEW_PATH.parent.mkdir(parents=True, exist_ok=True)

    trunk_material = make_material("Trunk", "#8B5A2B")
    leaf_material = make_material("Leaves", "#6CBF3F")

    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.3, depth=1.5, location=(0.0, 0.0, 0.75))
    trunk = bpy.context.object
    trunk.data.materials.append(trunk_material)

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.8, location=(0.0, 0.0, 2.8))
    leaves = bpy.context.object
    leaves.data.materials.append(leaf_material)

    model = join_parts([trunk, leaves])
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
