import { Todos, Events } from "../db.js";
import { escapeHtml, openModal, confirmDialog, fmtDate, todayIso } from "../ui.js";
import { toast, toastError } from "../toast.js";

const AREAS = { school: "Škola", work: "Práce", personal: "Osobní" };
const PRIORITIES = { low: "Nízká", medium: "Střední", high: "Vysoká" };

let filters = { area: "all", showDone: false };

export async function render(container) {
  container.innerHTML = `
    <div class="section-header">
      <div class="toolbar filter-bar">
        <button class="chip ${filters.area === "all" ? "active" : ""}" data-area="all">Vše</button>
        ${Object.entries(AREAS)
          .map(([id, label]) => `<button class="chip ${filters.area === id ? "active" : ""}" data-area="${id}">${label}</button>`)
          .join("")}
        <button class="chip ${filters.showDone ? "active" : ""}" id="toggle-done">Zobrazit hotové</button>
      </div>
    </div>
    <div class="dash-kpi-row" id="todos-kpis" style="margin-bottom:14px;"></div>
    <form id="add-todo-form" class="card" style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
      <input type="text" id="new-todo-title" placeholder="Nový úkol…" style="flex:2;min-width:180px;" />
      <select id="new-todo-area" style="flex:1;min-width:110px;">${Object.entries(AREAS).map(([id, l]) => `<option value="${id}">${l}</option>`).join("")}</select>
      <select id="new-todo-priority" style="flex:1;min-width:110px;">${Object.entries(PRIORITIES).map(([id, l]) => `<option value="${id}" ${id === "medium" ? "selected" : ""}>${l}</option>`).join("")}</select>
      <input type="date" id="new-todo-due" style="flex:1;min-width:140px;" />
      <button class="btn btn-primary" type="submit">Přidat</button>
    </form>
    <div class="list" id="todos-list"></div>
  `;

  container.querySelectorAll("[data-area]").forEach((b) =>
    b.addEventListener("click", () => {
      filters.area = b.dataset.area;
      render(container);
    })
  );
  container.querySelector("#toggle-done").addEventListener("click", () => {
    filters.showDone = !filters.showDone;
    render(container);
  });

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
      loadList(container);
    } catch (err) {
      toastError(err);
    }
  });

  await loadList(container);
}

async function loadList(container) {
  const box = container.querySelector("#todos-list");
  const kpis = container.querySelector("#todos-kpis");
  try {
    const opts = {};
    if (filters.area !== "all") opts.area = filters.area;
    if (!filters.showDone) opts.done = false;
    const todos = await Todos.list(opts);

    const openTodos = await Todos.list({ done: false });
    const today = todayIso();
    const overdue = openTodos.filter((t) => t.due_date && t.due_date < today).length;
    const dueToday = openTodos.filter((t) => t.due_date === today).length;
    const highPriority = openTodos.filter((t) => t.priority === "high").length;
    if (kpis) {
      kpis.innerHTML = `
        <div class="dash-kpi"><div class="n">${openTodos.length}</div><div class="l">Otevřené</div></div>
        <div class="dash-kpi"><div class="n">${overdue}</div><div class="l">Po termínu</div></div>
        <div class="dash-kpi"><div class="n">${dueToday}</div><div class="l">Dnes</div></div>
        <div class="dash-kpi"><div class="n">${highPriority}</div><div class="l">Vysoká priorita</div></div>
      `;
    }

    if (!todos.length) {
      box.innerHTML = `<div class="empty-state"><div class="big">✅</div>Žádné úkoly.</div>`;
      return;
    }
    box.innerHTML = todos
      .map((t) => {
        const overdueItem = !t.done && t.due_date && t.due_date < today;
        return `<label class="list-item ${t.done ? "done" : ""}">
          <input type="checkbox" data-id="${t.id}" class="check" ${t.done ? "checked" : ""} />
          <div class="grow" data-open="${t.id}" style="cursor:pointer;">
            <div class="title">${escapeHtml(t.title)}${t.description ? ` <span class="faint">📝</span>` : ""}</div>
            <div class="faint">${AREAS[t.area] || ""} ${t.due_date ? "· " + fmtDate(t.due_date) : ""} ${overdueItem ? `<span class="pill pill-danger">po termínu</span>` : ""}</div>
          </div>
          <span class="pill">${PRIORITIES[t.priority] || t.priority}</span>
          <button type="button" class="btn btn-icon btn-ghost btn-sm" data-del="${t.id}">✕</button>
        </label>`;
      })
      .join("");
    box.querySelectorAll(".check").forEach((cb) =>
      cb.addEventListener("change", async (e) => {
        e.stopPropagation();
        await Todos.toggle(cb.dataset.id, cb.checked);
        loadList(container);
      })
    );
    box.querySelectorAll("[data-open]").forEach((el) => {
      const t = todos.find((x) => x.id === el.dataset.open);
      el.addEventListener("click", (e) => {
        e.preventDefault(); // don't let the wrapping <label> also toggle the checkbox
        openTodoModal(container, t);
      });
    });
    box.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (await confirmDialog("Smazat úkol?")) {
          await Todos.remove(b.dataset.del);
          loadList(container);
        }
      })
    );
  } catch (e) {
    toastError(e);
  }
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
      loadList(container);
    } catch (e) {
      toastError(e);
    }
  });

  modalEl.querySelector("#t-delete").addEventListener("click", async () => {
    if (await confirmDialog("Smazat úkol?")) {
      try {
        await Todos.remove(todo.id);
        close();
        loadList(container);
      } catch (e) {
        toastError(e);
      }
    }
  });
}
