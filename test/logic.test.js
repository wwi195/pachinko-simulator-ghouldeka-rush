'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../logic.js');

function mockRandom(sequence) {
  let i = 0;
  return () => sequence[Math.min(i++, sequence.length - 1)];
}

test('spinNormal: rngが小さい順にzugar→false_enzoku→charge→missの優先度で判定する', () => {
  const origRandom = Math.random;
  try {
    Math.random = () => 0;
    assert.equal(logic.spinNormal(), 'zugar');
    Math.random = () => 0.999;
    assert.equal(logic.spinNormal(), 'miss');
  } finally {
    Math.random = origRandom;
  }
});

test('rollZugarPremium: rng<0.5でtrue(PREMIUM)', () => {
  const origRandom = Math.random;
  try {
    Math.random = () => 0.1;
    assert.equal(logic.rollZugarPremium(), true);
    Math.random = () => 0.9;
    assert.equal(logic.rollZugarPremium(), false);
  } finally {
    Math.random = origRandom;
  }
});

test('createRushState: 電サポ残り5・連チャン0・獲得球0で初期化される', () => {
  const state = logic.createRushState();
  assert.deepEqual(state, { remaining: 5, chainCount: 0, actualBalls: 0, nominalBalls: 0 });
});

test('applyRushSpin: 外れが続くと電サポ残りが1ずつ減り、0でrush_endになる', () => {
  const origRandom = Math.random;
  try {
    // P_RUSH判定に常に外す値(0.9999)を使う
    Math.random = mockRandom([0.9999]);
    let state = logic.createRushState();
    for (let i = 0; i < 4; i++) {
      const r = logic.applyRushSpin(state);
      assert.equal(r.outcome, 'miss');
      state = r.rushState;
    }
    assert.equal(state.remaining, 1);
    const last = logic.applyRushSpin(state);
    assert.equal(last.outcome, 'rush_end');
    assert.equal(last.rushState.remaining, 0);
  } finally {
    Math.random = origRandom;
  }
});

test('applyRushSpin: 当たり即失敗(上乗せ0回成功)なら3000(addChainCount=1)確定、電サポ残りは5にリセット', () => {
  const origRandom = Math.random;
  try {
    // 1回目の呼び出し(isHit判定)は0で必ずhit。2回目の呼び出し(上乗せ判定)は
    // 0.9999で必ず失敗。
    Math.random = mockRandom([0, 0.9999]);
    const state = logic.createRushState();
    const r = logic.applyRushSpin(state);
    assert.equal(r.outcome, 'hit');
    assert.equal(r.addChainCount, 1);
    assert.equal(r.actualBallsGained, 2800);
    assert.equal(r.nominalBallsGained, 3000);
    assert.equal(r.rushState.remaining, 5);
    assert.equal(r.rushState.chainCount, 1);
    assert.equal(r.rushState.actualBalls, 2800);
  } finally {
    Math.random = origRandom;
  }
});

test('applyRushSpin: 上乗せに3回連続成功後に失敗すると、addChainCount=4(3000×4=12000)になる', () => {
  const origRandom = Math.random;
  try {
    // hit判定(0) → 上乗せ成功×3(0) → 上乗せ失敗(0.9999)
    Math.random = mockRandom([0, 0, 0, 0, 0.9999]);
    const state = logic.createRushState();
    const r = logic.applyRushSpin(state);
    assert.equal(r.outcome, 'hit');
    assert.equal(r.addChainCount, 4);
    assert.equal(r.actualBallsGained, 2800 * 4);
    assert.equal(r.nominalBallsGained, 3000 * 4);
  } finally {
    Math.random = origRandom;
  }
});

test('rollIsReach: 当たりは常にtrue、外れはP_FAKE_REACH_GIVEN_MISS(0.5)で判定', () => {
  const origRandom = Math.random;
  try {
    Math.random = () => 0.9999;
    assert.equal(logic.rollIsReach(true), true);
    Math.random = () => 0.1;
    assert.equal(logic.rollIsReach(false), true);
    Math.random = () => 0.9;
    assert.equal(logic.rollIsReach(false), false);
  } finally {
    Math.random = origRandom;
  }
});
