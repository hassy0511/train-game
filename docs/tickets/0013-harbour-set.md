# 0013 3-3 ほしのうみ の 形の 一式（つくりこみ `harbour.py`）

- 状態: **完了（2026-10-16）**。つくりこみ（`assets/blender/harbour.py`、1-3 の `sky.py` と 2-3 の `volcano.py` の 道具を 使う）で 13 こ ぜんぶ（うみがめ 2 こと 記録 3 こを ふくむ）を 作り、コードの 仮の 形 `src/view/three/harbour-placeholders.ts` を けした。名前・寸法・原点・向きは 仮の 形と 同じ（ステージ JSON は そのまま）。仮の 形と ちがう 所: 1 モデル 1 マテリアルでは なく 色ごとの 平らな マテリアル（ゲームが 1 つに 焼くので ドローコールは 同じ）、光る もの（みぞの つぶ・さんご・ちょうちん・くらげ・ほしの すな・すず）と 夕方に くすむ 白（とうだい・家）は 色の 一部を 自分で 光らせる、とうだいの ランプの 部屋は 8 まいの うす青い ガラス（ゲームの 灯の 玉 半径 1.6 m が ガラスから 黄色く すけて 見える）、みさきの 上の 草・花・石は 3 か所 どこでも 線路・ホーム・家・とうだいに かからない 所だけ（そのぶん 高さは 35.9 m）、すずは 顔に 見えない よう 下の すきまを 真下に して まんなかに 合わせ目の 帯。ゲームの うごかす 部品は ない（灯・光の すじ・ちょうちんの 明かり・くらげの 上がり・うみがめの 泳ぎは ゲームが 動かす）
- 担当: Claude Code
- 依存: なし（作り方は `docs/ASSET_PIPELINE.md`）
- 関連: `docs/PHASE8_CHAPTER3_4.md` 第 5 部 §8（見た目）・§5.5（置く 所）・§19（実装メモ）、`assets/blender/harbour.py`（形。仮の 形 `src/view/three/harbour-placeholders.ts` は けした）、`src/view/three/harbour.ts`（とうだいの 灯と 光の すじ・おまつり・おつきさま）

## 目的
ゆうぐれの 海と みなとの ほしまつり。ほしの みぞ（あい色の 岩かべに 光る つぶ、光る さんご）、ねむる うみがめ、くらげの ちょうちん、ちょうちんの いかだ、白と ミントの とうだい。こわい もの（サメ・沈没船・がいこつ・ちょうちんあんこう・くらい あな）は 出さない。生き物は まるく、顔は 目だけ（口・歯・とげ・はりの ある 足 なし）。とうだいは どこの 実在の とうだいにも 似せない。ちょうちんに 文字・もよう・紋は 入れない。
仮の 形と **同じ 名前・寸法・原点** で 作る。できたら `assets/models.json` の `_pending` から 外し、`node scripts/render-map.mjs 3-3` で 地図の 絵、`node scripts/render-zukan.mjs sunset-starfish star-sand festival-bell` で 図鑑の 絵を 描き直す。

## 共通仕様
- ファイル: `public/models/<名前>.glb`、生成スクリプトは `assets/blender/harbour.py`（1 本に まとめる）
- 1 モデル 1 マテリアル（頂点カラー）。光る もの（`trench-wall` の つぶ、`glow-coral`、`festival-raft` と `lantern-post` の ちょうちん、`lantern-jelly`）は 自分で 少し 光る マテリアルを 1 つ 足して よい。原点は 底面の 中心、前は +Z。アニメは なし（うみがめの 泳ぎ、くらげが 上がる 動き、とうだいの 光の すじは ゲームが 動かす）
- とうだいの ランプの 部屋は 高さ 20.6 m（ゲームが そこに 灯を ともす）

## モデル
| 名前 | 用途 | 寸法 幅×高さ×奥行 (m) | 三角形 | 色 |
|---|---|---|---|---|
| `cape-rock` | みさきの 岩場、とうだいの 岬、岸 | 60 × 34.6 × 110 | ≤ 600 | 夕日で 桃色がかった 岩 `#9C8A8E`、上面に 草 `#7FAF5A` |
| `sea-turtle-sleep` / `sea-turtle` | ねむる うみがめ（線路の 上、水の 中）／ 泳ぐ うみがめ | 3 × 1.2 × 4 ／ 3.4 × 1.4 × 4 | ≤ 600 ／ 800 | こうら `#8CCB9E` に 六角の 頂点色、目は 閉じた 線 ／ まるい 点 |
| `trench-wall` | ほしの みぞの かべ | 40 × 24 × 12 | ≤ 500 | あい色 `#2B3F6E`、光る つぶ `#9FE8FF`（+Z の 面） |
| `glow-coral` | ほんのり 光る さんご | 3 × 3 × 3 | ≤ 250 | `#7FD6FF` ／ `#C9A0E0` |
| `festival-raft` | ちょうちんの いかだ | 8 × 3 × 6 | ≤ 600 | 板 `#B98A5E`、ちょうちん `#FFD08A` 4 こ（(±2.6, 2.6, ±1.6)） |
| `lantern-jelly` | くらげの ちょうちん | 1.6 × 2.4 × 1.6 | ≤ 200 | かさ `#FFC9E8`（中が 光る）、みじかい リボン 4 |
| `lighthouse` | とうだい | 8 × 24 × 8 | ≤ 1,200 | 白い 塔に ミント `#8FD3C1` の 帯 2、ランプの 部屋と 手すり、屋根 |
| `lantern-post` | ホームの ちょうちんの 柱 | 0.6 × 3.5 × 0.6 | ≤ 150 | 木 ＋ ちょうちん 1 |
| `harbour-house` | 岸の 小さな 家（窓が 明るい） | 6 × 6 × 6 | ≤ 300 | 屋根 3 色 |
| `starfish` / `star-sand` / `festival-bell` | 記録①②③ | 0.8 × 0.2 × 0.8 ／ 1 × 0.6 × 1 ／ 0.6 × 0.7 × 0.6 | ≤ 120 ／ 250 ／ 200 | ゆうやけ `#F59B6B` ／ 貝 ＋ 星の つぶ `#FFF3A8` ／ すず `#C9B26A`、ひも `#E86A6A` |

## 受け入れ条件
- `npm run build`（check-models）と `tests/smoke/model-culling.spec.ts` が 通る
- Playwright スモーク `tests/smoke/stage-3-3-full.spec.ts` の スクショ（`tests/smoke/output/120〜139-*.png`）で 見た目を 確かめられる
- モデル確認ページで 1 点ずつ 回して 見られる: `https://hassy0511.github.io/train-game/models.html?model=lighthouse`、ならべて `…/models.html?compare=sea-turtle,sea-turtle-sleep`・`…/models.html?compare=festival-raft,lantern-jelly`
