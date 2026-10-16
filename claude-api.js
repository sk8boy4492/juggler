// Claude APIを直接ブラウザから呼び出すモジュール。スクリーンショットからの台データ抽出と、
// 過去データからの傾向分析(AI分析)の2つの機能で使う。
// APIキーはlocalStorageに保存した値を使う(コードには書かない)。
"use strict";

const ClaudeApi = {
  getApiKey() {
    return localStorage.getItem("juggler_claude_api_key") || "";
  },
  setApiKey(key) {
    localStorage.setItem("juggler_claude_api_key", key.trim());
  },
  hasApiKey() {
    return !!this.getApiKey();
  },

  // 保存されているキーの一部だけを見せる(貼り付けミスの確認用)。
  getMaskedKey() {
    const key = this.getApiKey();
    if (!key) return "";
    if (key.length <= 14) return key;
    return `${key.slice(0, 10)}…${key.slice(-4)}(${key.length}文字)`;
  },

  // Fileオブジェクトをbase64文字列(data:...を除いた部分)に変換する。
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error("ファイルの読み込みに失敗しました"));
      reader.onload = () => {
        const result = reader.result;
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.readAsDataURL(file);
    });
  },

  // Messages APIを呼び出し、指定したツールのinputを返す共通処理。
  async callTool(model, tool, content) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("設定画面でClaude APIキーを入力してください");
    }
    const body = {
      model,
      max_tokens: 4096,
      tool_choice: { type: "tool", name: tool.name },
      tools: [tool],
      messages: [{ role: "user", content }],
    };

    let response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error("通信に失敗しました。ネットワーク環境を確認してください。");
    }

    if (!response.ok) {
      let message = `APIエラー(${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson && errJson.error && errJson.error.message) {
          message = errJson.error.message;
        }
        if (response.status === 401) message = "APIキーが正しくありません。設定画面を確認してください。";
        if (response.status === 429) message = "リクエストが多すぎます(レート制限)。少し待ってから再試行してください。";
      } catch (e) {
        // ignore JSON parse error, use default message
      }
      throw new Error(message);
    }

    const data = await response.json();
    const toolUse = (data.content || []).find((c) => c.type === "tool_use");
    if (!toolUse || !toolUse.input) {
      throw new Error("AIからの応答を読み取れませんでした");
    }
    return toolUse.input;
  },

  // 1枚の画像から台データを抽出する。戻り値: [{number, totalSpins, big, reg}, ...]
  async extractFromImage(file) {
    const base64 = await this.fileToBase64(file);
    const mediaType = file.type || "image/png";

    const tool = {
      name: "record_machine_data",
      description: "画像から読み取ったスロット台ごとのデータを記録する",
      input_schema: {
        type: "object",
        properties: {
          records: {
            type: "array",
            description: "画像内で確認できた台ごとのデータ一覧",
            items: {
              type: "object",
              properties: {
                number: { type: "integer", description: "台番号" },
                totalSpins: { type: ["integer", "null"], description: "総回転数(読み取れなければnull)" },
                big: { type: ["integer", "null"], description: "BIG回数(読み取れなければnull)" },
                reg: { type: ["integer", "null"], description: "REG回数(読み取れなければnull)" },
              },
              required: ["number"],
            },
          },
        },
        required: ["records"],
      },
    };

    const content = [
      { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
      {
        type: "text",
        text:
          "この画像はパチスロ店のデータサイトのスクリーンショットです。表に写っている台ごとに、台番号・総回転数・BIG回数・REG回数を読み取って record_machine_data ツールで記録してください。1台分しか写っていない場合はrecordsを1件にしてください。はっきり読み取れない項目はnullにしてください。",
      },
    ];

    const input = await this.callTool("claude-haiku-4-5", tool, content);
    if (!Array.isArray(input.records)) {
      throw new Error("画像からデータを読み取れませんでした");
    }
    return input.records;
  },

  // 過去データ(payload)から、店舗固有の傾向とおすすめの台をAIに分析してもらう。
  // 戻り値: { summary: string, recommendations: [{number, reason}] }
  async analyzeTrend(payload) {
    const tool = {
      name: "report_trend_analysis",
      description: "パチスロ店の過去データから読み取った傾向と、次回おすすめの台をまとめて報告する",
      input_schema: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "このデータから読み取れる、店舗固有の傾向・クセについての説明(日本語、箇条書き可)",
          },
          recommendations: {
            type: "array",
            description: "次回の対象日におすすめの台番を、期待度が高い順に並べたもの(多くても上位5〜8台程度)",
            items: {
              type: "object",
              properties: {
                number: { type: "integer", description: "台番号(現在登録されている台の中から選ぶこと)" },
                reason: { type: "string", description: "その台をおすすめする理由(日本語、1〜2文)" },
              },
              required: ["number", "reason"],
            },
          },
        },
        required: ["summary", "recommendations"],
      },
    };

    const instructions = `あなたはパチスロ店の設定配分の傾向を分析するアシスタントです。
台番号・機種名・総回転数・BIG回数・REG回数・差枚数、および統計的な計算で求めた推定期待設定値(1〜6、高いほど高設定の可能性が高いという目安の数値)が、以下の2種類のデータに含まれています。

1. 「イベント日の過去実績」: この店舗の「${payload.ruleDescription}」に該当する過去のイベント日ごとの実績データ(eventDate・entries)。各イベント日には、その直前(最大1週間程度)の通常営業時のデータ(leadUpDays)もあわせて入れてあります。
2. 「直近の通常営業データ」: イベント日かどうかに関係なく、次回の対象日(${payload.targetDate})の直前の実績データ。

このデータから、この店舗がどのように設定を配分しているか、傾向やクセを自由に読み取ってください。
特定の台番や範囲に偏りがある、末尾や並びに関係がありそう、日によって傾向が変わってきている、特定の機種だけ扱いが違う、などに加えて、
例えば「イベント日の直前(leadUpDays)にあまり回されていなかった・出玉が悪かった台に、そのイベント日で設定が入りやすい」といった、通常営業時のデータとイベント日の結果を結びつけた傾向がないかも確認してください。これらはあくまで一例であり、決まった観点に縛られず、データから言えることを優先してください。

そのうえで、次回の対象日(${payload.targetDate})において、「現在登録されている台一覧」の中から、高設定が期待できそうな台を順番に挙げ、report_trend_analysis ツールで報告してください。イベント日の過去実績が無い、またはデータが少なく確信が持てない場合は、その旨もsummaryに書いてください。

# 現在登録されている台一覧
${JSON.stringify(payload.registeredMachines)}

# イベント日の過去実績(直前の通常営業データ含む)
${JSON.stringify(payload.eventDayHistory)}

# 直近の通常営業データ(対象日の直前)
${JSON.stringify(payload.recentRegularDays)}`;

    // 傾向分析は店舗のクセという込み入った推論が必要なため、推論力の高いOpusを使う
    // (スクショのOCR抽出はHaikuのままで十分なので、extractFromImage側は変更していない)。
    // Opus 5.5はOpus 5より新しく、かつ安い($4/$20 per MTok vs $5/$25)ためこちらを使う。
    const content = [{ type: "text", text: instructions }];
    const input = await this.callTool("claude-opus-5-5", tool, content);
    if (!Array.isArray(input.recommendations)) {
      throw new Error("分析結果を読み取れませんでした");
    }
    return input;
  },
};
