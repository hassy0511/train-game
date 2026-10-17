# 3D モデルの作り方（Claude Code）

最終更新: 2026-10-16
状態: 運用中。モデルはすべて Claude Code が作る（Codex 製は `archive/codex/` に移動済み）

---

## 1. 基本
- 1 モデル = `assets/blender/` の Python スクリプト（複数モデルをまとめたスクリプトもある）。手作業の造形はしない。何度実行しても同じ形になる
- 実行: `python3 scripts/run-bpy.py assets/blender/<script>.py`（pip の `bpy`＝Blender 5.0 を使う。Blender 本体があれば `blender -b --python` でも同じ）。まとめスクリプトは `-- 名前` で 1 つだけ作れる（例: `python3 scripts/run-bpy.py assets/blender/town.py -- tower`）
- 出力: `public/models/<名前>.glb` と `assets/previews/<名前>.png`
- 一覧と予算: `assets/models.json`（スクリプト、三角形の上限、ファイルサイズの上限）。`npm run build` のたびに `scripts/check-models.mjs` が全モデルを確認する（一覧との一致、予算、原点が床にあるか、ステージ JSON が参照するモデルがあるか、閉じた部品が裏返っていないか）。スモークテストの `tests/smoke/model-culling.spec.ts` は全モデルを 32 方向から「ゲームと同じ表だけ描画」と「両面描画」で撮り比べ、ゲームで消えてしまう部品（裏返ったデカール・屋根など）があると落ちる
- 確認: `https://hassy0511.github.io/train-game/models.html?model=<名前>`、並べて比べるときは `?compare=<名前>,<名前>`
- 2026-10-15 だいさん: 見た目は つくりこみ（この やり方）で 統一。ライブラリ（Kenney）と 比べた 結果（1-3 の 島・雲・浮き標を コードの 仮の 形・つくりこみ・ライブラリの 3 つで 見くらべた。つくりこみの 一式が `assets/blender/sky.py`）
- 地図の島の絵（`public/map/<ステージ>.png`）は、モデルを島の上に並べて描いたもの（島は どれも `island-b`。直したら 全部の 絵が かわる）。モデルを足したり直したりしたら `node scripts/render-map.mjs` で描き直す（並べ方は `src/world/world.json` の `diorama`。`docs/PHASE4_DESIGN.md` §3。夜の 島（5-1）は `"lighting": "night"` で 青い 月あかり 70% の 光で 描く）

## 2. 共通のルール
- 単位 1 = 1 m。+Y が上、+Z が前（顔・正面・進行方向）。原点は底面の中心（例外は各スクリプトの冒頭に書く。車両は車体中心の真下、ホームは線路側の縁）
- 1 ファイル 1 メッシュ（マテリアルは複数可）。キャラクターは 350 KB、ほかは 250 KB まで。例外は ゲームが 動かす 部品（2-2 の バッタの 頭・触角・後ろ足、ちょうちょの はね）: 同じ GLB の 中の 名前つきの ノードに して、ノードの 原点を 回る 軸に 置く。`check-models` は ノードの 位置を 足して 床の 高さを はかる
- 実在の車両・キャラクターに似せない。電車に顔を付けない（ライトは横長の帯とランプ 1 つ）
- 面の表裏を守る。ゲームは面の表側しか描かない（裏は透ける）が、Blender のプレビューは両面を描くので裏返りに気づけない。デカールは `poly_decal` / `disc_decal` / `ribbon_decal` を使えば頂点の並び順に関係なく +Z 向き（`facing=-1` で -Z）になる。手で面を組んだときは法線の向きを確かめる
- 権利の心配がある素材（写真・既存のテクスチャ）は使わない。色は単色マテリアルか、スクリプトで塗って焼き込んだ画像だけ

## 3. 作り方の道具（`assets/blender/cc_common.py`）
| 道具 | 使いどころ |
|---|---|
| 粘土（ボクセルリメッシュ） | キャラクターの体。重ねた丸い形を 1 枚の面に融合して、首・肩・指の継ぎ目を消す |
| 色ぬり＋焼き込み | 猫の縞やサカサの長靴のように、1 つの面に柄がある場合。細かい面に色をぬって、軽くした面に 1 枚の画像として焼く |
| 色ごとの粘土 | 乗客のように、ゲーム側で色を変える部分（コート）があるキャラクター。色ごとに別マテリアルにする |
| デカール | 目・口・窓ガラスなど。表面に正面から押し付けるので、横から見ても浮かない |
| 箱・ロフト・角柱 | 建物・車両・駅。角を少し丸めて、ハイライトが入るようにする |

## 4. 絵柄
- 正本は `assets/concepts/` の承認済みデザイン。キャラクターは三面図の比率をそのまま使い、縦横別々に引き伸ばさない
- 街と乗り物はおもちゃの街: 台座、厚い屋根と軒、枠付きのへこんだ窓、玄関のひさし。色はクリーム・コーラル・深い青・紫・金を基調にする
- ワンダー号は青い車体、クリームの屋根、黄色の帯。先頭車の屋根にピコと同じランプ

## 5. モデル一覧（2026-10-16 時点）
| 種類 | モデル | スクリプト |
|---|---|---|
| キャラクター | partner（ピコ）、amanojaku（サカサ）、cat-stand / cat-sleep（猫）、passenger（なかま） | 各名前の `.py`（猫は `cat_cc.py` を共有） |
| 車両 | train-proto（先頭車・運転席の内装つき）、car-proto（客車） | `train-proto.py`、`car-proto.py`（`vehicle_common.py` を共有） |
| 駅 | platform、platform-roof、station-sign、stop-line、stop-board、buffer-stop-proto | `station.py` |
| 街 | house-a/b/c、shop、tower、hq、crossing-gate、crossing-sign、parcel、goal-flag、rock | `town.py` |
| 木 | tree-a、tree-b | `tree-a.py`、`tree-b.py` |
| 恐竜の谷（1-2） | fern-a/b、cycad、cliff-a/b（壁パネル、端は x=±6 で平ら）、rock-a/b、boulder、direction-sign（矢印はゲームが描く）、jump-unit、dino-egg、footprint-slab | `valley.py` |
| 恐竜の谷の生き物 | dino-mid-sleep / dino-mid-stand、dino-small-walk、dino-large-body ＋ dino-large-neck（首は付け根が原点）、ptero、ptero-far（群れ用の遠景版。絵なしの 2 色・400 三角形以下） | `dinos.py` |
| くものうえ（1-3） | island-a / island-b / island-c（浮島。原点は 上面の 中心で、岩は 下。`assets/models.json` の `"origin": "top"`）、island-flip ＋ island-flip-cap（線路が 回りこむ 板と その 丸い 端）、cloud-a / cloud-b、cloud-bounce（ぽよん雲）、sky-buoy（浮き標）、jump-pad（汽笛で 出る ジャンプ台）、updraft-ring（線路を くぐる 風の 輪）、記録 cloud-crystal・weathervane・upside-flower（さかさに さく 花。原点は くきの 根もと＝上） | `sky.py` |
| 記録（1-1・1-2） | record-town-board（まちの かんばん）、record-hq-plans（ほんぶの せっけいず）、record-balloon（原点は ひもの 下の はし）、record-nest（がけの うえの す） | `records.py` |
| おおきなきのくに（2-1） | tree-trunk（巨木。根は 38 m の 円まで）、canopy（葉の かたまり。色を ぬって 焼いた 絵 1 枚）、branch-log（線路の 下の 枝。原点は 上面の 中心で、上面は 端から 端まで y = 0）、branch-stub（記録を のせる 横の 小枝。原点は 記録を のせる 上面、+Z が 枝の 外）、bough-slab ＋ bough-slab-cap（さかさえだの 板と その 丸い 端。island-flip と 同じ 決まりで、板は 50 m）、leaf-pad（落ちた 電車を 受ける 大きな 葉。2-2 でも 床・屋根・はすの 葉に 使う）、mushroom、acorn（転がる 木の実。ゲームが まん中で 回す）、squirrel（リス。原点は 体の 下）、記録 acorn-big・squirrel-nest・record-feather | `forest.py`（`sky.py` の 道具を 使う） |
| むしのはらっぱ（2-2） | grass-blade（草の 森。根もとから 先へ 色が かわる 頂点カラー）、clover（上面は 1.5 m で 平ら。線路と 駅が のる）、meadow-flower（まんなかの 上が ちょうど 30 m）、water-strip（半透明 0.8、まんなかが こい 頂点カラー）、grasshopper（動く 部品 body・head・antenna-left/right・leg-left/right）、butterfly（原点は 体の まんなか、`"origin": "joint"`。動く 部品 wing-left/right）、spider（おわりの 寸劇）、rail-web（線路で できた くもの す。原点は いちばん 下、+Z が 正面）、記録 clover-four・dandelion-seed・record-marble（池の そこの ビーだま。半透明の ガラスの 中に 3 色の ひねり） | `meadow.py` |
| かざんのしま（2-3） | volcano（火山の 島 ぜんぶ。はだは 線路の 円すいの 上に 頂点、面は その 内側）、mesa-a / mesa-b（はなれやま・みさき。上面は y 48 で 表の 大きさ いっぱい 平ら）、old-bridge（ぐらぐらばし 20 m ぶん。原点は 床板の 上＝`"origin": "joint"`）、observatory（かんそくじょ）、seabird / seabird-sleep（うみどり。顔は 目だけ）、sign-steep / sign-slide / sign-no-rocket（さかと ロケット おやすみの 札）、rocket-unit（屋根の ロケット。後の ステージでも のる）、記録 pumice（かるいし。ころがる 石・おちる 石にも）・sulfur-crystal・spring-vent（あわの いずみ。3-1・3-2 でも つかう） | `volcano.py`（`sky.py` の 道具を 使う） |
| ほしのうみ（3-3） | cape-rock（みさきの 岩場。上面は y 34.6 で 60 × 110 m の 角の まるい 長方形、平ら。3 か所に おくので 草・花・石は 線路・ホーム・家・とうだいの かからない x > 9 と x < −17 だけ）、lighthouse（とうだい。ガラスの まんなかが ゲームの 灯の 高さ 20.6 m）、harbour-house（屋根 3 色、窓が 光る。6-2 でも つかう）、trench-wall（ほしの みぞの かべ。光る つぶは +Z の 面）、glow-coral、festival-raft（ちょうちん 4 この まんなかが (±2.6, 2.6, ±1.6)。ゲームが そこを 明るく する）、lantern-jelly（くらげの ちょうちん。群れで 泳ぐ）、lantern-post、sea-turtle-sleep / sea-turtle（顔は 目だけ）、記録 starfish・star-sand・festival-bell | `harbour.py`（`sky.py`・`volcano.py` の 道具を 使う） |

名前の `-proto` は、ゲームのコードが参照している名前なので残している（中身は本番用）。
