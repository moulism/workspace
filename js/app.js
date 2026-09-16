import { supabase } from "./supabaseClient.js";
import { getSession, onAuthChange, signInWithGoogle, signInWithEmail, signInWithPassword, signUpWithPassword, signOut } from "./auth.js";
import { initTheme, cycleTheme } from "./theme.js";
import { toastError } from "./toast.js";

initTheme();

const ROUTES = {
  dashboard: { title: "Přehled", load: () => import("./views/dashboard.js") },
  notes: { title: "Poznámky", load: () => import("./views/notes.js") },
  calendar: { title: "Kalendář", load: () => import("./views/calendar.js") },
  todos: { title: "Úkoly", load: () => import("./views/todos.js") },
  goals: { title: "Cíle", load: () => import("./views/goals.js") },
  journal: { title: "Successful Journal", load: () => import("./views/journal.js") },
  diary: { title: "Deník", load: () => import("./views/diary.js") },
  gym: { title: "Gym", load: () => import("./views/gym.js") },
  meals: { title: "Jídelníček", load: () => import("./views/meals.js") },
  recipes: { title: "Recepty", load: () => import("./views/recipes.js") },
  shopping: { title: "Nákupní seznam", load: () => import("./views/shopping.js") },
  finance: { title: "Finance", load: () => import("./views/finance.js") },
  settings: { title: "Nastavení", load: () => import("./views/settings.js") },
};

const authRoot = document.getElementById("auth-root");
const appRoot = document.getElementById("app");
const viewContainer = document.getElementById("view-container");
const viewTitle = document.getElementById("view-title");
const sidebar = document.getElementById("sidebar");
const sidebarNav = document.getElementById("sidebar-nav");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const navHighlight = document.getElementById("nav-highlight");
const collapseBtn = document.getElementById("sidebar-collapse-btn");

const AUTH_ERROR_CZ = {
  "Invalid login credentials": "Špatný email nebo heslo.",
  "User already registered": "S tímto emailem už účet existuje — přepni na „Přihlásit se“.",
  "Password should be at least 6 characters": "Heslo musí mít aspoň 6 znaků.",
  "Email not confirmed": "Email ještě není potvrzený — zkontroluj schránku.",
};
function authErrorMessage(e) {
  return AUTH_ERROR_CZ[e?.message] || e?.message || "Něco se nepovedlo.";
}

let authMode = "signin"; // "signin" | "signup"

function renderAuthScreen() {
  appRoot.classList.add("hidden");
  authRoot.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="logo" style="width:52px;height:52px;border-radius:14px;overflow:hidden;margin:0 auto 14px;box-shadow:var(--shadow);">
          <img src="icons/icon-192.png" alt="" style="width:100%;height:100%;object-fit:cover;" />
        </div>
        <h1>Workspace</h1>
        <p>Tvůj osobní prostor na poznámky, úkoly, kalendář a další.</p>
        <button class="btn btn-primary" id="google-signin" style="width:100%;justify-content:center;">Přihlásit se přes Google</button>
        <div class="auth-divider"><span>nebo emailem a heslem</span></div>
        <div class="toolbar" style="justify-content:center;margin-bottom:12px;">
          <button type="button" class="chip ${authMode === "signin" ? "active" : ""}" data-auth-mode="signin">Přihlásit se</button>
          <button type="button" class="chip ${authMode === "signup" ? "active" : ""}" data-auth-mode="signup">Vytvořit účet</button>
        </div>
        <form id="password-auth-form">
          <input type="email" id="auth-email" placeholder="tvuj@email.cz" required autocomplete="username" style="margin-bottom:8px;" />
          <div class="row" style="gap:6px;margin-bottom:8px;">
            <input type="password" id="auth-password" placeholder="Heslo" required minlength="6" autocomplete="${authMode === "signup" ? "new-password" : "current-password"}" style="flex:1;" />
            <button type="button" class="btn btn-icon" id="auth-pw-toggle" style="flex:0 0 auto;" title="Zobrazit/skrýt heslo">👁</button>
          </div>
          <button class="btn btn-primary" type="submit" id="auth-submit-btn" style="width:100%;justify-content:center;">
            ${authMode === "signup" ? "Vytvořit účet" : "Přihlásit se"}
          </button>
        </form>
        <div class="faint hidden" id="auth-confirm-msg" style="margin-top:10px;"></div>
        <div class="auth-divider"><span>nebo</span></div>
        <form id="email-signin-form">
          <input type="email" id="email-input" placeholder="tvuj@email.cz" required style="margin-bottom:8px;" />
          <button class="btn btn-ghost btn-sm" type="submit" style="width:100%;justify-content:center;">Poslat přihlašovací odkaz emailem</button>
        </form>
        <div class="faint hidden" id="email-sent-msg" style="margin-top:10px;">
          Odkaz je na cestě — zkontroluj email a klikni na něj (může být ve spamu). Pozn.: odkaz se otevře
          v prohlížeči, ne v appce na ploše — pro přihlášení přímo v appce použij nahoře email + heslo.
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

  authRoot.querySelectorAll("[data-auth-mode]").forEach((b) =>
    b.addEventListener("click", () => {
      authMode = b.dataset.authMode;
      renderAuthScreen();
    })
  );

  document.getElementById("auth-pw-toggle").addEventListener("click", () => {
    const input = document.getElementById("auth-password");
    input.type = input.type === "password" ? "text" : "password";
  });

  document.getElementById("password-auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    if (!email || !password) return;
    const btn = document.getElementById("auth-submit-btn");
    btn.disabled = true;
    try {
      if (authMode === "signup") {
        const { data, error } = await signUpWithPassword(email, password);
        if (error) throw error;
        if (data.session) {
          // Confirm-email is off on this project — signed in immediately.
          return;
        }
        e.target.classList.add("hidden");
        const msg = document.getElementById("auth-confirm-msg");
        msg.textContent = "Účet vytvořen — potvrď ho kliknutím na odkaz, který ti přišel na email, pak se přihlas heslem výše.";
        msg.classList.remove("hidden");
      } else {
        const { error } = await signInWithPassword(email, password);
        if (error) throw error;
      }
    } catch (err) {
      toastError(authErrorMessage(err));
      btn.disabled = false;
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

let navigating = false;

async function navigate(route) {
  if (!ROUTES[route]) route = "dashboard";
  location.hash = "#/" + route;

  document.querySelectorAll(".nav-item[data-route], .bn-item[data-route]").forEach((n) => {
    n.classList.toggle("active", n.dataset.route === route);
  });
  moveHighlight();

  viewTitle.textContent = ROUTES[route].title;
  closeSidebar();

  // Fade/slide the outgoing view out, then the incoming view in — a light
  // page-transition so switching sections feels less like a hard swap.
  viewContainer.classList.add("view-leave");
  await sleep(90);
  viewContainer.innerHTML = `<div class="center" style="padding:60px;"><div class="spinner"></div></div>`;
  try {
    const mod = await ROUTES[route].load();
    viewContainer.innerHTML = "";
    await mod.render(viewContainer);
  } catch (e) {
    toastError(e);
    viewContainer.innerHTML = `<div class="empty-state"><div class="big">⚠️</div><div>Nepodařilo se načíst sekci.</div></div>`;
  }
  viewContainer.classList.remove("view-leave");
  viewContainer.classList.add("view-enter");
  requestAnimationFrame(() => {
    viewContainer.classList.add("view-enter-active");
    setTimeout(() => viewContainer.classList.remove("view-enter", "view-enter-active"), 260);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function moveHighlight() {
  if (!navHighlight || !sidebarNav) return;
  const active = sidebarNav.querySelector(".nav-item.active");
  if (!active) {
    navHighlight.style.opacity = "0";
    return;
  }
  navHighlight.style.opacity = "1";
  navHighlight.style.transform = `translateY(${active.offsetTop}px)`;
  navHighlight.style.height = active.offsetHeight + "px";
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarBackdrop.classList.remove("show");
}
function openSidebar() {
  sidebar.classList.add("open");
  sidebarBackdrop.classList.add("show");
}

document.querySelectorAll(".nav-item[data-route], .bn-item[data-route]").forEach((n) => {
  n.addEventListener("click", () => navigate(n.dataset.route));
});
window.addEventListener("hashchange", () => navigate(currentRoute()));
window.addEventListener("resize", moveHighlight);

const menuBtn = document.getElementById("menu-btn");
menuBtn?.addEventListener("click", () => {
  if (sidebar.classList.contains("open")) closeSidebar();
  else openSidebar();
});
document.getElementById("bn-more")?.addEventListener("click", () => {
  if (sidebar.classList.contains("open")) closeSidebar();
  else openSidebar();
});
sidebarBackdrop.addEventListener("click", closeSidebar);

collapseBtn?.addEventListener("click", () => {
  const collapsed = document.documentElement.getAttribute("data-sidebar") === "collapsed";
  if (collapsed) {
    document.documentElement.removeAttribute("data-sidebar");
    try { localStorage.removeItem("pw-sidebar-collapsed"); } catch {}
  } else {
    document.documentElement.setAttribute("data-sidebar", "collapsed");
    try { localStorage.setItem("pw-sidebar-collapsed", "1"); } catch {}
  }
  setTimeout(moveHighlight, 220);
});

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
