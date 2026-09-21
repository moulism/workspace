import { Todos, Events } from "../db.js";
import { escapeHtml, openModal, confirmDialog, fmtDate, todayIso } from "../ui.js";
import { toast, toastError } from "../toast.js";

const AREAS = { school: "Škola", work: "Práce", personal: "Osobní" };
const AREA_ICONS = { school: "🎓", work: "💼", personal: "🏠" };
const PRIORITIES = { low: "Nízká", medium: "Střední", high: "Vysoká" };

let showDone = false;

export async function render(container) {
  container.innerHTML = `
    <div class="hub-grid">
      <div class="card" style="grid-column: span 5; grid-row: span 2;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 style="margin:0;">Ohnisko</h3>
          <button class="chip ${showDone ? "active" : ""}" id="toggle-done">Zobrazit hotové</button>
        </div>
        <form id="add-todo-form" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">
          <input type="text" id="new-todo-title" placeholder="Nový úkol…" style="flex:2;min-width:140px;" />
          <select id="new-todo-area" style="flex:1;min-width:96px;">${Object.entries(AREAS).map(([id, l]) => `<option value="${id}">${l}</option>`).join("")}</select>
          <select id="new-todo-priority" style="flex:1;min-width:96px;">${Object.entries(PRIORITIES).map(([id, l]) => `<option value="${id}" ${id === "medium" ? "selected" : ""}>${l}</option>`).join("")}</select>
          <input type="date" id="new-todo-due" style="flex:1;min-width:120px;" />
          <button class="btn btn-primary" type="submit" style="flex:0 0 auto;">Přidat</button>
        </form>
        <div class="faint" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">Nejnaléhavější</div>
        <div class="list" id="urgent-list"></div>
      </div>
      <div class="card" style="grid-column: span 7; grid-row: span 2;">
        <h3 style="margin:0 0 12px;">Podle oblasti</h3>
        <div class="grid grid-3" id="area-board"></div>
      </div>
    </div>
  `;

  container.querySelector("#add-todo-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = container.querySelector("#new-todo-title").value.trim();
    if (!title) return;
    try {
      await Todos.create({
        title,
        area: container.querySelector("#new-todo-area").value,
        priority: container.querySelector("#new-todo-priority").value,
        due_date: container.querySelector("#new-todo-due").value || null,
      });
      e.target.reset();
      loadAll(container);
    } catch (err) {
      toastError(err);
    }
  });

  container.querySelector("#toggle-done").addEventListener("click", () => {
    showDone = !showDone;
    render(container);
  });

  await loadAll(container);
}

async function loadAll(container) {
  const urgentBox = container.querySelector("#urgent-list");
  const boardBox = container.querySelector("#area-board");
  if (!urgentBox || !boardBox) return;
  try {
    const opts = showDone ? {} : { done: false };
    const todos = await Todos.list(opts);
    const today = todayIso();

    const urgent = todos
      .filter((t) => !t.done)
      .sort((a, b) => (a.due_date || "9999-99-99").localeCompare(b.due_date || "9999-99-99"))
      .slice(0, 5);

    if (!urgent.length) {
      urgentBox.innerHTML = `<div class="faint">Žádné blížící se úkoly. 🎉</div>`;
    } else {
      urgentBox.innerHTML = urgent
        .map((t) => {
          const overdue = t.due_date && t.due_date < today;
          return `<label class="list-item">
            <input type="checkbox" data-id="${t.id}" class="check" />
            <div class="grow" data-open="${t.id}" style="cursor:pointer;">
              <div class="title">${escapeHtml(t.title)}</div>
              <div class="faint">${AREAS[t.area] || ""} ${t.due_date ? "· " + fmtDate(t.due_date) : ""} ${overdue ? `<span class="pill pill-danger">po termínu</span>` : ""}</div>
            </div>
            <span class="pill">${PRIORITIES[t.priority] || t.priority}</span>
          </label>`;
        })
        .join("");
      wireRows(urgentBox, todos, container);
    }

    boardBox.innerHTML = Object.entries(AREAS)
      .map(([id, label]) => {
        const items = todos.filter((t) => t.area === id);
        return `<div>
          <div class="faint" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">${AREA_ICONS[id]} ${label} · ${items.length}</div>
          <div class="list">
            ${
              items.length
                ? items
                    .map(
                      (t) => `<label class="list-item ${t.done ? "done" : ""}">
                        <input type="checkbox" data-id="${t.id}" class="check" ${t.done ? "checked" : ""} />
                        <div class="grow" data-open="${t.id}" style="cursor:pointer;">
                          <div class="title truncate">${escapeHtml(t.title)}</div>
                          <div class="faint">${t.due_date ? fmtDate(t.due_date) : ""}</div>
                        </div>
                      </label>`
                    )
                    .join("")
                : `<div class="faint">Prázdné.</div>`
            }
          </div>
        </div>`;
      })
      .join("");
    wireRows(boardBox, todos, container);
  } catch (e) {
    toastError(e);
  }
}

function wireRows(box, todos, container) {
  box.querySelectorAll(".check").forEach((cb) =>
    cb.addEventListener("change", async (e) => {
      e.stopPropagation();
      await Todos.toggle(cb.dataset.id, cb.checked);
      loadAll(container);
    })
  );
  box.querySelectorAll("[data-open]").forEach((el) => {
    const t = todos.find((x) => x.id === el.dataset.open);
    el.addEventListener("click", (e) => {
      e.preventDefault(); // don't let the wrapping <label> also toggle the checkbox
      if (t) openTodoModal(container, t);
    });
  });
}

async function openTodoModal(container, todo) {
  const { el: modalEl, close } = openModal(
    `<div class="modal-header"><h3>Úkol</h3><button class="btn btn-icon btn-ghost" data-close>✕</button></div>
     <div class="field"><label>Název</label><input type="text" id="t-title" value="${escapeHtml(todo.title)}" /></div>
     <div class="field"><label>Popis / poznámky</label><textarea id="t-desc" rows="5" placeholder="Co všechno je k tomu potřeba vědět…">${escapeHtml(todo.description || "")}</textarea></div>
     <div class="row">
       <div class="field"><label>Oblast</label>
         <select id="t-area">${Object.entries(AREAS).map(([id, l]) => `<option value="${id}" ${todo.area === id ? "selected" : ""}>${l}</option>`).join("")}</select>
       </div>
       <div class="field"><label>Priorita</label>
         <select id="t-priority">${Object.entries(PRIORITIES).map(([id, l]) => `<option value="${id}" ${todo.priority === id ? "selected" : ""}>${l}</option>`).join("")}</select>
       </div>
     </div>
     <div class="row">
       <div class="field">
         <label>Termín</label>
         <div class="row" style="gap:6px;">
           <input type="date" id="t-due" value="${todo.due_date || ""}" />
           <button type="button" class="btn btn-icon btn-ghost" id="t-due-clear" title="Odebrat termín" style="flex:0 0 auto;">✕</button>
         </div>
       </div>
       <div class="field"><label><input type="checkbox" id="t-done" ${todo.done ? "checked" : ""} style="width:auto;margin-right:6px;" />Hotovo</label></div>
     </div>
     <div class="modal-actions">
       <button class="btn btn-danger" id="t-delete" style="margin-right:auto;">Smazat</button>
       <button class="btn" data-close>Zavřít</button>
       <button class="btn btn-primary" id="t-save">Uložit</button>
     </div>`,
    { large: true }
  );

  modalEl.querySelector("#t-due-clear").addEventListener("click", () => {
    modalEl.querySelector("#t-due").value = "";
  });

  modalEl.querySelector("#t-save").addEventListener("click", async () => {
    const fields = {
      title: modalEl.querySelector("#t-title").value.trim() || "Bez názvu",
      description: modalEl.querySelector("#t-desc").value.trim() || null,
      area: modalEl.querySelector("#t-area").value,
      priority: modalEl.querySelector("#t-priority").value,
      due_date: modalEl.querySelector("#t-due").value || null,
      done: modalEl.querySelector("#t-done").checked,
    };
    try {
      await Todos.update(todo.id, fields);
      toast("Úkol uložen", "success");
      close();
      loadAll(container);
    } catch (e) {
      toastError(e);
    }
  });

  modalEl.querySelector("#t-delete").addEventListener("click", async () => {
    if (await confirmDialog("Smazat úkol?")) {
      try {
        await Todos.remove(todo.id);
        close();
        loadAll(container);
      } catch (e) {
        toastError(e);
      }
    }
  });
}
