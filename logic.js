'use strict';

// ---- 通常時（pachinko-simulator-ghouldeka の現行仕様をそのまま移植） ----
// ghouldekaには回転数レートの選択肢がなく、30回転/千円で固定。

const SPIN_COST = 250 / 30;

const P_ZUGAR        = 1 / 999.9;
const P_CHARGE       = 1 / 538.3;
const P_FALSE_ENZOKU = P_ZUGAR * (0.3 / 0.7);

function spinNormal() {
  if (Math.random() < P_ZUGAR)        return 'zugar';
  if (Math.random() < P_FALSE_ENZOKU) return 'false_enzoku';
  if (Math.random() < P_CHARGE)       return 'charge';
  return 'miss';
}

// 図柄ぞろい後の内訳抽選：50%で7500 PREMIUM(+7000球・RUSH突入)、
// 50%で3000(+2800球・RUSHには繋がらず通常のまま)。
function rollZugarPremium() {
  return Math.random() < 0.5;
}

// ---- RUSH構造（新方式） ----
// 電サポ残り5回リセット方式（ghouldeka現行と同じ）。当たり時のボーナスだけ、
// 「3000確定＋自動連結の50%上乗せ連鎖」という本プロジェクト独自ルールに変更している
// （現行ghouldekaの6000/3000二択・上乗せ判定は廃止）。

const P_RUSH             = 1 / 7.7;
const RUSH_BASE_REMAINING = 5;
const P_RUSH_ADD_CHANCE  = 0.5;
const RUSH_HIT_ACTUAL_BALLS  = 2800;
const RUSH_HIT_NOMINAL_BALLS = 3000;

function createRushState() {
  return {
    remaining: RUSH_BASE_REMAINING,
    chainCount: 0,
    actualBalls: 0,
    nominalBalls: 0,
  };
}

// 電サポ1回転ぶんを解決する。当たりの場合は上乗せ連鎖（失敗するまで50%を
// 引き続ける）もこの中で最後まで解決し、addChainCount（3000を何回積んだか、
// 最初の1回を含む）を結果に含める。ビュー側はaddChainCountを使って
// 「3000→6000→9000…」の演出を段階的に再生する（乱数の引き直しはしない）。
function applyRushSpin(rushState) {
  const isHit = Math.random() < P_RUSH;

  if (!isHit) {
    const remaining = rushState.remaining - 1;
    if (remaining <= 0) {
      return { rushState: { ...rushState, remaining: 0 }, outcome: 'rush_end' };
    }
    return { rushState: { ...rushState, remaining }, outcome: 'miss' };
  }

  let addChainCount = 1;
  while (Math.random() < P_RUSH_ADD_CHANCE) {
    addChainCount++;
  }

  const actualBallsGained  = addChainCount * RUSH_HIT_ACTUAL_BALLS;
  const nominalBallsGained = addChainCount * RUSH_HIT_NOMINAL_BALLS;

  const newState = {
    remaining: RUSH_BASE_REMAINING,
    chainCount: rushState.chainCount + 1,
    actualBalls:  rushState.actualBalls  + actualBallsGained,
    nominalBalls: rushState.nominalBalls + nominalBallsGained,
  };

  return {
    rushState: newState,
    outcome: 'hit',
    addChainCount,
    actualBallsGained,
    nominalBallsGained,
  };
}

// 外れ変動のうち、ガセリーチになる確率（確定値。保留色などから逆算しない）。
const P_FAKE_REACH_GIVEN_MISS = 0.5;

function rollIsReach(isHit) {
  return isHit ? true : Math.random() < P_FAKE_REACH_GIVEN_MISS;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SPIN_COST,
    P_ZUGAR,
    P_CHARGE,
    P_FALSE_ENZOKU,
    spinNormal,
    rollZugarPremium,
    P_RUSH,
    RUSH_BASE_REMAINING,
    P_RUSH_ADD_CHANCE,
    RUSH_HIT_ACTUAL_BALLS,
    RUSH_HIT_NOMINAL_BALLS,
    createRushState,
    applyRushSpin,
    P_FAKE_REACH_GIVEN_MISS,
    rollIsReach,
  };
}
