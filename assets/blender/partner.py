from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from character_common import generate_character
generate_character("partner")
