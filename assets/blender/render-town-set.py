from pathlib import Path
import math

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "assets" / "previews" / "town-set.png"
BUILDINGS = ["house-a", "house-b", "house-c", "shop", "tower", "hq"]


def aim_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def matte(name, color):
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    shader = value.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = 0.82
    return value


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Two staggered rows keep the large HQ from hiding the smaller buildings.
    positions = [(-16, -6, 0), (-6, -6, 0), (3, -5, 0), (13, -5, 0), (-10, 9, 0), (7, 10, 0)]
    for name, (x, y, z) in zip(BUILDINGS, positions):
        bpy.ops.import_scene.gltf(filepath=str(ROOT / "public" / "models" / f"{name}.glb"))
        imported = [obj for obj in bpy.context.selected_objects if obj.type == "MESH"]
        if len(imported) != 1:
            raise RuntimeError(f"{name}: expected one imported mesh, got {len(imported)}")
        imported[0].location = (x, y, z)

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 3
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(OUTPUT)
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = bpy.data.worlds.new("Town Preview World")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.70, 0.78, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.55

    ground_mat = matte("Town Ground", (0.31, 0.48, 0.24, 1.0))
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.02))
    bpy.context.object.data.materials.append(ground_mat)
    road_mat = matte("Town Road", (0.22, 0.25, 0.27, 1.0))
    bpy.ops.mesh.primitive_cube_add(location=(0, -17, 0.02), scale=(40, 4.2, 0.04))
    bpy.context.object.data.materials.append(road_mat)
    walk_mat = matte("Town Walk", (0.63, 0.55, 0.43, 1.0))
    bpy.ops.mesh.primitive_cube_add(location=(0, -11.8, 0.05), scale=(40, 1.0, 0.07))
    bpy.context.object.data.materials.append(walk_mat)

    target = Vector((0, 1, 5.2))
    bpy.ops.object.camera_add(location=(45, -75, 41))
    camera = bpy.context.object
    aim_at(camera, target)
    camera.data.lens = 62
    scene.camera = camera
    bpy.ops.object.light_add(type="AREA", location=(8, -18, 35))
    bpy.context.object.data.energy = 2600
    bpy.context.object.data.size = 28
    bpy.ops.object.light_add(type="AREA", location=(-30, 5, 18))
    bpy.context.object.data.energy = 1400
    bpy.context.object.data.size = 20

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print(f"TOWN_SET_PREVIEW={OUTPUT}")


if __name__ == "__main__":
    main()
