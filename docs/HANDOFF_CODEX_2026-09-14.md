# Codex 作業引継ぎ（2026-09-14）

この文書は、チャットを切り替えても作業をそのまま再開できるように、環境構築から現在の未完了作業までをまとめたものです。

## 最初に確認すること

- リポジトリ: `hassy0511/train-game`
- 現在の作業ブランチ: `codex/0002-three-scene-view`
- ベース: `origin/main` の `6d66601`（PR #1 の Phase 0 基盤と PR #2 の 0001 Blenderモデルがマージ済み）
- 現在の担当チケット: `docs/tickets/0002-three-scene-view.md`
- 作業境界: `src/view/three/` の新規実装と `src/view/index.ts` の切替。`src/rail/`、`src/train/`、`src/physics/`、`src/stage/`、`src/ui/`、`src/debug/` は変更しない。
- 次のチャットでは、このブランチを checkout/pull して本書を読んでから再開する。

## 完了済み: Blender環境とスキル

Blender 4.5.13 LTS のポータブル版をワークスペース共通領域に構築済みです。

- 実体: `../.tools/blender-4.5.13-windows-x64/blender.exe`
- ラッパー: `../bin/blender.cmd`
- バージョン確認: `..\bin\blender.cmd --version`
- 動作確認用ファイル: `../.tools/blender-smoke.py`、`../.tools/blender-smoke.png`

Codex用のBlenderスキルも構築・検証済みです。

- スキル: `%USERPROFILE%\.codex\skills\blender-headless-assets\SKILL.md`
- 主な補助: `scripts/run-blender.ps1`、`scripts/validate_glb.py`、`references/blender-pipeline.md`
- スキルの検証用出力: `../.tools/skill-validation-cube.glb`

## 完了済み: チケット0001

Phase 0 用の5モデルを、再現可能なBlender Pythonスクリプトから生成しました。

- `train-proto`
- `tree-a-proto`
- `tree-b-proto`
- `rock-proto`
- `buffer-stop-proto`

生成スクリプトは `assets/blender/`、GLBは `public/models/`、プレビューは `assets/previews/` にあります。0001のコミットは `9270723`、ブランチは `origin/codex/0001-proto-models`、成果は PR #2 経由で現在の `main` にマージ済みです。

## 作業中: チケット0002

Three.js の本番シーン表示を実装済みです。現時点の追加・変更対象は次のとおりです。

- `src/view/three/ThreeSceneView.ts`
  - WebGLRenderer、SRGB、DPR上限2、影なし、トーンマッピングなし
  - 運転席カメラを電車の子にし、+Z向きで `TRAIN.cabCameraOffset` に配置
  - poseの位置・回転を毎フレームコピーして描画
  - `getStats()`、resize、ジオメトリ・マテリアル・rendererのdispose
- `src/view/three/environment.ts`
  - 半径550の追従式グラデーション空
  - Fog、HemisphereLight、DirectionalLight、地面
- `src/view/three/rail-mesh.ts`
  - 1mサンプリングの左右レール、台形バラスト
  - 全線路共通のInstancedMesh枕木（0.8m間隔）
  - gap区間の除外
  - rail終端の `buffer-stop-proto` 配置情報
- `src/view/three/models.ts`
  - `${import.meta.env.BASE_URL}models/${name}.glb` のGLTFLoader読込と名前別キャッシュ
- `src/view/three/props.ts`
  - 解決済みpropsの配置
  - 同じモデルが2個以上ならGLB内メッシュ単位でInstancedMesh化
- `src/view/index.ts`
  - 既定をThreeSceneViewへ切替
  - 開発時の `?view=wire` だけWireSceneViewを返す

`stage.actors` はチケットどおり本番シーンでは描画していません。

## 検証済みの結果

### 型チェックとビルド

- TypeScript `tsc --noEmit`: 成功
- 通常の Vite production build: 成功
- `BASE_PATH=/train-game/` の Vite production build: 成功
- production bundle内に `WireSceneView`、`GridHelper`、placeholderコメント等の識別文字列がないことを確認済み

### Playwright smoke

既存の2テストは両方成功しました。

1. 起動、5秒走行、センサー通過、汽笛クールダウン
   - 走行後 `s=36.5 m`
   - ソフトウェアWebGL上の表示fpsは約21
2. 分岐でbranchを選択し、車止め手前で自動停止
   - `branch` の `s=206.7 m` で停止

スクリーンショット4枚も生成・目視確認済みです。

- `tests/smoke/output/00-start.png`
- `tests/smoke/output/01-after-5s.png`
- `tests/smoke/output/02-junction.png`
- `tests/smoke/output/03-end-of-line.png`

画像では、運転席下部、左右レール、枕木、バラスト、木・岩、グラデーション空、分岐、終端UIを確認しました。`tests/smoke/output/*` は `.gitignore` 対象なので、別環境では `npm run smoke` で再生成してください。

### 描画負荷とブラウザ警告

開発ビルドのデバッグ表示から取得した0-0開始時の値です。

- draw calls: **21**（上限60）
- triangles: **23,468**（上限60,000）
- browser warnings/errors: **0件**

## 検証環境で発生した注意点

このCodexシェルでは通常の `node` / `npm` がPATHに入っていませんでした。Node本体は次にあります。

`%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`

依存関係はpnpmを使い、企業プロキシの証明書制約を回避するため `--config.strict-ssl=false` 付きで既存 `package.json` どおりに復元しました。`package.json` と `package-lock.json` は変更していません。

型チェックとビルドは、必要なら次のようにNodeを直接指定できます。

```powershell
$node = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
& $node node_modules\typescript\bin\tsc --noEmit
& $node node_modules\vite\bin\vite.js build
```

Playwrightの2テスト自体は `2 passed` まで到達しましたが、この環境で一時的に用意したnpm/npx互換ラッパーでは、テスト後のVite子プロセス終了待ちだけが残り、外側のシェルが300秒でタイムアウトしました。アプリやテストの失敗ではありません。通常のnpmが使える環境では、改めて素の `npm run smoke` が正常終了することを確認してください。

## まだ完了していないこと

次のチャットでは以下を順に行ってください。

1. `git status` と本書を確認し、`src/view/three/` のコードレビューを行う。
2. 通常のnpm環境で `npm run build` と `npm run smoke` を再実行し、プロセス終了コード0まで確認する。
3. `BASE_PATH=/train-game/` でビルドしたものを `/train-game/?stage=0-0` から開き、5個のGLB要求がすべて200であることをブラウザで最終確認する。
   - base付きビルド自体は成功済み。
   - このセッションではローカルpreview用の一時プロセス管理が不安定になり、base付きのブラウザ最終確認だけ未確定。
4. 必要なら4枚のスクリーンショットを再生成し、PR本文に添付する。
5. コードに問題がなければPRを作る。
   - タイトル: `[#0002] Three.js シーン表示`
   - base: `main`
   - head: `codex/0002-three-scene-view`
   - PR本文に変更点、確認方法、draw 21 / tris 23,468、4枚のスクリーンショット、判断に迷った点を書く。
6. レビューで基盤側の問題が見つかっても、チケット境界外のディレクトリはこのブランチで直さず、PRに記載する。

## 再開時の最短コマンド

```powershell
git fetch origin
git switch codex/0002-three-scene-view
git pull --ff-only
git status
npm ci
npm run build
npm run smoke
```

Blender作業が再度必要になった場合は、Codexの `blender-headless-assets` スキルを使い、`..\bin\blender.cmd` またはスキル内の `run-blender.ps1` からヘッドレス実行してください。
