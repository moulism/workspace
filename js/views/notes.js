import { Notes, Folders, FlashcardSets, Quizzes, Attachments } from "../db.js";
import { supabase } from "../supabaseClient.js";
import { AI_FUNCTION_NAME } from "../config.js";
import { escapeHtml, openModal, confirmDialog, fmtDate } from "../ui.js";
import { toast, toastError } from "../toast.js";
import { createEditor } from "../richtext.js";
import { exportNoteToPdf } from "../pdfExport.js";

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

let state = { area: "school", folderId: null, search: "", tab: "notes" };

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
    <div style="display:flex;gap:18px;align-items:flex-start;">
      <div class="card" style="width:190px;flex-shrink:0;" id="folder-panel"></div>
      <div style="flex:1;min-width:0;" id="notes-main"></div>
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

  await renderFolderPanel(container);
  if (state.tab === "study") await renderStudyTab(container);
  else await loadNotesList(container);
}

async function renderFolderPanel(container) {
  const panel = container.querySelector("#folder-panel");
  try {
    const folders = await Folders.list(state.area);
    panel.innerHTML = `
      <div class="faint" style="margin-bottom:8px;">SLOŽKY</div>
      <div class="nav-item ${!state.folderId ? "active" : ""}" data-folder="">Vše</div>
      ${folders
        .map(
          (f) => `<div class="nav-item ${state.folderId === f.id ? "active" : ""}" data-folder="${f.id}">
            <span class="dot" style="background:${f.color || "#888"}"></span> ${escapeHtml(f.name)}
          </div>`
        )
        .join("")}
      <button class="btn btn-ghost btn-sm" id="add-folder-btn" style="margin-top:8px;width:100%;">+ Složka</button>
    `;
    panel.querySelectorAll("[data-folder]").forEach((n) =>
      n.addEventListener("click", () => {
        state.folderId = n.dataset.folder || null;
        loadNotesList(container);
        panel.querySelectorAll("[data-folder]").forEach((x) => x.classList.remove("active"));
        n.classList.add("active");
      })
    );
    panel.querySelector("#add-folder-btn").addEventListener("click", () => addFolder(container));
  } catch (e) {
    toastError(e);
  }
}

async function addFolder(container) {
  const name = prompt("Název složky:");
  if (!name) return;
  try {
    await Folders.create({ area: state.area, name });
    render(container);
  } catch (e) {
    toastError(e);
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
            <div class="title truncate" style="font-weight:600;">${n.pinned ? "📌 " : ""}${escapeHtml(n.title)}</div>
            <div class="faint">${fmtDate(n.updated_at)}</div>
          </div>
          <div class="faint truncate" style="margin-top:6px;max-height:40px;overflow:hidden;">${escapeHtml((n.content || "").replace(/<[^>]+>/g, " ")).slice(0, 140)}</div>
          ${n.tags?.length ? `<div style="margin-top:8px;display:flex;gap:5px;flex-wrap:wrap;">${n.tags.map((t) => `<span class="pill">#${escapeHtml(t)}</span>`).join("")}</div>` : ""}
        </div>`
      )
      .join("")}</div>`;
    main.querySelectorAll(".note-card").forEach((c) => c.addEventListener("click", () => openNoteEditor(container, c.dataset.id)));
  } catch (e) {
    toastError(e);
  }
}

async function openNoteEditor(container, noteId) {
  let note = noteId
    ? await Notes.get(noteId).catch((e) => {
        toastError(e);
        return null;
      })
    : { title: "", content: "", tags: [], area: state.area, folder_id: state.folderId, pinned: false };
  if (!note) return;

  const { el: modalEl, close } = openModal(
    `<div class="modal-header">
       <input type="text" id="note-title" placeholder="Název poznámky" style="font-size:17px;font-weight:600;border:none;padding:4px 0;" value="${escapeHtml(note.title)}" />
       <button class="btn btn-icon btn-ghost" data-close>✕</button>
     </div>
     <div id="note-editor-mount"></div>
     <div class="field" style="margin-top:10px;">
       <label>Štítky (oddělené čárkou)</label>
       <input type="text" id="note-tags" value="${escapeHtml((note.tags || []).join(", "))}" />
     </div>
     <div class="toolbar" style="margin-top:10px;">
       <button class="btn btn-sm" id="ai-flashcards">✨ Flashcards</button>
       <button class="btn btn-sm" id="ai-quiz">✨ Test</button>
       <button class="btn btn-sm" id="ai-summary">✨ Shrnutí</button>
       <button class="btn btn-sm" id="export-pdf">📄 Export do PDF</button>
       <span class="faint" id="ai-status"></span>
     </div>
     <div style="margin-top:16px;">
       <label>Přílohy</label>
       ${
         noteId
           ? `<div class="list" id="attachments-list" style="margin-bottom:8px;"></div>
              <input type="file" id="attachment-input" />`
           : `<div class="faint">Nejdřív poznámku ulož, pak k ní budeš moct přidat soubory.</div>`
       }
     </div>
     <div class="modal-actions">
       ${noteId ? `<button class="btn btn-danger" id="delete-note" style="margin-right:auto;">Smazat</button>` : ""}
       <button class="btn" data-close>Zavřít</button>
       <button class="btn btn-primary" id="save-note">Uložit</button>
     </div>`,
    { large: true }
  );

  const editor = createEditor(modalEl.querySelector("#note-editor-mount"), note.content);

  modalEl.querySelector("#export-pdf").addEventListener("click", () => {
    const title = modalEl.querySelector("#note-title").value.trim() || "Bez názvu";
    exportNoteToPdf(title, editor.getHtml());
  });

  if (noteId) {
    loadAttachments(modalEl, noteId);
    modalEl.querySelector("#attachment-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await Attachments.upload(noteId, file);
        e.target.value = "";
        loadAttachments(modalEl, noteId);
      } catch (err) {
        toastError(err);
      }
    });
  }

  modalEl.querySelector("#save-note").addEventListener("click", async () => {
    const title = modalEl.querySelector("#note-title").value.trim() || "Bez názvu";
    const tags = modalEl
      .querySelector("#note-tags")
      .value.split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const fields = { title, content: editor.getHtml(), tags, area: note.area, folder_id: note.folder_id };
    try {
      if (noteId) await Notes.update(noteId, fields);
      else await Notes.create(fields);
      toast("Poznámka uložena", "success");
      close();
      render(container);
    } catch (e) {
      toastError(e);
    }
  });

  if (noteId) {
    modalEl.querySelector("#delete-note").addEventListener("click", async () => {
      if (await confirmDialog("Smazat tuto poznámku?")) {
        await Notes.remove(noteId);
        close();
        render(container);
      }
    });
  }

  const statusEl = modalEl.querySelector("#ai-status");
  const setStatus = (t) => (statusEl.textContent = t);

  modalEl.querySelector("#ai-flashcards").addEventListener("click", () =>
    runAi("flashcards", editor, note, setStatus, async (result) => {
      await FlashcardSets.createWithCards(note.title || "Flashcards", noteId || null, result);
      toast(`Vytvořeno ${result.length} kartiček ve Studijních materiálech`, "success");
    })
  );
  modalEl.querySelector("#ai-quiz").addEventListener("click", () =>
    runAi("quiz", editor, note, setStatus, async (result) => {
      await Quizzes.createWithQuestions(note.title || "Test", noteId || null, result);
      toast(`Vytvořen test s ${result.length} otázkami ve Studijních materiálech`, "success");
    })
  );
  modalEl.querySelector("#ai-summary").addEventListener("click", () =>
    runAi("summary", editor, note, setStatus, async (result) => {
      openModal(
        `<div class="modal-header"><h3>Shrnutí</h3><button class="btn btn-icon btn-ghost" data-close>✕</button></div>
         <div class="note-render">${escapeHtml(result).replace(/\n/g, "<br>")}</div>
         <div class="modal-actions"><button class="btn" data-close>Zavřít</button></div>`
      );
    })
  );
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
      .map(
        (f) => `<div class="list-item">
          <div class="grow">
            <div class="title truncate">📎 ${escapeHtml(f.file_name)}</div>
            <div class="faint">${fmtSize(f.size_bytes)}</div>
          </div>
          <button type="button" class="btn btn-sm" data-download="${f.id}">Stáhnout</button>
          <button type="button" class="btn btn-icon btn-ghost btn-sm" data-del-att="${f.id}">✕</button>
        </div>`
      )
      .join("");
    box.querySelectorAll("[data-download]").forEach((b) => {
      const f = files.find((x) => x.id === b.dataset.download);
      b.addEventListener("click", async () => {
        try {
          const url = await Attachments.getDownloadUrl(f.file_path);
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
