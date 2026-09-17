'use strict';

const game = {
  mode: DEFAULT_RUSH_MODE,
  investment: null,
  rush: null,
  spinning: false,
  stats: { totalPlays: 0, totalProfit: 0, maxChain: 0, totalBalls: 0 },
  pendingTimeoutId: null,
  history: [],
};

const HISTORY_MAX_ITEMS = 50;

let modeSelectEl, startBtnEl,
    overlayEl, overlayBoxEl, rizeFlashOverlayEl, startControlsEl,
    totalPlaysValueEl, totalProfitValueEl, maxChainValueEl, totalBallsValueEl,
    lcdScreenEl, lcdDigitEls,
    tsukiyamaBtnRowEl, tsukiyamaBtnEl,
    rushStatusRowEl, esupRemainingValueEl, chainCountValueEl, rushBallsValueEl,
    rushMoneyRowEl, rushToushiValueEl, rushProfitValueEl,
    modeSwitchRowEl, rushModeBtnsEl,
    rushScreenEl, pocketBallEl, tameruBtnEl,
    specRushProbEl, specPieEl, specLegendEl,
    introTabBtnEl, introTextEl, historyListEl;

function cacheDomRefs() {
  modeSelectEl = document.getElementById('mode-select');
  startBtnEl = document.getElementById('start-btn');
  overlayEl = document.getElementById('overlay');
  overlayBoxEl = document.getElementById('overlay-box');
  rizeFlashOverlayEl = document.getElementById('rize-flash-overlay');
  startControlsEl = document.getElementById('start-controls');
  totalPlaysValueEl = document.getElementById('total-plays-value');
  totalProfitValueEl = document.getElementById('total-profit-value');
  maxChainValueEl = document.getElementById('max-chain-value');
  totalBallsValueEl = document.getElementById('total-balls-value');
  lcdScreenEl = document.getElementById('lcd-screen');
  lcdDigitEls = Array.from(document.querySelectorAll('.lcd-digit'));
  tsukiyamaBtnRowEl = document.getElementById('tsukiyama-btn-row');
  tsukiyamaBtnEl = document.getElementById('tsukiyama-btn');
  rushStatusRowEl = document.getElementById('rush-status-row');
  esupRemainingValueEl = document.getElementById('esup-remaining-value');
  chainCountValueEl = document.getElementById('chain-count-value');
  rushBallsValueEl = document.getElementById('rush-balls-value');
  rushMoneyRowEl = document.getElementById('rush-money-row');
  rushToushiValueEl = document.getElementById('rush-toushi-value');
  rushProfitValueEl = document.getElementById('rush-profit-value');
  modeSwitchRowEl = document.getElementById('mode-switch-row');
  rushModeBtnsEl = document.getElementById('rush-mode-btns');
  rushScreenEl = document.getElementById('rush-screen');
  pocketBallEl = document.getElementById('pocket-ball');
  tameruBtnEl = document.getElementById('tameru-btn');
  specRushProbEl = document.getElementById('spec-rush-prob');
  specPieEl = document.getElementById('spec-pie');
  specLegendEl = document.getElementById('spec-legend');
  introTabBtnEl = document.getElementById('intro-tab-btn');
  introTextEl = document.getElementById('intro-text');
  historyListEl = document.getElementById('history-list');
}

function populateSelects() {
  modeSelectEl.innerHTML = RUSH_MODE_OPTIONS.map(
    (m) => `<option value="${m.id}" ${m.id === DEFAULT_RUSH_MODE ? 'selected' : ''}>${m.label}</option>`
  ).join('');
  rushModeBtnsEl.innerHTML = RUSH_MODE_OPTIONS.map(
    (m) => `<button type="button" class="speed-btn" data-mode="${m.id}">${m.label}</button>`
  ).join('');
}

// ---- 開始画面のスペックパネル：大当たり確率＋ラッシュの性能(円グラフ) ----
// 階層(3000〜15000以上)は「連続して上乗せに成功した回数」という順序のある
// 区分(ordinal)なので、単一色相(金)の明度を段階的に下げて順序を表現する
// (datavizスキルのordinalルールに従い、5段階でvalidate_palette.js --ordinal
// を通した配色)。
const CHAIN_TIER_COLORS = ['#fbe6a8', '#f0c040', '#c9962c', '#9c6f1f', '#6e4a12'];

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSlicePath(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const p1 = polarToCartesian(cx, cy, rOuter, endAngle);
  const p2 = polarToCartesian(cx, cy, rOuter, startAngle);
  const p3 = polarToCartesian(cx, cy, rInner, startAngle);
  const p4 = polarToCartesian(cx, cy, rInner, endAngle);
  return [
    'M', p1.x, p1.y,
    'A', rOuter, rOuter, 0, largeArc, 0, p2.x, p2.y,
    'L', p3.x, p3.y,
    'A', rInner, rInner, 0, largeArc, 1, p4.x, p4.y,
    'Z',
  ].join(' ');
}

function tierLabel(tier) {
  return tier.isTail ? `${tier.nominalBalls.toLocaleString()}以上` : `${tier.nominalBalls.toLocaleString()}`;
}

function renderSpecPanel() {
  specRushProbEl.textContent = '1/7.7';

  const cx = 60, cy = 60, rOuter = 54, rInner = 30;
  let angle = 0;
  const slicesHtml = RUSH_CHAIN_TIER_DISTRIBUTION.map((tier, i) => {
    const sweep = tier.probability * 360;
    const path = donutSlicePath(cx, cy, rOuter, rInner, angle, angle + sweep);
    angle += sweep;
    return `<path class="spec-pie-slice" d="${path}" fill="${CHAIN_TIER_COLORS[i]}"></path>`;
  }).join('');

  const avgNominal = Math.round(averageChainNominalBalls());
  const centerHtml = `
    <text x="${cx}" y="${cy - 4}" class="spec-pie-center-value">${avgNominal.toLocaleString()}</text>
    <text x="${cx}" y="${cy + 9}" class="spec-pie-center-label">平均獲得出玉</text>
  `;

  specPieEl.innerHTML = slicesHtml + centerHtml;

  specLegendEl.innerHTML = RUSH_CHAIN_TIER_DISTRIBUTION.map((tier, i) => `
    <div class="spec-legend-row">
      <span class="spec-legend-swatch" style="background:${CHAIN_TIER_COLORS[i]}"></span>
      <span class="spec-legend-label">${tierLabel(tier)}（実質${tier.actualBalls.toLocaleString()}発）</span>
      <span class="spec-legend-value">${Math.round(tier.probability * 100)}%</span>
    </div>
  `).join('');
}

function bindEvents() {
  modeSelectEl.addEventListener('change', () => {
    game.mode = modeSelectEl.value;
    renderRushModeButtons();
  });
  startBtnEl.addEventListener('click', startInvestmentFlow);
  rushModeBtnsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.speed-btn');
    if (!btn) return;
    game.mode = btn.dataset.mode;
    modeSelectEl.value = game.mode;
    renderRushModeButtons();
  });
  tameruBtnEl.addEventListener('click', handleTameru);
  // 月山絶叫モードの予告ボタン：一度押したら連打できないよう無効化する。
  // 当選(isHit)なら確定でレインボー+文言「僕のだぞ！」に変える(抽選にすると
  // 無色が出て「色が変わらない」ように見えてしまうため、当選時は必ず視覚的な
  // 変化を保証する)。外れ(ガセリーチ)のときだけ、confidence色の抽選で
  // 1回だけ色を決めて光らせる(この場合は無色になることもある)。
  tsukiyamaBtnEl.addEventListener('click', () => {
    if (tsukiyamaBtnEl.disabled || tsukiyamaBtnIsHit === null) return;
    tsukiyamaBtnEl.disabled = true;
    if (tsukiyamaBtnIsHit) {
      tsukiyamaBtnEl.classList.add('tsukiyama-btn-rainbow');
      tsukiyamaBtnEl.textContent = '僕のだぞ！';
    } else {
      const color = rollConfidenceColor(false);
      tsukiyamaBtnEl.classList.add(`tsukiyama-btn-${color}`);
    }
  });
  introTabBtnEl.addEventListener('click', () => {
    introTextEl.hidden = !introTextEl.hidden;
    introTabBtnEl.textContent = introTextEl.hidden ? '説明を見る' : '説明を閉じる';
  });
}

function renderRushModeButtons() {
  Array.from(rushModeBtnsEl.querySelectorAll('.speed-btn')).forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === game.mode);
  });
}

function renderStats() {
  totalPlaysValueEl.textContent = game.stats.totalPlays.toLocaleString();
  const profit = game.stats.totalProfit;
  totalProfitValueEl.textContent = `${profit >= 0 ? '+' : ''}${profit.toLocaleString()}`;
  totalProfitValueEl.classList.remove('green', 'red', 'gold');
  totalProfitValueEl.classList.add(profit > 0 ? 'green' : profit < 0 ? 'red' : 'gold');
  maxChainValueEl.textContent = `${game.stats.maxChain}連`;
  totalBallsValueEl.textContent = game.stats.totalBalls.toLocaleString();
}

// ---- 履歴(常時表示) ----

const EVENT_TYPE_LABELS = { charge: 'チャージ', zugar: '図柄ぞろい' };

function addHistoryEntry(spins, profit, events) {
  game.history.unshift({ spins, profit, events });
  if (game.history.length > HISTORY_MAX_ITEMS) game.history.pop();
  renderHistory();
}

function renderHistory() {
  if (game.history.length === 0) {
    historyListEl.innerHTML = '<div class="history-empty">まだ履歴がありません</div>';
    return;
  }
  historyListEl.innerHTML = game.history.map((entry, i) => {
    const n = game.history.length - i;
    const cls = entry.profit > 0 ? 'green' : entry.profit < 0 ? 'red' : 'gold';
    const sign = entry.profit >= 0 ? '+' : '';
    const eventsHtml = entry.events.map((ev) => {
      const label = EVENT_TYPE_LABELS[ev.type];
      const resultText = ev.win ? 'RUSH突入！' : ev.type === 'zugar' ? '通常へ' : '';
      return `<div class="history-event-line ${ev.win ? 'win' : ''}">${ev.spins.toLocaleString()}回転目 ${label}発生${resultText ? ` → ${resultText}` : ''}（${Math.round(ev.ballsUsed).toLocaleString()}発消費）</div>`;
    }).join('');
    return `
      <div class="history-entry">
        <div class="history-item">
          <span class="hi-n">${n}回目：大当たりまで${entry.spins.toLocaleString()}回転</span>
          <span class="hi-profit ${cls}">${sign}${entry.profit.toLocaleString()}円</span>
        </div>
        <div class="history-events">${eventsHtml}</div>
      </div>
    `;
  }).join('');
}

function showOverlay(html) {
  overlayBoxEl.innerHTML = html;
  overlayEl.hidden = false;
}

function hideOverlay() {
  overlayEl.hidden = true;
  overlayBoxEl.innerHTML = '';
}

function popupHtml(inner) {
  return `<div class="screen">${inner}</div>`;
}

// ---- 投資額シミュレーション〜RUSH突入演出 ----

function startInvestmentFlow() {
  startControlsEl.hidden = true;

  game.investment = simulateInvestment();
  const { toushi, spins, chargeCount, zugarCount } = game.investment;

  showOverlay(popupHtml(`
    <div class="result-main charge">投資額 ${toushi.toLocaleString()}円</div>
    <div class="result-sub">（${spins.toLocaleString()}回転）</div>
    <div class="result-detail">道中の内訳：チャージ ${chargeCount}回 ／ 図柄ぞろい ${zugarCount}回</div>
  `));

  game.pendingTimeoutId = setTimeout(showRouteTelop, 1800);
}

function showRouteTelop() {
  showOverlay(popupHtml('<div class="result-main rush">図柄ぞろい → 7500 PREMIUM！</div>'));
  game.pendingTimeoutId = setTimeout(showRushEntry, 1600);
}

function showRushEntry() {
  showOverlay(popupHtml('<div class="rush-title rush-title-enter">RUSH突入！</div>'));
  game.pendingTimeoutId = setTimeout(() => {
    hideOverlay();
    enterRush();
  }, 2000);
}

// ---- RUSH中 ----

function enterRush() {
  game.rush = createRushState();
  game.rush.actualBalls = 7000;
  game.rush.nominalBalls = 7500;
  game.spinning = false;

  rushScreenEl.hidden = false;
  rushStatusRowEl.hidden = false;
  rushMoneyRowEl.hidden = false;
  modeSwitchRowEl.hidden = false;
  renderRushModeButtons();
  resetLcdScreen();
  renderRushStatus();
  renderRushMoney();
  tameruBtnEl.disabled = false;
}

function renderRushStatus() {
  esupRemainingValueEl.textContent = game.rush.remaining;
  chainCountValueEl.textContent = game.rush.chainCount;
  rushBallsValueEl.textContent = game.rush.actualBalls.toLocaleString();
}

function renderRushMoney() {
  rushToushiValueEl.textContent = `${game.investment.toushi.toLocaleString()}円`;
  const profit = ballsToYen(game.rush.actualBalls) - game.investment.toushi;
  rushProfitValueEl.textContent = `${profit >= 0 ? '+' : ''}${profit.toLocaleString()}円`;
  rushProfitValueEl.classList.remove('green', 'red');
  if (profit > 0) rushProfitValueEl.classList.add('green');
  else if (profit < 0) rushProfitValueEl.classList.add('red');
}

// ---- 「貯める」1回分のシーケンス ----
// ポケット投入→スピン開始→あおり→(リーチ確定 or リーチなし外れ)→結果、
// という一連の演出を1回の押下ぶんだけ進める。当落・リーチ有無・テンパイ数字・
// 突撃モードの手落下発生箇所は、演出を始める前にすべて事前に抽選しておき、
// 演出はその結果を再生するだけ(演出の途中で新たに抽選しない)。

const POCKET_IN_MS = 500;
const SPIN_START_MS = 400;
const AORI_MS = 600;
const MISS_SPIN_MS = 1500;
const MISS_RESULT_MS = 900;
const RUSH_END_RESULT_MS = 1200;

function pickTokigekiSenbareCheckpoint() {
  for (const checkpoint of TOKIGEKI_SENBARE_CHECKPOINTS) {
    if (rollTokigekiSenbare()) return checkpoint;
  }
  return null;
}

function handleTameru() {
  if (game.spinning) return;
  game.spinning = true;
  tameruBtnEl.disabled = true;

  const mode = game.mode;
  const spinResult = applyRushSpin(game.rush);
  const isHit = spinResult.outcome === 'hit';
  const isReach = rollIsReach(isHit);
  const reachDigit = isReach ? rollReachDigit(isHit) : null;
  const senbareCheckpoint = (mode === 'tokigeki' && isHit) ? pickTokigekiSenbareCheckpoint() : null;
  const showRize = mode === 'rize' && isHit;

  function maybeSenbare(checkpoint, onDone) {
    if (senbareCheckpoint === checkpoint) {
      showSenbareCutin(onDone);
    } else {
      onDone();
    }
  }

  function runPocketIn() {
    pocketBallEl.hidden = false;
    void pocketBallEl.offsetWidth;
    pocketBallEl.classList.add('pocket-drop');
    if (showRize) showRizeFlash();
    maybeSenbare('pocket_in', () => {
      game.pendingTimeoutId = setTimeout(runSpinStart, POCKET_IN_MS);
    });
  }

  function runSpinStart() {
    pocketBallEl.classList.remove('pocket-drop');
    pocketBallEl.hidden = true;
    startLcdSpin([0, 1, 2]);
    maybeSenbare('spin_start', () => {
      game.pendingTimeoutId = setTimeout(runAori, SPIN_START_MS);
    });
  }

  function runAori() {
    lcdScreenEl.classList.add('lcd-aori');
    maybeSenbare('aori_start', () => {
      game.pendingTimeoutId = setTimeout(() => {
        lcdScreenEl.classList.remove('lcd-aori');
        if (isReach) runReachStart(); else runPlainMiss();
      }, AORI_MS);
    });
  }

  function runPlainMiss() {
    game.pendingTimeoutId = setTimeout(() => {
      stopLcdSpin();
      randomNonMatchingTriple().forEach((d, i) => setLcdDigit(i, d));
      game.pendingTimeoutId = setTimeout(resolveSpin, 300);
    }, MISS_SPIN_MS);
  }

  function runReachStart() {
    maybeSenbare('reach_start', () => {
      game.pendingTimeoutId = setTimeout(() => {
        setLcdDigit(0, reachDigit);
        setLcdDigit(2, reachDigit);
        lcdScreenEl.classList.add('lcd-reach');
        startLcdSpin([1]);
        if (mode === 'tsukiyama') showTsukiyamaButton(isHit);
        runReachHold();
      }, LCD_REACH_START_DELAY_MS);
    });
  }

  function runReachHold() {
    // 手落下チェックポイント'reach_hold'はテンパイ保持の中間に置く。
    game.pendingTimeoutId = setTimeout(() => {
      maybeSenbare('reach_hold', () => {
        game.pendingTimeoutId = setTimeout(finishReach, LCD_REACH_HOLD_MS / 2);
      });
    }, LCD_REACH_HOLD_MS / 2);
  }

  function finishReach() {
    stopLcdSpin();
    lcdScreenEl.classList.remove('lcd-reach');
    hideTsukiyamaButton();
    if (isHit) {
      setLcdDigit(1, reachDigit);
      lcdScreenEl.classList.add('lcd-aligned');
      game.pendingTimeoutId = setTimeout(resolveSpin, LCD_ALIGN_TO_NEXT_MS);
    } else {
      setLcdDigit(1, nearMissDigit(reachDigit));
      game.pendingTimeoutId = setTimeout(resolveSpin, 300);
    }
  }

  function resolveSpin() {
    vanishLcdDigits(() => {
      game.rush = spinResult.rushState;
      if (isHit) {
        playUenoseChain(spinResult.addChainCount, () => {
          renderRushStatus();
          renderRushMoney();
          backToIdle();
        });
      } else {
        renderRushStatus();
        renderRushMoney();
        if (spinResult.outcome === 'rush_end') {
          showMissResult(true, finishRushNow);
        } else {
          showMissResult(false, backToIdle);
        }
      }
    });
  }

  runPocketIn();
}

function backToIdle() {
  hideOverlay();
  resetLcdScreen();
  game.spinning = false;
  tameruBtnEl.disabled = false;
}

// ---- 手落下・リゼ襲来・上乗せ連鎖・外れ結果の表示 ----

const TOKIGEKI_SENBARE_MS = 1000;
const RIZE_FLASH_MS = 700;

function showSenbareCutin(onDone) {
  showOverlay(popupHtml(`
    <img src="画像/グール先バレ.webp" class="senbare-img" alt="先バレ">
    <div class="senbare-comment">手落下！</div>
  `));
  game.pendingTimeoutId = setTimeout(() => {
    hideOverlay();
    onDone();
  }, TOKIGEKI_SENBARE_MS);
}

function showRizeFlash() {
  rizeFlashOverlayEl.hidden = false;
  setTimeout(() => {
    rizeFlashOverlayEl.hidden = true;
  }, RIZE_FLASH_MS);
}

const CHAIN_JUDGE_MS = 500;
const CHAIN_REVEAL_MS = 900;
const CHAIN_FINAL_MS = 1400;

// 当たり確定後の「3000確定→50%上乗せ判定→…」を自動で最後まで再生する。
// addChainCountは既にlogic.jsで確定済み(乱数の引き直しはしない)。
function playUenoseChain(addChainCount, onDone) {
  let shown = 1;
  showChainStep(shown, false);
  game.pendingTimeoutId = setTimeout(stepNext, CHAIN_REVEAL_MS);

  function stepNext() {
    if (shown >= addChainCount) {
      showChainFinal(shown);
      game.pendingTimeoutId = setTimeout(() => {
        hideOverlay();
        onDone();
      }, CHAIN_FINAL_MS);
      return;
    }
    showChainJudge();
    game.pendingTimeoutId = setTimeout(() => {
      shown++;
      showChainStep(shown, true);
      game.pendingTimeoutId = setTimeout(stepNext, CHAIN_REVEAL_MS);
    }, CHAIN_JUDGE_MS);
  }
}

function showChainStep(count, isAdd) {
  const nominal = count * 3000;
  showOverlay(popupHtml(`
    ${isAdd ? '<div class="add-rush-title">上乗せ成功！</div>' : ''}
    <img src="画像/RUSH中　追加ボーナス演出.png" class="enzoku-img" alt="ボーナス演出">
    <div class="chain-label">${nominal.toLocaleString()}ボーナス（${count}連続）</div>
  `));
}

function showChainJudge() {
  showOverlay(popupHtml(`
    <div class="result-main charge">上乗せ判定中…</div>
    <div class="result-sub">継続率50%</div>
  `));
}

function showChainFinal(count) {
  const nominal = count * 3000;
  showOverlay(popupHtml(`
    <div class="result-main lose">上乗せ失敗…</div>
    <div class="chain-label">${nominal.toLocaleString()}ボーナスで確定</div>
  `));
}

function showMissResult(isRushEnd, onDone) {
  showOverlay(popupHtml(`
    <div class="result-main lose" style="${isRushEnd ? 'font-size:26px;' : ''}">${isRushEnd ? '電サポ終了…' : 'はずれ'}</div>
    ${!isRushEnd ? `<div class="result-sub">電サポ残り ${game.rush.remaining}回</div>` : ''}
  `));
  game.pendingTimeoutId = setTimeout(() => {
    hideOverlay();
    onDone();
  }, isRushEnd ? RUSH_END_RESULT_MS : MISS_RESULT_MS);
}

// ---- 月山絶叫モード：予告ボタン ----

let tsukiyamaBtnIsHit = null;

function showTsukiyamaButton(isHit) {
  tsukiyamaBtnIsHit = isHit;
  tsukiyamaBtnEl.className = 'tsukiyama-btn';
  tsukiyamaBtnEl.textContent = '絶叫ボタン';
  tsukiyamaBtnEl.disabled = false;
  tsukiyamaBtnRowEl.hidden = false;
}

function hideTsukiyamaButton() {
  tsukiyamaBtnRowEl.hidden = true;
  tsukiyamaBtnEl.className = 'tsukiyama-btn';
  tsukiyamaBtnEl.textContent = '絶叫ボタン';
  tsukiyamaBtnEl.disabled = false;
  tsukiyamaBtnIsHit = null;
}

// ---- 液晶(3桁)演出 ----

const LCD_SPIN_TICK_MS = 70;
const LCD_REACH_START_DELAY_MS = 280;
const LCD_REACH_HOLD_MS = 3000;
const LCD_ALIGN_TO_NEXT_MS = 500;
const LCD_VANISH_MS = 200;

let lcdSpinIntervalId = null;

function randomDigit() {
  return Math.floor(Math.random() * 8) + 1; // 1〜8
}

function randomNonMatchingTriple() {
  const a = randomDigit();
  let b = randomDigit();
  while (b === a) b = randomDigit();
  let c = randomDigit();
  while (c === a) c = randomDigit();
  return [a, b, c];
}

function nearMissDigit(reachDigit) {
  return reachDigit >= 8 ? 1 : reachDigit + 1;
}

function setLcdDigit(index, value) {
  const el = lcdDigitEls[index];
  if (el) el.textContent = value === null ? '-' : String(value);
}

function startLcdSpin(indices) {
  stopLcdSpin();
  lcdSpinIntervalId = setInterval(() => {
    indices.forEach((i) => setLcdDigit(i, randomDigit()));
  }, LCD_SPIN_TICK_MS);
}

function stopLcdSpin() {
  if (lcdSpinIntervalId !== null) {
    clearInterval(lcdSpinIntervalId);
    lcdSpinIntervalId = null;
  }
}

function resetLcdScreen() {
  stopLcdSpin();
  lcdScreenEl.classList.remove('lcd-reach', 'lcd-aligned', 'lcd-aori');
  setLcdDigit(0, null);
  setLcdDigit(1, null);
  setLcdDigit(2, null);
}

function vanishLcdDigits(onDone) {
  lcdScreenEl.classList.remove('lcd-aligned');
  lcdDigitEls.forEach((el) => {
    el.classList.remove('lcd-vanish');
    void el.offsetWidth;
    el.classList.add('lcd-vanish');
  });
  game.pendingTimeoutId = setTimeout(() => {
    setLcdDigit(0, null);
    setLcdDigit(1, null);
    setLcdDigit(2, null);
    lcdDigitEls.forEach((el) => el.classList.remove('lcd-vanish'));
    onDone();
  }, LCD_VANISH_MS);
}

// ---- RUSH終了 ----

function finishRushNow() {
  const chain = game.rush.chainCount;
  const balls = game.rush.actualBalls;
  const profit = ballsToYen(balls) - game.investment.toushi;

  game.stats.totalPlays++;
  game.stats.totalProfit += profit;
  game.stats.maxChain = Math.max(game.stats.maxChain, chain);
  game.stats.totalBalls += balls;
  renderStats();
  addHistoryEntry(game.investment.spins, profit, game.investment.events);

  rushScreenEl.hidden = true;
  rushStatusRowEl.hidden = true;
  rushMoneyRowEl.hidden = true;
  modeSwitchRowEl.hidden = true;

  showOverlay(popupHtml(`
    <div class="rush-result-title">RUSH終了</div>
    <div class="rush-result-box">
      <div class="result-row highlight">
        <span class="rr-label">連チャン数</span>
        <span class="rr-val gold">${chain}連</span>
      </div>
      <div class="result-row">
        <span class="rr-label">獲得出玉</span>
        <span class="rr-val gold">${balls.toLocaleString()}発</span>
      </div>
      <div class="result-row">
        <span class="rr-label">投資額</span>
        <span class="rr-val">${game.investment.toushi.toLocaleString()}円</span>
      </div>
      <hr class="result-hr">
      <div class="result-row highlight">
        <span class="rr-label">収支</span>
        <span class="rr-val gold">${profit >= 0 ? '+' : ''}${profit.toLocaleString()}円</span>
      </div>
    </div>
    <button type="button" class="btn-action" id="restart-btn">もう一度スタート</button>
    <button type="button" class="btn-sub" id="reset-btn">最初に戻る</button>
  `));
  document.getElementById('restart-btn').addEventListener('click', restartFlow);
  document.getElementById('reset-btn').addEventListener('click', () => location.reload());
}

function restartFlow() {
  hideOverlay();
  startControlsEl.hidden = false;
}

// ---- 初期化 ----

document.addEventListener('DOMContentLoaded', () => {
  cacheDomRefs();
  populateSelects();
  bindEvents();
  renderStats();
  renderHistory();
  renderSpecPanel();
});
