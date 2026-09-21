import { openImageZoomViewer, openModal } from "./ui.js";

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
  { cmd: "justifyLeft", label: "L", title: "Zarovnat vlevo" },
  { cmd: "justifyCenter", label: "C", title: "Na střed" },
  { cmd: "justifyRight", label: "R", title: "Zarovnat vpravo" },
  { cmd: "justifyFull", label: "J", title: "Do bloku" },
  { sep: true },
  { custom: "link", label: "🔗", title: "Vložit odkaz" },
  { cmd: "unlink", label: "🔗⌫", title: "Odebrat odkaz" },
  { sep: true },
  { cmd: "removeFormat", label: "⌫", title: "Vymazat formátování" },
];

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40];

// execCommand("fontSize") only understands the legacy 1–7 scale and produces
// <font size="N"> tags — we use size 7 as a marker, then swap it for a real
// <span style="font-size:Npx"> so the result is normal, portable HTML.
function applyFontSize(content, px) {
  content.focus();
  document.execCommand("fontSize", false, "7");
  content.querySelectorAll('font[size="7"]').forEach((el) => {
    const span = document.createElement("span");
    span.style.fontSize = px + "px";
    while (el.firstChild) span.appendChild(el.firstChild);
    el.replaceWith(span);
  });
}

function insertLink(content) {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed || !content.contains(sel.anchorNode)) {
    return;
  }
  const savedRange = sel.getRangeAt(0).cloneRange();
  openModal(
    `<div class="modal-header"><h3>Vložit odkaz</h3></div>
     <div class="field"><label>URL</label><input type="text" id="rt-link-url" placeholder="https://…" /></div>
     <div class="modal-actions">
       <button class="btn" type="button" data-close>Zrušit</button>
       <button class="btn btn-primary" type="button" id="rt-link-save">Vložit</button>
     </div>`,
    {
      onMount(modalEl, close) {
        const input = modalEl.querySelector("#rt-link-url");
        input.focus();
        const save = () => {
          let url = input.value.trim();
          if (!url) {
            close();
            return;
          }
          if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = "https://" + url;
          const s2 = window.getSelection();
          s2.removeAllRanges();
          s2.addRange(savedRange);
          document.execCommand("createLink", false, url);
          content.querySelectorAll("a[href]:not([target])").forEach((a) => {
            a.target = "_blank";
            a.rel = "noopener noreferrer";
          });
          close();
          content.focus();
        };
        modalEl.querySelector("#rt-link-save").addEventListener("click", save);
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        });
      },
    }
  );
}

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
      else if (t.custom === "link") {
        insertLink(content);
        return; // insertLink manages its own focus (modal steals it first)
      } else document.execCommand(t.cmd, false, t.value || null);
      content.focus();
    });
    toolbar.appendChild(btn);
  }

  // Velikost textu — jako v barvě/zvýrazňovači: tlačítko otevře popover
  // s předvolbami místo volného číselného vstupu, ať se to nerozjede na
  // desítky náhodných velikostí v jedné poznámce.
  const sizeWrap = document.createElement("div");
  sizeWrap.className = "editor-color-wrap";
  const sizeBtn = document.createElement("button");
  sizeBtn.type = "button";
  sizeBtn.title = "Velikost textu";
  sizeBtn.textContent = "Aa";
  sizeBtn.style.fontWeight = "700";
  sizeBtn.addEventListener("mousedown", (e) => e.preventDefault());
  const sizePopover = document.createElement("div");
  sizePopover.className = "editor-color-popover hidden";
  sizePopover.style.display = "flex";
  sizePopover.style.flexDirection = "column";
  sizePopover.style.gap = "2px";
  sizePopover.style.minWidth = "72px";
  sizePopover.innerHTML = FONT_SIZES.map(
    (px) => `<button type="button" class="size-swatch" data-size="${px}" style="text-align:left;padding:5px 8px;font-size:${Math.min(px, 20)}px;">${px}px</button>`
  ).join("");
  sizeBtn.addEventListener("click", () => sizePopover.classList.toggle("hidden"));
  sizePopover.querySelectorAll("button").forEach((b) => {
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => {
      applyFontSize(content, Number(b.dataset.size));
      sizePopover.classList.add("hidden");
      content.focus();
    });
  });
  document.addEventListener("click", (e) => {
    if (!sizeWrap.contains(e.target)) sizePopover.classList.add("hidden");
  });
  sizeWrap.appendChild(sizeBtn);
  sizeWrap.appendChild(sizePopover);
  toolbar.appendChild(sizeWrap);


  // Curated, contrast-safe text colors instead of a free-form color picker —
  // an arbitrary pick (e.g. white) reads fine in dark mode but disappears
  // entirely if the note is later viewed in light mode, and vice versa.
  const TEXT_COLORS = ["#dc4c3f", "#c98a1f", "#2f9e5b", "#0f766e", "#0284c7", "#4f46e5", "#a21caf", "#6b6a68"];

  const colorWrap = document.createElement("div");
  colorWrap.className = "editor-color-wrap";
  const colorBtn = document.createElement("button");
  colorBtn.type = "button";
  colorBtn.title = "Barva textu";
  colorBtn.textContent = "A";
  colorBtn.style.fontWeight = "700";
  colorBtn.addEventListener("mousedown", (e) => e.preventDefault());
  const colorPopover = document.createElement("div");
  colorPopover.className = "editor-color-popover hidden";
  colorPopover.innerHTML = `
    <button type="button" class="color-swatch color-swatch-reset" data-reset title="Výchozí barva (podle motivu)">⊘</button>
    ${TEXT_COLORS.map((c) => `<button type="button" class="color-swatch" data-color="${c}" style="background:${c};"></button>`).join("")}
  `;
  colorBtn.addEventListener("click", () => colorPopover.classList.toggle("hidden"));
  colorPopover.querySelectorAll("button").forEach((b) => b.addEventListener("mousedown", (e) => e.preventDefault()));
  colorPopover.querySelectorAll("[data-color]").forEach((b) =>
    b.addEventListener("click", () => {
      document.execCommand("foreColor", false, b.dataset.color);
      colorPopover.classList.add("hidden");
      content.focus();
    })
  );
  colorPopover.querySelector("[data-reset]").addEventListener("click", () => {
    document.execCommand("foreColor", false, getComputedStyle(content).color);
    colorPopover.classList.add("hidden");
    content.focus();
  });
  document.addEventListener("click", (e) => {
    if (!colorWrap.contains(e.target)) colorPopover.classList.add("hidden");
  });
  colorWrap.appendChild(colorBtn);
  colorWrap.appendChild(colorPopover);
  toolbar.appendChild(colorWrap);

  const HIGHLIGHT_COLORS = ["#fff59d", "#b9f6ca", "#a7d8ff", "#ffcdd2"];

  const highlightWrap = document.createElement("div");
  highlightWrap.className = "editor-color-wrap";
  const highlightBtn = document.createElement("button");
  highlightBtn.type = "button";
  highlightBtn.title = "Zvýraznit";
  highlightBtn.textContent = "🖍";
  highlightBtn.addEventListener("mousedown", (e) => e.preventDefault());
  const highlightPopover = document.createElement("div");
  highlightPopover.className = "editor-color-popover hidden";
  highlightPopover.innerHTML = `
    <button type="button" class="color-swatch color-swatch-reset" data-unhighlight title="Odebrat zvýraznění">⊘</button>
    ${HIGHLIGHT_COLORS.map((c) => `<button type="button" class="color-swatch" data-highlight="${c}" style="background:${c};"></button>`).join("")}
  `;
  highlightBtn.addEventListener("click", () => highlightPopover.classList.toggle("hidden"));
  highlightPopover.querySelectorAll("button").forEach((b) => b.addEventListener("mousedown", (e) => e.preventDefault()));
  highlightPopover.querySelectorAll("[data-highlight]").forEach((b) =>
    b.addEventListener("click", () => {
      document.execCommand("hiliteColor", false, b.dataset.highlight);
      highlightPopover.classList.add("hidden");
      content.focus();
    })
  );
  highlightPopover.querySelector("[data-unhighlight]").addEventListener("click", () => {
    // "transparent" is what actually clears a hiliteColor in every evergreen
    // browser; execCommand has no dedicated "remove highlight" command.
    document.execCommand("hiliteColor", false, "transparent");
    content.focus();
    highlightPopover.classList.add("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!highlightWrap.contains(e.target)) highlightPopover.classList.add("hidden");
  });
  highlightWrap.appendChild(highlightBtn);
  highlightWrap.appendChild(highlightPopover);
  toolbar.appendChild(highlightWrap);

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

  setupImageResize(container, content);

  return {
    getHtml: () => content.innerHTML,
    setHtml: (html) => (content.innerHTML = html || "<p><br></p>"),
    getText: () => content.innerText,
    el: content,
    onChange: (cb) => content.addEventListener("input", cb),
  };
}

/**
 * Click an image inside the editor to select it, then drag the little
 * corner handle to resize it (like Notion), or use the S/M/L/100% preset
 * buttons for quick sizing on touch devices. The resulting width is saved
 * as an inline style on the <img>, so it's part of getHtml() automatically.
 */
function setupImageResize(mount, content) {
  mount.style.position = mount.style.position || "relative";

  let img = null;
  let handle = null;
  let sizeBar = null;

  function cleanup() {
    handle?.remove();
    sizeBar?.remove();
    handle = null;
    sizeBar = null;
    img?.classList.remove("img-selected");
    img = null;
  }

  function place() {
    if (!img || !handle) return;
    const mr = mount.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    handle.style.left = `${ir.right - mr.left}px`;
    handle.style.top = `${ir.bottom - mr.top}px`;
    if (sizeBar) {
      sizeBar.style.left = `${ir.left - mr.left}px`;
      sizeBar.style.top = `${Math.max(0, ir.top - mr.top - 34)}px`;
    }
  }

  function setWidthPct(pct) {
    if (!img) return;
    const full = content.clientWidth || mount.clientWidth;
    img.style.width = `${Math.round(full * pct)}px`;
    img.style.height = "auto";
    place();
  }

  function select(target) {
    if (img === target) return;
    cleanup();
    img = target;
    img.classList.add("img-selected");

    handle = document.createElement("div");
    handle.className = "img-resize-handle";
    mount.appendChild(handle);

    sizeBar = document.createElement("div");
    sizeBar.className = "img-size-bar";
    sizeBar.innerHTML = `
      <button type="button" data-pct="0.25">S</button>
      <button type="button" data-pct="0.5">M</button>
      <button type="button" data-pct="0.75">L</button>
      <button type="button" data-pct="1">100%</button>
      <button type="button" data-zoom="1" title="Přiblížit obrázek">🔍</button>
    `;
    mount.appendChild(sizeBar);
    sizeBar.querySelectorAll("[data-pct]").forEach((b) =>
      b.addEventListener("mousedown", (e) => e.preventDefault())
    );
    sizeBar.querySelectorAll("[data-pct]").forEach((b) =>
      b.addEventListener("click", () => setWidthPct(Number(b.dataset.pct)))
    );
    sizeBar.querySelector("[data-zoom]").addEventListener("mousedown", (e) => e.preventDefault());
    sizeBar.querySelector("[data-zoom]").addEventListener("click", () => {
      if (img) openImageZoomViewer(img.src, img.alt || "");
    });

    place();

    let startX, startWidth;
    function onMove(e) {
      e.preventDefault();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const delta = clientX - startX;
      const min = 60;
      const max = content.clientWidth || mount.clientWidth;
      img.style.width = `${Math.min(max, Math.max(min, startWidth + delta))}px`;
      img.style.height = "auto";
      place();
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
    }
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = img.getBoundingClientRect().width;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
    handle.addEventListener(
      "touchstart",
      (e) => {
        startX = e.touches[0].clientX;
        startWidth = img.getBoundingClientRect().width;
        document.addEventListener("touchmove", onMove, { passive: false });
        document.addEventListener("touchend", onUp);
      },
      { passive: true }
    );
  }

  content.addEventListener("click", (e) => {
    if (e.target.tagName === "IMG") select(e.target);
    else cleanup();
  });
  content.addEventListener("dblclick", (e) => {
    if (e.target.tagName === "IMG") {
      e.preventDefault();
      openImageZoomViewer(e.target.src, e.target.alt || "");
    }
  });
  window.addEventListener("resize", place);
}
