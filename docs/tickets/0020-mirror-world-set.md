# 0020（5-3 の 節）かがみのせかい の 形の 一式（かがみの わく・そっぽの かがみ・もん・ガラスの 木・かがみの たな・クッション・さかさもじ・記録・かがみの サカサ）

- 状態: **完了（2026-10-18）**。つくりこみ（`assets/blender/mirror.py`、`sky.py`・`volcano.py` の 道具を 使う）で 13 こ （`crystal-tree-a`・`crystal-tree-b`・`crystal-rock`・`mirror-pillar`・`mirror-shelf`・`mirror-cushion`・`mirror-frame`・`turn-mirror`・`mirror-board`・`hand-mirror`・`sakasa-doodle`・`note-pink`・`mirror-stand-small`）を 作り、コードの 仮の 形 `src/view/three/mirror-placeholders.ts` を けした。名前・原点・向き・大きさは 仮の 形と 同じ（±0.1 m）。表と ちがう 所: スクリプトは `mirror-world.py` でなく `mirror.py`。1 モデル 1 マテリアル（頂点カラー）では なく 色ごとの 平らな マテリアル（ゲームが 1 つに 焼くので ドローコールは 同じ）。大きさは 仮の 形の まま: ガラスの 木 4.16・7.28 m（表は 4・7）、きらきらの 岩 2.28×2.59×2.1（表は 2）、柱 1.4×8.1×1.4（表は 1.2×8×1.2）、たな 2.1×3.2×1.37（板の 上 3.2 m）、クッション 6×3.1×1.98、記録① 1.3×1.75（ピンクの ふち こみ）、記録③ 1.12×1.48×0.59、`mirror-frame` 21.2×14.8×1.6・`turn-mirror` 13.2×10.8×1.6（わく・足 こみ）。`mirror-frame` と `turn-mirror` は モデル確認ページ・6-2・ムービー・地図の 絵 用（5-3 の かがみは いままでどおり ゲームが 大きさと 写しごと 描く `ice.ts`）。記録①の「ようこそ」（かがみ文字）と 記録③の クレヨンの えは ゲームが canvas で 描いて 面の マテリアル "mirror-board-face"・"sakasa-doodle-paper" に はる （`src/view/three/mirror-models.ts`。モデル確認ページでも 同じ）。クッションは `mirror-world.ts` が 焼いて 1 回で 描く。うすい 色は 自分の 色の 3 わり ほどを 光らせる（4 章の 6 わりでは ラベンダーが 白く とぶ）。`amanojaku-wave`・`amanojaku-shy` は できて いる `amanojaku` を ゲームが 動かして 作る まま。置き場所の 直し（`scripts/layout-5-3.mjs`）: たな 2 つを 90° に（板の 長い 前が 線路の ほうへ。-90° では 線路と 反対を むいて いた）、はじめの ほしを たなの 板の 上（2.6 m。3.4 m で 0.8 m 浮いて いた）、記録②を 高い たなの 板の 上（9.16 m。9.3 で 浮いて いた）に 置き 180° まわして ガラスを 来る 電車へ、記録③の イーゼルを 地面に（ガラスの わき道の よこで 1.4 m 浮いて いた）。6-2 の かがみの もん（p3 660）も ガラスを 来る 電車へ（`scripts/layout-6-2.mjs`、180°）
- 担当: Claude Code
- 依存: なし（作り方は `docs/ASSET_PIPELINE.md`）
- 関連: `docs/PHASE9_CHAPTER5_6.md` 第 6 部 §8 見た目・§5 コース・§12 台本、`src/view/three/mirror-world.ts`（かがみの もん・まぼろし・ガラス・さかさもじの かんばん・クッション）、`src/view/three/ice.ts`（かがみの 写し・わくの ある かがみ・くるっと まわる）、`src/view/three/actors.ts`（かがみの サカサ・寸劇の ハートと ほし）、`scripts/layout-5-3.mjs`（置き場所）
- **チケット 0020 は 2 節**: この「かがみの せかい（5-3）」の 節と、PR5 が 先に 書いた「じしゃくライトの しかけ（共通）」の 節（[0020-magnet-light-common.md](0020-magnet-light-common.md)）。いっしょに する ときは 1 つの ファイルに まとめる。共通の 節の 仮の かがみは `turn-mirror-small`（`mirror` を 書かない `turn` の まと。5-3 の そっぽの かがみは この 節の `turn-mirror` の うら）

## 目的
ステージ 5-3 の 世界（ラベンダーと 白の かがみの せかい。ガラスの 木と きらきらの 岩、ところどころに 銀の わくの 大きな かがみ。どの かがみにも ワンダーごうが うつる）。昼の 光、まっくらな 所は ない。
仮の形と **同じ 名前・寸法・原点** で 作る。できたら `assets/models.json` の `_pending` から 外し、`node scripts/render-map.mjs 5-3` で 地図の 島の 絵、`node scripts/render-zukan.mjs kagami-kanban hand-mirror sakasa-doodle` で 図鑑の 絵を 描き直す。

## 共通仕様
- ファイル: `public/models/<名前>.glb`、生成スクリプトは `assets/blender/mirror-world.py`（1 本に まとめる）
- 1 モデル 1 マテリアル（頂点カラー）。ガラスの 木・岩・柱は たくさん 置くので まとめて 描く（`InstancedMesh`）。ガラスの 面・写しは ゲームが 描く（モデルに 入れない）
- 原点: 底面の 中心、前は +Z（かがみの ガラスが +Z）
- アニメは コードで 動かす（ボーン なし）。かがみは まるごと くるっと まわる、もんの ガラスは シェーダで ゆらぐ、クッションは ぷるん、かがみの サカサの 腕は コードで ふる
- **顔を つけない**: 電車・写しの 電車・かがみの わく・ガラスの 木・クッション・柱に 目や 口の ような 形を 作らない（かがみの サカサは サカサ 本人の 写し）
- 実在の ものに 似せない: 実在の 建物・遊園地の かがみの 家・有名な 物語の かがみに しない。かがみは **割れた 形を 作らない**（割れ目・かけら なし。サカサは かがみを くるっと うらがえす）

## モデル（第 6 部 §8）
| 名前 | 用途 | 寸法 幅×高さ×奥行 (m) | 三角形 | 色 | 原点・向き | 動き |
|---|---|---|---|---|---|---|
| `mirror-frame`（ゲームが 描く） | 5-3 の かがみの わく（`mirror` の `look: "frame"`） | はば・高さは params、わくの 太さ 0.6、2 本 足 | ≤ 300 | 銀 `#d9d6ea`、ふちの ラベンダー `#b9a8ec` | 下の まんなか、ガラスが +Z | なし |
| `turn-mirror` | そっぽの かがみの うら と 回る 軸（`mirror` の `back`） | 12×9、うらは てつの 板 0.2 | ≤ 420 | うら `#7a8ca3`、ぐるぐる `#E75BA0`、軸 `#d9d6ea` | 下の まんなか、ガラスが +Z | くるっ（コード、0.6 秒） |
| `mirror-gate`（ゲームが 描く） | かがみの もん（アーチ ＋ ゆらぐ ガラス） | 内の はば 14・高さ 10、柱 1.2 | ≤ 500 | 銀と ラベンダー、ガラスは うすい 水色 `#eaf4ff` | レール上面の まんなか、ガラスの 面 | ゆらぎ、ひらく とき 0.5 秒 |
| `crystal-tree-a`・`crystal-tree-b` | ガラスの 木 | 高さ 4・7 | 90・120 | ラベンダー `#b9a8ec`、ミント `#a8e6d8`、うすい 光 | 根もと | なし |
| `crystal-rock` | きらきらの 岩 | 2 | 60 | `#d6ccf5` | 下 | なし |
| `mirror-pillar` | かがみの 柱（写さない。ぴかぴか だけ） | 1.2×8×1.2 | 48 | 銀、上に ラベンダーの 玉 | 下 | なし |
| `mirror-shelf` | かがみの たな（柱 ＋ 上の 板。入りの ほし、記録②） | 柱 1×3、板 2×0.3×1.2（`scale` で 高さ） | 80 | 銀、板 `#fff3d6` | 下、板が +Z | なし |
| `mirror-cushion` | まぼろしの いきどまりの 車止め（わき道 `ura` の おわりも。PR8a まで） | 6×3×2 | 160 | ラベンダー `#cdb8f2`、白い ふち | レール上面の まんなか、−Z が 電車の 来る 側 | ぷるん（コード） |
| `letter-sign`（ゲームが 描く） | さかさもじの かんばん | 4×1.6、足 1.2 | 40 ＋ canvas 256×128 | 板 `#fff8e6`、ふち ピンク、字 `#5a4a3a` | 下の まんなか、字が +Z | なし |
| `mirror-board` | 記録① かがみの なかの かんばん | 1.2×0.8、足 0.9 | 60 ＋ canvas 128×64 | `letter-sign` と 同じ（字は かがみ文字「ようこそ」） | 下、字が +Z | なし |
| `hand-mirror` | 記録② てつの てかがみ | 0.4×0.7×0.08 | 120 | てつ `#7a8ca3`、まるい ガラス `#eaf4ff`、ぐるぐる | まんなか、ガラスが +Z | とぶ（じしゃく、コード） |
| `sakasa-doodle` | 記録③ かがみの うらの らくがき（イーゼルに クレヨンの え） | 1.2×1.5 | 80 ＋ canvas 256×256 | 木 `#c89b6a`、紙 `#fffaf0`。え: ワンダーごうの 客車の まどに ぐるぐる ぼうし（顔なし） | 下、えが +Z | なし |
| `amanojaku-wave` | かがみの サカサ（手を ふる） | 本体と 同じ | 8,200 | 本体と 同じ | 本体と 同じ | 右腕を ふる（コード） |
| `amanojaku-shy` | かがみの サカサ（出。手を まえで あわせ、首を 10° かしげる） | 同じ | 同じ | 同じ | 同じ | なし |
| `note-pink` | ピコが もつ 2 まいの 紙 | 0.3×0.4 × 2 まい | 16 | `#fff8e6`、ピンクの ぐるぐる | 下の まんなか、字が +Z | なし |
| `mirror-stand-small` | ホームの 小さな かがみ（出の 場面 3） | 1.2×2 | 60 | 銀、ガラス `#eaf4ff` | 下、ガラスが +Z | なし |

- `amanojaku-wave`・`amanojaku-shy` は 4-3 の `amanojaku-blush` と 同じ 作り（組み立てずみの `amanojaku` の 腕・首の むきを かえる。`src/view/three/models.ts`）。
- 描く だけの もの（モデルなし）: まぼろしの ピンクと きらきら、ガラスの レールの 材質、ぽわんの あわ、かがみの なかの きらきら（DOM）、札の かがみ（DOM・SVG）、寸劇の ハートと ほし（`fx: "hearts"`、1 回で 描く）、吹き出しの 小さな 絵 `ride`（SVG）。
- 地図の 島の 絵（`public/map/5-3.png`）: `mirror-frame` 2 まい（1 まいは ななめ）、ガラスの 木、きらきらの 岩、柱、`train-proto`。

## 受け入れ条件
- モデル確認ページで 1 つずつ 回して 見られる: `https://hassy0511.github.io/train-game/models.html?model=turn-mirror`（ほかの 名前も 同じ）、ならべて くらべる `https://hassy0511.github.io/train-game/models.html?compare=amanojaku-wave,amanojaku-shy`・`https://hassy0511.github.io/train-game/models.html?compare=mirror-board,hand-mirror,sakasa-doodle`
- または Playwright スモーク（`tests/smoke/stage-5-3-full.spec.ts`・`mirror-world.spec.ts`）の スクショで 見える こと
- `npm run budget 5-3` が 200 回・10 万 三角形 以内（第 6 部 §16 の 見つもり 約 105 回・7 万）

## 進め方
1. 設計を示して、だいさんの GO をもらう（`CLAUDE.md` の GO ルール）
2. ブランチで作業し、PR を出す。CI（モデル確認・スモーク）が通ったらマージして GitHub Pages に出す
3. 報告には確認用 URL（本番、テストコース、モデル確認ページ）を書く
