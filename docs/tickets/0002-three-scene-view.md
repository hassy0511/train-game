# 0002 Three.js: シーン表示（線路メッシュ・車両・環境・運転席カメラ）

- 状態: **発注中**（着手条件: Phase 0 基盤の PR が main にマージ済みで、`src/view/SceneView.ts` が存在すること）
- 担当: Codex
- 依存: **Phase 0 基盤（Claude Code 担当）が main にマージ済みであること**、0001 のモデル
- 関連: `docs/PHASE0_DESIGN.md` §1・§2・§4、`docs/STAGE_SCHEMA.md`、`docs/TECH_SPEC.md` §2・§6、`AGENTS.md`

## 目的
基盤が持っているワイヤーフレームの仮表示を、Three.js の本表示に置き換える。線路の数学・電車の動き・UI・物理は基盤側にあり、このチケットは **見た目だけ** を担当する。

## 境界（さわってよい場所）
- 作る: `src/view/three/` 配下（新規）と `src/view/index.ts` の `createSceneView()` の切り替え
- さわらない: `src/rail/`, `src/train/`, `src/physics/`, `src/stage/`, `src/ui/`, `src/debug/`。直したいことがあれば PR に書く
- 依存の追加: なし（`three` と `three/examples/jsm/loaders/GLTFLoader.js` のみ使う）

## 基盤が提供するインターフェース

```ts
// src/view/SceneView.ts
export interface SceneView {
  init(container: HTMLElement, stage: StageData, network: RailNetwork): Promise<void>;
  update(dt: number, pose: TrainPose): void;   // 毎フレーム呼ばれる。描画もここで行う
  resize(width: number, height: number, devicePixelRatio: number): void;
  getStats(): { drawCalls: number; triangles: number } | null;   // 性能ログ用
  dispose(): void;
}

// src/rail/types.ts
export interface RailFrame { position: Vector3; tangent: Vector3; up: Vector3; right: Vector3 }  // right = tangent × up
export interface Rail {
  id: string;
  length: number;                          // m
  frameAt(s: number): RailFrame;           // s は始点からの距離（m）。範囲外は端の接線で外挿
  gaps: { from: number; to: number }[];
  end: { type: "buffer" } | { type: "merge"; railId: string; at: number } | { type: "open" };
}
export interface RailNetwork { rails: Map<string, Rail>; getRail(id: string): Rail }

// src/train/types.ts
export interface TrainPose {
  railId: string; s: number; speed: number; direction: 1 | -1;
  position: Vector3;      // 車体原点（底面中心、レール上面の高さ）
  quaternion: Quaternion; // +Z が進行方向、+Y が上
}

// src/train/params.ts
export const TRAIN = {
  length: 12, width: 3, height: 3.6, bogieOffset: 4,
  cabCameraOffset: new Vector3(0, 2.4, 4.6), cabFovDeg: 60,
};

// src/stage/types.ts（ローダーが位置を解決済み）
export interface StageData {
  file: StageFile;                                   // 元の JSON
  props: { model: string; position: Vector3; quaternion: Quaternion; scale: number }[];
  actors: { id: string; type: string; position: Vector3; quaternion: Quaternion; size: Vector3 }[];
}
```

`environment` は `stage.file.environment`（`docs/STAGE_SCHEMA.md` 参照）。

## 作るもの（`src/view/three/`）

### レンダラ・カメラ（`ThreeSceneView.ts`）
- `WebGLRenderer({ antialias: true })`。`setPixelRatio(Math.min(dpr, 2))`。`outputColorSpace = SRGBColorSpace`。影なし、トーンマッピングなし
- `PerspectiveCamera(TRAIN.cabFovDeg, aspect, 0.1, 600)`。電車オブジェクトの子にして `TRAIN.cabCameraOffset` に置き、**+Z を向ける**（Three.js のカメラは既定で −Z を向くので Y 軸に 180° 回す）
- `update()` で電車オブジェクトの `position`・`quaternion` を `pose` からコピーし、`renderer.render()`
- `getStats()` は `renderer.info.render.calls` と `.triangles` を返す
- `resize()` で `renderer.setSize(w, h, false)` と `camera.aspect` 更新
- `dispose()` でジオメトリ・マテリアル・レンダラを解放

### 環境（`environment.ts`）
- 空: `environment.sky` の `top`→`bottom` のグラデーション。半径 550 の球（`BackSide`）に頂点カラーか簡単な ShaderMaterial。カメラに追従させる（位置だけ）
- 霧: `environment.fog` があれば `scene.fog = new Fog(color, near, far)`
- ライト `lighting: "day"`: `HemisphereLight(0xffffff, 0x99bb77, 0.9)` と `DirectionalLight(0xffffff, 1.2)`、方向は (1, 2, 0.5) を正規化した位置から原点へ。他のプリセット名は "day" と同じ扱いでよい（Phase 0）
- 地面: `environment.ground` があれば `PlaneGeometry(size, size)` を Y = `ground.y` に水平に置く。`MeshLambertMaterial({ color })`

### 線路メッシュ（`rail-mesh.ts`）
`RailNetwork` の各 `Rail` から生成する。見た目の寸法は `docs/PHASE0_DESIGN.md` §1 の通り。
- サンプリング間隔 1.0 m（`frameAt(s)` を使う）。`gaps` の区間はメッシュを作らない
- レール 2 本: `position + right × (±0.75)`。断面は幅 0.10 × 高さ 0.15（Y −0.15〜0）。各区間で上面・外側面・内側面の 3 面（端面は不要）。1 本の線路につき 1 つの `BufferGeometry` にまとめる。色 `#6E6E6E`、`MeshLambertMaterial`
- 枕木: `InstancedMesh` の `BoxGeometry(2.4, 0.15, 0.25)`。0.8 m ごとに中心 Y −0.225、向きは `frameAt` の接線・上方向から。色 `#6B4E2E`。全線路で 1 つの InstancedMesh
- バラスト: 台形の帯。上面幅 3.2 が Y −0.3、底面幅 4.4 が Y −0.6。各区間で上面・左右斜面の 3 面。色 `#A89F91`。1 本の線路につき 1 ジオメトリ
- `end.type === "buffer"` の線路は終端 `frameAt(length)` に `buffer-stop-proto` を置く。モデルの +Z を接線に向ける

### モデルと配置（`models.ts`, `props.ts`）
- `GLTFLoader` でロード。URL は `${import.meta.env.BASE_URL}models/${name}.glb`（Pages のサブパス対応）。同じ名前は 1 回だけロードしてキャッシュ
- `stage.props` を配置。同じモデルが 2 個以上なら `InstancedMesh`（glb 内のメッシュごとに 1 つ）。1 個ならそのまま `scene.add`
- 電車: `train-proto` をロードして電車オブジェクトにする
- `stage.actors` は描画しない（デバッグ表示は基盤側）

### 切り替え（`src/view/index.ts`）
- `createSceneView()` の既定を `ThreeSceneView` にする。開発ビルドで `?view=wire` のときだけ基盤のワイヤーフレーム表示を返す（本番ビルドには含めない）

## 性能・品質の条件（0-0 で）
- ドローコール 60 以下、三角形 6 万以下（`getStats()` の値。スモークがログに出す）
- three からの警告（欠けたテクスチャ等）をコンソールに出さない
- 1 フレームのアロケーションを避ける（`update()` で `new Vector3` を作らない）

## 確認方法
- `npm run dev` で `http://localhost:5173/?stage=0-0` を開く（キーボード: ↑↓ で速度段、Space で汽笛、←→ で分岐、V でスプライン表示、R でやり直し）
- `npm run smoke`（ビルドしてから Playwright を実行）。`tests/smoke/output/` に 4 枚のスクショが出る: 00-start / 01-after-5s / 02-junction / 03-end-of-line
- Chromium を別に用意している環境では `PW_CHROMIUM_PATH=<chrome のパス> npm run smoke`

## 受け入れ条件
- [ ] `npm run smoke` が通る（2 テスト）
- [ ] 0 秒のスクショ: 画面下にダッシュボードと窓枠、正面に 2 本のレールと枕木がまっすぐ奥へ、両側に木、上は空のグラデーション、遠くが霧で薄くなっている
- [ ] 5 秒のスクショ: 木の位置が変わっている（電車が 20 m 以上進んでいる）
- [ ] 分岐後の main の丘（6 %）でカメラが傾き、branch では車止めまで走って止まる（手動確認。だいさんが iPad で見る）
- [ ] `getStats()` がドローコール 60 以下
- [ ] コンソールにエラー・警告なし
- [ ] `base` が `/train-game/` のビルド（CI）でもモデルがロードできる
- [ ] PR にスクショ 4 枚と `getStats()` の値を貼る

## 備考
- 見た目の色や太さは仕様の値から始めて、明らかに変なら PR で提案する。数値を変えた場合は理由を書く
- 車体が線路からはみ出す・カーブでガタつく等、基盤側の問題に見えるものは直さずに PR に書く
