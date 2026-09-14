from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
PREVIEW_DIR = ROOT / "assets" / "previews"


def aim_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def matte(name, color):
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    shader = value.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = 0.82
    return value


def import_model(name, location=(0, 0, 0)):
    bpy.ops.import_scene.gltf(filepath=str(ROOT / "public" / "models" / f"{name}.glb"))
    imported = [obj for obj in bpy.context.selected_objects if obj.type == "MESH"]
    if len(imported) != 1:
        raise RuntimeError(f"{name}: expected one imported mesh, got {len(imported)}")
    imported[0].location = location
    return imported[0]


def configure_scene(output, camera_location, target, resolution=(1400, 800)):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 3
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(output)
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = bpy.data.worlds.new("World parts preview")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.62, 0.68, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.48

    bpy.ops.object.camera_add(location=camera_location)
    camera = bpy.context.object
    aim_at(camera, Vector(target))
    camera.data.lens = 58
    scene.camera = camera

    bpy.ops.object.light_add(type="AREA", location=(6, -16, 22))
    bpy.context.object.data.energy = 1600
    bpy.context.object.data.size = 14
    bpy.ops.object.light_add(type="AREA", location=(-12, 8, 12))
    bpy.context.object.data.energy = 800
    bpy.context.object.data.size = 10


def ground(size=200):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, -0.02))
    bpy.context.object.data.materials.append(matte("Warm ground", (0.66, 0.61, 0.52, 1.0)))


def render_station():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    import_model("platform")
    import_model("platform-roof", (0, 0, 1.0))
    import_model("station-sign", (3.25, -8.0, 1.0))
    ground()
    rail_mat = matte("Rail", (0.10, 0.12, 0.14, 1.0))
    for x in (-0.75, -1.65):
        bpy.ops.mesh.primitive_cube_add(location=(x, 0, 0.08), scale=(0.055, 15, 0.07))
        bpy.context.object.data.materials.append(rail_mat)
    output = PREVIEW_DIR / "station-set.png"
    configure_scene(output, (22, -27, 18), (1.2, 0, 2.0))
    bpy.ops.render.render(write_still=True)
    print(f"STATION_SET_PREVIEW={output}")


def render_trackside():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    import_model("crossing-gate", (0, -1.0, 0))
    import_model("crossing-sign", (-3.1, 2.0, 0))
    import_model("goal-flag", (4.0, 2.0, 0))
    import_model("parcel", (2.0, -1.8, 0))
    ground()
    path_mat = matte("Trackside path", (0.24, 0.27, 0.28, 1.0))
    bpy.ops.mesh.primitive_cube_add(location=(0, 3.8, 0.03), scale=(12, 1.2, 0.05))
    bpy.context.object.data.materials.append(path_mat)
    output = PREVIEW_DIR / "trackside-set.png"
    configure_scene(output, (12, -18, 10), (0.3, 0.2, 1.4), (1200, 800))
    bpy.ops.render.render(write_still=True)
    print(f"TRACKSIDE_SET_PREVIEW={output}")


if __name__ == "__main__":
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    render_station()
    render_trackside()
