// イベント日(特定日)のルール判定ロジック。日付の「タグ付け」はせず、
// 登録したルールと実際の日付を照らし合わせて自動で判定する。
"use strict";

const Events = {
  KIND_LABELS: {
    specific: "特定の1日だけ",
    monthlyDay: "毎月同じ日",
    daySuffix: "末尾の日",
    annual: "毎年の記念日",
  },

  describeRule(rule) {
    switch (rule.kind) {
      case "specific":
        return `${rule.params.date}`;
      case "monthlyDay":
        return `毎月${rule.params.day}日`;
      case "daySuffix":
        return `末尾${rule.params.suffix}の日(${rule.params.suffix}・${10 + Number(rule.params.suffix)}・${20 + Number(rule.params.suffix)}日)`;
      case "annual":
        return `毎年${rule.params.month}月${rule.params.day}日`;
      default:
        return "";
    }
  },

  matchesRule(dateStr, rule) {
    const d = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(d.getTime())) return false;
    const day = d.getDate();
    const month = d.getMonth() + 1;
    switch (rule.kind) {
      case "specific":
        return dateStr === rule.params.date;
      case "monthlyDay":
        return day === Number(rule.params.day);
      case "daySuffix":
        return day % 10 === Number(rule.params.suffix);
      case "annual":
        return month === Number(rule.params.month) && day === Number(rule.params.day);
      default:
        return false;
    }
  },

  matchingRules(dateStr, rules) {
    return rules.filter((r) => this.matchesRule(dateStr, r));
  },

  // dateStrの前日(YYYY-MM-DD)を返す
  previousDate(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() - 1);
    return toDateStr(d);
  },

  nextDate(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return toDateStr(d);
  },

  // ruleに一致する過去の日付を、実際にデータがある日付一覧の中から探す(今日より前、新しい順)
  pastMatchingDates(rule, availableDates, beforeDateStr) {
    return availableDates
      .filter((d) => d < beforeDateStr && this.matchesRule(d, rule))
      .sort()
      .reverse();
  },
};

function toDateStr(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
