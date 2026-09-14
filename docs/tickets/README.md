# チケット一覧（Codex 向け）

1チケット1ファイル。番号順。作業前に `AGENTS.md` と、チケットの「関連」に書かれた文書を読むこと。

## 状態の意味
| 状態 | 意味 |
|---|---|
| 下書き | だいさんの GO 待ち。着手しない |
| 発注中 | 着手してよい |
| レビュー中 | PR が出ている。Claude Code がレビュー中 |
| 完了 | main にマージ済み |

## 進め方
1. ブランチ `codex/<番号>-<内容>` を切る（例: `codex/0001-proto-models`）
2. 受け入れ条件をすべて満たしてから PR を出す。PR タイトルは `[#0001] 内容`
3. PR 本文: チケット番号、変更点、確認方法、判断に迷った点、スモークのスクショ（または Blender プレビュー PNG）
4. 迷ったら PR に質問を書いて止まる。チケットにない機能は足さない

## 一覧
| 番号 | 内容 | 担当 | 状態 | 依存 |
|---|---|---|---|---|
| [0001](0001-blender-proto-models.md) | Blender: Phase 0 の仮モデル一式 | Codex | 完了（PR #2） | なし |
| [0002](0002-three-scene-view.md) | Three.js: シーン表示（線路メッシュ・車両・環境・運転席カメラ） | Codex | 完了（PR #4） | — |
| [0003](0003-blender-town-set.md) | Blender: 1-1 はじまりの街 のモデル一式 | Codex | 第 1 弾 完了（PR #11）。第 2 弾（停止線・看板・客車）発注中 | なし |
| [0004](0004-three-stage-1-1-visuals.md) | Three.js: 1-1 の見た目と演出 | Codex | 発注中（着手可） | — |

## 発注の順番
1. **0004**（1-1 の見た目と演出）は今すぐ着手できる
2. **0003 第 2 弾**（停止線・とまれ看板・客車）も今すぐ。0004 と並行でよい
3. PR を Claude Code がレビューし、main にマージしたら GitHub Pages に出る

## Codex への渡し方（だいさん用・コピペ）
0001 を頼むとき:

```
リポジトリ hassy0511/train-game の main を開いて、AGENTS.md と docs/tickets/README.md を読んでください。
その上で docs/tickets/0001-blender-proto-models.md を実装してください。
ブランチは codex/0001-proto-models、PR は main 宛て、タイトルは「[#0001] Phase 0 の仮モデル一式」。
受け入れ条件を全部満たしてから PR を出し、迷った点は PR に書いてください。
```

0003 第 2 弾を頼むとき:

```
リポジトリ hassy0511/train-game の main を開いて、AGENTS.md と docs/tickets/README.md を読んでください。
その上で docs/tickets/0003-blender-town-set.md の「追加発注（第 2 弾）」を実装してください。
ブランチは codex/0003b-stop-and-car、PR は main 宛て、タイトルは「[#0003] 停止線・看板・客車」。
```

0004 を頼むとき:

```
リポジトリ hassy0511/train-game の main を開いて、AGENTS.md と docs/tickets/README.md を読んでください。
その上で docs/tickets/0004-three-stage-1-1-visuals.md を実装してください。
ブランチは codex/0004-stage-1-1-visuals、PR は main 宛て、タイトルは「[#0004] 1-1 の見た目と演出」。
src/view/three/ 配下（actors.ts の仮実装を置き換えてよい）と src/stages/1-1.json の props だけを変更してください。
npm run smoke を通し、tests/smoke/output のスクショと getStats() の値を PR に貼ってください。
```

0002 を頼むとき:

```
リポジトリ hassy0511/train-game の main を開いて、AGENTS.md と docs/tickets/README.md を読んでください。
その上で docs/tickets/0002-three-scene-view.md を実装してください。
ブランチは codex/0002-three-scene-view、PR は main 宛て、タイトルは「[#0002] Three.js シーン表示」。
src/view/three/ 配下だけを作り、他のモジュールは変更しないでください。
npm run smoke を通し、tests/smoke/output のスクショ 4 枚と getStats() の値を PR に貼ってください。
```
