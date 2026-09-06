# Workspace — osobní Notion-like appka

Vanilla HTML/JS/CSS + Supabase (stejně jako tvoje ostatní appky). Žádný build krok — stačí statický hosting.

## Co appka umí

- Přehled/dashboard: hodiny, dnešní kalendář, úkoly po termínu, aktivní cíle, nepřečtené e-maily
- Poznámky: sekce Škola / Práce / Osobní, složky, rich text (tučně, barvy, nadpisy, seznamy…), štítky, hledání
- AI generování z poznámky: flashcards, test (kvíz), shrnutí — přes Supabase Edge Function + tvůj Anthropic klíč
- Kalendář: měsíční pohled, kategorie (škola/práce/gym/osobní), filtrování, obousměrné propojení s Google Calendar
- Gmail: zobrazení nepřečtených zpráv na dashboardu (read-only)
- Gym: log tréninků, cviky, propojení s kalendářem, statistiky
- Jídelníček + recepty: denní log jídel s makry, knihovna receptů, výběr receptu do jídelníčku
- Úkoly + nákupní seznam
- Cíle s progress barem
- Deník s náladou
- Tmavý/světlý/systémový motiv, filtrování všude, responzivní i na mobilu, instalovatelné jako PWA

## 1) Nasazení na GitHub Pages

```bash
cd personal-workspace
git init
git add .
git commit -m "Initial workspace app"
git branch -M main
git remote add origin https://github.com/<tvuj-ucet>/<repo>.git
git push -u origin main
```

V nastavení repa: **Settings → Pages → Source: Deploy from branch → main / (root)**.
Appka pak poběží na `https://<tvuj-ucet>.github.io/<repo>/`.

## 2) Supabase backend (už hotovo)

Projekt `personal-workspace` je vytvořený a nastavený (tabulky, RLS politiky, storage bucket `files`,
edge funkce `ai-generate`). Nic tu není potřeba dělat, pokud nechceš něco měnit napřímo v
[Supabase Dashboardu](https://supabase.com/dashboard/project/iccmtviewbfnsizobdzd).

## 3) Přihlášení do appky

Appka teď podporuje dva způsoby přihlášení:

- **Email magic link** — funguje hned bez jakéhokoli nastavování (Supabase má email login zapnutý
  od začátku). Zadáš email, přijde ti odkaz, kliknutím se přihlásíš. Tohle použij, pokud chceš appku
  vyzkoušet hned, nebo pokud Google/Kalendář/Gmail vůbec nepotřebuješ.
- **Google** — o krok níž. Je potřeba jen pokud chceš propojení s Google Calendar / Gmail (appka to
  jinak nijak nevynucuje).

## 4) Google Kalendář/Gmail (volitelné, musíš udělat ty)

Appka používá **jedno** Google přihlášení jak pro login, tak pro přístup ke Kalendáři a Gmailu (read-only).
Pokud ti stačí email login z kroku 3, tenhle krok klidně přeskoč.

1. Jdi do [Google Cloud Console](https://console.cloud.google.com/) → vytvoř nový projekt (nebo použij existující).
2. **APIs & Services → Library** → zapni **Google Calendar API** a **Gmail API**.
3. **APIs & Services → OAuth consent screen**:
   - Typ: External, Publishing status: klidně nech "Testing" (appka je jen pro tebe).
   - Scopes: přidej `.../auth/calendar` a `.../auth/gmail.readonly`.
   - Test users: přidej svůj Gmail (matyas.moulis.mm@gmail.com).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: Web application
   - Authorized JavaScript origins: `https://<tvuj-ucet>.github.io`
   - Authorized redirect URIs: `https://iccmtviewbfnsizobdzd.supabase.co/auth/v1/callback`
   - Zkopíruj **Client ID** a **Client Secret**.
5. V [Supabase Dashboardu](https://supabase.com/dashboard/project/iccmtviewbfnsizobdzd/auth/providers) →
   **Authentication → Providers → Google** → zapni, vlož Client ID + Secret → Save.
6. Tamtéž **Authentication → URL Configuration** → nastav Site URL na
   `https://<tvuj-ucet>.github.io/<repo>/` a přidej ji i do Redirect URLs.

Google přístupový token (pro Kalendář/Gmail) vydrží cca hodinu. Appka ho drží jen v paměti prohlížeče
(kvůli bezpečnosti se neukládá natrvalo) — když vyprší, stačí v **Nastavení → Google** kliknout na
"Připojit / obnovit přístup".

## 5) AI generování (flashcards, testy, shrnutí)

Potřebuješ vlastní [Anthropic API klíč](https://console.anthropic.com/settings/keys). Nastav ho jako
secret pro edge funkci (klíč nikdy neopustí Supabase server, appka ho nikdy neuvidí):

```bash
npx supabase login
npx supabase link --project-ref iccmtviewbfnsizobdzd
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Nebo přes Dashboard: **Edge Functions → ai-generate → Secrets → Add secret**.

## 6) Instalace na telefon (PWA)

Appku otevři na telefonu v prohlížeči a zvol "Přidat na plochu" / "Add to Home Screen" — poběží
jako samostatná appka s vlastní ikonou.

## Struktura projektu

```
index.html
manifest.json          – PWA manifest
sw.js                   – service worker (cache app shellu)
css/styles.css
js/config.js            – Supabase URL/klíč (veřejné, chráněné RLS)
js/supabaseClient.js
js/auth.js              – Google přihlášení
js/db.js                – CRUD helpery pro všechny tabulky
js/google.js            – volání Google Calendar/Gmail API
js/richtext.js          – jednoduchý rich-text editor
js/theme.js, ui.js, toast.js
js/app.js               – router + app shell
js/views/*.js           – jednotlivé sekce appky
```

Databázové schéma i edge funkce jsou nasazené přímo v Supabase projektu `personal-workspace`
(id `iccmtviewbfnsizobdzd`) — v repu žádné SQL migrace nejsou potřeba, ale kdybys appku chtěl
znovu nasadit odjinud, schéma najdeš v historii migrací v Supabase Dashboardu.
