export function toast(message, type = "") {
  let host = document.getElementById("toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`.trim();
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

export function toastError(err) {
  console.error(err);
  const msg = typeof err === "string" ? err : err?.message || "Something went wrong";
  toast(msg, "error");
}
