// 台ごとの設定推定ロジック。BIG回数・REG回数・総回転数・差枚数から、
// 「この結果が設定s(1〜6)から出た確率」をベイズ的に計算する。
// - BIG/REGの出現回数は二項分布の尤度として評価する。
// - 差枚は、各設定の機械割から期待される収支と、ボーナス確率・平均獲得枚数から推定した
//   分散をもとに正規分布の尤度として評価する(機械割が未入力の設定は、同一機種内の
//   既知の機械割と合成確率から回帰で推定する)。
// - 最後に「ホールは高設定をそう多くは使わない」という前提の事前分布(prior)を掛け合わせ、
//   尤度だけに頼らない現実的な確率分布にする。
"use strict";

// log(Γ(x)) のLanczos近似。階乗が大きくなりすぎてオーバーフローするのを防ぐために使う。
const LANCZOS_G = 7;
const LANCZOS_COEF = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

function logGamma(x) {
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  x -= 1;
  let a = LANCZOS_COEF[0];
  const t = x + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_COEF.length; i++) a += LANCZOS_COEF[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// n回中k回当たる確率(対数)。pは1回あたりの当選確率。
function logBinomialPmf(n, k, p) {
  if (k < 0 || k > n) return -Infinity;
  if (p <= 0) return k === 0 ? 0 : -Infinity;
  if (p >= 1) return k === n ? 0 : -Infinity;
  const logC = logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
  return logC + k * Math.log(p) + (n - k) * Math.log(1 - p);
}

// 標準正規分布の確率密度(対数)。
function logNormalPdf(x, mu, sd) {
  if (!(sd > 0)) return null;
  const z = (x - mu) / sd;
  return -0.5 * Math.log(2 * Math.PI) - Math.log(sd) - 0.5 * z * z;
}

// ジャグラー系(Aタイプ)の一般的な前提値。実測の平均獲得枚数は機種・ホールで多少ばれつくが、
// 差枚から設定を見分けるための近似値として使う。
const BET_PER_GAME = 3; // 1ゲームの賭け枚数
const BIG_AVG_PAYOUT = 240; // BIG1回あたりの平均獲得枚数(近似)
const REG_AVG_PAYOUT = 96; // REG1回あたりの平均獲得枚数(近似)

// 機械割が未入力の設定を、同一機種内の既知の機械割と合成確率(1/total)から回帰で推定する。
// 直接入力されている場合はその値をそのまま使う。
function estimatePayout(modelSpecs, s) {
  const target = modelSpecs[s];
  if (!target) return null;
  if (target.payout != null) return Number(target.payout);
  if (!target.total) return null;

  const known = [];
  for (let i = 1; i <= 6; i++) {
    const sp = modelSpecs[i];
    if (sp && sp.payout != null && sp.total) known.push({ x: 1 / sp.total, y: Number(sp.payout) });
  }
  if (known.length < 2) return null;

  const n = known.length;
  const sumX = known.reduce((a, p) => a + p.x, 0);
  const sumY = known.reduce((a, p) => a + p.y, 0);
  const sumXY = known.reduce((a, p) => a + p.x * p.y, 0);
  const sumXX = known.reduce((a, p) => a + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return intercept + slope * (1 / target.total);
}

// 設定sのもとで、観測した差枚がどれくらいありえそうか(対数尤度)。
// 期待差枚は機械割から、ばらつきはBIG/REGの確率と平均獲得枚数から見積もる。
function diffLogLikelihood(n, observedDiff, payoutPct, pBig, pReg) {
  if (payoutPct == null || observedDiff == null) return null;
  const expectedPerGame = BET_PER_GAME * (payoutPct / 100 - 1);
  const mu = n * expectedPerGame;
  const varPerGame = pBig * (1 - pBig) * BIG_AVG_PAYOUT * BIG_AVG_PAYOUT + pReg * (1 - pReg) * REG_AVG_PAYOUT * REG_AVG_PAYOUT;
  const sd = Math.sqrt(Math.max(n * varPerGame, 1));
  return logNormalPdf(observedDiff, mu, sd);
}

const Analysis = {
  DEFAULT_WEIGHTS: { big: 0.3, reg: 0.45, diff: 0.25 },

  // ホールが実際に高設定を使う割合は限られており、大半は1・2などの低設定という前提の事前分布。
  // (5+6の合計で8%: 「高設定は多くても10%以下」という前提に対して余裕を持たせてある)
  SETTING_PRIOR: { 1: 0.35, 2: 0.3, 3: 0.17, 4: 0.1, 5: 0.06, 6: 0.02 },

  loadWeights() {
    try {
      const raw = localStorage.getItem("juggler_estimate_weights");
      if (!raw) return Object.assign({}, this.DEFAULT_WEIGHTS);
      const parsed = JSON.parse(raw);
      return this.normalizeWeights({ big: Number(parsed.big), reg: Number(parsed.reg), diff: Number(parsed.diff) });
    } catch (e) {
      return Object.assign({}, this.DEFAULT_WEIGHTS);
    }
  },

  // big/regが無い(壊れている、または差枚重視度しか無い旧データの)場合はデフォルト比率で補い、
  // 合計が1になるよう整える。
  normalizeWeights(weights) {
    weights = weights || {};
    const diff = Number.isFinite(weights.diff) ? Math.max(0, weights.diff) : this.DEFAULT_WEIGHTS.diff;
    let big = Number.isFinite(weights.big) ? Math.max(0, weights.big) : null;
    let reg = Number.isFinite(weights.reg) ? Math.max(0, weights.reg) : null;
    if (big == null || reg == null) {
      const remaining = 1 - diff;
      const baseSum = this.DEFAULT_WEIGHTS.big + this.DEFAULT_WEIGHTS.reg;
      big = remaining * (this.DEFAULT_WEIGHTS.big / baseSum);
      reg = remaining * (this.DEFAULT_WEIGHTS.reg / baseSum);
    }
    const total = big + reg + diff;
    if (!(total > 0)) return Object.assign({}, this.DEFAULT_WEIGHTS);
    return { big: big / total, reg: reg / total, diff: diff / total };
  },

  saveWeights(weights) {
    localStorage.setItem("juggler_estimate_weights", JSON.stringify(this.normalizeWeights(weights)));
  },

  // record: {totalSpins, big, reg, diff}  modelSpecs: {1:{big,reg,total,payout}, ..., 6:{...}}
  // 戻り値: {1: 確率, ..., 6: 確率}(合計1)。計算に必要な値が無ければnull。
  estimateSettingLikelihoods(record, modelSpecs, weights) {
    const n = record.totalSpins;
    const bigK = record.big;
    const regK = record.reg;
    if (!n || n <= 0 || bigK == null || regK == null) return null;
    weights = this.normalizeWeights(weights);

    const logScores = {};
    for (let s = 1; s <= 6; s++) {
      const spec = modelSpecs[s];
      if (!spec || !spec.big || !spec.reg) {
        logScores[s] = null;
        continue;
      }
      const pBig = 1 / spec.big;
      const pReg = 1 / spec.reg;
      const logLBig = logBinomialPmf(n, bigK, pBig);
      const logLReg = logBinomialPmf(n, regK, pReg);
      let score = weights.big * logLBig + weights.reg * logLReg;

      if (record.diff != null && weights.diff > 0) {
        const payoutPct = estimatePayout(modelSpecs, s);
        const logLDiff = payoutPct != null ? diffLogLikelihood(n, record.diff, payoutPct, pBig, pReg) : null;
        if (logLDiff != null && Number.isFinite(logLDiff)) score += weights.diff * logLDiff;
      }

      // 「高設定はそう多くない」という事前分布をベイズ的に掛け合わせる(対数なので加算)。
      score += Math.log(this.SETTING_PRIOR[s] || 1 / 6);

      logScores[s] = score;
    }

    const validSettings = Object.keys(logScores).filter((s) => logScores[s] != null && Number.isFinite(logScores[s]));
    if (!validSettings.length) return null;
    const maxLog = Math.max(...validSettings.map((s) => logScores[s]));
    const exps = {};
    let sumExp = 0;
    validSettings.forEach((s) => {
      const e = Math.exp(logScores[s] - maxLog);
      exps[s] = e;
      sumExp += e;
    });
    const probs = {};
    for (let s = 1; s <= 6; s++) probs[s] = null;
    validSettings.forEach((s) => {
      probs[s] = exps[s] / sumExp;
    });
    return probs;
  },

  // 設定の期待値(1〜6の加重平均)
  expectedSetting(probs) {
    if (!probs) return null;
    let sum = 0;
    let weightSum = 0;
    for (let s = 1; s <= 6; s++) {
      if (probs[s] == null) continue;
      sum += s * probs[s];
      weightSum += probs[s];
    }
    return weightSum ? sum / weightSum : null;
  },

  // 設定5・6の合計確率(高設定らしさの目安)
  highSettingProb(probs) {
    if (!probs) return null;
    const p5 = probs[5] || 0;
    const p6 = probs[6] || 0;
    return p5 + p6;
  },
};
