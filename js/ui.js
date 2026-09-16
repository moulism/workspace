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

export function openImageZoomViewer(src, alt = "") {
  const overlay = document.createElement("div");
  overlay.className = "image-zoom-overlay";
  overlay.innerHTML = `
    <button type="button" class="image-zoom-close" aria-label="Zavřít">✕</button>
    <img src="${src}" alt="${escapeHtml(alt)}" draggable="false" />
  `;
  document.body.appendChild(overlay);
  const imgEl = overlay.querySelector("img");

  let scale = 1, tx = 0, ty = 0;
  const pointers = new Map();
  let pinchStartDist = 0, pinchStartScale = 1;
  let panStart = null;
  let lastTap = 0;

  function apply() {
    imgEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function resetZoom() {
    scale = 1; tx = 0; ty = 0;
    apply();
  }

  function dist(pts) {
    const [a, b] = pts;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }

  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  document.addEventListener("keydown", onKey);
  overlay.querySelector(".image-zoom-close").addEventListener("click", close);

  function zoomAt(newScale, clientX, clientY) {
    const rect = imgEl.getBoundingClientRect();
    const prevScale = scale;
    newScale = Math.min(4, Math.max(1, newScale));
    const ratio = newScale / prevScale;
    const originX = clientX - (rect.left + rect.width / 2);
    const originY = clientY - (rect.top + rect.height / 2);
    tx = tx + originX * (1 - ratio);
    ty = ty + originY * (1 - ratio);
    scale = newScale;
    if (scale <= 1.01) {
      tx = 0;
      ty = 0;
      scale = 1;
    }
    apply();
  }

  function onPointerDown(e) {
    overlay.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinchStartDist = dist(pts);
      pinchStartScale = scale;
      panStart = null;
    } else if (pointers.size === 1) {
      if (scale > 1) {
        panStart = { x: e.clientX, y: e.clientY, tx, ty };
      }
      if (e.target === imgEl) {
        const now = Date.now();
        if (now - lastTap < 320) {
          if (scale > 1) resetZoom();
          else zoomAt(2.5, e.clientX, e.clientY);
          lastTap = 0;
        } else {
          lastTap = now;
        }
      }
    }
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      e.preventDefault();
      const pts = [...pointers.values()];
      const d = dist(pts);
      if (pinchStartDist > 0) {
        const newScale = Math.min(4, Math.max(1, pinchStartScale * (d / pinchStartDist)));
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        zoomAt(newScale, mid.x, mid.y);
      }
    } else if (pointers.size === 1 && panStart) {
      e.preventDefault();
      const p = [...pointers.values()][0];
      tx = panStart.tx + (p.x - panStart.x);
      ty = panStart.ty + (p.y - panStart.y);
      apply();
    }
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStartDist = 0;
    if (pointers.size === 0) panStart = null;
  }

  overlay.addEventListener("pointerdown", onPointerDown);
  overlay.addEventListener("pointermove", onPointerMove, { passive: false });
  overlay.addEventListener("pointerup", onPointerUp);
  overlay.addEventListener("pointercancel", onPointerUp);

  overlay.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.0015;
      zoomAt(scale * (1 + delta), e.clientX, e.clientY);
    },
    { passive: false }
  );

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  return { close };
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
