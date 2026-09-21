import { Goals } from "../db.js";
import { escapeHtml, openModal, confirmDialog, fmtDate } from "../ui.js";
import { toast, toastError } from "../toast.js";

const STATUS_LABEL = { active: "Aktivní", completed: "Splněný", paused: "Pozastavený" };
const RING_COLORS = { active: "#22d3ee", completed: "#2f9e5b", paused: "#c98a1f" };

let heroChart = null;

export async function render(container) {
  container.innerHTML = `
    <div class="hub-grid">
      <div class="card hub-hero" style="grid-column: span 5; grid-row: span 2;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Celkový postup</h3>
          <button class="btn btn-primary btn-sm" id="new-goal-btn">+ Nový cíl</button>
        </div>
        <div class="hub-hero-top">
          <div class="dash-goal-canvas-wrap hub-hero-ring">
            <canvas id="hero-ring"></canvas>
            <div class="dash-goal-pct" id="hero-pct">0%</div>
          </div>
        </div>
        <div class="dash-kpi-row" id="goals-kpis"></div>
      </div>
      <div class="card" style="grid-column: span 7; grid-row: span 2;">
        <h3 style="margin:0 0 12px;">Podle kategorie</h3>
        <div id="category-rows"></div>
      </div>
      <div class="card" style="grid-column: span 12;">
        <h3 style="margin:0 0 10px;">Všechny cíle</h3>
        <div class="list" id="goals-list"></div>
      </div>
    </div>
  `;
  container.querySelector("#new-goal-btn").addEventListener("click", () => openGoalModal(container));
  await load(container);
}

async function load(container) {
  const kpis = container.querySelector("#goals-kpis");
  const catBox = container.querySelector("#category-rows");
  const listBox = container.querySelector("#goals-list");
  const pctLabel = container.querySelector("#hero-pct");
  try {
    const all = await Goals.list();
    const active = all.filter((g) => g.status === "active");
    const completed = all.filter((g) => g.status === "completed");
    const avg = active.length ? Math.round(active.reduce((s, g) => s + (g.progress || 0), 0) / active.length) : 0;

    pctLabel.textContent = `${avg}%`;
    heroChart?.destroy();
    const ringCanvas = container.querySelector("#hero-ring");
    if (window.Chart && ringCanvas) {
      heroChart = new Chart(ringCanvas, {
        type: "doughnut",
        data: { datasets: [{ data: [avg, 100 - avg], backgroundColor: ["#22d3ee", "rgba(147,163,181,.18)"], borderWidth: 0 }] },
        options: { cutout: "78%", plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { duration: 500 } },
      });
    }

    kpis.innerHTML = `
      <div class="dash-kpi"><div class="n">${active.length}</div><div class="l">Aktivní</div></div>
      <div class="dash-kpi"><div class="n">${completed.length}</div><div class="l">Splněno</div></div>
      <div class="dash-kpi"><div class="n">${all.length}</div><div class="l">Celkem</div></div>
    `;

    const byCat = {};
    for (const g of all) {
      const key = g.category?.trim() || "Bez kategorie";
      (byCat[key] ||= []).push(g);
    }
    const catNames = Object.keys(byCat).sort((a, b) => a.localeCompare(b, "cs"));
    if (!catNames.length) {
      catBox.innerHTML = `<div class="faint">Zatím žádné cíle.</div>`;
    } else {
      catBox.innerHTML = catNames
        .map((name) => {
          const items = byCat[name];
          const catAvg = Math.round(items.reduce((s, g) => s + (g.progress || 0), 0) / items.length);
          return `<div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;">
              <span>${escapeHtml(name)} <span class="faint">· ${items.length}</span></span>
              <span class="faint">${catAvg}%</span>
            </div>
            <div class="progress-bar"><div style="width:${catAvg}%"></div></div>
          </div>`;
        })
        .join("");
    }

    if (!all.length) {
      listBox.innerHTML = `<div class="empty-state"><div class="big">🎯</div>Zatím žádné cíle.</div>`;
      return;
    }
    listBox.innerHTML = all
      .map(
        (g) => `<div class="list-item" style="align-items:flex-start;">
          <div class="grow">
            <div style="display:flex;gap:8px;align-items:center;">
              <b class="truncate">${escapeHtml(g.title)}</b>
              <span class="pill">${STATUS_LABEL[g.status]}</span>
            </div>
            <div class="faint" style="margin-top:3px;">
              ${g.category ? escapeHtml(g.category) + " · " : ""}${g.progress}% ${g.target_date ? "· do " + fmtDate(g.target_date) : ""}
            </div>
            <div class="progress-bar" style="margin-top:6px;max-width:240px;"><div style="width:${g.progress}%;background:${RING_COLORS[g.status] || "var(--accent)"};"></div></div>
          </div>
          <button type="button" class="btn btn-sm" data-edit="${g.id}">Upravit</button>
        </div>`
      )
      .join("");
    listBox.querySelectorAll("[data-edit]").forEach((b) => {
      const g = all.find((x) => x.id === b.dataset.edit);
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
