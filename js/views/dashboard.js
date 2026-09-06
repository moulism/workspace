import { Events, Todos, Goals } from "../db.js";
import { escapeHtml, fmtTime, fmtDate, todayIso, CATEGORY_COLORS } from "../ui.js";
import { toastError } from "../toast.js";
import { hasGoogle, Gmail } from "../google.js";

export async function render(container) {
  container.innerHTML = `
    <div class="grid grid-2" style="margin-bottom:16px;">
      <div class="card" id="clock-card">
        <div class="faint" id="clock-date"></div>
        <div style="font-size:34px;font-weight:700;" id="clock-time"></div>
      </div>
      <div class="card">
        <div class="faint" style="margin-bottom:6px;">Rychlý úkol</div>
        <form id="quick-todo-form" style="display:flex;gap:8px;">
          <input type="text" id="quick-todo-input" placeholder="Co je potřeba udělat?" />
          <button class="btn btn-primary" type="submit">Přidat</button>
        </form>
      </div>
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
      <div class="card">
        <div class="section-header" style="margin-bottom:10px;"><h2 style="font-size:15px;">Aktivní cíle</h2></div>
        <div id="active-goals" class="list"></div>
      </div>
    </div>

    <div class="card" id="gmail-card" style="margin-top:14px;"></div>
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
      loadDueTodos(container);
    } catch (err) {
      toastError(err);
    }
  });

  await Promise.all([loadTodayEvents(container), loadDueTodos(container), loadGoals(container), loadGmail(container)]);
}

function startClock(container) {
  const dateEl = container.querySelector("#clock-date");
  const timeEl = container.querySelector("#clock-time");
  function tick() {
    if (!container.isConnected) return;
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    timeEl.textContent = now.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  }
  tick();
  const iv = setInterval(() => {
    if (!container.isConnected) return clearInterval(iv);
    tick();
  }, 1000 * 15);
}

async function loadTodayEvents(container) {
  const box = container.querySelector("#today-events");
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const events = await Events.listRange(start.toISOString(), end.toISOString());
    if (!events.length) {
      box.innerHTML = `<div class="faint">Dnes žádné události.</div>`;
      return;
    }
    box.innerHTML = events
      .map(
        (e) => `<div class="list-item">
          <span class="dot cat-${e.category}"></span>
          <div class="grow">
            <div class="title truncate">${escapeHtml(e.title)}</div>
            <div class="faint">${e.all_day ? "celý den" : fmtTime(e.start_at)}</div>
          </div>
        </div>`
      )
      .join("");
  } catch (e) {
    box.innerHTML = `<div class="faint">Nepodařilo se načíst.</div>`;
  }
}

async function loadDueTodos(container) {
  const box = container.querySelector("#due-todos");
  try {
    const todos = await Todos.list({ done: false, to: todayIso() });
    const overdue = await Todos.list({ done: false });
    const all = [...todos];
    const seen = new Set(all.map((t) => t.id));
    for (const t of overdue) if (t.due_date && t.due_date <= todayIso() && !seen.has(t.id)) all.push(t);
    if (!all.length) {
      box.innerHTML = `<div class="faint">Nic po termínu ani na dnes 🎉</div>`;
      return;
    }
    box.innerHTML = all
      .slice(0, 6)
      .map(
        (t) => `<label class="list-item">
          <input type="checkbox" data-id="${t.id}" class="todo-check" />
          <div class="grow">
            <div class="title truncate">${escapeHtml(t.title)}</div>
            <div class="faint">${t.due_date ? fmtDate(t.due_date) : ""}</div>
          </div>
        </label>`
      )
      .join("");
    box.querySelectorAll(".todo-check").forEach((cb) =>
      cb.addEventListener("change", async () => {
        await Todos.toggle(cb.dataset.id, true);
        loadDueTodos(container);
      })
    );
  } catch (e) {
    box.innerHTML = `<div class="faint">Nepodařilo se načíst.</div>`;
  }
}

async function loadGoals(container) {
  const box = container.querySelector("#active-goals");
  try {
    const goals = await Goals.list("active");
    if (!goals.length) {
      box.innerHTML = `<div class="faint">Zatím žádné aktivní cíle.</div>`;
      return;
    }
    box.innerHTML = goals
      .slice(0, 5)
      .map(
        (g) => `<div class="list-item" style="flex-direction:column;align-items:stretch;">
          <div class="grow" style="display:flex;justify-content:space-between;">
            <span class="title truncate">${escapeHtml(g.title)}</span>
            <span class="faint">${g.progress}%</span>
          </div>
          <div class="progress-bar" style="margin-top:6px;"><div style="width:${g.progress}%"></div></div>
        </div>`
      )
      .join("");
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
