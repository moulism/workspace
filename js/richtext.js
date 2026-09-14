const TOOLS = [
  { cmd: "bold", label: "<b>B</b>", title: "Tučně (Ctrl+B)" },
  { cmd: "italic", label: "<i>I</i>", title: "Kurzíva (Ctrl+I)" },
  { cmd: "underline", label: "<u>U</u>", title: "Podtržení" },
  { cmd: "strikeThrough", label: "<s>S</s>", title: "Přeškrtnuté" },
  { sep: true },
  { cmd: "formatBlock", value: "h2", label: "H1", title: "Nadpis 1" },
  { cmd: "formatBlock", value: "h3", label: "H2", title: "Nadpis 2" },
  { cmd: "formatBlock", value: "p", label: "¶", title: "Odstavec" },
  { sep: true },
  { cmd: "insertUnorderedList", label: "•", title: "Odrážky" },
  { cmd: "insertOrderedList", label: "1.", title: "Číslovaný seznam" },
  { custom: "checklist", label: "☑", title: "Zaškrtávací seznam (jako v Notion)" },
  { cmd: "formatBlock", value: "blockquote", label: "❝", title: "Citace" },
  { custom: "divider", label: "―", title: "Oddělovač" },
  { sep: true },
  { cmd: "removeFormat", label: "⌫", title: "Vymazat formátování" },
];

function insertChecklistItem() {
  document.execCommand(
    "insertHTML",
    false,
    `<div class="todo-line"><input type="checkbox" /><span>&nbsp;Nová položka</span></div><p><br></p>`
  );
}

function insertDivider() {
  document.execCommand("insertHTML", false, `<hr class="note-divider" /><p><br></p>`);
}

export function createEditor(container, initialHtml = "") {
  container.innerHTML = "";
  const toolbar = document.createElement("div");
  toolbar.className = "editor-toolbar";

  for (const t of TOOLS) {
    if (t.sep) {
      const sep = document.createElement("span");
      sep.style.width = "1px";
      sep.style.background = "var(--border)";
      sep.style.margin = "2px 4px";
      toolbar.appendChild(sep);
      continue;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = t.label;
    btn.title = t.title;
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      if (t.custom === "checklist") insertChecklistItem();
      else if (t.custom === "divider") insertDivider();
      else document.execCommand(t.cmd, false, t.value || null);
      content.focus();
    });
    toolbar.appendChild(btn);
  }

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.title = "Barva textu";
  colorInput.addEventListener("input", () => {
    document.execCommand("foreColor", false, colorInput.value);
    content.focus();
  });
  toolbar.appendChild(colorInput);

  const highlightBtn = document.createElement("button");
  highlightBtn.type = "button";
  highlightBtn.textContent = "🖍";
  highlightBtn.title = "Zvýraznit";
  highlightBtn.addEventListener("mousedown", (e) => e.preventDefault());
  highlightBtn.addEventListener("click", () => {
    document.execCommand("hiliteColor", false, "#fff59d");
    content.focus();
  });
  toolbar.appendChild(highlightBtn);

  const content = document.createElement("div");
  content.className = "editor-content";
  content.contentEditable = "true";
  content.innerHTML = initialHtml || "<p><br></p>";

  // Typing "[] " or "[ ] " at the start of a line converts it into a checklist
  // item, similar to Notion's markdown-style shortcuts.
  content.addEventListener("keydown", (e) => {
    if (e.key !== " ") return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    const text = node.textContent || "";
    const before = text.slice(0, range.startOffset);
    if (/^\[\s?\]$/.test(before.trim())) {
      e.preventDefault();
      node.textContent = text.slice(range.startOffset);
      insertChecklistItem();
    }
  });

  container.appendChild(toolbar);
  container.appendChild(content);

  return {
    getHtml: () => content.innerHTML,
    setHtml: (html) => (content.innerHTML = html || "<p><br></p>"),
    getText: () => content.innerText,
    el: content,
    onChange: (cb) => content.addEventListener("input", cb),
  };
}
