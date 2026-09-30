# ステージJSON スキーマ v1

最終更新: 2026-09-30（v1.11 の 5-1 夜の 分）
状態: v1 確定（2026-09-13）。型の実体は `src/stage/types.ts`、検証は `src/stage/validate.ts`

1ステージ = 1ファイル。`src/stages/<chapter>-<n>.json`。
単位はすべて m、Y が上、右手系。線路上の位置は **始点からの距離 `at`（m）** で書く。

---

## 1. 型定義（TypeScript 表記）

```ts
type Vec3 = [number, number, number];   // [x, y, z] m
type AbilityId = "whistle" | "light" | "jump" | "rocket" | "dive" | "plow" | "magnetLight" | "reverse";

interface StageFile {
  schemaVersion: 1;
  id: string;                 // "1-1"。ファイル名と一致
  title: string;              // ひらがな主体
  chapter: number;            // 0 = テスト用
  hidden?: boolean;           // true なら地図に出さない（テスト用ステージ）
  unlock: {
    requires: string[];       // クリア済みであるべきステージID。空 = 最初から遊べる
    purchase: string | null;  // 課金SKU。null = 無料。後付け用
  };
  unlocks: AbilityId[];       // このステージで解放する能力
  environment: Environment;
  start: { railId: string; at: number; direction: 1 | -1 };   // at は先頭の位置。3 両分（約 31 m）が線路に乗るよう 40 以上にする
  rails: Rail[];
  junctions: Junction[];
  stations: Station[];
  props: Prop[];
  actors: Actor[];
  records: RecordItem[];
  missions: Mission[];
  gimmicks: Gimmick[];
}

interface Environment {
  sky: { top: string; bottom: string };            // 色（#rrggbb）。上→下のグラデーション
  fog: { color: string; near: number; far: number } | null;
  lighting: "day" | "evening" | "night" | "cave";  // ライトのプリセット名
  ground: { y: number; size: number; color: string } | null;   // 平らな地面。null なら地面なし
  bgm: string | null;                              // 曲の名前（src/audio/songs.ts の town / valley / sky / title）。null = 音楽なし
}

interface Rail {
  id: string;
  points: Vec3[];             // 2点以上。レール上面の中心線。Catmull-Rom（centripetal）で補間
  up?: Vec3;                  // 既定 [0,1,0]。線路全体の上方向（重力逆転ステージ用。区間指定は gimmicks 側）
  gaps?: { from: number; to: number }[];   // 線路なし区間（m）。ジャンプで越える
  // oneWay は 使わない（v1.11 PR8a で 読み込みが はじく。うしろむきでしか 入れない わき道は junctions[].back ＝ §22）
  end:
    | { type: "buffer" }                              // 車止め。自動停止
    | { type: "merge"; railId: string; at: number }   // 他の線路に合流
    | { type: "open" };                               // 何もない（落下）
}

interface Junction {
  id: string;
  railId: string; at: number;   // 分岐点。分岐先の線路の points[0] はこの点と一致させる（0.5 m 以内）
  left?: string;                // 左を選んだときに乗る railId。今の railId を書くと「分岐しない」
  right?: string;
  default: "left" | "right";    // 無操作時
  signReversed?: boolean;       // あまのじゃくの逆標識（表示が逆）
}

interface Station {
  id: string; name: string;
  railId: string; at: number;   // 停止線の位置 = 電車の「先頭」が止まる位置（2026-09-14 に車体中心から変更）。ホームはこの手前に広がる
  tolerance?: number;           // 停車判定の幅。既定 4
  platformSide: "left" | "right";
}

// 配置: 世界座標か、線路上のどちらか
type Placement =
  | { position: Vec3; rotationY?: number }                       // rotationY は度。0 = +Z 向き
  | { onRail: { railId: string; at: number; lateral?: number; heightFromRail?: number };
      rotationY?: number };                                       // rotationY は線路の進行方向に対する角度（度）
// onRail の lateral: 進行方向に対して右が +。既定 0
// onRail の heightFromRail: 省略すると地面（environment.ground.y）に置く。指定するとレール上面からの高さ

type Prop = Placement & {
  model: string;                // public/models/<model>.glb
  scale?: number;               // 既定 1
  physics?: "none" | "static" | "dynamic" | "sensor";   // 既定 "none"
};

type Actor = Placement & {
  id: string;
  type: string;                 // "trigger" | "cat" | "dino-small" ... 実装側の登録名
  size?: Vec3;                  // センサー箱の大きさ。既定 [4,4,4]。箱の底が配置点
  reactsTo: "whistle" | "light" | "none";
  reversed?: boolean;           // あまのじゃくの仕掛けか（ライトで痕跡が光る）
  params?: Record<string, unknown>;
};

type RecordItem = Placement & {
  id: string; name: string;
  requires: AbilityId | null;   // 取得に必要な能力。null = 最初から取れる
};

interface Mission {
  id: string;
  type: "deliver" | "pickup" | "repair" | "timed";
  title: string;
  from: string; to: string;     // stationId
  timeLimit?: number;           // 秒
  checkpoints: { railId: string; at: number }[];
  params?: Record<string, unknown>;
}

interface Gimmick {
  type: string;                 // "gravity-flip" | "whistle-reversed" ... プラグイン名
  railId?: string; from?: number; to?: number;   // 区間
  params?: Record<string, unknown>;
}
```

## 2. 約束ごと

- 分岐先の線路の始点は分岐点に置く。始点の接線はローダーが親線路の向きに自動でそろえる（作り手が点を工夫しなくてよい）
- `merge` の終点も同様に、合流先の点と一致させる。接線は自動
- 電車の向きは前後 ±4 m の台車位置から決める。`start.at` は先頭の位置。3 両（約 31 m）が線路に収まるよう 40 以上にする（周回線路なら 0 でもよい）
- ローダーの検証で落ちるもの: `schemaVersion` 不一致、必須フィールド欠落、存在しない `railId`／`stationId`、範囲外の `at`、分岐点・合流点の不一致（0.5 m 超）、モデル名が `[a-z0-9-]+` でない
- 速度・加速度・クールダウン・矢印を出す距離などはグローバル設定（`src/train/params.ts`）。ステージには書かない
- 「ステージ固有の値」はここに書く。コードに埋めない

## 3. 実例: 0-0「てすとこーす」

Phase 0 の仮ステージ。実装時に `src/stages/0-0.json` として置く。

```json
{
  "schemaVersion": 1,
  "id": "0-0",
  "title": "てすとこーす",
  "chapter": 0,
  "hidden": true,
  "unlock": { "requires": [], "purchase": null },
  "unlocks": [],
  "environment": {
    "sky": { "top": "#4f9dff", "bottom": "#d9f1ff" },
    "fog": { "color": "#d9f1ff", "near": 150, "far": 450 },
    "lighting": "day",
    "ground": { "y": -0.6, "size": 800, "color": "#7fc96f" },
    "bgm": null
  },
  "start": { "railId": "main", "at": 40, "direction": 1 },
  "rails": [
    {
      "id": "main",
      "points": [
        [0, 0, 0], [0, 0, 60], [0, 0, 120],
        [8.04, 0, 150], [30, 0, 171.96], [60, 0, 180],
        [90, 1.8, 180], [120, 3.6, 180], [150, 3.6, 180],
        [180, 1.8, 180], [210, 0, 180], [270, 0, 180]
      ],
      "end": { "type": "buffer" }
    },
    {
      "id": "branch",
      "points": [
        [0, 0, 120], [-8.04, 0, 150], [-30, 0, 171.96], [-60, 0, 180],
        [-120, 0, 180], [-180, 0, 180]
      ],
      "end": { "type": "buffer" }
    }
  ],
  "junctions": [
    { "id": "j1", "railId": "main", "at": 120, "left": "main", "right": "branch", "default": "left" }
  ],
  "stations": [
    { "id": "st-start", "name": "はじまりえき", "railId": "main", "at": 40, "tolerance": 4, "platformSide": "left" }
  ],
  "props": [
    { "model": "tree-a", "onRail": { "railId": "main", "at": 20, "lateral": -9 } },
    { "model": "tree-b", "onRail": { "railId": "main", "at": 32, "lateral": 9 } },
    { "model": "tree-a", "onRail": { "railId": "main", "at": 48, "lateral": -9 } },
    { "model": "tree-b", "onRail": { "railId": "main", "at": 64, "lateral": 9 } },
    { "model": "tree-a", "onRail": { "railId": "main", "at": 84, "lateral": -9 } },
    { "model": "tree-b", "onRail": { "railId": "main", "at": 100, "lateral": 9 } },
    { "model": "rock", "onRail": { "railId": "main", "at": 40, "lateral": -14 } },
    { "model": "tree-b", "onRail": { "railId": "main", "at": 140, "lateral": -9 } },
    { "model": "tree-a", "onRail": { "railId": "main", "at": 170, "lateral": -9 } },
    { "model": "tree-b", "onRail": { "railId": "main", "at": 200, "lateral": -9 } },
    { "model": "tree-a", "onRail": { "railId": "main", "at": 240, "lateral": 9 } },
    { "model": "tree-b", "onRail": { "railId": "main", "at": 256, "lateral": -9 } },
    { "model": "tree-a", "onRail": { "railId": "main", "at": 300, "lateral": 9 } },
    { "model": "tree-b", "onRail": { "railId": "main", "at": 324, "lateral": -9 } },
    { "model": "tree-a", "onRail": { "railId": "main", "at": 352, "lateral": 9 } },
    { "model": "tree-b", "onRail": { "railId": "main", "at": 376, "lateral": -9 } },
    { "model": "tree-a", "onRail": { "railId": "main", "at": 404, "lateral": 9 } },
    { "model": "rock", "onRail": { "railId": "main", "at": 380, "lateral": 14 } },
    { "model": "tree-a", "onRail": { "railId": "branch", "at": 40, "lateral": 9 } },
    { "model": "tree-b", "onRail": { "railId": "branch", "at": 70, "lateral": 9 } },
    { "model": "tree-a", "onRail": { "railId": "branch", "at": 110, "lateral": -9 } },
    { "model": "tree-b", "onRail": { "railId": "branch", "at": 128, "lateral": 9 } },
    { "model": "tree-a", "onRail": { "railId": "branch", "at": 152, "lateral": -9 } },
    { "model": "tree-b", "onRail": { "railId": "branch", "at": 170, "lateral": 9 } },
    { "model": "tree-a", "onRail": { "railId": "branch", "at": 194, "lateral": -9 } },
    { "model": "rock", "onRail": { "railId": "branch", "at": 150, "lateral": 14 } },
    { "model": "tree-a", "position": [0, -0.6, 168] },
    { "model": "tree-b", "position": [-12, -0.6, 205] },
    { "model": "tree-b", "position": [12, -0.6, 205] },
    { "model": "tree-a", "position": [0, -0.6, 240] },
    { "model": "rock",   "position": [-40, -0.6, 60] },
    { "model": "rock",   "position": [45, -0.6, 90] }
  ],
  "actors": [
    { "id": "sensor-1", "type": "trigger", "onRail": { "railId": "main", "at": 55, "heightFromRail": 0 },
      "size": [6, 4, 4], "reactsTo": "none" }
  ],
  "records": [],
  "missions": [],
  "gimmicks": []
}
```

座標の読み方: 始点で電車は +Z を向いている。このとき **右は −X、左は +X**（Three.js の右手系）。
main は分岐で +X 側（左）へ半径 60 m で曲がり、branch は −X 側（右）へ曲がる。
車止めは `end.type: "buffer"` の線路の終端に表示側が自動で置く（props に書かない）。

---

## 4. v1.1 の追加（Phase 1、2026-09-13）

`schemaVersion` は 1 のまま。追加フィールドはすべて省略可で、v1 のファイルはそのまま読める。

```ts
interface StationDef {
  // ...v1...
  stop?: Partial<{ perfect: number; ok: number; zone: number; maxSpeed: number }>;  // 停車判定の上書き（既定 1 / 6 / 30 m、13 m/s）
}

type Placement = /* v1 */ & { rotation?: Vec3 };   // 度、XYZ 順。rotationY より優先。逆さ標識は [0, 0, 180]

interface MissionStep {
  stationId: string;
  board?: number;      // ここで乗る人数
  alight?: number;     // ここで降りる人数
  parcel?: 'load' | 'unload';
  say?: string;        // 乗客の一言（乗り降りのとき）
  reply?: string;      // それへの相棒の返事
}

interface MissionDef {
  id: string; type: 'deliver' | 'pickup' | 'repair' | 'timed'; title: string;
  steps: MissionStep[];               // 順に回る。最後の駅がゴール
  lines?: Partial<Record<LineKey, string>>;   // 場面ごとの相棒の台詞。無い場面は黙る
  hints?: { railId: string; at: number; text: string }[];   // 電車の先頭が at を過ぎたら 1 回だけ言う
  onComplete?: string;                // 達成後に流す寸劇 id
}
type LineKey = 'start' | 'moving' | 'stationNear' | 'tooFast' | 'overshoot' | 'short' | 'perfect' | 'ok'
  | 'doorOpen' | 'doorClosed' | 'doorsOpenLever' | 'catNear' | 'catWoke' | 'catDanger' | 'catDangerAfter' | 'complete';
// 'start' は改行で区切ると順番に複数の吹き出しになる

interface StageFile {
  // ...v1...
  opening?: string;                          // 最初に流す寸劇 id
  ending?: string;                           // 最後に流す寸劇 id
  cutscenes?: Record<string, CutsceneStep[]>;
}

type CutsceneStep =
  | { say: string; who?: 'partner' | 'amanojaku' | 'passenger'; emote?: 'jump' | 'tilt' | 'cheer' }
  | { spawn: string; model: string; onRail: { railId; at; lateral?; heightFromRail? } }   // spawn = アクター id
  | { move: string; onRail: {...}; seconds: number }
  | { remove: string }
  | { wait: number }
  | { cutRail: { railId: string; from: number; to: number } }   // 線路に切れ目を作る
  | { card: { title: string; button: string } }                 // 札を出してタップを待つ
  | { emote: 'jump' | 'tilt' | 'cheer' };
```

アクターの型（`actors[].type`）:
| type | 動き | params |
|---|---|---|
| `trigger` | 通過でログ（Phase 0） | — |
| `cat` | 線路で寝ている。`wakeDistance` 以内で汽笛 → 起きて `fleeLateral` m 右へ歩く。`dangerDistance` まで近づくと急停止→やり直し | `{ wakeDistance: 60, dangerDistance: 8, fleeLateral: 6, fleeSeconds: 2 }` |

駅停車の判定（`src/mission/station-stop.ts`）: 停止位置とのずれが ±perfect で「ぴったり」、±ok で「とまれた」、ok を超えていきすぎたら失敗。ゾーン（`zone` m 手前）に `maxSpeed` より速く入ったら即失敗。
実例は `src/stages/1-1.json`。

---

## 5. v1.2 の追加（Phase 2、2026-09-24）

`schemaVersion` は 1 のまま。追加はすべて省略可。実例は `src/stages/1-2.json`。

```ts
interface RailDef {
  // ...v1...
  gaps?: { from: number; to: number; hint?: 'normal' | 'fast' | 'max' }[];  // hint = とべる段。相棒が 60 m 手前で「つぎの きれめは ふつう で とべる！」
  deadEnd?: boolean;       // 外れの線路。車止めで止まったら、その線路へ入る分岐の 80 m 手前に戻す（end は buffer に限る）
}

interface JunctionDef {
  // ...v1...
  signReversed?: boolean;  // 逆標識。標識と矢印 UI は default 側を「おすすめ」と表示する（= うそ）。
                           // ライトを点けて 40 m 以内に入ると、反対側（本当の道）が光り、そちらが進路になる
}

type RecordDef = /* v1 */ & {
  model?: string;          // 世界に置くモデル、図鑑の絵（assets/previews/<model>.png）
  note?: string;           // 図鑑の 1 行
};
// requires: null = 25 m 以内を通れば見つかる / "light" = ライトを点けて 25 m 以内 / それ以外 = まだ取れない（図鑑で「？」）
// → v1.8 で「その能力を使っている間に近くを通る」に広げた（jump = 空中、rocket = ふかしている間。§11）

type CutsceneStep = /* v1.1 */ | { unlock: AbilityId };   // 能力を覚える: ボタンが出て、札「〇〇を おぼえた！」

type LineKey = /* v1.1 */
  | 'gapNear'        // 切れ目の手前。{speed} が段の名前に置き換わる
  | 'jumpStopped'    // 止まったままジャンプを押した
  | 'fellShort' | 'fellNoJump'          // 落ちた（飛距離不足／押さなかった）
  | 'dinoNear' | 'dinoWoke' | 'dinoDanger' | 'dangerAfter'
  | 'smallCrossing' | 'bigDinoNear'
  | 'signNear' | 'signRevealed' | 'deadEnd' | 'recordFound';

interface StageFile {
  // ...v1...
  unlock: { requires: string[] };  // 既存。requires のステージを直接開いたとき（?stage=1-2）は、その unlocks の能力を持った状態で始まる
}
```

アクターの型（v1.2 追加）:
| type | 動き | params（既定値） |
|---|---|---|
| `dino-mid` | 線路で寝ている中型。汽笛で起きて右へ歩いてどく（猫と同じ） | `{ wakeDistance: 60, dangerDistance: 8, fleeLateral: 9, fleeSeconds: 2.5 }` |
| `dino-small` | 子ども。先頭が `startDistance` まで来ると左から右へ横断（`crossSeconds` 秒）。横断中に `dangerDistance` まで近づくと急停止 | `{ startDistance: 60, crossSeconds: 4, dangerDistance: 6, lateral: 8 }` |
| `dino-large` | 大型。線路の横に立ち、首が線路の上で上下する（上 `upSeconds`、下 `downSeconds`）。先頭が `gateDistance` に届いたとき首が下なら急停止、上なら通れる（通り終わるまで首は上のまま） | `{ upSeconds: 3.5, downSeconds: 1.5, gateDistance: 8 }` |

ジャンプ（`src/train/params.ts` の `JUMP`）: 高さ 4 m・空中 1.6 秒で固定。飛距離 = 押した瞬間の速さ × 1.6 秒（ゆっくり 8 / ふつう 16 / はやい 24 / びゅーん 35 m）。
あと少しで向こう岸に届くとき（飛距離の 25% 以内）はふわっと届く。今とべば越えられるとき、ジャンプボタンが光る。
3 両は同じ放物線をたどる（先頭が飛んだ場所で後ろの車両も飛ぶ）。先頭の台車が切れ目に入ったら落ちる。

---

## 6. v1.3 の追加（Phase 3、2026-09-24）

`schemaVersion` は 1 のまま。追加はすべて省略可。実例は `src/stages/1-3.json`。

```ts
interface RailDef {
  // ...v1.2...
  upMode?: 'fixed' | 'follow';   // "follow" = 線路の「上」が曲がりに沿って回る。島の端を縦に回り込むと、裏側でさかさまになる
  gaps?: { from; to; hint?; rewind?: { railId: string; at: number } }[];   // rewind = ここで落ちたときの戻り先（先頭の位置）。既定は 80 m 手前
}

interface EnvironmentDef {
  // ...v1...
  fall?: 'dark' | 'cloud';       // 落ちたときの画面。"cloud" = 雲にぽよん → 白くなって戻る（既定 "dark" = 暗転）
  cloudSea?: { y: number };      // はるか下に広がる雲の海（空のステージ用）
}

type LineKey = /* v1.2 */ | 'padGone' | 'padAppear';   // 消えたジャンプ台（ヒント）／汽笛で出た
```

仕掛け（`gimmicks[]`、区間は線路 `railId` の `from`〜`to`、電車の先頭で判定）:
| type | 動き | params（既定値） |
|---|---|---|
| `camera` | 区間の間、視点を自動で切り替える（天井の区間など） | `{ mode: "side" \| "chase" \| "cab" \| "top" }` |
| `jump-pad` | `from` の位置に消えたジャンプ台。`range` m 以内で汽笛 → `seconds` 秒だけ出る（最後の 2 秒は点滅）。先頭の台車が乗ると大ジャンプ（飛距離 2 倍、次の切れ目は必ず越える）。消えている間は台の場所がきらきらし、近づくと汽笛ボタンが光り、ピコが「きてきを ならしてみよう！」と言う | `{ seconds: 8, range: 60 }` |
| `updraft` | 上昇気流。区間の間、速さの上限を超えて `speed` m/s まで加速する（レバーが「ゆっくり」以上のとき）。線路をくぐる風の輪が並ぶ | `{ speed: 28 }` |
| `fog` | 視界ゼロの雲。霧が濃くなり空も白くなる。ライトを点けると `lightFar` m 先まで見える | `{ near: 2, far: 22, lightFar: 70 }` |
| `flock` | 空を回る群れ（見た目だけ。1-2 の翼竜） | `{ model, count, center, radius, speed }` |

モデルがまだないもの（`assets/models.json` の `_pending`）は、ゲームがコードで作る仮の形で表示する（`src/view/three/sky-placeholders.ts`）。本物ができたら `_pending` から外す。

ジャンプの着地後の待ち時間は 0 秒（2026-09-24 変更）。空中の間は押せない。

## 7. v1.4 の追加（2026-09-25、ドア待ちで止まって見える件）

```ts
type LineKey = /* v1.3 */ | 'doorAsk' | 'doorsClosedLever';
// doorAsk          = 駅でドアボタンを待つ間の声かけ。出たときと、押されるまで 8 秒ごと（既定「ドアの ボタンを おして、ドアを あけよう！」）
// doorsClosedLever = ドアを開ける前にレバーを動かしたとき（既定「さきに ドアを あけよう！」）。開いている間は従来どおり doorsOpenLever
```

- ドアを待つ間、ドアボタンは光る（ジャンプボタンと同じ光り方）。
- 乗り降りが終わったあとは、次に走り出すまでレバーは動かない（ミッションの切り替わりで、見張りのない電車が走らないように）。

## 8. v1.5 の追加（2-1、2026-09-25）

`schemaVersion` は 1 のまま。追加はすべて省略可。実例は `src/stages/2-1.json`、設計は `docs/PHASE5_DESIGN.md` §4。

```ts
interface EnvironmentDef {
  // ...
  fall?: 'dark' | 'cloud' | 'leaf';   // "leaf" = 大きな葉っぱで受け止めて、緑にふわっと変わって戻る
  bgm: string | null;                 // 曲の名前（v1 からの欄）。2-1 は "forest"
}

type LineKey = /* v1.4 */ | 'nutHit' | 'nutNear' | 'boughJump' | 'squirrelNear' | 'squirrelDropped';
// nutHit = 実にぶつかった（既定「ぽこん！ きのみに ぶつかった〜」）／nutNear = 実が転がり出した
// boughJump = しなる枝の上でジャンプを押した（既定「えだが とばして くれるよ！」）
// squirrelNear = 実を持ったリスが見えた／squirrelDropped = 汽笛でリスが実を落とした
```

仕掛け（`gimmicks[]`）:
| type | 動き | params（既定値） |
|---|---|---|
| `bough` | しなる枝。`railId` の `from`（幹側、固定）〜`to`（先）が、電車の速さに応じてたわみ、先頭の台車が `to` に来ると跳ね上げる（飛距離 = 速さ × 1.6 秒 × `launch`）。`to` の直後に `gaps[]` の切れ目を置く。枝の上ではジャンプボタンは押せない。枝の線路は画面側で別に作ってたわませる | `{ sag: 2.5, launch: 1.8, height: 6 }` |

人やもの（`actors[]`、`onRail` で置く）:
| type | 動き | params（既定値） |
|---|---|---|
| `nut` | 転がる木の実。先頭が `trigger` m まで来ると `at` から電車の方へ転がり出す。先頭の台車が実に届いたとき空中なら越えられ、地上なら「ぽこん」で `at − trigger − 30` へ戻る。越えられる瞬間はジャンプボタンが光る | `{ trigger: 80, speed: 5, range: 160 }` |
| `squirrel` | 実を持ったリス（線路の上 6 m）。先頭が `whistleRange` m 以内（`drop` m より遠い）で汽笛ボタンが光り、汽笛で実を線路の外へ落とす。鳴らさずに `drop` m まで来ると実を `at` の線路の上に落とす（止まった実。ジャンプで越える。ぶつかると `at − 80` へ戻る） | `{ whistleRange: 70, drop: 28 }` |

## 9. v1.6 の追加（2-2、2026-09-25）

`schemaVersion` は 1 のまま。追加はすべて省略可。実例は `src/stages/2-2.json`（`scripts/layout-2-2.mjs` が作る。JSON を手で直さず、スクリプトを直して `node scripts/layout-2-2.mjs` で作りなおす）、設計は `docs/PHASE6_DESIGN.md` §4。

```ts
interface RailDef {
  // ...v1.3...
  look?: 'rail' | 'silk';   // 線路の見た目。"silk" = くもの いと（白い いと 2 本、1.6 m ごとに横糸、40 m ごとに左右の草へ支えの いと。バラストなし）。既定 "rail"
  gaps?: {
    from: number; to: number; hint?; rewind?;
    pit?: boolean;          // false = 切れ目の下に黒い帯を描かない（水の上の切れ目）。既定 true
    bridge?: number;        // ローダーが付ける（書かない）: この切れ目は gimmicks[bridge] の花の橋がふさぐ小川
  }[];
}

type CutsceneStep = /* v1.2 */
  | { move: string; onRail: {...}; seconds: number; nowait?: boolean }   // nowait = 待たずに次の手順へ（いくつも同時に動かす）
  | { spawn: string; model: string; onRail: {...}; rotationY?: number }   // rotationY = 線路の向きに対する角度（度。180 = 電車のほうを向く）
  | { say: string; who?: Speaker; emote?: Emote; name?: string };         // name = 吹き出しに出す名前（例「くもさん」。なければ話し手の名前）

type LineKey = /* v1.5 */
  | 'hopperNear' | 'hopperOn' | 'hopperReady' | 'hopperDone' | 'hopperFell'
  | 'butterflyNear' | 'butterflyFollow' | 'butterflyWait' | 'butterflyFast'
  | 'budClosed' | 'bridgeOpen' | 'bridgeFell'
  | 'fragileNear' | 'fragileShake' | 'fragileBoing' | 'fragileBoingAfter' | 'fragileClear'
  | 'fellLight';
```

- ローダーは読みこんだ JSON を写して（`structuredClone`）から使う。花の橋や寸劇の `cutRail` が切れ目を足し引きしても、元の JSON は変わらない。
- 花の橋（`flower-bridge`）の小川は `rails[].gaps` に書かない。ローダーが `{ from, to, pit: false, bridge: 番号, rewind: { railId, at: rewindAt } }` をその線路の `gaps` に足す（手で `bridge` を書くと検証で止まる）。

せりふのキー（v1.6。どれも既定あり。ステージで書けば上書き）:
| キー | 場面 | 既定 |
|---|---|---|
| `hopperNear` | 汽笛でよぶバッタが近い（`whistleRange` ＋ 30 m 手前） | バッタさんだ！ きてきで よんでみよう |
| `hopperOn` | バッタが屋根にのった | わっ！ バッタさんが のった！ |
| `hopperReady` | のっていて、切れ目まで 60 m。`{speed}` は `gapHint` の段 | バッタジャンプ！ {speed} で とぼう！ |
| `hopperDone` | 切れ目をこえて、バッタがおりた | ありがとう、バッタさん！ |
| `hopperFell` | バッタをのせずにバッタの切れ目に落ちた | バッタさんが いないと とどかない〜 |
| `butterflyNear` | ちょうちょが近い（ライト消灯） | ちょうちょだ！ ライトで よんで みよう |
| `butterflyFollow` | ついてきた | ついてきた！ ライトは つけた まま ね |
| `butterflyWait` | とちゅうでライトを消した | ちょうちょが まってる！ ライトを つけて |
| `butterflyFast` | はやすぎて、ちょうちょが窓のほうへおされている | はやい！ ちょうちょが あわててる〜 |
| `budClosed` | 閉じた橋の 60 m 手前（ちょうちょがついてきていない） | はしが ない！ ちょうちょを つれて こよう |
| `bridgeOpen` | 花がひらいた | さいた！ はなの はしだ！ |
| `bridgeFell` | 閉じた橋に落ちた | ぽちゃん！ はしが まだ ない〜 |
| `fragileNear` | いとの はしの `warn` m 手前 | いとの はしだ！ ゆっくり わたろう |
| `fragileShake` | はしの上ではやすぎる | ゆれてる！ ゆっくり！ |
| `fragileBoing` | ぼよよーん（失敗） | ぼよよーん！ はやすぎた〜 |
| `fragileBoingAfter` | その あと | いとの うえは ゆっくり ね |
| `fragileClear` | わたりきった | わたれた！ じょうず！ |
| `fellLight` | ライトがついたまま飛距離が足りずに落ちた（ほかの失敗のせりふがあるときはそちら） | ライトを けすと はやく なるよ！ |

失敗の理由（`fail.reason`。テストの目印・せりふの選び方）: `tooFast`・`overshoot`（駅）、`cat`・`dino`・`nut`（ぶつかりそう）、`fellShort`・`fellNoJump`（切れ目）、`deadEnd`（行き止まり）に、v1.6 で `hopper`（バッタの切れ目にバッタなしで落ちた → `hopperFell`）、`bridge`（閉じた花の橋に落ちた → `bridgeFell`）、`fragile`（いとの はしで ぼよよーん → `fragileBoing` → `fragileBoingAfter`。画面は少し沈むだけで、ゆれは 0）を足した。

人やもの（`actors[]`、`onRail` で置く）:
| type | 動き | params（既定値、`src/train/params.ts` の `GRASSHOPPER`） |
|---|---|---|
| `grasshopper` | 線路の横の葉にすわっているバッタ（`lateral`・`heightFromRail` で葉の上）。`reactsTo: "none"` は先頭が葉の `hop` m 手前に来ると自分から屋根にのる。`reactsTo: "whistle"` は `whistleRange` m 手前から葉を `passBy` m 過ぎるまで汽笛ボタンが光り、汽笛でのる。空中ではのらない。のれるのは同時に 1 ぴき。のっている間はジャンプの飛距離が `power` 倍・高さ `height` m（ジャンプボタンに `data-hopper="1"`）。バッタの切れ目（葉より先の、同じ線路の最初の切れ目）をこえて着地したらおりる。のせずにそこへ落ちると失敗 `hopper` で、その切れ目の `rewind` へ戻る | `{ hop: 25, whistleRange: 60, passBy: 8, power: 2, height: 8, gapHint: null }`（`gapHint` は `hopperReady` の `{speed}`: normal／fast／max）。`off: { at, lateral?, heightFromRail? }`（省略可）は、おりるときに とびうつる 葉の 場所（同じ線路。なければ 電車の 横の 地面） |

仕掛け（`gimmicks[]`）:
| type | 動き | params（既定値、`FLOWER_BRIDGE`・`FRAGILE`） |
|---|---|---|
| `flower-bridge` | ちょうちょと花の橋。`railId` の `from`〜`to` が小川（切れ目。ローダーが足す）。ちょうちょは `butterflyAt` の横 `butterflyLateral` m、高さ `butterflyHeight` m の小さな花でまつ。ライトがつくと先頭の `lead` m 前を飛んで案内し（電車が `maxSpeed` より速いと `minLead` まで窓のほうへおされるだけ。失敗にしない）、ライトを消すとその場でまつ。つぼみ（`from − bud`、横 `budLateral`）にとまると花がひらき、小川がふさがる（ステージの間ずっとひらいたまま）。閉じた小川に落ちると失敗 `bridge` で `rewindAt` へ | `{ butterflyAt: 必須, butterflyLateral: -5, butterflyHeight: 4, range: 40, lead: 12, minLead: 4, maxSpeed: 8, catchSpeed: 20, bud: 12, budLateral: 4, size: 1, bloomSeconds: 1.5, rewindAt: butterflyAt − 60 }` |
| `fragile` | 宙にたるんだ いとの はし。先頭が `from − warn` に来るとレバーの「ゆっくり」（`maxSpeed` 以下でいちばん速い段）が光る。はしの上（空中でない）で `maxSpeed` ＋ 0.3 を超えるといとがゆれ、超えたまま `grace` 秒で失敗 `fragile`（ぼよよーん、`rewindAt` へ）。たるみは線路の点そのもので付ける。見た目は画面側で別に描く | `{ maxSpeed: 7.5, grace: 1.0, warn: 80, rewindAt: from − 60 }` |

読み込み時の検査（`src/stage/validate.ts`）:
- `look` は rail／silk、`pit`・`nowait` は true／false。`gaps[].bridge` は書かない
- バッタ: `reactsTo` は none／whistle。葉より先 250 m 以内に切れ目（花の橋の小川もふくむ）があり、その切れ目の戻り先が、葉の `hop` m 手前（汽笛でよぶバッタは `whistleRange ＋ 30` m 手前。よびかけの せりふが 先に 出るように）か、それより前。`off` は at（と lateral・heightFromRail）が数。spawn の `rotationY` は数、say の `name` は文字。同じ線路のバッタどうしは 150 m 以上はなす
- 花の橋: `butterflyAt` は必須。小川は 44 m 以上（どのジャンプでもとどかない幅）。`butterflyAt < from − bud − lead`、`rewindAt < butterflyAt − lead`。ほかの切れ目と重ならない。`butterflyAt`〜`from` の間に分かれ道がない
- いとの はし: `rewindAt < from`。はしの上に切れ目がない。`maxSpeed` は 0 より大きい

ほかの小さな直し（書き方は変わらない）:
- 逆標識は、分かれ道を通ると見破りが消える（ループでもどってきたら、もう一度ライトで見破れる）。うその側へ行ったあとは、その分かれ道の 80 m 手前からライトボタンが光る（ライトが消えていれば）
- 分かれ道の線路が地面より 2 m 以上高いと、標識は線路の高さに立つ

## 10. v1.7 の追加（2-3、2026-09-25）

`schemaVersion` は 1 のまま。追加はすべて省略可。設計は `docs/PHASE6_DESIGN.md` の「2-3」§5、ボタンの配置は `docs/PHASE7_FINISH.md` §1。
全ステージ共通の数字は `src/train/params.ts` の `ROCKET`・`SLOPE`・`COUNTDOWN`・`ROCK_ROLL`・`ROCK_DROP`・`JUMP.maxSpeed`・`REFUSE_COOLDOWN`・`VOLCANO_PUFF`。

```ts
interface RailDef {
  // ...
  base?: { look: 'rock'; depth?: number; toGround?: boolean; skip?: { from: number; to: number }[] };
  // 線路の下の岩（見た目だけ）。depth: 道床を下へ のばす（既定 3 m）。toGround: 地面まで のばす（下ほど広い台形 ＝「おね」）。
  // skip: 岩を つけない所（アーチ・橋）。同じ線路のメッシュに頂点色で入るので、描画の回数は増えない
}

type PropDef = /* ... */ & { tag?: string };   // 寸劇の cutRail の props で まとめて落とすための名前

interface MissionStep {
  // ...
  countdown?: {
    seconds: number;                          // 持ち時間（> 0）
    until?: { railId: string; at: number };   // 先頭が ここを通ったら セーフ。なければ その駅の停止ゾーン（停止線の 30 m 手前）
    assist?: number;                          // 時間切れ 1 回ごとに ふやす秒（既定 10）
    assistMax?: number;                       // ふやすのは ここまで（既定 30）
    icon?: 'volcano' | 'clock';               // パネルの絵（既定 volcano）
    music?: string;                           // 数えている間の曲（src/audio/songs.ts）。セーフで ステージの曲に戻る
  };
}

type CutsceneStep = /* v1.6 */
  | { cutRail: { railId; from; to; style?: 'fly' | 'fall'; props?: string } }   // fall = 切った線路と、tag が props の小物（線路の上に置いた物は from〜to の中だけ）が 下へ落ちる
  | { camera: 'fixed'; at: Vec3; lookAt: Vec3; reach?: number }              // 動かないカメラ（寸劇の終わりで元に戻る。reach は §15）
  | { fx: 'sneeze' };                                                          // 火山の くしゃみ（字幕「はっくしょーん！」、2.5 秒。けむりの わっかは props の volcano から）

type LineKey = /* v1.6 */
  | 'steepNear' | 'rocketReady' | 'rocketGo' | 'rocketAgain'
  | 'rocketLever' | 'rocketEmpty' | 'rocketQuiet'
  | 'slip' | 'slipEmpty' | 'slipAfter' | 'slipEmptyAfter' | 'noBrake' | 'noBrakeLever'
  | 'rockNear' | 'rockDrop' | 'rockHit'
  | 'timerStart' | 'timeLow' | 'timeSafe' | 'timeUp';
// 'timerStart' と 'timeUp' は 改行で区切ると 順番に複数の吹き出しになる
```

せりふの既定（ステージに書かなければ これを言う。書いていない ほかのキーは だまる）:
| キー | 場面 | 既定 |
|---|---|---|
| `rocketLever` | ロケット中に レバーを動かした（1 回の点火につき 1 回） | ロケット ちゅうは レバーが きかないよ |
| `rocketEmpty` | つぶが 0 で押した | からっぽ！ えきで まんたんに なるよ |
| `rocketQuiet` | 向かっている駅の 200 m 手前から／車止めの 150 m 手前から 押した | えきの ちかくは ロケット おやすみ |
| `slip` / `slipEmpty` | のぼれずに ずるずる（つぶが 0 なら slipEmpty） | ずるずる〜… のぼれなかった／ずるずる〜… ロケットが たりない！ |
| `slipAfter` | その あと（つぶが のこっていた とき） | ひかったら ロケットを おしてね |
| `slipEmptyAfter` | つぶ 0 の ずるずるの あと | ひかったら ロケットを おしてね |
| `noBrakeLever` | つるつるざかで レバーを動かした／押した（1 回） | つるつる〜！ レバーが きかない！ |
| `rockHit` | 石に ぽこん | ぽこん！ いしに ぶつかった〜 |
| `timeSafe` | カウントダウンに まにあった | セーフ！ |
| `timeUp` | 時間切れ | はっくしょーん！ |
間に合わないと意味がない一言（`rocketReady`・`rocketAgain`・`rockNear`／`rockDrop`（石の `say`）・`rocket` 区間の `line`）は、待っている吹き出しを消して すぐ出す。押しても出ないときの一言（ロケット・ジャンプ）は、同じ一言を `REFUSE_COOLDOWN` 3.5 秒の あいだ くりかえさない（連打しても 1 回）。
既定なし: `steepNear`（のぼり坂の 60 m 手前。坂の `line` が あれば そちら。失敗で戻ったあとも もう一度）、`rocketReady`（ミッションで最初に光った。失敗で戻っても もう言わない）、`rocketGo`（ミッションで最初の点火）、`rocketAgain`（同じ坂で 2 回目に光った）、`noBrake`（つるつるざかに入った）、`rockNear`（ころがる石が ぐらぐら。石の `say` が あれば そちら）、`rockDrop`（石が落ちた。石の `say` が あれば そちら）、`timerStart`（数え始める前）、`timeLow`（のこり 10 秒）。

能力 `rocket`（`"unlocks": ["rocket"]` と 寸劇の `{ "unlock": "rocket" }` で覚える）: ボタンは右手の丸の ひとつ（`#rocket`。丸は 最大 6 つで、並びは 見本ページで 決める。2026-09-30、PHASE9_0 §2）。カメラは いつも右上の角の小さい丸（`#camera`、一時停止の左）。
- 押すと つぶを 1 こ使い、3 秒間 10 m/s² で 30 m/s まで加速（レバー・ライト・のぼり坂に関係なく。止まっていても使える）。その間 レバーは動かない。終わったら 5 m/s²（その段のブレーキが強ければ そちら）で レバーの速さへ戻る
- つぶは 駅から走り出すとき と 失敗で戻ったとき に満タン（時間では たまらない）
- 出ない所: `rocket` 区間の `allow: false`、つるつるざか、向かっている駅の 200 m 手前から（分岐は選んだほう、なければ既定のほうへ たどる）、車止めの 150 m 手前から。押しても一言いうだけで つぶは減らない。使っている途中で入ると「ぷしゅっ」と終わる（失敗ではない）
- 光る: 次の のぼり坂の 40 m 手前から坂の上までで、いまの速さでは のぼりきれない（v²÷(2×減速) ＜ 残り＋2 m。減速は |pull|、レバーが速さより下なら その段のブレーキも足す）とき。または `glow: true` の区間の中
- ジャンプ・ジャンプ台・しなる枝の飛距離は、ロケットで出た速さ（点火中と、そのあと レバーの速さへ戻るまで）のとき 22 m/s（`JUMP.maxSpeed`）で頭打ちにして計算する。上昇気流（1-3）の速さは そのまま数える（40 m の切れ目は それで越える）

仕掛け（`gimmicks[]`、区間は線路 `railId` の `from`〜`to`、電車の先頭で判定）:
| type | 動き | params（既定値） |
|---|---|---|
| `slope` | 坂。`pull` < 0 = きゅうな のぼり（レバーでは のぼれず 毎秒 \|pull\| m/s 遅くなる。ジャンプで 上を飛んだぶんも 着地で同じだけ遅くなる（v² − 2×\|pull\|×距離）。レバーが速さより下なら その段のブレーキも足す。止まると 1.2 秒で 6 m ずるずる下がって失敗 `slip` → `rewind` へ）。`pull` > 0 = つるつるざか（レバーは動かない。毎秒 pull m/s 速くなり `max` で止まる。max より速く入ったら 3 m/s² で max まで落ちる）。入口に札を自動で立てる（`sign-steep`／`sign-slide`、左 3.2 m）。道床の色が変わり、のぼりは 8 m おきに黄色い「＞」 | `{ pull: (必須、0 以外), max: 20, rewind: { railId: 同じ, at: from − 60 }, line: null, sign: true }` |
| `bubbles` | 海から のぼる あわの柱（見た目だけ。2-3 の記録③の上）。区間なし | `{ position: [x, y, z]（必須。y は海面）, count: 14（1〜64）, height: 8, radius: 2.5 }` |
| `rocket` | ロケットの区間。`allow: false` = おやすみ（ボタンに `icon` の印、入口に札 `sign-no-rocket` を自動で立てる）。`glow: true` = ここではボタンが光る。`line` は入ったとき 1 回（押したときも。`pressLine` が あれば そちら） | `{ allow: true, glow: false, icon: "none" \| "sleep" \| "bridge", line, pressLine }` |

人やもの（`actors[]`、`onRail` で置く）:
| type | 動き | params（既定値） |
|---|---|---|
| `rock-roll` | ころがる石（1-2 の子恐竜と同じ判定。空中でも こえられない）。`warn` m で山側（左）で ぐらぐら → `startDistance` m で ころがり出し、`crossSeconds` かけて 左 `lateral` m から 右 `lateral` m へ → 海へ ぽちゃん。よこぎる間に `dangerDistance` まで近づくと「ぽこん」（失敗 `rock`）。`warn` の中で `waitSpeed` m/s より おそく `waitSeconds` 秒 待っていても ころがり出す（「まって」で止まった子の ため） | `{ startDistance: 60, crossSeconds: 4.5, dangerDistance: 6, lateral: 9, warn: 90, waitSeconds: 1, waitSpeed: 1 }` |
| `rock-drop` | おちて とまる石（2-1 のリスの「線路に落とす」だけ。汽笛は効かない）。`warn` m で線路に かげ → `drop` m で ぽよんと落ちて止まる（電車より前のときだけ）→ ジャンプで こえる（ジャンプボタンが光る） | `{ drop: 35, warn: 60 }` |
石の共通 params: `rewind`（同じ線路の位置の数字、または `{ railId, at }`。既定 石の 80 m 手前）、`say`（その石だけの声かけ）、`hitAfter`（ぽこんの あとの一言。既定 ころがる石「ころころ いしは まってね」、おちる石「おちた いしは ジャンプで こえてね」）。
`cat` に `params.look: "seabird"` を書くと うみどり（モデル `seabird-sleep`／`seabird`。汽笛で 空へ ぱたぱた飛んでいく）。

カウントダウン（ステップの `countdown`）: その ステップの運転が始まるとき（前の駅のドアが閉まって `timerStart` を言い終えたあと）に数え始める。減るのは運転中だけ（一時停止・失敗の演出・ドア・寸劇の間は止まる）。パネル `#timer` は速さの札の左どなり（火山の絵・へっていく帯・のこり秒）。赤くしない・点滅しない。
- セーフ: 先頭が `until` を通ったら（なければ 駅の停止ゾーン）。パネルは緑の「セーフ！」で 1.5 秒、`timeSafe`、曲が戻る
- 時間切れ: 失敗 `timeUp`（火山の くしゃみ → 白く包む → `timeUp`）→ その ステップを始めた駅の停止線へ戻る（乗客は そのまま、つぶは満タン）。次の持ち時間は `seconds + min(assist × 時間切れの回数, assistMax)`
- ほかの失敗: 5 m ごとに覚えた「その場所の のこり秒」＋3 秒に戻す（持ち時間は こえない。覚えがなければ満タン）
- v1 の `MissionDef.timeLimit` は使わない

読み込み時の検査（`src/stage/validate.ts` の `validateStageLayout`、線路の長さが要るもの）:
- `slope`: `pull` ≠ 0。`from` は線路の始まりから 30 m 以上あと（自分の `rewind` を持つ坂は 8 m 以上あと ＝ ずるずるの 6 m ＋ 2 m）、`to` は終わりから 10 m 以上手前。区間の中に 停止線・分岐・合流・切れ目がない（切れ目は ずるずる下がる 6 m＋2 m 手前まで）。のぼり坂の `to` から 同じ線路で次に止まる駅の停止線まで 200 m 以上
- 戻り先（坂・石・切れ目の `rewind`、既定の値も）が どの `slope` の中にもなく、ころがる石の `startDistance` の中にもない
- `rocket`: `railId`・`from`・`to` がある。`allow: false` と `glow: true` は同時に書かない
- `countdown`: `seconds` > 0。`until` の線路がある（位置も線路の中）。`assist`・`assistMax` ≥ 0。`music` は曲の名前
- `bubbles`: `position` が 3 つの数。`count` は 1〜64 の整数、`height`・`radius` は 0 より大きい

火山（`props` に `volcano` の モデルが ある ステージ）: ふだんは 12 秒ごと、カウントダウン中は 4 秒ごとに 小さい けむりの わっか「ぽふっ」を出す（`VOLCANO_PUFF`。くしゃみの 大きい わっかとは べつ）。

テスト用のしるし（`#app` の data-*）: `data-has-rocket`（ロケットを持っている）、`data-rocket-pips`（のこりの つぶ）、`data-burn`（点火中 1）、`data-slope`（`up`／`down`／空）、`data-slip`（ずるずる中 1）、`data-timer`（のこり秒）、`data-timer-state`（`run`／`low`／`safe`／`up`／空）、`data-camera`（寸劇の動かないカメラは `fixed`）、`data-rocks`（石ごとの いまの ようす `rock-f:roll,…`）、`data-rail-cut`（寸劇で切った所 `kudari:765-865`）、`data-cutscene-actors`（寸劇で出ている人 `sakasa`）、`data-volcano-puffs`（火山の「ぽふっ」の回数）。`#rocket` には `data-glow`・`data-idle`・`data-boost`（点火中）・`data-pips`・`data-why`（出ない わけ: `empty`／`zone`／`slide`／`station`／`air`／`burn`／`locked`）・`data-mark`（`sleep`／`bridge`／`slide`／`station`）。レバーのつまみ `#lever-knob` の `data-mark`（`rocket`／`slide`）。

## 11. v1.8 の追加（仕上げ PR3「きろく」、2026-09-26）

`schemaVersion` は 1 のまま。追加はすべて省略可。設計は `docs/PHASE7_FINISH.md` §4 の 1・2・4。実例は `src/stages/1-1.json`（記録 3 つ）、`1-2.json`（がけの 支線）、`2-1.json`（うえむきの えだ）。

### 記録の 見つけかた（決まりを かえた）
記録は「その能力を **使っている あいだに** 近くを 通ると 見つかる」。近く ＝ 電車の 先頭から 25 m 以内（`RECORD.distance`。`onRail` で 置いた 記録は 線路に そった 距離、`position` で 置いた 記録は まっすぐの 距離）。
| `requires` | 見つかる とき |
|---|---|
| `null` | 通るだけ |
| `"light"` | ライトを つけて いる あいだ |
| `"jump"` | 空中に いる あいだ（先頭の 台車が 浮いて いる） |
| `"rocket"` | ロケットを ふかして いる あいだ、その いきおいが のこって いる あいだ（レバーの 速さに もどるまで）、または いまの 線路か ひとつ 前の 線路で ふかした あと（`Train.rocketUsedHere`。びゅーんで 分かれ道の 手前で ふかすと、いきおいは てっぺんの 前に 消えるが、のぼれたのは ロケットの おかげ。失敗で 戻ると 忘れる） |
| `"dive"`（v1.10） | もぐって いる あいだ（先頭の 台車が もぐりの 弧の 中、もぐりの 分かれ道から 水へ 向かう とちゅう、または 水の 中） |
| それ以外（`reverse` …） | まだ 見つからない（あとの 章で 決める）。図鑑と 地図で「？」 |
能力を まだ 持って いない 記録は、どんな ときも 見つからない（地図の 島に「？」、図鑑に その能力の 灰色の 絵）。

```ts
type RecordDef = /* v1.2 */ & {
  hint?: string;   // ピコの ひとこと。記録の 60 m 手前（RECORD.hintDistance）で、いま 取れる とき（能力が ある／要らない）に ステージの 間 1 回
                   // 坂の せりふと かさなる ロケットの 記録には 付けない（せりふの 列で 見つけた あとに 出て しまう）
};

interface RailDef {
  // ...
  spur?: { back: { railId: string; at: number } };
  // 記録への 支線。終わりは 車止め（buffer）。車止めで 止まると、暗転して back へ 移る（失敗では ない: 画面の しずみ・ゆれ なし、
  // ピコ「やったね！ もとの みちに もどるよ」＝ せりふ spurBack。はずれの 道の「いきどまり！」とは 言いかたを 分ける）。deadEnd と 同時には 書かない
}

interface JunctionDef {
  // ...
  needs?: AbilityId;
  // 分かれ道の わき道（default でない ほう）に 要る 能力。標識の 上に その能力の 絵の 丸い 札、矢印の ボタンにも 同じ 絵が 付く。
  // 能力が ないと わき道の 矢印は 灰色で、押しても えらべず、ピコが needAbility を 言う（押した ときだけ。分かれ道の 手前で ひとりでには 言わない:
  // 1-2 は ねぼすけ恐竜の すぐ 先、2-1 は こずえのえきの 停車の とちゅうで、大事な せりふを おくらせる ため）。
  // わき道は default の 反対側に あること。signReversed とは いっしょに 使わない
}

type LineKey = /* v1.7 */ | 'spurBack' | 'needAbility';
// needAbility の 既定は 能力ごと: rocket「ロケットが あれば のぼれそう…」、jump「ジャンプが できたら いけそう…」、light「ライトが あれば みえそう…」、
// ほか「いまは まだ いけないみたい…」
```

- ロケットの「車止めの 150 m 手前は おやすみ」は、同じ 線路の 先に のぼり坂が まだ ある 間は かからない（わき道の 坂を ロケットで のぼる ため）。のぼり坂の てっぺんから 先は おやすみ（ふかして いれば「ぷしゅっ」）
- 支線の のぼり坂の 戻り先（`slope` の `rewind`）は、分かれ道より 手前の 本線に する（もう一度 えらびなおせる ように）。手前の 役者（ねぼすけ恐竜など）より 先に 置く（もう一度 起こさずに すむ）。先頭が 分かれ道の 15 m 以内なら、止まった まま 矢印を 押せる
- 失敗で 戻ったとき、起こした あとの ねぼすけ恐竜（`dino-mid`）が 戻り先と 同じ 線路の 戻り先 以前に いれば、起きた まま よけて いる（また 線路で ねると 車両の 下に なる）
- 読み込み時の 検査: `spur.back` は 線路の 中で 坂の 上でない。`spur` は buffer で 終わる。`needs` は 能力の 名前、わき道が ある、`signReversed` と いっしょに しない。`hint` は 文字

### 図鑑の 絵
記録ごとの 絵は `public/zukan/<記録の id>.png`（256 px、背景 なし、1 枚 40 KB 以内）。`node scripts/render-zukan.mjs [id…]` が、記録の `model` を ゲームと 同じ モデル（まだ 作って いない モデルは コードで 描く 仮の 形）で 描いて 書き出す。記録を 足したり モデルを かえたら 作りなおす。`model` の ない 記録（1-3 さかさじまの うら）は 絵なし。
絵は サービスワーカーが はじめに ぜんぶ ためる（オフラインでも 図鑑が 見える）。

### ステージに 足した もの
| ステージ | 足した もの |
|---|---|
| 1-1 | 記録 3 つ: `town-board`「まちの かんばん」（通るだけ、loop 322 の 左）、`hq-plans`「ほんぶの せっけいず」（通るだけ、ほんぶの 前 loop 4。M3 で ほんぶへ もどる ときに 見つかる）、`roof-balloon`「やねの うえの ふうせん」（ジャンプ、loop 258 の 家の やね） |
| 1-2 | 分かれ道 `to-gake`（main 695、右が 支線、`needs: "rocket"`）と 支線 `gake`（256 m、右の がけの 外を のぼる。坂 68〜142、戻り先 main 686（ねぼすけ恐竜 680 の 先）、もどる 先 main 725、カメラ chase 50〜250）。記録 `cliff-nest` は がけの 上の 空の 巣（gake 145.5 の 左 16 m、坂の てっぺんの 少し 先） |
| 2-1 | 分かれ道 `to-eda`（top 165、右が 支線、`needs: "rocket"`）と 支線 `kozue-eda`（221 m、こずえのえきの 横を 上へ のびる えだ。坂 40〜106、戻り先 top 150、もどる 先 top 180）。記録 `treetop` は てっぺんの はね（kozue-eda 114） |

## 12. v1.9 の追加（走行音、2026-09-27）
`schemaVersion` は 1 のまま。追加は 省略可。

```ts
// gimmicks[]: 線路の その区間の 走る 音（先頭で 判定）
{ type: 'sound'; railId: string; from: number; to: number; params: { surface: 'rail' | 'silk' | 'bridge' | 'wood' | 'soft' } }
```

- 走る 音は 線路の 見た目から きまる: ふつうは `rail`、`look: "silk"` の 線路は `silk`（しずか、ふわっと）、`flower-bridge` の 花の 上は `soft`（はなびら）。`sound` の 区間が あれば それが かつ
- `bridge`: 鉄の 橋（ごーっが 大きく、低く ひびく。たたんも 大きい）。`wood`: 木の 橋（ことん・ことん）
- 実例: 2-3 の ぐらぐらばし（kudari 745〜885、`wood`）
- 読み込み時の 検査: `surface` は 上の 5 つの どれか、`from` < `to`

```ts
interface EnvironmentDef {
  // ...
  ambience?: 'town' | 'valley' | 'sky' | 'forest' | 'meadow' | 'sea';
  // しまの まわりの 小さな 音（src/audio/ambience.ts）。省略 = なし。こうかおんの 音量で 鳴る。一時停止で 止まる
}
```

| ambience | 音 |
|---|---|
| town | 遠くの まちの ざわざわ、すずめ、ときどき 鈴 |
| valley | 谷を ふく 風、ときどき 小鳥 |
| sky | 高い 風、ときどき 風鈴 |
| forest | 葉っぱの さらさら、小鳥の さえずり |
| meadow | 草の そよぎ、虫（こおろぎ）、ときどき 小鳥 |
| sea | 波、とおくの 火山の ごろごろ（ごく 小さく）、ときどき 海鳥 |

- いまの ステージ: 1-1 town、1-2 valley、1-3 sky、2-1 forest、2-2 meadow、2-3 sea（0-0 は なし）
- 読み込み時の 検査: 上の 6 つの どれか

## 13. v1.10 の追加（3章「もぐる」の 土台、2026-09-27）
`schemaVersion` は 1 のまま。追加は すべて 省略可。設計は `docs/PHASE8_CHAPTER3_4.md` §0.2（もぐるは 何回も）・第 2 部 §2・第 3 部 §4。実例は `src/stages/0-0.json`（はずれ道 branch 130 から 左へ 池の 線路 `pond`、池の そこの ループ `deep`）。

### 水（`environment.water`）
```ts
interface EnvironmentDef {
  // ...
  water?: WaterDef[];
  fall?: 'dark' | 'cloud' | 'leaf' | 'water';   // water: 水色（#cdeefe）へ ふわっと
}
interface WaterDef {
  y: number;        // 水面の 高さ
  floor: number;    // 底の 高さ（見た目。y より 下）
  area?: { circle: { center: [x, z]; radius: number } }
       | { rect: { center: [x, z]; size: [よこ, たて]; rotationY?: 度; corner?: 角の まるみ m } };
                    // 省略 ＝ 海（地面 ぜんぶ）。rect は rotationY 0 で「たて」が +Z（配置の rotationY と 同じ）
  look?: 'sea' | 'lake' | 'puddle' | 'ice';     // 既定 sea
  under?: { color?: '#rrggbb'; far?: number };  // 水の 中の 色と 見える きょり（m）。既定は look ごと
}
```
- **線路の 区間は ローダーが きめる**（書かない）: 線路ごとに 1 m おきに、`area` の 中で
  - レール上面が 水面から 1.5 m 上 〜 1.0 m 下 → **水の 上**（`Rail.surfaces`）。もぐるの ボタン（`#dive`）が 光る 場所
  - 水面より 1.0 m 以上 下 → **水の 中**（`Rail.dives`）。ドームを かぶって 走る
  - 数は `src/train/params.ts` の `DIVE`（`surfaceAbove` 1.5、`submerge` 1.0）
- 見た目: `area` の ある 水は 地面の 板に 穴を あけ、底まで 壁と 底を 描く。`area` の ない 水（海）は 地面の 板を 描かず、水面（色 ＝ `ground.color`）と 底の 板を 描く。水面は 上から 半透明、下から 明るい 天井。カメラが 水面より 下に 入ると 霧と 背景が 水の 中の 色・きょりに かわり、空は かくれる。水の 中の つぶ。ふえる 描画は 最大 5 回（水面・底と 壁・うきもの と わっか・つぶ・ドーム）
- `look` ごとの 既定: sea `#2f8fc8`・70 m、lake `#5fb4d8`・60 m、puddle `#7fc6c9`・40 m、ice `#8fd0ea`・60 m

### もぐる（ボタンと 決まり）
- もぐるは **自分の ボタン**（`#dive`。青、`DIVE_ICON`。能力 `dive` が ある ときだけ 出る。ジャンプの 丸は 顔が かわらない。2026-09-30 だいさん、`docs/PHASE9_0_FREE_ABILITIES.md`）。水の 上・水の 中・ドームを かぶって いる あいだ、そして 通る 道（分かれ道は えらんだ 側、もぐりの 分かれ道は もぐって いるか どうか）で **水の 区間か もぐりの 分かれ道の 80 m 手前**から「近づいた」合図（`data-dive="near"`、ミッションの `diveNear` の きっかけ。ヒントだけ）。ボタンの 光り（`data-glow`）の 決まりは 下の「光る」。光って いなくても いつでも 押せる。丸は 最大 6 つ（ふえても 場所は 動かない）
- 水の 上で 押す たびに もぐる: 下向きの 弧（深さ `DIVE.depth` 6 m、長さ ＝ 速さ × `DIVE.time` 2.0 秒、みじかくても `minLength` 8 m、速さは 22 で 頭打ち）。あいだは あわの ドーム。先頭が 浮かぶと「ぷかっ」、その 0.6 秒 あとから また 押せる。先頭が もぐって いる あいだの 連打は 何も おきない。何も ない 所で 押しても よい（しっぱいに ならない）。水の 区間の おわりで 陸に 入る ときは その 手前で 浮かぶ
- **陸の 上（止まって いる ときも）で 押すと「もぐら ごっこ」**: あわの ドームを かぶって「ずぶっ」と 0.6 m しずみ「ぽこっ」と 出る（0.9 秒。その あいだの 連打は 何も おきない）。**`diving` には しない**（もぐる 記録・わっかには 数えない）。見た目・音は `view/three`・`audio`。水の 中（海の そこ）で 押すと あわが 出る だけ
- 組み合わせ: 跳んで いる あいだは 押しても 何も おきない。もぐって いる 弧の とちゅう・海の そこでは ジャンプが 何も おきない（あわの 音だけ）。水の 入り口・わっかに ジャンプで 入ると、もぐって いない ときと 同じ（水の 上を 回って 手前へ。しっぱいに しない）
- 光る（`#dive` の `data-glow`）: いま 押せば 前の うきものの 下を くぐれる とき（弧の 長さを 25% まで のばして くぐれる ときも）、いま 押せば もぐりの 分かれ道を もぐった まま 通る とき、取れる `dive` の 記録が 30 m 以内の 前に ある とき
- 水の 中へは ドームなしで 入らない: もぐらずに 水の 中の 区間の 入り口に 来たら「ぽよん」（下の しっぱい、入り口の 60 m 手前へ）
- 一時停止・巻き戻し: 失敗や つづきで 水の 中に 戻った ときは、ドームを かぶった 状態から（音・ふくらむ 動き なし）

### うきもの（`floaters`、ステージの 一番 上の 配列）
```ts
floaters?: {
  id: string;
  railId: string; at: number;             // まんなか
  length?: number;                        // 線路 ぞいの 長さ（m、16 以下）。既定は look ごと
  look?: 'log' | 'raft' | 'lily' | 'wave' | 'ice';   // ながれぎ／いかだ／はすの はっぱ／なみ／こおりの かけら。既定 log
  rewind?: number | { railId: string; at: number };  // ぽよんの あとの 戻り先。既定 at − 60（同じ 線路）
}[];
```
- 水の 上の 区間に 浮かぶ（見た目は コードの 仮の 形）。電車の 先頭の 台車が `at ± length/2` に 入る とき、そこで もぐりの 弧が 屋根まで くぐれる 深さ（線路の 高さ − 水面 ＋ 車の 高さ 3.6 ＋ うきものの 下の 深さ ＋ 0.2）で なければ「ぽよん」
- 既定の 長さ・下の 深さ（`FLOATER`）: log 2.4・0.6、raft 6・0.5、lily 4・0.2、wave 5・0.8、ice 4・0.7

### もぐりの 分かれ道（`junctions[].dive`）
```ts
interface JunctionDef {
  // ...
  dive?: boolean;   // 矢印も 標識も なし。水面に 赤白の わっか
}
```
- 通る とき（先頭車の まんなかが `at` を こえる とき）に もぐって いれば（弧の 中・水の 中）、線路が 水の 中へ 入る 側へ。もぐって いなければ `default`（水の 上の 側。しっぱいに しない）
- 水の 中へ 入る 側は ローダーが きめる（`diveSide`。書かない）。下って いく 途中の もぐりは、線路が それより 深く なるまで その 深さの まま（上下に ゆれない）。ドームは 水の 中の あいだ ずっと。さいごの 車両が 水から 出ると「ぷはっ」と はじける

### しっぱい・せりふ・記録
- しっぱいの 理由 `dive`（ぽよん）: やわらかい（画面 しずみ 0.3、ゆれ 0、音は 水の ぽよん）→ `diveBoing` → `diveBoingAfter` → 暗転 → 戻り先
- **いきどまり（`deadEnd`）も やわらかい しっぱいに した**（画面 しずみ 0.3、ゆれ 0）
- テストコース（ミッションなし）: 落ちた ときと 同じく、暗転して 戻り先へ
```ts
type LineKey = /* v1.8 */ | 'diveNear' | 'diveBoing' | 'diveBoingAfter';
// diveNear「みずだ！ もぐるを おして！」: ミッションで はじめて もぐるの ボタンが 光った とき（待って いる 吹き出しを 消して すぐ。2026-09-30 から 丸の 顔は かわらない）
// diveBoing「ぽよん！ もぐるの わすれた〜」、diveBoingAfter「ひかったら もぐるを おしてね」
// needAbility の 既定に dive「もぐれたら いけそう…」
```
- 記録 `requires: "dive"`: もぐって いる あいだ（先頭の 台車が 弧の 中、もぐりの 分かれ道から 水へ 向かう とちゅう、または 水の 中）に 25 m 以内を 通ると 見つかる（§11 の 表の `dive` の 行）
- 能力 `dive` の 名前は「もぐる」（札「もぐるを おぼえた！」）
- テストコース 0-0 は ぜんぶの 能力（`dive` も）を 持つ。記録も 見つかる（保存は しない）

### 読み込み時の 検査
- `water`: `y`・`floor` が 数で `floor < y`、`look` は 4 つの どれか、`area` は circle（半径 > 0）か rect（`size` 2 つの 正の 数、`corner` ≥ 0）、`under.color` は `#rrggbb`、`far` > 0。`fall` は dark／cloud／leaf／water
- 水の 中の 区間は どこかで 水面から 4.5 m（車の 高さ ＋ 0.9）より 深く なる
- `floaters`: `id` が かさならない、線路と `at` が ある、`look`・`length`（0 より 大きく 16 以下）、ぜんぶが 1 つの 水の 上の 区間に 入る、同じ 線路で 40 m 以上 はなす、戻り先は 線路の 中で 水の 中でなく、同じ 線路なら 自分より 手前
- もぐりの 分かれ道: 水の 上の 区間に ある、左右 両方 ある、`needs`・`signReversed` と いっしょに しない、ちょうど 片方だけが 60 m 以内に 水の 中へ 入り、その 側は 分かれ道より 6 m 以上 下まで 行く、`default` は 水の 上の 側、`diveSide` は 書かない
- `requires: "dive"` の 記録（水の ある ステージ）: どこかの 水の 区間から 25 m 以内（もぐれたら かならず 取れる）

### テスト用の しるし
`#app` の `data-dive`（`''`／`near` ＝ もぐるの ボタンが 光る（水の 手前）／`on` ＝ ドーム。コードは この 名前の まま）、`data-diving`（先頭が もぐって いる 1。陸の もぐら ごっこは 数えない）、`data-submerged`（先頭車が 水の 中 1）、`data-underwater`（カメラが 水の 中 1）、`data-dive-bounces`（ぽよんの 回数）、`data-dives`（もぐった 回数）、`data-bobs`（陸の もぐら ごっこ〈前の ぷくぷく〉の 回数）、`data-records`（テストコースで 見つけた 記録）。`#dive` の `data-diving`・`data-glow`（クールダウンの 輪は `diveProgress`）。`#jump` の `data-mode` は なくなった（2026-09-30）

### 3-1「うみのそこ」の 足し（v1.10、2026-09-27）
設計は `docs/PHASE8_CHAPTER3_4.md` 第 3 部（§0 の 読みかえで）。実例は `src/stages/3-1.json`（`scripts/layout-3-1.mjs` が 作る）。どれも 省略可。

```ts
floaters?: { /* ... */ say?: string }[];
// その うきものの DIVE.hintDistance（60 m）手前で 1 回 言う（書いて いなければ ミッションの floatNear）。すぐ 出す

// actors[]: くじら（線路の よこの 水の 中に onRail で 置く。reactsTo は "whistle"）
{ id, type: 'whale', reactsTo: 'whistle', onRail: { railId, at, lateral, heightFromRail },
  params: { until: number; callRange?: 80; lead?: 10; lateral?: -12; height?: 4; trail?: 30 } }
// callRange m 手前から until まで 汽笛が 光る。汽笛で うたって（1.6 秒）おへんじ → 先頭の lead m 前・lateral m 右
// （マイナスは 左）・線路の height m 上を いっしょに 泳ぐ → 先頭が until を こえたら 先へ 泳いで きえる。
// よばずに 通りすぎると trail m うしろを ついてくる（まだ よべる）。しっぱいは ない。一度 なかよく なれば、
// until より 前へ 戻っても いっしょに 泳ぐ

// gimmicks[] "updraft" の params に: look?: 'wind' | 'current'; whale?: <くじらの id>
// current = あわの 輪と あわの 流れ（風の 輪の かわり）。whale を 書くと、その くじらが いっしょに 泳いで いる
// ときだけ 押す（いない ときは 輪が うすく、入口で currentWait）
// gimmicks[] "jump-pad" の params に: look?: 'pad' | 'whale'
// whale = ジャンプだいの かわりに くじら（ふだんは 水の 中、汽笛で 浮かび、のると しおふき）。決まりは ジャンプだいの まま

interface JunctionDef {
  // ...
  bubbles?: { left: 'rise' | 'sink'; right: 'rise' | 'sink'; say?: string };
  // あわの 分かれ道: 分かれた 先に あわの 柱（12 m と 28 m）。rise ＝ しろ・みずいろで のぼる（ほんもの）、
  // sink ＝ ピンクに ぐるぐるで しずむ（サカサ）。矢印にも 同じ しるし。sink の 側は 分かれ道より 手前へ
  // 合流する ループ か deadEnd（まちがえても 先へ 進めない。しっぱいに しない）
}

// gimmicks[] "fog" の params に: color?: '#rrggbb'（水の 中で その 区間の 色。ふかい ところ）

type CutsceneStep = /* ... */
  | { fx: 'pop'; id?: string }                       // 大きな あわが「ぱちん」（id の 人・物の ところで しぶき）
  | { card: { title; button; icon?; mirror?: boolean } };  // mirror: 紙の 札に 題を 左右 反転で（ぐるぐるの しるし）
```

| もの | 決まり（全部 `src/train/params.ts` の `WHALE`・`BUBBLE_FORK` と ステージの JSON） |
|---|---|
| あわの 分かれ道 | 90 m 手前で `say`（なければ `bubbleNear`）を ミッションで 1 回。rise の 側へ 進むと `bubbleTrue`（「きらりん」）。ライトを つけて 40 m 以内に 入ると sink の ぐるぐるが 光り、`bubbleRevealed` を ステージで 1 回（進路は かえない）。`fog` 区間の 中で 100 m 以内に あると ライトが 光る。sink の 側へ 行った あとは 80 m 手前から ライトが 光る |
| くじら | 汽笛が 光りはじめると `whaleCall`（すぐ）。`whaleNear` は 90 m 手前。おへんじで `whaleSang` |
| うきものに ぽよん | しっぱいの 理由 `floater`（やわらかい）。`floatHit` → `floatHitAfter` → 戻り先 |

せりふの キー（v1.10 の 3-1 分）:
| キー | 場面 | 既定 |
|---|---|---|
| `diveGo` | ミッションで はじめて もぐった | なし |
| `diveReady` | ミッションで はじめて もぐるが 光った（すぐ 出す） | なし |
| `floatNear` | うきものの 60 m 手前（うきものの `say` が あれば そちら） | なし |
| `floatHit` / `floatHitAfter` | うきものに ぽよん／その あと | ぽよん！ ぶつかっちゃった〜／ひかったら もぐるを おしてね |
| `whaleNear` / `whaleCall` / `whaleSang` | くじらの 90 m 手前／汽笛が 光った／おへんじ | なし／きてきで あいさつ しよう！／おへんじ してくれた！ |
| `currentIn` / `currentWait` | くじらの ながれに 入った（押す／くじらが いない） | なし／くじらさんを よんでみよう！ |
| `bubbleNear` / `bubbleTrue` / `bubbleRevealed` | あわの 分かれ道 | あわが ふたつ！ どっちかな？／せいかい！ ほんものの あわ！／ぐるぐる もよう！ サカサの あわだ |

- 能力 `magnetLight` の 名前は「じしゃくライト」（5 章。まだ どこでも もらえない。3-1 の 記録③は 図鑑と 地図で「？」、絵は じしゃく）
- 見た目: 水の 上の 線路（`Rail.surfaces`）は 道床の かわりに 木の 板と 左右の うき（6 m おき、しろ と みずいろ）。水の 中の カメラでは 光の すじ。くじら・ながれ・あわの 柱・ふかい ところの ひかる つぶ は `src/view/three/sea.ts`、仮の 形は `sea-placeholders.ts`（チケット 0011）
- 読み込み時の 検査: `bubbles` は 片方 rise・片方 sink、左右 両方 あり、`dive`・`needs`・`signReversed` と いっしょに しない、sink の 側は 手前へ 合流する ループ か deadEnd。`whale` は onRail・reactsTo "whistle"・`until` が 自分より 先、数は 正しい 形。`updraft` の `look` は wind／current、`whale` は くじらの id、`speed` > 0。`jump-pad` の `look` は pad／whale。`fog` の `color` は `#rrggbb`。うきものの `say` は 文字。`card.mirror` は true／false、`fx` は sneeze／pop（`id` は pop だけ）
- テスト用の しるし: `#app` の `data-whales`（`kujira:follow` など）、`data-bubble-revealed`（ライトで ぐるぐるが 光った あわの 分かれ道の id）。矢印の `data-bubbles`（`rise`／`sink`）。紙の 札は `#card.is-mirror`

### 1・2 章の もぐる 記録（v1.10、2026-09-27）
第 2 部 §4 を §0.2（もぐるは 水の 上で 押す たびに 短く）で 読みかえた。支線は どちらも 水の 上へ 出て、記録の 手前で もぐるが 光る（`requires: "dive"` の 記録が 30 m 以内の 前）。押せば もぐって 見つかる。車止めで 止まると 本線へ 戻る（`spur`）。
| ステージ | 足した もの |
|---|---|
| 2-2 | みずたまり（main 520–560）が ほんとうの 池に（`water`: 水面 −1.8、底 −8、`look: "puddle"`、main と 同じ 向きの 64 × 42 m。本線の ジャンプは そのまま: 本線の レールは 水面より 1.8 m 上で「水の 上」に ならない）。分かれ道 `to-mizutamari`（main 385、左、`needs: "dive"`）と 支線 `mizutamari`（173 m、main の 左 12 m、池の 中で 水の 上へ、車止め、もどる 先 main 395）。記録 `mizutamari` は 池の そこの `record-marble`（おおきな ビーだま） |
| 2-3 | 海が `water`（水面 0、底 −14、`look: "sea"`）に。分かれ道 `to-umi`（main 200、右 ＝ 海の 側、`needs: "dive"`）と 支線 `umi`（約 210 m、低い 土手を くだって 海の 上を うきで 走る、車止め、もどる 先 main 210）。記録 `bubble-spring` は 支線 170 の 右 6 m の 海の そこ（`spring-vent`）、その 上に あわの 柱。M3 の ヒント「うみの なかから あわが…」は M1 の main 145 へ |

## 14. v1.10 の追加（4-1「こおりのみずうみ」、2026-09-27）
`schemaVersion` は 1 のまま。追加は すべて 省略可。設計は `docs/PHASE8_CHAPTER3_4.md` 第 7 部 §4（本文の「3-2」は 4-1）。実例は `src/stages/4-1.json`（`scripts/layout-4-1.mjs` が 作る。JSON を 手で 直さない）。全ステージ共通の 数は `src/train/params.ts` の `ICE`・`THIN_ICE`・`MIRROR`。

### こおり（`gimmicks[]` の `ice`、区間）
```json
{ "type": "ice", "railId": "main", "from": 199, "to": 1900, "params": { "grip": 0.4, "line": "こおりの うえだ！ つるつる〜", "sign": true } }
```
- 電車の 先頭が 区間に ある あいだ、**レバーの ブレーキ**（とまる・ゆっくり… の 3、きゅうブレーキの 8）と **車止めの 前の 自動ブレーキ**が `grip` 倍（既定 0.4）。加速・ゲームの 急停止（あざらし・ゆきどり）・ロケット（点火と その あとの もどり）は そのまま
- `line` は 区間に のった とき 1 回（しっぱいで もどった あとも もう 1 回）。`sign`（既定 true）で 入口の 左 3.2 m に 札 `sign-ice`
- 見た目: 道床が 水色（`#bfe3f2`）。レバーの つまみに ゆきの けっしょう（`#lever-knob[data-mark="ice"]`）。こおりの 上で 速さを 落として いる あいだ、車輪から きらきらの こな と「しゃーっ」（走る 音は 自動で `ice`）
- `slope` と 重ねない。同じ 線路の `ice` どうしも 重ねない

**こおりの 駅**（停止線が `ice` の 中に ある 駅。新しい 欄は ない）
- レバーの 目もりが 2 だんで 光る（`.lever-detent[data-hint="1"]`）: 「ゆっくり」＝ 速さが 5.5 m/s より 上で、のこりが (v² − 5²) ÷ (2 × 3 × grip) ＋ 停止ゾーン（30）＋ 40 m 以下。つぎに「とまる」＝ のこりが v² ÷ (2 × 3 × grip) ＋ 5 m 以下（止まるか ゾーンを 出るまで 光ったまま）
- こおりの 駅は `stop.maxSpeed: 9` を ステージに 書く（停止ゾーンに 9 m/s より 速く 入ると すぐ「はやすぎ」）
- こおりの 駅で いきすぎ・はやすぎは やわらかい しっぱい（画面 しずみ 0.3、ゆれ 0）で、せりふが `iceOvershoot`「つるーん！ すべって いきすぎた〜」→ `iceOvershootAfter`「こおりは はやめに ブレーキ ね」

### うすい こおり（`gimmicks[]` の `thin-ice`、区間）
```json
{ "type": "thin-ice", "railId": "main", "from": 1415, "to": 1535,
  "params": { "line": "うすくて ながい！ ロケット 2かい！", "minSpeed": 24, "grace": 0.8, "warn": 120, "rewindAt": 1265, "sign": true } }
```
- 電車が のって いる（先頭が `from` を こえ、うしろの 台車〔先頭から 35 m〕が `to` を こえるまで、空中で ない）あいだ、`minSpeed`（24 m/s）より 遅いと「ぴしぴし」（`crackShake`）、そのまま `grace`（0.8 秒）で 失敗 `crack`（「ぽちゃん」）。速く なれば 数えなおし。**レバーの いちばん 速い 段（22）では わたれず、ロケット（30）でだけ わたれる**
- ロケットが 光る: 先頭が `from − 80` から うしろの 台車が `to` を ぬけるまでで、**いま 押せば わたりきれる** とき（1/30 秒 きざみで 8 秒 先まで 計算。1 回で わたれない 長さなら、1 回目が 切れた 0.3 秒 あとに もう 1 回 押す つもりで 計算）。どう 押しても わたれない（止まりかけで 近づいた）ときは、それまで 光って いなければ `from − 20` から 光る。せりふは いまの `rocketReady`（ミッションで 最初）・`rocketAgain`（同じ 区間で 2 回目）
- 失敗 `crack`: 電車が 止まり、3 両が 半分（0.8 m）しずんで 0.4 m まで「ぷかっ」と 浮き、おもちゃの 船の ように ゆれる。あざらしが あなから 顔を 出す。カメラは うしろから。やわらかい しっぱい（画面 しずみ 0.3、ゆれ 0）。せりふ `crackFall`「ぽちゃん！ ぷかぷか〜」→ `crackAfter`「ひかったら ロケットで いっきに！」（つぶ 0 なら `crackEmpty`「ぽちゃん！ ロケットが たりない〜」→ `crackEmptyAfter`「こんどは ロケットを とっておこう」）→ 白く つつんで `rewindAt`（既定 `from − 150`）、つぶ 満タン
- わたりきると `thinIceClear`（書いた ときだけ）。うしろの 台車が 通った 所から 0.3 秒で こおりが 板に 割れて 水が 見え、4 秒で もとに もどる
- `line` は `warn`（120 m）手前で 1 回。`sign` で 20 m 手前の 左に 札 `sign-thin-ice`。道床は こい 水色（`#8cc3e0`）
- カメラを うしろから に したい ときは いまの `camera` 区間（`chase`）を 置く

### かがみ（`gimmicks[]` の `mirror`、区間なし）
```json
{ "type": "mirror", "params": { "position": [-398.9, 0, 546.4], "rotationY": 192, "width": 22, "height": 14,
  "railId": "kagami1", "junction": "j-kagami1", "lightHint": true } }
{ "type": "mirror", "params": { "position": [-385, 0, 1080], "rotationY": 222, "width": 30, "height": 18, "reflect": ["train", "cutscene"] } }
```
- `position`（かがみの 下の まんなか）に こおりの かがみ（はば `width`・高さ `height`、雪の 台と こおりの ふち）を 立てる。`rotationY` 0 で ガラスが +Z を 向く
- **うつる もの**: 電車が かがみの 前（ガラスが 向いて いる 側）`range`（260 m）以内の とき、いちばん 近い かがみ 1 まい だけに、電車 3 両（ライトの 光も）・近くの 線路（`reflectRadius` 80 m 以内）・分かれ道の 標識、`reflect` に `cutscene` が あれば 寸劇の 役者 が うつる。本物の はんしゃ（画面を もう 1 回 ぜんぶ 描く）は 使わず、ステンシルの まどに 小さい 2 回目の 描画を する（ふえるのは 写しの 分だけ）
- `junction`: その 分かれ道は `signReversed`、`default` の 道が `railId`（`deadEnd` の 線路）。うその 道の 先に かがみが あり、じぶんの 電車が むこうから 来る ように 見える。**かがみの 中の 標識は ほんとうの 向き**
- `lightHint: true`: その 分かれ道の 100 m 手前から、ライトが 消えて いれば ライトボタンが 光る（見やぶるまで）。`mirrorNear` を 言う（改行で 複数の 吹き出し。書いた ときだけ）
- ライトが ついて いて、かがみが 前 `flashRange`（200 m）以内・向きが ±40° の とき「きらーん」（音・写しの ライトの 所に 光の 星・`mirrorFlash`「きらーん！ あれは かがみ だ！」）。1 回の 近づきで 1 回。見やぶると かがみに きらきらの 波
- うその 道で かがみまで 45 m で `mirrorFake`「わっ！ ワンダーごうが もう 1だい！？」。止まった あとは いまの `deadEnd`（やわらかい しっぱい）

### こおりの 板（`gimmicks[]` の `ice-sheet`、見た目だけ）と 雪
```json
{ "type": "ice-sheet", "params": { "outline": [[-212, -445], [90, -330], "…"], "y": 0.05, "color": "#cfeaf6" } }
"environment": { "snow": { "count": 600, "radius": 60, "fall": 1.2 }, "surface": "snow" }
```
- `ice-sheet`: `outline`（[x, z] の 点、3 つ 以上）の 平らな こおり（うすい ひびと 岸の 雪。下から 見ても 明るい）。こおりで おおわれた 水（下）の `area` は 穴に なる
- `environment.snow`: カメラの まわりに ふる 雪（`count` 0〜2000 の 整数、`radius` m、`fall` m/s）
- `environment.surface`: `sound` 区間の ない 所の 走る 音（既定 `rail`）。`snow` の ステージは 道床が 白く、地面が すこし 明るい。`ice`・`thin-ice` の 区間は 自動で `ice`

### こおりで おおわれた 水（`environment.water[].holes`）
```json
{ "y": 0, "floor": -12, "look": "ice",
  "area": { "rect": { "center": [65, 32], "size": [40, 130], "rotationY": 90, "corner": 8 } },
  "holes": [{ "rect": { "center": [65, 32.4], "size": [24, 100], "rotationY": 90, "corner": 10 } }] }
```
- `look: "ice"` の ときだけ。`holes` は `{ center, radius }` か `{ rect }`（`area` と 同じ 書き方）。**線路が 水の 上（もぐれる 所）に なるのは 穴の 中だけ**。穴の そとは こおりの 上（ふつうの 線路）。水の 中へ 入る 線路の 入口と 出口も 穴の 中（検査）
- 見た目: 穴の 中は 水、`area` の 残りは こおりの 板（下から 明るい 天井）。`ice-sheet` と 重ねる ときは `ice-sheet` の 側に 穴が あく

### どうぶつの 見た目
- `cat` に `params.look: "seal"`: あざらし（`seal-sleep`／`seal`）。きてきで おなかで すいーっと どく（ふみきりの 棒は 立たない）
- `rock-roll` に `params.look: "snowbird"`: ゆきどり 5 わの 行列が よちよち わたり、わたったら 右の 雪の 上で 止まって 見送る。近づきすぎると ぱたぱた（判定・失敗の 理由 `rock` は そのまま）

### 失敗・せりふ
- 失敗の 理由（`fail.reason`）に `crack`（やわらかい）
```ts
type LineKey = /* v1.10 (4-1) */
  | 'iceNear'   // こおりの 駅で 最初に「ゆっくり」が 光った（既定 なし）
  | 'iceStop'   // 最初に「とまる」が 光った（既定 なし）
  | 'iceBrake'  // ミッションで はじめて こおりの 上で 速さを 落とした（既定 なし）
  | 'iceOvershoot' | 'iceOvershootAfter'
  | 'crackShake' | 'crackFall' | 'crackAfter' | 'crackEmpty' | 'crackEmptyAfter'
  | 'thinIceClear'  // 既定 なし
  | 'mirrorNear'    // 既定 なし
  | 'mirrorFlash' | 'mirrorFake';
```

### 読み込み時の 検査
- `ice`: `grip` は 0 より 大きく 1 以下。`ice` どうし・`slope` と 重ならない
- `thin-ice`: 長さ 36 m 以上（びゅーんの ジャンプ 35.2 m で とびこせない）。`from − 10`〜`to + 35` に 停止線・分かれ道・合流・切れ目・ロケットの おやすみ（`allow: false`）が ない。`rewindAt` は `from − 120` 以下で、`thin-ice`・`slope` の 中で ない。`to + 35 + 30` が 同じ 線路で 次の 駅の 停止線の 200 m 手前（ロケットの おやすみ）より 前。`minSpeed` は レバーの いちばん 速い 段より 大きく、ロケットの 速さより 小さい
- `mirror`: `position` は 3 つの 数、`width`・`height` などは 正。`junction` が あれば `railId` も 書き、その 分かれ道は `signReversed` で `default` の 道が `railId`、`railId` は `deadEnd`
- `ice-sheet`: `outline` は 3 点 以上
- `environment.snow.count` は 0〜2000 の 整数、`environment.surface` は 走る 音の 名前、`holes` は `look: "ice"` だけ
- `cat.look` に `seal`、`rock-roll.look` に `snowbird`

### テスト用の しるし
`#app` の `data-ice`（先頭が こおりの 上 1）、`data-ice-hint`（`slow`／`stop`／空）、`data-thin`（`on`／`crack`／空）、`data-cracks`（ぽちゃんの 回数）、`data-mirror`（いま うつして いる かがみの gimmicks 番号）、`data-mirror-flash`（きらーんの 回数）。`#lever-knob` の `data-mark` に `ice`

### まだ ない もの
- 要る ステージが まだ ない とき（4-1 の `unlock.requires: ["3-3"]`）: 島は かぎの まま。`?stage=4-1` で 直接 ひらくと、ない ステージの かわりに それより 前の ステージが 教える 能力を 持って はじまる（いまは 2-3 まで。前の ステージの `unlocks` に `dive` が 入れば それも）

## 15. v1.10 の追加（3-2「たきのかわ」・3-3「ほしのうみ」、2026-09-27）
`schemaVersion` は 1 のまま。追加は すべて 省略可。設計は `docs/PHASE8_CHAPTER3_4.md` 第 4 部・第 5 部（§0.2 の 読みかえで。実装メモ 第 4 部 §18・第 5 部 §19）。実例は `src/stages/3-2.json`・`3-3.json`（`scripts/layout-3-2.mjs`・`layout-3-3.mjs` が 作る。JSON を 手で 直さない）。全ステージ共通の 数は `src/train/params.ts` の `WATERFALL`・`LEAP`・`FESTIVAL`。

### もぐる（どちらも つかう）
- **水の 上の 区間が そのまま 水の 中へ つづく 所**（3-2 の たきつぼ・もりの いけ、3-3 の さんばしの 先・ていぼうの 先）: 水の 上で もぐると、もぐった まま 水の 中へ 入る（ドームは 水の 中の あいだ ずっと）。もぐらずに 入り口に 来ると「ぽよん」（入り口の 60 m 手前へ）。**いま 押せば 入り口まで もぐった まま 行ける ときに 丸が 光る**（わっかと 同じ 決まり）。わっかは 3-3 の M2 だけ
- 3-2 の いかだ・はすの はっぱ 3 まい、3-3 の おまつりの いかだ 2 そうは `floaters`（押す たびに もぐって くぐる）

### 水（`environment.water[]` に 足す）
```ts
interface WaterDef {
  // ...
  wall?: 'bowl' | 'cliff';          // 3-2: cliff = 岩の がけ（よこじま 2 本、上に 草の へり）。既定 bowl
  flow?: [number, number];          // 3-2: 水の 中の つぶが この 向きに ながれる（m/s、3 まで）。見た目だけ
  under?: { color?; far?; sparkle?: '#rrggbb' };  // 3-3: 水の 中の つぶが その 色で 光る（加算）
}
```

### たき（`gimmicks[]` の `waterfall`、見た目と 音だけ）
```json
{ "type": "waterfall", "params": { "from": [-68.6, 1636.4], "to": [51.4, 1636.4], "top": 0, "bottom": -8, "throw": 8.5, "lip": 1.5, "rainbow": true } }
```
- 口の 線 `from`〜`to`（[x, z]）から `top` の 高さで、`bottom`（その 水の 水面）へ 落ちる。下で `throw` m 前へ（放物線）。`lip`: 口の 岩の 出っぱり。`rainbow`: にじ
- 見た目（`src/view/three/river.ts`）: しろい すじが 流れる カーテン 1 まい、下の あわ、しぶき、にじ。描く 回数 4
- **シャワー**: 車両の 屋根が がけと カーテンの 間（口の 下、落ちる 水面の 上）に ある あいだ `#app[data-shower="1"]`、運転席では 窓に 水の すじ（DOM `.shower-vignette`）、「ざーっ」。ゲームの 状態は かわらない
- 「さーーっ」: たきから 350 m で 0、40 m で いちばん 大きい
- 検査: `from`・`to` は 数 2 つ、`top > bottom`、`bottom` が どれかの 水の `y`、口の 線が その 水の ふちから 5 m 以内、`throw` 0〜20、`lip` 0〜5

### どうぶつ・むれの 見た目
- `dino-small` に `params.look: "duck"`: かもの おやこ（`duck-family`）。決まりは 子きょうりゅうの まま。わたる とき「があ・ぴよぴよ」
- `cat` に `params.look: "turtle"`: ねむる うみがめ（`sea-turtle-sleep` → 汽笛で `sea-turtle`、右 `fleeLateral` m・上 7 m へ 泳ぐ）。水の 中でも 汽笛は とどく
- `cat` の params に `say`・`woke`・`danger`・`after`（その 1 ぴきの 一言。書けば ミッションの `catNear`・`catWoke`・`catDanger`・`catDangerAfter` の かわり。`say` は すぐ 出す）
- `flock` に `params.mode: "leap"` と `surface`（水面の 高さ）: 水面の すぐ 下を 泳ぎ、ときどき 弧を えがいて とびはねる（`LEAP`）

### 線路の 下（`rails[].base` を 区間ごとに）
```json
"base": [ { "look": "rock", "toGround": true, "from": 0, "to": 110 }, { "look": "pier", "from": 110, "to": 365 } ]
```
- 配列の ときは `from`〜`to` ごとに 見た目を かえる（かさならない）。ひとつだけの 書き方も そのまま
- `look: "pier"`: 木の さんばし（はば 4.4 m の 板、8 m ごとの 四角い 柱が 地面〔海の そこ〕まで）。線路の メッシュに 入るので 描く 回数は ふえない。水の 上の 区間は うきの 板が かつ

### 空・光（3-3）
- `environment.lighting: "evening"`: 夕日の 色の 低い 太陽と 青い 地面光（暗く しない）。`day`・`evening`（`night`・`cave` は まだ 形だけ）
- `environment.stars: { count }`（1〜1000）: 空の 上の 半分に 星（描く 回数 1、水の 中では 空と いっしょに 見えない）
- `gimmicks[]` の `fog` に `params.glow: true`: その 区間で ライトが 消えて いれば ライトの 丸が 光る
- `fog` の 区間の 中で 汽笛を 鳴らすと、ひかる つぶが 0.5 秒 ぴかっ（「ちりりん」。見た目だけ）
- まわりの 音 `sea` の 遠い 火山の ごろごろは、`volcano` の 小物が ある ステージ（2-3）だけ

### カウントダウンの おつきさま（`countdown.icon: "moon"`）
- パネル: 夜の 空と 海、へって いく 帯に あわせて 顔の ない おつきさまが 水平線から のぼる（のこり 10 秒で 半分）
- 時間切れの 見た目は 絵で かわる: `volcano` → 火山の くしゃみ（2-3、いままで どおり）、`moon` → 東の 空に おつきさまが ぽわんと のぼる（「ぽろろん」）→ 水色に ふわっと。`clock` → くしゃみ なし
- テスト用の しるし: `#app[data-timer-icon]`、時間切れの `#app[data-timeup]`（`moon`／`volcano`／`clock`）

### 寸劇の 足し
```ts
type CutsceneStep = /* ... */
  | { press: 'light' | 'whistle' | 'rocket' | 'jump'; say?: string; fx?: 'beacon' }
  | { door: 'open' | 'close' }
  | { fx: 'festival' }
  | { card: { title; button; icon?: 'badge' | 'drawing'; mirror? } }
  | { camera: 'fixed'; at; lookAt; reach?: number };
```
- `camera: "fixed"` の `reach`（1〜4、既定 2.5）: 動かない カメラの あいだ、霧と 見える きょりが ステージの 霧の 何倍まで とどくか。遠くからの 広い 絵（2-3 の おわり など）は 既定の まま、近くの 絵は 1（寸劇の あと、しばらく いつもより 遠くまで 描いて 描く 量が ふえるのを ふせぐ。3-2 の glimpse・ending）
- `press`: 子どもが その 丸を 押すまで まつ（その 丸だけ 光り、ほかは うすく。`say` を 今と 8 秒ごと）。押すと その 丸の ふつうの 動き（ライトは つく）。`fx: "beacon"` は `lighthouse` の 灯が ともり、光の すじが 回る（「ぴかーん」）。▶▶ で とばすと 押した ことに なる。テスト用の しるし `#app[data-cutscene-press]`、`#app[data-beacon="1"]`
- `door`: いま 止まって いる 駅の 側の ドアを あける／しめる（見た目だけ。寸劇が おわると しまる）
- `fx: "festival"`（2.5 秒）: おつきさまが のぼり、`environment.festival.bursts` の 3 か所から 光の 玉が のぼって ひらき、`lantern-jelly` の むれが 3 m 上がり、`festival-raft` の ちょうちんが 明るく なる（「しゃらら〜ん」）。おわると その まま
- `environment.festival: { bursts: [[x, y, z], ...], moon?: { azimuth, elevation } }`（`fx: "festival"` を 書くなら 要る）
- `card.icon: "drawing"`: 画用紙に クレヨンの ワンダーごうの え（DOM の SVG。`#card.is-drawing`）

### せりふ・その他
- `stationNear` に `{station}`（駅の 名前）が 書ける（3-3 の M3 は 駅が 2 つ）
- 能力 `plow`（ゆきかき、4 章）の 名前を 先に 足した（3-2 の 記録③ と より道 `yukima` が まつ。灰色の 絵は ゆきかきの へら）。もらえるのは 4-2（§16）。`needAbility` の 既定は §16 の「ゆきかきが あれば いけそう…」、3-2 は ミッションの せりふで「ゆきを どかせたら いけそう…」

### 読み込み時の 検査
- 上の 形の 検査（`wall`・`flow`・`sparkle`・`stars`・`festival`・`lighting`・`base` の 配列・`pier`・`waterfall`・`look` の 追加・`mode`・`press`・`door`・`fx`・`card.icon`・`countdown.icon`・カメラの `reach`）
- `press` の `fx: "beacon"` には `lighthouse` の 小物が、`fx: "festival"` には `environment.festival` が 要る

## 16. v1.10 の追加（4-2「おおゆきの むら」と 能力「ゆきかき」、2026-09-27）
設計は `docs/PHASE8_CHAPTER3_4.md` 第 6 部。`schemaVersion` は 1 の まま、ぜんぶ 省略可。能力 id `plow`（`AbilityId` に 足した）。

### ゆきの かべ（`gimmicks[]` の `plow-wall`）
```json
{ "type": "plow-wall", "railId": "main", "from": 500, "to": 660,
  "params": { "look": "snow", "line": "ながい ゆきの みち！ ゆきかき！", "rewind": { "railId": "main", "at": 440 },
              "height": 5, "width": 8, "sign": true } }
```
- `from`: かべの 面（電車の 先頭が ここに つくと、ゆきかきが 下りて いれば「ずぼーん！」、なければ「ぽすっ」）。`to`: うもれた せんろの おわり（省略 ＝ かべだけ、`from + 4`）
- `look`: `snow`（既定）／`sand`／`foam`（見た目だけ。いまは どれも 雪の 形）。`line`: この かべで ゆきかきの ボタンが 光りはじめた ときの 一言（1 回の ためしに 1 回）。なければ ミッションの `plowNear`（ミッションで 1 回、既定「ゆきの かべ！ ゆきかきを おして！」）
- `rewind`: ぽすっの あとの 戻り先（既定 `from − 60`）。`height`・`width`・`sign`: 見た目（既定 5・8・true。札 `sign-plow` は かべの 8 m 手前・左 3.2 m）
- ローダーが 線路ごとに `Rail.plows`（`PlowSpan`）を 作り、停止線が うもれた 所に ある 駅に `buried: true` を つける（書かない。ホームと 札が 雪の 下に なり、かくと 出てくる）
- こわれた かべと その うしろの 雪は、ステージを やりなおすまで もどらない（ほかの しっぱいで 戻っても）。しっぱいの 白い フェードの あいだに、途中まで かいた 所も 片づく
- つづき（`prepareResume`）: はじまる 駅までの 道の かべは こわれた あと。駅が うもれた 所の 中なら、そこまで かいた あとで ゆきかきは 下りた まま

### ゆきかき（自分の ボタン `#plow`。2026-09-30 に「ジャンプの 席の 3 つめの 顔」から かえた。`docs/PHASE9_0_FREE_ABILITIES.md`）
- ゆきかき（能力 `plow`）を 持って いると 紫の ボタン `#plow` が いつも 出る（顔は かわらない。丸は 最大 6 つ）。これから 通る 道（分かれ道は えらんだ 側、なければ 既定の 側）で まだ かいて いない 雪（こわれて いない かべ、かきかけの うもれた 所）が 80 m 以内に あると、ボタンが 光る（`data-glow`。ヒントだけ）。ゆきかきが 下りるまで 光る。`data-plow="near"` は この 光りはじめ（ミッションの `plowNear` の きっかけ）
- 押すと ゆきかきが 下りる（押した しゅんかんに 下りたと 数える）。下りて いる あいだに 押しても 何も おきない。止まって いても、ロケット中・ライト中でも 押せる。かきが 下りて いても ジャンプは できる（かきは 下りた まま）
- 80 m 以内に かく 雪が なくなると「ぽん」と 上がる。かべが 2 つ つづけば 下りた まま。（前の「1 秒 あとに 丸が ジャンプに もどる」と `plowUp` は なくなった）
- 雪の かべは ジャンプで こえられない。跳んで ぶつかっても 押しわすれと 同じ「ぽすっ」（かべの 60 m 手前から）
- **あそびの かき**: 雪が 80 m 以内に ない ときに 押すと、かきが `PLOW.playSeconds`（1.2 秒）下りて、落ち葉・花びら・砂を「ずざーっ」と 左右に とばし（イベント `plow:petals`）、上がる。かきが 上がりきるまでの 連打は 何も おきない。記録・かべには ぜんぜん かかわらない。`handlePlow` は あそびの かきの あいだ 上げない

### 小さな 足し
- `rails[].base.look` に `snow`（雪の 尾根。白 → うすい 水色）
- `rails[].gaps[].line`: その 切れ目で 落ちた あとの 一言（`fellShort`・`fellNoJump` の かわり）
- `gimmicks[]` の `jump-pad` に `params.look: "ski"`: スキーの ジャンプだい（`ski-ramp`。消えて いる 間は たたんだ 板 `ski-ramp-folded` が 立って いて、きてきで「ばたん！」と たおれる）
- `props[].trace: true`（と 1 まいめだけ `traceLine`）: ライトを つけて 40 m 以内で、小物の ぐるぐるの しるしが 光り、ステージで 1 回 `traceLine` を 言う。しるしの ある 小物は `snow-fence-trace`
- 寸劇の 手順 `{ "sky": "evening", "seconds": 3 }`: 空・霧・光が 夕方の 色に なり、ちょうちん（`lantern`）が ともる。ステージが おわるまで その まま（早送りでも）
- `environment.fall` に `snow`（白に うすい 水色）

### 失敗・せりふ
- 失敗の 理由（`fail.reason`）に `plow`（やわらかい: 少し 沈むだけ、ゆれ 0）。「ぽすっ」→ 画面が 雪で まっしろ → ワイパー「きゅっ きゅっ」→ せりふ → 白い フェード → `rewind`
```ts
type LineKey = /* v1.10 (4-2) */
  | 'plowNear'       // ミッションで はじめて ゆきかきの ボタンが 光りはじめた（既定 ゆきの かべ！ ゆきかきを おして！）
  | 'plowGo'         // ミッションで はじめて ずぼーん（既定 なし）
  | 'plowLong'       // ミッションで はじめて うもれた 所を 20 m かいた（既定 なし）
  | 'plowBump'       // ぽすっ（既定 ぽすっ！ ゆきに ささった〜）
  | 'plowBumpAfter'; // その あと（既定 ひかったら ゆきかきを おしてね）
```
- 記録の `requires: "plow"`: ゆきかきで かいて いる あいだ（先頭が うもれた 所の 中で ゆきかきが 下りて いる）に 25 m 以内。分かれ道の `needs: "plow"` の 一言は「ゆきかきが あれば いけそう…」

### 読み込み時の 検査（`validatePlowLayout`）
かべの 区間 ＝ `from − 120`〜`to + 40`。
- `to` は `from + 4` 以上。うもれた 所どうしが 重ならない。線路の おわりを こえない
- 区間に 置けない もの: 線路の 上の 生き物（`cat`・`dino-*`・`rock-*`・`nut`・`squirrel`・`grasshopper`・`snowman`。見た目の 決まり）。**切れ目・水・`bough`・`flower-bridge`・`fragile`・`thin-ice`・ジャンプ台・分かれ道の 検査は 2026-09-30 に やめた**（ジャンプの 席の 顔が ぶつからない ための 検査だったので。PHASE9_0 §3）
- 坂: かべの 面は くだりの 中に ない。うもれた 所の 中の のぼりは かべの 50 m 以上 先から
- 駅: 停止線が かべ 〜 区間の おわり に ある 駅は、停止ゾーンの はじめが かべの 20 m 以上 先
- わき道の かべは 分かれ道から 60 m 以上 先。`needs: "plow"` の 分かれ道は わき道の 400 m 以内に かべ。`chapter` が 4 より 前の ステージは、かべを `needs: "plow"` の わき道 だけに 置ける
- `rewind` は 線路の 中で かべより 手前、坂・うすい こおり・水の 上では ない
- `requires: "plow"` の 記録は どれかの うもれた 所から 25 m 以内（かべの ない ステージでは 検査しない。あとで かべと いっしょに 入る）

### テスト用の しるし
`#app` の `data-plow`（`''`／`near` ＝ ゆきかきの ボタンが 光る（かべが 近い）で まだ／`on` ＝ 下りて いる。コードは この 名前の まま）、`data-plowing`（かいて いる 1）、`data-plow-bursts`（ずぼーんの 回数）、`data-plow-bumps`（ぽすっの 回数）、`data-blade-drops`（押して 下ろした 回数）、`data-wall-<gimmicks 番号>`（`whole`／`dented`／`burst`）、`data-sky`（`evening`）、`data-trace`（しるしが 光って いる 1）。`#plow` の `data-blade`・`data-plowing`・`data-glow`。`#jump` の `data-mode` は なくなった（2026-09-30）

## 17. v1.10 の追加（4-3「ゆきやまのトンネル」、2026-09-28）
`schemaVersion` は 1 の まま、ぜんぶ 省略可。設計は `docs/PHASE8_CHAPTER3_4.md` 第 8 部（本文の「3-3」は 4-3。§0 の 読みかえで。実装メモ §19）。実例は `src/stages/4-3.json`（`scripts/layout-4-3.mjs` が 作る。JSON を 手で 直さない）。全ステージ共通の 数は `src/train/params.ts` の `SNOW_WAVE`・`TUNNEL`。

### ゆきの なみ（ミッションの ステップの `chase`）
```json
{ "stationId": "yamagoya", "parcel": "unload",
  "chase": { "railId": "main", "from": 1900, "until": { "railId": "main", "at": 2780 }, "fence": 2740, "pace": 12,
             "paces": [ { "from": 2010, "to": 2110, "speed": 17 }, { "from": 2150, "to": 2220, "speed": 7 } ],
             "retry": [1880, 2000, 2235, 2420, 2600], "music": "hurry" } }
```
- その ステップの 運転中、電車の 先頭が `from` を こえると、最後尾（先頭 − 37 m）の `start`（40）m うしろに なみが 出て、線路に そって おいかける（`src/mission/chase.ts` の `SnowWave`。位置と 速さだけ、物理なし）。運転中だけ 数える（一時停止・寸劇・失敗の 演出の 間は 止まる）
- 速さ: `paces` の うち なみが いる 区間の `speed`、なければ `pace`。`far`（25）m より はなれると 電車の 速さ ＋ 1（`bandMax` 20 m/s まで）で 寄ってくる。つかまる たびに `assist`（3）m/s ずつ おそく（`minPace` 4 まで）、**3 回 つかまると どこでも 4 m/s 以下**（4 回めは かならず にげきれる、§0.8）。速く なるのは 3 m/s² まで、おそく なるのは すぐ
- **つかまる**: すき間が 0 に なった とき（空中なら 着地まで まつ）。失敗の 理由 `snow`（やわらかい: しずみ 0.3・ゆれ 0）。電車が 止まり、白い 雪の 玉が 画面の 下から ふくらむ（DOM `.chase-puff`）、「もふっ」→ `chaseCaught` → `chaseCaughtAfter`（3 回めは `chaseTired`）→ 白い フェード → つかまった 所より 30 m 以上 うしろの いちばん 近い `retry`（なければ 最初の `retry`）。つぶは 満タン
- ほかの 失敗（ゆきだるま・われめ・ずるずる・駅）の あとも、なみは 最後尾の `restart`（45）m うしろで まち、電車が 1 m/s を こえたら 0 から 動きだす
- **セーフ**: 先頭が `until` を こえたら。なみは `fence` で「もふん」と 止まり、1.5 秒で 低い 雪の 山に なる。パネルは 緑の「セーフ！」、`chaseSafe`、曲が もどる
- ピコの 声（1 回の ためしに 1 回ずつ）: 出た とき `chaseStart`（改行で 複数）、20 m より 近い `chaseNear`、ロケットが なみの ために 光った `chaseRocket`、60 m より はなれた `chaseFar`
- **ロケットが 光る**: すき間が 15 m より 小さく、のこりの つぶが、`until` までに まだ 前に ある のぼり坂の 数より 多い とき（駅の 近く・すべりざか・点火中は いつもどおり 光らない）
- **レバー**: すき間が 25 m より 小さく、電車が 15 m/s より おそい とき「はやい」の 目盛りが 光る
- **パネル**（`#timer`、`data-mode="chase"`）: 数字なし。左に なみの 絵、右に 小さな 電車、なみが 近づくと 帯が 左から 雪で うまる（すき間 60 m で 空）。近いと なみの 絵が もこもこ ゆれる。赤く しない・点滅 しない
- 運転席では うしろの なみが 見えないので、20 m より 近いと 画面の ふちが うっすら 白く、こな雪が まえへ ふきぬける（`#app[data-chase="near"]`、DOM）。「もこもこ」の 音が 近いほど 間を つめて 鳴る
- `music`: おいかけの 間の 曲（`songs.ts`）。ステップに 書けば 上書き できる: `start` `restart` `far` `bandMax` `assist` `minPace`
- 見た目（`src/view/three/snow.ts`）: まるい 白い 玉の なみ（`snow-wave`、顔なし）が 線路の 上を ころがり、上から こな雪が まう

### トンネル（`gimmicks[]` の `tunnel`、区間）
```json
{ "type": "tunnel", "railId": "main", "from": 1257, "to": 1700, "params": { "hall": { "from": 1395, "to": 1538 } } }
{ "type": "tunnel", "railId": "nise", "from": 0, "to": 303.8, "params": { "hall": "all", "portal": false } }
```
- `from`〜`to` を 線路に そった アーチの 筒（はば 9 m・高さ 8 m、青白い こおりと 岩、1 本の メッシュ）で おおう。`hall`（区間の 中の `from`〜`to`、または `"all"`）は 筒を 作らない（こおりの ひろま `ice-hall` の 小物が ある 前提）
- `portal`（既定 true）: 入口と 出口に 石の アーチ `tunnel-portal`、出口の 先に 霧に かくれない 白い 光 `exit-glow`（中から 見える）
- くらさ: 先頭が 区間に いる あいだ、霧が `near`（2）・`far`（18）m、ライトが ついて いれば `lightFar`（60）m、色 `fogColor`（`#1c2433`）、光が `dim`（0.35）倍に なる（約 0.4 秒で なめらかに）。こな雪は 止まる
- ライトの 丸は 入口の `lightGlow`（60）m 手前から、ライトが 消えて いれば 光る（トンネルを 出るまで）。そこで `tunnelNear`（既定「トンネルだ！ ライトを つけよう」）を 1 回
- くらい だけで 失敗は ない。走る 音は `sound` 区間の `tunnel` で（書く）

### ゆきだるまの 見た目（判定は いまの まま）
- `cat` に `params.look: "snowman"`: 線路の ゆきだるま（`snowman`、ふみきりの 棒なし）。汽笛で ころころ よける。ぶつかりそうで 止まる 失敗は やわらかい
- `rock-roll` に `params.look: "snowman-upside"`: さかさ ゆきだるまが 左で ぐらぐら → ころころ わたって → 右の 雪の 上に ふつうの ゆきだるまに なって 立つ（海へ 落ちない）
- `rock-drop` に `params.look: "snowman"`（左の 土手から すべって きて 線路で 止まる）・`"snow-pile"`（木から 雪が 落ちて 山に なる）。ぶつかると「ぽすっ」、ぷるんと ゆれて よこに 立つ
- ゆきだるま（と `snow-wave`）の 小物を 寸劇で `move` すると、ころころ ゆれて 動く

### 小さな 足し
- `props[].reveal: "<分かれ道 id>"`: その 分かれ道が ライトで 見やぶられたら（`sign:reveal`）、小物の しるし（`fake-exit` の ぐるぐる）が 光る。巻き戻しで 消える。分かれ道は `signReversed`
- 失敗の 理由（`fail.reason`）に `snow`（やわらかい）
- 寸劇で 子どもが 汽笛を 押すまで まつ のは 3-3 の `{ "press": "whistle", "say": "…" }` を 使う（設計の `await` は 足して いない）
- 寸劇の モデル `amanojaku-blush`（てれた サカサ、ほっぺが ピンク）・`snow-wave-small`・`snowman-big`
```ts
type LineKey = /* v1.10 (4-3) */
  | 'chaseStart' | 'chaseNear' | 'chaseRocket' | 'chaseFar'
  | 'chaseCaught' | 'chaseCaughtAfter' | 'chaseTired' | 'chaseSafe'
  | 'tunnelNear';
```

### 読み込み時の 検査
- `chase`: `railId` が ある、`until` は 同じ 線路、`from < fence < until`、`until − fence ≥ 40`、`retry` は 1 つ 以上・小さい 順・`from − 30` 以降・線路の 中・坂の 中で ない、`paces` は `from < to`・`speed > 0`、`music` は 曲。`until` から その ステップの 駅の 停止ゾーンまで 60 m 以上。`countdown` と いっしょに 書かない
- `tunnel`: `hall` は 区間の 中か `"all"`、`dim` は 0〜1、`fogColor` は `#rrggbb`、線路の 中、中に 駅が ない
- `props[].reveal` は `signReversed` の 分かれ道。`cat.look` に `snowman`、`rock-roll.look` に `snowman-upside`、`rock-drop.look` に `rock`・`snowman`・`snow-pile`

### テスト用の しるし
`#app` の `data-chase`（`run`／`near`／`caught`／`safe`／空）、`data-chase-gap`（m、整数）、`data-chase-catches`、`data-tunnel`（先頭が トンネルの 中 1）、`#timer[data-mode="chase"]`

## 18. v1.11 の追加（5-1「よるのもり」の しくみ: 夜・しーっ・さかさ きてき・ほたる、2026-09-30 PR2c）
`schemaVersion` は 1 の まま、ぜんぶ 省略可。設計は `docs/PHASE9_CHAPTER5_6.md` 第 4 部 §4（§0 の 決まりと `docs/PHASE9_0_FREE_ABILITIES.md` が 先に きく）。実例は ためしの ステージ `src/stages/0-1.json`（てすとの よる、`hidden: true`・`chapter: 0`。`scripts/layout-0-1.mjs` が 作る。JSON を 手で 直さない）。5-1 そのものは PR3。全ステージ共通の 数は `src/train/params.ts` の `NIGHT`・`HUSH`・`GLARE`・`LURE`・`FIREFLY_FORK`・`AMBIENT_FIREFLIES`。

### 夜（`environment.lighting: "night"`・`moon`・`fireflies`）
```json
"environment": { "sky": { "top": "#141c46", "bottom": "#3d3f7e" }, "fog": { "color": "#2a3566", "near": 60, "far": 260 },
                 "lighting": "night", "ground": { "y": 0, "size": 4000, "color": "#2f4a3a" },
                 "stars": { "count": 400 }, "moon": { "azimuth": 20, "elevation": 32, "size": 1 },
                 "fireflies": { "count": 160, "radius": 60 }, "ambience": "night" }
```
- 光: 半球光（空 `#b8c6ff`・地面 `#34406a`・0.85）＋ 月の 平行光（`#dfe7ff`・0.62、`moon` の 向きから）。昼の 70%（くらく しすぎない）
- `moon`: 空に うすい 黄色の 円板と ぼんやりした 光の 輪（顔なし、描く 回数 1、霧なし、空の ドームに のる ので 水の 中では 見えない）。`azimuth`（0〜360°、+Z から +X へ）・`elevation`（5〜80°）・`size`（0.5〜3 倍）
- `fireflies`: カメラの まわり `radius`（60）m に `count`（0〜400）この 黄みどりの 点が ふわふわ・ぽわっと 光る（`Points` 1 つ、描く 回数 1）
- 夜は 客車の まどが あたたかく 光る。ライトの 光の すじは こく しない かわりに、先へ いくほど うすれて きえ、カメラの 目より 高い ところは 描かない（運転席から 見ると ランプの 近くが 空に 三角に 見えるので。暗い 空に 明るい 三角が 出ない。昼の すじは 前の まま）。見た目の 環境は `EnvironmentState`（TECH_SPEC）

### 昼 ⇄ 夜（寸劇の `environment`）
```json
{ "environment": { "lighting": "night", "sky": { … }, "fog": { … }, "moon": { … }, "fireflies": { … }, "ambience": "night" }, "seconds": 1.2 }
{ "environment": {}, "seconds": 1.2 }
```
- ステージの `environment` に、書いた 欄 だけ 上書きした 見た目に かわる（6-2 の 区画の `environment` と 同じ 考え）。`{}` で ステージの もとの 見た目に もどる。その あとは ステージの おわりまで その まま（しっぱいの 巻き戻しでも かわらない）
- `seconds`（既定 1.2）: うすい 夜空色の フェード（`#look-fade`）の うしろで かわる。0 なら すぐ。▶▶・つづき では すぐ かわる
- かえる 欄: `sky`・`fog`・`lighting`・`ground`・`stars`・`moon`・`fireflies`・`ambience`（曲 `bgm`・しっぱいの 色 `fall`・走る 音 `surface` は かわらない）。`water`・`snow`・`festival`・`cloudSea` は ステージの もの なので 書かない（検査）
- 0-1 は 入りで 昼 → 夜、出で 夜 → 昼

### しーっ の ばしょ（`gimmicks[]` の `hush`）
```json
{ "type": "hush", "railId": "main", "from": 470, "to": 650,
  "params": { "id": "harappa-1", "glowBefore": 70, "startleAfter": 0.8, "rewind": { "railId": "main", "at": 400 }, "sign": true,
              "line": "つきの はらっぱ… みんな ねてる" } }
```
- 先頭が `from − glowBefore`〜`to` に いる あいだ、ライトと きてきの 丸の 右上に「しーっ」の しるし（三日月と ZZZ、`data-mark="hush"`）。**しるしは ヒント だけ**（押せば いつもどおり 働く。きてきも 鳴る。PHASE9_0 §6）
- ライトが ついて いれば ライトの 丸が うすい 夜空色に 光る（`data-glow="1"`・`data-glow-for="dim"` ＝ 押すと けす）
- `line`（なければ `hushNear`）を `from − glowBefore` で、ライトが ついて いれば つづけて `hushLightOff`
- **びっくり**: 区間の 中で ライトが ついて いた 時間の 合計が `startleAfter` 秒を こえるか、きてきを 鳴らすと、ねて いる もの（`props[].sleeper`・`records[].hush`）が 巣に もぐる（0.4 秒）。`hushStartle`。**しっぱいでは ない**。巻き戻しで また ねて いる
- かくれさせずに `to` を こえたら `hushQuiet`（ステージで 1 回）
- `sign`（既定 true）: `sign-hush`（こん色の 板に 三日月と ZZZ）を `from − 8`・左に 自動で 立てる。`rewind`（既定 `from − 70`）: こじかの しっぱいの 戻り先
- ロケットの おやすみは いまの `rocket`（`allow: false`・`icon: "sleep"`）を 同じ 所に 書く

### こじか（`actors[]` の `dino-small` に `look: "fawn"`・`glare: true`）
```json
{ "id": "kojika-1", "type": "dino-small", "reactsTo": "light", "onRail": { "railId": "main", "at": 610 }, "rotationY": -90,
  "params": { "look": "fawn", "glare": true, "startDistance": 100, "crossSeconds": 3, "dangerDistance": 12, "lateral": 7 } }
```
- ふだんは 子恐竜と 同じに わたる。わたる 前か とちゅうで ライトが ついて いると、線路の まんなかで 止まって ライトに **みとれる**（`glareFreeze`→`glareFreezeAfter`）。けすと 0.2 秒 ぱちぱち → 0.6 秒で ぴょんと どく（`glareFree`）
- みとれて いる あいだに 先頭が `dangerDistance` まで 来ると 電車が 止まり、こじかは ぴょーんと かけて いく。**失敗の 理由 `glare`（やわらかい）**。`glareBump`→`glareBumpAfter` → その `hush` の `rewind`
- **たすけ**: 同じ `hush` で `glare` が 2 回 つづくと（`HUSH.mercyAfter`）、3 回めは ライトが ついて いても わたる（`glareMercy`）。`to` を こえると 数えなおし
- `rotationY: -90` で 顔を わたる 向きに（仮の 形は +Z が 前）

### さかさ きてき（`gimmicks[]` の `whistle-reversed`）と こだぬき（`actors[]` の `lure`）
```json
{ "type": "whistle-reversed", "railId": "main", "from": 1480, "to": 1680,
  "params": { "id": "sakasa-kiteki", "sign": true, "line": "たぬきの ふだ… さかさ きてき？", "rewind": { "railId": "main", "at": 1420 } } }
{ "id": "tanuki-a", "type": "lure", "reactsTo": "whistle", "onRail": { "railId": "main", "at": 1560, "lateral": -6 },
  "params": { "look": "tanuki", "count": 3 } }
```
- 区間の 中は きてきの 丸に しーっ の しるし、**きてきは 光らない**。`line`（なければ `reversedNear`）を `from − 60` で、`reversedIn` を `from` で
- **鳴らすと**: きてきは 鳴る（さかさの 音「…っぴー」）。区間の 中で 前に いる むれの うち、とまれる きょり（v² ÷ 6 ＋ 2v ＋ 8 m）より 遠い むれが 自分の `at` の 線路へ よってきて（0.8 秒）5 秒 おどる（`lureCome`、レバーの「とまる」が 光る）。近い むれは やぶで はねる だけ。おどって いる あいだに また 鳴らすと 1 秒 のびる（8 秒まで）。むれは 1 回の ためしに 1 回だけ 線路へ
- とまって まてば しっぱい なし（おどり おわって かえる とき 止まって いれば `lureBye`）。おどって いる むれに 8 m まで 近づくと 止まって **失敗の 理由 `lure`（やわらかい）**、`lureBump`→`lureBumpAfter` → `rewind`（既定 `from − 60`）
- **たすけ**: 同じ 区間で `lure` が 2 回 つづくと、3 回めは やぶで おどる だけ（`lureMercy`）
- 鳴らさずに `to` を こえたら `reversedQuiet`（ミッションで 1 回）
- `sign`（既定 true）: `sign-whistle-reversed`（おどる たぬきの かげと 三日月・ZZZ）を `from − 10`・左に 自動で。`lure` の params: `count`（1〜4）・`dance`・`danceMax`・`dangerDistance`・`reaction`・`margin`

### ほたるの 分かれ道（`junctions[].fireflies`）
```json
{ "id": "hotaru-1", "railId": "main", "at": 2180, "left": "main", "right": "kurai1", "default": "right",
  "fireflies": { "callFrom": 100, "callTo": 15 } }
{ "id": "hotaru-3", "railId": "main", "at": 2500, "left": "main", "right": "kurai3", "default": "right",
  "signReversed": true, "fireflies": { "fake": true } }
```
- **ほんとうの 道 ＝ `default` で ない 側**。分かれ道の 10〜30 m 手前の 左右の 草むら（`firefly-grass`、ローダーが 置く）に とまって いる ほたるが 光る。ふつうの ほたるの 分かれ道には 標識を 立てない
- 先頭から 分かれ道までが `callTo`〜`callFrom`（15〜100 m）の あいだ、きてきが 光る（`fireflyNear`）。鳴らすと `count`（24）この ほたるが とびたち、ほんとうの 側の 80 m に ならぶ。その 側の 矢印が 光り、進路も その 側に（`fireflyCall`、矢印を 押せば かえられる）。1 回の ためしに 1 回
- 鳴らさずに `default` へ 行くと いまの いきどまり（`deadEnd`、やわらかい）→ 80 m 手前。もう 一度 近づくと `fireflyAgain`
- `fake: true`（にせの ひかり、`signReversed` が 要る）: うその 側に `props[].reveal` の `fake-lantern`（ピンクの ちょうちん）。**見やぶるまで きてきは 光らない**（ライトが きえて いれば 80 m 手前から ライトの 丸が 光る）。鳴らすと ほたるは まよう（`fireflyConfused`／ライトが ついて いれば `fireflyConfusedLit`）。ライトで 40 m に 入ると ちょうちんが「ぽしゅん」と きえ、ほたるは ほんとうの 側へ（`fakeRevealed`）

### 小さな 足し
- `cat` に `params.look: "hedgehog"`（線路の はりねずみ。汽笛で まるまって ころころ。ぶつかりそうは やわらかい）、`params.glow: true`（`wakeDistance`〜`dangerDistance` の あいだ、まだ どいて いなければ きてきが 光る）
- `records[].hush: true`: その `hush` が びっくりした ためしの あいだは 見つからない（モデルも かくれる）。`props[].sleeper: true`: `hush` の 中の ねて いる 小物（かくれる）
- `missions[].hints[].unless: "<能力>"`: その 能力を もって いれば 言わない（あとの 能力の 記録の なぞかけ）
- 失敗の 理由（`fail.reason`）に `glare`・`lure`（どちらも やわらかい）
```ts
type LineKey = /* v1.11 (5-1) */
  | 'hushNear' | 'hushLightOff' | 'hushStartle' | 'hushQuiet'
  | 'glareFreeze' | 'glareFreezeAfter' | 'glareFree' | 'glareMercy' | 'glareBump' | 'glareBumpAfter'
  | 'lureMercy' | 'reversedNear' | 'reversedIn' | 'lureCome' | 'lureBye' | 'lureBump' | 'lureBumpAfter' | 'reversedQuiet'
  | 'fireflyNear' | 'fireflyCall' | 'fireflyAgain' | 'fireflyFakeNear' | 'fireflyConfused' | 'fireflyConfusedLit' | 'fakeRevealed';
```

### 読み込み時の 検査（`validate.ts` の 形の 検査 ＋ `validateNightLayout`）
- 形: `moon`（`azimuth` 0〜360・`elevation` 5〜80・`size` 0.5〜3）、`fireflies`（`count` 0〜400 の 整数・`radius` > 0）。`hush`・`whistle-reversed` は 線路・`from < to`・`params.id`（ステージで ひとつ）、`glowBefore` 0〜80・`startleAfter` > 0。`lure` は onRail・`reactsTo: "whistle"`・`count` 1〜4。`fireflies` は 左右 両方・`callFrom > callTo ≥ 6`・`count` 1〜64・`needs`／`dive`／`bubbles` と いっしょに しない・`fake` なら `signReversed`（`fake` で なければ なし）・うその 側は いきどまりか 手前に もどる わ。`glare` は `look: "fawn"` だけ。`hints[].unless` は 能力。寸劇の `environment` は 形の 検査（`water` など ステージの 欄は 書かない）
- `hush`（`from − glowBefore − 20`〜`to`）: 霧・トンネル・`signReversed`／`bubbles`／`fireflies` の 分かれ道（その 80 m 先まで）・かがみ・花の はし・ジャンプだい・`whistle-reversed`・ライトの 記録・`trace`／`reveal` の 小物・駅の 停止ゾーン・切れ目・水・雪の かべ が ない。`rewind` は `from` より 手前で 霧・トンネルの 外
- こじか（`glare`）: どれかの `hush` の 中（`at + 10 ≤ to`）、`at − startDistance ≥ from`、`startDistance − 22 × crossSeconds ≥ dangerDistance + 20`（ライトを けして いれば びゅーんでも 先に わたり おわる）
- `records[].hush` は どれかの `hush` の 中
- `whistle-reversed`（`from − 20`〜`to + 10`）: ねこ・`dino-mid`・リス・くじら・汽笛の バッタ・ジャンプだい・ほたるの よべる 所・駅・水・`hush` が ない。`rewind` は `from` より 手前。`lure` は どれかの 区間の 中で `at ≥ from + 40`
- ほたるの よべる 所（`at − callFrom`〜`at − callTo`）どうしが かさならない
- わざと まちがえた 形は `tests/stages-bad/night-*.json`（`scripts/check-stages.mjs` が はじかれる ことを たしかめる）

### テスト用の しるし
`#app` の `data-lighting`（`day`／`evening`／`night`）・`data-look-changes`（寸劇で 見た目が かわった 回数）・`data-hush`（空／`near`／`in`／`startled`）・`data-hush-startles`・`data-fawns`（`kojika:wait`、`wait`／`cross`／`freeze`／`gone`）・`data-glare-freezes`・`data-reversed`（1）・`data-lure`（空／`come`／`dance`）・`data-lure-calls`・`data-lure-dances`・`data-fireflies`（`hotaru:home`、`sleep`／`home`／`lost`）・`data-firefly-calls`・`data-fake-out`（この ためしで 見やぶった にせの 分かれ道）・`data-fail-reason`・`data-fails`（数は ふえる だけ）。`#light[data-mark="hush"]`・`#light[data-glow-for]`（`light`／`dim`）・`#whistle[data-mark="hush"]`。できごと: `hush:near`・`hush:startle`・`hush:quiet`・`glare:freeze`・`glare:free`・`lure`・`lure:come`・`lure:bye`・`fireflies:call`・`fireflies:home`・`fireflies:lost`・`fireflies:away`・`fake:out`・`environment`

## 19. v1.11 の追加（5-2「おもちゃのまち」: ぜんまい・がくたい・くるくる ポイント、2026-09-30 PR4）
`schemaVersion` は 1 の まま、ぜんぶ 省略可。設計は `docs/PHASE9_CHAPTER5_6.md` 第 5 部 §4（§0 の 決まりと `docs/PHASE9_0_FREE_ABILITIES.md` が 先に きく: きてきが 光るのは ヒント。光って いない ときに 鳴らしても 何も かわらない）。実例は `src/stages/5-2.json`（`scripts/layout-5-2.mjs`）と ためしの ステージ `src/stages/0-2.json`（てすとの おもちゃ、`hidden: true`・`chapter: 0`、`scripts/layout-0-2.mjs`）。JSON を 手で 直さない。全ステージ共通の 数は `src/train/params.ts` の `WINDUP`・`PARADE`・`SPIN`。

### ぎゃくまきの おもちゃ（`actors[]` の `cat` に `look: "windup-chick"`／`"windup-car"`・`walk`・`glow`）
```json
{ "id": "hiyoko", "type": "cat", "reactsTo": "whistle", "onRail": { "railId": "main", "at": 220, "heightFromRail": 0 },
  "params": { "look": "windup-chick", "wakeDistance": 70, "dangerDistance": 8, "fleeLateral": 5, "fleeSeconds": 1.5,
              "walk": { "speed": 0.8, "max": 10 }, "glow": true,
              "say": "ひよこさんが うしろあるき！ きてき！", "woke": "くるりん！ まえむきに なった！",
              "danger": "わわっ、ひよこさん！", "after": "ひかったら きてきで まきなおそう" } }
```
- 判定は いまの `cat`（きてきで どく、近づきすぎると 止まる）の まま。形は `-back`（うしろに かたむき、ねじに ピンクの ぐるぐる）→ まきなおすと `-back` なしへ。ねじが `WINDUP.keySeconds`（0.8 秒）まわってから よこへ ぴょん
- `walk`: 先頭が `from`（既定 `WINDUP.walkFrom` 150）m まで 来たら `speed` m/s で でんしゃの 方へ `max` m まで うしろあるき（おきる・あぶない の 距離は いまの 位置で）。`windup-car` は `walk` なし
- `glow: true`: まだ まいて いない あいだ、先頭が `dangerDistance`〜`wakeDistance` m で きてきが 光る（いまの ねこ・うみどりは 光らない）
- 近づきすぎは **やわらかい**（しずみ 0.3・ゆれ 0。おもちゃは その場で かたかた）。戻り先は 置いた 所の 80 m 手前
- 1 回の きてきで `wakeDistance` の 中の おもちゃ ぜんぶが まきなおる（3 ば の ときは 手前の 1 ぱ だけに `say`・`woke`）

### がくたいの パレード（`actors[]` の `parade`）
```json
{ "id": "gakutai", "type": "parade", "reactsTo": "whistle", "onRail": { "railId": "main", "at": 1540, "heightFromRail": 0 },
  "params": { "members": ["band-drum", "band-cymbal", "band-glock", "band-trumpet", "band-flag"],
              "back": { "from": 150, "speed": 1.0, "min": 1500 }, "speed": 5, "gap": 14, "exit": 1660, "exitSide": "left" } }
```
- `onRail.at` は しっぽ（いちばん うしろ）。`members` は しっぽから まえへ 1〜6 人、`spacing`（3）m おき
- ようす: `idle`（まいて いない）→ `back`（先頭が しっぽの `back.from` m で うしろあるき、しっぽが `back.min` か 先頭まで `gap + 4` m で とまる）→ `turn`（きてきで まきなおし 1.2 秒）→ `march`（`speed` m/s）⇄ `wait`（先頭との 間が `waitGap` 40 m より ひらくと あしぶみ、35 m で また あるく）→ `exit`（あたまが `exit` で 1 人ずつ `exitSide` の ひろばへ 2.4 秒）→ `gone`（ひろばで えんそう）
- **でんしゃを おさえる**（しっぱい では ない）: `gone` まで、めざす 速さを √(v² ＋ 2 × 2.5 × (d − gap)) より 上に しない（d ＝ 先頭から しっぽまで、v ＝ `march` なら `speed`、ほかは 0）。`march` の あいだは さらに v ＋ 0.3 ＋ 0.03 × (d − gap) まで（うしろから 追いつく とき 5.6 m/s を こえない）。`gap − 2` より 近いと 0。ロケットで 追いつくと「ぷしゅっ」と きれる
- きてき: `idle`・`back` で 先頭が `callRange`（90）〜 8 m の あいだ 光る → 押すと `turn`。`march`・`wait` で 押すと 「ぱっぱかぱーん！」と こたえる だけ
- `march`・`wait` で 先頭が しっぽの 40 m 以内の あいだ、レバーの「ゆっくり」が 光る
- 巻き戻しで 戻り先が `exit` より 先なら `gone` の まま、手前なら `idle` に もどる。つづき（あとの ミッション）は `gone`

### くるくる ポイント（`junctions[].spin`）
```json
{ "id": "kuru-1", "railId": "main", "at": 2080, "left": "main", "right": "kuru-wa1", "default": "left",
  "spin": { "good": "left", "stay": 4, "turn": 1, "range": 120, "line": "くるくる ポイント！ よく みてね" } }
```
- **矢印は 出ない**（はたと きてきの 光 だけが 合図）。`#junction[data-spin]` に id
- ねて いる あいだは `good` で ない 側。先頭が `range` m まで 来ると `line` を 言って まわりだす（**いつも ちがう 側の `stay` 秒から**。同じ 運転なら 同じ 結果）: `stay` 秒 → `turn` 秒で くるっ → いい ほうで `stay` 秒 → …
- いい ほうを むいて いる あいだ、先頭が `range`〜12 m なら きてきが 光る（`spinCall`）。押すと そこで とまり（`spinStop`）、その ステージの あいだ ずっと いい ほう。**光って いない ときの きてきでは とまらない**
- 通る 向きは 先頭が `at − 5` に ついた ときの 向き（まわる とちゅうは 半分 すぎた 側）。先頭が 40 m 先へ 行くまで その 向き
- ちがう 側は ループ（`end.merge` で 同じ 線路の `at` より 手前へ もどる。しっぱい では ない。`hints` で ループの 中の ことば）。1 回 ループを 通ると、つぎは いい ほうで まって いて きてきは ずっと 光る（押さなくても いい ほう）
- `signReversed`・`needs`・`dive`・`bubbles`・`fireflies` と いっしょに 書かない。`stay` 2〜8、`turn` 0.5〜2、`range` 80〜200

### 寸劇で まきなおす（`press` の `fx: "windup"` と `target`）
```json
{ "spawn": "tut-chick", "model": "windup-chick-back", "onRail": { "railId": "main", "at": 30, "lateral": -4.5, "heightFromRail": 1 } },
{ "press": "whistle", "say": "きてきを ならして みて！", "fx": "windup", "target": "tut-chick" }
```
- きてきの 丸だけ 光って まつ（いまの `press`）。押すと `target` の 形が `-back` なしに かわる。`target` が `castle-key-back`（おしろの おおぜんまい）なら、`props[].windup` の かざりの おもちゃ ぜんぶが まえむきに なる（`#app[data-town="wound"]`）
- ▶▶・つづき: 形の いれかえと `data-town` だけ 入る
- `target` は その 寸劇で 前に `spawn` した id（まだ `remove` して いない）で、モデル名が `-back` で おわる

### 小さな 足し
- `environment.fall: "balls"`: すきまの 下の ボールプール。おちると「ぼよよん… ぽふっ」、ボールが はねて ももいろ `#ffe0f0` に ふわっと。**やわらかい**（しずみ 0.3・ゆれ 0）。ボールプールは `props` の `ball-pit`、すきまは `pit: false`
- `rails[].base` の `look: "blocks"`: 線路の 下の パステルの つみき（`skip` で 下の 線路を こえる 所を あける）
- `slope` の `params.look: "slide"`（`pull > 0` の とき だけ）: すべりだい。ピンクの てすり、入口の 札 `sign-slide-toy`
- `tunnel` の `params.look: "toybox"`: 四角い はこの 中（クリーム色の かべに うすい しま、ほしの シールが ぼんやり 光る）、口は ふたの あいた はこ `toybox-lid`。既定は `"ice"`（4-3 の まま）
- `environment.ground.look: "playmat"`: 地面が パステルの ます目（4 m、シェーダで 色を かえる だけ）
- `props[].windup: true`: かざりの ぎゃくまきの おもちゃ（モデルは `-back` で おわる）。町の おおぜんまいで まえむきに
- 失敗の 理由は ふえない（おもちゃ ＝ `cat` の やわらかい、ボールプール ＝ `fellShort`／`fellNoJump` の やわらかい）
```ts
type LineKey = /* v1.11 (5-2) */ 'spinCall' | 'spinStop' | 'paradeNear' | 'paradeCall' | 'paradeTurn' | 'paradeFollow' | 'paradeMatch' | 'paradeWait' | 'paradeBye';
```
- 既定: `spinCall`「こっちを むいた！ いま きてき！」・`spinStop`「ぴたっ！ とまった！」・`paradeCall`「がくたいさんを きてきで まきなおそう」（光った とき、おさえられて 止まって いる あいだ 8 秒ごと）・`paradeTurn`「くるりん！ ぱっぱかぱーん！」・`paradeFollow`「パレードだ！ ゆっくり ついていこう」・`paradeMatch`「ぴったり！ パレードの なかまだ！」（「ゆっくり」で 3 秒）・`paradeWait`「がくたいさんが まってるよ！」（うしろで 6 秒 とまる）・`paradeBye`「ありがとう〜 がくたいさん！」。`paradeNear`（130 m）は 書いた とき だけ

### 読み込み時の 検査（`validate.ts` の 形の 検査 ＋ `validateToyLayout`）
- 形: `cat` の `look` と `walk`（`speed` 0.2〜2・`max` 0〜20・`from` は `wakeDistance` より 大きい）。`parade` は onRail・`reactsTo: "whistle"`・`members` 1〜6・`speed` 2〜8・`gap` 8〜30・`callRange` は `back.from` より 小さく `gap + 4` より 大きい・`back.min` ≤ `at`・`exit` は あたまより 先・`exitSide`。`spin` は 上の とおり。`press` の `fx` は `beacon`／`windup`（`windup` は `target` が 要る）。`fall` に `balls`、`base.look` に `blocks`、`slope.look` は `slide`、`tunnel.look` は `ice`／`toybox`、`ground.look` は `playmat`、`props[].windup`（モデルは `-back`）
- おもちゃの あるく 道（`at − max − dangerDistance − 20`〜`at`）: 切れ目・分かれ道・合流・坂・駅の 停止ゾーン なし
- パレードの 道（`back.min − gap − 60`〜`exit + 40`）: 切れ目・ジャンプだい・坂・分かれ道・合流・駅の 停止ゾーン・ほかの 線路の 上の 役者・水・雪の かべ・`chase` の 区間 なし（パレードの 最中に しっぱいが おきない）。1 つの 線路に パレードは 1 つ
- くるくる ポイント（`at − 80`〜`at + 70`）: 切れ目・坂・ほかの 分かれ道・駅の 停止ゾーン なし（ループの 合流は よい）。`spin` どうしは `range + 60` m 以上
- きてきの 窓（光る 所）が かさならない: おもちゃ `[at − max − wakeDistance, at − dangerDistance]`（12 m 以内に ならぶ おもちゃは 1 つの むれ）、がくたい `[back.min − callRange, at − 8]`、くるくる ポイント `[at − range, at − 12]`、ジャンプだい、くじら
- わざと まちがえた 形は `tests/stages-bad/toy-*.json`

### テスト用の しるし
`#app` の `data-windups`（まきなおした 数の 合計: おもちゃ・がくたい・ポイント・寸劇。ふえる だけ）・`data-actors`（`hiyoko:sleep|walk|awake|stopped`）・`data-parade`（`idle`／`back`／`turn`／`march`／`wait`／`exit`／`gone`）・`data-parade-gap`（m）・`data-parade-held`（1: でんしゃが おさえられて いる）・`data-spins`（`kuru-1:sleep,kuru-2:stay-good`。`sleep`／`stay-good`／`stay-other`／`turn`／`hold`／`fixed`／`mercy`）・`data-spin-taken`（`kuru-1:loop,kuru-1:good`、ふえる だけ）・`data-town`（`wound`）。`#junction[data-spin]`。できごと: `windup`・`parade`・`parade:fanfare`・`spin`・`spin:taken`

## 20. v1.11 の追加（じしゃくライト `magnetLight` の しくみ、2026-09-30 PR5）
`schemaVersion` は 1 の まま、ぜんぶ 省略可。設計は `docs/PHASE9_CHAPTER5_6.md` 第 2 部（`docs/PHASE9_0_FREE_ABILITIES.md` が 先に きく: 覚えた わざは いつでも どこでも。光るのは ヒント だけ）。実例は テストコース `src/stages/0-0.json` の わき道 `jishaku`（手で 書いた）と ためしの ステージ `src/stages/0-4.json`（てすとの じしゃく、`hidden: true`・`chapter: 0`、`scripts/layout-0-4.mjs`。JSON を 手で 直さない）。全ステージ共通の 数は `src/train/params.ts` の `MAGNET`・`IRON_PROPS`。

### ライトの ボタンの 3 段（しくみ。JSON には 書かない）
- 押す たびに **ライト → じしゃく → けす**（じしゃくライトを 覚える 前は いまの まま ライト ⇄ けす）。0.4 秒 まち（`LIGHT.cooldown`）。ボタンが 見せるのは 子どもが えらんだ 段 だけ（`#light[data-light]`）。場所で 顔は かわらない
- じしゃくの 段は ライトの しかけ（霧・トンネル・かがみ・逆標識・しーっ・`requires: "light"` の 記録）には **「ライト なし」**。光の すじは うすい みどり、霧・夜・トンネルで 見える きょりは ライトの 半分だけ のびる
- 減速: ライトと じしゃくの 段は 0.7 倍、**ひっぱって いる あいだ（2 秒 まで）だけ 0.5 倍**（`Train.speedCaps`、TECH_SPEC §2）
- テストコース 0-0 は じしゃくライトも 持って いる（ライトが 3 段）

### じしゃくの まと（`gimmicks[]` の `magnet`）
```json
{ "type": "magnet", "railId": "jishaku", "from": 90,
  "params": { "id": "hoshi", "kind": "pick", "look": "star", "lateral": 7, "height": 3, "line": "また てつの ほし！" } }
{ "type": "magnet", "railId": "jishaku", "from": 200, "to": 208,
  "params": { "id": "hanare", "kind": "bridge", "look": "rail-piece", "piece": { "lateral": -9, "height": 0, "rotationY": 60 },
              "line": "レールが はなれてる！ ひっぱろう！", "done": "つながった！", "rewind": { "railId": "jishaku", "at": 140 } } }
{ "type": "magnet", "railId": "jishaku", "from": 380, "params": { "id": "tobira", "kind": "gate", "look": "door", "done": "あいた！" } }
{ "type": "magnet", "railId": "main", "from": 980,
  "params": { "id": "kurutto", "kind": "turn", "look": "mirror", "lateral": -12, "height": 4, "junction": "usono", "mirror": "m-turn",
              "line": "そっぽの かがみ！ じしゃくで くるっ！", "done": "くるっ！ ほんとうの みちが みえた！", "miss": "かがみが そっぽ… うその みち！" } }
```
| `kind` | `look` | `from` | じしゃくの 段で 近づくと | じしゃく なしで 着くと |
|---|---|---|---|---|
| `pick` | `star`・`bell` | ものの 位置 | 電車へ とんで きて「かちっ… ぽん」、ふわっと もとの 場所へ もどる | 何も おきない |
| `bridge` | `rail-piece`・`drawbridge`（6-1 まで `rail-piece` の 形）・`toy-blocks` | すきまの はじまり（`to` が おわり、4〜16 m） | かけらが とんで きて はまる | しゃぼんの まくで「ぽよん」→ `rewind`（既定 60 m 手前、来た 道に そって） |
| `gate` | `door`・`crossing` | とびらの 面（`to` は 書かない） | よこへ ひらく（ふみきりは なおる） | まるい クッションで「ぽよん」→ `rewind` |
| `turn` | `mirror` | かがみの 位置 | こちらを むき、`junction` の ほんとうの 道が 見える（`sign:reveal`、ほんとうの 道を 自動で えらぶ） | うその 道（いきどまり） |
- **じしゃくの 段の とき だけ**、前 50 m（`MAGNET.reach`）の まとを 近い 順に 1 つずつ **自動で** ひっぱる（押すのは 段を かえる とき だけ）。`pick`・`turn` は `minAhead`（4 m か 線路からの はなれ √(横² ＋ 高さ²) の 大きい 方）〜 50 m、`bridge`・`gate` は 面まで 0〜50 m。とぶ 時間 0.6 ＋ きょり ÷ 40 秒（0.8〜2 秒）。**`bridge`・`gate`・`turn` は ひっぱりはじめた しゅんかんに ひらいた と 数える**（見た目は 早回し）
- **光る**（ヒント）: まとの 80 m 手前（`hintAhead`）から、じしゃくライトを 持って いて いまが じしゃくで ない とき ライトの ボタンが みどりに 光る（`data-glow-for="magnet"`。ライトの 黄色・しーっ の 光より 先）。止まる 駅の 80 m 手前〜停止線の あいだ、`pick` では 光らない。見つけた 記録では 光らない（ひっぱれば きらきら だけ）
- 1 つの まとは 1 回 とおる あいだに 1 回（`pick` は 巻き戻し・やりなおしで また）。ひらいた すきま・とびら・かがみは その ステージを やりなおすまで ひらいた まま（しっぱいで 戻っても）
- `line`: この まとで みどりに 光りはじめた とき（もう じしゃくの 段でも 同じ 所で）1 回の ためしに 1 回。ほかの せりふが 出て いない ときだけ（`sayIfQuiet`。光る 所の 前半の あいだ まつ）。`done`: とどいた・ひらいた とき（既定 `bridge`「つながった！」・`gate`「あいた！」）。`miss`（`turn`）: じしゃく なしで 分かれ道を すぎた とき
- `turn` の 分かれ道（`junction`、`signReversed`）は **矢印を 出さない**・ライトでは 見やぶれない・まちがえた あとの ライトの 黄色の 光も ない（ローダーが `JunctionDef.turn` を つける。手で 書かない）。`mirror`（書けば）: まわす `mirror` の `params.id`（5-3 の かがみ、PR6a）。書かない ときは 仮の かがみ `turn-mirror-small` を 描いて それを まわす
- `model`: 形を かえる とき。既定は `star` → `iron-star-small`、`bell` → `iron-bell-small`、`rail-piece` → すきまと 同じ 線路、`door` → `iron-door`、`crossing` → `crossing-bar-iron`、`mirror` → `turn-mirror-small`（5-3 の かがみの うらの `turn-mirror` とは べつ）、`toy-blocks` → `toy-blocks-loose`
- `lever`（かぎの ポイント）は 作らない（版 2 の 候補。書くと はじく）

### 記録（`requires: "magnetLight"`）
| `requires` | 見つかる とき |
|---|---|
| `"magnetLight"`（v1.11） | じしゃくで ひっぱって 電車に とどいた とき（25 m の きまりは 使わない。とちゅうで しっぱい・寸劇・おわりが 来ても その しゅんかんに 見つかる） |
- ローダーが `pick` の まと（id `record:<記録の id>`）に する（書かなくて よい）。`hint` は その まとの `line`（光りはじめの ひとこと）
- `onRail` で 置く（`position` は だめ）、線路から 20 m 以内

### どこでも の 小物（`environment.ironProps`・`props[].iron`）
```json
"environment": { "ironProps": { "every": 200, "looks": ["bell", "bucket"] } }
"props": [ { "model": "sign-bell", "onRail": { "railId": "jishaku", "at": 450, "lateral": 5 }, "iron": "bell" } ]
```
- ローダーが **ぜんぶの ステージ**の 線路ぎわに ばらまく（`IRON_PROPS.every` 140 m ごと ± 40、ステージ id から きまる たねで いつも 同じ、よこ 3.5〜6 m・左右 かわりばんこ、あきかん 5・バケツ 3・かんばんの ベル 2、1 ステージ 40 こ まで）。置かない 所: 駅の 停止線の 前後 60 m、切れ目の 前後 40 m、水の 区間、雪の かべ、まとの 前後 60 m、分かれ道・合流の 前後 30 m、地面から 1.5 m より 高い 線路、`mirror-flip` の 中。地面の ない ステージには ない
- **じしゃくライトを 覚えるまで 描かない・うごかない**（1-1〜5-2 の 見た目は かわらない）
- じしゃくの 段で、ひっぱって いる まとが ない とき、前 3〜25 m・よこ 7 m 以内の いちばん 近い 1 つが「びよん」と 先頭車の 前の 下の すみに くっつき、2 秒で「からん」と 落ちて ころころ（ベルは のびて もどる。はずれない）。1 つずつ、1 回の ためしに 1 回。しっぱい・記録・減速なし
- `ironProps`: `false`（ばらまかない）か `{ every?: 80〜400, looks?: ("can" | "bucket" | "bell")[] }`。`props[].iron`: その 置物を 小物に する（`onRail`、線路から 2〜12 m。`can`・`bucket` と モデル `sign-bell` の `bell` は 小物の 絵で 描く。ほかの モデルの `bell` は 置物に ベルが つく）

### 寸劇で じしゃくを ためす（`press: "magnet"`）
```json
{ "spawn": "tut-star", "model": "iron-star-small", "onRail": { "railId": "main", "at": 85, "lateral": 7, "heightFromRail": 3 } },
{ "press": "magnet", "target": "tut-star", "say": "もう いちど おすと じしゃく！" }
```
- 段を `light` に して ライトの ボタンを みどりに 光らせて まつ。押すと じしゃくの 段に なり、`target` が 電車へ とんで きて 消える（「きゅいーん… かちっ… ぽん」）。ほかの ボタンは 何も しない
- ▶▶・つづき: `target` が 消える だけ。▶▶ で とばすと 段は `off` に もどる
- `target` は その 寸劇で 前に `spawn` した id（まだ `remove` して いない）。`fx` は 書かない

### 小さな 足し・せりふ
- 失敗の 理由 `magnet`（**やわらかい**: しずみ 0.3・ゆれ 0、音は「ぽよん ぷるん」）。ジャンプの ボタンは 灰色に しない（とべば とぶ。まく・とびらは 高さ 6 m なので とんで ぶつかっても ぽよん）。テストコース（ミッション なし）は フェードして 戻す だけ
- 分かれ道の `needs: "magnetLight"`: 矢印に じしゃくの 絵、`needAbility` の 既定「じしゃくライトが あれば いけそう…」
```ts
type LineKey = /* v1.11 (PR5) */ 'magnetNear' | 'magnetGo' | 'magnetBump' | 'magnetBumpAfter' | 'magnetPlay';
```
- 既定: `magnetNear`「てつの ものだ！ じしゃくに しよう！」（ミッションで はじめて 光った とき、まとの `line` が なければ）・`magnetGo`「きゅいーん… くっついた！」（はじめて とどいた とき）・`magnetBump`「ぽよん！ レールが たりない〜」（`gate` は「ぽよん！ とびらが しまってた〜」）・`magnetBumpAfter`「ひかったら じしゃくに してね」・`magnetPlay`「びよん！ くっついちゃった！」（どこでも の 小物、ステージで 1 回、ほかの せりふが ない とき）

### 読み込み時の 検査（`validate.ts` の 形の 検査 ＋ `validateMagnetLayout`）
- 形: `params.id` は ステージで ひとつ・`record:` で はじまらない。`kind` は 4 つ（`lever` は はじく）、`look` は その `kind` の もの。`bridge` は `to`（4〜16 m）と `piece`、ほかは `to` なし。線路から 20 m 以内。`line`・`done`・`miss` は 文字 か null。`rewind` は `bridge`・`gate` だけ。`turn` は `junction`（`signReversed` の 分かれ道）、`mirror` は ある `mirror` の `params.id`。`junctions[].turn` は 書かない。`requires: "magnetLight"` の 記録は `onRail`。`environment.ironProps`・`props[].iron`（2〜12 m）
- まとどうし 同じ 線路で 30 m 以上。わき道の `bridge`・`gate` は 分かれ道から 60 m 以上 先
- `bridge`・`gate` の 区間（面の 120 m 手前〜おわりの 40 m 先）に: 切れ目（その 60 m 手前から）・水の 入り口と 出口（120 m 手前〜40 m 先）・雪の かべ・分かれ道・ジャンプだい・上昇気流・えだ・花の はし・いとの はし・うすい こおり・線路の 上の 生き物・ゆきの なみ を 置かない。駅の 停止線は 面の 30 m 手前〜おわりの 20 m 先に ない。面は すべりざかの 中に ない。光る 所（面の 80 m 手前〜面）と 戻り先が 駅の ブレーキ区間（停止線の 80 m 手前〜停止線 ＋ `ok`）と かさならない。戻り先は 線路の 中で 面より 手前（または その わき道の 分かれ道より 手前の 親の 線路）、坂・うすい こおり・水・雪の 中で ない
- `turn`: ひっぱる 所の おわり（`from − minAhead`）が 分かれ道の 40 m 以上 手前、いきどまりの 戻り先（分かれ道 − 80 m）から ひっぱる 所が 30 m 以上 のこる
- じしゃくの 記録: 光る 所の うち 駅の ブレーキ区間の 外が 30 m 以上
- `needs: "magnetLight"` の 分かれ道: わき道の 先 400 m 以内（合流・分かれ道も たどる）に `bridge`・`gate`・`turn`・じしゃくの 記録
- 5-3 より 前（`chapter` 1〜4、`chapter` 5 で じしゃくライトを くれない ステージ。`chapter: 0` の ためしの ステージは のぞく）: `bridge`・`gate`・`turn` は `needs: "magnetLight"` の わき道の 先 だけ（`pick` と 記録は どこでも）
- わざと まちがえた 形は `tests/stages-bad/magnet-*.json`・`iron-props-*.json`・`prop-iron-*.json`・`press-magnet-*.json`・`junction-turn-written.json`

### テスト用の しるし
`#light` の `data-light`（`off`／`light`／`magnet`）・`data-on`（ライトの 段で 1）・`data-steps`（2／3）・`data-glow`・`data-glow-for`（`magnet`／`light`／`dim`／`''`）・`data-pulling`。`#app` の `data-magnet`（`''`／`hint`／`pull`）・`data-magnet-target`・`data-magnet-pulls`（ひっぱった 回数）・`data-magnet-caught`（とどいた まとの id を カンマで）・`data-magnet-bumps`・`data-magnet-<id>`（`idle`／`pulled`／`open`）・`data-iron`（くっついた 小物の 数）・`data-light-mode`。回数と 列は ふえる だけ。しっぱいの `data-fail-reason` は `magnet`。できごと: `light:mode`・`magnet:hint`・`magnet:pull`・`magnet:caught`・`magnet:open`・`magnet:bump`・`magnet:miss`・`magnet:fetch`・`iron:biyon`・`iron:karan`。テストの 道具（`tests/smoke/drive.ts`）: `lightTo(page, mode)`・`lightOnGlow(page, mode, rail, latest)`・`waitCaught(page, id)`

## 21. v1.11 の追加（5-3「かがみのせかい」の しくみ: かがみの なか・まぼろしと ガラス・かがみの 足し・さかさもじ・寸劇、2026-09-30 PR6a）
`schemaVersion` は 1 の まま、ぜんぶ 省略可。設計は `docs/PHASE9_CHAPTER5_6.md` 第 6 部 §4（§0 の 決まりと `docs/PHASE9_0_FREE_ABILITIES.md` が 先に きく: 光るのは ヒント、ジャンプの ボタンは 灰色に しない）。実例は ためしの ステージ `src/stages/0-3.json`（てすとの かがみ、`hidden: true`・`chapter: 0`、`scripts/layout-0-3.mjs`。JSON を 手で 直さない）。5-3 本体は PR6b。全ステージ共通の 数は `src/train/params.ts` の `MIRROR_WORLD`（と いまの `MIRROR`・`LIGHT`）。§20（じしゃくライト、PR5）の `magnet` の `turn` が かがみを まわす 口は この 節の `mirror` の `id`・`facing` と 寸劇の `fx: "mirrorTurn"` と 同じ しくみ（`mirror:turn` の できごと）。

### かがみの なか（`gimmicks[]` の `mirror-flip`）
```json
{ "type": "mirror-flip", "railId": "main", "from": 260, "to": 440, "params": { "id": "k-flip1", "gate": "open" } }
{ "type": "mirror-flip", "railId": "main", "from": 1200, "to": 1380, "params": { "id": "k-flip2", "gate": "whistle", "line": null } }
```
- 先頭が `from`（入り口の もんの 面）を こえてから `to`（出口の もんの 面）を こえるまで、**3D の 画面だけ** 左右 はんてん（`#view` に `.is-flipped` ＝ CSS の `scaleX(-1)`。描く 回数・三角形は かわらない）。レバー・丸ボタン・矢印・ゲージ・ふきだし・札・一時停止は `#ui` に あるので **はんてん しない**（指の 位置は そのまま）。切りかえは 0.35 秒の ラベンダーの きらきら（`#mirror-fade`、`prefers-reduced-motion` では 0.15 秒の うすい 白）の まんなか。位置で きまる（巻き戻し・つづきの あとも すぐ）
- もんは 線路を ふさぐ 銀と ラベンダーの アーチ（うちのり `width` 14・`height` 10 m）に ゆらぐ ガラス。もんは かがみ でもある（入り口は 来る 電車を、出口は 中から 来る 電車を 写す）
- `gate`: `open`（既定。30 m 手前から ゆらぐ、のる だけ）／`whistle`（しまって いて くもりガラス、写さない）。`whistle` の もんは 先頭が 面の 80 m 手前から きてきが 光る（ヒント）。光って いる とき きてきを 押すと ひらく（「ぽわわん」、1 回だけ。きてきの 2 秒 まちは いつもの まま）。押さずに 着くと ガラスに 面の 1 m 手前で ふれて「ぽよん」（0.15 秒で 止まり 0.5 秒で 3 m もどる。**空中でも**。ジャンプは その場で おわる）→ そこから 面の 4 m 手前より 先へ すすまない（レバーが どこでも。めざす 速さ 0）。**しっぱいでは ない**（しずまない・戻らない）。ひらいた もんは ステージを やりなおすまで ひらいた まま。つづきでは はじまる 駅までの もんは ひらいて いる
- `line`・`lineOut`: 入った・出た ときの ひとこと（ミッションの `flipIn`・`flipOut` を 上書き。`null` で 言わない）。`flipIn`・`flipOut` は ミッションで はじめて の とき だけ
- 検査（`validateMirrorWorld`）: `params.id` は 文字で ひとつ、長さ 150〜400 m、同じ 線路の `mirror-flip` どうしは 200 m 以上。`from − 20`〜`to + 60` に 分かれ道・合流・駅の 停止ゾーン・切れ目（と その 60 m 手前）・水・雪の かべ・うきもの・線路の 上の 役者・`jump-pad`・`updraft`・`slope`・`ice`・`thin-ice`・`camera`・`bough`・`fragile`・`flower-bridge`・`plow-wall`・じしゃくの `bridge`／`gate`／`turn`・かがみ（もん いがい）・`chase` の 区間 なし。しっぱいの 戻り先（切れ目・いきどまり・駅・役者・`rewind`・`rewindAt`）が 中に 入らない。`whistle` は `from − 120`〜`from + 10` に きてきで 光る もの（役者・ジャンプだい・`whistle-reversed`・ほたる／くるくるの 分かれ道）なし、前の 駅から 150 m 以上

### まぼろしの 分かれ道（`junctions[].phantom`）
```json
{ "id": "k-j1", "railId": "main", "at": 540, "left": "k-maboroshi1", "right": "main", "default": "left", "signReversed": true, "phantom": true }
```
- 4-1 の かがみの わかれみち と 同じ（`signReversed`、`default` は `deadEnd` の 線路、その おくに かがみ〈`mirror` の `railId`・`junction`〉）。ちがい: **標識を 立てない**（かがみが 標識）。`default` の 線路は ピンクの まぼろし（`#ffc6e4` の 色、ピンクの きらきら、さいごの 30 m は うすく。**ふるえない**）で、**かがみには 写らない**（写しの 中では まっすぐの 道が とちゅうで ない。まぼろしに 入った 電車も 写らない）。おわりは ラベンダーの クッション（`mirror-cushion`、ローダーの 車止めの かわり）
- 見やぶりは いまの `signReversed` の まま（ライトが ついて 40 m 以内 → ほんとうの 道へ 自動、矢印が 光る、`sign:reveal`）。見やぶると まぼろしが「ぽわん」と ピンクの あわに なって きえる。矢印で ほんとうの 側を 押しても よい（まぼろしは きえない）。まちがえると いきどまりの やわらかい しっぱい → 80 m 手前、つぎは 80 m 手前から ライトが 光る。巻き戻しで まぼろしは もどる
- 検査: `signReversed: true`、`default` の 線路は `deadEnd`、`needs`・`dive`・`bubbles`・`fireflies`・`spin` と いっしょに 書かない
- `junctions[].turn` は ローダーが つける（じしゃくの `turn` の まと。書かない）。`turn` の 分かれ道は 矢印を 出さない・ライトだけでは 見やぶれない・まちがえた あとの ライトの 黄色の 光も 出さない（`MissionRunner.revealTurn()` で 見やぶる。PR5／PR6b）

### まぼろしの はし（`gaps[].phantom`）
```json
{ "from": 700, "to": 706, "hint": "fast", "pit": false, "phantom": true, "line": "まぼろしの はし だった〜！" }
```
- 切れ目の 上に ピンクの にせの はし（見た目だけ。切れ目の 判定は いまの `gaps` の まま）。**写しには 描かない**（かがみには 切れ目が 写る）
- きえる とき: ライトが ついて いて 先頭が 40 m 以内／先頭が 60 m 以内で ジャンプ した／ジャンプ せずに 落ちた（その まま いまの 落ちる しっぱい、`line` を 言う）。巻き戻しで もどる
- 検査: `pit: false`（下に 雲を 置く）、`hint` が ある、その 切れ目を 写す かがみ（`reflectRadius` の 中、切れ目の 60 m 手前が 前に ある）が ある

### ガラスの せんろ（`rails[].glass`）
```json
{ "id": "main", "glass": [{ "from": 140, "to": 200 }], "…": "…" }
```
- ちょくせつは すきとおった レール（`#e9f6ff`、不透明度 `glassOpacity` 0.28、白い ふち、きらきらが 前へ ながれる）、**かがみの 中では ふつうの レール**。その 区間は `base` を 描かない（ローダーが `skip` を 足す）。ミッションで はじめて のった とき「しゃららん」。しかけ では ない
- 検査: `from < to`、線路の 中、同じ 線路で かさならない、切れ目・駅の ホーム（`at − 45`〜`at + 10`）と かさならない、`look: "silk"` の 線路には 書かない

### かがみの 足し（`gimmicks[]` の `mirror` の `params`）
| param | 意味 | 既定 |
|---|---|---|
| `id` | 寸劇（`fx: "mirrorTurn"`）・じしゃくの `turn`・テストの 名前。ステージで ひとつ | なし |
| `look` | `"ice"`（4-1）／`"frame"`（銀と ラベンダーの わく、2 本 足、うらは てつの 板） | `"ice"` |
| `facing` | `false` ＝ そっぽ（うらを むけて いる。写さない・きらーん しない） | `true` |
| `turnFrom` | そっぽの ときの まわり かた（度、30〜180） | 180 |
| `back` | うら: `"swirl"`（てつの 板に ピンクの ぐるぐる）／`"plain"` | `"swirl"` |
- いま 写す かがみは `facing` の かがみ だけ から えらぶ（いちばん 近い 1 まい）。`facing: false` の かがみには じしゃくの `turn` の まと（`params.mirror` で よぶ）が ちょうど 1 つ（検査）
- 4-1 の かがみ（`look` なし）は なにも かわらない

### さかさもじの かんばん（`gimmicks[]` の `letter-sign`、見た目だけ）
```json
{ "type": "letter-sign", "params": { "onRail": { "railId": "main", "at": 230, "lateral": -5 }, "rotationY": 180, "text": "ようこそ", "mirror": true } }
```
- 板（4 × 1.6 m、2 本 足、クリーム色、ピンクの ふち、すみに ピンクの ぐるぐる）に `text`（ひらがな・カタカナ 1〜8 文字、空白なし）。`mirror: true` で かがみ文字（ふつうの 画面では よめない、かがみの なかでは よめる）。置き方は `Placement`（`onRail` か `position`）

### 寸劇の 足し
- `spawn` の `"mirror": "only" | "hide"`: `only` ＝ `reflect` に `"cutscene"` の ある かがみの 写しの 中に だけ 描く、`hide` ＝ 写さない（ステージに そういう かがみが ないと 検査で はじく）。同じ 所に 本人（`hide`、そっぽ）と かがみの サカサ（`only`、かがみの ほうを むく）を 置く
- `{ "fx": "mirrorTurn", "mirror": "m-oo", "to": "back" }`: かがみが 0.8 秒で くるっと まわる（`back`: うらを むける ＝ 写さない、`front`: こちらを むく）。**割らない**。のこる 変化（▶▶・つづきでも）。音「くるっ… ぱたん」（`front` は「きらーん」つき）。`mirror` は ある `mirror` の `id`
- `card` の `"mirror": "reflect"` と `"notes": 1 | 2`: 左に かがみ文字の 紙（`notes` まい）、右に 銀の わくの かがみ。0.4 秒で 紙が かがみに 近づき、きらきらが 0.6 秒 はしって、かがみの 中に ふつうの 字の `title` と ワンダーごうの まどに ぐるぐる ぼうしの 小さな え。ボタンは 0.9 秒 あと。`aria-label`「かがみに うつった てがみ」。`notes` は `reflect` と だけ
- `amanojaku-wave`（かがみの サカサ、手を あげて ゆれる）・`amanojaku-shy`（手を まえで あわせ、首を かしげる）は 組み立てずみの `amanojaku` を ポーズ した 仮の 形（チケット 0020）
- （PR6b）`{ "fx": "hearts", "id": "sakasa-mirror" }`: 寸劇の 役者 `id` の まわりに ピンクの ハートと 金の ほし 24 こ（1 回で 描く）。役者を けすまで のこる。役者の 子ども なので `mirror: "only"` の 役者なら かがみの 写しの 中に だけ（「きもちが うつって いる」）。`id` は `fx` の `pop` と `hearts` だけ
- （PR6b）`say` の `"icon": "ride"`: 吹き出しに 小さな 絵（ワンダーごうの 客車の まどに ぐるぐる ぼうし ＝ のりたい サカサ。顔なし）。字が よめない 子の ため。`#bubble[data-icon="ride"]`。6-1 で `hand-stop`・`run-swirl` を 足す（`LineDef.icon`）
- （PR6b）`environment.ambience` が `mirror` の ステージでは 寸劇の あいだ まわりの 音を 止めて 曲 だけ（`#app[data-ambience]` が 空）
- （PR6b）`magnet` の `turn` に `mirror`（この 節の `mirror` の `id`）を 書くと、じしゃくで ひっぱりはじめた しゅんかんに その かがみが こちらを むく（`mirror:turn`、`front`）。その かがみは `facing: false` で なければ ならない（検査）。書かない ときは §20 の 仮の かがみ `turn-mirror-small`

### せりふの キー（v1.11 の 5-3 の 分）
```ts
type LineKey = /* v1.11 (5-3) */ 'flipIn' | 'flipOut' | 'mirrorGateNear' | 'mirrorGateOpen' | 'mirrorGateBump' | 'mirrorGateAfter';
```
- 既定: `flipIn`「かがみの なかに はいった！」・`flipOut`「もどって きた！」（ミッションで はじめての とき）・`mirrorGateNear`「かがみの もん！ きてきで あいずだ！」（きてきが 光りはじめた とき）・`mirrorGateOpen`「かがみが ぷるん！ はいれる！」・`mirrorGateBump`「ぽよん！ かがみが かたい〜」→ `mirrorGateAfter`「きてきで あいず しよう！」（1 回の ためしに 1 回）
- いまの `mirrorNear`・`mirrorFlash`・`mirrorFake`・`signRevealed`・`deadEnd`・`gapNear` は ステージで 上書き して つかう。しっぱいの 理由は ふえない（`deadEnd`・`fellNoJump`・`fellShort`。きてきの もんは しっぱいに しない）

### わざと まちがえた 形・テスト用の しるし
- わざと まちがえた 形は `tests/stages-bad/mirror-*.json`（はんてんの 中に 分かれ道、みじかい はんてん、きてきの もんが 駅に 近い、切れ目を 写す かがみが ない、まぼろしの はしに 穴、まぼろしの 道が いきどまり で ない、そっぽの かがみに まと が ない、かんばんの 字、ない かがみを まわす、`notes` だけ）
- `#app` の `data-flip`（`1`／空）・`data-flips`（入った 回数。ふえる だけ）・`data-flip-gate`（200 m 以内の きてきの もんの `shut`／`open`／空）・`data-gate-bumps`（ぽよんの 回数）・`data-phantoms`（`k-j1:solid,gap:main:700:gone` の ように。`solid`／`gone`／`fall`）・`data-glass`（先頭が ガラスの 上 1）・`data-mirror-facing`（まわった かがみ `m-oo:back`）。`#view.is-flipped`・`#mirror-fade.is-on`・`#card.is-reflect`
- できごと（`src/core/stage-events.ts`）: `flip:in`・`flip:out`・`flip:gate`（`open`／`bump`）・`phantom`・`mirror:turn`・`glass`。本番に デバッグの 口は 足さない（テストは `addInitScript` の 記録係 `window.__mirror`）

## 22. v1.11 の追加（うしろむき `reverse` の しくみ: まえ／うしろ の 切りかえ・来た 道を もどる・うしろむきの わき道・うしろの ホーム、2026-09-30 PR8a）
`schemaVersion` は 1 の まま、ぜんぶ 省略可。設計は `docs/PHASE9_CHAPTER5_6.md` 第 3 部 第 A 部（`docs/PHASE9_0_FREE_ABILITIES.md` §5 が 先に きく）。全ステージ共通の 数は `src/train/params.ts` の `REVERSE`・`TRAIL`。実例: テストコース `src/stages/0-0.json`（うしろむきの わき道 `ura`、記録 `test-ura`、切れ目 main 620–632）と ためしの ステージ `src/stages/0-5.json`（てすとの うしろむき、`hidden: true`・`chapter: 0`: 駅の いきすぎ・うしろの ホーム・ねこ・ゆきの なみの まね）。まだ だれも うしろむきを 覚えない（6-1 M2 で 覚える。PR8b／PR9）。

### しくみ（JSON には 書かない）
- レバーの となりの「まえ／うしろ」切りかえ（`#reverse-switch`）。うしろむきを 覚えて いないと 出ない。止まって いれば すぐ「ぐるりん」（0.5 秒）、走って いれば ふつうの ブレーキで 止まって から（その あいだ もう 1 回で とりけし）
- うしろむきは どこでも「ゆっくり」（5 m/s）まで（ライトで 0.7 倍）。**通った 道を そのまま もどる**（分かれ道・合流も 来た とおり。ふつうの 分かれ道では 矢印を 出さない）
- 止まる 所（いちばん うしろの はしで、「おっとっと」。しっぱい なし）: 切れ目の 1 m 手前、とんだ 所・もぐった 所の はしの 1 m 手前、さいごに 通った 駅（先頭の はしが 停止線に ぴったり）、ステージの はじまり・巻き戻しの 位置、通った 道の はし（2000 m）、わき道の 車止めの 0.5 m 手前
- うしろむきの あいだと、まえに もどって 前に いちばん 先まで 行った 所に もう 一度 着くまで（もどり）は、しかけ・生き物・ヒントの せりふが うごかない（坂は たいら、こおりは すべらない。記録は とれる。時計・ゆきの なみは うごく）
- ロケットは「ぷすっ」（うごかない）、ジャンプは その場で 0.3 m ぴょこっ、もぐるは もぐら ごっこ、ゆきかきは あそびの かき
- 駅を いきすぎた とき（うしろむきを 覚えて いれば）: 60 m まで しっぱいに しない。「いきすぎ〜！ うしろで もどって！」、切りかえが 光る。うしろで もどれば 停止線で 止まり いつもの 採点

### うしろむきの わき道（`junctions[].back`）
```json
"rails": [{ "id": "ura", "points": [[258, 0, 172], "…", [315.76, 0, 180]], "end": { "type": "merge", "railId": "main", "at": 470 } }],
"junctions": [{ "id": "ura-guchi", "railId": "main", "at": 470, "back": true, "left": "main", "right": "ura", "default": "left", "line": "うしろに わきみちが ある！" }]
```
- うしろむきの ときだけ はたらく 分かれ道（スイッチバック）。左右の 1 つが この 分かれ道の `railId`（`default`）、もう 1 つが わき道。わき道は ふつうの 線路で、**おわりが `merge` で この 分かれ道の (`railId`, `at`)**、はじまり（s = 0）が 車止め（`rail-mesh.ts` が −s に むけて 描く。ローダーは 置かない）
- **左右は うしろむきに すすむ ときの 左右**（うしろの まどから 見た 左右）
- 前に 通りすぎて（3 両 ぜんぶ）から うしろへ 下がると、いちばん うしろの はしが 40 m 手前で 矢印（`#junction[data-back="1"]`、5 m 手前で きまる）。わき道から 出て きた ときは 出ない
- `line`（なくて よい、`null` で 言わない）: 切りかえが 光りはじめた ときの ひとこと（なければ ミッションの `backNear`）
- `glow`（既定 `"auto"`）: 通りすぎた あと 80 m まで 切りかえを 光らせる とき。`"auto"` ＝ わき道に まだ とって いない 記録か、いまの ステップの 駅（`stations[].reverse`）が ある。`true` いつも、`false` 光らせない
- ポイントの よこ 3.2 m（わき道と 反対がわ）に ローダーが ぐるぐるの 柱（`reverse-post`、覚える まえは 灰色 `reverse-post-off`）を 立てる。覚えて いない 子が 柱の そばで 止まると「うしろむきに はしれたら…」（ステージで 1 回）
- ローダーは `back` の 分かれ道を `junctions` から ぬいて `StageData.backJunctions` に わける（前向きの しくみは 見ない）

### うしろの ホーム（`stations[].reverse`）
```json
{ "id": "ura-home", "name": "うらの ホーム", "railId": "ura", "at": 0.5, "platformSide": "left", "reverse": true }
```
- うしろむきの わき道の おくに だけ。`at` は いちばん うしろの はしが 止まる 所（車止めから 0.5 m）。ホーム・札・乗客の 列は `at` から +s 向きに ならぶ。`platformSide` は +s に 対する 左右
- 着いた ＝ うしろむきで わき道の 車止めに 止まった。いつも「ぴたっ！」（ゲージ・はやすぎ・とおりすぎ なし）。そのあと ドアは いつもどおり。ドアが しまると 切りかえが 光る（まえへ）
- ミッションの さいごの ステップに しない

### 記録（`requires: "reverse"`）・`endLines`
- 取れるのは うしろむきの あいだ（止まって いても よい）、いちばん うしろの 車両の まん中から 25 m 以内（`onRail` で 同じ 線路なら 線路に そって）
- `records[].endLines`（`{ text, who? }[]`）: その 記録を 見つけた あと、わき道の 車止めで 止まった ときに 言う（ミッションで 1 回）
- 覚える まえは 図鑑に「？」と 灰色の うしろむきの 絵

### せりふの キー（v1.11 の うしろむきの 分）
```ts
type LineKey = /* v1.11 (PR8a) */ 'backNear' | 'backArrows' | 'reverseNudge' | 'reverseStop' | 'reverseStopGap' | 'reverseEnd' | 'backUp' | 'refuseRocketBack' | 'reverseOops';
```
- 既定: `backNear`「うしろむきで いって みよう！」・`backArrows`「やじるしで わきみちへ！」（ステージで 1 回）・`reverseNudge`「レバーを あげると うしろへ すすむよ」（うしろむきで 6 秒 とまる の まま、1 回）・`reverseStop`「おっとっと！ ここまで」・`reverseStopGap`「おっとっと！ きれめだ」（どちらも 20 秒に 1 回 まで）・`reverseEnd`「ついた！ まえに もどろう」・`backUp`「いきすぎ〜！ うしろで もどって！」・`refuseRocketBack`「うしろでは つかえないよ」・`reverseOops`「あれれ？ まえに もどろう」。`needAbility`（うしろむき）の 既定は「うしろむきに はしれたら…」
- しっぱいの 理由に `reverse`（念のため。ふだんは 起きない）

### 読み込み時の 検査（`validate.ts` の 形の 検査 ＋ `validateBackJunctions`）
- `back: true` の 分かれ道: 左右 両方、1 つが 自分の `railId`、`default` は その 側。`dive`・`bubbles`・`needs`・`signReversed`・`fireflies`・`spin`・`phantom` と いっしょに 書かない。`line`・`glow` は `back` の 分かれ道 だけ
- わき道: `end` が `merge` で 分かれ道の (`railId`, `at`)（0.5 m 以内）、はじまりに 分かれ道も 合流も ない、長さ 46〜150 m、口で わき道の おわりの 向きと 線路の +s の 角が 30° 以下、形が 左右と 合う（口から 20 m の 点）。わき道に 切れ目・水・`plow-wall`・`slope`・`ice`・`thin-ice`・`camera`・`jump-pad`・`updraft`・`bough`・`flower-bridge`・`fragile`・`magnet`・`mirror-flip`・うきもの・線路の 上の 役者・分かれ道・ふつうの 駅 なし
- 口の まわり（線路の `at − 40`〜`at + 60`）に ほかの 分かれ道・合流・切れ目・水の はし・`plow-wall`・じしゃくの `bridge`／`gate` なし、駅の 停止線から 40 m 以上、ゆきの なみの 道の 上で ない
- `stations[].reverse`: わき道の 上、`at` ≤ 1、ミッションの さいごの ステップで ない
- `back` の 分かれ道が ある ステージでは、`requires: "reverse"` の 記録は わき道の（いちばん うしろの 車両の まん中が 来られる）点から 25 m 以内
- `rails[].oneWay`・`gimmicks[]` の `reverse`（はじめの 案）は はじく
- わざと まちがえた 形: `tests/stages-bad/back-*.json`・`rail-one-way.json`・`gimmick-reverse.json`

### テスト用の しるし
- `#reverse-switch` の `data-dir`（`front`／`back`）・`data-pending`（`1`／`0`）・`data-glow`・`hidden`。`#junction[data-back="1"]`
- `#app` の `data-direction`（`1`／`-1`）・`data-reverse`（空／`pending`／`turning`／`on`／`stop`）・`data-reverse-stop`（さいごに 止まった わけ: `gap`・`air`・`dive`・`station`・`floor`・`buffer`）・`data-retracing`・`data-tail-rail`・`data-tail-s`（いちばん うしろの 車両の まん中）・`data-trail-m`（通った 道の 長さ）・`data-reverse-toggles`（向きが かわった 回数。ふえる だけ）・`data-back-arrows`・`data-hop`・`data-camera="rear"`／`"chase-rev"`、PR7 の `data-car-gap`・`data-car-lift-err`
- できごと: `reverse`（`on`）・`reverse:stop`・`reverse:siding`・`reverse:backup`。本番に デバッグの 口は 足さない（テストは `addInitScript` の 記録係 `window.__reverseLog`。開発だけ キー `r` で 切りかえ、`__debugTrain.reverseAt(railId, s)`）

