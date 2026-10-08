// 台ごとの設定推定ロジック。BIG回数・REG回数・総回転数から、二項分布を使って
// 「この結果が設定s(1〜6)から出た確率」を比較し、正規化して確率分布にする。
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

const Analysis = {
  DEFAULT_WEIGHTS: { big: 0.4, reg: 0.6 },

  loadWeights() {
    try {
      const raw = localStorage.getItem("juggler_estimate_weights");
      if (!raw) return Object.assign({}, this.DEFAULT_WEIGHTS);
      const parsed = JSON.parse(raw);
      return { big: Number(parsed.big) || 0.4, reg: Number(parsed.reg) || 0.6 };
    } catch (e) {
      return Object.assign({}, this.DEFAULT_WEIGHTS);
    }
  },

  saveWeights(weights) {
    localStorage.setItem("juggler_estimate_weights", JSON.stringify(weights));
  },

  // record: {totalSpins, big, reg}  modelSpecs: {1:{big,reg,...}, ..., 6:{...}}
  // 戻り値: {1: 確率, ..., 6: 確率}(合計1)。計算に必要な値が無ければnull。
  estimateSettingLikelihoods(record, modelSpecs, weights) {
    const n = record.totalSpins;
    const bigK = record.big;
    const regK = record.reg;
    if (!n || n <= 0 || bigK == null || regK == null) return null;
    weights = weights || this.DEFAULT_WEIGHTS;

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
      logScores[s] = weights.big * logLBig + weights.reg * logLReg;
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
