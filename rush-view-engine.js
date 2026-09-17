'use strict';

// ブラウザでは logic.js の function 宣言はグローバルに公開されるが、const宣言は
// プロパティとして公開されない。pachinko-simulator-ghoul-rushと同じ理由で、
// ブラウザ分岐では両方を明示的にオブジェクトへ集約する。
const _logic = typeof require !== 'undefined'
  ? require('./logic.js')
  : {
      SPIN_COST, P_ZUGAR, P_CHARGE, P_FALSE_ENZOKU, spinNormal, rollZugarPremium,
      P_RUSH, RUSH_BASE_REMAINING, P_RUSH_ADD_CHANCE,
      RUSH_HIT_ACTUAL_BALLS, RUSH_HIT_NOMINAL_BALLS,
      createRushState, applyRushSpin, P_FAKE_REACH_GIVEN_MISS, rollIsReach,
    };

const YEN_PER_BALL = 4;
const BALLS_PER_1000YEN = 250;

function ballsToYen(balls) {
  return balls * YEN_PER_BALL;
}

// 通常時を「図柄ぞろい→7500 PREMIUM(RUSH突入)」まで裏側で高速シミュレートし、
// 投資額(円)・回転数・道中の詳細(events)を返す。ghouldekaの現行仕様では
// チャージはRUSHに繋がらないため(+280球のみ)、zugarでPREMIUMを引くまで
// ループし続ける。
function simulateInvestment() {
  let mochiDama = 0;
  let toushi = 0;
  let spins = 0;
  let chargeCount = 0;
  let zugarCount = 0;
  const events = [];

  for (;;) {
    const cost = _logic.SPIN_COST;
    if (mochiDama >= cost) {
      mochiDama -= cost;
    } else {
      const shortfall = cost - mochiDama;
      const units = Math.ceil(shortfall / BALLS_PER_1000YEN);
      toushi += units * 1000;
      mochiDama = units * BALLS_PER_1000YEN - shortfall;
    }
    spins++;

    const result = _logic.spinNormal();
    if (result === 'miss' || result === 'false_enzoku') continue;

    if (result === 'charge') {
      chargeCount++;
      mochiDama += 280;
      events.push({ spins, type: 'charge', win: false, ballsUsed: toushi / YEN_PER_BALL });
      continue;
    }

    // zugar
    zugarCount++;
    const isPremium = _logic.rollZugarPremium();
    mochiDama += isPremium ? 7000 : 2800;
    events.push({ spins, type: 'zugar', win: isPremium, ballsUsed: toushi / YEN_PER_BALL });
    if (isPremium) {
      return { spins, toushi, chargeCount, zugarCount, events };
    }
  }
}

const RUSH_MODE_OPTIONS = [
  { id: 'default',   label: 'デフォルト' },
  { id: 'tokigeki',  label: '突撃' },
  { id: 'rize',      label: 'リゼ襲来' },
  { id: 'tsukiyama', label: '月山絶叫' },
];
const DEFAULT_RUSH_MODE = 'default';

// ---- テンパイ数字（1〜8）の重み ----
// pachinko-simulator-ghoul-rushと同じ考え方：当落そのもの(P_RUSH)には触れず、
// リーチの両端に出す数字だけを当落に応じた重み付き抽選にする。7・3は信頼度を
// 明示指定し、残り6数字は均等に分け合う。ガセリーチ発生率は本プロジェクトでは
// 保留色から逆算せず、P_FAKE_REACH_GIVEN_MISS(0.5)固定値を使う。
const REACH_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8];
const REACH_DIGIT_RELIABILITY = { 7: 1, 3: 0.9 };
const REACH_DIGIT_HIT_SHARE = { 7: 5, 3: 10 };
const OTHER_REACH_DIGITS = REACH_DIGITS.filter((d) => !(d in REACH_DIGIT_HIT_SHARE));

function buildReachDigitWeights() {
  const pHit = _logic.P_RUSH;
  const pFakeReach = (1 - pHit) * _logic.P_FAKE_REACH_GIVEN_MISS;

  const hit = {};
  const miss = {};

  const otherHitShare = (100 - Object.values(REACH_DIGIT_HIT_SHARE).reduce((s, v) => s + v, 0))
    / OTHER_REACH_DIGITS.length;

  for (const digit of REACH_DIGITS) {
    hit[digit] = digit in REACH_DIGIT_HIT_SHARE ? REACH_DIGIT_HIT_SHARE[digit] : otherHitShare;
  }

  for (const digit of [7, 3]) {
    const reliability = REACH_DIGIT_RELIABILITY[digit];
    miss[digit] = reliability >= 1
      ? 0
      : (hit[digit] * pHit * (1 - reliability)) / (reliability * pFakeReach);
  }
  const otherMissShare = (100 - miss[7] - miss[3]) / OTHER_REACH_DIGITS.length;
  for (const digit of OTHER_REACH_DIGITS) {
    miss[digit] = otherMissShare;
  }

  return { hit, miss };
}

const REACH_DIGIT_WEIGHTS = buildReachDigitWeights();

function rollReachDigit(isHit, rng = Math.random) {
  const weights = isHit ? REACH_DIGIT_WEIGHTS.hit : REACH_DIGIT_WEIGHTS.miss;
  const total = REACH_DIGITS.reduce((sum, d) => sum + weights[d], 0);
  let r = rng() * total;
  for (const digit of REACH_DIGITS) {
    r -= weights[digit];
    if (r < 0) return digit;
  }
  return REACH_DIGITS[REACH_DIGITS.length - 1];
}

function reachDigitHitRate(digit) {
  const pHit = _logic.P_RUSH;
  const pFakeReach = (1 - pHit) * _logic.P_FAKE_REACH_GIVEN_MISS;
  const wHit  = REACH_DIGIT_WEIGHTS.hit[digit] / 100;
  const wMiss = REACH_DIGIT_WEIGHTS.miss[digit] / 100;
  const pDigit = pHit * wHit + pFakeReach * wMiss;
  if (pDigit === 0) return 0;
  return (pHit * wHit) / pDigit;
}

// ---- 月山絶叫モード：予告ボタンの色（白/点滅/青/緑/赤/虹） ----
// pachinko-simulator-ghoul-rushのHOLD_COLOR系と同じ考え方・同じ信頼度目標値を、
// 本プロジェクトのP_RUSH(1/7.7)ベースで再計算する。「保留」ではなく「このリーチの
// 当落」に対する確信度を表す色として使う。
const CONFIDENCE_COLORS = ['none', 'flash', 'blue', 'green', 'red', 'rainbow'];

const COLOR_RELIABILITY = { flash: 0.07, blue: 0.33, green: 0.55, red: 0.95, rainbow: 1 };
const RAINBOW_OCCURRENCE_RATE = 0.0005;
const HIT_NONE_SHARE = 0.40;
const GREEN_OCCURRENCE_SHARE = 0.05;
const COLOR_OCCURRENCE_SHARE = {
  flash: 0.70,
  blue: 0.12,
  green: GREEN_OCCURRENCE_SHARE,
  red: GREEN_OCCURRENCE_SHARE / 3,
};

function buildConfidenceColorWeights() {
  const pHit = _logic.P_RUSH;
  const pMiss = 1 - pHit;

  function deriveMissWeight(color, wHit) {
    const reliability = COLOR_RELIABILITY[color];
    return reliability >= 1
      ? 0
      : (wHit * pHit * (1 - reliability)) / (reliability * pMiss);
  }

  const hit = {};
  const miss = {};

  hit.rainbow = (RAINBOW_OCCURRENCE_RATE * 100 * COLOR_RELIABILITY.rainbow) / pHit;
  miss.rainbow = deriveMissWeight('rainbow', hit.rainbow);

  const remainingHitBudget = 100 * (1 - HIT_NONE_SHARE) - hit.rainbow;
  const shareColors = Object.keys(COLOR_OCCURRENCE_SHARE);
  const weightedShareTotal = shareColors.reduce(
    (sum, c) => sum + COLOR_OCCURRENCE_SHARE[c] * COLOR_RELIABILITY[c],
    0
  );
  for (const color of shareColors) {
    const weightedShare = COLOR_OCCURRENCE_SHARE[color] * COLOR_RELIABILITY[color];
    hit[color] = remainingHitBudget * (weightedShare / weightedShareTotal);
    miss[color] = deriveMissWeight(color, hit[color]);
  }

  hit.none = 100 - Object.values(hit).reduce((sum, v) => sum + v, 0);
  miss.none = 100 - Object.values(miss).reduce((sum, v) => sum + v, 0);
  return { hit, miss };
}

const CONFIDENCE_COLOR_WEIGHTS = buildConfidenceColorWeights();

function rollConfidenceColor(isHit, rng = Math.random) {
  const weights = isHit ? CONFIDENCE_COLOR_WEIGHTS.hit : CONFIDENCE_COLOR_WEIGHTS.miss;
  const total = CONFIDENCE_COLORS.reduce((sum, c) => sum + weights[c], 0);
  let r = rng() * total;
  for (const color of CONFIDENCE_COLORS) {
    r -= weights[color];
    if (r < 0) return color;
  }
  return CONFIDENCE_COLORS[CONFIDENCE_COLORS.length - 1];
}

function confidenceColorHitRate(color) {
  const pHit = _logic.P_RUSH;
  const pMiss = 1 - pHit;
  const wHit  = CONFIDENCE_COLOR_WEIGHTS.hit[color] / 100;
  const wMiss = CONFIDENCE_COLOR_WEIGHTS.miss[color] / 100;
  const pColor = pHit * wHit + pMiss * wMiss;
  if (pColor === 0) return 0;
  return (pHit * wHit) / pColor;
}

// ---- 突撃モード：手落下の発生箇所 ----
// 当たりの変動シーケンス中、5箇所を順にチェックし、最初に20%を引いた箇所で
// 1回だけカットインする(以降は判定しない)。
const TOKIGEKI_SENBARE_CHECKPOINTS = [
  'pocket_in',
  'spin_start',
  'aori_start',
  'reach_start',
  'reach_hold',
];
const TOKIGEKI_SENBARE_CHANCE = 0.2;

// 呼び出し側は変動シーケンスを進めながら、各チェックポイントでこの関数を呼ぶ。
// 一度trueを返したら、そのシーケンスでは以降呼ばない(呼び出し側の責務)。
function rollTokigekiSenbare(rng = Math.random) {
  return rng() < TOKIGEKI_SENBARE_CHANCE;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    YEN_PER_BALL,
    BALLS_PER_1000YEN,
    ballsToYen,
    simulateInvestment,
    RUSH_MODE_OPTIONS,
    DEFAULT_RUSH_MODE,
    REACH_DIGITS,
    REACH_DIGIT_WEIGHTS,
    rollReachDigit,
    reachDigitHitRate,
    CONFIDENCE_COLORS,
    CONFIDENCE_COLOR_WEIGHTS,
    rollConfidenceColor,
    confidenceColorHitRate,
    TOKIGEKI_SENBARE_CHECKPOINTS,
    TOKIGEKI_SENBARE_CHANCE,
    rollTokigekiSenbare,
  };
}
