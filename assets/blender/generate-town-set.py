from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from town_common import ASSET_SPECS, generate
from character_common import CHARACTER_NAMES, generate_character


arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
asset_names = arguments or list(ASSET_SPECS)

for asset_name in asset_names:
    if asset_name in CHARACTER_NAMES:
        generate_character(asset_name)
    else:
        generate(asset_name)
