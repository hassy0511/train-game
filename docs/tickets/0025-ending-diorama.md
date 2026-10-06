# 0025 エンディング ムービーの ジオラマ「せかいの わ」

- 状態: **作業中**（コードで 作った 仮の 形 `src/view/three/ending-placeholders.ts` で 見られる。Blender は 後回し。2026-10-05）
- 担当: Claude Code
- 依存: なし（作り方は `docs/ASSET_PIPELINE.md`）
- 関連: `src/movies/ending.json`（`scripts/layout-ending.mjs` が 書く）、`docs/STAGE_SCHEMA.md` §25（えんしゅつ）、6-1 の しろ（チケット 0021 の `sakasa-castle`）
- 6 つの 章の 小さな 島を 輪に ならべた ジオラマ。島の 上の もの（家・木・生き物）は いまの モデルと 仮の 形を つかう。この チケットは 島の 土台 6 つ だけ
- しろの 島には 6-1 の しろ `sakasa-castle`（チケット 0021）を 0.42 倍で 置く（高さ 約 17 m。輪の ムービーの 絵に おさまる 大きさを 見て きめた。PR11b、2026-10-06）。しろの 代わりの `ring-castle` は けした

## 共通仕様
- ファイル: `public/models/<名前>.glb`、生成スクリプトは `assets/blender/ending-set.py`
- 1 モデル 1 マテリアル（頂点カラー）
- 原点: 島は 上の 面の 中心（y 0。海は y −1.6、島の 横は −4 まで 下りる）。しろは 底面の 中心。前は +Z
- アニメ なし
- **顔を つけない**（しろの まどは 小さな まるを 2 だん、ぐるりと ならべる。目と 口に 見えない ように）。字・ロゴ・紋章 なし。**うかぶ 岩に しない**（島は 海に 立つ。しろは 島に さかさに 立つ。有名な 映画の 空の しろを 思わせない）

## モデル
| 名前 | 用途 | 寸法 幅×高さ×奥行 (m) | 三角形 | 色・形 | 原点・向き | 動き |
|---|---|---|---|---|---|---|
| `ring-isle-town` | 1しょう（はじまりの まち・きょうりゅう・くも） | 約 78×4×78（半径 34 の まるに ゆるい なみ） | ≤ 600 | 草 `#9ED67E`、まだら `#B9E59A`、すなの ふち `#F2E2B0` | 上の 面の 中心 | なし |
| `ring-isle-forest` | 2しょう（おおきな き・はらっぱ・かざん） | 約 68×4×68（半径 30） | ≤ 600 | `#6DBA62`／`#8ACB6F`／`#E9D7A2` | 同じ | なし |
| `ring-isle-sea` | 3しょう（うみ・かわ） | 約 64×4×64（半径 28） | ≤ 600 | すな `#F3E2AE`／`#FBEFC9`／`#F7EAC0` | 同じ | なし |
| `ring-isle-snow` | 4しょう（こおり・ゆき） | 約 64×4×64（半径 28） | ≤ 600 | ゆき `#F4F8FC`／`#DCEBF7`／`#CFE4F2` | 同じ | なし |
| `ring-isle-night` | 5しょう（よるの もり・おもちゃ・かがみ） | 約 68×4×68（半径 30） | ≤ 600 | `#55708F`／`#7B8FC4`／`#C9C3E8` | 同じ | なし |
| `ring-isle-castle` | 6しょう（さかさまの しろ） | 約 68×4×68（半径 30） | ≤ 600 | ピンク `#F4CFE0`／`#FBE3EE`／`#F3DDC3` | 同じ | なし |
- 描く 回数: 島は 1 つ 1 回、しろ（`sakasa-castle`）1 回。ムービー ぜんたいで 200 回・10 万 三角形 以内（`npm run budget -- --movie ending`、2026-10-05: いちばん 重い こま 103 回・79.2k）

## 受け入れ条件
- モデル確認ページで 見られる: `https://hassy0511.github.io/train-game/models.html?model=ring-isle-town`、ならべて くらべる `https://hassy0511.github.io/train-game/models.html?compare=ring-isle-town,ring-isle-castle`
- または Playwright スモークの スクショ（`tests/smoke/movie.spec.ts`: `movie-ending-1.png` の ひろい 絵）で 見える こと
- `npm run build`（`check-models`）が とおる。三角形・原点が 表の とおり
