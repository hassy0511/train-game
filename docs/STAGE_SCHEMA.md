# ステージJSON スキーマ v1

最終更新: 2026-09-26（v1.8）
状態: v1 確定（2026-09-13）。型の実体は `src/stage/types.ts`、検証は `src/stage/validate.ts`

1ステージ = 1ファイル。`src/stages/<chapter>-<n>.json`。
単位はすべて m、Y が上、右手系。線路上の位置は **始点からの距離 `at`（m）** で書く。

---

## 1. 型定義（TypeScript 表記）

```ts
type Vec3 = [number, number, number];   // [x, y, z] m
type AbilityId = "whistle" | "light" | "jump" | "rocket" | "dive" | "magnetLight" | "reverse";

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
  oneWay?: boolean;           // true = 逆走専用（通常方向は進入不可）
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
  | { camera: 'fixed'; at: Vec3; lookAt: Vec3 }                               // 動かないカメラ（寸劇の終わりで元に戻る）
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

能力 `rocket`（`"unlocks": ["rocket"]` と 寸劇の `{ "unlock": "rocket" }` で覚える）: ボタンは右手 2×2 の右上（`#rocket`）。カメラは いつも右上の角の小さい丸（`#camera`、一時停止の左）。
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
| `"rocket"` | ロケットを ふかして いる あいだと、その いきおいが のこって いる あいだ（レバーの 速さに もどるまで） |
| それ以外（`dive`・`reverse` …） | まだ 見つからない（あとの 章で 決める）。図鑑と 地図で「？」 |
能力を まだ 持って いない 記録は、どんな ときも 見つからない（地図の 島に「？」、図鑑に その能力の 灰色の 絵）。

```ts
type RecordDef = /* v1.2 */ & {
  hint?: string;   // ピコの ひとこと。記録の 60 m 手前（RECORD.hintDistance）で、いま 取れる とき（能力が ある／要らない）に ステージの 間 1 回
};

interface RailDef {
  // ...
  spur?: { back: { railId: string; at: number } };
  // 記録への 支線。終わりは 車止め（buffer）。車止めで 止まると、暗転して back へ 移る（失敗では ない: 画面の しずみ・ゆれ なし、
  // ピコ「いきどまり！ もとの みちに もどるよ」＝ せりふ spurBack）。deadEnd と 同時には 書かない
}

interface JunctionDef {
  // ...
  needs?: AbilityId;
  // 分かれ道の わき道（default でない ほう）に 要る 能力。標識の 上に その能力の 絵の 丸い 札、矢印の ボタンにも 同じ 絵が 付く。
  // 能力が ないと わき道の 矢印は 灰色で、押しても えらべず、ピコが needAbility を 言う（分かれ道の 60 m 手前でも 1 回。失敗で 戻ったら また）。
  // わき道は default の 反対側に あること。signReversed とは いっしょに 使わない
}

type LineKey = /* v1.7 */ | 'spurBack' | 'needAbility';
// needAbility の 既定は 能力ごと: rocket「ロケットが あれば のぼれそう…」、jump「ジャンプが できたら いけそう…」、light「ライトが あれば みえそう…」、
// ほか「いまは まだ いけないみたい…」
```

- ロケットの「車止めの 150 m 手前は おやすみ」は、同じ 線路の 先に のぼり坂が まだ ある 間は かからない（わき道の 坂を ロケットで のぼる ため）。のぼり坂の てっぺんから 先は おやすみ（ふかして いれば「ぷしゅっ」）
- 支線の のぼり坂の 戻り先（`slope` の `rewind`）は、分かれ道より 手前の 本線に する（もう一度 えらびなおせる ように）
- 読み込み時の 検査: `spur.back` は 線路の 中で 坂の 上でない。`spur` は buffer で 終わる。`needs` は 能力の 名前、わき道が ある、`signReversed` と いっしょに しない。`hint` は 文字

### 図鑑の 絵
記録ごとの 絵は `public/zukan/<記録の id>.png`（256 px、背景 なし、1 枚 40 KB 以内）。`node scripts/render-zukan.mjs [id…]` が、記録の `model` を ゲームと 同じ モデル（まだ 作って いない モデルは コードで 描く 仮の 形）で 描いて 書き出す。記録を 足したり モデルを かえたら 作りなおす。`model` の ない 記録（1-3 さかさじまの うら）は 絵なし。
絵は サービスワーカーが はじめに ぜんぶ ためる（オフラインでも 図鑑が 見える）。

### ステージに 足した もの
| ステージ | 足した もの |
|---|---|
| 1-1 | 記録 3 つ: `town-board`「まちの かんばん」（通るだけ、loop 322 の 左）、`hq-plans`「ほんぶの せっけいず」（通るだけ、ほんぶの 前 loop 4。M3 で ほんぶへ もどる ときに 見つかる）、`roof-balloon`「やねの うえの ふうせん」（ジャンプ、loop 258 の 家の やね） |
| 1-2 | 分かれ道 `to-gake`（main 695、右が 支線、`needs: "rocket"`）と 支線 `gake`（256 m、右の がけの 外を のぼる。坂 68〜142、戻り先 main 640、もどる 先 main 725、カメラ chase 50〜250）。記録 `cliff-nest` は がけの 上の 空の 巣（gake 145.5 の 左 16 m、坂の てっぺんの 少し 先） |
| 2-1 | 分かれ道 `to-eda`（top 165、右が 支線、`needs: "rocket"`）と 支線 `kozue-eda`（221 m、こずえのえきの 横を 上へ のびる えだ。坂 40〜106、戻り先 top 150、もどる 先 top 180）。記録 `treetop` は てっぺんの はね（kozue-eda 114） |
