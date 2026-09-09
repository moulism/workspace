import { JournalCycles, JournalHabits, JournalEntries, JournalHabitLogs } from "../db.js";
import { escapeHtml, openModal, confirmDialog, todayIso, fmtDate } from "../ui.js";
import { toast, toastError } from "../toast.js";

// Původní motivační citáty (nejde o citace z žádné konkrétní knihy) —
// jeden se vybere podle dne v roce, takže se každý den drží stejný.
const QUOTES = [
  "Disciplína je most mezi cíli a jejich dosažením.",
  "Malý krok dnes je lepší než dokonalý plán zítra.",
  "Nejsi to, co si myslíš. Jsi to, co děláš každý den.",
  "Pohodlí je tichý zabiják ambicí.",
  "Návyky, které si vybuduješ dnes, tě ponesou celý rok.",
  "Nečekej na motivaci — vytvoř si systém a motivace přijde sama.",
  "Úspěch je součet malých rozhodnutí, opakovaných den za dnem.",
  "Zaměř se na proces. Výsledek je jen jeho odraz.",
  "Kázeň je forma sebeúcty.",
  "Každý den je hlasování o tom, kým se stáváš.",
  "Vytrvalost poráží talent, když talent nevytrvá.",
  "Nejtěžší krok je vždy ten první — dnešní.",
  "Buduj si na svých vítězstvích, ne na svých výmluvách.",
  "Co měříš, to zlepšuješ. Co sleduješ, to roste.",
  "Klid přichází z přípravy, ne z náhody.",
  "Silná vůle se netrénuje ve výjimečných chvílích, ale v obyčejných dnech.",
  "Menší, konzistentní kroky porazí velké, ale nepravidelné výbuchy snahy.",
  "Vděčnost mění to, co máš, na dostatek.",
  "Tvoje budoucnost sleduje tvoje dnešní návyky, ne tvoje dnešní nálady.",
  "Cíl bez plánu je jen přání. Plán bez akce je jen teorie.",
  "Nejsi obětí svého dne — jsi jeho architekt.",
  "Každé ráno máš na výběr: znovu usnout, nebo se probudit naplno.",
  "Růst bolí. Stagnace bolí víc — jen pomaleji.",
  "Dělej to, co je správné, ne to, co je snadné.",
];

function quoteOfDay(dateIso) {
  const d = new Date(dateIso + "T00:00:00");
  const start = new Date(d.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((d - start) / 86400000);
  return QUOTES[dayOfYear % QUOTES.length];
}

function dayIndex(cycle, dateIso) {
  const start = new Date(cycle.start_date + "T00:00:00");
  const cur = new Date(dateIso + "T00:00:00");
  return Math.round((cur - start) / 86400000) + 1;
}

function cycleLength(cycle) {
  const start = new Date(cycle.start_date + "T00:00:00");
  const end = new Date(cycle.end_date + "T00:00:00");
  return Math.round((end - start) / 86400000) + 1;
}

function addDaysIso(dateIso, n) {
  const d = new Date(dateIso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return todayIsoFrom(d);
}

function todayIsoFrom(d) {
  const copy = new Date(d);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

let state = {
  cycle: null,
  habits: [],
  selectedDate: todayIso(),
  entry: null,
  habitLogs: {}, // habitId -> true
  tab: "today", // today | overview | history
};

export async function render(container) {
  container.innerHTML = `<div class="center" style="padding:60px;"><div class="spinner"></div></div>`;
  try {
    state.cycle = await JournalCycles.getActive();
  } catch (e) {
    toastError(e);
  }

  if (!state.cycle) {
    renderNoCycle(container);
    return;
  }

  try {
    state.habits = await JournalHabits.listByCycle(state.cycle.id);
  } catch (e) {
    toastError(e);
    state.habits = [];
  }

  renderShell(container);
}

function renderNoCycle(container) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="big">📗</div>
      <h2 style="margin:6px 0;">Successful Journal</h2>
      <p class="muted" style="max-width:420px;margin:0 auto 18px;">
        90denní deník odpovědnosti: ráno si nastav priority a vděčnost, večer zhodnoť den a sleduj své návyky.
        Začni nový 90denní cyklus a rozjeď to.
      </p>
      <button class="btn btn-primary" id="start-cycle-btn">+ Nový 90denní cyklus</button>
      <div style="margin-top:18px;" id="past-cycles"></div>
    </div>
  `;
  container.querySelector("#start-cycle-btn").addEventListener("click", () => openCycleModal(container));
  renderPastCyclesList(container.querySelector("#past-cycles"), { onlyPast: true });
}

async function renderPastCyclesList(mount, { onlyPast = false } = {}) {
  try {
    const cycles = await JournalCycles.list();
    const list = onlyPast ? cycles.filter((c) => c.status !== "active") : cycles;
    if (!list.length) {
      mount.innerHTML = "";
      return;
    }
    mount.innerHTML = `
      <div class="faint" style="margin-bottom:8px;">PŘEDCHOZÍ CYKLY</div>
      <div class="list" style="max-width:420px;margin:0 auto;">
        ${list
          .map(
            (c) => `<div class="list-item">
              <div class="grow">
                <div class="title">${escapeHtml(c.title)}</div>
                <div class="faint">${fmtDate(c.start_date)} – ${fmtDate(c.end_date)} · ${c.status === "completed" ? "dokončeno" : c.status === "archived" ? "archivováno" : "aktivní"}</div>
              </div>
              ${c.status !== "active" ? `<button class="btn btn-sm" data-reactivate="${c.id}">Obnovit</button>` : ""}
            </div>`
          )
          .join("")}
      </div>
    `;
    mount.querySelectorAll("[data-reactivate]").forEach((b) =>
      b.addEventListener("click", async () => {
        try {
          await JournalCycles.update(b.dataset.reactivate, { status: "active" });
          render(mount.closest(".view") || mount.parentElement.parentElement);
          location.hash = "#/journal";
          window.dispatchEvent(new Event("hashchange"));
        } catch (e) {
          toastError(e);
        }
      })
    );
  } catch (e) {
    toastError(e);
  }
}

function renderShell(container) {
  const cycle = state.cycle;
  const len = cycleLength(cycle);
  const idx = Math.min(Math.max(dayIndex(cycle, state.selectedDate), 1), len);
  const progressPct = Math.round((idx / len) * 100);

  container.innerHTML = `
    <div class="sj-header card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
        <div>
          <div class="faint">CYKLUS</div>
          <h2 style="margin:2px 0 2px;">${escapeHtml(cycle.title)}</h2>
          ${cycle.theme ? `<div class="muted">${escapeHtml(cycle.theme)}</div>` : ""}
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm" id="edit-cycle-btn">Upravit cyklus</button>
        </div>
      </div>
      <div style="margin-top:12px;">
        <div style="display:flex;justify-content:space-between;font-size:12.5px;" class="muted">
          <span>Den ${idx} / ${len}</span>
          <span>${fmtDate(cycle.start_date)} – ${fmtDate(cycle.end_date)}</span>
        </div>
        <div class="progress-bar" style="margin-top:5px;"><div style="width:${progressPct}%;"></div></div>
      </div>
    </div>

    <div class="toolbar" style="margin:16px 0;">
      <button class="chip ${state.tab === "today" ? "active" : ""}" data-tab="today">Dnešní stránka</button>
      <button class="chip ${state.tab === "overview" ? "active" : ""}" data-tab="overview">Přehled 90 dní</button>
      <button class="chip ${state.tab === "history" ? "active" : ""}" data-tab="history">Historie cyklů</button>
    </div>

    <div id="sj-body"></div>
  `;

  container.querySelector("#edit-cycle-btn").addEventListener("click", () => openCycleModal(container, cycle));
  container.querySelectorAll("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      state.tab = b.dataset.tab;
      renderShell(container);
    })
  );

  const body = container.querySelector("#sj-body");
  if (state.tab === "today") renderTodayTab(container, body);
  else if (state.tab === "overview") renderOverviewTab(container, body);
  else renderHistoryTab(container, body);
}

async function renderTodayTab(container, body) {
  body.innerHTML = `<div class="center" style="padding:40px;"><div class="spinner"></div></div>`;
  const cycle = state.cycle;
  const minDate = cycle.start_date;
  const maxDate = cycle.end_date > todayIso() ? todayIso() : cycle.end_date;

  try {
    const [entry, logs] = await Promise.all([
      JournalEntries.getByDate(state.selectedDate),
      JournalHabitLogs.listForDate(state.selectedDate),
    ]);
    state.entry = entry;
    state.habitLogs = Object.fromEntries(logs.map((l) => [l.habit_id, true]));
  } catch (e) {
    toastError(e);
    state.entry = null;
    state.habitLogs = {};
  }

  const e = state.entry || {};
  const priorities = e.priorities?.length ? e.priorities : ["", "", ""];
  const gratitude = e.gratitude?.length ? e.gratitude : ["", "", ""];

  body.innerHTML = `
    <div class="card" style="margin-bottom:16px;background:var(--accent-soft);border-color:transparent;">
      <div style="font-style:italic;">"${escapeHtml(quoteOfDay(state.selectedDate))}"</div>
    </div>

    <div class="toolbar" style="margin-bottom:14px;">
      <button class="btn btn-icon" id="sj-prev-day" ${state.selectedDate <= minDate ? "disabled" : ""}>←</button>
      <input type="date" id="sj-date" value="${state.selectedDate}" min="${minDate}" max="${cycle.end_date}" />
      <button class="btn btn-icon" id="sj-next-day" ${state.selectedDate >= maxDate ? "disabled" : ""}>→</button>
      <button class="btn btn-sm" id="sj-today-btn">Dnes</button>
      <span class="faint" id="sj-save-status" style="margin-left:auto;"></span>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h3 style="margin-top:0;">☀️ Ráno</h3>
        <label>3 priority dneška</label>
        ${priorities
          .slice(0, 3)
          .map((p, i) => `<input type="text" class="sj-priority" data-i="${i}" placeholder="Priorita ${i + 1}" value="${escapeHtml(p)}" style="margin-bottom:6px;" />`)
          .join("")}
        <label style="margin-top:10px;">Za co jsem dnes vděčný</label>
        ${gratitude
          .slice(0, 3)
          .map((g, i) => `<input type="text" class="sj-gratitude" data-i="${i}" placeholder="Vděčnost ${i + 1}" value="${escapeHtml(g)}" style="margin-bottom:6px;" />`)
          .join("")}
        <label style="margin-top:10px;">Dnešní záměr / afirmace</label>
        <textarea id="sj-intention" rows="2" placeholder="Dnes se rozhoduji…">${escapeHtml(e.intention || "")}</textarea>

        ${
          state.habits.length
            ? `<label style="margin-top:14px;">Návyky</label>
               <div class="list" id="sj-habits-list">
                 ${state.habits
                   .map(
                     (h) => `<label class="list-item ${state.habitLogs[h.id] ? "done" : ""}">
                       <input type="checkbox" class="sj-habit-check" data-habit="${h.id}" ${state.habitLogs[h.id] ? "checked" : ""} />
                       <div class="grow">${h.icon ? h.icon + " " : ""}${escapeHtml(h.name)}</div>
                     </label>`
                   )
                   .join("")}
               </div>`
            : `<div class="faint" style="margin-top:14px;">Cyklus zatím nemá žádné sledované návyky (přidáš je v úpravě cyklu).</div>`
        }
      </div>

      <div class="card">
        <h3 style="margin-top:0;">🌙 Večer</h3>
        <label>Co se dnes povedlo</label>
        <textarea id="sj-wins" rows="2" placeholder="Dnešní výhry…">${escapeHtml(e.wins || "")}</textarea>
        <label style="margin-top:10px;">Co jsem se naučil / co příště jinak</label>
        <textarea id="sj-lessons" rows="2">${escapeHtml(e.lessons || "")}</textarea>
        <label style="margin-top:10px;">Hlavní zaměření na zítra</label>
        <input type="text" id="sj-tomorrow" value="${escapeHtml(e.tomorrow_focus || "")}" />
        <label style="margin-top:10px;">Jak hodnotíš dnešní den</label>
        <div class="toolbar" id="sj-rating">
          ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="btn btn-icon sj-star" data-n="${n}">${(e.rating || 0) >= n ? "★" : "☆"}</button>`).join("")}
        </div>
      </div>
    </div>
  `;

  let ratingValue = e.rating || 0;
  const statusEl = body.querySelector("#sj-save-status");
  let saveTimer = null;

  function scheduleSave() {
    statusEl.textContent = "Ukládám…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 500);
  }

  async function save() {
    const fields = {
      cycle_id: cycle.id,
      priorities: [...body.querySelectorAll(".sj-priority")].map((i) => i.value.trim()).filter(Boolean),
      gratitude: [...body.querySelectorAll(".sj-gratitude")].map((i) => i.value.trim()).filter(Boolean),
      intention: body.querySelector("#sj-intention").value.trim() || null,
      wins: body.querySelector("#sj-wins").value.trim() || null,
      lessons: body.querySelector("#sj-lessons").value.trim() || null,
      tomorrow_focus: body.querySelector("#sj-tomorrow").value.trim() || null,
      rating: ratingValue || null,
    };
    try {
      state.entry = await JournalEntries.upsert(state.selectedDate, fields);
      statusEl.textContent = "Uloženo ✓";
    } catch (err) {
      statusEl.textContent = "";
      toastError(err);
    }
  }

  body.querySelectorAll("input[type=text], textarea").forEach((inp) => inp.addEventListener("input", scheduleSave));

  function drawStars() {
    body.querySelectorAll(".sj-star").forEach((btn) => {
      const n = Number(btn.dataset.n);
      btn.textContent = ratingValue >= n ? "★" : "☆";
    });
  }
  body.querySelectorAll(".sj-star").forEach((btn) =>
    btn.addEventListener("click", () => {
      const n = Number(btn.dataset.n);
      ratingValue = ratingValue === n ? 0 : n;
      drawStars();
      scheduleSave();
    })
  );

  body.querySelectorAll(".sj-habit-check").forEach((cb) =>
    cb.addEventListener("change", async () => {
      try {
        await JournalHabitLogs.toggle(cb.dataset.habit, state.selectedDate, cb.checked);
        cb.closest(".list-item").classList.toggle("done", cb.checked);
      } catch (err) {
        toastError(err);
        cb.checked = !cb.checked;
      }
    })
  );

  body.querySelector("#sj-date").addEventListener("change", (ev) => {
    state.selectedDate = ev.target.value;
    renderTodayTab(container, body);
  });
  body.querySelector("#sj-prev-day").addEventListener("click", () => {
    state.selectedDate = addDaysIso(state.selectedDate, -1);
    renderTodayTab(container, body);
  });
  body.querySelector("#sj-next-day").addEventListener("click", () => {
    state.selectedDate = addDaysIso(state.selectedDate, 1);
    renderTodayTab(container, body);
  });
  body.querySelector("#sj-today-btn").addEventListener("click", () => {
    state.selectedDate = todayIso();
    renderTodayTab(container, body);
  });
}

async function renderOverviewTab(container, body) {
  body.innerHTML = `<div class="center" style="padding:40px;"><div class="spinner"></div></div>`;
  const cycle = state.cycle;
  const len = cycleLength(cycle);

  let entries = [];
  let logs = [];
  try {
    [entries, logs] = await Promise.all([
      JournalEntries.listByCycle(cycle.id),
      JournalHabitLogs.listForRange(cycle.start_date, cycle.end_date),
    ]);
  } catch (e) {
    toastError(e);
  }
  const byDate = Object.fromEntries(entries.map((e) => [e.entry_date, e]));
  const doneDays = entries.length;
  const avgRating = entries.filter((e) => e.rating).length
    ? (entries.reduce((s, e) => s + (e.rating || 0), 0) / entries.filter((e) => e.rating).length).toFixed(1)
    : "–";
  const habitDoneCount = {};
  logs.forEach((l) => (habitDoneCount[l.habit_id] = (habitDoneCount[l.habit_id] || 0) + 1));

  const cells = [];
  for (let i = 1; i <= len; i++) {
    const dateIso = addDaysIso(cycle.start_date, i - 1);
    const entry = byDate[dateIso];
    const isFuture = dateIso > todayIso();
    let cls = "sj-day-empty";
    if (entry) cls = entry.rating ? `sj-day-r${entry.rating}` : "sj-day-filled";
    else if (isFuture) cls = "sj-day-future";
    cells.push(`<div class="sj-day ${cls}" data-date="${dateIso}" title="Den ${i} · ${fmtDate(dateIso)}">${i}</div>`);
  }

  body.innerHTML = `
    <div class="grid grid-3" style="margin-bottom:18px;">
      <div class="card center" style="flex-direction:column;"><b style="font-size:22px;">${doneDays}/${len}</b><span class="faint">vyplněných dní</span></div>
      <div class="card center" style="flex-direction:column;"><b style="font-size:22px;">${avgRating}</b><span class="faint">průměrné hodnocení</span></div>
      <div class="card center" style="flex-direction:column;"><b style="font-size:22px;">${Math.round((doneDays / len) * 100)}%</b><span class="faint">postup cyklem</span></div>
    </div>
    <div class="card" style="margin-bottom:18px;">
      <h3 style="margin-top:0;">90 dní</h3>
      <div class="sj-day-grid">${cells.join("")}</div>
    </div>
    ${
      state.habits.length
        ? `<div class="card">
            <h3 style="margin-top:0;">Návyky za tento cyklus</h3>
            <div class="list">
              ${state.habits
                .map(
                  (h) => `<div class="list-item">
                    <div class="grow">${h.icon ? h.icon + " " : ""}${escapeHtml(h.name)}</div>
                    <span class="pill">${habitDoneCount[h.id] || 0}/${len}</span>
                  </div>`
                )
                .join("")}
            </div>
          </div>`
        : ""
    }
  `;

  body.querySelectorAll(".sj-day").forEach((cell) =>
    cell.addEventListener("click", () => {
      if (cell.dataset.date > todayIso()) return;
      state.selectedDate = cell.dataset.date;
      state.tab = "today";
      renderShell(container);
    })
  );
}

async function renderHistoryTab(container, body) {
  body.innerHTML = `<div class="center" style="padding:40px;"><div class="spinner"></div></div>`;
  try {
    const cycles = await JournalCycles.list();
    if (!cycles.length) {
      body.innerHTML = `<div class="empty-state"><div class="big">📗</div>Zatím žádné cykly.</div>`;
      return;
    }
    body.innerHTML = `<div class="list">
      ${cycles
        .map(
          (c) => `<div class="list-item">
            <div class="grow">
              <div class="title">${escapeHtml(c.title)} ${c.id === state.cycle?.id ? '<span class="pill">aktivní</span>' : ""}</div>
              <div class="faint">${fmtDate(c.start_date)} – ${fmtDate(c.end_date)} · ${c.status === "completed" ? "dokončeno" : c.status === "archived" ? "archivováno" : "aktivní"}</div>
            </div>
            ${
              c.status === "active"
                ? `<button class="btn btn-sm" data-complete="${c.id}">Dokončit</button>`
                : `<button class="btn btn-sm" data-reactivate="${c.id}">Obnovit jako aktivní</button>`
            }
            <button class="btn btn-icon btn-ghost btn-sm" data-del-cycle="${c.id}">✕</button>
          </div>`
        )
        .join("")}
    </div>
    <button class="btn btn-primary" id="new-cycle-from-history" style="margin-top:14px;">+ Nový 90denní cyklus</button>
    `;
    body.querySelector("#new-cycle-from-history").addEventListener("click", () => openCycleModal(container));
    body.querySelectorAll("[data-complete]").forEach((b) =>
      b.addEventListener("click", async () => {
        await JournalCycles.update(b.dataset.complete, { status: "completed" });
        render(container);
      })
    );
    body.querySelectorAll("[data-reactivate]").forEach((b) =>
      b.addEventListener("click", async () => {
        const current = await JournalCycles.getActive();
        if (current) await JournalCycles.update(current.id, { status: "archived" });
        await JournalCycles.update(b.dataset.reactivate, { status: "active" });
        render(container);
      })
    );
    body.querySelectorAll("[data-del-cycle]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (await confirmDialog("Smazat tento cyklus i se všemi zápisy?")) {
          await JournalCycles.remove(b.dataset.delCycle);
          render(container);
        }
      })
    );
  } catch (e) {
    toastError(e);
  }
}

async function openCycleModal(container, cycle) {
  const isNew = !cycle;
  let goals = cycle?.goals?.length ? [...cycle.goals] : ["", "", ""];
  let habits = [];
  if (!isNew) {
    try {
      habits = (await JournalHabits.listByCycle(cycle.id)).map((h) => ({ id: h.id, name: h.name, icon: h.icon || "" }));
    } catch {}
  }
  if (!habits.length) habits = [{ name: "", icon: "" }, { name: "", icon: "" }, { name: "", icon: "" }];

  const start = cycle?.start_date || todayIso();
  const defaultEnd = addDaysIso(start, 89);

  const { el: modalEl, close } = openModal(
    `<div class="modal-header"><h3>${isNew ? "Nový 90denní cyklus" : "Upravit cyklus"}</h3><button class="btn btn-icon btn-ghost" data-close>✕</button></div>
     <div class="field"><label>Název cyklu</label><input type="text" id="cyc-title" value="${escapeHtml(cycle?.title || "")}" placeholder="např. Podzim 2026" /></div>
     <div class="row">
       <div class="field"><label>Začátek</label><input type="date" id="cyc-start" value="${start}" /></div>
       <div class="field"><label>Konec (auto, 90 dní)</label><input type="date" id="cyc-end" value="${cycle?.end_date || defaultEnd}" disabled /></div>
     </div>
     <div class="field"><label>Zaměření / vize cyklu</label><textarea id="cyc-theme" rows="2" placeholder="Na co se v těchto 90 dnech soustředím…">${escapeHtml(cycle?.theme || "")}</textarea></div>
     <div class="field">
       <label>Cíle cyklu</label>
       <div id="cyc-goals">
         ${goals.map((g, i) => `<input type="text" class="cyc-goal" data-i="${i}" value="${escapeHtml(g)}" placeholder="Cíl ${i + 1}" style="margin-bottom:6px;" />`).join("")}
       </div>
     </div>
     <div class="field">
       <label>Sledované návyky</label>
       <div id="cyc-habits">
         ${habits
           .map(
             (h, i) => `<div class="row" data-habit-row="${i}" style="margin-bottom:6px;">
               <input type="text" class="cyc-habit-icon" value="${escapeHtml(h.icon || "")}" placeholder="🏃" style="flex:0 0 54px;" />
               <input type="text" class="cyc-habit-name" value="${escapeHtml(h.name || "")}" placeholder="Název návyku" />
             </div>`
           )
           .join("")}
       </div>
       <button type="button" class="btn btn-ghost btn-sm" id="add-habit-row">+ Další návyk</button>
     </div>
     <div class="modal-actions">
       ${!isNew ? `<button class="btn btn-danger" id="cyc-delete" style="margin-right:auto;">Smazat cyklus</button>` : ""}
       <button class="btn" data-close>Zrušit</button>
       <button class="btn btn-primary" id="cyc-save">${isNew ? "Spustit cyklus" : "Uložit"}</button>
     </div>`,
    { large: true }
  );

  modalEl.querySelector("#cyc-start").addEventListener("change", (e) => {
    modalEl.querySelector("#cyc-end").value = addDaysIso(e.target.value, 89);
  });

  modalEl.querySelector("#add-habit-row").addEventListener("click", () => {
    const wrap = modalEl.querySelector("#cyc-habits");
    const row = document.createElement("div");
    row.className = "row";
    row.style.marginBottom = "6px";
    row.innerHTML = `<input type="text" class="cyc-habit-icon" placeholder="🏃" style="flex:0 0 54px;" /><input type="text" class="cyc-habit-name" placeholder="Název návyku" />`;
    wrap.appendChild(row);
  });

  modalEl.querySelector("#cyc-save").addEventListener("click", async () => {
    const title = modalEl.querySelector("#cyc-title").value.trim() || "Nový cyklus";
    const startDate = modalEl.querySelector("#cyc-start").value;
    const endDate = modalEl.querySelector("#cyc-end").value || addDaysIso(startDate, 89);
    const theme = modalEl.querySelector("#cyc-theme").value.trim() || null;
    const goalsVal = [...modalEl.querySelectorAll(".cyc-goal")].map((i) => i.value.trim()).filter(Boolean);
    const habitNames = [...modalEl.querySelectorAll(".cyc-habit-name")];
    const habitIcons = [...modalEl.querySelectorAll(".cyc-habit-icon")];

    try {
      let savedCycle;
      if (isNew) {
        const current = await JournalCycles.getActive();
        if (current) await JournalCycles.update(current.id, { status: "archived" });
        savedCycle = await JournalCycles.create({
          title,
          start_date: startDate,
          end_date: endDate,
          theme,
          goals: goalsVal,
          status: "active",
        });
      } else {
        savedCycle = await JournalCycles.update(cycle.id, { title, theme, goals: goalsVal });
      }

      if (isNew) {
        for (let i = 0; i < habitNames.length; i++) {
          const name = habitNames[i].value.trim();
          if (!name) continue;
          await JournalHabits.create({ cycle_id: savedCycle.id, name, icon: habitIcons[i].value.trim() || null, sort_order: i });
        }
      } else {
        const existing = await JournalHabits.listByCycle(cycle.id);
        for (let i = 0; i < habitNames.length; i++) {
          const name = habitNames[i].value.trim();
          const icon = habitIcons[i].value.trim() || null;
          const existingHabit = existing[i];
          if (!name) {
            if (existingHabit) await JournalHabits.remove(existingHabit.id);
            continue;
          }
          if (existingHabit) await JournalHabits.update(existingHabit.id, { name, icon });
          else await JournalHabits.create({ cycle_id: cycle.id, name, icon, sort_order: i });
        }
      }

      toast(isNew ? "Cyklus spuštěn 🎉" : "Cyklus uložen", "success");
      close();
      render(container);
    } catch (e) {
      toastError(e);
    }
  });

  if (!isNew) {
    modalEl.querySelector("#cyc-delete").addEventListener("click", async () => {
      if (await confirmDialog("Smazat tento cyklus i se všemi zápisy a návyky?")) {
        await JournalCycles.remove(cycle.id);
        close();
        render(container);
      }
    });
  }
}
