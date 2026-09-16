import { Notes, Folders, FlashcardSets, Quizzes, Attachments } from "../db.js";
import { supabase } from "../supabaseClient.js";
import { AI_FUNCTION_NAME } from "../config.js";
import { escapeHtml, openModal, confirmDialog, fmtDate, fmtDateTime, todayIso } from "../ui.js";
import { toast, toastError } from "../toast.js";
import { createEditor } from "../richtext.js";
import { exportNoteToPdf, exportNoteToHtmlFile } from "../pdfExport.js";

function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const AREAS = [
  { id: "school", label: "Škola" },
  { id: "work", label: "Práce" },
  { id: "personal", label: "Osobní" },
];

const FOLDER_COLORS = ["#4f46e5", "#0f766e", "#dc4c3f", "#c98a1f", "#2f9e5b", "#a21caf", "#0284c7", "#6b6a68"];
const FOLDER_ICONS = ["📁", "📐", "🧪", "📚", "🖥️", "🌍", "➗", "⚖️", "🎨", "🗣️", "📊", "🏛️"];

let state = { area: "school", folderId: null, search: "", tab: "notes" };

function dueBadge(dueDate) {
  if (!dueDate) return "";
  const today = todayIso();
  const diffDays = Math.round((new Date(dueDate) - new Date(today)) / 86400000);
  let cls = "pill";
  let label = fmtDate(dueDate);
  if (diffDays < 0) {
    cls += " pill-danger";
    label = `po termínu · ${fmtDate(dueDate)}`;
  } else if (diffDays === 0) {
    cls += " pill-danger";
    label = `dnes`;
  } else if (diffDays <= 3) {
    cls += " pill-warning";
    label = `za ${diffDays} dny`;
  }
  return `<span class="${cls}">⏰ ${label}</span>`;
}

/** Builds a parent_id -> children tree from a flat folder list. */
function buildFolderTree(folders) {
  const byId = Object.fromEntries(folders.map((f) => [f.id, { ...f, children: [] }]));
  const roots = [];
  for (const f of folders) {
    const node = byId[f.id];
    if (f.parent_id && byId[f.parent_id]) byId[f.parent_id].children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Renders a nested folder tree as HTML. Rows carry data-select / data-add-sub / data-edit-folder. */
function renderFolderTreeHtml(nodes, selectedId, depth = 0) {
  if (!nodes.length && depth === 0) return `<div class="faint" style="padding:6px 0;">Zatím žádné.</div>`;
  return nodes
    .map(
      (n) => `
      <div class="folder-row ${selectedId === n.id ? "active" : ""}" data-folder="${n.id}" style="padding-left:${8 + depth * 16}px;">
        <span class="folder-row-main" data-select="${n.id}">
          ${n.icon ? `<span>${escapeHtml(n.icon)}</span>` : `<span class="dot" style="background:${n.color || "#888"}"></span>`}
          <span class="truncate">${escapeHtml(n.name)}</span>
        </span>
        <button type="button" class="folder-edit-btn" data-add-sub="${n.id}" title="Přidat podsložku">+</button>
        <button type="button" class="folder-edit-btn" data-edit-folder="${n.id}" title="Upravit">✎</button>
      </div>
      ${n.children.length ? renderFolderTreeHtml(n.children, selectedId, depth + 1) : ""}
    `
    )
    .join("");
}

export async function render(container) {
  container.innerHTML = `
    <div class="section-header">
      <div class="toolbar">
        ${AREAS.map((a) => `<button class="chip ${state.area === a.id ? "active" : ""}" data-area="${a.id}">${a.label}</button>`).join("")}
        <span style="width:10px;"></span>
        <button class="chip ${state.tab === "notes" ? "active" : ""}" data-tab="notes">Poznámky</button>
        <button class="chip ${state.tab === "study" ? "active" : ""}" data-tab="study">Studijní materiály</button>
      </div>
      <div class="toolbar">
        <input type="search" id="note-search" placeholder="Hledat…" style="width:180px;" value="${escapeHtml(state.search)}" />
        <button class="btn btn-primary" id="new-note-btn">+ Nová poznámka</button>
      </div>
    </div>
    <div id="upcoming-panel"></div>
    <div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;">
      <div class="card" style="width:210px;flex-shrink:0;" id="folder-panel"></div>
      <div style="flex:1;min-width:260px;" id="notes-main"></div>
    </div>
  `;

  container.querySelectorAll("[data-area]").forEach((b) =>
    b.addEventListener("click", () => {
      state.area = b.dataset.area;
      state.folderId = null;
      render(container);
    })
  );
  container.querySelectorAll("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      state.tab = b.dataset.tab;
      render(container);
    })
  );
  container.querySelector("#note-search").addEventListener("input", (e) => {
    state.search = e.target.value;
    loadNotesList(container);
  });
  container.querySelector("#new-note-btn").addEventListener("click", () => openNoteEditor(container));

  await renderUpcomingPanel(container);
  await renderFolderPanel(container);
  if (state.tab === "study") await renderStudyTab(container);
  else await loadNotesList(container);
}

async function renderUpcomingPanel(container) {
  const panel = container.querySelector("#upcoming-panel");
  if (state.area !== "school") {
    panel.innerHTML = "";
    return;
  }
  try {
    const from = todayIso();
    const to = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const notes = await Notes.listUpcoming({ area: "school", from, to, limit: 6 });
    if (!notes.length) {
      panel.innerHTML = "";
      return;
    }
    panel.innerHTML = `
      <div class="card" style="margin-bottom:16px;">
        <div class="faint" style="margin-bottom:8px;">BLÍŽÍCÍ SE TERMÍNY (14 DNÍ)</div>
        <div class="toolbar" style="gap:8px;flex-wrap:wrap;">
          ${notes
            .map(
              (n) => `<div class="pill" data-open-note="${n.id}" style="cursor:pointer;gap:6px;">
                ${n.folders?.icon ? n.folders.icon + " " : ""}${escapeHtml(n.title)} · ${dueBadge(n.due_date)}
              </div>`
            )
            .join("")}
        </div>
      </div>`;
    panel.querySelectorAll("[data-open-note]").forEach((p) =>
      p.addEventListener("click", () => openNoteEditor(container, p.dataset.openNote))
    );
  } catch (e) {
    panel.innerHTML = "";
  }
}

async function renderFolderPanel(container) {
  const panel = container.querySelector("#folder-panel");
  try {
    const folders = await Folders.list(state.area);
    const tree = buildFolderTree(folders);
    panel.innerHTML = `
      <div class="faint" style="margin-bottom:8px;">${state.area === "school" ? "PŘEDMĚTY" : "SLOŽKY"}</div>
      <div class="nav-item ${!state.folderId ? "active" : ""}" data-folder="">Vše</div>
      <div class="folder-tree">${renderFolderTreeHtml(tree, state.folderId)}</div>
      <button class="btn btn-ghost btn-sm" id="add-folder-btn" style="margin-top:8px;width:100%;">+ ${state.area === "school" ? "Předmět" : "Složka"}</button>
    `;
    function selectFolder(id) {
      state.folderId = id || null;
      loadNotesList(container);
      panel.querySelectorAll(".folder-row, .nav-item[data-folder]").forEach((x) => x.classList.remove("active"));
      const row = id ? panel.querySelector(`.folder-row[data-folder="${id}"]`) : panel.querySelector('[data-folder=""]');
      row?.classList.add("active");
    }
    panel.querySelectorAll("[data-select]").forEach((s) => s.addEventListener("click", () => selectFolder(s.dataset.select)));
    panel.querySelector('[data-folder=""]').addEventListener("click", () => selectFolder(null));
    panel.querySelectorAll("[data-edit-folder]").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const folder = folders.find((f) => f.id === b.dataset.editFolder);
        openFolderModal(container, folder, { area: state.area, onDone: () => renderFolderPanel(container) });
      })
    );
    panel.querySelectorAll("[data-add-sub]").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openFolderModal(container, null, { area: state.area, parentId: b.dataset.addSub, onDone: () => renderFolderPanel(container) });
      })
    );
    panel.querySelector("#add-folder-btn").addEventListener("click", () =>
      openFolderModal(container, null, { area: state.area, onDone: () => renderFolderPanel(container) })
    );
  } catch (e) {
    toastError(e);
  }
}

async function openFolderModal(container, folder, opts = {}) {
  const isNew = !folder;
  const area = folder?.area || opts.area || state.area;
  const isSchool = area === "school";
  const onDone = opts.onDone || (() => render(container));
  const childCount = folder?._childCount || 0;
  const { el: modalEl, close } = openModal(`
    <div class="modal-header"><h3>${isNew ? (isSchool ? "Nový předmět" : "Nová složka") : (isSchool ? "Upravit předmět" : "Upravit složku")}</h3><button class="btn btn-icon btn-ghost" data-close>✕</button></div>
    ${opts.parentId ? `<div class="faint" style="margin-bottom:10px;">Podsložka</div>` : ""}
    <div class="field"><label>Název</label><input type="text" id="folder-name" value="${escapeHtml(folder?.name || "")}" placeholder="${isSchool ? "např. Matematika" : "Název"}" /></div>
    <div class="field">
      <label>Ikona (emoji, nepovinné)</label>
      <input type="text" id="folder-icon" value="${escapeHtml(folder?.icon || "")}" placeholder="📐" style="width:90px;margin-bottom:6px;" />
      <div class="toolbar" style="gap:5px;">
        ${FOLDER_ICONS.map((ic) => `<button type="button" class="btn btn-icon btn-sm" data-pick-icon="${ic}">${ic}</button>`).join("")}
      </div>
    </div>
    <div class="field">
      <label>Barva</label>
      <div class="toolbar" id="folder-color-swatches" style="gap:6px;">
        ${FOLDER_COLORS.map(
          (c) => `<button type="button" class="color-swatch ${folder?.color === c ? "selected" : ""}" data-color="${c}" style="background:${c};"></button>`
        ).join("")}
      </div>
      <input type="hidden" id="folder-color" value="${folder?.color || FOLDER_COLORS[0]}" />
    </div>
    <div class="modal-actions">
      ${!isNew ? `<button class="btn btn-danger" id="folder-delete" style="margin-right:auto;">Smazat</button>` : ""}
      <button class="btn" data-close>Zrušit</button>
      <button class="btn btn-primary" id="folder-save">Uložit</button>
    </div>
  `);

  modalEl.querySelectorAll("[data-pick-icon]").forEach((b) =>
    b.addEventListener("click", () => (modalEl.querySelector("#folder-icon").value = b.dataset.pickIcon))
  );
  modalEl.querySelectorAll("[data-color]").forEach((b) =>
    b.addEventListener("click", () => {
      modalEl.querySelector("#folder-color").value = b.dataset.color;
      modalEl.querySelectorAll("[data-color]").forEach((x) => x.classList.toggle("selected", x === b));
    })
  );

  modalEl.querySelector("#folder-save").addEventListener("click", async () => {
    const name = modalEl.querySelector("#folder-name").value.trim();
    if (!name) return;
    const fields = {
      name,
      icon: modalEl.querySelector("#folder-icon").value.trim() || null,
      color: modalEl.querySelector("#folder-color").value,
    };
    try {
      let saved;
      if (isNew) saved = await Folders.create({ area, parent_id: opts.parentId || null, ...fields });
      else saved = await Folders.update(folder.id, fields);
      close();
      onDone(saved);
    } catch (e) {
      toastError(e);
    }
  });

  if (!isNew) {
    modalEl.querySelector("#folder-delete").addEventListener("click", async () => {
      if (await confirmDialog(`Smazat "${folder.name}"? Poznámky uvnitř zůstanou, jen ztratí přiřazení. Případné podsložky budou smazány také.`)) {
        try {
          await Folders.remove(folder.id);
          if (state.folderId === folder.id) state.folderId = null;
          close();
          onDone();
        } catch (e) {
          toastError(e);
        }
      }
    });
  }
}

async function loadNotesList(container) {
  const main = container.querySelector("#notes-main");
  main.innerHTML = `<div class="center" style="padding:40px;"><div class="spinner"></div></div>`;
  try {
    const notes = await Notes.list({ area: state.area, folderId: state.folderId, search: state.search || undefined });
    if (!notes.length) {
      main.innerHTML = `<div class="empty-state"><div class="big">📝</div>Zatím žádné poznámky v této sekci.</div>`;
      return;
    }
    main.innerHTML = `<div class="grid grid-2">${notes
      .map(
        (n) => `<div class="card note-card" data-id="${n.id}" style="cursor:pointer;">
          <div style="display:flex;justify-content:space-between;gap:8px;">
            <div class="title truncate" style="font-weight:600;">
              ${n.pinned ? "📌 " : ""}${n.folders?.icon ? n.folders.icon + " " : ""}${escapeHtml(n.title)}
            </div>
            <div class="faint" style="white-space:nowrap;">${fmtDate(n.updated_at)}</div>
          </div>
          <div class="faint truncate" style="margin-top:6px;max-height:40px;overflow:hidden;">${escapeHtml((n.content || "").replace(/<[^>]+>/g, " ")).slice(0, 140)}</div>
          <div style="margin-top:8px;display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
            ${n.folders?.name ? `<span class="pill">${escapeHtml(n.folders.name)}</span>` : ""}
            ${dueBadge(n.due_date)}
            ${n.tags?.length ? n.tags.map((t) => `<span class="pill">#${escapeHtml(t)}</span>`).join("") : ""}
          </div>
        </div>`
      )
      .join("")}</div>`;
    main.querySelectorAll(".note-card").forEach((c) => c.addEventListener("click", () => openNoteEditor(container, c.dataset.id)));
  } catch (e) {
    toastError(e);
  }
}

/**
 * Opens the full-page (Notion-style) note editor as a fixed overlay on top
 * of the whole app — not a small modal bubble. Left side: area + nested
 * folder/subfolder picker. Right side: big title + rich text editor.
 *
 * @param {HTMLElement} container - the view container (used to refresh the
 *   Notes list after save/delete when no custom callbacks are given).
 * @param {string|null} noteId - id of an existing note, or null/undefined
 *   for a new note.
 * @param {object} [opts]
 * @param {object} [opts.prefill] - fields to pre-fill a *new* note with
 *   (e.g. from "+ Přidat poznámku" on a calendar event): title, area,
 *   folder_id, due_date.
 * @param {(note: object) => void} [opts.onSaved] - called after a
 *   successful save instead of re-rendering the Notes view into
 *   `container` (used when opened from outside the Notes section).
 * @param {() => void} [opts.onDeleted] - called after a successful delete,
 *   same idea as onSaved.
 */
export async function openNoteEditor(container, noteId, opts = {}) {
  let note = noteId
    ? await Notes.get(noteId).catch((e) => {
        toastError(e);
        return null;
      })
    : {
        title: "",
        content: "",
        tags: [],
        area: state.area,
        folder_id: state.folderId,
        pinned: false,
        due_date: null,
        ...(opts.prefill || {}),
      };
  if (!note) return;

  const overlay = document.createElement("div");
  overlay.className = "note-page-overlay";
  overlay.innerHTML = `
    <div class="note-page-topbar">
      <button class="btn btn-icon btn-ghost" id="note-page-back" title="Zpět">←</button>
      <input type="text" id="note-title" class="note-page-title-input" placeholder="Bez názvu" value="${escapeHtml(note.title)}" />
      <div class="note-page-topbar-actions">
        <span class="note-page-last-saved" id="note-last-saved">${note.updated_at ? "Upraveno " + fmtDateTime(note.updated_at) : ""}</span>
        <span class="faint" id="ai-status"></span>
        ${noteId ? `<button class="btn btn-danger btn-sm" id="delete-note">Smazat</button>` : ""}
        <button class="btn btn-primary" id="save-note">Uložit</button>
      </div>
    </div>
    <div class="note-page-body">
      <button class="btn btn-ghost btn-sm note-page-sidebar-toggle" id="note-page-sidebar-toggle">📁 ${note.area === "school" ? "Předmět" : "Složka"}</button>
      <div class="note-page-sidebar" id="note-page-sidebar">
        <div class="faint" style="margin-bottom:8px;">OBLAST</div>
        <div class="toolbar" style="margin-bottom:16px;flex-wrap:wrap;" id="note-area-chips">
          ${AREAS.map((a) => `<button type="button" class="chip ${note.area === a.id ? "active" : ""}" data-note-area="${a.id}">${a.label}</button>`).join("")}
        </div>
        <div class="faint" style="margin-bottom:8px;" id="note-folder-label">${note.area === "school" ? "PŘEDMĚT" : "SLOŽKA"}</div>
        <div class="folder-tree" id="note-folder-tree"></div>
        <button class="btn btn-ghost btn-sm" id="note-add-folder" style="margin-top:10px;width:100%;">+ ${note.area === "school" ? "Předmět" : "Složka"}</button>
        <hr style="margin:18px 0;border:none;border-top:1px solid var(--border);" />
        <div class="field">
          <label>Termín (nepovinné)</label>
          <div class="row" style="gap:6px;">
            <input type="date" id="note-due" value="${note.due_date || ""}" />
            <button type="button" class="btn btn-icon btn-ghost" id="note-due-clear" title="Odebrat termín" style="flex:0 0 auto;">✕</button>
          </div>
        </div>
        <div class="field"><label>Štítky</label><input type="text" id="note-tags" placeholder="štítek1, štítek2" value="${escapeHtml((note.tags || []).join(", "))}" /></div>
      </div>
      <div class="note-page-main">
        <div id="note-editor-mount" class="note-page-editor-mount"></div>
        <div class="note-page-toolbar">
          <button class="btn btn-sm" id="ai-flashcards">✨ Flashcards</button>
          <button class="btn btn-sm" id="ai-quiz">✨ Test</button>
          <button class="btn btn-sm" id="ai-summary">✨ Shrnutí</button>
          <button class="btn btn-sm" id="export-pdf">📄 PDF</button>
          <button class="btn btn-sm" id="export-html">🔗 Export pro kamarády</button>
        </div>
        <div class="note-page-attachments">
          <label>Přílohy</label>
          ${
            noteId
              ? `<div class="list" id="attachments-list" style="margin-bottom:8px;"></div><input type="file" id="attachment-input" />`
              : `<div class="faint">Nejdřív poznámku ulož, pak k ní budeš moct přidat soubory.</div>`
          }
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add("note-page-open");

  function close() {
    document.removeEventListener("keydown", escHandler);
    overlay.remove();
    document.body.classList.remove("note-page-open");
  }
  function escHandler(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", escHandler);
  overlay.querySelector("#note-page-back").addEventListener("click", close);
  overlay.querySelector("#note-page-sidebar-toggle").addEventListener("click", () => {
    overlay.querySelector("#note-page-sidebar").classList.toggle("open");
  });
  overlay.querySelector("#note-due-clear").addEventListener("click", () => {
    overlay.querySelector("#note-due").value = "";
  });

  const editor = createEditor(overlay.querySelector("#note-editor-mount"), note.content);

  async function refreshFolderTree() {
    const wrap = overlay.querySelector("#note-folder-tree");
    try {
      const folders = await Folders.list(note.area);
      const tree = buildFolderTree(folders);
      wrap.innerHTML = renderFolderTreeHtml(tree, note.folder_id);
      wrap.querySelectorAll("[data-select]").forEach((s) =>
        s.addEventListener("click", () => {
          note.folder_id = s.dataset.select;
          wrap.querySelectorAll(".folder-row").forEach((r) => r.classList.toggle("active", r.dataset.folder === note.folder_id));
        })
      );
      wrap.querySelectorAll("[data-add-sub]").forEach((b) =>
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          openFolderModal(container, null, {
            area: note.area,
            parentId: b.dataset.addSub,
            onDone: (saved) => {
              if (saved) note.folder_id = saved.id;
              refreshFolderTree();
            },
          });
        })
      );
      wrap.querySelectorAll("[data-edit-folder]").forEach((b) =>
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const folder = folders.find((f) => f.id === b.dataset.editFolder);
          openFolderModal(container, folder, { area: note.area, onDone: () => refreshFolderTree() });
        })
      );
    } catch (e) {
      wrap.innerHTML = `<div class="faint">Nepodařilo se načíst.</div>`;
    }
  }
  await refreshFolderTree();

  overlay.querySelector("#note-add-folder").addEventListener("click", () =>
    openFolderModal(container, null, {
      area: note.area,
      onDone: (saved) => {
        if (saved) note.folder_id = saved.id;
        refreshFolderTree();
      },
    })
  );

  overlay.querySelectorAll("[data-note-area]").forEach((b) =>
    b.addEventListener("click", () => {
      note.area = b.dataset.noteArea;
      note.folder_id = null;
      overlay.querySelectorAll("[data-note-area]").forEach((x) => x.classList.toggle("active", x === b));
      overlay.querySelector("#note-folder-label").textContent = note.area === "school" ? "PŘEDMĚT" : "SLOŽKA";
      overlay.querySelector("#note-add-folder").textContent = `+ ${note.area === "school" ? "Předmět" : "Složka"}`;
      overlay.querySelector("#note-page-sidebar-toggle").textContent = `📁 ${note.area === "school" ? "Předmět" : "Složka"}`;
      refreshFolderTree();
    })
  );

  overlay.querySelector("#export-pdf").addEventListener("click", () => {
    const title = overlay.querySelector("#note-title").value.trim() || "Bez názvu";
    exportNoteToPdf(title, editor.getHtml());
  });
  overlay.querySelector("#export-html").addEventListener("click", () => {
    const title = overlay.querySelector("#note-title").value.trim() || "Bez názvu";
    exportNoteToHtmlFile(title, editor.getHtml());
    toast("Staženo jako HTML soubor — klidně pošli kamarádům", "success");
  });

  if (noteId) {
    loadAttachments(overlay, noteId);
    overlay.querySelector("#attachment-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await Attachments.upload(noteId, file);
        e.target.value = "";
        loadAttachments(overlay, noteId);
      } catch (err) {
        toastError(err);
      }
    });
  }

  overlay.querySelector("#save-note").addEventListener("click", async () => {
    const title = overlay.querySelector("#note-title").value.trim() || "Bez názvu";
    const tags = overlay
      .querySelector("#note-tags")
      .value.split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const fields = {
      title,
      content: editor.getHtml(),
      tags,
      area: note.area,
      folder_id: note.folder_id || null,
      due_date: overlay.querySelector("#note-due").value || null,
    };
    try {
      let saved;
      if (noteId) saved = await Notes.update(noteId, fields);
      else saved = await Notes.create(fields);
      note.updated_at = saved.updated_at;
      const lastSavedEl = overlay.querySelector("#note-last-saved");
      if (lastSavedEl) lastSavedEl.textContent = "Upraveno " + fmtDateTime(saved.updated_at);
      toast("Poznámka uložena", "success");
      close();
      if (opts.onSaved) opts.onSaved(saved);
      else render(container);
    } catch (e) {
      toastError(e);
    }
  });

  if (noteId) {
    overlay.querySelector("#delete-note").addEventListener("click", async () => {
      if (await confirmDialog("Smazat tuto poznámku?")) {
        await Notes.remove(noteId);
        close();
        if (opts.onDeleted) opts.onDeleted();
        else render(container);
      }
    });
  }

  const statusEl = overlay.querySelector("#ai-status");
  const setStatus = (t) => (statusEl.textContent = t);

  overlay.querySelector("#ai-flashcards").addEventListener("click", () =>
    runAi("flashcards", editor, note, setStatus, async (result) => {
      await FlashcardSets.createWithCards(note.title || "Flashcards", noteId || null, result);
      toast(`Vytvořeno ${result.length} kartiček ve Studijních materiálech`, "success");
    })
  );
  overlay.querySelector("#ai-quiz").addEventListener("click", () =>
    runAi("quiz", editor, note, setStatus, async (result) => {
      await Quizzes.createWithQuestions(note.title || "Test", noteId || null, result);
      toast(`Vytvořen test s ${result.length} otázkami ve Studijních materiálech`, "success");
    })
  );
  overlay.querySelector("#ai-summary").addEventListener("click", () =>
    runAi("summary", editor, note, setStatus, async (result) => {
      openModal(
        `<div class="modal-header"><h3>Shrnutí</h3><button class="btn btn-icon btn-ghost" data-close>✕</button></div>
         <div class="note-render">${escapeHtml(result).replace(/\n/g, "<br>")}</div>
         <div class="modal-actions"><button class="btn" data-close>Zavřít</button></div>`
      );
    })
  );
}


function previewKind(mime = "") {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("text/")) return "text";
  return null;
}

async function openAttachmentPreview(f) {
  const kind = previewKind(f.mime_type);
  const { el: modalEl } = openModal(
    `<div class="modal-header"><h3 class="truncate">📎 ${escapeHtml(f.file_name)}</h3><button class="btn btn-icon btn-ghost" data-close>✕</button></div>
     <div class="att-preview-media" id="att-preview-mount"><div class="center" style="padding:30px;"><div class="spinner"></div></div></div>
     <div class="modal-actions">
       <button class="btn" data-close>Zavřít</button>
       <button class="btn btn-primary" id="att-download">⬇️ Stáhnout</button>
     </div>`,
    { large: true }
  );
  modalEl.querySelector("#att-download").addEventListener("click", async () => {
    try {
      const url = await Attachments.getDownloadUrl(f.file_path, { download: f.file_name });
      window.open(url, "_blank");
    } catch (e) {
      toastError(e);
    }
  });
  const mount = modalEl.querySelector("#att-preview-mount");
  try {
    const url = await Attachments.getDownloadUrl(f.file_path);
    if (kind === "image") mount.innerHTML = `<img src="${url}" alt="${escapeHtml(f.file_name)}" />`;
    else if (kind === "pdf") mount.innerHTML = `<iframe src="${url}"></iframe>`;
    else if (kind === "video") mount.innerHTML = `<video src="${url}" controls></video>`;
    else if (kind === "audio") mount.innerHTML = `<audio src="${url}" controls></audio>`;
    else if (kind === "text") {
      const text = await fetch(url).then((r) => r.text());
      mount.innerHTML = `<pre>${escapeHtml(text)}</pre>`;
    } else {
      mount.innerHTML = `<div class="faint">Pro tento typ souboru není náhled k dispozici — stáhni si ho tlačítkem níže.</div>`;
    }
  } catch (e) {
    mount.innerHTML = `<div class="faint">Náhled se nepodařilo načíst.</div>`;
    toastError(e);
  }
}

async function loadAttachments(modalEl, noteId) {
  const box = modalEl.querySelector("#attachments-list");
  if (!box) return;
  try {
    const files = await Attachments.list(noteId);
    if (!files.length) {
      box.innerHTML = `<div class="faint">Zatím žádné přílohy.</div>`;
      return;
    }
    box.innerHTML = files
      .map((f) => {
        const previewable = !!previewKind(f.mime_type);
        return `<div class="list-item">
          <div class="grow" ${previewable ? `data-preview="${f.id}" style="cursor:pointer;"` : ""}>
            <div class="title truncate">📎 ${escapeHtml(f.file_name)}</div>
            <div class="faint">${fmtSize(f.size_bytes)}${previewable ? " · klepni pro náhled" : ""}</div>
          </div>
          ${previewable ? `<button type="button" class="btn btn-sm" data-preview="${f.id}">👁 Náhled</button>` : ""}
          <button type="button" class="btn btn-sm" data-download="${f.id}">Stáhnout</button>
          <button type="button" class="btn btn-icon btn-ghost btn-sm" data-del-att="${f.id}">✕</button>
        </div>`;
      })
      .join("");
    box.querySelectorAll("[data-preview]").forEach((b) => {
      const f = files.find((x) => x.id === b.dataset.preview);
      b.addEventListener("click", () => openAttachmentPreview(f));
    });
    box.querySelectorAll("[data-download]").forEach((b) => {
      const f = files.find((x) => x.id === b.dataset.download);
      b.addEventListener("click", async () => {
        try {
          const url = await Attachments.getDownloadUrl(f.file_path, { download: f.file_name });
          window.open(url, "_blank");
        } catch (e) {
          toastError(e);
        }
      });
    });
    box.querySelectorAll("[data-del-att]").forEach((b) => {
      const f = files.find((x) => x.id === b.dataset.delAtt);
      b.addEventListener("click", async () => {
        if (await confirmDialog(`Smazat přílohu "${f.file_name}"?`)) {
          try {
            await Attachments.remove(f);
            loadAttachments(modalEl, noteId);
          } catch (e) {
            toastError(e);
          }
        }
      });
    });
  } catch (e) {
    box.innerHTML = `<div class="faint">Nepodařilo se načíst přílohy.</div>`;
    toastError(e);
  }
}

async function runAi(mode, editor, note, setStatus, onResult) {
  const noteContent = editor.getText().trim();
  if (!noteContent) {
    toast("Poznámka je prázdná.", "error");
    return;
  }
  setStatus("Generuji…");
  try {
    const { data, error } = await supabase.functions.invoke(AI_FUNCTION_NAME, {
      body: { mode, noteContent, title: note.title },
    });
    if (error) throw error;
    if (data.error) throw new Error(data.error);
    await onResult(data.result);
    setStatus("");
  } catch (e) {
    setStatus("");
    toastError(e.message || "AI generování selhalo. Zkontroluj, že je nastavený ANTHROPIC_API_KEY v Supabase.");
  }
}

async function renderStudyTab(container) {
  const main = container.querySelector("#notes-main");
  main.innerHTML = `<div class="center" style="padding:40px;"><div class="spinner"></div></div>`;
  try {
    const [sets, quizzes] = await Promise.all([FlashcardSets.listWithCards(), Quizzes.listWithQuestions()]);
    if (!sets.length && !quizzes.length) {
      main.innerHTML = `<div class="empty-state"><div class="big">✨</div>Zatím žádné vygenerované materiály. Otevři poznámku a vyzkoušej tlačítka ✨ Flashcards / Test.</div>`;
      return;
    }
    main.innerHTML = `
      <h3 style="margin-top:0;">Flashcards (${sets.length})</h3>
      <div class="grid grid-3" style="margin-bottom:22px;">
        ${sets
          .map(
            (s) => `<div class="card">
              <div style="display:flex;justify-content:space-between;">
                <b class="truncate">${escapeHtml(s.title)}</b>
                <button class="btn btn-icon btn-ghost btn-sm" data-del-set="${s.id}">✕</button>
              </div>
              <div class="faint">${s.flashcards.length} kartiček</div>
              <button class="btn btn-sm btn-primary" style="margin-top:8px;width:100%;" data-study-set="${s.id}">Studovat</button>
            </div>`
          )
          .join("")}
      </div>
      <h3>Testy (${quizzes.length})</h3>
      <div class="grid grid-3">
        ${quizzes
          .map(
            (q) => `<div class="card">
              <div style="display:flex;justify-content:space-between;">
                <b class="truncate">${escapeHtml(q.title)}</b>
                <button class="btn btn-icon btn-ghost btn-sm" data-del-quiz="${q.id}">✕</button>
              </div>
              <div class="faint">${q.quiz_questions.length} otázek</div>
              <button class="btn btn-sm btn-primary" style="margin-top:8px;width:100%;" data-take-quiz="${q.id}">Spustit test</button>
            </div>`
          )
          .join("")}
      </div>
    `;
    main.querySelectorAll("[data-study-set]").forEach((b) => {
      const set = sets.find((s) => s.id === b.dataset.studySet);
      b.addEventListener("click", () => studyFlashcards(set));
    });
    main.querySelectorAll("[data-take-quiz]").forEach((b) => {
      const quiz = quizzes.find((q) => q.id === b.dataset.takeQuiz);
      b.addEventListener("click", () => takeQuiz(quiz));
    });
    main.querySelectorAll("[data-del-set]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (await confirmDialog("Smazat sadu kartiček?")) {
          await FlashcardSets.remove(b.dataset.delSet);
          renderStudyTab(container);
        }
      })
    );
    main.querySelectorAll("[data-del-quiz]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (await confirmDialog("Smazat test?")) {
          await Quizzes.remove(b.dataset.delQuiz);
          renderStudyTab(container);
        }
      })
    );
  } catch (e) {
    toastError(e);
  }
}

function studyFlashcards(set) {
  const cards = [...set.flashcards].sort((a, b) => a.sort_order - b.sort_order);
  let i = 0;
  let showAnswer = false;
  const { el: modalEl } = openModal(`<div id="fc-mount"></div>`, { onMount: () => draw() });
  function draw() {
    const c = cards[i];
    modalEl.querySelector("#fc-mount").innerHTML = `
      <div class="modal-header"><h3>${escapeHtml(set.title)} (${i + 1}/${cards.length})</h3><button class="btn btn-icon btn-ghost" data-close>✕</button></div>
      <div class="card center" style="min-height:180px;font-size:16px;text-align:center;cursor:pointer;" id="fc-face">
        ${escapeHtml(showAnswer ? c.answer : c.question)}
      </div>
      <div class="faint center" style="margin-top:8px;">Klikni na kartu pro otočení</div>
      <div class="modal-actions">
        <button class="btn" id="fc-prev" ${i === 0 ? "disabled" : ""}>← Předchozí</button>
        <button class="btn btn-primary" id="fc-next" ${i === cards.length - 1 ? "disabled" : ""}>Další →</button>
      </div>`;
    modalEl.querySelector("[data-close]").addEventListener("click", () => modalEl.closest(".modal-backdrop").remove());
    modalEl.querySelector("#fc-face").addEventListener("click", () => {
      showAnswer = !showAnswer;
      draw();
    });
    modalEl.querySelector("#fc-prev").addEventListener("click", () => {
      i = Math.max(0, i - 1);
      showAnswer = false;
      draw();
    });
    modalEl.querySelector("#fc-next").addEventListener("click", () => {
      i = Math.min(cards.length - 1, i + 1);
      showAnswer = false;
      draw();
    });
  }
}

function takeQuiz(quiz) {
  const questions = [...quiz.quiz_questions].sort((a, b) => a.sort_order - b.sort_order);
  const answers = new Array(questions.length).fill(null);
  const { el: modalEl } = openModal(`<div id="qz-mount"></div>`, { large: true, onMount: () => draw() });
  function draw() {
    modalEl.querySelector("#qz-mount")?.remove();
    modalEl.innerHTML = `<div id="qz-mount"></div>`;
    modalEl.querySelector("#qz-mount").innerHTML = `
      <div class="modal-header"><h3>${escapeHtml(quiz.title)}</h3><button class="btn btn-icon btn-ghost" data-close>✕</button></div>
      <div class="list">
        ${questions
          .map(
            (q, qi) => `<div class="card">
              <div style="font-weight:600;margin-bottom:8px;">${qi + 1}. ${escapeHtml(q.question)}</div>
              ${q.choices
                .map(
                  (c, ci) => `<label style="display:flex;gap:8px;align-items:center;padding:4px 0;">
                    <input type="radio" name="q${qi}" value="${ci}" ${answers[qi] === ci ? "checked" : ""} />
                    ${escapeHtml(c)}
                  </label>`
                )
                .join("")}
            </div>`
          )
          .join("")}
      </div>
      <div class="modal-actions">
        <button class="btn" data-close>Zavřít</button>
        <button class="btn btn-primary" id="qz-submit">Vyhodnotit</button>
      </div>`;
    modalEl.querySelector("[data-close]").addEventListener("click", () => modalEl.closest(".modal-backdrop").remove());
    questions.forEach((_, qi) => {
      modalEl.querySelectorAll(`input[name="q${qi}"]`).forEach((r) =>
        r.addEventListener("change", () => (answers[qi] = Number(r.value)))
      );
    });
    modalEl.querySelector("#qz-submit").addEventListener("click", () => {
      let correct = 0;
      questions.forEach((q, qi) => {
        if (answers[qi] === q.correct_index) correct++;
      });
      toast(`Výsledek: ${correct}/${questions.length}`, correct === questions.length ? "success" : "");
    });
  }
}
