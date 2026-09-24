# 3D モデルの作り方（Claude Code）

最終更新: 2026-09-24
状態: 運用中。モデルはすべて Claude Code が作る（Codex 製は `archive/codex/` に移動済み）

---

## 1. 基本
- 1 モデル = `assets/blender/` の Python スクリプト（複数モデルをまとめたスクリプトもある）。手作業の造形はしない。何度実行しても同じ形になる
- 実行: `python3 scripts/run-bpy.py assets/blender/<script>.py`（pip の `bpy`＝Blender 5.0 を使う。Blender 本体があれば `blender -b --python` でも同じ）。まとめスクリプトは `-- 名前` で 1 つだけ作れる（例: `python3 scripts/run-bpy.py assets/blender/town.py -- tower`）
- 出力: `public/models/<名前>.glb` と `assets/previews/<名前>.png`
- 一覧と予算: `assets/models.json`（スクリプト、三角形の上限、ファイルサイズの上限）。`npm run build` のたびに `scripts/check-models.mjs` が全モデルを確認する（一覧との一致、予算、原点が床にあるか、ステージ JSON が参照するモデルがあるか、閉じた部品が裏返っていないか）。スモークテストの `tests/smoke/model-culling.spec.ts` は全モデルを 32 方向から「ゲームと同じ表だけ描画」と「両面描画」で撮り比べ、ゲームで消えてしまう部品（裏返ったデカール・屋根など）があると落ちる
- 確認: `https://hassy0511.github.io/train-game/models.html?model=<名前>`、並べて比べるときは `?compare=<名前>,<名前>`

## 2. 共通のルール
- 単位 1 = 1 m。+Y が上、+Z が前（顔・正面・進行方向）。原点は底面の中心（例外は各スクリプトの冒頭に書く。車両は車体中心の真下、ホームは線路側の縁）
- 1 ファイル 1 メッシュ（マテリアルは複数可）。キャラクターは 350 KB、ほかは 250 KB まで
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

## 5. モデル一覧（2026-09-24 時点）
| 種類 | モデル | スクリプト |
|---|---|---|
| キャラクター | partner（ピコ）、amanojaku（サカサ）、cat-stand / cat-sleep（猫）、passenger（なかま） | 各名前の `.py`（猫は `cat_cc.py` を共有） |
| 車両 | train-proto（先頭車・運転席の内装つき）、car-proto（客車） | `train-proto.py`、`car-proto.py`（`vehicle_common.py` を共有） |
| 駅 | platform、platform-roof、station-sign、stop-line、stop-board、buffer-stop-proto | `station.py` |
| 街 | house-a/b/c、shop、tower、hq、crossing-gate、crossing-sign、parcel、goal-flag、rock | `town.py` |
| 木 | tree-a、tree-b | `tree-a.py`、`tree-b.py` |
| 恐竜の谷（1-2） | fern-a/b、cycad、cliff-a/b（壁パネル、端は x=±6 で平ら）、rock-a/b、boulder、direction-sign（矢印はゲームが描く）、jump-unit、dino-egg、footprint-slab | `valley.py` |
| 恐竜の谷の生き物 | dino-mid-sleep / dino-mid-stand、dino-small-walk、dino-large-body ＋ dino-large-neck（首は付け根が原点）、ptero | `dinos.py` |

名前の `-proto` は、ゲームのコードが参照している名前なので残している（中身は本番用）。
