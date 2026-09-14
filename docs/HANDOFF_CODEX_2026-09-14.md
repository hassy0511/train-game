# Codex 作業引継ぎ（2026-09-14 / チケット0003）

## 現在地

- リポジトリ: `hassy0511/train-game`
- 作業ブランチ: `codex/0003-town-set`
- ベース: `origin/main`
- 担当チケット: `docs/tickets/0003-blender-town-set.md`
- 次の担当: Claude Code が差分レビュー、PR作成、mainへのマージを行う。
- 0004は0003依存のため、0003のマージ後に着手する。

## 実装済み

チケットに名前が列挙されている18モデルを、Blender 4.5.13 LTSで決定的に再生成できるPythonスクリプトとして実装した。

- 建物6点: `house-a`, `house-b`, `house-c`, `shop`, `tower`, `hq`
- 駅3点: `platform`, `platform-roof`, `station-sign`
- 踏切2点: `crossing-gate`, `crossing-sign`
- キャラクター5点: `cat-sleep`, `cat-stand`, `partner`, `amanojaku`, `passenger`
- 小物2点: `parcel`, `goal-flag`

成果物は次の場所にある。

- 個別生成スクリプト18本: `assets/blender/<model>.py`
- 共通生成処理: `assets/blender/town_common.py`
- 一括生成: `assets/blender/generate-town-set.py`
- 一括検証: `assets/blender/validate-town-set.py`
- 集合プレビュー生成: `assets/blender/render-town-set.py`
- GLB 18点: `public/models/<model>.glb`
- 個別プレビュー18点: `assets/previews/<model>.png`
- 建物6点の集合プレビュー: `assets/previews/town-set.png`

### キャラクター再改修（ユーザーレビュー反映）

初版に対して「写実性を10段階の4程度へ上げ、ポリゴン感と安っぽさを減らす」というレビューがあり、キャラクター5体を再設計した。

- 有機的な部分だけスムーズシェーディングを使い、建物・小物のフラットな絵柄は維持
- 箱形の手足を丸いテーパー形状へ変更し、体のシルエットを滑らかにした
- 目、口、鼻、頬、毛並み・服の切替が読み取れる顔へ変更
- 寝猫は丸まった姿勢と閉じ目、立ち猫は胸毛・前脚・上向きの尾でポーズを明確化
- ピコは鳥・猫に寄らない球形生物のまま、発光ランプと表情を整理
- サカサは怖くないいたずら笑いと、ぐるぐる帽子が読める形に変更
- 乗客はカプセル型を保ちながら、髪・襟・顔を追加
- キャラクタープレビューの照明を調整し、白飛びを抑えて色と丸みが見えるようにした

最終実測値:

| モデル | 三角形 | 予算 | bbox寸法 X×Y×Z (m) |
|---|---:|---:|---|
| `cat-sleep` | 157 | 160 | 0.692×0.350×0.500 |
| `cat-stand` | 200 | 200 | 0.705×0.608×0.409 |
| `partner` | 222 | 240 | 0.599×0.700×0.508 |
| `amanojaku` | 316 | 320 | 0.900×1.405×0.600 |
| `passenger` | 119 | 120 | 0.600×1.600×0.407 |

## 検証結果

すべてのGLBについて、クリーンなBlenderプロセスからの再読込とプロジェクト内一括検証を実施した。

- 対象: 18 / 18
- 失敗: 0
- 1ファイル1メッシュ: 全点OK
- オブジェクト名: 全点ファイル名と一致
- 三角形数: 全点チケット予算内
- バウンディングボックス: 指定寸法に対して各軸±0.1m以内（下記の明示的判断を除く）
- 原点: 接地面かつ水平方向中央
- ファイルサイズ: 全点100KB未満
- 個別プレビューと集合プレビュー: 目視確認済み

一括検証の最終出力:

```text
TOWN_SET_VALIDATION={"assets": 18, "failed": []}
```

アプリ側の回帰確認:

- `pnpm run build`: 成功
- `pnpm run smoke`: 4 passed（stage 0-0の2本、stage 1-1の2本。長尺の全ミッション完走を含む）

このCodex環境では通常の`node` / `npm`がPATHにないため、Codex同梱Nodeとpnpmを使用した。PlaywrightのChromium導入時は企業プロキシ証明書に対応するため`NODE_OPTIONS=--use-system-ca`を指定した。`package.json`と`package-lock.json`は変更していない。

## チケット記載の曖昧さと判断

1. 受け入れ条件には「20ファイル分」とあるが、モデル名の表と本文に列挙されているのは18点。追加2点の名称・仕様がないため、列挙された18点を実装した。
2. `platform` / `platform-roof`はチケット表の表記とランタイムの`placeholder-sizes.ts`で軸の見え方が異なる。ゲームの進行方向が+Zである契約を優先し、長手方向をZ軸にした（platformは4×1×30m、roofは4×4.2×12mのX×Y×Z）。
3. `hq`の表は20×12×14mだが、同じチケットで旗竿16mが明示されている。旗竿を守るため全体バウンディングボックスの高さは16mとし、建物本体は指定範囲内に収めた。
4. キャラクター5体はユーザーレビューを優先し、丸い有機部分にスムーズシェーディングを採用した。単色マテリアル、ポリゴン予算、1メッシュ、寸法などの契約は維持している。

## 再生成・再検証

Blenderスキルのラッパーを使う。

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\blender-headless-assets\scripts\run-blender.ps1" -b --factory-startup --python assets\blender\generate-town-set.py
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\blender-headless-assets\scripts\run-blender.ps1" -b --factory-startup --python assets\blender\render-town-set.py
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\blender-headless-assets\scripts\run-blender.ps1" -b --factory-startup --python assets\blender\validate-town-set.py
```

## Claude Codeへの次アクション

1. `codex/0003-town-set`をcheckoutし、18モデルとプレビューをレビューする。
2. チケットの「20ファイル分」と列挙18点の差を、PR本文で判断事項として共有する。
3. 問題がなければ0003のPRを作成してマージする。
4. mainへのマージ後、依存が外れるチケット0004へ進む。
