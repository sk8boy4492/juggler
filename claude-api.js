// Claude APIを直接ブラウザから呼び出して、スクリーンショットから台データを読み取るモジュール。
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

  // 1枚の画像から台データを抽出する。戻り値: { records: [{number, totalSpins, big, reg, diff}, ...] }
  async extractFromImage(file) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("設定画面でClaude APIキーを入力してください");
    }
    const base64 = await this.fileToBase64(file);
    const mediaType = file.type || "image/png";

    const body = {
      model: "claude-sonnet-5",
      max_tokens: 4096,
      tool_choice: { type: "tool", name: "record_machine_data" },
      tools: [
        {
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
                    diff: { type: ["integer", "null"], description: "差枚数。マイナスの場合は負の数(読み取れなければnull)" },
                  },
                  required: ["number"],
                },
              },
            },
            required: ["records"],
          },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            {
              type: "text",
              text:
                "この画像はパチスロ店のデータサイトのスクリーンショットです。表に写っている台ごとに、台番号・総回転数・BIG回数・REG回数・差枚数を読み取って record_machine_data ツールで記録してください。1台分しか写っていない場合はrecordsを1件にしてください。はっきり読み取れない項目はnullにしてください。",
            },
          ],
        },
      ],
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
    if (!toolUse || !toolUse.input || !Array.isArray(toolUse.input.records)) {
      throw new Error("画像からデータを読み取れませんでした");
    }
    return toolUse.input.records;
  },
};
