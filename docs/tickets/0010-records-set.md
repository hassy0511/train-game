# 0010 記録の 形（コードで 描く 5 つ）

- 状態: **完了（コードで 描いた 形）**。Blender で 作りなおすのは 後回し（0006〜0009 と 同じ）
- 担当: Claude Code
- 関連: `docs/PHASE7_FINISH.md` §4 の 1・4、`docs/STAGE_SCHEMA.md` §11、`src/view/three/record-placeholders.ts`

## 目的
仕上げ PR3「きろく」で 足した 記録を、世界と 図鑑に 出す 形。図鑑の 絵は `node scripts/render-zukan.mjs` が この 形から 描く。
どれも 作りものの 形（実在の 地図・車両・ロゴに 似せない）。

## 共通仕様
- 原点: 底面の 中心。前は +Z（ステージの `rotationY` で 線路の ほうへ 向ける）
- 動き: なし
- 1 モデルの 三角形は 1,000 以下（仮の形の 数をもとに）。色は 頂点の 色に 焼かれて 1 回で 描かれる（`bake.ts`）
- `assets/models.json` の `_pending` に 名前を 書く（GLB が できたら 外す）

## モデル
| 名前 | 用途 | 寸法 幅×高さ×奥行 (m) | 三角形 | 色 | 原点・向き | 動き |
|---|---|---|---|---|---|---|
| `record-nest` | 1-2 がけの うえの 空の 巣（`cliff-nest`、ロケット） | 2.6 × 0.8 × 2.6 | ≤ 1,000 | 枝 `#8A6440`・`#5E4430`、わら `#C9A56A`、白い わた `#FFFFFF` | 底面中心 | なし |
| `record-feather` | 2-1 こずえの てっぺんの はね（`treetop`、ロケット） | 1.0 × 3.2 × 0.3 | ≤ 400 | 白 `#FAFAF6`、じく `#E9E2D2`、先 水色 `#7CC6F0`、根もと `#6E5238` | 根もとの 中心、少し かたむく | なし |
| `record-town-board` | 1-1 まちの かんばん（`town-board`、通るだけ） | 3.7 × 3.6 × 0.6 | ≤ 400 | 木 `#9A7654`・`#6E5238`、紙 `#F4EEDC`、公園 `#8CCB6E`、池 `#7CC6F0`、道 `#9AA0A8`、屋根 `#C0503F` | 底面中心、絵が +Z | なし |
| `record-hq-plans` | 1-1 ほんぶの けいじばんの せっけいず（`hq-plans`、通るだけ） | 2.6 × 2.95 × 0.2 | ≤ 400 | 板 `#B98A5A`、青い 紙 `#2F6DB5`、白い 線 `#EAF4FF`、ピン `#E23B3B` | 底面中心、絵が +Z | なし |
| `record-balloon` | 1-1 やねの うえの ふうせん（`roof-balloon`、ジャンプ） | 1.2 × 3.2 × 1.2 | ≤ 400 | 赤 `#E8584A`、光 `#FFC2BA`、ひも 白 | ひもの 下の はし（やねに 結んで ある） | なし |

## 受け入れ条件
- モデル確認ページ `https://hassy0511.github.io/train-game/models.html?model=record-nest`（ほかの 4 つも 同じ）で「かり」の 形が 回して 見られる
- 図鑑の 絵 `public/zukan/<記録の id>.png` が ある（`node scripts/render-zukan.mjs`）
- Playwright スモーク（1-1・1-2・2-1 の 通し）の スクショで 置いた 場所に 見える
