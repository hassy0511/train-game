# AGENTS.md — Codex向け作業規約

このリポジトリは子供向け3D電車ゲーム（Three.js + TypeScript + Vite + Rapier）。
あなた（Codex）は `docs/tickets/` のチケットに従って実装する。設計判断はチケットに従い、迷ったらPRに質問を書いて止まる。

## 必読
- `docs/GAME_SPEC.md`（仕様）、`docs/TECH_SPEC.md`（技術）、該当チケット

## 作業の流れ
1. チケットを読み、受け入れ条件を確認する
2. 実装する。ステージ固有の値はステージJSONに置く
3. `npm run build` と Playwright スモーク（`npm run smoke`）を通す
4. スモークのスクショを `tests/smoke/output/` に出し、PRに添付・言及する
5. PRにはチケット番号、変更点、確認方法、判断に迷った点を書く

## Blender作業
- ヘッドレスのみ: `blender -b --python assets/blender/<name>.py`
- 出力: `public/models/<name>.glb`（1 unit = 1 m、前方向 +Z、原点は発注書の指定）
- プレビュー: `assets/previews/<name>.png` をCPU Cyclesの低サンプルでレンダしてコミット
- 絵柄: ローポリ・フラットシェーディング・単色寄り。ポリゴン予算はチケットに従う
- 実在の車両・キャラを連想させる形状・配色を避ける

## コード規約
- TypeScript。識別子・コメント・コミットは英語。UI文言は日本語（子供向けはひらがな主体）
- UIはDOMオーバーレイ。Three.js内でUIを作らない
- 物理判定はRapierのセンサー。電車はキネマティック
- 外部通信・外部CDNを追加しない
- 新しい依存を追加する場合はPRで理由を書く

## やらないこと
- チケットにない機能の追加
- 攻撃・戦闘要素、怖い演出
- 実在の鉄道・既存キャラの要素
- 常時表示ボタンを4つより増やすこと
