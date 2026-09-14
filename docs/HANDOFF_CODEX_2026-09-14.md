# Codex 作業引継ぎ（2026-09-14 / チケット0003）

## 現在地

- リポジトリ: `hassy0511/train-game`
- 作業ブランチ: `codex/0003-town-set`
- ベース: `origin/main`
- 担当チケット: `docs/tickets/0003-blender-town-set.md`
- 次の担当: Claude Code が差分レビュー、PR作成、mainへのマージを行う。
- 0004は0003依存のため、0003のマージ後に着手する。

### 2026-09-14 品質基準の確定

キャラクター5体はユーザー承認済みのC案（強めデフォルメ）を当面のスタイルキーとする。
この判断をキャラクターだけに閉じず、`docs/WORLD_ART_DIRECTION.md` を新設して、
建物・駅・踏切・小物にも「デフォルメ強度C／形態写実度4/10／素材写実度2/10」を適用した。
旧チケットの一律ローポリ・フラット・極小予算より、この世界共通方針を優先する。

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
- 集合プレビュー生成: `assets/blender/render-town-set.py`, `assets/blender/render-world-parts.py`
- GLB 18点: `public/models/<model>.glb`
- 個別プレビュー18点: `assets/previews/<model>.png`
- 集合プレビュー: `assets/previews/town-set.png`, `assets/previews/station-set.png`, `assets/previews/trackside-set.png`

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

### C案への再設計（ユーザー決定）

その後、2Dで三段階のデフォルメ案を比較し、ユーザーが最も強いC案を採用した。C案は単純な丸いマスコットではなく、「大きな平面＋制御された丸み」「短めの手足」「大きめの手足」を基準とする。

- 参照デザイン: `assets/concepts/character-deformation-c-strong.png`
- 三面図4枚: `assets/concepts/character-turnaround-c-*.png`
- 3D集合プレビュー: `assets/previews/character-set-c.png`
- 猫2ポーズ・ピコ・サカサ・乗客を三面図に合わせて再設計
- 頭・胴など有機的な大面だけスムーズ接続し、帽子・ケープ・靴・色面は明確な形状として維持
- サカサの帽子は連続した太い曲面チューブ、乗客の帽子と靴は厚みのある独立形状にした

旧チケットの120〜320三角形上限では、ユーザーが却下した「何か分からない安いポリゴン感」に戻るため、キャラクター5体の上限を3,500〜8,200へ改定した。実測合計は29,344三角形で、1ファイル1メッシュ・テクスチャなし・各350KB以下を維持している。

最終実測値:

| モデル | 三角形 | 予算 | bbox寸法 X×Y×Z (m) |
|---|---:|---:|---|
| `cat-sleep` | 3,084 | 3,500 | 0.700×0.350×0.500 |
| `cat-stand` | 5,224 | 5,500 | 0.700×0.600×0.400 |
| `partner` | 5,392 | 5,600 | 0.600×0.700×0.500 |
| `amanojaku` | 7,664 | 8,200 | 0.900×1.400×0.600 |
| `passenger` | 7,980 | 8,200 | 0.600×1.600×0.400 |

### 世界パーツ13点の再設計

キャラクターC案に合わせ、非キャラクター13点を旧プリミティブ主体モデルから再設計した。

- 建物: 基礎、厚い屋根・軒、窓枠と奥まったガラス、玄関枠、庇、階層帯、柱、時計針、屋根リブを追加
- 駅: ホーム安全帯・側壁パネル、屋根の柱脚・柱頭・梁・鼻隠し、駅名標の厚い両面枠を追加
- 踏切: 台座、回転軸、ブラケット、厚い遮断棒、面取りした標識を追加
- 小物: 荷物の帯・結び目・荷札、旗の台座・竿先・緩い波形を追加
- 色数は1点3〜6色に整理し、クリーム、コーラル、深い青、紫、金を基調に統一
- 個別13枚に加え、`town-set.png`、`station-set.png`、`trackside-set.png` を生成して相対スケールも確認

非キャラクター13点の実測合計は14,502三角形（上限20,000）。最大GLBは`hq`の105,172 bytesで、各250KB以下。

## 検証結果

すべてのGLBについて、クリーンなBlenderプロセスからの再読込とプロジェクト内一括検証を実施した。

- 対象: 18 / 18
- 失敗: 0
- 1ファイル1メッシュ: 全点OK
- オブジェクト名: 全点ファイル名と一致
- 三角形数: 全点チケット予算内
- バウンディングボックス: 指定寸法に対して各軸±0.1m以内（下記の明示的判断を除く）
- 原点: 接地面かつ水平方向中央
- ファイルサイズ: キャラクター各350KB以下、非キャラクター各250KB以下
- 個別18枚と集合4枚（キャラクター、街、駅、踏切・小物）: 目視確認済み

一括検証の最終出力:

```text
TOWN_SET_VALIDATION={"assets": 18, "failed": [], "world_triangle_budget": 20000, "world_triangles": 14502}
```

アプリ側の回帰確認:

- `pnpm run build`: 成功
- `pnpm run smoke:only`: 4 passed（stage 0-0の2本、stage 1-1の2本。長尺の全ミッション完走を含む）
- PlaywrightのWebサーバー起動は`npx vite`依存を除き、package-script PATH上の`vite`を直接使うよう修正
- 長尺テストのドア待機は`data-phase=doors`への遷移を確認してから完了待ちするよう修正し、乗降中に判定へ進む競合を解消

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
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\blender-headless-assets\scripts\run-blender.ps1" -b --factory-startup --python assets\blender\render-world-parts.py
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\skills\blender-headless-assets\scripts\run-blender.ps1" -b --factory-startup --python assets\blender\validate-town-set.py
```

## Claude Codeへの次アクション

1. `codex/0003-town-set`をcheckoutし、`docs/WORLD_ART_DIRECTION.md`、18モデル、集合プレビューをレビューする。
2. チケットの「20ファイル分」と列挙18点の差を、PR本文で判断事項として共有する。
3. 問題がなければ0003のPRを作成してマージする。
4. mainへのマージ後、依存が外れるチケット0004へ進む。
