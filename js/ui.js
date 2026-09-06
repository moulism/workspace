export function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function fmtDate(d, opts = {}) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("cs-CZ", { day: "numeric", month: "short", ...opts });
}

export function fmtTime(d) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTime(d) {
  if (!d) return "";
  return `${fmtDate(d)} ${fmtTime(d)}`;
}

export function todayIso() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export const CATEGORY_COLORS = {
  school: "#4f46e5",
  work: "#0f766e",
  gym: "#dc4c3f",
  personal: "#c98a1f",
  other: "#6b6a68",
};

export function openModal(innerHtml, { large = false, onMount } = {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal ${large ? "modal-lg" : ""}">${innerHtml}</div>`;
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", escHandler);
  function escHandler(e) {
    if (e.key === "Escape") close();
  }
  function close() {
    document.removeEventListener("keydown", escHandler);
    backdrop.remove();
  }
  document.body.appendChild(backdrop);
  const modalEl = backdrop.querySelector(".modal");
  modalEl.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  if (onMount) onMount(modalEl, close);
  return { close, el: modalEl };
}

export function confirmDialog(message) {
  return new Promise((resolve) => {
    openModal(
      `<div class="modal-header"><h3>Potvrdit</h3></div>
       <p class="muted">${escapeHtml(message)}</p>
       <div class="modal-actions">
         <button class="btn" data-close data-act="cancel">Zrušit</button>
         <button class="btn btn-danger" data-act="ok">Potvrdit</button>
       </div>`,
      {
        onMount(modalEl, close) {
          modalEl.querySelector('[data-act="ok"]').addEventListener("click", () => {
            close();
            resolve(true);
          });
          modalEl.querySelector('[data-act="cancel"]').addEventListener("click", () => resolve(false));
        },
      }
    );
  });
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}
