# チケット一覧

1チケット1ファイル。番号順。作業の単位・受け入れ条件・経緯を残すために使う。

2026-09-24 から担当はすべて Claude Code（それまで Codex に発注していた分は「担当」に残してある。Codex の納品物と作業規約は `archive/codex/`）。
3D モデルの作り方は `docs/ASSET_PIPELINE.md`。作ったモデルは `https://hassy0511.github.io/train-game/models.html?model=<名前>` で 1 点ずつ確認できる。

## 状態の意味
| 状態 | 意味 |
|---|---|
| 下書き | だいさんの GO 待ち。着手しない |
| 未着手 | GO 済み、または GO と同時に着手する |
| 作業中 | Claude Code が作業中 |
| 完了 | main にマージ済み |

## 一覧
| 番号 | 内容 | 担当 | 状態 |
|---|---|---|---|
| [0001](0001-blender-proto-models.md) | Blender: Phase 0 の仮モデル一式 | Codex | 完了（PR #2）。モデルは差し替え済み |
| [0002](0002-three-scene-view.md) | Three.js: シーン表示（線路メッシュ・車両・環境・運転席カメラ） | Codex | 完了（PR #4）。コードは Claude Code が引き継ぎ |
| [0003](0003-blender-town-set.md) | Blender: 1-1 はじまりの街 のモデル一式 | Codex → Claude Code | 完了。2026-09-24 に全モデルを Claude Code 製へ差し替え（PR #20・#21） |
| [0004](0004-three-stage-1-1-visuals.md) | Three.js: 1-1 の見た目と演出 | Codex | 完了（b2246c8）。コードは Claude Code が引き継ぎ |
| [0005](0005-blender-dino-valley-set.md) | Blender: 1-2 きょうりゅうの谷 のモデル一式 | Claude Code | 進行中（記録の 2 点 `dino-egg`・`footprint-slab` は済み。残りは仮の箱で動いている） |
| [0006](0006-blender-sky-islands-set.md) | Blender: 1-3 くものうえ のモデル一式 | Claude Code | 未着手（Phase 3 の GO と一緒に） |

## 進め方
1. 設計を示して、だいさんの GO をもらう（`CLAUDE.md` の GO ルール）
2. ブランチで作業し、PR を出す。CI（モデル確認・スモーク）が通ったらマージして GitHub Pages に出す
3. 報告には確認用 URL（本番、テストコース、モデル確認ページ）を書く
