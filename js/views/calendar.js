import { Events, Todos, Notes } from "../db.js";
import { escapeHtml, openModal, confirmDialog, todayIso } from "../ui.js";
import { toast, toastError } from "../toast.js";
import { hasGoogle, GCal } from "../google.js";

const CATS = [
  { id: "school", label: "Škola" },
  { id: "work", label: "Práce" },
  { id: "gym", label: "Gym" },
  { id: "personal", label: "Osobní" },
  { id: "other", label: "Ostatní" },
];

const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const MODES = [
  { id: "day", label: "Den" },
  { id: "week", label: "Týden" },
  { id: "month", label: "Měsíc" },
  { id: "year", label: "Rok" },
];

let anchor = new Date();
let mode = "month";
let activeFilters = new Set(CATS.map((c) => c.id));
let showTasks = true;

function toIso(d) {
  const copy = new Date(d);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function startOfWeek(d) {
  const copy = new Date(d);
  const day = (copy.getDay() + 6) % 7; // Monday = 0
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function catColor(cat) {
  return { school: "#4f46e5", work: "#0f766e", gym: "#dc4c3f", personal: "#c98a1f", other: "#6b6a68" }[cat] || "#6b6a68";
}

export async function render(container) {
  container.innerHTML = `
    <div class="cal-header">
      <div class="cal-header-top">
        <div class="cal-title" id="cal-title"></div>
        <div class="toolbar">
          <div class="seg" id="mode-seg">
            ${MODES.map((m) => `<button class="seg-btn ${mode === m.id ? "active" : ""}" data-mode="${m.id}">${m.label}</button>`).join("")}
          </div>
          <button class="btn btn-sm" id="today-btn">Dnes</button>
        </div>
      </div>
      <div class="cal-header-bottom">
        <div class="toolbar">
          <button class="btn btn-icon" id="prev-btn">←</button>
          <button class="btn btn-icon" id="next-btn">→</button>
        </div>
        <div class="toolbar">
          <div class="filter-bar" id="cat-filters">
            ${CATS.map((c) => `<button class="chip ${activeFilters.has(c.id) ? "active" : ""}" data-cat="${c.id}"><span class="dot cat-${c.id}"></span> ${c.label}</button>`).join("")}
            <button class="chip ${showTasks ? "active" : ""}" id="toggle-tasks">🎓 Úkoly a termíny</button>
          </div>
          <button class="btn btn-primary" id="new-event-btn">+ Událost</button>
        </div>
      </div>
    </div>
    <div id="cal-body"></div>
  `;

  container.querySelector("#prev-btn").addEventListener("click", () => {
    shiftAnchor(-1);
    renderAll(container);
  });
  container.querySelector("#next-btn").addEventListener("click", () => {
    shiftAnchor(1);
    renderAll(container);
  });
  container.querySelector("#today-btn").addEventListener("click", () => {
    anchor = new Date();
    renderAll(container);
  });
  container.querySelector("#new-event-btn").addEventListener("click", () => openEventModal(container, toIso(anchor)));
  container.querySelectorAll("[data-mode]").forEach((b) =>
    b.addEventListener("click", () => {
      mode = b.dataset.mode;
      renderAll(container);
    })
  );
  container.querySelectorAll("[data-cat]").forEach((chip) =>
    chip.addEventListener("click", () => {
      const cat = chip.dataset.cat;
      if (activeFilters.has(cat)) activeFilters.delete(cat);
      else activeFilters.add(cat);
      chip.classList.toggle("active");
      renderBody(container);
    })
  );
  container.querySelector("#toggle-tasks").addEventListener("click", (e) => {
    showTasks = !showTasks;
    e.target.classList.toggle("active", showTasks);
    renderBody(container);
  });

  renderAll(container);
}

function shiftAnchor(dir) {
  if (mode === "day") anchor = addDays(anchor, dir);
  else if (mode === "week") anchor = addDays(anchor, dir * 7);
  else if (mode === "year") anchor = new Date(anchor.getFullYear() + dir, anchor.getMonth(), 1);
  else anchor = new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
}

function renderAll(container) {
  updateHeader(container);
  renderBody(container);
}

function updateHeader(container) {
  container.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  const title = container.querySelector("#cal-title");
  if (mode === "year") {
    title.textContent = String(anchor.getFullYear());
  } else if (mode === "month") {
    title.textContent = cap(anchor.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" }));
  } else if (mode === "week") {
    const ws = startOfWeek(anchor);
    const we = addDays(ws, 6);
    const sameMonth = ws.getMonth() === we.getMonth();
    title.textContent = sameMonth
      ? `${ws.getDate()}.–${we.getDate()}. ${cap(we.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" }))}`
      : `${ws.getDate()}. ${ws.toLocaleDateString("cs-CZ", { month: "short" })} – ${we.getDate()}. ${cap(we.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" }))}`;
  } else {
    title.textContent = cap(anchor.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  }
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function loadRange(fromIso, toIso_) {
  const startFull = new Date(fromIso + "T00:00:00").toISOString();
  const endFull = new Date(toIso_ + "T23:59:59").toISOString();
  let events = [];
  let todos = [];
  let notes = [];
  try {
    events = await Events.listRange(startFull, endFull);
  } catch (e) {
    toastError(e);
  }
  events = events.filter((e) => activeFilters.has(e.category));
  if (showTasks) {
    try {
      [todos, notes] = await Promise.all([
        Todos.listRange(fromIso, toIso_),
        Notes.listUpcoming({ from: fromIso, to: toIso_, limit: 200 }),
      ]);
    } catch (e) {
      /* non-fatal */
    }
    todos = todos.filter((t) => !t.done && activeFilters.has(t.area === "personal" ? "personal" : t.area));
  } else {
    todos = [];
    notes = [];
  }
  return { events, todos, notes };
}

function groupByDay(events, todos, notes) {
  const byDay = {};
  for (const e of events) {
    const key = toIso(new Date(e.start_at));
    (byDay[key] ||= { events: [], todos: [], notes: [] }).events.push(e);
  }
  for (const t of todos) {
    (byDay[t.due_date] ||= { events: [], todos: [], notes: [] }).todos.push(t);
  }
  for (const n of notes) {
    (byDay[n.due_date] ||= { events: [], todos: [], notes: [] }).notes.push(n);
  }
  return byDay;
}

async function renderBody(container) {
  const body = container.querySelector("#cal-body");
  body.innerHTML = `<div class="center" style="padding:40px;"><div class="spinner"></div></div>`;
  if (mode === "month") await renderMonth(container, body);
  else if (mode === "week") await renderWeek(container, body);
  else if (mode === "day") await renderDay(container, body);
  else await renderYear(container, body);
}

async function renderMonth(container, body) {
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = addDays(gridStart, 41);

  const { events, todos, notes } = await loadRange(toIso(gridStart), toIso(gridEnd));
  const byDay = groupByDay(events, todos, notes);
  const todayKey = todayIso();

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const key = toIso(d);
    const inMonth = d.getMonth() === anchor.getMonth();
    const day = byDay[key] || { events: [], todos: [], notes: [] };
    const items = [
      ...day.events.sort((a, b) => a.start_at.localeCompare(b.start_at)).map((e) => renderChip(e, "event")),
      ...day.todos.map((t) => renderChip(t, "todo")),
      ...day.notes.map((n) => renderChip(n, "note")),
    ];
    cells.push(`
      <div class="cal-daycell ${key === todayKey ? "today" : ""} ${!inMonth ? "other-month" : ""}" data-date="${key}">
        <div class="cal-daynum">${key === todayKey ? `<span class="cal-daynum-badge">${d.getDate()}</span>` : d.getDate()}</div>
        <div class="cal-daycell-items">
          ${items.slice(0, 3).join("")}
          ${items.length > 3 ? `<div class="faint">+${items.length - 3} další</div>` : ""}
        </div>
      </div>`);
  }

  body.innerHTML = `
    <div class="cal-grid cal-weekdays-row">${WEEKDAYS.map((w) => `<div class="cal-weekday">${w}</div>`).join("")}</div>
    <div class="cal-grid cal-month-grid">${cells.join("")}</div>
  `;
  wireDayCells(container, body);
  wireItemChips(container, body, { events, todos, notes });
}

async function renderWeek(container, body) {
  const ws = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const { events, todos, notes } = await loadRange(toIso(ws), toIso(days[6]));
  const byDay = groupByDay(events, todos, notes);
  const todayKey = todayIso();

  body.innerHTML = `
    <div class="cal-week-grid">
      ${days
        .map((d) => {
          const key = toIso(d);
          const day = byDay[key] || { events: [], todos: [], notes: [] };
          const items = [
            ...day.events.sort((a, b) => a.start_at.localeCompare(b.start_at)).map((e) => renderChip(e, "event")),
            ...day.todos.map((t) => renderChip(t, "todo")),
            ...day.notes.map((n) => renderChip(n, "note")),
          ];
          return `<div class="cal-week-col ${key === todayKey ? "today" : ""}" data-date="${key}">
            <div class="cal-week-col-head">
              <div class="faint">${WEEKDAYS[(d.getDay() + 6) % 7]}</div>
              <div class="cal-daynum">${key === todayKey ? `<span class="cal-daynum-badge">${d.getDate()}</span>` : d.getDate()}</div>
            </div>
            <div class="cal-week-col-items">
              ${items.join("") || `<div class="faint" style="padding:6px 0;">—</div>`}
            </div>
          </div>`;
        })
        .join("")}
    </div>
  `;
  wireDayCells(container, body, ".cal-week-col");
  wireItemChips(container, body, { events, todos, notes });
}

async function renderDay(container, body) {
  const key = toIso(anchor);
  const { events, todos, notes } = await loadRange(key, key);
  const dayEvents = events.sort((a, b) => a.start_at.localeCompare(b.start_at));

  body.innerHTML = `
    <div class="card cal-day-agenda" data-date="${key}">
      ${
        !dayEvents.length && !todos.length && !notes.length
          ? `<div class="empty-state"><div class="big">🗓️</div>Žádné události ani termíny.</div>`
          : `
          ${dayEvents.map((e) => `<div class="cal-agenda-item" data-evt="${e.id}"><span class="dot cat-${e.category}"></span><b>${e.all_day ? "Celý den" : fmtTimeShort(e.start_at)}</b> — ${escapeHtml(e.title)}${e.location ? ` <span class="faint">· ${escapeHtml(e.location)}</span>` : ""}</div>`).join("")}
          ${todos.map((t) => renderChip(t, "todo", true)).join("")}
          ${notes.map((n) => renderChip(n, "note", true)).join("")}
        `
      }
    </div>
  `;
  body.querySelector(".cal-day-agenda").addEventListener("click", (ev) => {
    if (ev.target.closest("[data-evt], [data-todo], [data-note]")) return;
    openEventModal(container, key);
  });
  wireItemChips(container, body, { events, todos, notes });
}

function fmtTimeShort(iso) {
  return new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

async function renderYear(container, body) {
  const year = anchor.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const { events, todos, notes } = await loadRange(toIso(yearStart), toIso(yearEnd));
  const byDay = groupByDay(events, todos, notes);
  const todayKey = todayIso();

  const months = [];
  for (let m = 0; m < 12; m++) {
    const monthStart = new Date(year, m, 1);
    const gridStart = startOfWeek(monthStart);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i);
      const key = toIso(d);
      if (d.getMonth() !== m && (i < 7 || i > 34)) {
        cells.push(`<div class="cal-year-cell empty"></div>`);
        continue;
      }
      const inMonth = d.getMonth() === m;
      const hasItems = byDay[key] && (byDay[key].events.length || byDay[key].todos.length || byDay[key].notes.length);
      cells.push(
        `<div class="cal-year-cell ${!inMonth ? "other-month" : ""} ${key === todayKey ? "today" : ""}" data-date="${key}">
          ${d.getDate()}${hasItems ? '<span class="cal-year-dot"></span>' : ""}
        </div>`
      );
    }
    months.push(`
      <div class="card cal-year-month" data-month="${m}">
        <b>${cap(monthStart.toLocaleDateString("cs-CZ", { month: "long" }))}</b>
        <div class="cal-year-grid">${cells.join("")}</div>
      </div>
    `);
  }

  body.innerHTML = `<div class="cal-year-wrap">${months.join("")}</div>`;
  body.querySelectorAll("[data-date]").forEach((c) =>
    c.addEventListener("click", () => {
      anchor = new Date(c.dataset.date + "T00:00:00");
      mode = "day";
      renderAll(container);
    })
  );
}

function renderChip(item, kind, block) {
  if (kind === "event") {
    return `<div class="cal-evt ${block ? "cal-evt-block" : ""}" data-evt="${item.id}" style="background:${catColor(item.category)}">${item.all_day ? "" : fmtTimeShort(item.start_at) + " "}${escapeHtml(item.title)}</div>`;
  }
  if (kind === "todo") {
    return `<div class="cal-evt cal-evt-task ${block ? "cal-evt-block" : ""}" data-todo="${item.id}" style="border-color:${catColor(item.area)};color:${catColor(item.area)}">✓ ${escapeHtml(item.title)}</div>`;
  }
  return `<div class="cal-evt cal-evt-task ${block ? "cal-evt-block" : ""}" data-note="${item.id}" style="border-color:${catColor("school")};color:${catColor("school")}">🎓 ${escapeHtml(item.title)}</div>`;
}

function wireDayCells(container, body, selector = ".cal-daycell") {
  body.querySelectorAll(selector).forEach((cell) =>
    cell.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-evt], [data-todo], [data-note]")) return;
      openEventModal(container, cell.dataset.date);
    })
  );
}

function wireItemChips(container, body, { events, todos, notes }) {
  body.querySelectorAll("[data-evt]").forEach((chip) =>
    chip.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const evt = events.find((e) => e.id === chip.dataset.evt);
      if (evt) openEventModal(container, null, evt);
    })
  );
  body.querySelectorAll("[data-todo]").forEach((chip) =>
    chip.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const todo = todos.find((t) => t.id === chip.dataset.todo);
      if (todo) openTodoPreview(container, todo);
    })
  );
  body.querySelectorAll("[data-note]").forEach((chip) =>
    chip.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const note = notes.find((n) => n.id === chip.dataset.note);
      if (note) openNotePreview(note);
    })
  );
}

function openTodoPreview(container, todo) {
  const { el: modalEl, close } = openModal(`
    <div class="modal-header"><h3>✓ Úkol</h3><button class="btn btn-icon btn-ghost" data-close>✕</button></div>
    <div class="field"><b>${escapeHtml(todo.title)}</b></div>
    ${todo.description ? `<p class="muted">${escapeHtml(todo.description)}</p>` : ""}
    <div class="faint">Termín: ${todo.due_date}</div>
    <div class="modal-actions">
      <button class="btn" id="mark-done">Označit jako hotové</button>
      <button class="btn" data-close>Zavřít</button>
      <button class="btn btn-primary" id="go-todos">Otevřít v Úkolech</button>
    </div>
  `);
  modalEl.querySelector("#mark-done").addEventListener("click", async () => {
    try {
      await Todos.toggle(todo.id, true);
      toast("Úkol splněn ✓", "success");
      close();
      renderBody(container);
    } catch (e) {
      toastError(e);
    }
  });
  modalEl.querySelector("#go-todos").addEventListener("click", () => {
    close();
    location.hash = "#/todos";
  });
}

function openNotePreview(note) {
  const { el: modalEl, close } = openModal(`
    <div class="modal-header"><h3>🎓 Termín</h3><button class="btn btn-icon btn-ghost" data-close>✕</button></div>
    <div class="field"><b>${escapeHtml(note.title)}</b></div>
    ${note.folders?.name ? `<div class="faint">${note.folders.icon ? note.folders.icon + " " : ""}${escapeHtml(note.folders.name)}</div>` : ""}
    <div class="faint">Termín: ${note.due_date}</div>
    <div class="modal-actions">
      <button class="btn" data-close>Zavřít</button>
      <button class="btn btn-primary" id="go-notes">Otevřít v Poznámkách</button>
    </div>
  `);
  modalEl.querySelector("#go-notes").addEventListener("click", () => {
    close();
    location.hash = "#/notes";
  });
}

function toLocalInput(dateIso, time) {
  return `${dateIso}T${time || "09:00"}`;
}

async function openEventModal(container, dateIso, evt) {
  const isNew = !evt;
  const startDate = evt ? evt.start_at.slice(0, 10) : dateIso;
  const startTime = evt && !evt.all_day ? new Date(evt.start_at).toTimeString().slice(0, 5) : "09:00";
  const endTime = evt && evt.end_at && !evt.all_day ? new Date(evt.end_at).toTimeString().slice(0, 5) : "10:00";

  const { el: modalEl, close } = openModal(`
    <div class="modal-header"><h3>${isNew ? "Nová událost" : "Upravit událost"}</h3><button class="btn btn-icon btn-ghost" data-close>✕</button></div>
    <div class="field"><label>Název</label><input type="text" id="ev-title" value="${escapeHtml(evt?.title || "")}" /></div>
    <div class="row">
      <div class="field"><label>Kategorie</label>
        <select id="ev-cat">${CATS.map((c) => `<option value="${c.id}" ${evt?.category === c.id ? "selected" : ""}>${c.label}</option>`).join("")}</select>
      </div>
      <div class="field"><label><input type="checkbox" id="ev-allday" ${evt?.all_day ? "checked" : ""} style="width:auto;margin-right:6px;" />Celý den</label></div>
    </div>
    <div class="row">
      <div class="field"><label>Datum od</label><input type="date" id="ev-start-date" value="${startDate}" /></div>
      <div class="field time-field"><label>Čas od</label><input type="time" id="ev-start-time" value="${startTime}" /></div>
    </div>
    <div class="row">
      <div class="field"><label>Datum do</label><input type="date" id="ev-end-date" value="${evt?.end_at ? evt.end_at.slice(0, 10) : startDate}" /></div>
      <div class="field time-field"><label>Čas do</label><input type="time" id="ev-end-time" value="${endTime}" /></div>
    </div>
    <div class="field"><label>Místo</label><input type="text" id="ev-location" value="${escapeHtml(evt?.location || "")}" /></div>
    <div class="field"><label>Poznámka</label><textarea id="ev-desc" rows="2">${escapeHtml(evt?.description || "")}</textarea></div>
    ${evt?.google_event_id ? `<div class="faint">🔗 Synchronizováno s Google Calendar</div>` : ""}
    <div class="modal-actions">
      ${!isNew ? `<button class="btn btn-danger" id="ev-delete" style="margin-right:auto;">Smazat</button>` : ""}
      ${hasGoogle() ? `<button class="btn" id="ev-sync-google">📅 ${evt?.google_event_id ? "Aktualizovat v Google" : "Přidat do Google Calendar"}</button>` : ""}
      <button class="btn" data-close>Zrušit</button>
      <button class="btn btn-primary" id="ev-save">Uložit</button>
    </div>
  `);

  function toggleAllDay() {
    const allDay = modalEl.querySelector("#ev-allday").checked;
    modalEl.querySelectorAll(".time-field").forEach((f) => (f.style.display = allDay ? "none" : ""));
  }
  modalEl.querySelector("#ev-allday").addEventListener("change", toggleAllDay);
  toggleAllDay();

  function collectFields() {
    const allDay = modalEl.querySelector("#ev-allday").checked;
    const sd = modalEl.querySelector("#ev-start-date").value;
    const ed = modalEl.querySelector("#ev-end-date").value || sd;
    const st = modalEl.querySelector("#ev-start-time").value;
    const et = modalEl.querySelector("#ev-end-time").value;
    return {
      title: modalEl.querySelector("#ev-title").value.trim() || "Bez názvu",
      category: modalEl.querySelector("#ev-cat").value,
      all_day: allDay,
      start_at: allDay ? new Date(sd + "T00:00:00").toISOString() : new Date(toLocalInput(sd, st)).toISOString(),
      end_at: allDay ? new Date(ed + "T00:00:00").toISOString() : new Date(toLocalInput(ed, et)).toISOString(),
      location: modalEl.querySelector("#ev-location").value.trim() || null,
      description: modalEl.querySelector("#ev-desc").value.trim() || null,
    };
  }

  modalEl.querySelector("#ev-save").addEventListener("click", async () => {
    try {
      const fields = collectFields();
      if (isNew) await Events.create(fields);
      else await Events.update(evt.id, fields);
      toast("Uloženo", "success");
      close();
      renderBody(container);
    } catch (e) {
      toastError(e);
    }
  });

  if (!isNew) {
    modalEl.querySelector("#ev-delete").addEventListener("click", async () => {
      if (await confirmDialog("Smazat tuto událost?")) {
        try {
          if (evt.google_event_id && hasGoogle()) await GCal.deleteEvent(evt.google_event_id).catch(() => {});
          await Events.remove(evt.id);
          close();
          renderBody(container);
        } catch (e) {
          toastError(e);
        }
      }
    });
  }

  const syncBtn = modalEl.querySelector("#ev-sync-google");
  if (syncBtn) {
    syncBtn.addEventListener("click", async () => {
      try {
        const fields = collectFields();
        const g = await GCal.createEvent({
          title: fields.title,
          description: fields.description,
          startIso: fields.start_at,
          endIso: fields.end_at,
          allDay: fields.all_day,
          location: fields.location,
        });
        if (isNew) await Events.create({ ...fields, google_event_id: g.id });
        else await Events.update(evt.id, { ...fields, google_event_id: g.id });
        toast("Synchronizováno s Google Calendar", "success");
        close();
        renderBody(container);
      } catch (e) {
        toastError("Google sync selhal. Zkus se znovu přihlásit v Nastavení.");
      }
    });
  }
}
