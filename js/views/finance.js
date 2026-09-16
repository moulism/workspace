import { FinanceCategories, FinanceTransactions } from "../db.js";
import { escapeHtml, openModal, confirmDialog } from "../ui.js";
import { toast, toastError } from "../toast.js";

const DEFAULT_CATEGORIES = ["Jídlo", "Bydlení", "Doprava", "Zábava", "Předplatné", "Ostatní"];
const MONTH_LABELS = ["Led", "Úno", "Bře", "Dub", "Kvě", "Čvn", "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro"];
const WEEKDAY_LABELS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const CHART_COLORS = ["#4f46e5", "#0f766e", "#dc4c3f", "#c98a1f", "#2f9e5b", "#a21caf", "#0284c7", "#6b6a68"];

let filters = { year: new Date().getFullYear(), month: String(new Date().getMonth() + 1).padStart(2, "0"), week: "all" };
let charts = { year: null, cat: null, week: null };
let chartJsReady = null;

function ensureChartJs() {
  if (window.Chart) return Promise.resolve();
  if (chartJsReady) return chartJsReady;
  chartJsReady = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return chartJsReady;
}

function isoWeek(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function weeksInMonth(year, month) {
  const weeks = new Set();
  let d = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  while (d <= last) {
    weeks.add(isoWeek(new Date(d)));
    d.setDate(d.getDate() + 1);
  }
  return [...weeks].sort((a, b) => a - b);
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

export async function render(container) {
  container.innerHTML = `
    <div class="section-header">
      <h2>Finance</h2>
      <div class="toolbar">
        <select id="fin-year"></select>
        <select id="fin-month"></select>
        <select id="fin-week"></select>
        <button class="btn btn-sm" id="fin-manage-cats">Kategorie</button>
      </div>
    </div>

    <div class="fin-kpis">
      <div class="card fin-kpi"><h4>Filtr — celkem</h4><p id="fin-kpi-total">0 Kč</p></div>
      <div class="card fin-kpi"><h4>Rok</h4><p id="fin-kpi-year">–</p></div>
      <div class="card fin-kpi"><h4>Měsíc</h4><p id="fin-kpi-month">–</p></div>
      <div class="card fin-kpi"><h4>Týden</h4><p id="fin-kpi-week">–</p></div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="panel-title" style="font-weight:600;margin-bottom:10px;">Analýza roku</div>
        <div class="fin-chart-box"><canvas id="fin-year-chart"></canvas></div>
        <div class="grid grid-2" style="margin-top:14px;">
          <div class="fin-chart-box"><canvas id="fin-cat-chart"></canvas></div>
          <div class="fin-chart-box"><canvas id="fin-week-chart"></canvas></div>
        </div>
      </div>
      <div class="card">
        <div class="panel-title" style="font-weight:600;margin-bottom:10px;">Přidat výdaj</div>
        <form id="fin-form" style="margin-bottom:16px;">
          <input type="hidden" id="fin-edit-id" />
          <div class="row" style="flex-wrap:wrap;margin-bottom:8px;">
            <input type="date" id="fin-date" required style="max-width:150px;" />
            <select id="fin-category" style="max-width:160px;"></select>
            <input type="number" id="fin-amount" placeholder="Částka (Kč)" required step="0.01" style="max-width:130px;" />
          </div>
          <div class="row" style="flex-wrap:wrap;">
            <input type="text" id="fin-note" placeholder="Poznámka (na co, nepovinné)…" />
            <button class="btn btn-primary" type="submit" id="fin-submit-btn" style="flex:0 0 auto;">Uložit</button>
          </div>
        </form>
        <div class="panel-title" style="font-weight:600;margin-bottom:8px;">Záznamy</div>
        <div style="overflow-x:auto;">
          <table class="fin-table">
            <thead><tr><th>Datum</th><th>Kategorie</th><th>Poznámka</th><th>Kč</th><th></th></tr></thead>
            <tbody id="fin-table-body"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  await ensureChartJs().catch(() => toastError("Nepodařilo se načíst grafy (Chart.js). Zkontroluj připojení."));

  populateDropdowns(container);

  container.querySelector("#fin-year").addEventListener("change", (e) => {
    filters.year = Number(e.target.value);
    populateWeekDropdown(container);
    load(container);
  });
  container.querySelector("#fin-month").addEventListener("change", (e) => {
    filters.month = e.target.value;
    populateWeekDropdown(container);
    load(container);
  });
  container.querySelector("#fin-week").addEventListener("change", (e) => {
    filters.week = e.target.value;
    load(container);
  });
  container.querySelector("#fin-manage-cats").addEventListener("click", () => openCategoryManager(container));

  container.querySelector("#fin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const idEl = container.querySelector("#fin-edit-id");
    const fields = {
      occurred_on: container.querySelector("#fin-date").value,
      category: container.querySelector("#fin-category").value,
      amount: Number(container.querySelector("#fin-amount").value) || 0,
      note: container.querySelector("#fin-note").value.trim() || null,
    };
    try {
      if (idEl.value) await FinanceTransactions.update(idEl.value, fields);
      else await FinanceTransactions.create(fields);
      e.target.reset();
      idEl.value = "";
      container.querySelector("#fin-submit-btn").textContent = "Uložit";
      container.querySelector("#fin-date").valueAsDate = new Date();
      load(container);
    } catch (err) {
      toastError(err);
    }
  });
  container.querySelector("#fin-date").valueAsDate = new Date();

  await load(container);
}

function populateDropdowns(container) {
  const now = new Date();
  const yearSel = container.querySelector("#fin-year");
  yearSel.innerHTML = "";
  for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 3; y++) {
    yearSel.innerHTML += `<option value="${y}" ${y === filters.year ? "selected" : ""}>${y}</option>`;
  }
  const monthSel = container.querySelector("#fin-month");
  monthSel.innerHTML = "";
  for (let i = 1; i <= 12; i++) {
    const v = String(i).padStart(2, "0");
    monthSel.innerHTML += `<option value="${v}" ${v === filters.month ? "selected" : ""}>${MONTH_LABELS[i - 1]}</option>`;
  }
  populateWeekDropdown(container);
}

function populateWeekDropdown(container) {
  const weekSel = container.querySelector("#fin-week");
  const weeks = weeksInMonth(filters.year, Number(filters.month));
  weekSel.innerHTML = `<option value="all">Celý měsíc</option>${weeks.map((w) => `<option value="${w}" ${String(w) === filters.week ? "selected" : ""}>Týden ${w}</option>`).join("")}`;
  if (!weeks.map(String).includes(filters.week)) filters.week = "all";
  weekSel.value = filters.week;
}

async function ensureDefaultCategories() {
  let cats = await FinanceCategories.list();
  if (!cats.length) {
    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      await FinanceCategories.create({ name: DEFAULT_CATEGORIES[i], sort_order: i }).catch(() => {});
    }
    cats = await FinanceCategories.list();
  }
  return cats;
}

async function load(container) {
  try {
    const cats = await ensureDefaultCategories();
    const catSel = container.querySelector("#fin-category");
    const prevVal = catSel.value;
    catSel.innerHTML = cats.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
    if (cats.some((c) => c.name === prevVal)) catSel.value = prevVal;

    const all = await FinanceTransactions.list({ from: `${filters.year}-01-01`, to: `${filters.year}-12-31` });

    const monthNum = Number(filters.month);
    const filtered = all.filter((t) => {
      const d = new Date(t.occurred_on + "T00:00:00");
      if (d.getMonth() + 1 !== monthNum) return false;
      if (filters.week !== "all" && isoWeek(d) !== Number(filters.week)) return false;
      return true;
    });

    const yearTotal = all.reduce((s, t) => s + Number(t.amount), 0);
    const monthTotal = all
      .filter((t) => new Date(t.occurred_on + "T00:00:00").getMonth() + 1 === monthNum)
      .reduce((s, t) => s + Number(t.amount), 0);
    const filteredTotal = filtered.reduce((s, t) => s + Number(t.amount), 0);

    container.querySelector("#fin-kpi-total").textContent = `${filteredTotal.toLocaleString("cs-CZ")} Kč`;
    container.querySelector("#fin-kpi-year").textContent = `${yearTotal.toLocaleString("cs-CZ")} Kč`;
    container.querySelector("#fin-kpi-month").textContent = `${monthTotal.toLocaleString("cs-CZ")} Kč`;
    container.querySelector("#fin-kpi-week").textContent =
      filters.week === "all" ? "celý měsíc" : `${filtered.reduce((s, t) => s + Number(t.amount), 0).toLocaleString("cs-CZ")} Kč`;

    renderCharts(container, all, filtered);
    renderTable(container, filtered);
  } catch (e) {
    toastError(e);
  }
}

function renderCharts(container, all, filtered) {
  if (!window.Chart) return;
  const text = cssVar("--text-muted");
  const border = cssVar("--border");
  const gridColor = border;

  const months = new Array(12).fill(0);
  all.forEach((t) => (months[new Date(t.occurred_on + "T00:00:00").getMonth()] += Number(t.amount)));

  const byCat = {};
  filtered.forEach((t) => (byCat[t.category] = (byCat[t.category] || 0) + Number(t.amount)));

  const weekdays = [0, 0, 0, 0, 0, 0, 0];
  filtered.forEach((t) => {
    const d = new Date(t.occurred_on + "T00:00:00");
    weekdays[(d.getDay() + 6) % 7] += Number(t.amount);
  });

  const commonOpts = { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: text }, grid: { color: gridColor } }, y: { ticks: { color: text }, grid: { color: gridColor } } } };

  charts.year?.destroy();
  charts.year = new Chart(container.querySelector("#fin-year-chart"), {
    type: "line",
    data: { labels: MONTH_LABELS, datasets: [{ data: months, borderColor: "#4f46e5", backgroundColor: "rgba(79,70,229,.15)", fill: true, tension: 0.35 }] },
    options: commonOpts,
  });

  charts.cat?.destroy();
  charts.cat = new Chart(container.querySelector("#fin-cat-chart"), {
    type: "doughnut",
    data: { labels: Object.keys(byCat), datasets: [{ data: Object.values(byCat), backgroundColor: CHART_COLORS }] },
    options: { plugins: { legend: { position: "bottom", labels: { color: text, boxWidth: 10, font: { size: 10 } } } } },
  });

  charts.week?.destroy();
  charts.week = new Chart(container.querySelector("#fin-week-chart"), {
    type: "bar",
    data: { labels: WEEKDAY_LABELS, datasets: [{ data: weekdays, backgroundColor: "#4f46e5" }] },
    options: commonOpts,
  });
}

function renderTable(container, filtered) {
  const tbody = container.querySelector("#fin-table-body");
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="faint" style="text-align:center;padding:16px;">Žádné záznamy pro tento filtr.</td></tr>`;
    return;
  }
  const sorted = [...filtered].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
  tbody.innerHTML = sorted
    .map(
      (t) => `<tr>
        <td>${escapeHtml(t.occurred_on)}</td>
        <td>${escapeHtml(t.category)}</td>
        <td class="faint truncate" style="max-width:160px;">${t.note ? escapeHtml(t.note) : ""}</td>
        <td>${Number(t.amount).toLocaleString("cs-CZ")}</td>
        <td>
          <span class="action" data-edit="${t.id}">Upravit</span>
          <span class="action" data-del="${t.id}">Smazat</span>
        </td>
      </tr>`
    )
    .join("");
  tbody.querySelectorAll("[data-edit]").forEach((el) =>
    el.addEventListener("click", () => {
      const t = filtered.find((x) => x.id === el.dataset.edit);
      if (!t) return;
      container.querySelector("#fin-edit-id").value = t.id;
      container.querySelector("#fin-date").value = t.occurred_on;
      container.querySelector("#fin-category").value = t.category;
      container.querySelector("#fin-amount").value = t.amount;
      container.querySelector("#fin-note").value = t.note || "";
      container.querySelector("#fin-submit-btn").textContent = "Uložit změny";
      container.querySelector("#fin-form").scrollIntoView({ behavior: "smooth", block: "center" });
    })
  );
  tbody.querySelectorAll("[data-del]").forEach((el) =>
    el.addEventListener("click", async () => {
      if (await confirmDialog("Smazat tento záznam?")) {
        try {
          await FinanceTransactions.remove(el.dataset.del);
          load(container);
        } catch (e) {
          toastError(e);
        }
      }
    })
  );
}

async function openCategoryManager(container) {
  const cats = await FinanceCategories.list();
  const { el: modalEl, close } = openModal(`
    <div class="modal-header"><h3>Kategorie výdajů</h3><button class="btn btn-icon btn-ghost" data-close>✕</button></div>
    <div class="list" id="cat-list">
      ${cats.map((c) => `<div class="list-item"><span class="grow">${escapeHtml(c.name)}</span><button type="button" class="btn btn-icon btn-ghost btn-sm" data-del-cat="${c.id}">✕</button></div>`).join("")}
    </div>
    <form id="add-cat-form" style="display:flex;gap:8px;margin-top:10px;">
      <input type="text" id="new-cat-name" placeholder="Nová kategorie…" />
      <button class="btn btn-primary" type="submit">Přidat</button>
    </form>
    <div class="modal-actions"><button class="btn" data-close>Zavřít</button></div>
  `);
  modalEl.querySelectorAll("[data-del-cat]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await FinanceCategories.remove(b.dataset.delCat);
        close();
        openCategoryManager(container);
        load(container);
      } catch (e) {
        toastError(e);
      }
    })
  );
  modalEl.querySelector("#add-cat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = modalEl.querySelector("#new-cat-name").value.trim();
    if (!name) return;
    try {
      await FinanceCategories.create({ name, sort_order: cats.length });
      close();
      openCategoryManager(container);
      load(container);
    } catch (err) {
      toastError(err);
    }
  });
}
