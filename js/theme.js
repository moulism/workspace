const KEY = "pw-theme"; // 'system' | 'light' | 'dark'

export function getStoredTheme() {
  try { return localStorage.getItem(KEY) || "system"; } catch { return "system"; }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light") root.setAttribute("data-theme", "light");
  else if (theme === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
  try { localStorage.setItem(KEY, theme); } catch {}
}

export function initTheme() {
  applyTheme(getStoredTheme());
}

export function cycleTheme() {
  const order = ["system", "light", "dark"];
  const cur = getStoredTheme();
  const next = order[(order.indexOf(cur) + 1) % order.length];
  applyTheme(next);
  return next;
}
