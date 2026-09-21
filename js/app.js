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

// Setting location.hash below also fires the window's own "hashchange"
// event asynchronously, which is wired to call navigate() again — without
// this guard, every nav click ran the whole view render twice back to
// back. That race was the cause of finance entries (and anything else
// submitted from a view with an `await` before its form listeners are
// attached) getting saved twice per submit: the first render's listener
// ended up attached to the second render's DOM by the time it resumed.
let lastRoute = null;

async function navigate(route) {
  if (!ROUTES[route]) route = "dashboard";
  if (route === lastRoute) return;
  lastRoute = route;
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
  // getBoundingClientRect (not offsetTop) on purpose: offsetTop is relative
  // to the nearest *positioned* ancestor, and .nav-group is now
  // position:relative (for its console-module accent tab), which made
  // active.offsetTop resolve against the wrong element — the highlight
  // pill landed on whichever item happened to be near that same offset
  // inside ITS OWN group, not the actually active one. Rect math is
  // immune to which ancestor happens to be positioned.
  const navRect = sidebarNav.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  navHighlight.style.transform = `translateY(${activeRect.top - navRect.top}px)`;
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

// Boot splash: shown on every fresh load (it's static markup in index.html).
// Hidden once auth has resolved AND a minimum display time has passed, so
// it reads as an intentional boot sequence rather than a flash. The
// unconditional 5.5s fallback is a hard safety net — if anything above
// ever throws before resolving, the splash must never get stuck on screen.
// Dismissal itself is a short "pulled into the system" warp (see CSS:
// .boot-warp / .boot-warp-flash) rather than a plain fade, then the
// overlay is removed once the warp animation has finished.
let bootResolved = false;
function hideBootSplash() {
  const el = document.getElementById("boot-splash");
  if (!el || el.classList.contains("boot-warp-flash")) return;
  const box = el.querySelector(".boot-box");
  const grid = el.querySelector(".boot-grid");
  if (box) box.classList.add("boot-warp");
  if (grid) grid.classList.add("boot-warp");
  el.classList.add("boot-warp-flash");
  setTimeout(() => el.classList.add("boot-hide"), 650);
}
function markBootResolved() {
  if (bootResolved) return;
  bootResolved = true;
  // Give "WELCOME, MASTER M" (appears at ~1.05s) real time on screen
  // before the warp-out starts — long enough to actually read it.
  setTimeout(hideBootSplash, 2600);
}
setTimeout(hideBootSplash, 5500);

// Cursor-follow "spotlight" on whatever .card is under the pointer — a
// soft glow that tracks the mouse, driven by --spot-x/--spot-y (read by
// the .card background in styles.css). Delegated on document + rAF
// throttled so it costs nothing when the pointer isn't over a card, and
// touches every card in every view without any per-view code.
let spotTicking = false;
document.addEventListener(
  "pointermove",
  (e) => {
    if (spotTicking) return;
    spotTicking = true;
    const x = e.clientX;
    const y = e.clientY;
    const target = e.target;
    requestAnimationFrame(() => {
      spotTicking = false;
      const card = target?.closest?.(".card");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--spot-x", `${((x - r.left) / r.width) * 100}%`);
      card.style.setProperty("--spot-y", `${((y - r.top) / r.height) * 100}%`);
    });
  },
  { passive: true }
);

// Live HUD clock (sidebar status rail + topbar) — small touch, but it's
// what makes the console feel alive rather than a static skin.
function updateHudClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const text = `${hh}:${mm}:${ss}`;
  document.querySelectorAll(".hud-clock").forEach((el) => { el.textContent = text; });
}
updateHudClock();
setInterval(updateHudClock, 1000);

onAuthChange((event, session) => {
  if (session) renderApp(session);
  else renderAuthScreen();
  markBootResolved();
});

getSession()
  .then((session) => {
    if (session) renderApp(session);
    else renderAuthScreen();
  })
  .catch(() => renderAuthScreen())
  .finally(markBootResolved);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
