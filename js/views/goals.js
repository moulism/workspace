import { Goals } from "../db.js";
import { escapeHtml, openModal, confirmDialog, fmtDate } from "../ui.js";
import { toast, toastError } from "../toast.js";

const STATUS_LABEL = { active: "Aktivní", completed: "Splněný", paused: "Pozastavený" };
const RING_COLORS = { active: "#22d3ee", completed: "#2f9e5b", paused: "#c98a1f" };

let filters = { status: "all" };
let charts = [];

export async function render(container) {
  container.innerHTML = `
    <div class="section-header">
      <div class="toolbar filter-bar">
        <button class="chip ${filters.status === "all" ? "active" : ""}" data-status="all">Vše</button>
        ${Object.entries(STATUS_LABEL)
          .map(([id, l]) => `<button class="chip ${filters.status === id ? "active" : ""}" data-status="${id}">${l}</button>`)
          .join("")}
      </div>
      <button class="btn btn-primary" id="new-goal-btn">+ Nový cíl</button>
    </div>
    <div class="dash-kpi-row" id="goals-kpis" style="margin-bottom:18px;"></div>
    <div class="grid grid-3" id="goals-grid"></div>
  `;
  container.querySelector("#new-goal-btn").addEventListener("click", () => openGoalModal(container));
  container.querySelectorAll("[data-status]").forEach((b) =>
    b.addEventListener("click", () => {
      filters.status = b.dataset.status;
      render(container);
    })
  );
  await load(container);
}

async function load(container) {
  const grid = container.querySelector("#goals-grid");
  const kpis = container.querySelector("#goals-kpis");
  charts.forEach((c) => c.destroy());
  charts = [];
  try {
    const all = await Goals.list();
    const active = all.filter((g) => g.status === "active");
    const completed = all.filter((g) => g.status === "completed");
    const avg = active.length ? Math.round(active.reduce((s, g) => s + (g.progress || 0), 0) / active.length) : 0;
    kpis.innerHTML = `
      <div class="dash-kpi"><div class="n">${active.length}</div><div class="l">Aktivní</div></div>
      <div class="dash-kpi"><div class="n">${completed.length}</div><div class="l">Splněno</div></div>
      <div class="dash-kpi"><div class="n">${all.length}</div><div class="l">Celkem cílů</div></div>
      <div class="dash-kpi"><div class="n">${avg}%</div><div class="l">Průměrný postup</div></div>
    `;

    const goals = filters.status === "all" ? all : all.filter((g) => g.status === filters.status);
    if (!goals.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="big">🎯</div>Zatím žádné cíle.</div>`;
      return;
    }
    grid.innerHTML = goals
      .map(
        (g, i) => `<div class="card">
          <div style="display:flex;gap:14px;align-items:center;">
            <div class="dash-goal-canvas-wrap" style="flex-shrink:0;">
              <canvas id="goal-ring-${i}"></canvas>
              <div class="dash-goal-pct">${g.progress}%</div>
            </div>
            <div class="grow" style="min-width:0;">
              <b class="truncate" style="display:block;">${escapeHtml(g.title)}</b>
              <div class="faint" style="margin-top:4px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                ${g.category ? escapeHtml(g.category) : ""}
                <span class="pill">${STATUS_LABEL[g.status]}</span>
              </div>
            </div>
          </div>
          ${g.description ? `<div class="faint" style="margin-top:10px;">${escapeHtml(g.description)}</div>` : ""}
          ${g.target_date ? `<div class="faint" style="margin-top:8px;">Termín: ${fmtDate(g.target_date)}</div>` : ""}
          <div class="toolbar" style="margin-top:10px;">
            <button class="btn btn-sm" data-edit="${g.id}">Upravit</button>
          </div>
        </div>`
      )
      .join("");

    if (window.Chart) {
      goals.forEach((g, i) => {
        const ctx = container.querySelector(`#goal-ring-${i}`);
        if (!ctx) return;
        const pct = Math.max(0, Math.min(100, g.progress || 0));
        const color = RING_COLORS[g.status] || "#22d3ee";
        charts.push(
          new Chart(ctx, {
            type: "doughnut",
            data: { datasets: [{ data: [pct, 100 - pct], backgroundColor: [color, "rgba(147,163,181,.18)"], borderWidth: 0 }] },
            options: { cutout: "72%", plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { duration: 400 } },
          })
        );
      });
    }

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
