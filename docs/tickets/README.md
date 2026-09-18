# チケット一覧（Codex 向け）

1チケット1ファイル。番号順。作業前に `AGENTS.md` と、チケットの「関連」に書かれた文書を読むこと。

## Blender の実行環境
Codex は `blender -b --python assets/blender/<name>.py`。Claude Code の環境には Blender 本体がないが、pip の `bpy` モジュール（Blender 5.0）が入るので `python3 scripts/run-bpy.py assets/blender/<name>.py` で同じスクリプトを実行できる（.glb とプレビュー PNG を生成、`validate-town-set.py` も動く）。**モデル作業は Claude Code でも巻き取れる**。

納品したモデルは `https://hassy0511.github.io/train-game/models.html?model=<名前>` で 1 点ずつ 3D で確認できる（main にマージ後）。

## 状態の意味
| 状態 | 意味 |
|---|---|
| 下書き | だいさんの GO 待ち。着手しない |
| 発注中 | 着手してよい |
| レビュー中 | PR が出ている。Claude Code がレビュー中 |
| 完了 | main にマージ済み |

## 進め方
1. ブランチ `codex/<番号>-<内容>` を切る（例: `codex/0001-proto-models`）。**main には直接 push しない**
2. 受け入れ条件をすべて満たしてから PR を出す。PR タイトルは `[#0001] 内容`
3. PR 本文: チケット番号、変更点、確認方法、判断に迷った点、スモークのスクショ（または Blender プレビュー PNG）
4. 迷ったら PR に質問を書いて止まる。チケットにない機能は足さない

## 一覧
| 番号 | 内容 | 担当 | 状態 | 依存 |
|---|---|---|---|---|
| [0001](0001-blender-proto-models.md) | Blender: Phase 0 の仮モデル一式 | Codex | 完了（PR #2） | なし |
| [0002](0002-three-scene-view.md) | Three.js: シーン表示（線路メッシュ・車両・環境・運転席カメラ） | Codex | 完了（PR #4） | — |
| [0003](0003-blender-town-set.md) | Blender: 1-1 はじまりの街 のモデル一式 | Codex | 完了（第 1 弾 PR #11、第 2 弾 PR #12） | なし |
| [0004](0004-three-stage-1-1-visuals.md) | Three.js: 1-1 の見た目と演出 | Codex | 完了（main 直接 push b2246c8） | — |
| [0005](0005-blender-dino-valley-set.md) | Blender: 1-2 きょうりゅうの谷 のモデル一式 | Codex | 発注中（着手可） | なし |
| [0006](0006-blender-sky-islands-set.md) | Blender: 1-3 くものうえ のモデル一式 | Codex | 発注中（0005 の後） | なし |

## 発注の順番
1. **0005**（1-2 のモデル）
2. **0006**（1-3 のモデル）。0005 の後
3. 1-2 / 1-3 の Three.js 組み込み（0007 以降）は Phase 2 / 3 の設計とだいさんの GO の後に発注する
4. **必ず PR を出す（main に直接 push しない）**。Claude Code がレビューし、main にマージしたら GitHub Pages に出る

## Codex への渡し方（だいさん用・コピペ）
0001 を頼むとき:

```
リポジトリ hassy0511/train-game の main を開いて、AGENTS.md と docs/tickets/README.md を読んでください。
その上で docs/tickets/0001-blender-proto-models.md を実装してください。
ブランチは codex/0001-proto-models、PR は main 宛て、タイトルは「[#0001] Phase 0 の仮モデル一式」。
受け入れ条件を全部満たしてから PR を出し、迷った点は PR に書いてください。
```

0004 を頼むとき:

```
リポジトリ hassy0511/train-game の main を開いて、AGENTS.md と docs/tickets/README.md を読んでください。
まず docs/tickets/0003-blender-town-set.md の「追加発注（第 3 弾）」の木 2 種（tree-a / tree-b）を作ってください。
その上で docs/tickets/0004-three-stage-1-1-visuals.md を実装してください。
ブランチは codex/0004-stage-1-1-visuals、PR は main 宛て、タイトルは「[#0004] 1-1 の見た目と演出」。
コードは src/view/three/ 配下（actors.ts の仮実装を置き換えてよい）と src/stages/1-1.json の props だけを変更してください。
npm run smoke を通し、tests/smoke/output のスクショと getStats() の値を PR に貼ってください。
```

0005 を頼むとき:

```
リポジトリ hassy0511/train-game の main を開いて、AGENTS.md と docs/tickets/README.md を読んでください。
その上で docs/tickets/0005-blender-dino-valley-set.md を実装してください。
ブランチは codex/0005-dino-valley-set、PR は main 宛て、タイトルは「[#0005] 1-2 きょうりゅうの谷 のモデル一式」。main には直接 push しないでください。
モデル（assets/blender、public/models、assets/previews）だけを追加し、src/ は変更しないでください。
先に生き物のコンセプト画 dino-set-concept.png をコミットしてから造形に進んでください。
受け入れ条件を全部満たしてから PR を出し、実測表と迷った点を PR に書いてください。
```

0006 を頼むとき:

```
リポジトリ hassy0511/train-game の main を開いて、AGENTS.md と docs/tickets/README.md を読んでください。
その上で docs/tickets/0006-blender-sky-islands-set.md を実装してください。
ブランチは codex/0006-sky-islands-set、PR は main 宛て、タイトルは「[#0006] 1-3 くものうえ のモデル一式」。main には直接 push しないでください。
モデル（assets/blender、public/models、assets/previews）だけを追加し、src/ は変更しないでください。
受け入れ条件を全部満たしてから PR を出し、実測表と迷った点を PR に書いてください。
```

0002 を頼むとき:

```
リポジトリ hassy0511/train-game の main を開いて、AGENTS.md と docs/tickets/README.md を読んでください。
その上で docs/tickets/0002-three-scene-view.md を実装してください。
ブランチは codex/0002-three-scene-view、PR は main 宛て、タイトルは「[#0002] Three.js シーン表示」。
src/view/three/ 配下だけを作り、他のモジュールは変更しないでください。
npm run smoke を通し、tests/smoke/output のスクショ 4 枚と getStats() の値を PR に貼ってください。
```
