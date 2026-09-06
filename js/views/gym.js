import { GymSessions, Events } from "../db.js";
import { escapeHtml, openModal, confirmDialog, fmtDate, todayIso } from "../ui.js";
import { toast, toastError } from "../toast.js";

export async function render(container) {
  container.innerHTML = `
    <div class="section-header">
      <h2>Gym</h2>
      <button class="btn btn-primary" id="new-session-btn">+ Nový trénink</button>
    </div>
    <div class="grid grid-3" style="margin-bottom:16px;" id="gym-stats"></div>
    <div class="list" id="gym-list"></div>
  `;
  container.querySelector("#new-session-btn").addEventListener("click", () => openSessionModal(container));
  await load(container);
}

async function load(container) {
  const list = container.querySelector("#gym-list");
  const stats = container.querySelector("#gym-stats");
  try {
    const sessions = await GymSessions.list();
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    const monthAgo = new Date(now);
    monthAgo.setDate(now.getDate() - 30);
    const thisWeek = sessions.filter((s) => new Date(s.session_date) >= weekAgo).length;
    const thisMonth = sessions.filter((s) => new Date(s.session_date) >= monthAgo).length;
    stats.innerHTML = `
      <div class="card"><div class="faint">Tento týden</div><div style="font-size:24px;font-weight:700;">${thisWeek}</div></div>
      <div class="card"><div class="faint">Tento měsíc</div><div style="font-size:24px;font-weight:700;">${thisMonth}</div></div>
      <div class="card"><div class="faint">Celkem zaznamenáno</div><div style="font-size:24px;font-weight:700;">${sessions.length}</div></div>
    `;
    if (!sessions.length) {
      list.innerHTML = `<div class="empty-state"><div class="big">🏋️</div>Zatím žádné tréninky.</div>`;
      return;
    }
    list.innerHTML = sessions
      .map(
        (s) => `<div class="list-item" style="align-items:flex-start;cursor:pointer;" data-id="${s.id}">
          <div class="grow">
            <div class="title">${escapeHtml(s.session_type || "Trénink")} ${s.done ? "✅" : ""}</div>
            <div class="faint">${fmtDate(s.session_date)} ${s.duration_minutes ? "· " + s.duration_minutes + " min" : ""}</div>
            ${s.exercises?.length ? `<div class="faint" style="margin-top:4px;">${s.exercises.map((ex) => escapeHtml(ex.name)).join(", ")}</div>` : ""}
          </div>
        </div>`
      )
      .join("");
    list.querySelectorAll("[data-id]").forEach((el) => {
      const s = sessions.find((x) => x.id === el.dataset.id);
      el.addEventListener("click", () => openSessionModal(container, s));
    });
  } catch (e) {
    toastError(e);
  }
}

function exerciseRowHtml(ex = {}) {
  return `<div class="row exercise-row" style="margin-bottom:6px;">
    <input type="text" placeholder="Cvik" class="ex-name" value="${escapeHtml(ex.name || "")}" />
    <input type="text" placeholder="Série" class="ex-sets" style="max-width:70px;" value="${escapeHtml(ex.sets || "")}" />
    <input type="text" placeholder="Opak." class="ex-reps" style="max-width:70px;" value="${escapeHtml(ex.reps || "")}" />
    <input type="text" placeholder="Váha" class="ex-weight" style="max-width:80px;" value="${escapeHtml(ex.weight || "")}" />
    <button type="button" class="btn btn-icon btn-ghost remove-ex">✕</button>
  </div>`;
}

function openSessionModal(container, session) {
  const isNew = !session;
  const { el: modalEl, close } = openModal(
    `<div class="modal-header"><h3>${isNew ? "Nový trénink" : "Upravit trénink"}</h3><button class="btn btn-icon btn-ghost" data-close>✕</button></div>
     <div class="row">
       <div class="field"><label>Datum</label><input type="date" id="s-date" value="${session?.session_date || todayIso()}" /></div>
       <div class="field"><label>Typ</label><input type="text" id="s-type" placeholder="Push / Pull / Nohy / Kardio…" value="${escapeHtml(session?.session_type || "")}" /></div>
       <div class="field"><label>Délka (min)</label><input type="number" id="s-duration" value="${session?.duration_minutes || ""}" /></div>
     </div>
     <label style="margin-top:4px;">Cviky</label>
     <div id="exercises-mount">${(session?.exercises || [{}]).map(exerciseRowHtml).join("")}</div>
     <button type="button" class="btn btn-sm" id="add-exercise">+ Přidat cvik</button>
     <div class="field" style="margin-top:12px;"><label>Poznámka</label><textarea id="s-notes" rows="2">${escapeHtml(session?.notes || "")}</textarea></div>
     <div class="field"><label><input type="checkbox" id="s-done" ${session?.done ? "checked" : ""} style="width:auto;margin-right:6px;" />Trénink dokončen</label></div>
     ${isNew ? `<div class="field"><label><input type="checkbox" id="s-addcal" style="width:auto;margin-right:6px;" />Přidat do kalendáře</label></div>` : ""}
     <div class="modal-actions">
       ${!isNew ? `<button class="btn btn-danger" id="s-delete" style="margin-right:auto;">Smazat</button>` : ""}
       <button class="btn" data-close>Zrušit</button>
       <button class="btn btn-primary" id="s-save">Uložit</button>
     </div>`,
    { large: true }
  );

  const mount = modalEl.querySelector("#exercises-mount");
  function wireRemove() {
    mount.querySelectorAll(".remove-ex").forEach((b) =>
      b.addEventListener("click", () => {
        b.closest(".exercise-row").remove();
      })
    );
  }
  wireRemove();
  modalEl.querySelector("#add-exercise").addEventListener("click", () => {
    mount.insertAdjacentHTML("beforeend", exerciseRowHtml());
    wireRemove();
  });

  function collectExercises() {
    return [...mount.querySelectorAll(".exercise-row")]
      .map((row) => ({
        name: row.querySelector(".ex-name").value.trim(),
        sets: row.querySelector(".ex-sets").value.trim(),
        reps: row.querySelector(".ex-reps").value.trim(),
        weight: row.querySelector(".ex-weight").value.trim(),
      }))
      .filter((e) => e.name);
  }

  modalEl.querySelector("#s-save").addEventListener("click", async () => {
    const fields = {
      session_date: modalEl.querySelector("#s-date").value,
      session_type: modalEl.querySelector("#s-type").value.trim() || null,
      duration_minutes: Number(modalEl.querySelector("#s-duration").value) || null,
      exercises: collectExercises(),
      notes: modalEl.querySelector("#s-notes").value.trim() || null,
      done: modalEl.querySelector("#s-done").checked,
    };
    try {
      if (isNew) {
        let event_id = null;
        if (modalEl.querySelector("#s-addcal")?.checked) {
          const ev = await Events.create({
            title: `Gym: ${fields.session_type || "trénink"}`,
            category: "gym",
            all_day: true,
            start_at: new Date(fields.session_date + "T00:00:00").toISOString(),
            end_at: new Date(fields.session_date + "T00:00:00").toISOString(),
          });
          event_id = ev.id;
        }
        await GymSessions.create({ ...fields, event_id });
      } else {
        await GymSessions.update(session.id, fields);
      }
      toast("Uloženo", "success");
      close();
      render(container);
    } catch (e) {
      toastError(e);
    }
  });

  if (!isNew) {
    modalEl.querySelector("#s-delete").addEventListener("click", async () => {
      if (await confirmDialog("Smazat tento trénink?")) {
        if (session.event_id) await Events.remove(session.event_id).catch(() => {});
        await GymSessions.remove(session.id);
        close();
        render(container);
      }
    });
  }
}
