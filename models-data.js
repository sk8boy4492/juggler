// ジャグラー現行主要機種の設定差スペック(初期データ)。
// BIG/REG/合算は「1/x」のxの値(分母)を保存する。確率として使うときは 1/denom で計算する。
// 機械割が未確認の設定は null にしてある。あとで機種マスタ画面から編集できる。
"use strict";

const DEFAULT_MODELS = [
  {
    name: "マイジャグラー5/6",
    memo: "5と6は同一スペック(北電子公表)",
    specs: {
      1: { big: 273.1, reg: 409.6, total: 163.8, payout: 97.0 },
      2: { big: 270.8, reg: 385.5, total: 159.1, payout: null },
      3: { big: 266.4, reg: 336.1, total: 148.6, payout: null },
      4: { big: 254.0, reg: 290.0, total: 135.4, payout: null },
      5: { big: 240.1, reg: 268.6, total: 126.8, payout: null },
      6: { big: 229.1, reg: 229.1, total: 114.6, payout: 109.4 },
    },
  },
  {
    name: "アイムジャグラーEX",
    memo: "",
    specs: {
      1: { big: 273.1, reg: 439.8, total: 168.5, payout: 97.0 },
      2: { big: 269.7, reg: 399.6, total: 161.0, payout: 98.0 },
      3: { big: 269.7, reg: 331.0, total: 148.6, payout: 99.5 },
      4: { big: 259.0, reg: 315.1, total: 142.2, payout: 101.1 },
      5: { big: 259.0, reg: 255.0, total: 128.5, payout: 103.3 },
      6: { big: 255.0, reg: 255.0, total: 127.5, payout: 105.5 },
    },
  },
  {
    name: "ファンキージャグラー2",
    memo: "",
    specs: {
      1: { big: 266.4, reg: 439.8, total: 165.9, payout: 97.0 },
      2: { big: 259.0, reg: 407.1, total: 158.3, payout: null },
      3: { big: 256.0, reg: 366.1, total: 150.7, payout: null },
      4: { big: 249.2, reg: 322.8, total: 140.6, payout: null },
      5: { big: 240.1, reg: 299.3, total: 133.2, payout: null },
      6: { big: 219.9, reg: 262.1, total: 119.6, payout: 109.0 },
    },
  },
  {
    name: "ゴーゴージャグラー3",
    memo: "",
    specs: {
      1: { big: 259.0, reg: 354.2, total: 149.6, payout: 97.2 },
      2: { big: 258.0, reg: 332.7, total: 145.3, payout: null },
      3: { big: 257.0, reg: 306.2, total: 139.7, payout: null },
      4: { big: 254.0, reg: 268.6, total: 130.5, payout: null },
      5: { big: 247.3, reg: 247.3, total: 123.7, payout: null },
      6: { big: 234.9, reg: 234.9, total: 117.4, payout: 106.5 },
    },
  },
  {
    name: "ハッピージャグラーVIII",
    memo: "",
    specs: {
      1: { big: 273.1, reg: 397.2, total: 161.8, payout: 97.0 },
      2: { big: 270.8, reg: 362.1, total: 154.9, payout: 98.1 },
      3: { big: 263.2, reg: 332.7, total: 146.9, payout: 99.9 },
      4: { big: 254.0, reg: 300.6, total: 137.7, payout: 102.9 },
      5: { big: 239.2, reg: 273.1, total: 127.5, payout: 105.8 },
      6: { big: 226.0, reg: 256.0, total: 120.0, payout: 108.4 },
    },
  },
  {
    name: "ジャグラーガールズSS",
    memo: "",
    specs: {
      1: { big: 273.1, reg: 381.0, total: 159.1, payout: 97.0 },
      2: { big: 270.8, reg: 350.5, total: 152.8, payout: 97.9 },
      3: { big: 260.1, reg: 316.6, total: 142.8, payout: 99.9 },
      4: { big: 250.1, reg: 281.3, total: 132.4, payout: 102.1 },
      5: { big: 243.6, reg: 270.8, total: 128.3, payout: 104.0 },
      6: { big: 226.0, reg: 252.1, total: 119.2, payout: 107.5 },
    },
  },
  {
    name: "ミスタージャグラー",
    memo: "",
    specs: {
      1: { big: 268.6, reg: 374.5, total: 156.4, payout: 97.0 },
      2: { big: 267.5, reg: 354.2, total: 152.4, payout: 98.0 },
      3: { big: 260.1, reg: 331.0, total: 145.6, payout: 99.8 },
      4: { big: 249.2, reg: 291.3, total: 134.3, payout: 102.7 },
      5: { big: 240.9, reg: 257.0, total: 124.4, payout: 105.5 },
      6: { big: 237.4, reg: 237.4, total: 118.7, payout: 107.3 },
    },
  },
  {
    name: "ウルトラミラクルジャグラー",
    memo: "",
    specs: {
      1: { big: 267.5, reg: 425.6, total: 164.3, payout: 97.0 },
      2: { big: 261.1, reg: 402.1, total: 158.3, payout: 98.1 },
      3: { big: 256.0, reg: 350.5, total: 147.9, payout: 99.8 },
      4: { big: 242.7, reg: 322.8, total: 138.6, payout: 102.1 },
      5: { big: 233.2, reg: 297.9, total: 130.8, payout: 104.5 },
      6: { big: 216.3, reg: 277.7, total: 121.6, payout: 108.1 },
    },
  },
];
