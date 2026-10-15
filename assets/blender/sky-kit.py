"""Sky set of stage 1-3 (ticket 0006), "library" look: every model is put together from pieces of Kenney's
CC0 3D kits (assets/kenney/<kit>/, each with its License.txt): imported, turned, scaled and joined into one mesh
per file. Kenney's own material (one palette texture per kit) is kept, so every model has one material.

Same names, sizes, origins and orientation as the code stand-ins (src/view/three/sky-placeholders.ts), so the
stage JSON does not change:
- islands (island-a/-b/-c, island-flip, island-flip-cap): origin at the TOP centre, top surface y = 0 and
  everything below it (the rails run over the tops, so the tops stay flat and nothing stands on them);
- clouds and sky-buoy: origin at the bottom centre. +Z forward.

Sizes are the ticket's (0006 and its 1-3 changes); island-flip-cap's arch has the slab's radius 9.4 so it is flush
with the slab's top and bottom (the stand-in's grass band stands 0.3 m proud of both).

Pieces are only scaled with positive factors and turned (never mirrored), so their faces keep pointing outward;
the material is made single-sided like the rest of the game (Kenney ships it double-sided). Kenney has no clouds:
the clouds are the holiday kit's snow piles, glowing a little like the stand-in clouds (glow()).

Output: public/looks/kit/<name>.glb and assets/previews/looks/kit/<name>.png.
Run: python3 scripts/run-bpy.py assets/blender/sky-kit.py [-- name ...]
"""
from __future__ import annotations

from pathlib import Path
import json
import math
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cc_common as cc  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

KENNEY = cc.ROOT / "assets" / "kenney"
cc.MODEL_DIR = cc.ROOT / "public" / "looks" / "kit"
cc.PREVIEW_DIR = cc.ROOT / "assets" / "previews" / "looks" / "kit"

PLATFORMER = "platformer-kit"  # grass-topped blocks, rocks
HOLIDAY = "holiday-kit"  # snow piles (used as clouds)
WATERCRAFT = "watercraft-kit"  # the buoy

# glTF (x, y up, z forward) -> Blender (x, -z, y), as 4x4 matrices.
GL_TO_BL = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
BL_TO_GL = GL_TO_BL.inverted()

_kit_materials: dict[str, bpy.types.Material] = {}


def reset() -> None:
    cc.reset()
    _kit_materials.clear()


def bounds(objs: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    """Bounding box in glTF coordinates of the meshes' vertices (objects carry no transform here)."""
    pts = [BL_TO_GL @ v.co for o in objs for v in o.data.vertices]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi


def transform_gl(objs: list[bpy.types.Object], matrix: Matrix) -> None:
    """Apply a glTF-space matrix to the meshes (custom normals follow)."""
    m = GL_TO_BL @ matrix @ BL_TO_GL
    for o in objs:
        o.data.transform(m)
        o.data.update()


def piece(kit: str, name: str, lo, hi, turns=(), keep: str = "") -> list[bpy.types.Object]:
    """Import Kenney piece `kit/name.glb`, turn it (`turns`: (axis, degrees) in glTF space, applied in order), then
    scale and move it so its bounding box fills `lo`..`hi` (glTF metres). `keep="xz"` keeps the footprint's
    proportions (pieces turned off the axes): the piece is then as large as fits and centred in the box."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(KENNEY / kit / f"{name}.glb"))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for o in meshes:  # bake node transforms into the mesh
        world = o.matrix_world.copy()
        o.parent = None
        o.data.transform(world)
        o.matrix_world = Matrix.Identity(4)
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    # One material per kit: the first import's material stays, later copies are swapped for it.
    for o in meshes:
        for slot in o.material_slots:
            if slot.material is None:
                continue
            shared = _kit_materials.get(kit)
            if shared is None:
                slot.material.name = f"kenney-{kit}"
                slot.material.use_backface_culling = True  # single-sided, like every model in the game
                _kit_materials[kit] = slot.material
            elif slot.material is not shared:
                slot.material = shared

    turn = Matrix.Identity(4)
    for axis, degrees in turns:
        turn = Matrix.Rotation(math.radians(degrees), 4, axis) @ turn
    transform_gl(meshes, turn)
    lo, hi = Vector(lo), Vector(hi)
    a, b = bounds(meshes)
    scale = [(hi[i] - lo[i]) / (b[i] - a[i]) for i in range(3)]
    if keep == "xz":
        scale[0] = scale[2] = min(scale[0], scale[2])
    transform_gl(meshes, Matrix.Diagonal((*scale, 1.0)))
    a, b = bounds(meshes)
    # Bottom of the piece on lo.y; centred in x/z (the same as lo when it fills the box).
    shift = Vector(((lo.x + hi.x - a.x - b.x) / 2, lo.y - a.y, (lo.z + hi.z - a.z - b.z) / 2))
    transform_gl(meshes, Matrix.Translation(shift))
    return meshes


def finish(parts: list[bpy.types.Object], name: str, size, origin: str) -> bpy.types.Object:
    """Join into one mesh, then fit the bounding box exactly to `size` (w, h, d) with the origin at the bottom
    centre (`origin="bottom"`), the top centre (`"top"`) or the middle of the top's back edge (`"top-back"`: the
    slab's end cap, which reaches out toward +Z). The parts are laid out at that size already; this only takes out
    rounding."""
    model = cc.join(parts, name)
    a, b = bounds([model])
    scale = [size[i] / (b[i] - a[i]) for i in range(3)]
    transform_gl([model], Matrix.Diagonal((*scale, 1.0)))
    a, b = bounds([model])
    y = -a.y if origin == "bottom" else -b.y
    z = -a.z if origin == "top-back" else -(a.z + b.z) / 2
    transform_gl([model], Matrix.Translation(Vector((-(a.x + b.x) / 2, y, z))))
    bpy.ops.object.select_all(action="DESELECT")
    bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    return model


# ---------------------------------------------------------------- islands (origin: top centre)

def island_a():
    """24 x 12 x 24: a hexagonal grass block on top, two hexagonal earth tiers under it (each tier's own grass top is
    buried inside the one above), upturned rocks at the tip and two more hanging as pebbles."""
    return [
        *piece(PLATFORMER, "block-grass-overhang-hexagon", (-12, -3, -12), (12, 0, 12)),
        *piece(PLATFORMER, "block-grass-hexagon", (-8.5, -6.5, -8.5), (8.5, -1.5, 8.5), turns=[("Y", 30)], keep="xz"),
        *piece(PLATFORMER, "block-grass-hexagon", (-5.5, -9.5, -5.5), (5.5, -5, 5.5), keep="xz"),
        *piece(PLATFORMER, "rocks", (-3.5, -12, -3.5), (3.5, -8.5, 3.5), turns=[("X", 180)]),
        *piece(PLATFORMER, "rocks", (3.5, -8.8, -1.5), (6.5, -6.2, 1.5), turns=[("X", 180), ("Y", 120)]),
        *piece(PLATFORMER, "rocks", (-6.5, -8.2, 0.5), (-4, -6.2, 3), turns=[("X", 180), ("Y", 250)]),
    ], 1500


def island_b():
    """40 x 16 x 28: the long island the rails cross in every direction (37 of them), so the whole top is flat."""
    return [
        *piece(PLATFORMER, "block-grass-overhang-large", (-20, -3.2, -14), (20, 0, 14)),
        *piece(PLATFORMER, "block-grass-large-tall", (-15, -8, -10.5), (15, -2.2, 10.5)),
        *piece(PLATFORMER, "block-grass-large-tall", (-9.5, -12, -6.5), (9.5, -7, 6.5)),
        *piece(PLATFORMER, "rocks", (-5, -16, -4.5), (5, -11, 4.5), turns=[("X", 180)]),
        *piece(PLATFORMER, "rocks", (-14, -10.5, 3), (-9, -7.5, 8), turns=[("X", 180), ("Y", 60)]),
        *piece(PLATFORMER, "rocks", (9, -10, -7), (13, -7.6, -3), turns=[("X", 180), ("Y", 200)]),
    ], 2000


def island_c():
    """12 x 8 x 12: the small hexagonal stepping stone."""
    return [
        *piece(PLATFORMER, "block-grass-overhang-hexagon", (-6, -2, -6), (6, 0, 6)),
        *piece(PLATFORMER, "block-grass-hexagon", (-4.2, -5, -4.2), (4.2, -0.9, 4.2), turns=[("Y", 30)], keep="xz"),
        *piece(PLATFORMER, "rocks", (-2.5, -8, -2.5), (2.5, -4.5, 2.5), turns=[("X", 180)]),
    ], 1000


def island_flip():
    """30.4 x 18.8 x 40 slab: a grass block on top and the same block upside down under it, so both faces are flat
    grass (the rail runs on top, wraps round the end cap and runs back underneath)."""
    return [
        *piece(PLATFORMER, "block-grass-overhang-large-tall", (-15.2, -9.4, -20), (15.2, 0, 20)),
        *piece(PLATFORMER, "block-grass-overhang-large-tall", (-15.2, -18.8, -20), (15.2, -9.4, 20), turns=[("X", 180)]),
    ], 2000


def island_flip_cap():
    """30.4 x 18.8 x 9.4: the round end of the slab, Kenney's grass arch turned on its side so it bulges toward +Z.
    Five arches side by side: the arch's grass shell stands a tenth of its width proud of its earth at each end, so
    one arch stretched across 30.4 m would leave 3 m deep hollows at the ends; five leave 0.6 m, the slab's lip."""
    parts = []
    for i in range(5):
        x = -15.2 + i * 6.08
        parts += piece(PLATFORMER, "block-grass-curve", (x, -18.8, 0), (x + 6.08, 0, 9.4), turns=[("Y", 90), ("X", 90)])
    return parts, 1200


# ---------------------------------------------------------------- clouds and buoy (origin: bottom centre)

def glow(kit: str, strength: float) -> None:
    """Let the kit's material glow a little with its own colours (emissive = the palette texture x `strength`):
    the game lights white things grey on their shaded side, so the stand-in clouds glow the same way."""
    material = _kit_materials[kit]
    nodes = material.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    texture = next(n for n in nodes if n.type == "TEX_IMAGE")
    material.node_tree.links.new(texture.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = strength


CLOUD_GLOW = 0.55  # the stand-in clouds' emissive


def cloud_a():
    """8 x 3 x 5: a snow bunker with a snow pile heaped on it."""
    parts = [
        *piece(HOLIDAY, "snow-bunker", (-4, 0, -2.5), (4, 1.9, 2.5)),
        *piece(HOLIDAY, "snow-pile", (-3.2, 1.1, -1.9), (1.8, 3.0, 1.9), turns=[("Y", 30)], keep="xz"),
    ]
    glow(HOLIDAY, CLOUD_GLOW)
    return parts, 500


def cloud_b():
    """14 x 4 x 8: a snow bunker with two snow piles heaped on it."""
    parts = [
        *piece(HOLIDAY, "snow-bunker", (-7, 0, -4), (7, 2.2, 4)),
        *piece(HOLIDAY, "snow-pile", (-5.2, 1.3, -2.8), (0.8, 3.4, 2.8), turns=[("Y", 20)], keep="xz"),
        *piece(HOLIDAY, "snow-pile", (-0.5, 1.0, -2.6), (5.5, 4.0, 2.4), turns=[("Y", 200)], keep="xz"),
    ]
    glow(HOLIDAY, CLOUD_GLOW)
    return parts, 700


def cloud_bounce():
    """16 x 5 x 16: a wide snow pile ringed by five heaped ones, so the middle dips like a cushion."""
    parts = [*piece(HOLIDAY, "snow-pile", (-8, 0, -8), (8, 2.6, 8), keep="xz")]
    for i in range(5):
        a = 2 * math.pi * i / 5
        cx, cz = 4.7 * math.sin(a), 4.7 * math.cos(a)
        parts += piece(HOLIDAY, "snow-pile", (cx - 3.4, 0.9, cz - 3.4), (cx + 3.4, 5, cz + 3.4),
                       turns=[("Y", math.degrees(a) + 90)], keep="xz")
    glow(HOLIDAY, CLOUD_GLOW)
    return parts, 900


def sky_buoy():
    """1.0 x 2.4 x 1.0: Kenney's buoy with its flag, turned 45 degrees so the flag fits the footprint."""
    return [*piece(WATERCRAFT, "buoy-flag", (-0.5, 0, -0.5), (0.5, 2.4, 0.5), turns=[("Y", 45)])], 400


# name: (builder, (w, h, d), origin)
BUILDERS = {
    "island-a": (island_a, (24, 12, 24), "top"),
    "island-b": (island_b, (40, 16, 28), "top"),
    "island-c": (island_c, (12, 8, 12), "top"),
    "island-flip": (island_flip, (30.4, 18.8, 40), "top"),
    "island-flip-cap": (island_flip_cap, (30.4, 18.8, 9.4), "top-back"),
    "cloud-a": (cloud_a, (8, 3, 5), "bottom"),
    "cloud-b": (cloud_b, (14, 4, 8), "bottom"),
    "cloud-bounce": (cloud_bounce, (16, 5, 16), "bottom"),
    "sky-buoy": (sky_buoy, (1.0, 2.4, 1.0), "bottom"),
}


# ---------------------------------------------------------------- export and preview

def preview(model: bpy.types.Object, name: str, below: bool = False, left: bool = False) -> None:
    """One three-quarter view (from a little below for `below`, from the -X side for `left`) on the sky's blue,
    512 x 512."""
    _, minimum, maximum = cc.model_metrics(model)
    size = Vector([maximum[i] - minimum[i] for i in range(3)])
    center = Vector(cc.to_blender([(maximum[i] + minimum[i]) / 2 for i in range(3)]))
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.compression = 90
    scene.view_settings.view_transform = "Standard"
    scene.render.filepath = str(cc.PREVIEW_DIR / f"{name}.png")
    world = bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (*cc.hex_linear("#8EC3EE"), 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(40), 0, math.radians(25)))
    bpy.context.object.data.energy = 2.6
    bpy.context.object.data.angle = math.radians(14)
    direction = Vector((-0.55 if left else 0.55, -0.72, -0.32 if below else 0.42)).normalized()
    bpy.ops.object.camera_add(location=center + direction * size.length / 2 * 2.7)
    camera = bpy.context.object
    camera.data.lens = 50
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    bpy.ops.render.render(write_still=True)


def export(model: bpy.types.Object, name: str, budget: int, max_kb: int = 250) -> None:
    tris, minimum, maximum = cc.model_metrics(model)
    if tris > budget:
        raise RuntimeError(f"{name}: {tris} triangles exceeds budget {budget}")
    cc.active(model)
    glb = cc.MODEL_DIR / f"{name}.glb"
    # PNG kept as is: Kenney's palette has hard swatch edges that JPEG would smear.
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", export_yup=True, use_selection=True,
                              export_image_format="AUTO")
    kb = glb.stat().st_size / 1024
    if kb > max_kb:
        raise RuntimeError(f"{name}: GLB {kb:.0f} KB exceeds {max_kb} KB")
    materials = sorted({s.material.name for s in model.material_slots if s.material})
    print("MODEL_METRICS=" + json.dumps({
        "model": name, "triangles": tris, "budget": budget,
        "dimensions": [round(maximum[i] - minimum[i], 3) for i in range(3)],
        "min": [round(v, 3) for v in minimum], "max": [round(v, 3) for v in maximum],
        "materials": materials, "kb": round(kb, 1),
    }, sort_keys=True))


def main() -> None:
    cc.MODEL_DIR.mkdir(parents=True, exist_ok=True)
    cc.PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    names = [a for a in sys.argv[1:] if a in BUILDERS] or list(BUILDERS)
    for name in names:
        build, size, origin = BUILDERS[name]
        reset()
        parts, budget = build()
        model = finish(parts, name, size, origin)
        export(model, name, budget)
        # The slab from below shows its flat grass underside; the cap from -X its sunlit earth end.
        preview(model, name, below=name == "island-flip", left=name == "island-flip-cap")


if __name__ == "__main__":
    main()
