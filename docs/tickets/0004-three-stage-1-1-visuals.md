# 0004 Three.js: 1-1 はじまりの街 の見た目と演出

- 状態: 下書き（Phase 1 の GO 待ち。着手条件: 0002 と 0003 が main に入っていること）
- 担当: Codex
- 依存: 0002（シーン表示）、0003（モデル）、Phase 1 基盤（Claude Code）
- 関連: `docs/PHASE1_DESIGN.md`、`docs/STAGE_SCHEMA.md`（v1.1）

## 目的
Phase 1 の基盤（ミッション・駅・ドア・猫・寸劇のロジック）が出すイベントに合わせて、3D 側の見た目と演出を作る。ロジックは変えない。

## 境界
- 作る: `src/view/three/` 配下
- さわらない: `src/mission/`, `src/stage/`, `src/train/`, `src/actions/`, `src/ui/`。イベントの名前や引数を変えたい場合は PR に書く

## 基盤が提供するもの（実装後に確定。着手時に `src/view/SceneView.ts` を読むこと）
- `SceneView` に追加されるメソッド（予定）:
  - `onStageEvent(event)`: 下の表のイベントが届く
  - `shake(strength, seconds)`: 画面ゆれ、`dip(seconds)`: 急停止の沈み込み、`fade(toBlack: boolean, seconds)`
- `StageData` に `stations[]`（位置・向き・ホーム側）と `actors[]`（型・位置・状態）が解決済みで入る

| イベント | 意味 | 3D 側でやること |
|---|---|---|
| `station:arrived` | 駅に停止 | 何もしない（ドアは基盤側の UI） |
| `door:open` / `door:close` | ドア開閉 | 車体の側面にドアの開く帯（0.3 秒）。効果音は基盤側 |
| `passenger:alight { count }` | 降車 | 乗客が電車の脇に現れ、ホーム奥へ歩いて消える（1.5 秒／人） |
| `passenger:board { count }` | 乗車 | ホームで待つ乗客が電車へ歩いて消える |
| `actor:cat:wake` | 猫が起きた | `cat-sleep` → `cat-stand` に差し替え、線路の外へ 2 秒で移動 |
| `actor:cat:flee` | 急停止時 | 同じだが 0.6 秒で |
| `actor:spawn { id, model, onRail }` | 登場（寸劇） | モデルを置く |
| `actor:move { id, to, seconds }` | 移動（寸劇） | 位置補間。あまのじゃくは上下に跳ねながら |
| `rail:cut { railId, from, to }` | 線路が切れる | その区間のレール・枕木・バラストを外し、外れた一片が上に飛んで消える（1 秒） |
| `mission:goal { stationId }` | ゴール表示 | 駅の上に `goal-flag` を浮かせて回す。到着で消す |
| `partner:emote { kind }` | 相棒の動作 | `jump` / `tilt` / `cheer` の 3 種を位置・回転の補間で |

## 自動配置
- `stations[]` ごとに `platform`（+ `platform-roof` + `station-sign`）を、ホーム側（`platformSide`）に、レール中心から 1.7 m 離して置く。ホームの長さ 30 m は駅の `at` を中心に
- `actors[]` の `type: 'cat'` は `cat-sleep` を線路中央に。`crossing-gate` と `crossing-sign` を右側（−X 側）に自動で添える
- 待っている乗客は `missions[].steps[].board` の人数分、ホームに 1.2 m 間隔で並べる（色は 3 色を順番に）
- 相棒 `partner` は運転席の右席 (−0.9, 1.6, 4.6)（車体原点基準）に置き、電車の子にする

## 性能
- 1-1 全体でドローコール 150 以下、三角形 8 万以下。建物は同じモデルをインスタンス化

## 確認方法
- `npm run dev` → `?stage=1-1`。キーボードで M1〜M3 を通す
- `npm run smoke`。1-1 用のスモーク（基盤側で追加予定）が通ること

## 受け入れ条件
- [ ] スモークのスクショで、駅にホーム・屋根・看板、ふみきりに猫と遮断機、街に建物が見える
- [ ] M2 で乗客が乗り降りして見える。M3 で汽笛の後に猫がどく
- [ ] エンディングで線路が切れて見える
- [ ] `getStats()` がドローコール 150 以下
- [ ] コンソールにエラー・警告なし
