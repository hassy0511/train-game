# 0018 Blender: 5-1 よるのもり の モデル一式

- 状態: **未着手（後回し）**。5-1 と ためしの ステージ 0-1 は コードで 作った 仮の 形（`src/view/three/night-placeholders.ts`）で 遊べる。0006〜0009・0015〜0017 と 同じく 後回し
- 担当: Claude Code
- 依存: なし（作り方は `docs/ASSET_PIPELINE.md`）
- 関連: `docs/PHASE9_CHAPTER5_6.md` 第 4 部 §8 見た目・§5.4 配置・§12 台本、`src/view/three/night.ts`（うさぎが かくれる・こだぬきの おどり・分かれ道の ほたる・にせの ちょうちんが きえる・客車の まどの 光は ゲームが する）、`src/view/three/environment.ts`（夜の 光・月・星・ほたるの つぶ）、`scripts/layout-5-1.mjs`（置き場所）

## 目的
ステージ 5-1 の 世界（夜の 大きな 森。くらい もり・つきの はらっぱ・たぬきの ふだの 森が かわりばんこ。おくに 高さ 70 m の おおきな き と ほたるの ひろば）と、夜の 生き物（うさぎ・こじか・はりねずみ・こだぬき）、サカサの いたずらの しるし（さかさまの すばこ・ピンクの ちょうちん）。空は こい 青と むらさき、明るさは 昼の 70%。夜なので 色は こく、でも まっ黒に しない。
仮の形と **同じ 名前・寸法・原点** で 作る。できたら `assets/models.json` の `_pending` から 外し、`node scripts/render-map.mjs 5-1` で 地図の 島の 絵、`node scripts/render-zukan.mjs moon-bunnies pond-moonstone lantern-bell` で 図鑑の 絵を 描き直す。

## 共通仕様
- ファイル: `public/models/<名前>.glb`、生成スクリプトは `assets/blender/night-forest.py`（1 本に まとめる）
- 1 モデル 1 マテリアル（頂点カラー）。木・やぶ・きのこを たくさん 置くので 1 セル × 1 モデルで ドローコール 1 回に したい
- 2 つめの マテリアルが 要る もの: `great-tree`（ちょうちん 6 こ は 光る。てっぺんの ほたるの 光の 板は `fog: false` の 加算）、`birdhouse-upside`（ぐるぐるの しるし。ゲームが 放射の 強さを 0 → 1 に する。4-2 の `snow-fence-trace` と 同じ マテリアル）、`fake-lantern`（ちょうちんの 光。見やぶると ゲームが けす）
- 光る もの（放射）: `glow-mushroom` の かさ、`moonstone`（弱く）、`firefly-wait`、`great-tree` の ちょうちん
- 原点: 底面の 中心、前は +Z、モデル自身の 左は +X。例外は 表に 書く
- 木の 葉 `#2C5A55`〜`#3F7A6A`、幹 `#5A4636`。月の 側（+X・上）が 少し 明るい 頂点色
- **動物の 顔は 目（黒い 小さな 丸）と はなだけ**。口・歯・まゆ・まつげ・大きすぎる 目は つけない。服・かさ・葉っぱの かざり・とっくり・おなかの たいこは つけない（知られた キャラクターに にせない）。**おおきな きの うろは 1 つ だけ**（目と 口に 見える 並びに しない）。月に 顔なし。字・紋・マークは つけない

## モデル
| 名前 | 用途 | 寸法 幅×高さ×奥行 (m) | 三角形 | 色 | 原点・前方向 | アニメ |
|---|---|---|---|---|---|---|
| `night-tree-a` | 夜の 森の 木（約 220 本） | 6 × 14 × 6 | ≤ 150 | まるい 葉の かたまり 3 こ、こい 青みどり、幹 | 底面中心 | なし |
| `night-tree-b` | 夜の 森の 木（大きい、約 200 本） | 8 × 18 × 8 | ≤ 180 | 葉の かたまり 4 こ | 底面中心 | なし |
| `night-bush` | やぶ（こだぬきの すみか） | 3 × 1.6 × 3 | ≤ 60 | まるい やぶ | 底面中心 | なし |
| `glow-mushroom` | 光る きのこ（くらい 森の 線路わき） | 1.2 × 0.9 × 1.2 | ≤ 120 | 青い かさ `#7FD6FF`（放射）、白い 軸 `#EEF2F4`。大 1・小 1 | 底面中心 | なし（光だけ） |
| `moon-meadow` | つきの はらっぱの 草の 板 | 60 × 0.1 × 100 | ≤ 200 | うすい 青みどり `#5F8F86`、白い 花の 点 `#F4F6FF` | 板の 中心（底 0）。100 m が +Z | なし |
| `great-tree` | おおきな き（ひろばの 目印） | 40 × 70 × 40 | ≤ 2,500 | 太い 幹 Ø14、ねっこ 6 本、葉の かたまり 5 こ、枝に ちょうちん 6 こ（あたたかい 黄 `#FFD27A`、放射）。うろ 1 つ（+Z、低い 所）。てっぺんの まわりに ほたるの ぼんやりした 光の 板（`fog: false`） | 底面中心、うろが +Z | なし |
| `plaza-deck` | ひろばの 木の デッキ | 20 × 1 × 40 | ≤ 100 | 木の 板 `#9A6B45`／`#7A5234`、脚 | 底面中心、40 m が +Z | なし |
| `big-stump` | きりかぶえきの 大きな きりかぶ | 10 × 3 × 10 | ≤ 200 | 幹、上面に 年輪 `#C29A6B` | 底面中心 | なし |
| `log-bridge-end` | まるきばしの はし（こわれた） | 6 × 1.5 × 4.4 | ≤ 120 | 丸太 5 本 `#5A4636`、先が ささくれ | 底面中心、**+Z が 線路の 先（ささくれ側）** | なし |
| `thicket` | いきどまりの しげみ | 8 × 4 × 2 | ≤ 200 | まるい 葉の かべ（とげ なし） | 底面中心、**−Z が 電車の 側** | なし |
| `birdhouse-upside` | さかさまの すばこ（サカサの しるし ①） | 0.6 × 0.8 × 0.6 | ≤ 80 | 屋根が 下の すばこ `#B88A5A`、ピンクの ぐるぐる `#FF7FBF`（2 つめの マテリアル） | 底面中心、あなが +Z | ぐるぐるが 光る（ゲーム） |
| `bell-branch` | 記録③の 枝 | 6 × 1 × 1 | ≤ 60 | 太い 枝、つるす かぎ `#6E7784` | 枝の 中心、枝は X 方向 | なし |
| `moonstone` | 記録② いけの そこの つきいし | 0.5 × 0.3 × 0.4 | ≤ 80 | うすい 黄色の まるい 石 `#FFF1A8`（弱く 放射） | 底面中心 | なし |
| `lantern-bell` | 記録③ ランタンの すず | 0.4 × 0.7 × 0.4 | ≤ 200 | てつの 小さな ランタン `#6E7784`、金の すず `#E8B93A` | 底面中心 | きらっ（ゲーム） |
| `firefly-wait` | いきどまりの おくで まつ ほたる | 2 × 1.5 × 0.6 | ≤ 60 | 黄みどりの 光 `#D8FF7A` 6 こ（放射） | 底面中心 | なし |
| `firefly-swarm` / `firefly-swarm-big` | 寸劇の ほたるの むれ | 半径 3 ／ 6 m | 点 60 ／ 160 | 黄みどりの 点（`Points`、加算、`fog: false`） | 球の 下はし | ちらちら（コードで） |
| `amanojaku-lantern` / `amanojaku-lantern-off` | ちょうちんを さげた サカサ（あかり つき／きえた） | `amanojaku` と 同じ | `amanojaku` ＋ 60 | `amanojaku` の 手に 短い 棒と 4-2 の `lantern` に 似た まるい ちょうちん | `amanojaku` と 同じ | なし |

PR2c で 作った 分（同じ チケット）: `sign-hush`・`sign-whistle-reversed`・`bunny-sleep`・`bunny-family`・`fawn`・`hedgehog-walk`・`hedgehog-ball`・`tanuki`・`fake-lantern`・`firefly-grass`（寸法・予算は 第 4 部 §8 の 表、仮の 形は `night-placeholders.ts`）。
使い回す もの: `lantern-post`（3-3）、`reed`・`lily-flower`・`water-strip`（2-2・3-2）、はすの はっぱ（`floaters` の `lily`）、駅の 一式、`direction-sign`、`amanojaku`・`partner`、`train-proto`。
コードで 描く もの（モデルに しない）: 夜の 光・月・星・ほたるの つぶ、分かれ道の 草むらの ほたると ひかりの すじ、客車の まどの 光、生き物の 動き、ちょうちんの きえる 動き、いけ（`environment.water`）、ねっこの 土手（`base: rock`）。

## 受け入れ条件
- `npm run build`（`check-models`）と `tests/smoke/model-culling.spec.ts` が 通る
- Playwrightスモークのスクショ、またはモデル確認ページで確認できること: モデル確認ページ `https://hassy0511.github.io/train-game/models.html?model=<名前>` で 1 点ずつ 回して 見られる（ならべて 比べる: `…/models.html?compare=night-tree-a,night-tree-b,night-bush,glow-mushroom`・`?compare=moonstone,lantern-bell,birdhouse-upside`・`?compare=amanojaku-lantern,amanojaku-lantern-off`）
- `tests/smoke/stage-5-1-full.spec.ts` の スクショで、仮の形と 同じ 位置・大きさで 置き換わって いる。ドローコール 200 以下、三角形 10 万 以下（`npm run budget 5-1`）
