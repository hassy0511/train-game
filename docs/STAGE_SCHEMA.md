# ステージJSON スキーマ v1

最終更新: 2026-09-13
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
  start: { railId: string; at: number; direction: 1 | -1 };
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
  bgm: string | null;                              // public/audio/<name>.mp3。Phase 4 まで null
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
  railId: string; at: number;   // 停車位置（車体中心）
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
- 電車の向きは前後 ±4 m の台車位置から決める。始点 `start.at` は 6 以上にして車体が線路に収まるようにする
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
  "start": { "railId": "main", "at": 6, "direction": 1 },
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
    { "id": "st-start", "name": "はじまりえき", "railId": "main", "at": 6, "tolerance": 4, "platformSide": "left" }
  ],
  "props": [
    { "model": "tree-a-proto", "onRail": { "railId": "main", "at": 20, "lateral": -9 } },
    { "model": "tree-b-proto", "onRail": { "railId": "main", "at": 32, "lateral": 9 } },
    { "model": "tree-a-proto", "onRail": { "railId": "main", "at": 48, "lateral": -9 } },
    { "model": "tree-b-proto", "onRail": { "railId": "main", "at": 64, "lateral": 9 } },
    { "model": "tree-a-proto", "onRail": { "railId": "main", "at": 84, "lateral": -9 } },
    { "model": "tree-b-proto", "onRail": { "railId": "main", "at": 100, "lateral": 9 } },
    { "model": "rock-proto",   "onRail": { "railId": "main", "at": 40, "lateral": -14 } },
    { "model": "tree-b-proto", "onRail": { "railId": "main", "at": 140, "lateral": -9 } },
    { "model": "tree-a-proto", "onRail": { "railId": "main", "at": 170, "lateral": -9 } },
    { "model": "tree-b-proto", "onRail": { "railId": "main", "at": 200, "lateral": -9 } },
    { "model": "tree-a-proto", "onRail": { "railId": "main", "at": 240, "lateral": 9 } },
    { "model": "tree-b-proto", "onRail": { "railId": "main", "at": 256, "lateral": -9 } },
    { "model": "tree-a-proto", "onRail": { "railId": "main", "at": 300, "lateral": 9 } },
    { "model": "tree-b-proto", "onRail": { "railId": "main", "at": 324, "lateral": -9 } },
    { "model": "tree-a-proto", "onRail": { "railId": "main", "at": 352, "lateral": 9 } },
    { "model": "tree-b-proto", "onRail": { "railId": "main", "at": 376, "lateral": -9 } },
    { "model": "tree-a-proto", "onRail": { "railId": "main", "at": 404, "lateral": 9 } },
    { "model": "rock-proto",   "onRail": { "railId": "main", "at": 380, "lateral": 14 } },
    { "model": "tree-a-proto", "onRail": { "railId": "branch", "at": 40, "lateral": 9 } },
    { "model": "tree-b-proto", "onRail": { "railId": "branch", "at": 70, "lateral": 9 } },
    { "model": "tree-a-proto", "onRail": { "railId": "branch", "at": 110, "lateral": -9 } },
    { "model": "tree-b-proto", "onRail": { "railId": "branch", "at": 128, "lateral": 9 } },
    { "model": "tree-a-proto", "onRail": { "railId": "branch", "at": 152, "lateral": -9 } },
    { "model": "tree-b-proto", "onRail": { "railId": "branch", "at": 170, "lateral": 9 } },
    { "model": "tree-a-proto", "onRail": { "railId": "branch", "at": 194, "lateral": -9 } },
    { "model": "rock-proto",   "onRail": { "railId": "branch", "at": 150, "lateral": 14 } },
    { "model": "tree-a-proto", "position": [0, -0.6, 168] },
    { "model": "tree-b-proto", "position": [-12, -0.6, 205] },
    { "model": "tree-b-proto", "position": [12, -0.6, 205] },
    { "model": "tree-a-proto", "position": [0, -0.6, 240] },
    { "model": "rock-proto",   "position": [-40, -0.6, 60] },
    { "model": "rock-proto",   "position": [45, -0.6, 90] }
  ],
  "actors": [
    { "id": "sensor-1", "type": "trigger", "onRail": { "railId": "main", "at": 25, "heightFromRail": 0 },
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
