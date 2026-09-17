'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// pachinko-simulator-ghoul-rushと同じ理由：<script>タグ3本を共有グローバル
// スコープで読み込んだ場合の構文/参照エラーを、node --testのモジュール
// スコープでは検出できないため、vmモジュールで再現して検証する。

function readFile(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

test('logic.js と rush-view-engine.js は共有グローバルスコープで衝突なく読み込める', () => {
  const ctx = vm.createContext({ console });
  vm.runInContext(readFile('logic.js'), ctx, { filename: 'logic.js' });
  vm.runInContext(readFile('rush-view-engine.js'), ctx, { filename: 'rush-view-engine.js' });
  const result = vm.runInContext(
    'typeof simulateInvestment === "function" && typeof rollConfidenceColor === "function" && RUSH_MODE_OPTIONS.length',
    ctx
  );
  assert.equal(result, 4);
});
