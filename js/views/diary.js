import { Diary } from "../db.js";
import { escapeHtml, fmtDate, todayIso } from "../ui.js";
import { toast, toastError } from "../toast.js";
import { createEditor } from "../richtext.js";

const MOODS = ["😄", "🙂", "😐", "😔", "😠", "😴"];
let selectedDate = todayIso();

export async function render(container) {
  container.innerHTML = `
    <div style="display:flex;gap:18px;align-items:flex-start;">
      <div class="card" style="width:220px;flex-shrink:0;">
        <div class="faint" style="margin-bottom:8px;">POSLEDNÍ ZÁZNAMY</div>
        <div class="list" id="diary-entries-list"></div>
      </div>
      <div style="flex:1;min-width:0;">
        <div class="section-header">
          <div class="toolbar">
            <input type="date" id="diary-date" value="${selectedDate}" />
            <div id="mood-picker" class="toolbar"></div>
          </div>
          <button class="btn btn-primary" id="save-diary">Uložit</button>
        </div>
        <div id="diary-editor-mount"></div>
      </div>
    </div>
  `;

  container.querySelector("#diary-date").addEventListener("change", (e) => {
    selectedDate = e.target.value;
    loadEntry(container);
  });

  const moodPicker = container.querySelector("#mood-picker");
  moodPicker.innerHTML = MOODS.map((m) => `<button type="button" class="btn btn-icon" data-mood="${m}">${m}</button>`).join("");
  let selectedMood = null;
  moodPicker.querySelectorAll("[data-mood]").forEach((b) =>
    b.addEventListener("click", () => {
      selectedMood = selectedMood === b.dataset.mood ? null : b.dataset.mood;
      moodPicker.querySelectorAll("[data-mood]").forEach((x) => x.classList.toggle("btn-primary", x.dataset.mood === selectedMood));
    })
  );

  const editor = createEditor(container.querySelector("#diary-editor-mount"), "");

  container.querySelector("#save-diary").addEventListener("click", async () => {
    try {
      await Diary.upsert(selectedDate, { content: editor.getHtml(), mood: selectedMood });
      toast("Deníkový záznam uložen", "success");
      loadEntriesList(container);
    } catch (e) {
      toastError(e);
    }
  });

  async function loadEntry() {
    try {
      const entry = await Diary.getByDate(selectedDate);
      editor.setHtml(entry?.content || "");
      selectedMood = entry?.mood || null;
      moodPicker.querySelectorAll("[data-mood]").forEach((x) => x.classList.toggle("btn-primary", x.dataset.mood === selectedMood));
    } catch (e) {
      toastError(e);
    }
  }
  container.__loadEntry = loadEntry;

  await Promise.all([loadEntry(), loadEntriesList(container)]);
}

async function loadEntry(container) {
  await container.__loadEntry?.();
}

async function loadEntriesList(container) {
  const box = container.querySelector("#diary-entries-list");
  try {
    const entries = await Diary.list(30);
    if (!entries.length) {
      box.innerHTML = `<div class="faint">Zatím žádné záznamy.</div>`;
      return;
    }
    box.innerHTML = entries
      .map(
        (e) => `<div class="nav-item ${e.entry_date === selectedDate ? "active" : ""}" data-date="${e.entry_date}">
          ${e.mood ? e.mood + " " : ""}${fmtDate(e.entry_date, { year: "numeric" })}
        </div>`
      )
      .join("");
    box.querySelectorAll("[data-date]").forEach((n) =>
      n.addEventListener("click", () => {
        selectedDate = n.dataset.date;
        container.querySelector("#diary-date").value = selectedDate;
        loadEntry(container);
        loadEntriesList(container);
      })
    );
  } catch (e) {
    toastError(e);
  }
}
