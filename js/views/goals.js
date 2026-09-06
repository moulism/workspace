import { Goals } from "../db.js";
import { escapeHtml, openModal, confirmDialog, fmtDate } from "../ui.js";
import { toast, toastError } from "../toast.js";

const STATUS_LABEL = { active: "Aktivní", completed: "Splněný", paused: "Pozastavený" };

export async function render(container) {
  container.innerHTML = `
    <div class="section-header">
      <h2>Cíle</h2>
      <button class="btn btn-primary" id="new-goal-btn">+ Nový cíl</button>
    </div>
    <div class="grid grid-3" id="goals-grid"></div>
  `;
  container.querySelector("#new-goal-btn").addEventListener("click", () => openGoalModal(container));
  await load(container);
}

async function load(container) {
  const grid = container.querySelector("#goals-grid");
  try {
    const goals = await Goals.list();
    if (!goals.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="big">🎯</div>Zatím žádné cíle.</div>`;
      return;
    }
    grid.innerHTML = goals
      .map(
        (g) => `<div class="card">
          <div style="display:flex;justify-content:space-between;gap:8px;">
            <b class="truncate">${escapeHtml(g.title)}</b>
            <span class="pill">${STATUS_LABEL[g.status]}</span>
          </div>
          ${g.description ? `<div class="faint" style="margin-top:4px;">${escapeHtml(g.description)}</div>` : ""}
          <div class="progress-bar" style="margin-top:10px;"><div style="width:${g.progress}%"></div></div>
          <div class="faint" style="margin-top:4px;">${g.progress}% ${g.target_date ? "· do " + fmtDate(g.target_date) : ""}</div>
          <div class="toolbar" style="margin-top:10px;">
            <button class="btn btn-sm" data-edit="${g.id}">Upravit</button>
          </div>
        </div>`
      )
      .join("");
    grid.querySelectorAll("[data-edit]").forEach((b) => {
      const g = goals.find((x) => x.id === b.dataset.edit);
      b.addEventListener("click", () => openGoalModal(container, g));
    });
  } catch (e) {
    toastError(e);
  }
}

function openGoalModal(container, goal) {
  const isNew = !goal;
  const { el: modalEl, close } = openModal(`
    <div class="modal-header"><h3>${isNew ? "Nový cíl" : "Upravit cíl"}</h3><button class="btn btn-icon btn-ghost" data-close>✕</button></div>
    <div class="field"><label>Název</label><input type="text" id="g-title" value="${escapeHtml(goal?.title || "")}" /></div>
    <div class="field"><label>Popis</label><textarea id="g-desc" rows="2">${escapeHtml(goal?.description || "")}</textarea></div>
    <div class="row">
      <div class="field"><label>Kategorie</label><input type="text" id="g-cat" value="${escapeHtml(goal?.category || "")}" /></div>
      <div class="field"><label>Cílové datum</label><input type="date" id="g-date" value="${goal?.target_date || ""}" /></div>
    </div>
    <div class="row">
      <div class="field"><label>Postup (%)</label><input type="number" id="g-progress" min="0" max="100" value="${goal?.progress ?? 0}" /></div>
      <div class="field"><label>Stav</label>
        <select id="g-status">${Object.entries(STATUS_LABEL).map(([id, l]) => `<option value="${id}" ${goal?.status === id ? "selected" : ""}>${l}</option>`).join("")}</select>
      </div>
    </div>
    <div class="modal-actions">
      ${!isNew ? `<button class="btn btn-danger" id="g-delete" style="margin-right:auto;">Smazat</button>` : ""}
      <button class="btn" data-close>Zrušit</button>
      <button class="btn btn-primary" id="g-save">Uložit</button>
    </div>
  `);

  modalEl.querySelector("#g-save").addEventListener("click", async () => {
    const fields = {
      title: modalEl.querySelector("#g-title").value.trim() || "Bez názvu",
      description: modalEl.querySelector("#g-desc").value.trim() || null,
      category: modalEl.querySelector("#g-cat").value.trim() || null,
      target_date: modalEl.querySelector("#g-date").value || null,
      progress: Number(modalEl.querySelector("#g-progress").value) || 0,
      status: modalEl.querySelector("#g-status").value,
    };
    try {
      if (isNew) await Goals.create(fields);
      else await Goals.update(goal.id, fields);
      toast("Uloženo", "success");
      close();
      render(container);
    } catch (e) {
      toastError(e);
    }
  });

  if (!isNew) {
    modalEl.querySelector("#g-delete").addEventListener("click", async () => {
      if (await confirmDialog("Smazat tento cíl?")) {
        await Goals.remove(goal.id);
        close();
        render(container);
      }
    });
  }
}
