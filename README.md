# パチンコシミュレーター（グール超デカ・RUSH演出ver）

`pachinko-simulator-ghouldeka`（電サポ5回リセット＋上乗せ方式）をベースに、
`pachinko-simulator-ghoul-rush`と同じ「通常時はワンクリックで飛ばし、RUSH中の
演出だけを繰り返し楽しむ」フォーマットを適用したもの。ghouldekaには保留キューが
ないため、「貯める→ポケット投入→変動」という専用の新方式を採用している。

- ロジックの正: `logic.js`（通常時確率はghouldeka現行仕様を移植。RUSH構造は
  「当たれば3000確定＋自動連結の50%上乗せ連鎖」という本プロジェクト独自ルール）
- 演出まわりの補助ロジック: `rush-view-engine.js`（`node --test`でユニットテスト済み）
- ゲームループ・描画: `script.js`

## ローカルでの動作確認

`index.html` をブラウザで直接開くだけで動作する（ビルド不要）。

## テスト

```bash
npm test
```

## 設計書

- `docs/superpowers/specs/2026-09-17-ghouldeka-rush-format-design.md`
- `docs/blog.md`（開発の振り返りブログ記事）

## スコープ外（今回未実施）

- `pachinko-simulator-ghouldeka`本体側の変更
- 「終了する」スキップボタン・ST消化速度セレクター（手動トリガー式のため不要と判断）
