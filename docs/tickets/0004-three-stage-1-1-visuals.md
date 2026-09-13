# 0004 Three.js: 1-1 はじまりの街 の見た目と演出

- 状態: **発注中**（着手条件: 0002 と 0003 が main に入っていること。Phase 1 基盤は main にある）
- 担当: Codex
- 依存: 0002（シーン表示）、0003（モデル）、Phase 1 基盤（Claude Code）
- 関連: `docs/PHASE1_DESIGN.md`、`docs/STAGE_SCHEMA.md`（v1.1）

## 目的
Phase 1 の基盤（ミッション・駅・ドア・猫・寸劇のロジック）が出すイベントに合わせて、3D 側の見た目と演出を作る。ロジックは変えない。

## 境界
- 作る: `src/view/three/` 配下。`src/stages/1-1.json` の `props`（建物・木の配置）は見た目のために変えてよい
- さわらない: `src/mission/`, `src/stage/*.ts`, `src/train/`, `src/actions/`, `src/ui/`。イベントの名前や引数を変えたい場合は PR に書く

## 基盤が提供するもの（実装済み。`src/core/stage-events.ts` と `src/view/SceneView.ts` を正とする）
- `SceneView.onStageEvent(event)` に下の表のイベントが届く。`SceneView.update(dt, pose, fx)` の `fx` に急停止の沈み（`dip`）とゆれ（`shake`）が入る
- `StageData` に `stations[]`（駅の位置・向き・ホーム側）と `actors[]`（型・位置。`onRail` に線路上の位置）が解決済みで入る
- 参考実装: `src/view/wire/WireSceneView.ts`（箱と線で同じイベントを扱っている）

| イベント（`type`） | 意味 | 3D 側でやること |
|---|---|---|
| `door { open, stationId }` | ドア開閉 | 車体の側面にドアの開く帯（0.3 秒）。効果音は基盤側 |
| `passengers { stationId, board, alight }` | 乗降開始 | `alight` 人が電車の脇に現れホーム奥へ歩いて消える、次に `board` 人がホームから電車へ歩いて消える（1.5 秒／人。基盤側の待ち時間と同じ） |
| `actor:state { id, state: 'awake', position, seconds }` | 猫が起きた | `cat-sleep` → `cat-stand` に差し替え、`position` へ `seconds` で移動 |
| `actor:state { id, state: 'flee', position, seconds }` | 急停止で猫が逃げた | 同上（0.6 秒） |
| `actor:state { id, state: 'sleep', position }` | やり直しで猫が戻った | `cat-sleep` に戻し、`position` に置く |
| `actor:spawn { id, model, position, quaternion }` | 登場（寸劇） | モデルを置く |
| `actor:move { id, position, seconds }` | 移動（寸劇） | 位置補間。あまのじゃくは上下に跳ねながら |
| `actor:remove { id }` | 退場 | 消す |
| `rail:cut { railId, from, to }` | 線路が切れる | その区間のレール・枕木・バラストを外し、外れた一片が上に飛んで消える（1 秒）。`rail.gaps` は基盤側で更新済みなので、線路メッシュを作り直せば消える |
| `goal { stationId | null }` | ゴール表示 | 駅の上に `goal-flag` を浮かせて回す。`null` で消す |
| `partner:emote { kind }` | 相棒の動作 | `jump` / `tilt` / `cheer` の 3 種を位置・回転の補間で |
| `stop { grade }` | 停車の評価 | `perfect` のときだけ、ホームに小さなきらきら（パーティクル 10 個程度、1 秒） |
| `fail { reason }` | 失敗 | 何もしなくてよい（カメラは `fx` で沈む） |
| `rewind` | 巻き戻し直後 | 動かしていた乗客・演出をすべて消す |

## 自動配置
- `stations[]` ごとに `platform`（+ `platform-roof` + `station-sign`）を、ホーム側（`platformSide`）に、レール中心から 1.7 m 離して置く。ホームの長さ 30 m は駅の `at` を中心に
- `actors[]` の `type: 'cat'` は `cat-sleep` を線路中央に。`crossing-gate` を右側（進行方向右、レール中心から 3 m）に自動で添える。標識は逆さ（`rotation: [0,0,180]`）でステージ JSON の `props` に置いてあるので自動では置かない
- 待っている乗客は `missions[].steps[].board` の人数分、ホームに 1.2 m 間隔で並べる（色は 3 色を順番に）
- 相棒 `partner` は運転席の右席 (−0.9, 1.6, 4.6)（車体原点基準）に置き、電車の子にする

## 性能
- 1-1 全体でドローコール 150 以下、三角形 8 万以下。建物は同じモデルをインスタンス化

## 確認方法
- `npm run dev` → `?stage=1-1`。キーボードで M1〜M3 を通す
- `npm run smoke`。1-1 用のスモーク 2 本（タイトル→M1、通し）が通ること。スクショは `tests/smoke/output/1*.png`

## 受け入れ条件
- [ ] スモークのスクショで、駅にホーム・屋根・看板、ふみきりに猫と遮断機、街に建物が見える
- [ ] M2 で乗客が乗り降りして見える。M3 で汽笛の後に猫がどく
- [ ] エンディングで線路が切れて見える
- [ ] `getStats()` がドローコール 150 以下
- [ ] コンソールにエラー・警告なし
