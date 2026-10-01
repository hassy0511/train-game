# 0021（先に 書く 節）すわった サカサ `amanojaku-sit`

- 状態: **作業中**（組み立てずみの `amanojaku` を コードで すわらせた 仮の 形 `src/view/three/models.ts` の `sitAmanojaku` で 遊べる。Blender は 後回し。2026-09-30）
- 担当: Claude Code
- 依存: `amanojaku`（組み立てずみ）。作り方は `docs/ASSET_PIPELINE.md`
- 関連: `docs/PHASE9_CHAPTER5_6.md` 第 7 部 §8（見た目の 表）・§4.1（`lead.home`）・§4.3（`welcome`）・§4.5（寸劇 `crew`）、第 3 部 B6.4・A10（なかまの 席）、§0.9 の 16（コードの 形は PR8b）
- **6-1 の チケット 0021「さかさまの しろ セット」の 1 つめの 節**。PR8b で この 節だけ 先に 書いた（しろ・いえ・はねばし などの のこりは PR9 が 同じ 番号で 足す。いっしょに する ときは この ファイルを その 節に うつす）

## 目的
ベンチに すわって まつ サカサ（6-1 M2 の おわり〜M3、0-6 の しまの えき）と、なかまに なって 運転席の うしろに すわる サカサ（6-1 の 出・6-2・タイトルの 3D）。仮の形と **同じ 名前・寸法・原点** で 作る。できたら `assets/models.json` の `_pending` から 外す。

## モデル
| 名前 | 用途 | 寸法 幅×高さ×奥行 (m) | 三角形 | 色・形 | 原点・向き | 動き |
|---|---|---|---|---|---|---|
| `amanojaku-sit` | すわった サカサ（ベンチ・運転席の うしろ） | `amanojaku` と 同じ はば、高さ 約 1.0〜1.1、足が 前へ 0.4 | ≤ 1,500 | `amanojaku` と 同じ（ピンク `#E75BA0` の ぐるぐる ぼうし、マント）。ひざを まげて すわる（仮の 形は 足を まえに のばして いる） | **座面の 中心**（おしりの 下）、+Z が 前 | なし（立つ・あるく は ゲームが `amanojaku-lantern` などに かえる） |

- 1 モデル 1 マテリアル（頂点カラー）。**顔の 絵は いまの `amanojaku` の まま**（電車・いえ・しろには 顔を つけない）
- 既存の キャラクターに 似せない（いまの サカサの 形の まま）

## 受け入れ条件
- モデル確認ページで 見られる: `https://hassy0511.github.io/train-game/models.html?model=amanojaku-sit`、ならべて くらべる `https://hassy0511.github.io/train-game/models.html?compare=amanojaku,amanojaku-sit`
- または Playwright スモークの スクショ（`tests/smoke/welcome.spec.ts` の `welcome-peek.png`、`tests/smoke/lead.spec.ts` の `lead-met.png`）で 見える こと
- `npm run build`（`check-models`）が とおる。三角形・原点が 表の とおり
