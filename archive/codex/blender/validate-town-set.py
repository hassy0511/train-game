from pathlib import Path
import json
import math
import sys

import bpy


sys.path.insert(0, str(Path(__file__).resolve().parent))
from town_common import ASSET_SPECS, ROOT


TOLERANCE = 0.1
CHARACTER_NAMES = {"cat-sleep", "cat-stand", "partner", "amanojaku", "passenger"}
WORLD_STYLE_NAMES = {
    "house-a", "house-b", "house-c", "shop", "tower", "hq",
    "platform", "platform-roof", "station-sign", "stop-line", "stop-board",
    "car-proto", "crossing-gate", "crossing-sign", "parcel", "goal-flag",
    "tree-a", "tree-b",
}
WORLD_TRIANGLE_BUDGET = 25_000


def clear_scene() -> None:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def gltf_point(point) -> tuple[float, float, float]:
    return (float(point.x), float(point.z), float(-point.y))


def validate(name: str, expected_size: tuple[float, float, float], budget: int) -> dict:
    clear_scene()
    path = ROOT / "public" / "models" / f"{name}.glb"
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    minimum = [math.inf, math.inf, math.inf]
    maximum = [-math.inf, -math.inf, -math.inf]
    triangles = 0
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in meshes:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            triangles += len(mesh.loop_triangles)
            for vertex in mesh.vertices:
                point = gltf_point(evaluated.matrix_world @ vertex.co)
                for axis in range(3):
                    minimum[axis] = min(minimum[axis], point[axis])
                    maximum[axis] = max(maximum[axis], point[axis])
        finally:
            evaluated.to_mesh_clear()
    dimensions = [maximum[i] - minimum[i] for i in range(3)]
    violations = []
    if len(meshes) != 1:
        violations.append(f"mesh count {len(meshes)}")
    if [obj.name for obj in meshes] != [name]:
        violations.append(f"mesh name {[obj.name for obj in meshes]}")
    if triangles > budget:
        violations.append(f"triangles {triangles} > {budget}")
    max_kb = 350 if name in CHARACTER_NAMES else 250 if name in WORLD_STYLE_NAMES else 100
    max_bytes = max_kb * 1024
    if path.stat().st_size > max_bytes:
        violations.append(f"file size {path.stat().st_size} > {max_bytes}")
    if abs(minimum[1]) > TOLERANCE:
        violations.append(f"ground min Y {minimum[1]:.4f}")
    for axis, label in enumerate("XYZ"):
        if abs(dimensions[axis] - expected_size[axis]) > TOLERANCE:
            violations.append(
                f"dimension {label} {dimensions[axis]:.4f} != {expected_size[axis]:.4f}"
            )
    return {
        "model": name,
        "triangles": triangles,
        "budget": budget,
        "file_bytes": path.stat().st_size,
        "bbox": {
            "min": [round(value, 4) for value in minimum],
            "max": [round(value, 4) for value in maximum],
            "dimensions": [round(value, 4) for value in dimensions],
        },
        "ok": not violations,
        "violations": violations,
    }


def main() -> None:
    reports = [validate(name, size, budget) for name, (size, budget) in ASSET_SPECS.items()]
    for report in reports:
        print("TOWN_ASSET_VALIDATION=" + json.dumps(report, sort_keys=True))
    failed = [report["model"] for report in reports if not report["ok"]]
    world_triangles = sum(
        report["triangles"] for report in reports if report["model"] in WORLD_STYLE_NAMES
    )
    if world_triangles > WORLD_TRIANGLE_BUDGET:
        failed.append(
            f"world triangle total {world_triangles} > {WORLD_TRIANGLE_BUDGET}"
        )
    print("TOWN_SET_VALIDATION=" + json.dumps({
        "assets": len(reports),
        "failed": failed,
        "world_triangles": world_triangles,
        "world_triangle_budget": WORLD_TRIANGLE_BUDGET,
    }, sort_keys=True))
    if failed:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
