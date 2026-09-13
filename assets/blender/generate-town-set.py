from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from town_common import ASSET_SPECS, generate


arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
asset_names = arguments or list(ASSET_SPECS)

for asset_name in asset_names:
    generate(asset_name)
