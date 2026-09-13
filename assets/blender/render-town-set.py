from pathlib import Path
import math

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "assets" / "previews" / "town-set.png"
BUILDINGS = ["house-a", "house-b", "house-c", "shop", "tower", "hq"]


def aim_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Two staggered rows keep the large HQ from hiding the smaller buildings.
    positions = [(-19, -7, 0), (-8, -7, 0), (2, -7, 0), (14, -7, 0), (-11, 8, 0), (8, 10, 0)]
    for name, (x, y, z) in zip(BUILDINGS, positions):
        bpy.ops.import_scene.gltf(filepath=str(ROOT / "public" / "models" / f"{name}.glb"))
        imported = [obj for obj in bpy.context.selected_objects if obj.type == "MESH"]
        if len(imported) != 1:
            raise RuntimeError(f"{name}: expected one imported mesh, got {len(imported)}")
        imported[0].location = (x, y, z)

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 3
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 576
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(OUTPUT)
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = bpy.data.worlds.new("Town Preview World")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.70, 0.76, 0.82, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.75

    ground_mat = bpy.data.materials.new("Town Ground")
    ground_mat.diffuse_color = (0.50, 0.67, 0.40, 1.0)
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -0.02))
    bpy.context.object.data.materials.append(ground_mat)

    target = Vector((0, 1, 5.2))
    bpy.ops.object.camera_add(location=(37, -62, 34))
    camera = bpy.context.object
    aim_at(camera, target)
    camera.data.lens = 58
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
