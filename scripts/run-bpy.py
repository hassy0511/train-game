"""Run one or more Blender generator scripts with the pip `bpy` module (no Blender binary).

Usage: python3 scripts/run-bpy.py assets/blender/tree-a.py [more scripts...]

`blender -b --python <script>` keeps working as before. This runner exists for environments where
only `pip install bpy` is available. It lives outside assets/blender and imports the standard-library `platform` module up front so the
sibling `platform.py` generator does not shadow it once the scripts prepend their own directory to sys.path.
"""
import platform  # noqa: F401  (must be imported before assets/blender is on sys.path)
import runpy
import sys

for script in sys.argv[1:]:
    print(f"== {script}")
    runpy.run_path(script, run_name="__main__")
