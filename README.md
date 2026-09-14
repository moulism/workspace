# Workspace — osobní Notion-like appka

Vanilla HTML/JS/CSS + Supabase (stejně jako tvoje ostatní appky). Žádný build krok — stačí statický hosting.

## Co appka umí

- Přehled/dashboard: hodiny, dnešní kalendář, úkoly po termínu, aktivní cíle, nepřečtené e-maily
- Poznámky: sekce Škola / Práce / Osobní, **předměty/složky s ikonou a barvou**, rich text (tučně, barvy, nadpisy, seznamy…), štítky, hledání, **volitelný termín (zkouška/odevzdání)** u poznámky, panel blížících se termínů
- AI generování z poznámky: flashcards, test (kvíz), shrnutí — přes Supabase Edge Function + tvůj Anthropic klíč
- Kalendář: **Den / Týden / Měsíc / Rok** (přepínač jako v nativním kalendáři), kategorie (škola/práce/gym/osobní), filtrování, obousměrné propojení s Google Calendar, **automatické zobrazení školních termínů z Poznámek a úkolů s termínem přímo v kalendáři**
- **Successful Journal** — 90denní deník odpovědnosti: ranní stránka (3 priority, vděčnost, záměr dne, habit tracker), večerní stránka (výhry, ponaučení, zaměření na zítřek, hodnocení dne), přehled celého 90denního cyklu a historie cyklů
- Gmail: zobrazení nepřečtených zpráv na dashboardu (read-only)
- Gym: log tréninků, cviky, propojení s kalendářem, statistiky
- Jídelníček + recepty: denní log jídel s makry, knihovna receptů, výběr receptu do jídelníčku
- Úkoly + nákupní seznam
- Cíle s progress barem
- Deník s náladou (samostatně od Successful Journal)
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

## 2) Supabase backend

Projekt `personal-workspace` je vytvořený a nastavený (tabulky, RLS politiky, storage bucket `files`,
edge funkce `ai-generate`). Nic tu není potřeba dělat, pokud nechceš něco měnit napřímo v
[Supabase Dashboardu](https://supabase.com/dashboard/project/iccmtviewbfnsizobdzd).

Nově přidané tabulky (migrace `successful_journal_and_school_calendar_link`, aplikovaná přímo v projektu):
`sj_cycles`, `sj_habits`, `sj_entries`, `sj_habit_logs` (Successful Journal) a nové sloupce
`folders.icon` + `notes.due_date` (ikony předmětů a termíny poznámek). RLS politiky mají stejný vzor
jako zbytek appky (`user_id = auth.uid()`).

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

## Successful Journal — jak to funguje

Sekce vychází z konceptu 90denního "accountability" deníku (vlastní/originální texty a prompty,
appka nekopíruje žádný konkrétní fyzický produkt):

1. Založíš **nový 90denní cyklus** — název, vize/zaměření, pár cílů, a sadu návyků, které chceš
   sledovat (např. 🏋️ Trénink, 📖 Čtení, 💧 Voda).
2. Každý den vyplníš **ranní stránku** (3 priority, za co jsi vděčný, dnešní záměr, zaškrtneš návyky)
   a **večerní stránku** (co se povedlo, co ses naučil, zaměření na zítra, hodnocení dne 1–5 ★).
3. V **Přehledu 90 dní** vidíš celý cyklus jako mřížku — barva podle hodnocení dne — plus statistiky
   a plnění jednotlivých návyků.
4. Cyklus můžeš kdykoliv **dokončit** nebo založit nový — historie zůstává v **Historii cyklů**.

## Poznámky → předměty a propojení s kalendářem

- V sekci **Škola** teď "složka" = **předmět**: má vlastní ikonu (emoji) a barvu, dá se upravit/smazat
  přímo z panelu vlevo (ikonka ✎ při najetí myší).
- Poznámka může mít volitelný **termín** (zkouška, odevzdání) — zobrazí se jako štítek na kartě
  poznámky, v panelu "Blížící se termíny" nahoře v Poznámkách, a **automaticky i v Kalendáři**
  (ikona 🎓) na daný den, spolu s nesplněnými úkoly s termínem (ikona ✓). Kliknutím na tyto položky
  v kalendáři se otevře náhled s odkazem zpět do Poznámek/Úkolů.

## Instalace na telefon (PWA)

Appku otevři na telefonu v prohlížeči a zvol "Přidat na plochu" / "Add to Home Screen".

## Struktura projektu

```
index.html
manifest.json          – PWA manifest
sw.js                   – service worker (cache app shellu)
css/styles.css
js/config.js            – Supabase URL/klíč (veřejné, chráněné RLS)
js/supabaseClient.js
js/auth.js              – Google přihlášení
js/db.js                – CRUD helpery pro všechny tabulky (vč. Successful Journal)
js/google.js            – volání Google Calendar/Gmail API
js/richtext.js          – jednoduchý rich-text editor
js/theme.js, ui.js, toast.js
js/app.js               – router + app shell
js/views/*.js           – jednotlivé sekce appky (vč. nového views/journal.js)
```

Databázové schéma i edge funkce jsou nasazené přímo v Supabase projektu `personal-workspace`
(id `iccmtviewbfnsizobdzd`) — v repu žádné SQL migrace nejsou potřeba, ale kdybys appku chtěl
znovu nasadit odjinud, schéma najdeš v historii migrací v Supabase Dashboardu.

## Novinky (aktualizace září 2026)

- **Vzhled**: animovaný sidebar (sjíždějící aktivní pilulka, sbalitelný na
  desktopu), na mobilu spodní navigační lišta místo ikonek nalevo, plynulé
  přechody mezi sekcemi, animace modálů/toastů, opravené hamburger menu.
  Ikona appky je teď z obrázku, co jsi poslal (`icons/icon-192.png`,
  `icon-512.png`, `icon-maskable-512.png`).
- **Kalendář**: události se teď můžou **opakovat** (denně/týdně/měsíčně,
  vlastní interval, dny v týdnu, volitelné "opakovat do"). Událost jde
  propojit s **předmětem/složkou** a přímo z ní jedním klikem založit
  poznámku, která se rovnou zařadí do správné složky v Poznámkách.
- **Poznámky**: v editoru je teď zaškrtávací seznam (zkratka `[] ` na
  začátku řádku, jako v Notion) a oddělovač. Kromě PDF exportu je nové
  tlačítko **„Export pro kamarády"**, které stáhne poznámku jako samostatný
  `.html` soubor.
- **Nákupní seznam**: přepínání mezi seznamy přes výběr (ne přepisování
  textu), položky jdou seskupit podle kategorie, jednoduchá úprava položky
  kliknutím, a položky přidané z receptu mají vazbu na daný recept.
- **Recepty**: nová záložka **„✨ Objevit recepty"** — stáhne pár nápadů
  z otevřené databáze [TheMealDB](https://www.themealdb.com/), s odhadem
  doby dne (snídaně/oběd-večeře/svačina) a obtížnosti, kompletním seznamem
  surovin a tlačítkem na přidání do nákupního seznamu nebo uložení receptu.
- **Finance**: nová sekce v menu, postavená na Supabase (`finance_transactions`,
  `finance_categories`) místo `localStorage` — takže na rozdíl od původního
  samostatného `FINANCE/finance.html` teď data vidíš na všech zařízeních.
  Grafy (rok/kategorie/dny v týdnu) běží přes Chart.js stejně jako předtím.

Databázové změny (viz Supabase Dashboard → migrace): `calendar_events` má
nové sloupce `folder_id` a `recurrence` (jsonb), `shopping_items` má
`source_recipe_id`, `recipes` má sloupce pro recepty z internetu
(`image_url`, `source`, `external_id`, `category`, `area`, `meal_time`,
`difficulty`, `prep_minutes`), a přibyly tabulky `finance_categories` +
`finance_transactions` — všechny se stejnou RLS politikou (`user_id =
auth.uid()`) jako zbytek appky.
