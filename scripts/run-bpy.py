"""Run one or more Blender generator scripts with the pip `bpy` module (no Blender binary).

Usage: python3 scripts/run-bpy.py assets/blender/tree-a.py [more scripts...]

`blender -b --python <script>` keeps working as before. This runner exists for environments where
only `pip install bpy` is available. It lives outside assets/blender and imports the standard-library `platform` module up front so the
sibling `platform.py` generator does not shadow it once the scripts prepend their own directory to sys.path.
"""
import platform  # noqa: F401  (must be imported before assets/blender is on sys.path)
import runpy
import sys

# `run-bpy.py a.py b.py` runs each script; `run-bpy.py station.py -- platform` passes names after "--".
args = sys.argv[1:]
scripts, extra = (args[:args.index("--")], args[args.index("--") + 1:]) if "--" in args else (args, [])
for script in scripts:
    print(f"== {script}")
    sys.argv = [script, *extra]
    runpy.run_path(script, run_name="__main__")
