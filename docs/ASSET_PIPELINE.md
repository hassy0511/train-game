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
| うみのそこ（3-1） | sandbar / reef / sand-island（すなはま・リーフ・しおふきじま。海の そこに 立つ 台で、上面は 16.2 m の 高さで 平ら。umi が のぼり おりする 端は 線路の 0.4 m 下まで 坂に けずる。リーフの 上面は 76 m、かべは けわしい さんごの 台）、palm（ヤシ。原点は みきの 根もと）、kelp（こんぶ。頂点カラー。ゆれは ゲームが シェーダで つける `src/view/three/sea-models.ts`）、coral-a / coral-b / coral-c（えだ・おうぎ・まるい さんご。水の 中でも 色が のこるよう すこし 光る）、coral-arch（線路を またぐ アーチ。内のり 9 × 7.5 m 以上）、coral-pillar（上面が ちょうど 10.1 m。記録② の 貝が のる）、rock-crack（記録③ の すなの われめ）、whale（動く 部品 body・tail。tail の 原点が つけね (0, 2.4, −5.2)。頂点カラー 1 マテリアルで、ゲームが 1 頭ずつ うすれ用に 写し、自分の 色で すこし 光らせる）、fish-a / fish-b（3-2・3-3 の むれにも）、current-ring（頂点カラーの 1 メッシュ。ゲームが すける マテリアルで 描く）、awa-big / awa-pink（すける ピンクの あわ ＋ ぐるぐるの 帯）、awa-note、記録 rainbow-shell・pearl-clam・iron-star | `sea.py`（`sky.py`・`volcano.py`・`meadow.py` の 道具を 使う） |
| ほしのうみ（3-3） | cape-rock（みさきの 岩場。上面は y 34.6 で 60 × 110 m の 角の まるい 長方形、平ら。3 か所に おくので 草・花・石は 線路・ホーム・家・とうだいの かからない x > 9 と x < −17 だけ）、lighthouse（とうだい。ガラスの まんなかが ゲームの 灯の 高さ 20.6 m）、harbour-house（屋根 3 色、窓が 光る。6-2 でも つかう）、trench-wall（ほしの みぞの かべ。光る つぶは +Z の 面）、glow-coral、festival-raft（ちょうちん 4 この まんなかが (±2.6, 2.6, ±1.6)。ゲームが そこを 明るく する）、lantern-jelly（くらげの ちょうちん。群れで 泳ぐ）、lantern-post、sea-turtle-sleep / sea-turtle（顔は 目だけ）、記録 starfish・star-sand・festival-bell | `harbour.py`（`sky.py`・`volcano.py` の 道具を 使う） |
| たきのかわ（3-2） | reed（あし。根もとから 先へ 色が かわる 頂点カラー。5-1 の いけでも）、lily-pad（けしきの はすの はっぱ。切れこみは -Z）・lily-flower、water-weed（みずくさ。リボンは X に ならぶ。いきどまりの カーテン）、islet（なかす。上は y 20 で 平ら、|x| < 7.2。記録①が のる）、rapids（せ。水面は y 0.6、+Z が 上流）、river-bank（駅の 下の すなの 岸）、river-rock、sea-arch（谷の 南の 岩の アーチ。うみの 絵の 板は z −1.2、谷の がけの 手前）、falls-lip（たきの 口の 岩の ひさし。まんなかは ひさしの 下から 白い 水が 出る。前は z −2 まで）、falls-mini（地図の 絵の たき）、stepping-stones（とびいし）、kawa-rock（サカサの 岩。上は y 1.5 で 平ら）、paper-boat（ピンクの かみの ふね。帆に ぐるぐる）、frog（目が いちばん 上。顔は 目だけ）、duck-family（かもの おやこ。おやが +Z、ひな 4 わ）、snow-patch・snow-peak（のこった 雪・遠くの 雪の 山。4 章でも 使える）、記録 blue-feather・jade-stone・fukinotou | `river.py`（`sky.py`・`volcano.py`・`meadow.py` の 道具を 使う） |
| こおりのみずうみ（4-1） | snow-pine（雪の 松。4-2・4-3・6-2 でも。150 三角形 以下）、snow-bank（雪の もりあがり。車止めの「ゆきの クッション」にも）、snow-island（こじま。上面は 0.15 m 以下）、snow-mountain（ゆきやま。頂点は ぜんぶ 仮の 形の 断面 半径 190／150／110／70／35／8 m・高さ 0／35／80／122／155／170 m の 上、頂上 176 m。4-3 の 小さな 丘 `hillY` に 立つ 役者が ずれない）、tunnel-mouth（4-3 への トンネルの 口。中は やわらかい 青灰）、ice-hut / ice-hut-b / ice-hut-c（つり小屋。原点は 小屋の 軸、ドアが +Z）、ice-hole、ice-wall（かがみの たにの かべ。広い 面 ±Z は z ±1.8）、seal-sleep / seal（あざらし。顔は 目だけ）、snowbird（ゆきどり。行列は `ice.ts` が 焼いて 1 回で 描く）、sign-ice / sign-thin-ice（2-3 の 札と 同じ 作り、上に 雪）、記録 frost-flower・glow-shell（真珠が 光る）・ice-bell（記録は +X が 線路の ほう なので たなの −X を かべに つける）。雪・こおり・白い 鳥は 色の 6 わり ほどを 自分で 光らせる（ゲームの 物理どおりの 光では 日かげの 白が 灰色に なる） | `ice.py`（`sky.py`・`volcano.py`・`river.py` の 道具を 使う） |
| ゆきやまのトンネル（4-3） | snow-ridge（尾根。面は 仮の 形と 同じ 式で、`scripts/layout-4-3.mjs` の もみの木・トンネルの 屋根の たしかめと そろう。トンネルの 口の ところだけ 雪を 床の 下まで けずり、tunnel-portal の 暗い 板で かくす）、snow-knoll（いけの 小山。いけの 水・かべ・そこは ゲームが 描く）、tunnel-portal（z −2.4〜8.4、+Z が 外。口は 筒と 同じ はば 9・高さ 8。4.3 m 外に 暗い 板（内がわは 明るい））、ice-hall（とじた 殻なので 内がわから 見える。main の 筒が 通る 所に 戸口を あける。ステージは 1.25 倍）、ice-pillar、fake-exit（マテリアル `fake-exit-light`・`fake-exit-swirl` を ゲームが 霧に かくれない 光と ぐるぐるに かえる `src/view/three/snow-models.ts`）、exit-glow（マテリアル `exit-glow`。両面）、snow-fence（ゆきよけの さく。4-3 では 線路が 雪の 土手の 上 8.35 m なので、左右の さくは モデルの 一部の 雪の 吹きだまりに 立って 地面まで 下りる。下りる 高さは ステージ JSON から。原点は 門の 足もとの まま＝`"origin": "joint"`）、lodge、snow-wave / snow-wave-small（まるい 玉 9 ＋ 5、頂点カラーで 下が うすい 水色。顔なし）、snowman / snowman-big / snowman-upside（顔は 目と 小さな はなだけ）、snow-pile、記録 snow-hare・ice-flower・sleigh-bell。てれる サカサ amanojaku-blush は できて いる amanojaku に ほっぺを つけて ゲームが 作る | `snow.py`（`sky.py`・`volcano.py`・`river.py`・`meadow.py` の 道具を 使う） |
| おおゆきの むら（4-2）と ゆきかき | plow-blade（ゆきかき。原点は スコップの 下の まんなか、くぼみが +Z、うでは −Z。`plow.ts` が 先頭車の 鼻に つけて 1 回の 描画に 焼き、たたむ ときは 鼻の 下に しまう）、snow-wall（ゆきの かべ。面は z 2。頂点カラー 1 マテリアル。`plow.ts` が 自分の マテリアルで 描く）、sign-plow、snow-house / snow-house-b（かべ 茶・青灰、まどが 光る）、kamakura（入口が だいだいに 光る）、amanojaku-kamakura、lantern（紙は 頂点カラーの "lantern-paper"。ゲームが 光る ものに かえて まつりで いっせいに ともす `src/view/three/village-models.ts`）、snow-fence-small、snow-fence-trace（さかさまの さく。ぐるぐるは "trace-swirl"。ライトが 見つけると 光る）、snow-shed（ゆきよけ トンネル 10 m ぶん。柱は 5 m おきで、ならべると つながる）、ski-ramp / ski-ramp-folded（ジャンプだい。原点は ふち、台は −Z。たたんだ 板は +X 4 m）、ski-lift-tower（頭の 雪の 上が 12.48 m。記録③が そこに ささる）、snow-ravine、記録 frozen-fall・spiral-mitten・tin-shovel | `village.py`（`sky.py`・`volcano.py`・`meadow.py`・`river.py` の 道具を 使う） |
| よるのもり（5-1） | night-tree-a / night-tree-b（夜の 木。幹の 根もとが 原点で、葉の かたまりは 仮の 形と 同じ 所。150／180 三角形 以下。6-2 でも）、night-bush、glow-mushroom（かさが 青く 光る）、moon-meadow（つきの はらっぱの 板 60 × 100 m、上は y 0.06 で 平ら、ふちは 0.8 m で 床へ。少し 光る）、great-tree（おおきな き 50 × 68.6 × 50。うろは +Z に 1 つ だけ、ちょうちん 6 こが 光る。てっぺんの 光の 玉は ゲームが つける `src/view/three/night-models.ts`）、plaza-deck、big-stump、log-bridge-end（+Z が すきまの ほうで ささくれ）、thicket（−Z が 電車の 側）、birdhouse-upside（あなが +Z。ぐるぐるは "trace-swirl"、4-2 と 同じ）、bell-branch（枝は X、ふとい 先が +X、かぎは x −1。原点は かぎの 下はし）、firefly-wait、firefly-grass、firefly-swarm / firefly-swarm-big（glTF の 点 60／160。ゲームが 加算の ちらちらに する。原点は 球の 下はし＝`"origin": "joint"`）、sign-hush / sign-whistle-reversed、bunny-sleep、fawn、hedgehog-walk / hedgehog-ball、tanuki（1 ぴき。むれ "tanuki-<n>" は ゲームが ならべる）、fake-lantern（紙は 頂点カラーの "fake-lantern-paper"。ゲームが ピンクに 光らせ、見やぶると けす）、記録 bunny-family・moonstone（弱く 光る）・lantern-bell。動物の 顔は 目と はなだけ。白い 毛と 光る ものは 色の 一部を 自分で 光らせる（夜の 光は 昼の 70%）。ちょうちんを さげた サカサ amanojaku-lantern(-off) は できて いる amanojaku に ゲームが つける。root-mound（おおきな きの ねっこの おか。上は 48 × 220 m の 角の まるい 長方形で y 15.4 に 平ら＝ひろばの 地面、まわりは 20 m で 森の 床へ。数は `scripts/layout-5-1.mjs` の MOUND と 同じ）| `night.py`（`sky.py`・`volcano.py`・`river.py`・`meadow.py`・`village.py` の 道具を 使う） |

名前の `-proto` は、ゲームのコードが参照している名前なので残している（中身は本番用）。
