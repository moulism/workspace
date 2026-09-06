import { Events } from "../db.js";
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

let view = new Date();
view.setDate(1);
let activeFilters = new Set(CATS.map((c) => c.id));

export async function render(container) {
  container.innerHTML = `
    <div class="section-header">
      <div class="toolbar">
        <button class="btn btn-icon" id="prev-month">←</button>
        <b id="month-label" style="min-width:150px;text-align:center;"></b>
        <button class="btn btn-icon" id="next-month">→</button>
        <button class="btn btn-sm" id="today-btn">Dnes</button>
      </div>
      <div class="toolbar">
        <div class="filter-bar" id="cat-filters">
          ${CATS.map((c) => `<button class="chip active" data-cat="${c.id}"><span class="dot cat-${c.id}"></span> ${c.label}</button>`).join("")}
        </div>
        <button class="btn btn-primary" id="new-event-btn">+ Událost</button>
      </div>
    </div>
    <div class="cal-grid" id="cal-weekdays"></div>
    <div class="cal-grid" id="cal-grid" style="margin-top:6px;"></div>
  `;

  const weekdays = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
  container.querySelector("#cal-weekdays").innerHTML = weekdays.map((w) => `<div class="cal-weekday">${w}</div>`).join("");

  container.querySelector("#prev-month").addEventListener("click", () => {
    view.setMonth(view.getMonth() - 1);
    renderGrid(container);
  });
  container.querySelector("#next-month").addEventListener("click", () => {
    view.setMonth(view.getMonth() + 1);
    renderGrid(container);
  });
  container.querySelector("#today-btn").addEventListener("click", () => {
    view = new Date();
    view.setDate(1);
    renderGrid(container);
  });
  container.querySelector("#new-event-btn").addEventListener("click", () => openEventModal(container, todayIso()));
  container.querySelectorAll("[data-cat]").forEach((chip) =>
    chip.addEventListener("click", () => {
      const cat = chip.dataset.cat;
      if (activeFilters.has(cat)) activeFilters.delete(cat);
      else activeFilters.add(cat);
      chip.classList.toggle("active");
      renderGrid(container);
    })
  );

  await renderGrid(container);
}

async function renderGrid(container) {
  const label = container.querySelector("#month-label");
  label.textContent = view.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });

  const monthStart = new Date(view.getFullYear(), view.getMonth(), 1);
  const monthEnd = new Date(view.getFullYear(), view.getMonth() + 1, 0);
  const gridStart = new Date(monthStart);
  gridStart.setDate(1 - ((monthStart.getDay() + 6) % 7));
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridStart.getDate() + 41);

  const grid = container.querySelector("#cal-grid");
  grid.innerHTML = `<div class="center" style="grid-column:1/-1;padding:30px;"><div class="spinner"></div></div>`;

  let events = [];
  try {
    events = await Events.listRange(gridStart.toISOString(), gridEnd.toISOString());
  } catch (e) {
    toastError(e);
  }
  events = events.filter((e) => activeFilters.has(e.category));

  const byDay = {};
  for (const e of events) {
    const d = new Date(e.start_at);
    const key = d.toDateString();
    (byDay[key] ||= []).push(e);
  }

  const todayKey = new Date().toDateString();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const key = d.toDateString();
    const inMonth = d.getMonth() === view.getMonth();
    const dayEvents = (byDay[key] || []).sort((a, b) => a.start_at.localeCompare(b.start_at));
    cells.push(`
      <div class="cal-daycell ${key === todayKey ? "today" : ""} ${!inMonth ? "other-month" : ""}" data-date="${toIso(d)}">
        <div class="cal-daynum">${d.getDate()}</div>
        ${dayEvents
          .slice(0, 3)
          .map(
            (e) =>
              `<div class="cal-evt" data-evt="${e.id}" style="background:${catColor(e.category)}">${escapeHtml(e.title)}</div>`
          )
          .join("")}
        ${dayEvents.length > 3 ? `<div class="faint">+${dayEvents.length - 3} další</div>` : ""}
      </div>`);
  }
  grid.innerHTML = cells.join("");

  grid.querySelectorAll(".cal-daycell").forEach((cell) =>
    cell.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-evt]")) return;
      openEventModal(container, cell.dataset.date);
    })
  );
  grid.querySelectorAll("[data-evt]").forEach((chip) =>
    chip.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const evt = events.find((e) => e.id === chip.dataset.evt);
      openEventModal(container, null, evt);
    })
  );
}

function toIso(d) {
  const copy = new Date(d);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function catColor(cat) {
  return { school: "#4f46e5", work: "#0f766e", gym: "#dc4c3f", personal: "#c98a1f", other: "#6b6a68" }[cat] || "#6b6a68";
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
      render(container);
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
          render(container);
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
        render(container);
      } catch (e) {
        toastError("Google sync selhal. Zkus se znovu přihlásit v Nastavení.");
      }
    });
  }
}
