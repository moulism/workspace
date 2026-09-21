import { supabase } from "../supabaseClient.js";
import { Settings } from "../db.js";
import { signInWithGoogle, signOut, getSession, updatePassword } from "../auth.js";
import { hasGoogle } from "../google.js";
import { getStoredTheme, applyTheme } from "../theme.js";
import { toast, toastError } from "../toast.js";

export async function render(container) {
  const session = await getSession();
  const user = session?.user;
  const theme = getStoredTheme();

  container.innerHTML = `
    <div class="card" style="margin-bottom:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
      <div style="width:56px;height:56px;border-radius:50%;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:22px;background:var(--bg-hover);flex-shrink:0;">🦇</div>
      <div class="grow" style="min-width:200px;">
        <div style="font-family:var(--font-display);font-size:18px;letter-spacing:.03em;">MASTER M</div>
        <div class="faint">${user?.email || ""}</div>
      </div>
      <button class="btn btn-danger btn-sm" id="signout">Odhlásit se</button>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h3 style="margin-top:0;">🔑 Heslo</h3>
        <p class="faint" style="margin-bottom:10px;">
          Nastav si heslo, ať se dá appka na ploše otevřít a přihlásit přímo v ní — přihlašovací odkaz emailem
          se totiž vždy otevře v prohlížeči, ne v nainstalované appce. Z bezpečnostních důvodů nejde zobrazit
          heslo, které už máš nastavené — jen ho nastavit nové.
        </p>
        <div class="field">
          <label>Nové heslo</label>
          <div class="row" style="gap:6px;">
            <input type="password" id="new-password" minlength="6" placeholder="aspoň 6 znaků" style="flex:1;" />
            <button type="button" class="btn btn-icon" id="pw-toggle" title="Zobrazit/skrýt" style="flex:0 0 auto;">👁</button>
          </div>
        </div>
        <div class="field">
          <label>Potvrdit nové heslo</label>
          <input type="password" id="new-password-confirm" minlength="6" placeholder="zopakuj heslo" />
        </div>
        <button class="btn btn-primary btn-sm" id="save-password">Uložit heslo</button>
        <div class="faint" id="pw-status" style="margin-top:8px;"></div>
      </div>

      <div class="card">
        <h3 style="margin-top:0;">🎨 Vzhled</h3>
        <div class="filter-bar">
          <button class="chip ${theme === "system" ? "active" : ""}" data-theme="system">Systémový</button>
          <button class="chip ${theme === "light" ? "active" : ""}" data-theme="light">Světlý</button>
          <button class="chip ${theme === "dark" ? "active" : ""}" data-theme="dark">Tmavý</button>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-top:0;">📅 Google (Kalendář + Gmail)</h3>
        <div class="muted" style="margin-bottom:10px;">
          Stav: <span class="pill ${hasGoogle() ? "" : "pill-warning"}">${hasGoogle() ? "Připojeno pro tuto session" : "Nepřipojeno / vypršelo"}</span>
        </div>
        <button class="btn btn-primary btn-sm" id="reconnect-google">Připojit / obnovit přístup</button>
        <p class="faint" style="margin-top:10px;">
          Přístupový token od Google vydrží zhruba hodinu. Až vyprší, klikni sem znovu — je to normální
          chování pro osobní appku bez vlastního serverového backendu.
        </p>
      </div>

      <div class="card">
        <h3 style="margin-top:0;">🤖 AI generování (flashcards / testy)</h3>
        <p class="faint">
          Generování běží přes Supabase Edge Function <code>ai-generate</code>, která používá tvůj vlastní
          Anthropic API klíč uložený jako server-side secret (nikdy neopouští Supabase, není v appce viditelný).
          Nastav ho jednou v Supabase Dashboardu: Project Settings → Edge Functions → Secrets →
          <code>ANTHROPIC_API_KEY</code>.
        </p>
      </div>
    </div>
  `;

  container.querySelector("#signout").addEventListener("click", () => signOut());

  container.querySelector("#pw-toggle").addEventListener("click", () => {
    const a = container.querySelector("#new-password");
    const b = container.querySelector("#new-password-confirm");
    const show = a.type === "password";
    a.type = show ? "text" : "password";
    b.type = show ? "text" : "password";
  });

  container.querySelector("#save-password").addEventListener("click", async () => {
    const pw = container.querySelector("#new-password").value;
    const pw2 = container.querySelector("#new-password-confirm").value;
    const statusEl = container.querySelector("#pw-status");
    if (pw.length < 6) {
      statusEl.textContent = "Heslo musí mít aspoň 6 znaků.";
      return;
    }
    if (pw !== pw2) {
      statusEl.textContent = "Hesla se neshodují.";
      return;
    }
    statusEl.textContent = "Ukládám…";
    try {
      const { error } = await updatePassword(pw);
      if (error) throw error;
      container.querySelector("#new-password").value = "";
      container.querySelector("#new-password-confirm").value = "";
      statusEl.textContent = "Heslo uloženo ✓ — teď se jím můžeš přihlásit i přímo v appce na ploše.";
      toast("Heslo uloženo", "success");
    } catch (e) {
      statusEl.textContent = "";
      toastError(e);
    }
  });

  container.querySelectorAll("[data-theme]").forEach((b) =>
    b.addEventListener("click", async () => {
      applyTheme(b.dataset.theme);
      container.querySelectorAll("[data-theme]").forEach((x) => x.classList.toggle("active", x === b));
      try {
        await Settings.update({ theme: b.dataset.theme });
      } catch {}
    })
  );

  container.querySelector("#reconnect-google").addEventListener("click", async () => {
    try {
      await signInWithGoogle();
    } catch (e) {
      toastError(e);
    }
  });
}
