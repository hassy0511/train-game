# Codex の納品物（アーカイブ）

2026-09-24、だいさんの判断で「キャラも含めてすべて Claude Code 製でいく」ことになり、Codex から納品されたものをここに移した。ゲームでは使っていない。

| 場所 | 中身 |
|---|---|
| `models/` | Codex 製の .glb（キャラクター 5 体、車両、駅、街、仮モデル） |
| `blender/` | それらの Blender 生成スクリプト（`town_common.py`、`character_common.py` ほか） |
| `previews/` | プレビュー PNG |
| `docs/` | `WORLD_ART_DIRECTION.md`、`CHARACTER_3D_QUALITY_BAR.md`、Codex の引き継ぎメモ |
| `model-previews/` | Codex が作ったプレビュー一覧ページ |
| `AGENTS.md` | Codex 向けの作業規約 |

残したもの（アーカイブしていない）:
- `assets/concepts/`: だいさんが承認したキャラクターの 2D デザインと三面図。今のモデルの正本なので残す
- Three.js のコード（チケット 0002・0004 で Codex が書いた `src/view/three/`）: 動いていて見た目の問題がないため、そのまま Claude Code が引き継いで保守する

差し替えの経緯: PR #18〜#21。
