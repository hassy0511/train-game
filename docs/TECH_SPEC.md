# 技術仕様書 — つなげ！レール探検隊（仮題）

最終更新: 2026-10-06（日本時間。PHASE9 PR12 仕上げで 5・6章ぶんを コードと つきあわせた）
状態: 技術構成確定済み。Phase 0 の確定値は §9。

---

## 1. 技術スタック（確定）

| 領域 | 採用 | 備考 |
|---|---|---|
| 3D描画 | Three.js | 骨掘り調査隊と同じ |
| 言語 | TypeScript | |
| ビルド | Vite | |
| 物理 | Rapier（@dimforge/rapier3d-compat） | **初期スタックに含める。後付けしない** |
| モデル | Blender（ヘッドレスPython） → glTF(.glb) | |
| UI | DOMオーバーレイ（HTML/CSS） | Three.js内でUIを組まない |
| 配信（開発） | GitHub Pages | PWA |
| 配信（ストア） | Capacitor でラップ | iOS/Android。Phase 5以降 |
| テスト | Playwright（ヘッドレスブラウザでスモーク＋スクショ） | CI とローカルで使う |

Godotは**採用しない**（決定理由: エージェント主導でエディタを触る人がおらず、電車は線路拘束のため物理エンジン主体の利点が薄い。物理演出はRapierで同等を実現）。

### ターゲット環境
- 主: iPad Safari、iPhone Safari（横持ち）
- 副: Android Chrome（廉価端末含む。動作保証最低端末は Phase 0 で決める）
- PC ブラウザは開発・デバッグ用のみ

---

## 2. アーキテクチャ

原則: **電車は線路上のパラメータで動く。物理はキネマティック登録＋演出・判定に使う。**

### モジュール構成
| モジュール | 責務 |
|---|---|
| `rail` | 線路。CatmullRomスプライン。位置・向き・傾き・分岐（ジャンクション）の解決。ジャンプ中の高さオフセット |
| `train` | 電車の状態機械（速度段、アクション、クールダウン、ゲージ）。線路パラメータを進める。カメラは運転席位置に固定 |
| `actions` | 汽笛・ライト・ジャンプ・ロケット・もぐる・ゆきかき・じしゃくライト・うしろむき（前の 名前は 潜水・磁石ライト・逆走）。解放状態、クールダウン、ゲージ。ステージから「反応するもの」を登録する仕組み |
| `physics` | Rapierワールド。電車＝キネマティック剛体。障害物・演出物＝剛体／センサー。全判定はRapierのセンサー（トリガー）に統一 |
| `stage` | ステージJSONを読み、線路・配置物・イベント・ミッションを構築。章＝独立した線路網 |
| `mission` | ミッションの型（とどける／むかえにいく／なおす／まにあわせる）。開始・進捗・達成・失敗→やり直し |
| `gimmick` | ステージ固有ギミック（重力逆転、逆標識、逆ルール、消えるジャンプ台など）。プラグイン式で追加 |
| `ui` | DOMオーバーレイ。マスコンレバー、ボタン、分岐矢印、ドアボタン、相棒の吹き出し、地図画面、図鑑 |
| `save` | 進行・記録・能力。Capacitor Preferences → localStorage フォールバック（いまの 実装は `src/core/progress.ts`、localStorage だけ。§3 の 進行セーブ） |
| `audio` | 効果音・BGM・走行音。初回タップで解錠。音は すべて コードで 合成（音声ファイルなし）。効果音と BGM は コンプレッサーで まとめて 割れない ように する。走行音（`run-sound.ts`）は 毎フレーム 速さ・レバー・空中・線路の しゅるいで 鳴らしかたが かわる。`sounds.html` で 1 つずつ 聞ける（テストは オフラインで 鳴らして 音量を はかる） |
| `debug` | キーボード操作、ステージ直接起動、無敵、スプライン可視化。本番ビルドでは無効 |

### 電車の移動モデル
- 位置 = スプライン上の `t`（0〜1）と、線路ID
- 速度段: 停止／ゆっくり／ふつう／はやい（内部は連続値で補間）
- ジャンプ: `t` は進み続け、高さは放物線オフセット。着地判定は「着地時点の `t` に線路が存在するか」
- 重力逆転: 線路の上方向ベクトルを反転してカメラとオフセットを適用
- 逆走（うしろむき、2026-09-30 PR8a）: `t` を 減らすのでは なく、通った 道（`Trail`、下の 節）を さかさに たどる（`Trail.retreat`）。道を きめるのは 通った 道（いちばん うしろの 車両が 来た 線路）で、線路の つながりでは ない。カメラは `cab` → `rear`（うしろの まど）・`chase` → `chase-rev`
- 分岐: ジャンクション手前の一定距離でUI表示、選択結果で次の線路IDを決める

### 車両の 置き方と 通った 道（`Trail`、2026-09-30 PHASE9 PR7）
- `src/train/consist.ts` の `Trail`（はじめの 案の ConsistPath）。電車は **通った 道**（線路と s の きれはし `{ railId, from, to, d0 }` の ならび、古い → 新しい。さいごの きれはしの `to` が 先頭の 車両の まん中 `state.s`）を おぼえる。`d0` は その きれはしの はじまりの「道の 積算きょり」（通った 道 だけが もつ 目もり）
- 車両の 姿勢: i 両めの まん中 ＝ 先頭の まん中から 道に そって 12.5 × i m うしろ（`Trail.at(d)` → `{ railId, s }` → その 線路の `frameAt`）、台車は その ±4 m。**分かれ道・合流の すぐ あとでも うしろの 車両は 来た 線路の 上**に のる（まえは 新しい 線路を はじまりの 向きに まっすぐ のばした 所）。わの 線路は 1 しゅう ごとに 新しい きれはし
- 弧（ジャンプ・もぐる・`holdAt`）は 線路の 座標では なく **道の 積算きょり** で もつ（`shiftArcs` は なくした）。高さ（`arcLift`・`diveLower`）は 車両ごとの きょりで、`sagAt`・水の 中（`carsUnder`）は 車両ごとの (railId, s) で 引く
- 通った 道を 作りなおす とき（はじまり・つづき・巻き戻し ＝ `rewindTo`）: 先頭の まん中から うしろへ 33 m（`TRAIL.back`、いちばん うしろの はし ＋ 2 m）を 線路の つながりで たどる。線路の はじまりで、分かれ道から 出た 線路なら 親の 線路の 分かれ道の 点へ（`RailNetwork.feeder`）、s = 0 に 合流して くる 線路が あれば その おわりへ（わ なら 自分、なければ `rails[]` の 順で はじめ。`RailNetwork.mergesInto`）、どちらも なければ そこで 止める（そこから うしろは 線路を まっすぐ のばす）。長さは `TRAIL.max` 2000 m まで（古い ほうから すてる）
- うしろむき（PR8a、PHASE9_CHAPTER5_6 第 3 部 A5.2〜A6）: `retreat(ds)` で 先頭の まん中を 通った 道に そって もどす。けずった ぶんは **ゴースト**（その先の 来た 道）に のこし、まえに もどって ゴーストの 上を すすむ あいだは「もどり」（`Train.retracing`。分かれ道は ゴーストの 側、矢印なし、しかけ・生き物・ヒントは うごかない ＝ `Train.stillGimmicks`）。**床**（いちばん うしろの はしが もどれる 所）は 作りなおした ときの いちばん うしろの はし・駅の 停止線を 前向きに こえた ときの いちばん うしろの はし（`cutAt`）・うしろむきの わき道の 車止め（`enterSiding`）・2000 m。とんだ 所・もぐった 所は 積算きょりの しるし（`mark`）。`nextStop(tailX)` が いちばん 近い 止まる 所（切れ目・しるし・床）を かえし、`Train.updateReverse` が ブレーキの 曲線（さいご 2 m は 0.5 m/s）で ぴったり 止める。うしろむきの わき道の 矢印は `nextBackJunction`
- `rails[].oneWay`（はじめの 案の 逆走専用）は なくした（読み込みで はじく）。うしろむきでしか 入れない 所は `junctions[].back`（STAGE_SCHEMA §22）。ローダーは `back` の 分かれ道を `StageData.backJunctions` に わける ので、前向きの しくみ・検査・`RailNetwork.feeder` は 見ない
- カメラ（`src/view/camera-rig.ts`）: `rear`（いちばん うしろの 車両の うしろの はしから 0.3 m 外・高さ 2.3 m・−s を 見る、画角 55°・near 0.4 m、なめらかに しない）と `chase-rev`（先頭の 前 16 m・上 9 m から 電車ごしに）。カメラの 板には 出さない（`main.ts` の `applyCamera` が うしろむきの あいだ おきかえる）。うしろの まどの わくは DOM（`.rear-window`）、ぐるりんも DOM（`.reverse-swirl`）。うしろむきの あいだ 光の すじは いちばん うしろの 車両に つけかえ、白い ランプ 2 つ（1 回で 描く）
- テスト用の しるし: `#app[data-car-gap]`（1・2 両めの まん中の きょり、まっすぐなら 12.5）・`#app[data-car-lift-err]`（うしろの 車両の 高さと、同じ 積算きょりに いた ときの 先頭の 車両の 高さの ちがい）。`tests/smoke/consist.spec.ts`。`scripts/probe-consist.mjs`（開発サーバーで: ぜんぶの ステージの 置き方を まえの 置き方と くらべる・分かれ道や 合流を とびながら 走って 高さを くらべる）

### 区画と もん（2026-10-06 PHASE9 PR11a）
- ステージを とおく（3 km）はなれた **区画**（`sections`）に わけ、線路の おわり **もん**（`end.type: "portal"`）で つなぐ（STAGE_SCHEMA §24、PHASE9_CHAPTER5_6 第 3 部 B6）。区画どうしは 線路で つながらない ので、`RailNetwork` も つながない（`RailNetwork.portalsInto(id)` で 着く 所 だけ わかる）
- もん（`Train`）: 先頭の 車両の まん中が おわりに 着くと `Train.teleport(railId, at)`。速さ・レバーは そのまま、通った 道は 行き先で 作りなおし（床 ＝ 着いた 所、止まる わけ `portal`）。`stopDistance()` は `null`（自動ブレーキ なし）、のこりが `速さ × 0.3 秒 ＋ 1 m` で できごと `portalAhead`（白く なりはじめる）、うつった ときに `portal { from, to }`・`railChanged`。ロケットは そこで おわる（`rocketEnded { cut: true }`）。`rewindTo` は もんが 着く 線路では 着く 所より 前に 置かない
- 先読み（`routeDistance`・`nextPlowWall`・水の 先読み・じしゃくの 窓・おいかけっこの 道・ロケットの 車止め）は いままでどおり `merge` しか たどらない ＝ もんで 道が おわる と みる。ミッションの 道しらべ（`wayTo`、つづきの とき）は もんを とおる。`rail-mesh.ts`・`WireSceneView` は もんの おわりにも 着く 線路の はじまりにも 車止めを 描かない
- 区画の 見た目（`main.ts`）: 毎フレーム `train.viewAnchor` の 線路から 区画を きめ、かわったら その 区画の 環境（ステージの `environment` に 区画の 欄を 上書き）を `SceneView.applyEnvironment(env, centre)` で かける（地面の 板を 区画の まん中へ）。まわりの 音・走る 音・しっぱいの 色も 区画の もの。`gimmicks[]` の `ambience` 区間は まわりの 音 だけ かえる。白い もんは しっぱいの フェードと 同じ `#fade`（`data-kind="gate"`、`#fbfdff`）、うつった しゅんかんに 区画の 見た目と カメラを すぐ 合わせる
- ほかの 区画は カメラの 遠い 面の 外なので 描かれない（線路・小物は 75 m の ます ごと。1 つの InstancedMesh が 区画を またがない こと: `IronPropsView` は 区画ごとに わけた。`flocks` は むれ ごと。ステージで 1 つに まとめる もの〈氷の 鳥の 列・水の 光の すじ など〉は 1 つの 区画に しか 置かない こと ＝ 6-2 で 2 つの 区画に 置く なら わける）。読み込みの 検査が 区画の 線路の はなれ（霧の far × 4 ＋ 40 ＋ 100 m 以上）を たしかめる
- あとから 作る（B13）: はじまりの 区画で ない 区画の 小物は `BuildQueue`（`src/core/build-queue.ts`）に つみ、`ThreeSceneView.update` が 1 フレーム 8 ms まで 作る（iPad の Safari に `requestIdleCallback` が ない ので 自前）。もんの 90 m 手前・見る 位置が 入った ときに まだ なら のこりを いっきに（`SceneView.buildSection`）。しるし `#app[data-sections-ready]`・`#app[data-load-ms]`（あそべる ように なるまでの ms。iPad 第 9 世代で 4 秒を こえたら、ほかの 層も あとから 作る ように する）
- のって いる なかま（`crew`）: サカサは 先頭の 車両の 運転席の うしろ（`addCrewSeat`）、うしろむきの あいだ いちばん うしろの 車両の うしろの はし（`amanojaku`、その 車両は まどが すける）。`#app[data-sakasa]`
- テスト: `tests/smoke/portal.spec.ts`（0-7。区画を とびこえる ところは 開発サーバーの `__debugTrain.rewindTo`）

### 判定と演出
- 障害物・生き物・記録・仕掛け＝Rapierセンサー。電車が入った瞬間にイベント発火
- 転がる岩・崩れる橋・脱線で転がる・乗客ずっこけ＝Rapier剛体（ラグドールは簡易でよい）
- 失敗→コミカル演出→直前チェックポイントの `t` に戻す

### 見た目の 環境（`EnvironmentState`、2026-09-30 PHASE9 PR2b）
- `src/view/three/environment-state.ts`。ステージ JSON の `environment` から 画面の「見た目の 環境」を 作る 入れもの。`ThreeSceneView.applyEnvironment(env)`（中で `EnvironmentState.apply(env)`）で **何度でも** かえられる（6-2 の 区画ごとの 見た目、5-1 の 昼 ⇄ 夜。PHASE9_CHAPTER5_6 第 3 部 B6.1）。一つ一つの 部品の 作り方は `environment.ts`
- 中身: 背景の 色・空の ドーム・霧・カメラの 遠い 面（霧の far ＋ 40 m、最大 600 m。空の ドームも その 内がわに ちぢめる）・光（半球光と 太陽）・地面（水の ある ステージは 池の 穴あき）・星・雲海・ふる 雪・**月**（`environment.moon`、空の ドームに のる 板 1 まい、顔なし）・**ほたるの つぶ**（`environment.fireflies`、`Points` 1 つ、カメラの まわりで シェーダが ふわふわ させる）（どちらも 2026-09-30 PR2c）。**とおくの めじるし**（`environment.landmark`、6-1 の 霧の 先の しろの かげ）は `EnvironmentState` では なく `ThreeSceneView` の `LandmarkBoard`（`src/view/three/landmark.ts`。板 1 まい、カメラに ついて いく）。`EnvironmentState` の `landmark` の 席は 空の まま
- 夜（`lighting: "night"`、PR2c）: 半球光 `#b8c6ff`／`#34406a`・0.85 ＋ 月の 平行光 `#dfe7ff`・0.62（`moon` の 向きから）＝ 昼の 70%（`params.ts` の `NIGHT`）。夜は 客車の まどが 光り、ライトの すじは 夜用の 先で うすれる 円すいに かわる（こく しない。`night.ts`・`abilities.ts` の `buildLightBeam`・`ThreeSceneView.lookChanged`）
- ゲームの 中で かえる のは 寸劇の `{ "environment": { … }, "seconds" }`（STAGE_SCHEMA §18）: `main.ts` が ステージの `environment` に 書いた 欄を 上書きして `SceneView.applyEnvironment` を よぶ（夜空色の フェード `#look-fade` の うしろで。まわりの 音も かえる）。0-1 は 入りで 昼 → 夜、出で 夜 → 昼
- きまり:
  - 空・霧・2 つの 光は ずっと 同じ もの（ほかの しかけ、たとえば 村の 夕方・雪の トンネル・かがみ が つかんで いる ので）。`apply` は 色や 強さを 入れなおす だけ
  - 星・雲海・地面・ふる 雪 は「何から 作ったか」を おぼえて おき、同じ なら そのまま、ちがえば ふるい 方を 外して `dispose`（形・材質・テクスチャ）してから 作りなおす。いらなく なったら 外して `dispose`
  - はじめの 1 回は いままでと 同じ 順で 作る（描く 順が かわらない ＝ 見た目が かわらない）
  - 雪（`surface: "snow"`）: 地面に すこし 自分の 光（白く 見える）、半球光の 下からの 色を 雪の 白に（もとの `IceGimmicks.brightenSnow`）。線路の 雪の 床は `snowBeds(線路の 一覧, env)` で 線路の 一覧ごと（いまは ステージの ぜんぶ、6-2 では 区画ごと）
  - 水の 中に いる ときに `apply` したら、水の 中の 見た目は つぎの コマで 新しい 環境から とりなおす。寸劇の 決まった カメラの ときは 遠い 面を また のばす
  - 水（`water`）は ステージ ぜんぶ で 1 つ（区画で かえない）。地面の 穴の 形に 入る ので、地面の「何から 作ったか」に ふくめる
  - 雪の トンネル（`SnowGimmicks`）と 村の 夕方（`VillageGimmicks`）は、霧の 色・2 つの 光の 強さと 色・空を `EnvironmentState` から その とき 読む（`baseFogColor`・`lights`・`lightLevels`・`sky`・`fogObject`。PR2c から。読み込みの ときの 値を おぼえない）。夕方が かわる とちゅうで `apply` したら、あたらしい 見た目が 勝つ（`VillageGimmicks.onLook`）
- テスト: `tests/smoke/environment-state.spec.ts`（開発サーバーで `__debugView` を つかう。0-0 で ちがう 環境〈夜・月・ほたるの つぶ も〉と もとの 環境を 3 回 行き来 して、シーンの 物の 数・霧・遠い 面が もとに もどり、`renderer.info.memory` が ふえつづけない こと。本番ビルドに `__debugView` が ない ことも みる）。ゲームの 中の 昼 ⇄ 夜 は `tests/smoke/night.spec.ts`（0-1）

### ねらいの 速さの おさえ（`Train.speedCaps`、2026-09-30 PHASE9 PR5）
- レバーの めざす 速さを かえる 所を 1 つに した（PHASE9_CHAPTER5_6 第 2 部 M6）。`Train` が `speedCaps`（id ごとに `{ scale?, max?, holdAt? }`）を もち、`leverTarget()` が ぜんぶ かけあわせる: `scale` は かけ算、`max`（m/s）と `holdAt`（`{ railId, s }` の 手前で 止まる ブレーキの 曲線）は いちばん きびしい もの。ほかの しくみは `setSpeedCap(id, cap | null)` で 足す・けす だけ。レバーの 目もりは うごかさない
- いまの id: `light`（ライトと じしゃくの 段: 0.7。まえの `main.ts` の `speedScale` を おきかえた）・`magnet`（ひっぱって いる あいだ 0.5。この あいだ `light` は はずす ＝ あわせて 0.5）。うしろむきの 5 m/s は cap では なく `Train.updateReverse` が きめる（cap の `scale` と `max` は きく。PR8a）。`depart`（寸劇で 電車が 自分で 出て `holdAt` で 止まる。6-1）・`lead-learn`（6-1 の おいかけっこで うしろむきを 覚える あいだ `max: 0`）・`auto-drive`（v1.12 えんしゅつの `drive`）。がくたい（5-2）は `Train.setLeader`、かがみの もん（5-3）は `Train.setBlocks` で、cap では ない（はじめの 案の `parade`・`mirror-gate` は 作らなかった）
- `train.speedScale` は 読む だけ（`scale` の 積。うすい こおり・花の はしが 読む）
- ロケット・すべりざか は いまと 同じく おさえを 見ない。レバーの「光る 目もり」は いまと 同じく ふつうの 速さで きめる
- ついでに `Train.setBlocks(() => TrainBlock[])`（`kind: 'magnet' | 'mirror'`）: 先頭が まだ ひらいて いない 面（じしゃくの すきま・とびら。5-3 の かがみの もん）に つくと「ぽよん」（空中でも。弧は そこで おわる）。できごと `magnetBounce`
- じしゃくライトの しくみの 置き場: `src/gimmick/light-switch.ts`（`LightSwitch`、ライトの ボタンの 3 段）・`magnet.ts`（`MagnetSystem`）・`iron-props.ts`（`IronProps`）・`magnet-layout.ts`（読み込みで まとと 小物の 場所を きめる）、見た目は `src/view/three/magnet.ts`・`iron-props.ts`・`magnet-placeholders.ts`

---

## 3. データ形式

### ステージJSON（1ステージ1ファイル、`src/stages/<chapter>-<n>.json`）
コード実装前に、Phase 0 でスキーマを確定させる。含める要素:

| フィールド | 内容 |
|---|---|
| `id`, `title`, `chapter` | 識別 |
| `unlocks` | このステージで解放する能力（任意） |
| `rails[]` | 線路。`id`, 制御点列（x,y,z）, `up`ベクトル（重力逆転用）, `gap` 区間（線路なし）。`oneWay`（はじめの 案の 逆走専用）は v1.11 で なくした（うしろむきの わき道は `junctions[].back`、STAGE_SCHEMA §22） |
| `junctions[]` | 分岐。`railId`, `t`, 選択肢（左右→次の`railId`）, `signReversed`（逆標識） |
| `stations[]` | 駅。`railId`, `t`, 停車判定幅 |
| `props[]` | 配置物。`model`, 位置・回転・スケール, 物理タイプ（static/dynamic/sensor/none） |
| `actors[]` | 生き物・仕掛け。`type`, 位置, `reactsTo`（whistle/light/none）, `reversed`（あまのじゃくの仕掛けか）, パラメータ |
| `records[]` | 調査記録。位置, `requires`（必要能力） |
| `missions[]` | 型（deliver/pickup/repair/timed）, 開始駅・目標駅, 制限時間, チェックポイント, 達成条件 |
| `gimmicks[]` | ステージ固有ギミックの有効化とパラメータ |
| `environment` | 空・霧・ライティングプリセット、BGM |

- ステージ解放条件と課金フラグもデータ側に持つ（後付け対応）

### 地図（`src/world/world.json`・`src/world/pages.ts`・`src/ui/map.ts`）
- 島・線路・章の おわりの 置き方は world.json（`_doc`）。v1.11（PR9、2026-10-02）で 足した もの:
  - `islands[].size`: 島の 幅 ＝ 25% × size（しろの 島 6-1 は 1.2）。重なりの テスト（`map-pages.spec.ts`）は 画面の 箱で 見る ので そのまま きく
  - `chapters[].count`: その 章の ステージの 予定の 数。world.json に その 数だけ 島が そろうまで 章は おわらない（タイトルの ★、章の おわり。6章は 6-1 だけの あいだ ☆）。`chapterDone(world, chapter, cleared, stageIds?)` は さらに、`finale` の ある 章では world.json の 島の 数が その 章の ステージ ファイルの 数（`listStageIds()`）と 同じに なるまで おわらない（第 1 部 §3.4 の まもり）
  - 5章の おわり（ほたる）の 大きな 光の 行き先 `finale.target` が 島（6-1）で、その 島が この おわりで ひらく とき: 島は ねむって いて（`is-asleep`）、光が つくと 目を さまし まどに 灯（`.map-window` 4 こ、0.8 秒、`playWindows`「ちりりん」、`#map[data-windows]`）。`5-3>6-1` は `afterChapter: 5` なので 札の あとに のびる
  - おわりを もう 見た 子（`finale:5` が ある）には、新しい 線路 `5-3>6-1` が のび おわった ときに 同じく しろが 目を さます（`MapOptions.windows`）
- 6-1 の とけいだいの はり（`src/view/three/castle.ts`、`CASTLE` in params.ts）は うしろへ 1 分で 1 まわり

### 進行セーブ
- はじめの 案: `unlockedStages`, `clearedMissions`, `abilities`, `records`, `settings`（実装は 下の とおり。ステージの ひらき方は ステージの `unlock.requires` と `cleared` から きめる）
- スキーマにバージョン番号を持たせ、マイグレーション可能にする
- 実装（2026-09-26）: `src/core/progress.ts`。localStorage の `train-game.progress.v1`（`cleared`・`abilities`・`records`・`mapLinks`）。設定は別の `train-game.settings.v1`（片方を消しても もう片方は残る）
- **つづき**（`resume?: { stage, mission }`、2026-09-26）: 省略できる欄なので スキーマは 1 のまま（前の セーブも そのまま 読める）。`mission` は 0 から数えた「つぎに はじめる ミッション」（1 以上）。ミッションの「できた！」を閉じたときに 書き（さいごの ミッションでは 書かない）、そのステージを クリアしたら 消す。ステージに 合わない 値（ミッションの 数を こえる など）は 無視する。あいことばには 入れない
  - はじめ方は `MissionRunner.prepareResume(i)`: オープニングと ミッション 0〜i−1 の `onComplete` の 寸劇を 早送り（`fastForwardCutscene`: 線路を 切る・能力・役者の 出し入れを さいごの 形で 一瞬に。せりふ・待ち・札・字幕・カメラ・効果は とばす）、電車を ミッション i−1 の さいごの 駅に 止めて 置き、乗客と 荷物は 各 ステップの 乗り降りを 足して 出す。役者（ねこ・恐竜・バッタ・石 など）は その駅へ 巻きもどしたときと 同じ（うしろの ものは もう かかわらない）。花の橋は スタートから その駅までの 道（分かれ道と 合流を たどって 探す）に あるものを ひらいて おく（STAGE_SCHEMA の とおり「ステージの 間 ずっと ひらいたまま」だから）
  - 「▶▶」（クリアしたことのある ステージの 寸劇だけ）は 同じ 早送りで のこりを 済ませる。札（とその 能力の 札）の 間は かくれ、札は 最後まで 待つ
- 保存のたびに（1 回の起動で 1 回だけ）`navigator.storage.persist()` を頼む。Safari のタブは しばらく開かないと消されることがあるので、「おうちの かたへ」にホーム画面への追加を書く
- **あいことば**（`core/progress.ts`）: 進み具合ぜんぶを 20 文字（Crockford base32、`XXXX-XXXX-XXXX-XXXX-XXXX`）にして書き写し、あとで入れれば戻る。通信なし。1 文字めが版。版ごとに項目の並びを固定し、公開した版の並びは変えない。章やきろくが増えたら新しい版を足す（`scripts/check-stages.mjs` が bit の計算と、ステージファイルの クリア・能力・記録の 場所を ビルドで 確かめ、`pause-settings.spec.ts` が ステージファイルと world.json の全部で往復を確かめるので、足し忘れると落ちる）。出す あいことばは いつも 最新の版、入れる ほうは 出した ことの ある 版を ぜんぶ 読む
  - **v3**（いま 出す 版、2026-09-30。PHASE9_CHAPTER5_6 第 1 部 §7.2・§0.6）: 100 bit ＝ 20 文字（例 `3ZZZ-ZZZZ-ZZZZ-ZZZZ-N3VD`）= 版 5 + 項目 76（17 ステージ 1-1〜6-2・8 能力 ＝ v2 の 6 つ ＋ magnetLight/reverse・51 記録、1 項目 1 bit。並びは v2 の 項目の あとに 5・6章を ステージ順に 足した もの）+ 検査 19（FNV-1a。まちがいが とおるのは 52 万回に 1 回）。線路は のせない（v2 と 同じく クリアから 作る）。**`pages: 3`**: 版ごとに「その 版を 出した ときに あった 地図の ページ」を もち、入れた ときに 作る 線路と 章の おわりは その ページまで だけ「見た」に する（`seenMapLinks(world, cleared, v.pages)`。両はしが その ページ 以下の 線路、その ページ 以下の 章の おわり）。5・6章の ステージが まだ 5-1 も できて いない うちに（PR3）設計の ID で 出し、その あいだ まだ ない ステージの bit は 0 だった。5-1〜6-2 の 記録 15 こ（`moon-bunnies`・`pond-moonstone`・`lantern-bell`／`gold-screw`・`glow-marble`・`tin-key`／`kagami-kanban`・`hand-mirror`・`sakasa-doodle`／`up-raindrop`・`upside-top`・`backward-book`／`swirl-acorn`・`left-shell`・`sakasa-tag`）は 6-2（2026-10-06 PR11b）で ぜんぶ ステージ ファイルに そろい、PR12 で `check-stages.mjs` が 両方向に つきあわせる ように した（v3 の 並び ＝ あそべる ステージの クリア・能力・記録 を ステージ順に。直すのは いつも ステージの ほう）。6-2 を クリアした あいことばを 入れると、エンディング ムービーも「見た」（`movie:ending`）に する（`src/ui/parents.ts`。▶▶ で とばせ、6-2 を また クリアしても 見せ なおさない。PR12）。検査が 16 bit より 少なく なる 版は 文字を ふやし、あまりを 0 の うめ bit（`padBits`。項目と 検査の あいだ。0 で なければ 打ちまちがいと して はじく）で うめる。v3 は うめ なし
  - **v2**（2026-09-28〜09-30 に 出して いた 版。これからも 読める）: `pages: 2`（地図が 2 ページ だった ころ の 版。入れると 3 ページめへ 行く 線路 `4-3>5-1` は「まだ 見て いない」に なり、つぎに 地図を ひらいた とき 1 回 のびる）。80 bit ＝ 16 文字（例 `2ZZQ-ZZZZ-ZZZG-A0CD`）= 版 5 + 項目 54（12 ステージ 1-1〜4-3・6 能力 whistle/jump/light/rocket/dive/plow・36 記録、1 項目 1 bit。並びは v1 の 項目の あとに 3・4章を ステージ順に 足した もの）+ 検査 21（FNV-1a）。**線路は のせない**: 入れた ときに クリアから 作る（`world/pages.ts` の `seenMapLinks`）。しかれる 線路は ぜんぶ「もう 見た」、おわった 章の おわり（線路の ない 章は `finale:<id>`）も「見た」に する ので、地図を ひらいても のびる 線路や 章の おわりは 出ない。まだ おわって いない 章の しめくくりの 線路は 入れない（その 章が ほんとうに おわった ときに おわりが 出る）。4-3 の 記録 3 つ（`snow-hare`・`ice-flower`・`sleigh-bell`）は PHASE8_CHAPTER3_4 第 8 部の 設計の ID で 先に 入れて ある（4-3 が ちがう ID で 入ると テストが 落ちる）。`magnetLight`（5章）・`reverse`（6章）は v3 で 足した
  - **v1**（2026-09 まで 出して いた 版。これからも 読める）: 60 bit ＝ 12 文字 = 版 5 + 項目 34（6 ステージ・4 能力・18 記録・6 線路、1 項目 1 bit）+ 検査 21。線路は あいことばに 入って いる もの だけ もどる（くもの もんへの 線路は つぎに 地図を ひらいた ときに のびる）
  - 打ちまちがい: 使えない 文字・知らない 版・文字の 数（その 版の 文字数 12／16／20 を 出す）・うめ bit・検査ちがいで はじく。小文字・空白・ダッシュ・O（→ 0）・I／L（→ 1）は そのまま 読む

---

## 4. アセットパイプライン（Blender）

- Blender は **ヘッドレス実行のみ**（`blender -b --python <script>`）。手作業造形はしない
- 各モデルは `assets/blender/<name>.py` の生成スクリプトから作る。再現可能にする
- 出力: `public/models/<name>.glb` ＋ 確認用プレビュー `assets/previews/<name>.png`（CPU Cyclesの低サンプル）
- 作り方・予算・絵柄は `docs/ASSET_PIPELINE.md`。一覧と予算は `assets/models.json`（`npm run build` が確認する）
- 絵柄の正本は `assets/concepts/` の承認済みデザイン。実在車両の連想を避ける
- 単位: 1 unit = 1 m。線路ゲージ 1.5 m・車両 12×3×3.6 m を全モデルの基準にする（§9）

---

## 5. 開発パイプライン

```
Claude Code（設計・実装）
  仕様・設計 → だいさんの GO → 実装（コード、Blender スクリプト → .glb + PNG）
  Playwright でスモーク（起動・走行・スクショ）→ PR
    ↓ push
GitHub Actions
  Vite ビルド → Playwrightスモーク（スクショをアーティファクト化）→ GitHub Pages デプロイ
    ↓
だいさん
  iPad で実プレイ → 感想を Claude Code へ
```

- 進め方の規約は `CLAUDE.md`。2026-09-24 までは Codex に実装を発注していた（`archive/codex/`）

### ビルドの検査（`npm run build`。2026-09-30、PR2a）
`tsc --noEmit` → `check-models.mjs` → `check-stages.mjs` → `vite build` の 順。どれかが 落ちれば ビルドが 落ちる ので、2 時間の CI を まつ 前に（数秒で）わかる。`npm run check:stages` で 単独でも 走る。
- `scripts/check-models.mjs`: 3D モデルの 一覧・予算・原点・裏返り・ステージが 使う モデル（`docs/ASSET_PIPELINE.md`）
- **`scripts/check-stages.mjs`**: TypeScript は Node が 直接 読めない ので、Vite の `ssrLoadModule`（`createServer({ server: { middlewareMode: true } })`。ブラウザも 通信も 使わない）で `src/stage/loader.ts` と `src/core/progress.ts` を 読む。読み込みの ときの `throw` では `vite build` は 落ちない ので、読んだ 値を ここで たしかめる。約 1 秒。
  1. `src/stages/*.json` の ぜんぶが `prepareStage(raw)` を とおる（`loader.ts` に 切り出した、ブラウザなしで 走る 部分: `validateStageFile`・線路網・範囲・水／氷／雪の 検査・props／actors／stations／records の 位置きめ。`loadStage` は JSON を 読んで これを よぶ だけ）。ファイル名 ＝ `id`
  2. `tests/stages-bad/<名前>.json`（わざと まちがえた 形。1 ファイル 1 つ）が **はじかれる** こと、しかも `_expect` の 文が エラーの 中に ある こと（べつの 理由で はじかれたら 落ちる）。形は 「ステージ 1 つぶんの JSON ＋ `_expect`」か、本物の ステージの 写しに 直しを 入れる `{ "_expect", "_base": "1-1", "_edit": [{ "path": "start.at", "value": 99999 }] }`（`"delete": true` で その キーを 消す）。ステージに 新しい 検査を 足す PR は、そのまちがいの 例も ここに 足す
  3. あいことばの 版（`PASSCODE_VERSIONS`）: `5 ＋ 項目の 数 ＋ うめ（padBits）＋ 検査 ＝ 5 × 文字数`・検査 ≥ 16 bit・同じ ID を 2 回 書かない・新しい 版は 前の 版の クリア／能力／記録の 並びで はじまる・線路を のせない 版（v2 から）は `pages` を もち、前の 版より へらない・**あそべる（`hidden` でない）ステージの クリア・能力（`unlocks`・寸劇の `unlock`・記録の `requires`）・記録の ぜんぶが 最新の 版に 場所を もつ**（足し忘れると ビルドが 落ちる。`pause-settings.spec.ts` の 往復は 保存と 読み込みの 動きを 見る）。**ぎゃくの 向き**（2026-10-06 PR12）: どの 版の ID も あそべる ステージ ファイルに ある（ステージで ID を かえると、もう 書きうつした あいことばから だまって きえる ため）、最新の 版の クリア・能力・記録が あそべる ステージの もの そのもの（ステージ順。v3 の ように ステージより 先に 版を 出す ときは、まだ ない ステージの ID を `check-stages.mjs` の `AHEAD` に 書いて おき、ステージが できたら けす。いまは 空）、記録の `requires` は どれも どこかの あそべる ステージが くれる 能力（能力が ぜんぶ そろえば「？」は 0 こに できる）
  4. 絵（PR12）: `model` の ある あそべる 記録は `public/zukan/<id>.png`、`diorama` の ある 島は `public/map/<id>.png` が ある こと
  5. 地図（`src/world/world.json`、`validateWorld`）: エンディングの 道・島の 大きさ

### ホーム画面アプリ（2026-09-24）
- iPad の Safari で「ホーム画面に追加」すると、アイコン「ワンダーごう」から全画面・横向きで起動する（`public/manifest.webmanifest`、`index.html` の apple 用 meta）
- アイコンの元絵は `assets/icons/app-icon.svg`。直したら `node scripts/make-icons.mjs` で `public/icons/` の PNG を作り直す
- オフライン: 本番ビルドだけサービスワーカー（`src/pwa/sw-template.js` → ビルドで `dist/sw.js`）を登録する。初回に遊ぶのに要るもの一式（モデル確認ページは除く。地図・図鑑・タイトルの絵は入れる。2026-10-06 で 152 ファイル・約 11 MB）を保存する
  - ネットにつながっているときは、ページ・モデルを毎回ネットから読む（マージ後の反映はこれまでどおり）
  - つながらないときは、保存したもので動く。名前にハッシュが付いたビルドファイル（`assets/`）は保存したものを先に使う
- テスト: `tests/smoke/pwa.spec.ts`。ホーム画面用の設定と、ゲーム一式が保存されること、サーバーが止まっても保存分が返ることを確かめる。ほかのテストではサービスワーカーを止めている

### かくにん モード（2026-10-01、だいさん GO。確認用。本番に出す）
だいさんが 実機で、どの ステージも どの ミッションからも ためす ための もの。**デバッグ機能では ない**（デバッグは 本番で 無効 のまま）。出荷は する が、番号の うしろに かくれている。
- **入口**: タイトルの 歯車 → 「おうちの かたへ」（2 秒 長押し）の 中の 「かくにん モード」。**4 けたの 番号**を 大きな 数字ボタン（`src/ui/kakunin.ts`。キーボードは 使わない）で 入れる。まちがえると ゆれて 消える（ロックアウトは なし）。
- **番号の しまい方**: コードには **SHA-256 だけ**（`src/core/kakunin.ts` の `KAKUNIN_HASH`。`train-game-kakunin:<4 けた>` の ハッシュ。Web Crypto）。番号そのものは コード・テスト・ドキュメント・コミットメッセージの どこにも 書かない。合ったら 端末の localStorage に 専用の キー `train-game.kakunin.v1`（進み具合の 保存とは べつ）に 印を 残す（値は ハッシュそのもの。ほかの 値は 印と みなさない）。「かくにん モードを やめる」で 消す。
- **ステージ一覧**: 印が ある 端末では 番号なしで 開く。`world.json` の 章ごとに 全ステージ（まだ ファイルが ない ものは 灰色）と、「てすとの コース」（`hidden` の ステージ ぜんぶ。いまは 0-0 〜 0-7）。ステージを 押すと ミッション名（ステージ JSON から。`peekStage` の `missionTitles`）と 「はじめから」が 出る。ミッションを 押すと そこから あそぶ。
- **砂場の 走り**: `?stage=<id>&go=1&kakunin=1&mission=<0 から 数えた ミッション>`（`resume` の しくみを 使う。`mission` が ない ときは はじめから）。能力は 「保存の 能力 ＋ そのステージまでの ステージが 与える 能力（`inheritedAbilities`）＋ オープニングの 能力 ＋ 選んだ ミッションより 前に 教わる 能力（`abilitiesTaughtBefore`）」。**進み具合の 保存には 何も 書かない**: `src/core/progress.ts` の `startSandbox()` が、保存の 写しを メモリに もち、読み書きを すべて そちらで 行う（クリア・記録・能力・ちずの 線路・つづきから）。ページを 出ると 消える。設定（音・かたてなど）は 今まで どおり 保存される。クリアカードの あとは ちずでは なく 一覧（その ステージが 開いた まま）に もどる。ポーズの 「ちずに もどる」の かわりも 一覧。遊んでいる 間は 隅に 小さな 「かくにん」の しるし（下の まんなか。レバー・丸ボタン・角の ボタン・荷物表示と かさならない。左きき でも 同じ）。押すと 一覧が 開く（ミッションの ない テストコースの 出口にも なる）。
- **`?stage=` の かぎ**（本番ビルドだけ。`import.meta.env.DEV` では かけない）: 印の ない 端末が `?stage=X` を 開くと、**タイトル（`location.pathname`）に もどされる**。もどされるのは、X が テストステージ（`0-*`）／ ステージが ない ／ 保存で まだ 開いて ない（`unlock.requires` が すべて クリア ずみ でない。「つづきから」の ステージは 通す）。`kakunin=` と `mission=` も 印が なければ 同じ。ちずが 開く `?stage=…&go=1` は 開いた ステージなので そのまま 通る。`navigator.webdriver` が true（ブラウザ自動操作。子どもの iPad では ならない）の ときは かぎを かけない: スモークテストが かぎの かかった ステージを あちこちで 直接 開く ため。印を 立てた 端末では これまでどおり `?stage=0-0` なども 開く（確認用 URL は その 端末で 使う）。
- **ムービー**（2026-10-05、v1.12 えんしゅつ）: 一覧の いちばん 下に 「ムービー」（`src/movies/` の ムービー。いまは 「エンディング」）。押すと `?movie=<id>&kakunin=1` で 見る（「▶ みる」で はじまる。▶▶ で とばせる。札の あとは 一覧に もどる）。`?movie=<id>` も `?stage=` と 同じ かぎ（印の ない 本番の 端末では タイトルへ。ただし ムービーの `unlock.requires` を ぜんぶ クリアした 保存なら 通す: エンディングは 6-2 の あと 子どもも 見る ため）。しくみは `docs/STAGE_SCHEMA.md` §25。6-2 を はじめて クリアした とき ゲームが `?movie=ending&then=map` へ 送る（札の あと 同じ ページで 地図。2026-10-06 PR11b）。見た しるしは 保存の `mapLinks` の `movie:<id>`（見た あとは ▶▶）。タイトルの「もういちど みる」は `?movie=<id>`
- テスト: `tests/smoke/kakunin.spec.ts`（本番ビルド。まちがった 番号・一覧・ミッションから 始める・保存が 1 バイトも 変わらない・しるし・クリア後に 一覧・かぎ。かぎの 試験は `navigator.webdriver` を false に 上書きする。正しい 番号は 打たない: 印は 初期化スクリプトで 立てる）。チケット `docs/tickets/0024-kakunin-mode.md`

---

## 6. 性能・品質予算

確定値（Phase 0）:
- 60fps 目標（目標端末 iPad Pro 2018 / A12X）。最低端末で30fps以上
- 画面内ポリゴン: 10万以下
- テクスチャ: 1024px以下、原則マテリアル色のみ
- 初回ロード: 5MB以下（ステージ単位で遅延ロード）
- ドローコール: 200以下（インスタンシング活用）
- 描画解像度: devicePixelRatio は 2 で頭打ち
- 動作保証最低端末: iPad 第9世代 / iPhone SE 第2世代（A13）、Android は Snapdragon 680 級・RAM 4 GB
- 計測: スモークテストがフレーム時間とドローコールをログに出す（1-1〜2-1 の通しで最大値。`docs/PHASE4_DESIGN.md` §6）。200 回・10 万を超えたらテストを失敗にする
- ムービー（v1.12）: `npm run budget -- --movie ending` で エンディングを さいごまで 流し、すべての コマを 測る（2026-10-05: いちばん 重い コマ 103 回・79.2k。2026-10-06 しろを `sakasa-castle` に して 103 回・77.2k）
- 見張り: `npm run budget`（`scripts/probe-budget.mjs`）で、全ステージ × 4 カメラ × 線路 50 m ごと（駅の前後 60 m は 20 m ごと）に 1 コマずつ描いて測る。一番重いコマとモデルごとの内訳を出し、予算を超えたら失敗にする
  - 開発サーバーで動かす（開発版だけにある `__debugView` / `__debugTrain` を使う）。約 2 分かかるので CI には入れず、ステージの PR の前に回す
  - 2026-09-25 の値: 一番重いのは 1-2 うしろから（9.2 万三角形）と 1-3 うしろから（82 回）。表は `docs/PHASE4_DESIGN.md` §6
  - タイトルの カメラ（止まった電車の まわりを ゆっくり ゆれる、PHASE7_FINISH §4 の 6）も「title」として 測る。スタート地点で 電車の 両側 ±28° を 14° ごと
  - 区画の ある ステージ（PR11a）: もんの おわりの 5 m 手前と 着いた 所の 5 m 先も 測り、区画ごとの いちばん 重い コマを 表に 出す。めやすは 区画ごとに 120 回・8 万 三角形 以下（PHASE9_CHAPTER5_6 第 3 部 B13）
- 重い端末では描画の細かさを自動で 2 → 1.5 → 1.25 → 1 と下げる（45 fps を 3 秒下回ったら 1 段）

---

## 7. ストア対応で最初から入れる設計

- アセットは全部同梱。外部通信なし。オフライン完結
- セーフエリア対応、横持ち固定、Android戻るボタンの扱い
- 音は初回タップで解錠
- ステージ解放・課金フラグはデータ駆動
- ストア用スクショ・アイコンはBlender発注に含める
- iOS提出にはMac＋Xcodeが必要（手配方法は未定）

---

## 8. リポジトリ構成（案）

```
/
  CLAUDE.md
  docs/
    GAME_SPEC.md
    TECH_SPEC.md
    POC_PLAN.md
    tickets/          # 作業チケット
  src/
    rail/ train/ actions/ physics/ stage/ mission/ gimmick/ ui/ audio/ debug/
    core/ cutscene/ movie/ view/ viewer/ world/ actors/ pwa/   # いま ある もの（save は core/progress.ts）
    movies/           # ムービー（v1.12）
    stages/           # ステージJSON
    main.ts
  assets/
    blender/          # 生成スクリプト
    previews/         # プレビューPNG
  public/
    models/           # .glb
    audio/
  tests/
    smoke/            # Playwright
    stages-bad/       # わざと まちがえた ステージ（check-stages.mjs が はじかれる ことを 見る）
  .github/workflows/
```

---

## 9. Phase 0 で確定した値

`docs/PHASE0_DESIGN.md` で提案し、2026-09-13 にだいさんの GO で確定。

| 項目 | 値 |
|---|---|
| 座標系 | 1 unit = 1 m、Y 上、右手系。モデル前方 +Z。進行方向 +Z のとき右は −X |
| 線路ゲージ | 1.5 m（レール中心間）。レール断面 0.10 × 0.15 m、枕木 2.4 × 0.25 × 0.15 m 間隔 0.8 m、バラスト上面幅 3.2 m・底面幅 4.4 m・高さ 0.3 m |
| 線路の高さ基準 | ステージJSONの線路の点はレール上面の高さ。地面は −0.6 m |
| 車両 | 長さ 12.0 × 幅 3.0 × 高さ 3.6 m。**3 両編成**（先頭車＋客車 2、間隔 12.5 m。判定は先頭車のみ）。台車は中心から ±4.0 m。原点は底面中心（レール上面の高さ）、前方 +Z |
| 運転席カメラ | 原点から (0, 2.4, 4.6)、垂直画角 60° |
| 速度段 | きゅうブレーキ（8 m/s²）/ とまる（3 m/s²）/ ゆっくり 5 / ふつう 10 / はやい 15 / びゅーん 22 m/s。加速 2 m/s² |
| 汽笛クールダウン | 2.0 秒 |
| 分岐UI | 60 m 手前で矢印表示、5 m 手前で確定 |
| 線路の終端 | 車止めの手前（車体中心が終端 − 6.5 m）で自動停止 |
| 駅の停止位置 | 駅の `at` は **先頭が止まる位置**。ぴったり ±1 m、とまれた ±6 m、ゾーン 30 m、ゾーン進入 13 m/s 超で失敗。停止ゲージは 150 m 手前から |
| カメラ | うんてんせき／うしろから／よこから／うえから。計算は `src/view/camera-rig.ts`（両ビュー共通） |
| ステージJSON | v1。`docs/STAGE_SCHEMA.md`。線路上の位置は始点からの距離（m）で書く |
| グローバル設定の置き場 | `src/train/params.ts`（ステージ固有の値はステージJSONへ） |
