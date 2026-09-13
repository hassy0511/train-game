from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from town_common import generate
generate("cat-sleep")
