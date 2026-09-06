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
  try {
    const opts = {};
    if (filters.area !== "all") opts.area = filters.area;
    if (!filters.showDone) opts.done = false;
    const todos = await Todos.list(opts);
    if (!todos.length) {
      box.innerHTML = `<div class="empty-state"><div class="big">✅</div>Žádné úkoly.</div>`;
      return;
    }
    box.innerHTML = todos
      .map(
        (t) => `<label class="list-item ${t.done ? "done" : ""}">
          <input type="checkbox" data-id="${t.id}" class="check" ${t.done ? "checked" : ""} />
          <div class="grow">
            <div class="title">${escapeHtml(t.title)}</div>
            <div class="faint">${AREAS[t.area] || ""} ${t.due_date ? "· " + fmtDate(t.due_date) : ""}</div>
          </div>
          <span class="pill">${PRIORITIES[t.priority] || t.priority}</span>
          <button type="button" class="btn btn-icon btn-ghost btn-sm" data-del="${t.id}">✕</button>
        </label>`
      )
      .join("");
    box.querySelectorAll(".check").forEach((cb) =>
      cb.addEventListener("change", async () => {
        await Todos.toggle(cb.dataset.id, cb.checked);
        loadList(container);
      })
    );
    box.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", async (e) => {
        e.preventDefault();
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
