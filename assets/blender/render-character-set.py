from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "assets" / "previews" / "character-set-c.png"
CHARACTERS = [
    ("cat-sleep", -2.00, 0.10),
    ("cat-stand", -1.25, 0.00),
    ("partner", -0.50, 0.00),
    ("amanojaku", 0.35, 0.00),
    ("passenger", 1.35, 0.00),
]


def aim_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for name, x, y in CHARACTERS:
        bpy.ops.import_scene.gltf(filepath=str(ROOT / "public" / "models" / f"{name}.glb"))
        imported = [obj for obj in bpy.context.selected_objects if obj.type == "MESH"]
        if len(imported) != 1:
            raise RuntimeError(f"{name}: expected one imported mesh, got {len(imported)}")
        imported[0].location = (x, y, 0)

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

    world = bpy.data.worlds.new("Character Set World")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.66, 0.57, 0.47, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.32

    ground_mat = bpy.data.materials.new("Warm Ground")
    ground_mat.diffuse_color = (0.72, 0.66, 0.58, 1.0)
    ground_mat.use_nodes = True
    ground_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (
        0.72, 0.66, 0.58, 1.0
    )
    ground_mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.85
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, -0.012))
    bpy.context.object.data.materials.append(ground_mat)

    target = Vector((-0.20, 0, 0.75))
    bpy.ops.object.camera_add(location=(2.5, -18.0, 2.2))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    # Blender's orthographic scale maps to the horizontal field here; 4.6 keeps
    # both cat-sleep and passenger fully inside the 16:9 frame.
    camera.data.ortho_scale = 4.60
    aim_at(camera, target)
    scene.camera = camera

    bpy.ops.object.light_add(type="AREA", location=(-2.5, -5.0, 7.0))
    bpy.context.object.data.energy = 700
    bpy.context.object.data.size = 5.0
    bpy.ops.object.light_add(type="AREA", location=(4.0, 1.0, 4.5))
    bpy.context.object.data.energy = 360
    bpy.context.object.data.size = 4.0

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print(f"CHARACTER_SET_PREVIEW={OUTPUT}")


if __name__ == "__main__":
    main()
