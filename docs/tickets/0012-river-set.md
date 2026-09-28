# 0012 3-2 たきのかわ の 形の 一式（いまは コードで 描く 仮の 形）

- 状態: **作業中**（コードの 仮の 形で 3-2 が 遊べる。Blender の モデルは 後回し。0006〜0011 と 同じ 方針）
- 担当: Claude Code
- 依存: なし（作り方は `docs/ASSET_PIPELINE.md`）
- 関連: `docs/PHASE8_CHAPTER3_4.md` 第 4 部 §8（見た目）・§5.5（置く 所）・§18（実装メモ）、`src/view/three/river-placeholders.ts`（仮の 形）、`src/view/three/river.ts`（たきの カーテン・あわ・しぶき・にじ）

## 目的
明るい 夏の たにの 川、カーテンの ような やさしい たき、たきの うえの 草原と もりの いけ、わきみずと のこった 雪。生き物は まるく、顔は 目だけ。かもの おやこは 自然の かもの 色（ぼうし・服・青と 白の 配色は なし。有名な あひるの キャラクターに 似せない）。
仮の 形と **同じ 名前・寸法・原点** で 作る。できたら `assets/models.json` の `_pending` から 外し、`node scripts/render-map.mjs 3-2` で 地図の 絵、`node scripts/render-zukan.mjs kingfisher-feather river-jade snow-bud` で 図鑑の 絵を 描き直す。

## 共通仕様
- ファイル: `public/models/<名前>.glb`、生成スクリプトは `assets/blender/river.py`（1 本に まとめる）
- 1 モデル 1 マテリアル（頂点カラー）。原点は 底面の 中心、前は +Z。アニメは なし（かもの ひなの ぴょこぴょこ、さかな・かえるの ジャンプは ゲームが 動かす）
- いかだ・はすの はっぱ（線路の 上に うかぶ もの）は ゲームが 描く うきもの（`floaters` の raft・lily）。この 一式には 入れない

## モデル
| 名前 | 用途 | 寸法 幅×高さ×奥行 (m) | 三角形 | 色 |
|---|---|---|---|---|
| `reed` | あし（約 240） | 1.4 × 3.2 × 1.4 | ≤ 60 | `#8DB35A` → 先 `#C9D27A` |
| `lily-pad` / `lily-flower` | けしきの はすの はっぱ／はな | 9 × 0.4 × 9 ／ 1.2 × 1 × 1.2 | ≤ 120 ／ 120 | `#6DBF5A` ／ `#F6B8CF` |
| `water-weed` | もりの いけの みずくさ、いきどまりの カーテン | 2 × 5 × 0.6 | ≤ 60 | `#4F9A6A` |
| `islet` | なかす | 18 × 20 × 26 | ≤ 300 | 岩 `#A89F90`、上に 草 |
| `rapids` | せ（しろい なみ、すきまの 下） | 16 × 1.5 × 18 | ≤ 400 | しろ → 水色、まるい 岩 6 |
| `river-bank` | 駅の 下の すなの 岸 | 24 × 19 × 100 | ≤ 300 | すな `#E8D8A8`、石 |
| `river-rock` | かわらの いし | 2 × 1 × 1.6 | ≤ 120 | 灰・茶・白 |
| `sea-arch` | 谷の 南の 岩の アーチ（むこうに 海） | 60 × 30 × 20 | ≤ 500 | 岩、海の 青の 板 |
| `falls-lip` | たきの 口の 岩の ひさし | 124 × 2.5 × 4 | ≤ 400 | 岩 ＋ 草 |
| `falls-mini` | 地図の 絵 用の たき | 6 × 5 × 4 | ≤ 600 | 岩 ＋ しろい すじ ＋ にじ |
| `stepping-stones` | とびいし（サカサ） | 3 × 0.8 × 30 | ≤ 200 | 明るい 岩 |
| `kawa-rock` | サカサが すわる 平らな 岩 | 5 × 1.5 × 4 | ≤ 150 | 岩 |
| `paper-boat` | ピンクの かみの ふね（帆に ぐるぐる） | 0.6 × 0.45 × 0.9 | ≤ 60 | `#F7A8D8`、ぐるぐる `#E8579F` |
| `frog` | かえる（とびはねる むれ） | 0.7 × 0.5 × 0.8 | ≤ 150 | `#8CCB5E`、おなか `#EAF4C8`、目だけ |
| `duck-family` | かもの おやこ（おや 1 ＋ ひな 4 の 一列） | 1.2 × 1 × 4.5 | ≤ 900 | クリーム `#EFE3C8`、はね `#B89A74`、ひな `#FFE27A`、くちばし `#F2A94A` |
| `snow-patch` / `snow-peak` | のこった 雪／遠くの 雪の 山（4 章の まえぶり） | 10 × 1.5 × 8 ／ 400 × 260 × 400 | ≤ 200 ／ 400 | `#F4F8FC`、かげ `#D6E4F0` |
| `blue-feather` / `jade-stone` / `fukinotou` | 記録①②③ | 0.3 × 0.1 × 1 ／ 0.8 × 0.5 × 0.8 ／ 0.6 × 0.6 × 0.6 | ≤ 150 ／ 200 ／ 200 | `#3FA7E0` 先 `#F28C3A` ／ `#5CC49A` ／ きみどり |

## 受け入れ条件
- `npm run build`（check-models）と `tests/smoke/model-culling.spec.ts` が 通る
- Playwright スモーク `tests/smoke/stage-3-2-full.spec.ts` の スクショ（`tests/smoke/output/100〜114-*.png`）で 見た目を 確かめられる
- モデル確認ページで 1 点ずつ 回して 見られる: `https://hassy0511.github.io/train-game/models.html?model=duck-family`、ならべて `…/models.html?compare=lily-pad,frog`・`…/models.html?compare=paper-boat,blue-feather`
