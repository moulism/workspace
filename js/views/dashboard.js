import { Events, Todos, Goals, Folders } from "../db.js";
import { escapeHtml, fmtTime, fmtDate, todayIso, CATEGORY_COLORS } from "../ui.js";
import { toastError } from "../toast.js";
import { hasGoogle, Gmail } from "../google.js";
import { expandRecurrence } from "../recurrence.js";

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

let weekChart = null;
let goalCharts = [];

export async function render(container) {
  container.innerHTML = `
    <div class="grid grid-2" style="margin-bottom:16px;">
      <div class="card dash-clock-card" id="clock-card">
        <div class="dash-clock-ring">
          <div class="dash-clock-inner">
            <div class="faint" id="clock-date"></div>
            <div class="dash-clock-time" id="clock-time"></div>
            <div class="faint dash-clock-doy" id="clock-doy"></div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="faint" style="margin-bottom:6px;">// RYCHLÝ PŘÍKAZ</div>
        <form id="quick-todo-form" style="display:flex;gap:8px;">
          <input type="text" id="quick-todo-input" placeholder="Co je potřeba udělat?" />
          <button class="btn btn-primary" type="submit">Přidat</button>
        </form>
        <div class="dash-kpi-row" id="dash-kpis"></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <div class="section-header" style="margin-bottom:10px;"><h2 style="font-size:15px;">Aktivita — příštích 7 dní</h2></div>
      <div class="dash-chart-box"><canvas id="dash-week-chart"></canvas></div>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <div class="section-header" style="margin-bottom:10px;"><h2 style="font-size:15px;">Aktivní cíle</h2></div>
      <div class="dash-goal-rings" id="dash-goal-rings"></div>
    </div>

    <div class="grid grid-3">
      <div class="card">
        <div class="section-header" style="margin-bottom:10px;"><h2 style="font-size:15px;">Dnes v kalendáři</h2></div>
        <div id="today-events" class="list"></div>
      </div>
      <div class="card">
        <div class="section-header" style="margin-bottom:10px;"><h2 style="font-size:15px;">Úkoly ke splnění</h2></div>
        <div id="due-todos" class="list"></div>
      </div>
      <div class="card" id="gmail-card"></div>
    </div>
  `;

  startClock(container);

  container.querySelector("#quick-todo-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = container.querySelector("#quick-todo-input");
    const title = input.value.trim();
    if (!title) return;
    try {
      await Todos.create({ title, due_date: todayIso() });
      input.value = "";
      loadDueTodos(container, stats).then(() => renderKpis(container, stats));
    } catch (err) {
      toastError(err);
    }
  });

  const stats = { events: 0, todos: 0, goalsCount: 0, goalsAvg: 0 };
  await Promise.all([
    loadTodayEvents(container, stats),
    loadDueTodos(container, stats),
    loadGoals(container, stats),
    loadGmail(container),
    loadWeekChart(container),
  ]);
  renderKpis(container, stats);
}

function startClock(container) {
  const dateEl = container.querySelector("#clock-date");
  const timeEl = container.querySelector("#clock-time");
  const doyEl = container.querySelector("#clock-doy");
  function tick() {
    if (!container.isConnected) return;
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    timeEl.textContent = now.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
    if (doyEl) {
      const start = new Date(now.getFullYear(), 0, 0);
      const doy = Math.floor((now - start) / 86400000);
      const y = now.getFullYear();
      const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      doyEl.textContent = `DEN ${doy} / ${leap ? 366 : 365}`;
    }
  }
  tick();
  const iv = setInterval(() => {
    if (!container.isConnected) return clearInterval(iv);
    tick();
  }, 1000 * 15);
}

async function loadTodayEvents(container, stats) {
  const box = container.querySelector("#today-events");
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    // Plain events only cover their own stored start/end — a recurring
    // event (e.g. a weekly class schedule) is stored once as a "master"
    // row and its actual occurrences only exist virtually, expanded on the
    // fly for whatever range we're looking at. Without this, anything
    // recurring only ever showed up on its original creation date.
    const [plain, recurringMasters, folders] = await Promise.all([
      Events.listRange(start.toISOString(), end.toISOString()),
      Events.listAllRecurring(),
      Folders.list().catch(() => []),
    ]);
    const nonRecurring = plain.filter((e) => !e.recurrence || !e.recurrence.freq || e.recurrence.freq === "none");
    const expanded = recurringMasters.flatMap((m) => expandRecurrence(m, start, end));
    const events = [...nonRecurring, ...expanded].sort((a, b) => (a.start_at || "").localeCompare(b.start_at || ""));

    const folderColor = Object.fromEntries((folders || []).filter((f) => f.color).map((f) => [f.id, f.color]));
    stats.events = events.length;
    if (!events.length) {
      box.innerHTML = `<div class="faint">Dnes žádné události.</div>`;
      return;
    }
    box.innerHTML = events
      .map(
        (e) => `<a class="list-item" href="#/calendar">
          <span class="dot" style="background:${(e.folder_id && folderColor[e.folder_id]) || CATEGORY_COLORS[e.category] || "#6b6a68"}"></span>
          <div class="grow">
            <div class="title truncate">${escapeHtml(e.title)}</div>
            <div class="faint">${e.all_day ? "celý den" : fmtTime(e.start_at)}${e.location ? " · " + escapeHtml(e.location) : ""}</div>
          </div>
        </a>`
      )
      .join("");
  } catch (e) {
    box.innerHTML = `<div class="faint">Nepodařilo se načíst.</div>`;
  }
}

async function loadDueTodos(container, stats) {
  const box = container.querySelector("#due-todos");
  try {
    const all = await Todos.list({ done: false });
    const today = todayIso();
    const horizon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const relevant = all.filter((t) => !t.due_date || t.due_date <= horizon);
    relevant.sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
    stats.todos = relevant.length;
    if (!relevant.length) {
      box.innerHTML = `<div class="faint">Nic po termínu ani v nejbližších 14 dnech 🎉</div>`;
      return;
    }
    box.innerHTML = relevant
      .slice(0, 6)
      .map((t) => {
        const overdue = t.due_date && t.due_date < today;
        const isToday = t.due_date === today;
        return `<label class="list-item">
          <input type="checkbox" data-id="${t.id}" class="todo-check" />
          <div class="grow">
            <div class="title truncate">${escapeHtml(t.title)}</div>
            <div class="faint" style="${overdue ? "color:var(--danger);font-weight:600;" : ""}">${
          t.due_date ? (overdue ? "po termínu · " : isToday ? "dnes" : "") + (isToday ? "" : fmtDate(t.due_date)) : "bez termínu"
        }</div>
          </div>
        </label>`;
      })
      .join("");
    box.querySelectorAll(".todo-check").forEach((cb) =>
      cb.addEventListener("change", async () => {
        await Todos.toggle(cb.dataset.id, true);
        loadDueTodos(container, stats).then(() => renderKpis(container, stats));
      })
    );
  } catch (e) {
    box.innerHTML = `<div class="faint">Nepodařilo se načíst.</div>`;
  }
}

async function loadGoals(container, stats) {
  const box = container.querySelector("#dash-goal-rings");
  goalCharts.forEach((c) => c.destroy());
  goalCharts = [];
  try {
    const goals = await Goals.list("active");
    stats.goalsCount = goals.length;
    stats.goalsAvg = goals.length ? Math.round(goals.reduce((s, g) => s + (g.progress || 0), 0) / goals.length) : 0;
    if (!goals.length) {
      box.innerHTML = `<div class="faint">Zatím žádné aktivní cíle.</div>`;
      return;
    }
    const shown = goals.slice(0, 6);
    box.innerHTML = shown
      .map(
        (g, i) => `<a class="dash-goal-ring" href="#/goals" title="${escapeHtml(g.title)}">
          <div class="dash-goal-canvas-wrap"><canvas id="dash-goal-${i}"></canvas><div class="dash-goal-pct">${g.progress}%</div></div>
          <div class="dash-goal-title truncate">${escapeHtml(g.title)}</div>
        </a>`
      )
      .join("");
    if (window.Chart) {
      shown.forEach((g, i) => {
        const ctx = container.querySelector(`#dash-goal-${i}`);
        if (!ctx) return;
        const pct = Math.max(0, Math.min(100, g.progress || 0));
        goalCharts.push(
          new Chart(ctx, {
            type: "doughnut",
            data: { datasets: [{ data: [pct, 100 - pct], backgroundColor: ["#22d3ee", "rgba(147,163,181,.18)"], borderWidth: 0 }] },
            options: { cutout: "78%", plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { duration: 500 } },
          })
        );
      });
    }
  } catch (e) {
    box.innerHTML = `<div class="faint">Nepodařilo se načíst.</div>`;
  }
}

async function loadGmail(container) {
  const box = container.querySelector("#gmail-card");
  if (!hasGoogle()) {
    box.innerHTML = `<div class="faint">Gmail není připojený s právy pro čtení. Přihlas se přes Google (Nastavení) pro zobrazení nepřečtených zpráv zde.</div>`;
    return;
  }
  box.innerHTML = `<div class="section-header" style="margin-bottom:10px;"><h2 style="font-size:15px;">Nepřečtené e-maily</h2></div><div class="list" id="gmail-list"><div class="faint">Načítám…</div></div>`;
  try {
    const msgs = await Gmail.listRecent(6);
    const list = box.querySelector("#gmail-list");
    if (!msgs.length) {
      list.innerHTML = `<div class="faint">Žádné nepřečtené zprávy 🎉</div>`;
      return;
    }
    list.innerHTML = msgs
      .map(
        (m) => `<div class="list-item" style="flex-direction:column;align-items:stretch;">
          <div class="title truncate">${escapeHtml(m.subject)}</div>
          <div class="faint truncate">${escapeHtml(m.from)}</div>
        </div>`
      )
      .join("");
  } catch (e) {
    box.querySelector("#gmail-list").innerHTML = `<div class="faint">Gmail přístup vypršel, znovu se přihlas v Nastavení.</div>`;
  }
}

async function loadWeekChart(container) {
  if (!window.Chart) return;
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 7 * 86400000 - 1);
    const [plain, recurringMasters, todos] = await Promise.all([
      Events.listRange(start.toISOString(), end.toISOString()),
      Events.listAllRecurring(),
      Todos.list({ done: false }),
    ]);
    const nonRecurring = plain.filter((e) => !e.recurrence || !e.recurrence.freq || e.recurrence.freq === "none");
    const expanded = recurringMasters.flatMap((m) => expandRecurrence(m, start, end));
    const allEvents = [...nonRecurring, ...expanded];

    const days = [];
    for (let i = 0; i < 7; i++) days.push(new Date(start.getTime() + i * 86400000));
    const dayKey = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    };
    const labels = days.map((d) => d.toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric" }));
    const eventCounts = days.map((d) => {
      const key = dayKey(d);
      return allEvents.filter((e) => (e.start_at || "").slice(0, 10) === key).length;
    });
    const todoCounts = days.map((d) => {
      const key = dayKey(d);
      return todos.filter((t) => t.due_date === key).length;
    });

    const text = cssVar("--text-muted");
    const border = cssVar("--border");

    weekChart?.destroy();
    const canvas = container.querySelector("#dash-week-chart");
    if (!canvas) return;
    weekChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Události", data: eventCounts, backgroundColor: "#22d3ee" },
          { label: "Úkoly", data: todoCounts, backgroundColor: "#d4af37" },
        ],
      },
      options: {
        plugins: { legend: { labels: { color: text, boxWidth: 10, font: { size: 10.5 } } } },
        scales: {
          x: { stacked: true, ticks: { color: text }, grid: { color: border } },
          y: { stacked: true, beginAtZero: true, ticks: { color: text, precision: 0 }, grid: { color: border } },
        },
      },
    });
  } catch (e) {
    // The chart is a nice-to-have overview — a silent skip beats a broken dashboard.
  }
}

function renderKpis(container, stats) {
  const box = container.querySelector("#dash-kpis");
  if (!box) return;
  box.innerHTML = `
    <div class="dash-kpi"><div class="n">${stats.events}</div><div class="l">Dnes v kalendáři</div></div>
    <div class="dash-kpi"><div class="n">${stats.todos}</div><div class="l">Úkoly ke splnění</div></div>
    <div class="dash-kpi"><div class="n">${stats.goalsCount}</div><div class="l">Aktivní cíle</div></div>
    <div class="dash-kpi"><div class="n">${stats.goalsAvg}%</div><div class="l">Průměrný postup</div></div>
  `;
}
