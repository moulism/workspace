import { supabase } from "../supabaseClient.js";
import { Settings } from "../db.js";
import { signInWithGoogle, signOut, getSession } from "../auth.js";
import { hasGoogle } from "../google.js";
import { getStoredTheme, applyTheme } from "../theme.js";
import { toast, toastError } from "../toast.js";

export async function render(container) {
  const session = await getSession();
  const user = session?.user;
  const theme = getStoredTheme();

  container.innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <h3 style="margin-top:0;">Účet</h3>
        <div class="muted">${user?.email || ""}</div>
        <button class="btn btn-danger btn-sm" id="signout" style="margin-top:12px;">Odhlásit se</button>
      </div>

      <div class="card">
        <h3 style="margin-top:0;">Vzhled</h3>
        <div class="filter-bar">
          <button class="chip ${theme === "system" ? "active" : ""}" data-theme="system">Systémový</button>
          <button class="chip ${theme === "light" ? "active" : ""}" data-theme="light">Světlý</button>
          <button class="chip ${theme === "dark" ? "active" : ""}" data-theme="dark">Tmavý</button>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-top:0;">Google (Kalendář + Gmail)</h3>
        <div class="muted" style="margin-bottom:10px;">
          Stav: ${hasGoogle() ? "✅ Připojeno pro tuto session" : "⚠️ Nepřipojeno / vypršelo"}
        </div>
        <button class="btn btn-primary btn-sm" id="reconnect-google">Připojit / obnovit přístup</button>
        <p class="faint" style="margin-top:10px;">
          Přístupový token od Google vydrží zhruba hodinu. Až vyprší, klikni sem znovu — je to normální
          chování pro osobní appku bez vlastního serverového backendu.
        </p>
      </div>

      <div class="card">
        <h3 style="margin-top:0;">AI generování (flashcards / testy)</h3>
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
