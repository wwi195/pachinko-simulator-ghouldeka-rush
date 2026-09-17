'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../rush-view-engine.js');

test('RUSH_MODE_OPTIONS はデフォルト+実機準拠3種の計4種', () => {
  assert.equal(engine.RUSH_MODE_OPTIONS.length, 4);
  assert.deepEqual(engine.RUSH_MODE_OPTIONS.map((m) => m.id), ['default', 'tokigeki', 'rize', 'tsukiyama']);
  assert.equal(engine.DEFAULT_RUSH_MODE, 'default');
});

test('simulateInvestment: 1回転目でzugar即PREMIUMなら投資額1000円・1回転', () => {
  const origRandom = Math.random;
  try {
    // spinNormal: rng=0でzugar。rollZugarPremium: rng<0.5でPREMIUM。
    Math.random = () => 0;
    const result = engine.simulateInvestment();
    assert.equal(result.spins, 1);
    assert.equal(result.toushi, 1000);
    assert.equal(result.zugarCount, 1);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].win, true);
  } finally {
    Math.random = origRandom;
  }
});

test('simulateInvestment: charge(RUSHに繋がらない)を挟んでからzugar PREMIUMに至る', () => {
  const origRandom = Math.random;
  try {
    let call = 0;
    // spinNormalは内部でzugar判定→false_enzoku判定→charge判定と最大3回rngを
    // 消費する。1回転目: 0.0015は3判定すべて(zugar超え・false_enzoku超え・
    // charge未満)を満たすのでcharge。2回転目: spinNormal→zugar(0で即短絡)
    // → rollZugarPremium→PREMIUM(0)。
    const seq = [0.0015, 0.0015, 0.0015, 0, 0];
    Math.random = () => seq[Math.min(call++, seq.length - 1)];
    const result = engine.simulateInvestment();
    assert.equal(result.chargeCount, 1);
    assert.equal(result.zugarCount, 1);
    assert.equal(result.events[0].type, 'charge');
    assert.equal(result.events[1].type, 'zugar');
    assert.equal(result.events[1].win, true);
  } finally {
    Math.random = origRandom;
  }
});

test('REACH_DIGIT_WEIGHTS の各行(hit/miss)の重みは合計約100', () => {
  const hitTotal = engine.REACH_DIGITS.reduce((s, d) => s + engine.REACH_DIGIT_WEIGHTS.hit[d], 0);
  const missTotal = engine.REACH_DIGITS.reduce((s, d) => s + engine.REACH_DIGIT_WEIGHTS.miss[d], 0);
  assert.ok(Math.abs(hitTotal - 100) < 1e-6);
  assert.ok(Math.abs(missTotal - 100) < 1e-6);
});

test('reachDigitHitRate: 7は100%、3は90%(指定通りの信頼度)', () => {
  assert.ok(Math.abs(engine.reachDigitHitRate(7) - 1) < 1e-9);
  assert.ok(Math.abs(engine.reachDigitHitRate(3) - 0.9) < 1e-9);
});

test('CONFIDENCE_COLOR_WEIGHTS: 各行(hit/miss)の重みは合計約100', () => {
  const hitTotal = engine.CONFIDENCE_COLORS.reduce((s, c) => s + engine.CONFIDENCE_COLOR_WEIGHTS.hit[c], 0);
  const missTotal = engine.CONFIDENCE_COLORS.reduce((s, c) => s + engine.CONFIDENCE_COLOR_WEIGHTS.miss[c], 0);
  assert.ok(Math.abs(hitTotal - 100) < 1e-6);
  assert.ok(Math.abs(missTotal - 100) < 1e-6);
});

test('confidenceColorHitRate: 点滅<青<緑<赤<虹の順で信頼度が上がる(指定通りの目標値)', () => {
  assert.ok(Math.abs(engine.confidenceColorHitRate('flash') - 0.07) < 1e-6);
  assert.ok(Math.abs(engine.confidenceColorHitRate('blue') - 0.33) < 1e-6);
  assert.ok(Math.abs(engine.confidenceColorHitRate('green') - 0.55) < 1e-6);
  assert.ok(Math.abs(engine.confidenceColorHitRate('red') - 0.95) < 1e-6);
  assert.ok(Math.abs(engine.confidenceColorHitRate('rainbow') - 1) < 1e-9);
});

test('rollConfidenceColor: hitでrng=0.999はrainbow、missでrng=0はnone', () => {
  assert.equal(engine.rollConfidenceColor(true, () => 0.999), 'rainbow');
  assert.equal(engine.rollConfidenceColor(false, () => 0), 'none');
});

test('TOKIGEKI_SENBARE_CHECKPOINTS は5箇所、TOKIGEKI_SENBARE_CHANCEは20%', () => {
  assert.equal(engine.TOKIGEKI_SENBARE_CHECKPOINTS.length, 5);
  assert.equal(engine.TOKIGEKI_SENBARE_CHANCE, 0.2);
});

test('rollTokigekiSenbare: rng<0.2でtrue', () => {
  assert.equal(engine.rollTokigekiSenbare(() => 0.1), true);
  assert.equal(engine.rollTokigekiSenbare(() => 0.5), false);
});
