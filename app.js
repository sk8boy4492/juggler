// 画面描画・操作をまとめたメインスクリプト。
"use strict";

const App = {
  state: {
    tab: "input",
    currentStoreId: null,
    pending: { files: [], results: [], date: todayStr() }, // データ入力画面の作業中データ
  },
  stores: [],
  models: [],
  machines: [], // 現在選択中の店舗の台番登録一覧

  async init() {
    this.stores = await DB.getAll(DB.STORES.stores);
    this.models = await DB.getAll(DB.STORES.models);
    if (this.models.length === 0) {
      this.models = DEFAULT_MODELS.map((m) => Object.assign({ id: DB.genId() }, m));
      await DB.bulkPut(DB.STORES.models, this.models);
    }

    const savedStoreId = localStorage.getItem("juggler_current_store_id");
    if (savedStoreId && this.stores.some((s) => s.id === savedStoreId)) {
      this.state.currentStoreId = savedStoreId;
    } else if (this.stores.length) {
      this.state.currentStoreId = this.stores[0].id;
    }

    await this.loadMachinesForCurrentStore();

    this.bindNav();
    document.getElementById("store-switcher").addEventListener("change", async (e) => {
      this.state.currentStoreId = e.target.value || null;
      localStorage.setItem("juggler_current_store_id", this.state.currentStoreId || "");
      await this.loadMachinesForCurrentStore();
      this.render();
    });

    this.render();
  },

  async loadMachinesForCurrentStore() {
    if (!this.state.currentStoreId) {
      this.machines = [];
      return;
    }
    this.machines = await DB.getAllByIndex(DB.STORES.machines, "storeId", this.state.currentStoreId);
  },

  currentStore() {
    return this.stores.find((s) => s.id === this.state.currentStoreId) || null;
  },

  bindNav() {
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.state.tab = btn.dataset.tab;
        this.render();
      });
    });
  },

  toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    el.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => (el.hidden = true), 200);
    }, 2400);
  },

  render() {
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === this.state.tab);
    });
    document.querySelectorAll(".screen").forEach((s) => (s.hidden = true));
    document.getElementById("screen-" + this.state.tab).hidden = false;

    this.renderStoreSwitcher();

    if (this.state.tab === "analysis") this.renderAnalysisScreen();
    if (this.state.tab === "stores") this.renderStoresScreen();
    if (this.state.tab === "models") this.renderModelsScreen();
    if (this.state.tab === "machines") this.renderMachinesScreen();
    if (this.state.tab === "input") this.renderInputScreen();
    if (this.state.tab === "settings") this.renderSettingsScreen();
  },

  renderStoreSwitcher() {
    const sel = document.getElementById("store-switcher");
    if (!this.stores.length) {
      sel.innerHTML = '<option value="">(店舗未登録)</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = this.stores
      .map((s) => `<option value="${s.id}" ${s.id === this.state.currentStoreId ? "selected" : ""}>${esc(s.name)}</option>`)
      .join("");
  },

  // ---------- 店舗管理 ----------
  renderStoresScreen() {
    const root = document.getElementById("screen-stores");
    root.innerHTML = `
      <section class="card">
        <h2>店舗管理</h2>
        <div id="store-list"></div>
        <h3>店舗を追加</h3>
        <form id="store-form" class="form-row">
          <div class="field">
            <label>店舗名</label>
            <input type="text" name="name" required placeholder="例: ○○会館 △△店" />
          </div>
          <div class="field">
            <label>1島あたりの台数</label>
            <input type="number" name="islandSize" min="1" value="20" style="width:90px" />
          </div>
          <button type="submit" class="btn">追加する</button>
        </form>
      </section>
    `;
    this.renderStoreList();
    document.getElementById("store-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const name = form.elements.name.value.trim();
      const islandSize = Number(form.elements.islandSize.value) || 20;
      if (!name) return;
      const store = { id: DB.genId(), name, islandSize };
      await DB.add(DB.STORES.stores, store);
      this.stores.push(store);
      if (!this.state.currentStoreId) {
        this.state.currentStoreId = store.id;
        localStorage.setItem("juggler_current_store_id", store.id);
        await this.loadMachinesForCurrentStore();
      }
      form.reset();
      form.elements.islandSize.value = 20;
      this.render();
      this.toast("店舗を追加しました");
    });
  },

  renderStoreList() {
    const container = document.getElementById("store-list");
    if (!this.stores.length) {
      container.innerHTML = '<p class="hint">まだ店舗が登録されていません。下のフォームから追加してください。</p>';
      return;
    }
    container.innerHTML = this.stores
      .map(
        (s) => `
      <div class="list-row" data-id="${s.id}">
        <div>
          <strong>${esc(s.name)}</strong>
          <span class="badge">1島 ${s.islandSize}台</span>
        </div>
        <div class="list-row-actions">
          <button type="button" class="btn btn-ghost btn-sm edit-store">編集</button>
          <button type="button" class="btn btn-danger btn-sm delete-store">削除</button>
        </div>
      </div>`
      )
      .join("");

    container.querySelectorAll(".edit-store").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const id = e.target.closest(".list-row").dataset.id;
        this.editStore(id);
      })
    );
    container.querySelectorAll(".delete-store").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const id = e.target.closest(".list-row").dataset.id;
        this.deleteStore(id);
      })
    );
  },

  editStore(id) {
    const store = this.stores.find((s) => s.id === id);
    if (!store) return;
    const name = prompt("店舗名を編集", store.name);
    if (name == null) return;
    const islandSizeStr = prompt("1島あたりの台数", String(store.islandSize));
    if (islandSizeStr == null) return;
    store.name = name.trim() || store.name;
    store.islandSize = Number(islandSizeStr) || store.islandSize;
    DB.put(DB.STORES.stores, store).then(() => {
      this.render();
      this.toast("更新しました");
    });
  },

  async deleteStore(id) {
    const store = this.stores.find((s) => s.id === id);
    if (!store) return;
    if (!confirm(`「${store.name}」を削除しますか? この店舗の台番登録・データもすべて削除されます。`)) return;
    const machines = await DB.getAllByIndex(DB.STORES.machines, "storeId", id);
    for (const m of machines) {
      const records = await DB.getAllByIndex(DB.STORES.records, "machineId", m.id);
      for (const r of records) await DB.delete(DB.STORES.records, r.id);
      await DB.delete(DB.STORES.machines, m.id);
    }
    await DB.delete(DB.STORES.stores, id);
    this.stores = this.stores.filter((s) => s.id !== id);
    if (this.state.currentStoreId === id) {
      this.state.currentStoreId = this.stores.length ? this.stores[0].id : null;
      localStorage.setItem("juggler_current_store_id", this.state.currentStoreId || "");
      await this.loadMachinesForCurrentStore();
    }
    this.render();
    this.toast("削除しました");
  },

  // ---------- 機種マスタ ----------
  renderModelsScreen() {
    const root = document.getElementById("screen-models");
    root.innerHTML = `
      <section class="card">
        <h2>機種マスタ(全店舗共通)</h2>
        <p class="hint">設定差のスペック(1/xのxの値)を調べて入力しています。数値がおかしい場合はここで直接修正できます。機械割が未確認の欄は空欄にしています。</p>
        <div id="model-list"></div>
        <div class="form-row">
          <button type="button" class="btn btn-ghost" id="add-model-btn">機種を追加</button>
        </div>
      </section>
    `;
    this.renderModelList();
    document.getElementById("add-model-btn").addEventListener("click", async () => {
      const name = prompt("機種名を入力してください");
      if (!name) return;
      const specs = {};
      for (let s = 1; s <= 6; s++) specs[s] = { big: null, reg: null, total: null, payout: null };
      const model = { id: DB.genId(), name: name.trim(), memo: "", specs };
      await DB.add(DB.STORES.models, model);
      this.models.push(model);
      this.renderModelList();
      this.toast("機種を追加しました");
    });
  },

  renderModelList() {
    const container = document.getElementById("model-list");
    container.innerHTML = this.models
      .map((m) => {
        const rows = [1, 2, 3, 4, 5, 6]
          .map((s) => {
            const spec = m.specs[s] || {};
            return `
            <tr data-setting="${s}">
              <td>設定${s}</td>
              <td><input class="cell-input spec-input" data-field="big" type="number" step="0.1" value="${spec.big ?? ""}" /></td>
              <td><input class="cell-input spec-input" data-field="reg" type="number" step="0.1" value="${spec.reg ?? ""}" /></td>
              <td><input class="cell-input spec-input" data-field="total" type="number" step="0.1" value="${spec.total ?? ""}" /></td>
              <td><input class="cell-input spec-input" data-field="payout" type="number" step="0.1" value="${spec.payout ?? ""}" /></td>
            </tr>`;
          })
          .join("");
        return `
        <div class="spec-table-wrap" data-model-id="${m.id}">
          <div class="list-row">
            <input type="text" class="model-name-input" value="${esc(m.name)}" />
            <button type="button" class="btn btn-danger btn-sm delete-model">削除</button>
          </div>
          <div class="table-scroll">
            <table>
              <thead><tr><th>設定</th><th>BIG確率(1/x)</th><th>REG確率(1/x)</th><th>合算確率(1/x)</th><th>機械割(%)</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
      })
      .join("");

    container.querySelectorAll(".spec-table-wrap").forEach((wrap) => {
      const modelId = wrap.dataset.modelId;
      const model = this.models.find((m) => m.id === modelId);

      wrap.querySelector(".model-name-input").addEventListener("change", (e) => {
        model.name = e.target.value.trim() || model.name;
        DB.put(DB.STORES.models, model);
      });

      wrap.querySelectorAll(".spec-input").forEach((input) => {
        input.addEventListener("change", (e) => {
          const tr = e.target.closest("tr");
          const setting = tr.dataset.setting;
          const field = e.target.dataset.field;
          const v = e.target.value === "" ? null : Number(e.target.value);
          if (!model.specs[setting]) model.specs[setting] = {};
          model.specs[setting][field] = v;
          DB.put(DB.STORES.models, model);
        });
      });

      wrap.querySelector(".delete-model").addEventListener("click", async () => {
        if (!confirm(`「${model.name}」を削除しますか?`)) return;
        await DB.delete(DB.STORES.models, modelId);
        this.models = this.models.filter((m) => m.id !== modelId);
        this.renderModelList();
        this.toast("削除しました");
      });
    });
  },

  // ---------- 分析(設定推定) ----------
  renderAnalysisScreen() {
    const root = document.getElementById("screen-analysis");
    const store = this.currentStore();
    if (!store) {
      root.innerHTML = '<section class="card"><p class="hint">先に店舗管理タブから店舗を登録してください。</p></section>';
      return;
    }
    const weights = Analysis.loadWeights();
    root.innerHTML = `
      <section class="card">
        <h2>設定推定 - ${esc(store.name)}</h2>
        <p class="hint">BIG・REG回数と総回転数から、設定1〜6それぞれだった可能性を二項分布で計算します。「高設定らしさ」は設定5・6の確率の合計です。期待設定値が高い順に並びます。差枚は参考情報です(計算には使っていません)。</p>
        <div class="form-row">
          <div class="field"><label>対象日</label><input type="date" id="analysis-date" /></div>
          <div class="field">
            <label>REG重視度(0〜100、数値が大きいほどREGを重視)</label>
            <input type="number" id="reg-weight-input" min="0" max="100" value="${Math.round(weights.reg * 100)}" style="width:90px" />
          </div>
        </div>
        <div class="table-scroll">
          <table id="analysis-table">
            <thead>
              <tr><th>台番</th><th>機種</th><th>総回転</th><th>BIG</th><th>REG</th><th>差枚</th><th>期待設定値</th><th>高設定らしさ</th><th>設定別の内訳(1→6)</th></tr>
            </thead>
            <tbody id="analysis-tbody"></tbody>
          </table>
        </div>
      </section>
    `;

    document.getElementById("reg-weight-input").addEventListener("change", (e) => {
      let regPct = Number(e.target.value);
      if (Number.isNaN(regPct)) regPct = 60;
      regPct = Math.max(0, Math.min(100, regPct));
      e.target.value = regPct;
      Analysis.saveWeights({ reg: regPct / 100, big: (100 - regPct) / 100 });
      this.renderAnalysisTable();
    });

    this.setupAnalysisDateAndRender();
  },

  async setupAnalysisDateAndRender() {
    const store = this.currentStore();
    this._analysisRecords = await DB.getAllByIndex(DB.STORES.records, "storeId", store.id);
    const dates = Array.from(new Set(this._analysisRecords.map((r) => r.date))).sort().reverse();
    const dateInput = document.getElementById("analysis-date");
    dateInput.value = dates[0] || todayStr();
    dateInput.addEventListener("change", () => this.renderAnalysisTable());
    this.renderAnalysisTable();
  },

  renderAnalysisTable() {
    const tbody = document.getElementById("analysis-tbody");
    if (!tbody) return;
    const date = document.getElementById("analysis-date").value;
    const weights = Analysis.loadWeights();
    const recordsForDate = (this._analysisRecords || []).filter((r) => r.date === date);

    const rows = recordsForDate.map((r) => {
      const machine = this.machines.find((m) => m.id === r.machineId);
      const model = machine ? this.models.find((mo) => mo.id === machine.modelId) : null;
      const probs = model ? Analysis.estimateSettingLikelihoods(r, model.specs, weights) : null;
      const expected = Analysis.expectedSetting(probs);
      const highProb = Analysis.highSettingProb(probs);
      return { r, machine, model, probs, expected, highProb };
    });

    rows.sort((a, b) => (b.expected ?? -1) - (a.expected ?? -1));

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="hint">この日のデータがありません</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(({ r, machine, model, probs, expected, highProb }) => {
        const breakdown = probs
          ? [1, 2, 3, 4, 5, 6].map((s) => (probs[s] != null ? Math.round(probs[s] * 100) : "-")).join(" / ")
          : "計算不可";
        const diffClass = r.diff == null ? "" : r.diff >= 0 ? "diff-pos" : "diff-neg";
        return `<tr>
          <td>${machine ? machine.number : "(削除済み)"}</td>
          <td>${model ? esc(model.name) : "-"}</td>
          <td>${r.totalSpins ?? "-"}</td>
          <td>${r.big ?? "-"}</td>
          <td>${r.reg ?? "-"}</td>
          <td class="${diffClass}">${r.diff ?? "-"}</td>
          <td><strong>${expected != null ? expected.toFixed(2) : "-"}</strong></td>
          <td>${highProb != null ? Math.round(highProb * 100) + "%" : "-"}</td>
          <td style="font-size:11px;color:var(--text-muted)">${breakdown}</td>
        </tr>`;
      })
      .join("");
  },

  // ---------- 台番登録 ----------
  renderMachinesScreen() {
    const root = document.getElementById("screen-machines");
    const store = this.currentStore();
    if (!store) {
      root.innerHTML = '<section class="card"><p class="hint">先に店舗管理タブから店舗を登録してください。</p></section>';
      return;
    }
    root.innerHTML = `
      <section class="card">
        <h2>台番登録 - ${esc(store.name)}</h2>
        <p class="hint">同じ機種が並んでいる範囲をまとめて登録できます。島番号は台番の並び順から自動で計算されます(1島 ${store.islandSize}台)。</p>
        <form id="bulk-add-form" class="form-row">
          <div class="field"><label>開始台番</label><input type="number" name="from" required style="width:100px" /></div>
          <div class="field"><label>終了台番</label><input type="number" name="to" required style="width:100px" /></div>
          <div class="field">
            <label>機種</label>
            <select name="modelId" required>
              ${this.models.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}
            </select>
          </div>
          <button type="submit" class="btn">まとめて登録</button>
        </form>
        <div id="machine-list"></div>
      </section>
    `;
    this.renderMachineList();

    document.getElementById("bulk-add-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const from = Number(form.elements.from.value);
      const to = Number(form.elements.to.value);
      const modelId = form.elements.modelId.value;
      if (!from || !to || from > to) {
        this.toast("台番の範囲が正しくありません");
        return;
      }
      if (to - from > 500) {
        this.toast("一度に登録できる範囲が広すぎます(500台まで)");
        return;
      }
      const byNumber = new Map(this.machines.map((m) => [m.number, m]));
      const toSave = [];
      for (let n = from; n <= to; n++) {
        const existing = byNumber.get(n);
        if (existing) {
          existing.modelId = modelId;
          toSave.push(existing);
        } else {
          const machine = { id: DB.genId(), storeId: store.id, number: n, modelId };
          this.machines.push(machine);
          toSave.push(machine);
        }
      }
      await DB.bulkPut(DB.STORES.machines, toSave);
      form.reset();
      this.renderMachineList();
      this.toast(`${to - from + 1}台を登録しました`);
    });
  },

  renderMachineList() {
    const container = document.getElementById("machine-list");
    const store = this.currentStore();
    if (!this.machines.length) {
      container.innerHTML = '<p class="hint">まだ台番が登録されていません。</p>';
      return;
    }
    const sorted = this.machines.slice().sort((a, b) => a.number - b.number);
    const islandSize = store.islandSize || 20;
    const islands = new Map();
    sorted.forEach((m, i) => {
      const islandNo = Math.floor(i / islandSize) + 1;
      if (!islands.has(islandNo)) islands.set(islandNo, []);
      islands.get(islandNo).push(m);
    });

    let html = "";
    islands.forEach((list, islandNo) => {
      html += `<h3>島${islandNo}</h3><div class="table-scroll"><table><thead><tr><th>台番</th><th>機種</th><th></th></tr></thead><tbody>`;
      list.forEach((m) => {
        const model = this.models.find((mo) => mo.id === m.modelId);
        html += `<tr data-id="${m.id}">
          <td>${m.number}</td>
          <td>${model ? esc(model.name) : '<span class="badge badge-warn">機種未設定</span>'}</td>
          <td><button type="button" class="btn btn-danger btn-sm delete-machine">削除</button></td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
    });
    container.innerHTML = html;

    container.querySelectorAll(".delete-machine").forEach((btn) =>
      btn.addEventListener("click", async (e) => {
        const id = e.target.closest("tr").dataset.id;
        if (!confirm("この台番の登録を削除しますか?(過去データは残ります)")) return;
        await DB.delete(DB.STORES.machines, id);
        this.machines = this.machines.filter((m) => m.id !== id);
        this.renderMachineList();
        this.toast("削除しました");
      })
    );
  },

  // ---------- データ入力 ----------
  renderInputScreen() {
    const root = document.getElementById("screen-input");
    const store = this.currentStore();
    if (!store) {
      root.innerHTML = '<section class="card"><p class="hint">先に店舗管理タブから店舗を登録してください。</p></section>';
      return;
    }
    root.innerHTML = `
      <section class="card">
        <h2>データ入力 - ${esc(store.name)}</h2>
        <div class="form-row">
          <div class="field"><label>対象日</label><input type="date" id="input-date" value="${this.state.pending.date}" /></div>
        </div>
        <div class="dropzone" id="dropzone">
          スクリーンショットをここにドラッグ&ドロップ、またはクリックして選択(複数可)
        </div>
        <input type="file" id="file-input" accept="image/*" multiple hidden />
        <div class="file-chip-list" id="file-chip-list"></div>
        <div class="form-row" style="margin-top:12px">
          <button type="button" class="btn" id="extract-btn">画像を読み取る</button>
          <button type="button" class="btn btn-ghost" id="add-row-btn">手入力で1行追加</button>
        </div>
        <div id="progress-area"></div>
      </section>

      <section class="card" id="review-section" ${this.state.pending.results.length ? "" : "hidden"}>
        <h2>確認・修正</h2>
        <p class="hint">台番は店舗の登録と自動で照合します。「未登録」の台は機種を選ぶと新しく登録されます。</p>
        <div class="table-scroll">
          <table id="review-table">
            <thead><tr><th>台番</th><th>機種</th><th>総回転</th><th>BIG</th><th>REG</th><th>差枚</th><th></th></tr></thead>
            <tbody id="review-tbody"></tbody>
          </table>
        </div>
        <div class="form-row" style="margin-top:14px">
          <button type="button" class="btn" id="save-records-btn">この内容で保存する</button>
        </div>
      </section>
    `;

    document.getElementById("input-date").addEventListener("change", (e) => {
      this.state.pending.date = e.target.value;
    });

    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("file-input");
    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      this.addPendingFiles(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/")));
    });
    fileInput.addEventListener("change", (e) => {
      this.addPendingFiles(Array.from(e.target.files));
      fileInput.value = "";
    });

    this.renderFileChips();

    document.getElementById("extract-btn").addEventListener("click", () => this.runExtraction());
    document.getElementById("add-row-btn").addEventListener("click", () => {
      this.state.pending.results.push({ number: "", totalSpins: null, big: null, reg: null, diff: null });
      this.renderReviewTable();
    });
    const saveBtn = document.getElementById("save-records-btn");
    if (saveBtn) saveBtn.addEventListener("click", () => this.saveReviewedRecords());

    this.renderReviewTable();
  },

  addPendingFiles(files) {
    if (!files.length) return;
    this.state.pending.files.push(...files);
    this.renderFileChips();
  },

  renderFileChips() {
    const el = document.getElementById("file-chip-list");
    if (!el) return;
    el.innerHTML = this.state.pending.files
      .map((f, i) => `<span class="file-chip">${esc(f.name)} <button type="button" data-i="${i}" class="remove-file-chip">✕</button></span>`)
      .join("");
    el.querySelectorAll(".remove-file-chip").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const i = Number(e.target.dataset.i);
        this.state.pending.files.splice(i, 1);
        this.renderFileChips();
      })
    );
  },

  async runExtraction() {
    if (!this.state.pending.files.length) {
      this.toast("画像を選択してください");
      return;
    }
    if (!ClaudeApi.hasApiKey()) {
      this.toast("設定画面でClaude APIキーを入力してください");
      return;
    }
    const progressArea = document.getElementById("progress-area");
    const files = this.state.pending.files.slice();
    progressArea.innerHTML = files.map((f, i) => `<div class="progress-row" id="progress-${i}">${esc(f.name)}: 待機中</div>`).join("");

    for (let i = 0; i < files.length; i++) {
      const rowEl = document.getElementById(`progress-${i}`);
      rowEl.textContent = `${files[i].name}: 読み取り中...`;
      try {
        const records = await ClaudeApi.extractFromImage(files[i]);
        records.forEach((r) => this.state.pending.results.push(r));
        rowEl.textContent = `${files[i].name}: ${records.length}件を読み取りました`;
      } catch (err) {
        rowEl.textContent = `${files[i].name}: 失敗 (${err.message})`;
      }
    }

    this.state.pending.files = [];
    this.renderFileChips();
    document.getElementById("review-section").hidden = this.state.pending.results.length === 0;
    this.renderReviewTable();
  },

  renderReviewTable() {
    const tbody = document.getElementById("review-tbody");
    const section = document.getElementById("review-section");
    if (!tbody) return;
    section.hidden = this.state.pending.results.length === 0;

    const machineByNumber = new Map(this.machines.map((m) => [m.number, m]));

    tbody.innerHTML = this.state.pending.results
      .map((r, i) => {
        const matched = machineByNumber.get(Number(r.number));
        const model = matched ? this.models.find((m) => m.id === matched.modelId) : null;
        const modelCell = matched
          ? esc(model ? model.name : "機種未設定")
          : `<select class="cell-input unmatched-model-select" data-i="${i}" style="width:140px">
               <option value="">スキップ</option>
               ${this.models.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}
             </select>`;
        return `
        <tr data-i="${i}" class="${matched ? "" : "row-unmatched"}">
          <td><input class="cell-input" data-field="number" type="number" value="${r.number ?? ""}" /></td>
          <td>${modelCell}</td>
          <td><input class="cell-input" data-field="totalSpins" type="number" value="${r.totalSpins ?? ""}" /></td>
          <td><input class="cell-input" data-field="big" type="number" value="${r.big ?? ""}" /></td>
          <td><input class="cell-input" data-field="reg" type="number" value="${r.reg ?? ""}" /></td>
          <td><input class="cell-input" data-field="diff" type="number" value="${r.diff ?? ""}" /></td>
          <td><button type="button" class="btn btn-danger btn-sm remove-review-row">✕</button></td>
        </tr>`;
      })
      .join("");

    tbody.querySelectorAll(".cell-input[data-field]").forEach((input) => {
      input.addEventListener("change", (e) => {
        const i = Number(e.target.closest("tr").dataset.i);
        const field = e.target.dataset.field;
        const v = e.target.value === "" ? null : Number(e.target.value);
        this.state.pending.results[i][field] = v;
        if (field === "number") this.renderReviewTable();
      });
    });
    tbody.querySelectorAll(".unmatched-model-select").forEach((sel) => {
      sel.addEventListener("change", (e) => {
        const i = Number(e.target.dataset.i);
        this.state.pending.results[i]._chosenModelId = e.target.value || null;
      });
    });
    tbody.querySelectorAll(".remove-review-row").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const i = Number(e.target.closest("tr").dataset.i);
        this.state.pending.results.splice(i, 1);
        this.renderReviewTable();
      })
    );
  },

  async saveReviewedRecords() {
    const store = this.currentStore();
    const date = this.state.pending.date;
    if (!date) {
      this.toast("対象日を入力してください");
      return;
    }
    const machineByNumber = new Map(this.machines.map((m) => [m.number, m]));
    let savedCount = 0;
    let skipped = 0;

    for (const r of this.state.pending.results) {
      const number = Number(r.number);
      if (!number) {
        skipped++;
        continue;
      }
      let machine = machineByNumber.get(number);
      if (!machine) {
        if (!r._chosenModelId) {
          skipped++;
          continue;
        }
        machine = { id: DB.genId(), storeId: store.id, number, modelId: r._chosenModelId };
        await DB.add(DB.STORES.machines, machine);
        this.machines.push(machine);
        machineByNumber.set(number, machine);
      }

      const existingRecords = await DB.getAllByIndex(DB.STORES.records, "machineId", machine.id);
      const existing = existingRecords.find((rec) => rec.date === date);
      const record = existing || { id: DB.genId(), storeId: store.id, machineId: machine.id, date };
      record.totalSpins = r.totalSpins;
      record.big = r.big;
      record.reg = r.reg;
      record.diff = r.diff;
      await DB.put(DB.STORES.records, record);
      savedCount++;
    }

    this.state.pending.results = [];
    this.renderReviewTable();
    this.toast(`${savedCount}件保存しました${skipped ? `(${skipped}件はスキップ)` : ""}`);
  },

  // ---------- 設定 ----------
  renderSettingsScreen() {
    const root = document.getElementById("screen-settings");
    const hasKey = ClaudeApi.hasApiKey();
    root.innerHTML = `
      <section class="card">
        <h2>Claude APIキー</h2>
        <p class="hint">このMacのブラウザ内だけに保存されます。コードやGitHubには一切含まれません。</p>
        <div class="form-row">
          <div class="field" style="flex:1">
            <label>APIキー</label>
            <input type="password" id="api-key-input" placeholder="${hasKey ? "設定済み(変更する場合のみ入力)" : "sk-ant-..."}" style="width:100%;max-width:400px" />
          </div>
          <button type="button" class="btn" id="save-key-btn">保存</button>
          ${hasKey ? '<button type="button" class="btn btn-danger" id="clear-key-btn">削除</button>' : ""}
        </div>
      </section>

      <section class="card">
        <h2>データのバックアップ</h2>
        <p class="hint">店舗・機種マスタ・台番登録・日別データをすべて書き出し/読み込みできます。</p>
        <div class="form-row">
          <button type="button" class="btn" id="export-btn">JSONを書き出す</button>
          <button type="button" class="btn btn-ghost" id="import-btn-trigger">JSONを読み込む</button>
          <input type="file" id="import-file-input" accept="application/json" hidden />
        </div>
      </section>
    `;

    document.getElementById("save-key-btn").addEventListener("click", () => {
      const v = document.getElementById("api-key-input").value.trim();
      if (!v) {
        this.toast("APIキーを入力してください");
        return;
      }
      ClaudeApi.setApiKey(v);
      this.renderSettingsScreen();
      this.toast("保存しました");
    });
    const clearBtn = document.getElementById("clear-key-btn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (!confirm("保存したAPIキーを削除しますか?")) return;
        localStorage.removeItem("juggler_claude_api_key");
        this.renderSettingsScreen();
        this.toast("削除しました");
      });
    }

    document.getElementById("export-btn").addEventListener("click", () => this.exportAll());
    document.getElementById("import-btn-trigger").addEventListener("click", () => {
      document.getElementById("import-file-input").click();
    });
    document.getElementById("import-file-input").addEventListener("change", (e) => this.importAll(e));
  },

  async exportAll() {
    const records = await DB.getAll(DB.STORES.records);
    const data = {
      type: "juggler-predict-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      stores: this.stores,
      models: this.models,
      machines: await DB.getAll(DB.STORES.machines),
      records,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `juggler-predict-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    this.toast("書き出しました");
  },

  importAll(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.stores) || !Array.isArray(data.models)) {
          throw new Error("ファイルの形式が正しくありません");
        }
        if (!confirm("現在のすべてのデータを、このファイルの内容で置き換えます。よろしいですか?")) return;

        for (const name of [DB.STORES.stores, DB.STORES.models, DB.STORES.machines, DB.STORES.records]) {
          await DB.clearAll(name);
        }
        await DB.bulkPut(DB.STORES.stores, data.stores);
        await DB.bulkPut(DB.STORES.models, data.models);
        await DB.bulkPut(DB.STORES.machines, data.machines || []);
        await DB.bulkPut(DB.STORES.records, data.records || []);

        this.stores = await DB.getAll(DB.STORES.stores);
        this.models = await DB.getAll(DB.STORES.models);
        this.state.currentStoreId = this.stores.length ? this.stores[0].id : null;
        localStorage.setItem("juggler_current_store_id", this.state.currentStoreId || "");
        await this.loadMachinesForCurrentStore();
        this.render();
        this.toast("読み込みました");
      } catch (e) {
        alert("読み込みに失敗しました: " + e.message);
      }
    };
    reader.readAsText(file);
  },
};

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

document.addEventListener("DOMContentLoaded", () => App.init());
