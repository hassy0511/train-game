# 0023 うしろむきの しかけ（共通。うしろむきの わき道の 柱）

- 状態: **作業中**（コードで 作った 仮の 形 `src/view/three/reverse-placeholders.ts` で 遊べる。Blender は 後回し。2026-09-30）
- 担当: Claude Code
- 依存: なし（作り方は `docs/ASSET_PIPELINE.md`）
- 関連: `docs/PHASE9_CHAPTER5_6.md` 第 3 部 A8.3（見た目）・A8.1（うしろむきの わき道 `junctions[].back`）、`src/stage/loader.ts` の `reversePosts`（柱を 自動で 立てる）、`src/view/three/ThreeSceneView.ts`（うしろむきを 覚えたら 灰色 → ピンクに かえる）
- **うしろむきの 共通の しかけ**（どの ステージの うしろむきの わき道にも 立つ）。はじめは 6-1 の チケット 0021 の 節に する つもり だったが、PR8b の 0021（すわった サカサ）と ばんごうが かさならない ように 0023 に わけた（0022 は 6-2 つながった せかい に とって ある）。6-1 の 形（しろ・いえ・`upside-flower` など）は 0021
- わき道の おくの 車止めは モデルを 足さない（いまの `buffer-stop-proto` を `rail-mesh.ts` が わき道の はじまりに 180° まわして 置く）

## 目的
うしろむきの わき道（スイッチバック）の 口に 立つ「ここに うしろむきの みちが ある」の しるし（ヒント。押す もの では ない）。仮の形と **同じ 名前・寸法・原点** で 作る。できたら `assets/models.json` の `_pending` から 外す。

## 共通仕様
- ファイル: `public/models/<名前>.glb`、生成スクリプトは `assets/blender/reverse-set.py`
- 1 モデル 1 マテリアル（頂点カラー）
- 原点: 底面の 中心、前は +Z（線路の 向き）。まるい 札の 面は ±Z（線路を どちらから 来ても 見える）
- アニメ なし
- **顔を つけない**（うずまきを 目に 見せない。札は 1 まいの まる だけ）。字・ロゴ なし。実在の 標識に 似せない（まるい 札に ピンクの うずまき だけ）

## モデル
| 名前 | 用途 | 寸法 幅×高さ×奥行 (m) | 三角形 | 色・形 | 原点・向き | 動き |
|---|---|---|---|---|---|---|
| `reverse-post` | うしろむきの わき道の 口の 柱（うしろむきを 覚えた あと）。ローダーが 口の よこ 3.2 m、わき道と 反対がわに 立てる | 0.9×2.4×0.2 | ≤ 600 | 柱 クリーム `#e8e2d6`、台 `#8c95a1`、まるい 札（半径 0.45 m、高さ 1.95 m）は 白 `#ffffff` に ピンク `#e75ba0` の うずまき（両面）、ふち ピンク | 底面中心、札の 面が ±Z | なし |
| `reverse-post-off` | 同じ 柱の 灰色（うしろむきを 覚える 前。1-3・5-3・6-1 M1 では「？」の なぞかけ） | 同じ | 同じ | うずまき・ふち `#b6bdc7`、柱 `#d3d6db` | 同じ | なし |
- 描く 回数（A19）: 柱 1 回（見える とき。灰色と ピンクは どちらか 1 つ だけ 見える）

## 受け入れ条件
- モデル確認ページで 見られる: `https://hassy0511.github.io/train-game/models.html?model=reverse-post`、ならべて くらべる `https://hassy0511.github.io/train-game/models.html?compare=reverse-post,reverse-post-off`
- または Playwright スモークの スクショ（`tests/smoke/reverse.spec.ts`: `reverse-post.png`）で 見える こと
- `npm run build`（`check-models`）が とおる。三角形・原点が 表の とおり
