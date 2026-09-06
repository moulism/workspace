import { supabase } from "./supabaseClient.js";
import { getSession, onAuthChange, signInWithGoogle, signInWithEmail, signOut } from "./auth.js";
import { initTheme, cycleTheme } from "./theme.js";
import { toastError } from "./toast.js";

initTheme();

const ROUTES = {
  dashboard: { title: "Přehled", load: () => import("./views/dashboard.js") },
  notes: { title: "Poznámky", load: () => import("./views/notes.js") },
  calendar: { title: "Kalendář", load: () => import("./views/calendar.js") },
  todos: { title: "Úkoly", load: () => import("./views/todos.js") },
  goals: { title: "Cíle", load: () => import("./views/goals.js") },
  diary: { title: "Deník", load: () => import("./views/diary.js") },
  gym: { title: "Gym", load: () => import("./views/gym.js") },
  meals: { title: "Jídelníček", load: () => import("./views/meals.js") },
  recipes: { title: "Recepty", load: () => import("./views/recipes.js") },
  shopping: { title: "Nákupní seznam", load: () => import("./views/shopping.js") },
  settings: { title: "Nastavení", load: () => import("./views/settings.js") },
};

const authRoot = document.getElementById("auth-root");
const appRoot = document.getElementById("app");
const viewContainer = document.getElementById("view-container");
const viewTitle = document.getElementById("view-title");
const sidebar = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");

function renderAuthScreen() {
  appRoot.classList.add("hidden");
  authRoot.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="logo" style="width:44px;height:44px;border-radius:12px;background:var(--accent);color:var(--accent-contrast);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;margin:0 auto 14px;">W</div>
        <h1>Workspace</h1>
        <p>Tvůj osobní prostor na poznámky, úkoly, kalendář a další.</p>
        <button class="btn btn-primary" id="google-signin" style="width:100%;justify-content:center;">Přihlásit se přes Google</button>
        <div class="auth-divider"><span>nebo</span></div>
        <form id="email-signin-form">
          <input type="email" id="email-input" placeholder="tvuj@email.cz" required style="margin-bottom:8px;" />
          <button class="btn" type="submit" style="width:100%;justify-content:center;">Poslat přihlašovací odkaz emailem</button>
        </form>
        <div class="faint hidden" id="email-sent-msg" style="margin-top:10px;">
          Odkaz je na cestě — zkontroluj email a klikni na něj (může být ve spamu).
        </div>
      </div>
    </div>`;
  document.getElementById("google-signin").addEventListener("click", async () => {
    try {
      await signInWithGoogle();
    } catch (e) {
      toastError(e);
    }
  });
  document.getElementById("email-signin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email-input").value.trim();
    if (!email) return;
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      const { error } = await signInWithEmail(email);
      if (error) throw error;
      e.target.classList.add("hidden");
      document.getElementById("email-sent-msg").classList.remove("hidden");
    } catch (err) {
      toastError(err);
      btn.disabled = false;
    }
  });
}

async function renderApp(session) {
  authRoot.innerHTML = "";
  appRoot.classList.remove("hidden");
  const user = session.user;
  const email = user.email || "";
  document.getElementById("user-email").textContent = email;
  document.getElementById("user-avatar").textContent = email.slice(0, 1).toUpperCase();

  navigate(currentRoute() || "dashboard");
}

function currentRoute() {
  return location.hash.replace("#/", "") || null;
}

async function navigate(route) {
  if (!ROUTES[route]) route = "dashboard";
  location.hash = "#/" + route;
  document.querySelectorAll(".nav-item[data-route]").forEach((n) => {
    n.classList.toggle("active", n.dataset.route === route);
  });
  viewTitle.textContent = ROUTES[route].title;
  viewContainer.innerHTML = `<div class="center" style="padding:60px;"><div class="spinner"></div></div>`;
  closeSidebar();
  try {
    const mod = await ROUTES[route].load();
    viewContainer.innerHTML = "";
    await mod.render(viewContainer);
  } catch (e) {
    toastError(e);
    viewContainer.innerHTML = `<div class="empty-state"><div class="big">⚠️</div><div>Nepodařilo se načíst sekci.</div></div>`;
  }
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarBackdrop.classList.remove("show");
}

document.querySelectorAll(".nav-item[data-route]").forEach((n) => {
  n.addEventListener("click", () => navigate(n.dataset.route));
});
window.addEventListener("hashchange", () => navigate(currentRoute()));

document.getElementById("menu-btn").addEventListener("click", () => {
  sidebar.classList.toggle("open");
  sidebarBackdrop.classList.toggle("show");
});
sidebarBackdrop.addEventListener("click", closeSidebar);

document.getElementById("theme-btn").addEventListener("click", () => {
  const t = cycleTheme();
  toastQuiet(t);
});
function toastQuiet(theme) {
  const labels = { system: "Motiv: systémový", light: "Motiv: světlý", dark: "Motiv: tmavý" };
  import("./toast.js").then((m) => m.toast(labels[theme] || theme));
}

document.getElementById("signout-btn").addEventListener("click", async () => {
  await signOut();
});

onAuthChange((event, session) => {
  if (session) renderApp(session);
  else renderAuthScreen();
});

getSession().then((session) => {
  if (session) renderApp(session);
  else renderAuthScreen();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
