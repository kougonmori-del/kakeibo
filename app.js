// ─── Storage ───────────────────────────────────────────────────────────────
const STORAGE_KEY = "kakeibo_health_v2";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeState(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeState(null);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.data));
}

function normalizeState(d) {
  return {
    financeEntries: Array.isArray(d?.financeEntries)
      ? d.financeEntries.filter(Boolean).map(normalizeFinanceEntry)
      : [],
    fixedCosts: Array.isArray(d?.fixedCosts)
      ? d.fixedCosts.filter(Boolean).map(normalizeFixedCost)
      : [],
    healthEntries: Array.isArray(d?.healthEntries)
      ? d.healthEntries.filter(Boolean).map(normalizeHealthEntry)
      : [],
  };
}

function normalizeFinanceEntry(x) {
  return {
    id:     String(x.id || randomId()),
    date:   typeof x.date === "string" ? x.date : "",
    type:   x.type === "income" ? "income" : "expense",
    title:  String(x.title || ""),
    amount: Number(x.amount) || 0,
    note:   String(x.note || ""),
  };
}

function normalizeFixedCost(x) {
  return {
    id:         String(x.id || randomId()),
    name:       String(x.name || ""),
    amount:     Number(x.amount) || 0,
    dayOfMonth: Number(x.dayOfMonth) || 1,
    memo:       String(x.memo || ""),
  };
}

function normalizeHealthEntry(x) {
  return {
    date:              typeof x.date === "string" ? x.date : "",
    weight:            x.weight            ?? null,
    bodyFatPercentage: x.bodyFatPercentage ?? null,
    intakeCalories:    x.intakeCalories    ?? null,
    steps:             x.steps            ?? null,
    activeCalories:    x.activeCalories    ?? null,
  };
}

// ─── App State ─────────────────────────────────────────────────────────────
let appState;

document.addEventListener("DOMContentLoaded", () => {
  appState = {
    tab: "home",
    financeMonth: startOfMonth(new Date()),
    selectedDate: dateStr(new Date()),
    data: loadState(),
  };
  bindNav();
  bindHeader();
  renderApp();
  registerSW();
});

// ─── Navigation ────────────────────────────────────────────────────────────
function bindNav() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      appState.tab = btn.dataset.tab;
      renderApp();
    });
  });
  document.getElementById("modal-close-btn").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });
}

function bindHeader() {
  document.getElementById("backup-export-btn").addEventListener("click", exportBackup);
  document.getElementById("backup-import-input").addEventListener("change", importBackup);
}

// ─── Render ─────────────────────────────────────────────────────────────────
function renderApp() {
  // Update nav active state
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === appState.tab);
  });
  document.querySelectorAll(".tab-section").forEach((sec) => {
    sec.classList.toggle("active", sec.id === `tab-${appState.tab}`);
  });

  renderHome();
  renderFinance();
  renderHealth();
  renderAnalytics();
  renderSettings();
}

// ─── HOME ───────────────────────────────────────────────────────────────────
function renderHome() {
  const today = dateStr(new Date());
  const currentMonth = startOfMonth(new Date());
  const md = getMonthlyFinance(currentMonth);
  const totalAssets = getTotalAssets();
  const todayHealth = getHealthByDate(today);
  const el = document.getElementById("tab-home");

  el.innerHTML = `
    <div class="card">
      <div class="row between" style="margin-bottom:14px;">
        <div>
          <div class="card-title" style="margin-bottom:2px;">今月のまとめ</div>
          <div class="badge">${fmtMonthYear(currentMonth)}</div>
        </div>
      </div>
      <div class="metric-grid">
        <div class="metric-box">
          <div class="metric-label">全財産</div>
          <div class="metric-value ${totalAssets < 0 ? "red" : ""}">${fmtCurrency(totalAssets)}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">今月の収入</div>
          <div class="metric-value">${fmtCurrency(md.income)}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">支出</div>
          <div class="metric-value red">${fmtCurrency(md.expense)}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">固定費</div>
          <div class="metric-value">${fmtCurrency(md.fixedCost)}</div>
        </div>
      </div>
      <div class="divider"></div>
      <p class="subtle">全財産 = 各月の（収入 − 支出 − 固定費）の累計です。</p>
    </div>

    <div class="card">
      <div class="row between" style="margin-bottom:14px;">
        <div class="card-title" style="margin-bottom:0;">今日の健康</div>
        <span class="badge">${today}</span>
      </div>
      <div class="metric-grid">
        ${mBox("体重",      todayHealth?.weight            ? `${todayHealth.weight} kg`       : "—")}
        ${mBox("体脂肪率",  todayHealth?.bodyFatPercentage ? `${todayHealth.bodyFatPercentage}%` : "—")}
        ${mBox("摂取 kcal", todayHealth?.intakeCalories    ? `${todayHealth.intakeCalories}`  : "—")}
        ${mBox("歩数",      todayHealth?.steps             ? `${todayHealth.steps}`            : "—")}
      </div>
    </div>

    <div class="card">
      <div class="card-title">クイック操作</div>
      <div class="btn-row">
        <button id="home-add-finance" class="btn-primary">家計簿を追加</button>
        <button id="home-add-health"  class="btn-secondary">健康を入力</button>
      </div>
      <div class="divider"></div>
      <p class="subtle">データはこの端末のブラウザ内にのみ保存されます。</p>
    </div>
  `;

  document.getElementById("home-add-finance").onclick = () => openFinanceModal(today);
  document.getElementById("home-add-health").onclick  = () => openHealthModal(today);
}

// ─── FINANCE ────────────────────────────────────────────────────────────────
function renderFinance() {
  const md = getMonthlyFinance(appState.financeMonth);
  const totalAssets = getTotalAssets();
  const sel = appState.selectedDate;
  const selEntries = getFinanceByDate(sel);
  const dates = calendarDates(appState.financeMonth);
  const el = document.getElementById("tab-finance");

  el.innerHTML = `
    <div class="card">
      <div class="metric-grid">
        <div class="metric-box">
          <div class="metric-label">全財産</div>
          <div class="metric-value ${totalAssets < 0 ? "red" : ""}">${fmtCurrency(totalAssets)}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">今月の収入</div>
          <div class="metric-value">${fmtCurrency(md.income)}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">支出</div>
          <div class="metric-value red">${fmtCurrency(md.expense)}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">固定費</div>
          <div class="metric-value">${fmtCurrency(md.fixedCost)}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="cal-nav">
        <button id="fin-prev" class="btn-secondary btn-sm">◀</button>
        <h3>${fmtMonthYear(appState.financeMonth)}</h3>
        <button id="fin-next" class="btn-secondary btn-sm">▶</button>
      </div>
      <div class="cal-weekdays">
        <div>日</div><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div>土</div>
      </div>
      <div class="cal-grid">
        ${dates.map((d) => {
          const ds = dateStr(d);
          const exp = getDailyExpense(ds);
          const isCur = d.getMonth() === appState.financeMonth.getMonth();
          const isToday = ds === dateStr(new Date());
          const isSel = ds === sel;
          return `<button class="cal-cell${isCur ? "" : " outside"}${isToday ? " today" : ""}${isSel ? " selected" : ""}" data-date="${ds}">
            <div class="day">${d.getDate()}</div>
            ${exp ? `<div class="amount">${fmtCurrency(exp)}</div>` : ""}
          </button>`;
        }).join("")}
      </div>
      <div class="divider"></div>
      <button id="fin-add" class="btn-primary btn-full">選択日（${sel}）に追加</button>
    </div>

    <div class="card">
      <div class="row between" style="margin-bottom:12px;">
        <div class="card-title" style="margin-bottom:0;">${sel} の明細</div>
      </div>
      <div class="metric-grid" style="margin-bottom:12px;">
        <div class="metric-box">
          <div class="metric-label">収入</div>
          <div class="metric-value">${fmtCurrency(sumBy(selEntries.filter(e => e.type === "income"), "amount"))}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">支出</div>
          <div class="metric-value red">${fmtCurrency(sumBy(selEntries.filter(e => e.type === "expense"), "amount"))}</div>
        </div>
      </div>
      <div class="entry-list">
        ${selEntries.length
          ? selEntries.map(financeEntryHTML).join("")
          : `<div class="empty">まだ入力がありません</div>`}
      </div>
    </div>
  `;

  document.getElementById("fin-prev").onclick = () => {
    appState.financeMonth = addMonths(appState.financeMonth, -1);
    renderFinance();
  };
  document.getElementById("fin-next").onclick = () => {
    appState.financeMonth = addMonths(appState.financeMonth, 1);
    renderFinance();
  };
  document.getElementById("fin-add").onclick = () => openFinanceModal(sel);

  el.querySelectorAll(".cal-cell").forEach((btn) => {
    btn.onclick = () => { appState.selectedDate = btn.dataset.date; renderFinance(); };
  });
  el.querySelectorAll("[data-action='edit-finance']").forEach((btn) => {
    btn.onclick = () => {
      const item = appState.data.financeEntries.find(e => e.id === btn.dataset.id);
      if (item) openFinanceModal(item.date, item);
    };
  });
  el.querySelectorAll("[data-action='del-finance']").forEach((btn) => {
    btn.onclick = () => {
      if (!confirm("削除しますか？")) return;
      appState.data.financeEntries = appState.data.financeEntries.filter(e => e.id !== btn.dataset.id);
      saveState(); renderApp();
    };
  });
}

function financeEntryHTML(item) {
  return `
    <div class="entry-item">
      <div class="entry-item-top">
        <div>
          <div class="entry-item-title">${esc(item.title || "(無題)")}</div>
          <div class="entry-item-meta">${item.type === "income" ? "収入" : "支出"}</div>
        </div>
        <div class="entry-item-amount ${item.type === "expense" ? "red" : ""}">${fmtCurrency(item.amount)}</div>
      </div>
      ${item.note ? `<div class="entry-item-note">${esc(item.note)}</div>` : ""}
      <div class="entry-item-actions">
        <button class="btn-secondary btn-sm" data-action="edit-finance" data-id="${item.id}">編集</button>
        <button class="btn-danger btn-sm"    data-action="del-finance"  data-id="${item.id}">削除</button>
      </div>
    </div>`;
}

// ─── HEALTH ─────────────────────────────────────────────────────────────────
function renderHealth() {
  const today = dateStr(new Date());
  const todayH = getHealthByDate(today);
  const entries = [...appState.data.healthEntries].sort((a, b) => b.date.localeCompare(a.date));
  const el = document.getElementById("tab-health");

  el.innerHTML = `
    <div class="card">
      <div class="row between" style="margin-bottom:14px;">
        <div class="card-title" style="margin-bottom:0;">今日の健康</div>
        <button id="health-add-today" class="btn-primary btn-sm">今日を入力</button>
      </div>
      <div class="metric-grid">
        ${mBox("体重",      todayH?.weight            ? `${todayH.weight} kg`         : "—")}
        ${mBox("体脂肪率",  todayH?.bodyFatPercentage ? `${todayH.bodyFatPercentage}%` : "—")}
        ${mBox("摂取 kcal", todayH?.intakeCalories    ? `${todayH.intakeCalories}`    : "—")}
        ${mBox("歩数",      todayH?.steps             ? `${todayH.steps}`             : "—")}
        ${mBox("運動消費",  todayH?.activeCalories    ? `${todayH.activeCalories} kcal` : "—")}
      </div>
    </div>

    <div class="card">
      <div class="card-title">健康履歴</div>
      <div class="entry-list">
        ${entries.length
          ? entries.map(healthEntryHTML).join("")
          : `<div class="empty">まだデータがありません</div>`}
      </div>
    </div>
  `;

  document.getElementById("health-add-today").onclick = () => openHealthModal(today);
  el.querySelectorAll("[data-action='edit-health']").forEach((btn) => {
    btn.onclick = () => {
      const item = appState.data.healthEntries.find(e => e.date === btn.dataset.date);
      openHealthModal(btn.dataset.date, item);
    };
  });
  el.querySelectorAll("[data-action='del-health']").forEach((btn) => {
    btn.onclick = () => {
      if (!confirm("削除しますか？")) return;
      appState.data.healthEntries = appState.data.healthEntries.filter(e => e.date !== btn.dataset.date);
      saveState(); renderApp();
    };
  });
}

function healthEntryHTML(item) {
  return `
    <div class="entry-item">
      <div class="entry-item-title">${item.date}</div>
      <div class="pill-row">
        <span class="pill">体重 ${item.weight ?? "—"}</span>
        <span class="pill">体脂肪 ${item.bodyFatPercentage ?? "—"}</span>
        <span class="pill">摂取 ${item.intakeCalories ?? "—"}</span>
        <span class="pill">歩数 ${item.steps ?? "—"}</span>
        <span class="pill">運動消費 ${item.activeCalories ?? "—"}</span>
      </div>
      <div class="entry-item-actions">
        <button class="btn-secondary btn-sm" data-action="edit-health" data-date="${item.date}">編集</button>
        <button class="btn-danger btn-sm"    data-action="del-health"  data-date="${item.date}">削除</button>
      </div>
    </div>`;
}

// ─── ANALYTICS ──────────────────────────────────────────────────────────────
function renderAnalytics() {
  const md = getMonthlyFinance(appState.financeMonth);
  const base = Math.max(md.income, md.expense, md.fixedCost, 1);
  const el = document.getElementById("tab-analytics");

  el.innerHTML = `
    <div class="card">
      <div class="card-title">今月の内訳</div>
      <div class="badge" style="margin-bottom:14px;">${fmtMonthYear(appState.financeMonth)}</div>
      <div class="breakdown-list">
        ${breakdownBar("収入",   md.income,    "income",  base)}
        ${breakdownBar("支出",   md.expense,   "expense", base)}
        ${breakdownBar("固定費", md.fixedCost, "fixed",   base)}
      </div>
    </div>

    <div class="card">
      <div class="row between" style="margin-bottom:10px;">
        <div class="card-title" style="margin-bottom:0;">月別収支推移</div>
        <span class="badge">直近6か月</span>
      </div>
      <div class="legend">
        <div class="legend-item"><div class="legend-dot income"></div>収入</div>
        <div class="legend-item"><div class="legend-dot expense"></div>支出</div>
        <div class="legend-item"><div class="legend-dot fixed"></div>固定費</div>
      </div>
      <div class="chart-wrap">${renderTrendChart()}</div>
    </div>

    <div class="card">
      <div class="row between" style="margin-bottom:10px;">
        <div class="card-title" style="margin-bottom:0;">体重推移</div>
        <span class="badge">直近14件</span>
      </div>
      <div class="chart-wrap">${renderWeightChart()}</div>
    </div>

    <div class="card">
      <div class="row between" style="margin-bottom:10px;">
        <div class="card-title" style="margin-bottom:0;">摂取カロリー推移</div>
        <span class="badge">直近14件</span>
      </div>
      <div class="chart-wrap">${renderCalChart()}</div>
    </div>
  `;
}

function breakdownBar(label, amount, kind, base) {
  const w = Math.max(2, Math.round((amount / base) * 100));
  return `
    <div>
      <div class="breakdown-item-label">
        <strong>${label}</strong>
        <span>${fmtCurrency(amount)}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill ${kind}" style="width:${w}%"></div>
      </div>
    </div>`;
}

// ─── SETTINGS ───────────────────────────────────────────────────────────────
function renderSettings() {
  const fixed = [...appState.data.fixedCosts].sort((a, b) => a.dayOfMonth - b.dayOfMonth);
  const el = document.getElementById("tab-settings");

  el.innerHTML = `
    <div class="card">
      <div class="row between" style="margin-bottom:14px;">
        <div class="card-title" style="margin-bottom:0;">固定費</div>
        <button id="add-fixed" class="btn-primary btn-sm">追加</button>
      </div>
      <p class="subtle" style="margin-bottom:12px;">固定費は毎月の全財産から自動で差し引かれます。</p>
      <div class="entry-list">
        ${fixed.length
          ? fixed.map(fixedCostHTML).join("")
          : `<div class="empty">まだ固定費がありません</div>`}
      </div>
    </div>

    <div class="card">
      <div class="card-title">バックアップ</div>
      <div class="btn-row">
        <button id="export-btn" class="btn-secondary">書き出し（JSON）</button>
        <button id="import-btn" class="btn-secondary">読み込み（JSON）</button>
      </div>
      <div class="divider"></div>
      <p class="subtle">機種変更やブラウザ変更前にバックアップをお勧めします。</p>
    </div>
  `;

  document.getElementById("add-fixed").onclick = () => openFixedModal();
  document.getElementById("export-btn").onclick = exportBackup;
  document.getElementById("import-btn").onclick = () => document.getElementById("backup-import-input").click();

  el.querySelectorAll("[data-action='edit-fixed']").forEach((btn) => {
    btn.onclick = () => {
      const item = appState.data.fixedCosts.find(e => e.id === btn.dataset.id);
      if (item) openFixedModal(item);
    };
  });
  el.querySelectorAll("[data-action='del-fixed']").forEach((btn) => {
    btn.onclick = () => {
      if (!confirm("削除しますか？")) return;
      appState.data.fixedCosts = appState.data.fixedCosts.filter(e => e.id !== btn.dataset.id);
      saveState(); renderApp();
    };
  });
}

function fixedCostHTML(item) {
  return `
    <div class="entry-item">
      <div class="entry-item-top">
        <div>
          <div class="entry-item-title">${esc(item.name)}</div>
          <div class="entry-item-meta">毎月 ${item.dayOfMonth} 日</div>
        </div>
        <div class="entry-item-amount">${fmtCurrency(item.amount)}</div>
      </div>
      ${item.memo ? `<div class="entry-item-note">${esc(item.memo)}</div>` : ""}
      <div class="entry-item-actions">
        <button class="btn-secondary btn-sm" data-action="edit-fixed" data-id="${item.id}">編集</button>
        <button class="btn-danger btn-sm"    data-action="del-fixed"  data-id="${item.id}">削除</button>
      </div>
    </div>`;
}

// ─── Modals ─────────────────────────────────────────────────────────────────
function openModal(title, html) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = html;
  document.getElementById("modal-overlay").classList.remove("hidden");
}
function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  document.getElementById("modal-body").innerHTML = "";
}

function openFinanceModal(ds, existing = null) {
  const title = existing ? "家計簿を編集" : "家計簿を追加";
  openModal(title, `
    <form id="fin-form" class="form-stack">
      <input type="hidden" name="id" value="${existing?.id || ""}">
      <div>
        <label>日付</label>
        <input type="date" name="date" value="${existing?.date || ds}" required>
      </div>
      <div>
        <label>種類</label>
        <select name="type">
          <option value="expense" ${!existing || existing.type === "expense" ? "selected" : ""}>支出</option>
          <option value="income"  ${existing?.type === "income" ? "selected" : ""}>収入</option>
        </select>
      </div>
      <div>
        <label>内容</label>
        <input type="text" name="title" value="${escAttr(existing?.title || "")}" placeholder="例: 昼食 / 給料" required>
      </div>
      <div>
        <label>金額</label>
        <input type="number" name="amount" min="0" step="1" value="${existing?.amount ?? ""}" placeholder="例: 1200" required>
      </div>
      <div>
        <label>メモ（任意）</label>
        <textarea name="note">${esc(existing?.note || "")}</textarea>
      </div>
      <div class="btn-row">
        <button type="submit" class="btn-primary">${existing ? "更新" : "保存"}</button>
        <button type="button" class="btn-secondary" id="fin-cancel">キャンセル</button>
      </div>
    </form>
  `);
  document.getElementById("fin-cancel").onclick = closeModal;
  document.getElementById("fin-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const item = {
      id:     f.get("id") || randomId(),
      date:   String(f.get("date")),
      type:   String(f.get("type")),
      title:  String(f.get("title")).trim(),
      amount: Number(f.get("amount")),
      note:   String(f.get("note")).trim(),
    };
    if (!item.title || !item.date || isNaN(item.amount)) return;
    const idx = appState.data.financeEntries.findIndex(x => x.id === item.id);
    if (idx >= 0) appState.data.financeEntries[idx] = item;
    else appState.data.financeEntries.push(item);
    appState.selectedDate = item.date;
    saveState(); closeModal(); renderApp();
  };
}

function openHealthModal(ds, existing = null) {
  const title = existing ? "健康データを編集" : "健康データを入力";
  openModal(title, `
    <form id="health-form" class="form-stack">
      <div>
        <label>日付</label>
        <input type="date" name="date" value="${existing?.date || ds}" required>
      </div>
      <div class="form-row">
        <div>
          <label>体重 (kg)</label>
          <input type="number" name="weight" min="0" step="0.1" value="${existing?.weight ?? ""}">
        </div>
        <div>
          <label>体脂肪率 (%)</label>
          <input type="number" name="bodyFatPercentage" min="0" step="0.1" value="${existing?.bodyFatPercentage ?? ""}">
        </div>
      </div>
      <div class="form-row">
        <div>
          <label>摂取kcal</label>
          <input type="number" name="intakeCalories" min="0" step="1" value="${existing?.intakeCalories ?? ""}">
        </div>
        <div>
          <label>歩数</label>
          <input type="number" name="steps" min="0" step="1" value="${existing?.steps ?? ""}">
        </div>
      </div>
      <div>
        <label>運動消費kcal</label>
        <input type="number" name="activeCalories" min="0" step="1" value="${existing?.activeCalories ?? ""}">
      </div>
      <div class="btn-row">
        <button type="submit" class="btn-primary">${existing ? "更新" : "保存"}</button>
        <button type="button" class="btn-secondary" id="health-cancel">キャンセル</button>
      </div>
    </form>
  `);
  document.getElementById("health-cancel").onclick = closeModal;
  document.getElementById("health-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const item = {
      date:              String(f.get("date")),
      weight:            toNum(f.get("weight")),
      bodyFatPercentage: toNum(f.get("bodyFatPercentage")),
      intakeCalories:    toInt(f.get("intakeCalories")),
      steps:             toInt(f.get("steps")),
      activeCalories:    toInt(f.get("activeCalories")),
    };
    appState.data.healthEntries = appState.data.healthEntries.filter(x => x.date !== item.date);
    appState.data.healthEntries.push(item);
    saveState(); closeModal(); renderApp();
  };
}

function openFixedModal(existing = null) {
  const title = existing ? "固定費を編集" : "固定費を追加";
  openModal(title, `
    <form id="fixed-form" class="form-stack">
      <input type="hidden" name="id" value="${existing?.id || ""}">
      <div>
        <label>名前</label>
        <input type="text" name="name" value="${escAttr(existing?.name || "")}" placeholder="例: 家賃 / サブスク" required>
      </div>
      <div class="form-row">
        <div>
          <label>金額</label>
          <input type="number" name="amount" min="0" step="1" value="${existing?.amount ?? ""}" required>
        </div>
        <div>
          <label>毎月何日</label>
          <input type="number" name="dayOfMonth" min="1" max="31" step="1" value="${existing?.dayOfMonth ?? 1}" required>
        </div>
      </div>
      <div>
        <label>メモ（任意）</label>
        <textarea name="memo">${esc(existing?.memo || "")}</textarea>
      </div>
      <div class="btn-row">
        <button type="submit" class="btn-primary">${existing ? "更新" : "保存"}</button>
        <button type="button" class="btn-secondary" id="fixed-cancel">キャンセル</button>
      </div>
    </form>
  `);
  document.getElementById("fixed-cancel").onclick = closeModal;
  document.getElementById("fixed-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const item = {
      id:         f.get("id") || randomId(),
      name:       String(f.get("name")).trim(),
      amount:     Number(f.get("amount")),
      dayOfMonth: Number(f.get("dayOfMonth")),
      memo:       String(f.get("memo")).trim(),
    };
    if (!item.name || isNaN(item.amount)) return;
    const idx = appState.data.fixedCosts.findIndex(x => x.id === item.id);
    if (idx >= 0) appState.data.fixedCosts[idx] = item;
    else appState.data.fixedCosts.push(item);
    saveState(); closeModal(); renderApp();
  };
}

// ─── Finance Calculations ────────────────────────────────────────────────────
function getMonthlyFinance(monthDate) {
  const mk = typeof monthDate === "string" ? monthDate : fmtMonthKey(monthDate);
  const entries = appState.data.financeEntries.filter(x => x.date?.startsWith(mk));
  return {
    income:    sumBy(entries.filter(x => x.type === "income"),  "amount"),
    expense:   sumBy(entries.filter(x => x.type === "expense"), "amount"),
    fixedCost: sumBy(appState.data.fixedCosts, "amount"),
  };
}

function getAllMonthKeys() {
  const s = new Set();
  appState.data.financeEntries.forEach(x => {
    if (x.date?.length >= 7) s.add(x.date.slice(0, 7));
  });
  // Also include current month even if empty, so fixed costs are always counted
  s.add(fmtMonthKey(new Date()));
  return [...s].sort();
}

function getTotalAssets() {
  return getAllMonthKeys().reduce((sum, mk) => {
    const md = getMonthlyFinance(mk);
    return sum + md.income - md.expense - md.fixedCost;
  }, 0);
}

function getFinanceByDate(ds) {
  return appState.data.financeEntries
    .filter(x => x.date === ds)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "income" ? -1 : 1;
      return a.title.localeCompare(b.title, "ja");
    });
}

function getDailyExpense(ds) {
  return sumBy(appState.data.financeEntries.filter(x => x.date === ds && x.type === "expense"), "amount");
}

function getHealthByDate(ds) {
  return appState.data.healthEntries.find(x => x.date === ds) || null;
}

// ─── Charts ─────────────────────────────────────────────────────────────────
function renderTrendChart() {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = addMonths(startOfMonth(new Date()), -i);
    const md = getMonthlyFinance(d);
    months.push({ label: `${d.getMonth()+1}月`, income: md.income, expense: md.expense, fixed: md.fixedCost });
  }
  const W = 640, H = 180;
  const pad = { t: 16, r: 16, b: 32, l: 16 };
  const maxV = Math.max(1, ...months.flatMap(m => [m.income, m.expense, m.fixed]));
  const gw = (W - pad.l - pad.r) / months.length;
  const bw = Math.min(14, gw / 4.5);
  const ch = H - pad.t - pad.b;
  const colors = { income: "#111318", expense: "#e03e3e", fixed: "#8b92a5" };

  const grid = [0.25, 0.5, 0.75, 1].map(r => {
    const y = pad.t + (1 - r) * ch;
    return `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="#e2e5ec" stroke-width="1"/>`;
  }).join("");

  const bars = months.map((m, i) => {
    const cx = pad.l + i * gw + gw / 2;
    const vals = [
      { key: "income",  val: m.income,  x: cx - bw * 1.6 },
      { key: "expense", val: m.expense, x: cx - bw * 0.3 },
      { key: "fixed",   val: m.fixed,   x: cx + bw * 1.0 },
    ];
    const rects = vals.map(v => {
      const bh = Math.max(2, (v.val / maxV) * ch);
      const y = H - pad.b - bh;
      return `<rect x="${v.x}" y="${y}" width="${bw}" height="${bh}" rx="3" fill="${colors[v.key]}"/>`;
    }).join("");
    return rects + `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#8b92a5">${m.label}</text>`;
  }).join("");

  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg">${grid}${bars}</svg>`;
}

function renderWeightChart() {
  const pts = appState.data.healthEntries
    .filter(x => x.weight)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
    .map(x => ({ label: x.date.slice(5), val: Number(x.weight) }));
  if (!pts.length) return `<div class="empty" style="padding:24px 0;">体重データがまだありません</div>`;
  return lineChartSVG(pts, "kg");
}

function renderCalChart() {
  const pts = appState.data.healthEntries
    .filter(x => x.intakeCalories)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
    .map(x => ({ label: x.date.slice(5), val: Number(x.intakeCalories) }));
  if (!pts.length) return `<div class="empty" style="padding:24px 0;">摂取カロリーデータがまだありません</div>`;
  return barChartSVG(pts, "kcal");
}

function lineChartSVG(pts, suffix = "") {
  const W = 640, H = 180;
  const pad = { t: 20, r: 16, b: 30, l: 16 };
  const vals = pts.map(p => p.val);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;

  const coords = pts.map((p, i) => ({
    x: pad.l + (pts.length === 1 ? pw / 2 : pw * i / (pts.length - 1)),
    y: pad.t + ((maxV - p.val) / range) * ph,
    ...p
  }));

  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  const grid = [0, 0.5, 1].map(r => {
    const y = pad.t + r * ph;
    return `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="#e2e5ec" stroke-width="1"/>`;
  }).join("");
  const circles = coords.map(c =>
    `<circle cx="${c.x}" cy="${c.y}" r="3.5" fill="#3b6ff0"/>` +
    `<text x="${c.x}" y="${c.y - 8}" text-anchor="middle" font-size="10" fill="#111318" font-weight="600">${c.val}${suffix}</text>`
  ).join("");
  const labels = coords.filter((_, i) => pts.length <= 8 || i % 2 === 0).map(c =>
    `<text x="${c.x}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#8b92a5">${c.label}</text>`
  ).join("");

  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg">${grid}
    <path d="${path}" fill="none" stroke="#3b6ff0" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${circles}${labels}</svg>`;
}

function barChartSVG(pts, suffix = "") {
  const W = 640, H = 180;
  const pad = { t: 24, r: 16, b: 30, l: 16 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const maxV = Math.max(...pts.map(p => p.val), 1);
  const bw = Math.max(10, Math.min(28, pw / (pts.length * 1.8)));

  const grid = [0, 0.5, 1].map(r => {
    const y = pad.t + (1 - r) * ph;
    return `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="#e2e5ec" stroke-width="1"/>`;
  }).join("");

  const bars = pts.map((p, i) => {
    const x = pad.l + (pw / pts.length) * i + (pw / pts.length - bw) / 2;
    const bh = Math.max(2, (p.val / maxV) * ph);
    const y = H - pad.b - bh;
    return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="4" fill="#3b6ff0"/>` +
      `<text x="${x + bw/2}" y="${y - 5}" text-anchor="middle" font-size="10" fill="#111318" font-weight="600">${p.val}</text>` +
      `<text x="${x + bw/2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#8b92a5">${p.label}</text>`;
  }).join("");

  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg">${grid}${bars}</svg>`;
}

// ─── Backup ──────────────────────────────────────────────────────────────────
function exportBackup() {
  const blob = new Blob([JSON.stringify(appState.data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `kakeibo-backup-${dateStr(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importBackup(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      appState.data = normalizeState(parsed);
      saveState(); renderApp();
      alert("バックアップを読み込みました。");
    } catch {
      alert("JSONの読み込みに失敗しました。");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

// ─── Service Worker ──────────────────────────────────────────────────────────
function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────
function randomId() {
  return window.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function dateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function fmtMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function fmtMonthYear(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}
function fmtCurrency(v) {
  return `¥${Number(v || 0).toLocaleString("ja-JP")}`;
}
function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}
function sumBy(arr, key) {
  return arr.reduce((s, x) => s + Number(x[key] || 0), 0);
}
function toNum(v) {
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}
function toInt(v) {
  const n = toNum(v);
  return n === null ? null : Math.round(n);
}
function esc(v) {
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escAttr(v) {
  return esc(v).replace(/'/g, "&#39;");
}
function mBox(label, value) {
  return `<div class="metric-box">
    <div class="metric-label">${esc(label)}</div>
    <div class="metric-value">${esc(String(value))}</div>
  </div>`;
}
function calendarDates(base) {
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}
