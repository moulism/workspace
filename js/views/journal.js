import { JournalCycles, JournalHabits, JournalEntries, JournalHabitLogs, JournalWeeklyReviews, Events, Todos, FinanceTransactions, Goals } from "../db.js";
import { escapeHtml, openModal, confirmDialog, todayIso, fmtDate } from "../ui.js";
import { toast, toastError } from "../toast.js";
import { expandRecurrence } from "../recurrence.js";

// Citáty ke kázni, návykům a sebekázni — směs ověřených citátů (stoikové,
// historické osobnosti) s uvedeným autorem a několika původními myšlenkami
// bez autora. Jeden se vybere podle dne v roce, takže se každý den drží
// stejný v celé aplikaci.
const QUOTES = [
  // --- Stoikové: příprava ráno, sebekázeň, jednání navzdory okolnostem ---
  { t: "Máš moc nad svou myslí — ne nad vnějšími událostmi. Uvědom si to, a najdeš sílu.", a: "Marcus Aurelius" },
  { t: "Přestaň se hádat o tom, jaký by měl být dobrý člověk. Buď jím.", a: "Marcus Aurelius" },
  { t: "Překážka na cestě se stává cestou.", a: "Marcus Aurelius" },
  { t: "Pokud to není správné, nedělej to. Pokud to není pravda, neříkej to.", a: "Marcus Aurelius" },
  { t: "Omez se na přítomný okamžik.", a: "Marcus Aurelius" },
  { t: "Ke šťastnému životu stačí málo — vše je uvnitř tebe, ve způsobu tvého myšlení.", a: "Marcus Aurelius" },
  { t: "Štěstí je to, co se stane, když se příprava setká s příležitostí.", a: "Seneca" },
  { t: "Víc trpíme ve své představivosti, než ve skutečnosti.", a: "Seneca" },
  { t: "Obtíže posilují mysl, tak jako práce posiluje tělo.", a: "Seneca" },
  { t: "Nemáme málo času — jde jen o to, kolik ho promarníme.", a: "Seneca" },
  { t: "Svobodný je ten, kdo je odvážný.", a: "Seneca" },
  { t: "Začni žít hned a počítej každý jednotlivý den jako samostatný život.", a: "Seneca" },
  { t: "Nezáleží na tom, co se ti stane, ale na tom, jak na to zareaguješ.", a: "Epiktétos" },
  { t: "Nejdřív si řekni, kým chceš být, a pak dělej to, co musíš dělat.", a: "Epiktétos" },
  { t: "Svobodný není ten, kdo dělá, co chce, ale ten, kdo je pánem sám sobě.", a: "Epiktétos" },
  { t: "Využij naplno to, co je ve tvé moci, zbytek přijmi tak, jak přichází.", a: "Epiktétos" },

  // --- Návyky, disciplína, systémy ---
  { t: "Nedosáhneš úrovně svých cílů. Klesneš na úroveň svých systémů.", a: "James Clear" },
  { t: "Disciplína znamená svobodu.", a: "Jocko Willink" },
  { t: "Motivace tě nastartuje. Návyk tě udrží v pohybu.", a: "Jim Ryun" },
  { t: "Bolest disciplíny váží gramy. Bolest lítosti váží tuny.", a: "Jim Rohn" },
  { t: "Jsme to, co opakovaně děláme. Dokonalost tedy není čin, ale návyk.", a: "Aristotelés" },
  { t: "Nezáleží na tom, jak pomalu jdeš, dokud se nezastavíš.", a: "Konfucius" },
  { t: "Naše největší sláva není v tom, že nikdy nepadneme, ale v tom, že pokaždé znovu vstaneme.", a: "Konfucius" },
  { t: "Muž, který přenese horu, začíná odnášením malých kamenů.", a: "Konfucius" },
  { t: "Vítězní bojovníci nejdřív zvítězí, a pak jdou do bitvy.", a: "Sun Tzu" },
  { t: "Příležitosti se množí tím, že se jich chopíš.", a: "Sun Tzu" },

  // --- Práce, vytrvalost, příprava ---
  { t: "Nic hodnotného nepřijde snadno.", a: "Theodore Roosevelt" },
  { t: "Dělej, co můžeš, s tím, co máš, tam, kde jsi.", a: "Theodore Roosevelt" },
  { t: "Nejlepší odměnou v životě je možnost tvrdě pracovat na práci, která stojí za to.", a: "Theodore Roosevelt" },
  { t: "Když se nepřipravíš, připravuješ se na neúspěch.", a: "Benjamin Franklin" },
  { t: "Energie a vytrvalost překonají vše.", a: "Benjamin Franklin" },
  { t: "Ztracený čas se už nikdy nevrátí.", a: "Benjamin Franklin" },
  { t: "Dej mi šest hodin na kácení stromu a první čtyři strávím broušením sekery.", a: "Abraham Lincoln" },
  { t: "Úspěch není konečný, neúspěch není smrtelný — důležitá je odvaha pokračovat.", a: "Winston Churchill" },
  { t: "Nejde o to, jak jsi chytrý, ale o to, jak dlouho vydržíš u problému.", a: "Albert Einstein" },
  { t: "Ať si myslíš, že to dokážeš, nebo že ne — máš pravdu.", a: "Henry Ford" },
  { t: "Úspěšný bojovník je průměrný člověk s laserovým zaměřením.", a: "Bruce Lee" },
  { t: "Zůstaň tvrdý.", a: "David Goggins" },

  // --- Původní myšlenky (bez konkrétního autora) ---
  { t: "Disciplína je most mezi cíli a jejich dosažením." },
  { t: "Malý krok dnes je lepší než dokonalý plán zítra." },
  { t: "Nejsi to, co si myslíš. Jsi to, co děláš každý den." },
  { t: "Pohodlí je tichý zabiják ambicí." },
  { t: "Návyky, které si vybuduješ dnes, tě ponesou celý rok." },
  { t: "Nečekej na motivaci — vytvoř si systém a motivace přijde sama." },
  { t: "Úspěch je součet malých rozhodnutí, opakovaných den za dnem." },
  { t: "Zaměř se na proces. Výsledek je jen jeho odraz." },
  { t: "Kázeň je forma sebeúcty." },
  { t: "Každý den je hlasování o tom, kým se stáváš." },
  { t: "Vytrvalost poráží talent, když talent nevytrvá." },
  { t: "Nejtěžší krok je vždy ten první — dnešní." },
  { t: "Buduj si na svých vítězstvích, ne na svých výmluvách." },
  { t: "Co měříš, to zlepšuješ. Co sleduješ, to roste." },
  { t: "Klid přichází z přípravy, ne z náhody." },
  { t: "Silná vůle se netrénuje ve výjimečných chvílích, ale v obyčejných dnech." },
  { t: "Menší, konzistentní kroky porazí velké, ale nepravidelné výbuchy snahy." },
  { t: "Vděčnost mění to, co máš, na dostatek." },
  { t: "Tvoje budoucnost sleduje tvoje dnešní návyky, ne tvoje dnešní nálady." },
  { t: "Cíl bez plánu je jen přání. Plán bez akce je jen teorie." },
  { t: "Nejsi obětí svého dne — jsi jeho architekt." },
  { t: "Každé ráno máš na výběr: znovu usnout, nebo se probudit naplno." },
  { t: "Růst bolí. Stagnace bolí víc — jen pomaleji." },
  { t: "Dělej to, co je správné, ne to, co je snadné." },
  { t: "Nikdy neselhávej dvakrát za sebou — jedno vynechání je nehoda, dvě je nový (špatný) návyk." },
  { t: "Nejde o to, jak dobrý jsi dnes. Jde o to, kým se staneš za rok stejné kázně." },
];

// Fakt dne — krátká zajímavost z byznysu, psychologie, financí a vědy,
// jedna denně (podle dne v roce, stejně jako citát).
const FACTS = [
  "Multitasking ve skutečnosti neexistuje — mozek jen rychle přepíná mezi úkoly a každé přepnutí tě stojí čas i pozornost.",
  "Podle výzkumů trvá v průměru 66 dní, než se nová činnost stane automatickým návykem — ne 21 dní, jak se často traduje.",
  "Parkinsonův zákon: práce se vždy natáhne tak, aby vyplnila čas, který jí vyhradíš.",
  "Lidé podceňují, jak dlouho jim úkol zabere — říká se tomu plánovací klam (planning fallacy).",
  "Krátká 10minutová procházka dokáže zlepšit náladu na několik hodin.",
  "Lidé, kteří si cíle fyzicky zapisují, je podle výzkumů dosahují výrazně častěji než ti, co je mají jen v hlavě.",
  "Přes 90 % milionářů v USA vlastní nemovitost — realitní trh je historicky nejběžnější cesta k budování majetku.",
  "Apple, Disney i Hewlett-Packard byly založeny v garáži.",
  "Amazon začínal jako internetové knihkupectví — teprve později se z něj stal obchod se vším.",
  "Složený úrok znamená, že vyděláváš i na úrocích z minulých let — proto je ve financích čas důležitější než výše počáteční investice.",
  "Airbnb odmítlo pět investorů, než se z něj stala firma za desítky miliard dolarů.",
  "Firmy založené během recese mají často výhodu — méně konkurence, nižší náklady a víc volných talentů.",
  "Nejstarší firma světa, japonská stavební firma Kongō Gumi, fungovala nepřetržitě přes 1400 let.",
  "Lidské tělo si vymění většinu svých buněk zhruba jednou za 7–10 let.",
  "Med je jedna z mála potravin, která teoreticky nikdy nezkazí — archeologové našli jedlý med starý přes 3000 let.",
  "Chobotnice mají tři srdce a modrou krev.",
  "Z vesmíru pouhým okem prakticky nejde rozeznat žádnou lidskou stavbu — Velká čínská zeď je jen mýtus, ne fakt.",
  "Studená sprcha ráno zvyšuje hladinu noradrenalinu a může krátkodobě zlepšit pozornost a náladu.",
  "Warren Buffett stále bydlí v domě, který koupil v roce 1958 za 31 500 dolarů.",
  "Většina úspěšných lidí čte podstatně víc knih než průměrná populace — čtení je jedna z nejlevnějších forem vzdělávání, jaká existuje.",
  "Netflix původně půjčoval DVD poštou — na streamovací model přešel až o osm let později.",
  "Sardinie, Okinawa a Nikoya patří mezi tzv. „modré zóny" — místa s nejvyšším podílem lidí, kteří se dožívají přes 100 let, a spojuje je hlavně pohyb a komunita, ne diety.",
  "Průměrný člověk stráví kontrolou telefonu přes 3 hodiny denně — to je přes 45 dní v roce.",
  "Psaní rukou (ne na klávesnici) zlepšuje zapamatování informací — aktivuje víc oblastí mozku najednou.",
  "Steve Jobs nosil každý den stejné oblečení, aby ušetřil mentální kapacitu na důležitější rozhodnutí.",
  "Nejvíc mléčné čokolády na hlavu ročně sní Švýcarsko — přes 8 kg na osobu.",
  "Vosí hnízda i včelí plástve jsou postavené v přesných šestiúhelnících — nejefektivnějším tvaru z hlediska materiálu a pevnosti.",
  "80 % úspěchu podle Pareto principu pochází jen z 20 % úsilí — otázka je, jestli víš, které je to 20 %.",
  "První iPhone v roce 2007 neměl žádné aplikace třetích stran — App Store přišel až o rok později.",
  "Lidský mozek spotřebuje asi 20 % veškeré energie těla, přestože tvoří jen 2 % tělesné hmotnosti.",
];

function factOfDay(dateIso) {
  const d = new Date(dateIso + "T00:00:00");
  const start = new Date(d.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((d - start) / 86400000);
  return FACTS[dayOfYear % FACTS.length];
}

// Dovednost týdne — krátká praktická lekce, jedna na celý (kalendářní) týden.
const SKILLS = [
  { title: "Pravidlo dvou minut", body: "Pokud ti úkol zabere méně než 2 minuty, udělej ho hned místo odkládání na později. Eliminuješ tím spoustu drobného mentálního balastu, který se jinak hromadí a rozptyluje tě. Zkus to dnes na e-mailech a zprávách." },
  { title: "Eisenhowerova matice", body: "Rozděl úkoly do čtyř kvadrantů: důležité+naléhavé (udělej hned), důležité+nenaléhavé (naplánuj), nenaléhavé pro tebe ale důležité pro někoho jiného (deleguj), nedůležité+nenaléhavé (zruš). Většina lidí tráví čas na naléhavém, ale nedůležitém — zkus si takhle rozdělit dnešní todo list." },
  { title: "Time blocking", body: "Místo volného seznamu úkolů si napevno naplánuj bloky času v kalendáři na konkrétní práci, ne jen na schůzky. Co není v kalendáři, se často nestane. Zkus si zítřek naplánovat po hodinových blocích." },
  { title: "1% zlepšení denně", body: "Není potřeba zlepšit se o 100 % najednou — stačí 1 % denně a po roce jsi zhruba 37× lepší. Zaměř se na malé, opakovatelné zlepšení systému, ne na jednorázový velký skok." },
  { title: "Pomodoro technika", body: "25 minut soustředěné práce, 5 minut pauza, po čtyřech kolech delší pauza. Mozek podává lepší výkon v ohraničených blocích s jasným koncem než při neomezené práci „donekonečna"." },
  { title: "Sněz žábu ráno", body: "Udělej hned ráno ten nejtěžší nebo nejnepříjemnější úkol dne. Zbytek dne pak jede s pocitem úlevy a hybnou silou, místo aby ses tomu úkolu celý den vyhýbal." },
  { title: "Rozpočet 50/30/20", body: "50 % příjmu na potřeby, 30 % na chtíče, 20 % na spoření a investice. Jednoduchý rámec, jak si automaticky rozdělit rozpočet bez složitého trackování každé koruny — zkus si tento měsíc spočítat, jak blízko jsi tomuto poměru." },
  { title: "SMART cíle", body: "Specifický, Měřitelný, Dosažitelný, Relevantní, Časově ohraničený. „Chci zhubnout" není cíl. „Zhubnu 5 kg do konce listopadu tím, že budu 4× týdně cvičit" je. Zkus si takhle přepsat jeden ze svých cílů." },
  { title: "Pravidlo 5 sekund", body: "Jakmile máš impuls něco udělat, odpočítej v hlavě 5-4-3-2-1 a hned jednej, než ti mozek stihne najít výmluvu. Funguje hlavně proti prokrastinaci a ranní netečnosti." },
  { title: "Deep work", body: "Nejcennější práce vzniká v dlouhých nerušených blocích soustředění, ne v roztříštěných 10minutových okýnkách mezi notifikacemi. Vypni si na 90 minut telefon a uvidíš rozdíl v kvalitě výstupu." },
  { title: "Klam utopených nákladů", body: "Jen proto, že jsi do něčeho už investoval čas nebo peníze, neznamená, že v tom máš pokračovat, pokud to nefunguje. Rozhoduj se podle budoucí hodnoty, ne podle minulé investice." },
  { title: "Dávej dřív, než žádáš", body: "Lidé, kteří v networkingu nejdřív nabízejí hodnotu — pomoc, kontakt, radu — a až pak žádají o něco na oplátku, budují mnohem silnější a dlouhodobější vztahy než ti, co jdou rovnou s žádostí." },
  { title: "Pravidlo jedné věci", body: "Než začneš cokoliv nového, zeptej se: „Jaká jedna věc by mi dnes nejvíc pohnula s cílem, aby po jejím udělání bylo všechno ostatní jednodušší nebo zbytečné?" — a udělej ji jako první." },
  { title: "Kompoundovaný efekt návyků", body: "Malé denní akce — 10 stran čtení, jeden těžký hovor, 1 % zlepšení — se v moment X nezdají důležité. Po měsících a letech ale tvoří exponenciální rozdíl mezi průměrným a výjimečným výsledkem." },
];

function weekIndexOf(dateIso) {
  const monday = mondayOfWeek(dateIso);
  const d = new Date(monday + "T00:00:00");
  const epoch = new Date(2020, 0, 6); // pondělí, jen pevný referenční bod
  return Math.floor((d - epoch) / (7 * 86400000));
}

function skillOfWeek(dateIso) {
  const idx = ((weekIndexOf(dateIso) % SKILLS.length) + SKILLS.length) % SKILLS.length;
  return SKILLS[idx];
}

function quoteOfDay(dateIso) {
  const d = new Date(dateIso + "T00:00:00");
  const start = new Date(d.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((d - start) / 86400000);
  return QUOTES[dayOfYear % QUOTES.length];
}

function dayIndex(cycle, dateIso) {
  const start = new Date(cycle.start_date + "T00:00:00");
  const cur = new Date(dateIso + "T00:00:00");
  return Math.round((cur - start) / 86400000) + 1;
}

function cycleLength(cycle) {
  const start = new Date(cycle.start_date + "T00:00:00");
  const end = new Date(cycle.end_date + "T00:00:00");
  return Math.round((end - start) / 86400000) + 1;
}

function addDaysIso(dateIso, n) {
  const d = new Date(dateIso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return todayIsoFrom(d);
}

function todayIsoFrom(d) {
  const copy = new Date(d);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

// Pondělí týdne, ve kterém leží dateIso — základ pro týdenní review
// (Full Focus Planner styl: plánuj/hodnoť po týdnech, ne jen po dnech).
function mondayOfWeek(dateIso) {
  const d = new Date(dateIso + "T00:00:00");
  const day = d.getDay() || 7; // Ne=0 -> 7
  d.setDate(d.getDate() - (day - 1));
  return todayIsoFrom(d);
}

// Šňůra po sobě jdoucích dní (podle Atomic Habits — "never miss twice").
// Počítá se odzadu od uptoDateIso; pokud dnešek ještě není vyplněný,
// začne se počítat od včerejška, aby rozjetá šňůra "nespadla na nulu"
// jen proto, že den ještě neskončil.
function computeStreak(datesSet, uptoDateIso) {
  let d = uptoDateIso;
  if (!datesSet.has(d)) d = addDaysIso(d, -1);
  let streak = 0;
  while (datesSet.has(d)) {
    streak++;
    d = addDaysIso(d, -1);
  }
  return streak;
}

let state = {
  cycle: null,
  habits: [],
  selectedDate: todayIso(),
  entry: null,
  habitLogs: {}, // habitId -> true
  tab: "today", // today | week | overview | history
};

export async function render(container) {
  container.innerHTML = `<div class="center" style="padding:60px;"><div class="spinner"></div></div>`;
  try {
    state.cycle = await JournalCycles.getActive();
    if (!state.cycle) {
      // Deník se chová jako už existující kniha — žádné "založení" navíc,
      // první otevření si tiše připraví aktivní 90denní cyklus na pozadí.
      state.cycle = await JournalCycles.create({
        title: "Můj deník",
        start_date: todayIso(),
        end_date: addDaysIso(todayIso(), 89),
        theme: null,
        goals: [],
        status: "active",
      });
    }
  } catch (e) {
    toastError(e);
  }

  if (!state.cycle) {
    renderNoCycle(container);
    return;
  }

  try {
    state.habits = await JournalHabits.listByCycle(state.cycle.id);
  } catch (e) {
    toastError(e);
    state.habits = [];
  }

  renderShell(container);
}

function renderNoCycle(container) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="big">📗</div>
      <h2 style="margin:6px 0;">Successful Journal</h2>
      <p class="muted" style="max-width:460px;margin:0 auto 18px;">
        90 dní disciplíny, ne motivace. Ráno si odškrtneš rutinu a nastavíš priority, večer si upřímně zhodnotíš den, jednou týdně uděláš review. Každý den tě čeká fakt na zamyšlení, každý týden nová dovednost. A celou dobu máš na jednom místě přehled, jak jsi na tom s financemi, cíli a úkoly — žádné výmluvy, že jsi „to neviděl".
        Začni nový 90denní cyklus a rozjeď to.
      </p>
      <button class="btn btn-primary" id="start-cycle-btn">+ Nový 90denní cyklus</button>
      <div style="margin-top:18px;" id="past-cycles"></div>
    </div>
  `;
  container.querySelector("#start-cycle-btn").addEventListener("click", () => openCycleModal(container));
  renderPastCyclesList(container.querySelector("#past-cycles"), { onlyPast: true });
}

async function renderPastCyclesList(mount, { onlyPast = false } = {}) {
  try {
    const cycles = await JournalCycles.list();
    const list = onlyPast ? cycles.filter((c) => c.status !== "active") : cycles;
    if (!list.length) {
      mount.innerHTML = "";
      return;
    }
    mount.innerHTML = `
      <div class="faint" style="margin-bottom:8px;">PŘEDCHOZÍ CYKLY</div>
      <div class="list" style="max-width:420px;margin:0 auto;">
        ${list
          .map(
            (c) => `<div class="list-item">
              <div class="grow">
                <div class="title">${escapeHtml(c.title)}</div>
                <div class="faint">${fmtDate(c.start_date)} – ${fmtDate(c.end_date)} · ${c.status === "completed" ? "dokončeno" : c.status === "archived" ? "archivováno" : "aktivní"}</div>
              </div>
              ${c.status !== "active" ? `<button class="btn btn-sm" data-reactivate="${c.id}">Obnovit</button>` : ""}
            </div>`
          )
          .join("")}
      </div>
    `;
    mount.querySelectorAll("[data-reactivate]").forEach((b) =>
      b.addEventListener("click", async () => {
        try {
          await JournalCycles.update(b.dataset.reactivate, { status: "active" });
          render(mount.closest(".view") || mount.parentElement.parentElement);
          location.hash = "#/journal";
          window.dispatchEvent(new Event("hashchange"));
        } catch (e) {
          toastError(e);
        }
      })
    );
  } catch (e) {
    toastError(e);
  }
}

function renderShell(container) {
  const cycle = state.cycle;
  const len = cycleLength(cycle);
  const idx = Math.min(Math.max(dayIndex(cycle, state.selectedDate), 1), len);
  const progressPct = Math.round((idx / len) * 100);

  container.innerHTML = `
    <div class="sj-header card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
        <div>
          <div class="faint">CYKLUS</div>
          <h2 style="margin:2px 0 2px;">${escapeHtml(cycle.title)}</h2>
          ${cycle.theme ? `<div class="muted">${escapeHtml(cycle.theme)}</div>` : ""}
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm" id="edit-cycle-btn">Upravit cyklus</button>
        </div>
      </div>
      <div style="margin-top:12px;">
        <div style="display:flex;justify-content:space-between;font-size:12.5px;" class="muted">
          <span>Den ${idx} / ${len}</span>
          <span>${fmtDate(cycle.start_date)} – ${fmtDate(cycle.end_date)}</span>
        </div>
        <div class="progress-bar" style="margin-top:5px;"><div style="width:${progressPct}%;"></div></div>
      </div>
    </div>

    <div class="toolbar" style="margin:16px 0;">
      <button class="chip ${state.tab === "today" ? "active" : ""}" data-tab="today">Dnešní stránka</button>
      <button class="chip ${state.tab === "week" ? "active" : ""}" data-tab="week">Týdenní review</button>
      <button class="chip ${state.tab === "overview" ? "active" : ""}" data-tab="overview">Přehled 90 dní</button>
      <button class="chip ${state.tab === "history" ? "active" : ""}" data-tab="history">Historie cyklů</button>
    </div>

    <div id="sj-body"></div>
  `;

  container.querySelector("#edit-cycle-btn").addEventListener("click", () => openCycleModal(container, cycle));
  container.querySelectorAll("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      state.tab = b.dataset.tab;
      renderShell(container);
    })
  );

  const body = container.querySelector("#sj-body");
  if (state.tab === "today") renderTodayTab(container, body);
  else if (state.tab === "week") renderWeekTab(container, body);
  else if (state.tab === "overview") renderOverviewTab(container, body);
  else renderHistoryTab(container, body);
}

async function renderTodayTab(container, body) {
  body.innerHTML = `<div class="center" style="padding:40px;"><div class="spinner"></div></div>`;
  const cycle = state.cycle;
  const minDate = cycle.start_date;
  const maxDate = cycle.end_date > todayIso() ? todayIso() : cycle.end_date;
  const isToday = state.selectedDate === todayIso();

  let allEntries = [];
  let allLogs = [];
  let todayEvents = [];
  let todayTodos = [];
  let monthSpend = null;
  let activeGoals = [];
  try {
    const tasks = [
      JournalEntries.getByDate(state.selectedDate),
      JournalHabitLogs.listForDate(state.selectedDate),
      JournalEntries.listByCycle(cycle.id),
      JournalHabitLogs.listForRange(cycle.start_date, cycle.end_date),
    ];
    if (isToday) {
      const monthStart = state.selectedDate.slice(0, 7) + "-01";
      tasks.push(
        Events.listRange(`${state.selectedDate}T00:00:00`, `${state.selectedDate}T23:59:59`).catch(() => []),
        Events.listAllRecurring().catch(() => []),
        Todos.list({ done: false, from: state.selectedDate, to: state.selectedDate }).catch(() => []),
        FinanceTransactions.list({ from: monthStart, to: state.selectedDate }).catch(() => []),
        Goals.list("active").catch(() => [])
      );
    }
    const results = await Promise.all(tasks);
    const [entry, logs, entriesForCycle, logsForCycle, eventsToday, recurringMasters, todosToday, monthTx, goalsActive] = results;
    state.entry = entry;
    state.habitLogs = Object.fromEntries(logs.map((l) => [l.habit_id, true]));
    allEntries = entriesForCycle || [];
    allLogs = logsForCycle || [];
    if (isToday) {
      const dayStart = new Date(`${state.selectedDate}T00:00:00`);
      const dayEnd = new Date(`${state.selectedDate}T23:59:59`);
      const plainToday = (eventsToday || []).filter((x) => !x.recurrence || !x.recurrence.freq || x.recurrence.freq === "none");
      const expandedToday = (recurringMasters || []).flatMap((m) => expandRecurrence(m, dayStart, dayEnd));
      todayEvents = [...plainToday, ...expandedToday];
      monthSpend = (monthTx || []).reduce((s, t) => s + Number(t.amount), 0);
      activeGoals = goalsActive || [];
    }
    todayTodos = todosToday || [];
  } catch (e) {
    toastError(e);
    state.entry = null;
    state.habitLogs = {};
  }

  const e = state.entry || {};
  const priorities = e.priorities?.length ? e.priorities : ["", "", ""];
  const gratitude = e.gratitude?.length ? e.gratitude : ["", "", ""];

  const entryDates = new Set(allEntries.filter((x) => x.priorities?.length || x.gratitude?.length || x.intention || x.wins || x.lessons).map((x) => x.entry_date));
  const journalStreak = computeStreak(entryDates, todayIso());

  const habitDates = {};
  allLogs.forEach((l) => {
    (habitDates[l.habit_id] ||= new Set()).add(l.log_date);
  });

  const hasCode = (cycle.standards?.length || cycle.identity_statement) ? true : false;

  const skill = skillOfWeek(state.selectedDate);

  body.innerHTML = `
    <div class="card" style="margin-bottom:16px;background:var(--accent-soft);border-color:transparent;">
      <div style="font-style:italic;">"${escapeHtml(quoteOfDay(state.selectedDate).t)}"</div>
      ${quoteOfDay(state.selectedDate).a ? `<div class="faint" style="margin-top:4px;">— ${escapeHtml(quoteOfDay(state.selectedDate).a)}</div>` : ""}
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:8px;">
        <span style="flex:0 0 auto;">🧠</span>
        <div><span class="faint">FAKT DNE</span><div>${escapeHtml(factOfDay(state.selectedDate))}</div></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px;display:flex;align-items:center;gap:12px;">
      <div style="font-size:22px;flex:0 0 auto;">🎯</div>
      <div class="grow">
        <div class="faint">DOVEDNOST TÝDNE</div>
        <b>${escapeHtml(skill.title)}</b>
      </div>
      <button class="btn btn-sm" id="sj-skill-open" type="button">Naučit se</button>
    </div>

    ${
      hasCode
        ? `<div class="card" style="margin-bottom:16px;">
            ${cycle.identity_statement ? `<div class="faint" style="margin-bottom:4px;">KÝM SE STÁVÁM</div><div style="margin-bottom:${cycle.standards?.length ? "10px" : "0"};">${escapeHtml(cycle.identity_statement)}</div>` : ""}
            ${
              cycle.standards?.length
                ? `<div class="faint" style="margin-bottom:4px;">MŮJ KODEX</div>
                   <ul style="margin:0;padding-left:18px;">${cycle.standards.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
                : ""
            }
          </div>`
        : ""
    }

    <div class="toolbar" style="margin-bottom:14px;">
      <button class="btn btn-icon" id="sj-prev-day" ${state.selectedDate <= minDate ? "disabled" : ""}>←</button>
      <input type="date" id="sj-date" value="${state.selectedDate}" min="${minDate}" max="${cycle.end_date}" />
      <button class="btn btn-icon" id="sj-next-day" ${state.selectedDate >= maxDate ? "disabled" : ""}>→</button>
      <button class="btn btn-sm" id="sj-today-btn">Dnes</button>
      ${journalStreak > 0 ? `<span class="pill" style="margin-left:auto;">🔥 ${journalStreak} ${journalStreak === 1 ? "den" : journalStreak < 5 ? "dny" : "dní"} v řadě</span>` : ""}
      <span class="faint" id="sj-save-status" ${journalStreak > 0 ? "" : 'style="margin-left:auto;"'}></span>
    </div>

    ${
      isToday
        ? `<div class="card" style="margin-bottom:16px;">
            <div class="faint" style="margin-bottom:8px;">PŘEHLED — KDE PRÁVĚ STOJÍŠ</div>
            <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;">
              <a href="#/calendar" class="action">📅 ${todayEvents.length} ${todayEvents.length === 1 ? "událost" : "události"} v kalendáři</a>
              <a href="#/todos" class="action">✅ ${todayTodos.length} nesplněných úkolů na dnes</a>
              <a href="#/finance" class="action">💰 ${(monthSpend ?? 0).toLocaleString("cs-CZ")} Kč tento měsíc</a>
              <a href="#/goals" class="action">🏆 ${activeGoals.length} ${activeGoals.length === 1 ? "aktivní cíl" : "aktivních cílů"}</a>
            </div>
            ${
              activeGoals.length
                ? `<div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
                    ${activeGoals.slice(0, 3).map((g) => `
                      <div>
                        <div style="display:flex;justify-content:space-between;font-size:13px;"><span>${escapeHtml(g.title)}</span><span class="faint">${g.progress}%</span></div>
                        <div class="progress-bar" style="margin-top:2px;"><div style="width:${g.progress}%"></div></div>
                      </div>
                    `).join("")}
                  </div>`
                : ""
            }
          </div>`
        : ""
    }

    ${(() => {
      const doneCount = state.habits.filter((h) => state.habitLogs[h.id]).length;
      const total = state.habits.length;
      const pct = total ? Math.round((doneCount / total) * 100) : 0;
      if (!total) {
        return `<div class="card" style="margin-bottom:16px;">
          <h3 style="margin-top:0;">☀️ Ranní rutina</h3>
          <div class="faint">Cyklus zatím nemá žádnou ranní rutinu. Přidej ji v „Upravit cyklus" — např. ustlat postel, skincare, snídaně, sklenice vody…</div>
        </div>`;
      }
      return `<div class="card" style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px;">
          <h3 style="margin:0;">☀️ Ranní rutina</h3>
          <span class="${doneCount === total ? "pill" : "faint"}">${doneCount === total ? "💪 Rutina hotová" : `${doneCount}/${total} splněno`}</span>
        </div>
        <div class="progress-bar" style="margin-bottom:12px;"><div style="width:${pct}%;"></div></div>
        <div class="list" id="sj-habits-list">
          ${state.habits
            .map((h) => {
              const streak = computeStreak(habitDates[h.id] || new Set(), state.selectedDate);
              const done = !!state.habitLogs[h.id];
              return `<label class="list-item routine-item ${done ? "done" : ""}">
                <input type="checkbox" class="sj-habit-check routine-check" data-habit="${h.id}" ${done ? "checked" : ""} />
                <div class="grow">${h.icon ? h.icon + " " : ""}${escapeHtml(h.name)}</div>
                ${streak > 0 ? `<span class="faint">🔥 ${streak}</span>` : ""}
              </label>`;
            })
            .join("")}
        </div>
      </div>`;
    })()}

    <div class="grid grid-2">
      <div class="card">
        <h3 style="margin-top:0;">📝 Denní plán</h3>
        <label>3 priority dneška</label>
        ${priorities
          .slice(0, 3)
          .map((p, i) => `<input type="text" class="sj-priority" data-i="${i}" placeholder="Priorita ${i + 1}" value="${escapeHtml(p)}" style="margin-bottom:6px;" />`)
          .join("")}
        <label style="margin-top:10px;">Za co jsem dnes vděčný</label>
        ${gratitude
          .slice(0, 3)
          .map((g, i) => `<input type="text" class="sj-gratitude" data-i="${i}" placeholder="Vděčnost ${i + 1}" value="${escapeHtml(g)}" style="margin-bottom:6px;" />`)
          .join("")}
        <label style="margin-top:10px;">Dnešní záměr / afirmace</label>
        <textarea id="sj-intention" rows="2" placeholder="Dnes se rozhoduji…">${escapeHtml(e.intention || "")}</textarea>
        <label style="margin-top:10px;">Překážky dne (nepovinné)</label>
        <textarea id="sj-obstacles" rows="2" placeholder="Co mě dnes může vykolejit a co udělám místo toho…">${escapeHtml(e.obstacles || "")}</textarea>
      </div>

      <div class="card">
        <h3 style="margin-top:0;">🌙 Večer</h3>
        <label>Dodržel jsem dnešní plán? Co se povedlo</label>
        <textarea id="sj-wins" rows="2" placeholder="Dnešní výhry…">${escapeHtml(e.wins || "")}</textarea>
        <label style="margin-top:10px;">Co jsem se naučil / co příště jinak (buď k sobě upřímný)</label>
        <textarea id="sj-lessons" rows="2">${escapeHtml(e.lessons || "")}</textarea>
        <label style="margin-top:10px;">Hlavní zaměření na zítra</label>
        <input type="text" id="sj-tomorrow" value="${escapeHtml(e.tomorrow_focus || "")}" />
        <label style="margin-top:10px;">Jak hodnotíš dnešní den</label>
        <div class="toolbar" id="sj-rating">
          ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="btn btn-icon sj-star" data-n="${n}">${(e.rating || 0) >= n ? "★" : "☆"}</button>`).join("")}
        </div>
      </div>
    </div>
  `;

  let ratingValue = e.rating || 0;
  const statusEl = body.querySelector("#sj-save-status");
  let saveTimer = null;

  function scheduleSave() {
    statusEl.textContent = "Ukládám…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 500);
  }

  async function save() {
    const fields = {
      cycle_id: cycle.id,
      priorities: [...body.querySelectorAll(".sj-priority")].map((i) => i.value.trim()).filter(Boolean),
      gratitude: [...body.querySelectorAll(".sj-gratitude")].map((i) => i.value.trim()).filter(Boolean),
      intention: body.querySelector("#sj-intention").value.trim() || null,
      obstacles: body.querySelector("#sj-obstacles").value.trim() || null,
      wins: body.querySelector("#sj-wins").value.trim() || null,
      lessons: body.querySelector("#sj-lessons").value.trim() || null,
      tomorrow_focus: body.querySelector("#sj-tomorrow").value.trim() || null,
      rating: ratingValue || null,
    };
    try {
      state.entry = await JournalEntries.upsert(state.selectedDate, fields);
      statusEl.textContent = "Uloženo ✓";
    } catch (err) {
      statusEl.textContent = "";
      toastError(err);
    }
  }

  body.querySelectorAll("input[type=text], textarea").forEach((inp) => inp.addEventListener("input", scheduleSave));

  function drawStars() {
    body.querySelectorAll(".sj-star").forEach((btn) => {
      const n = Number(btn.dataset.n);
      btn.textContent = ratingValue >= n ? "★" : "☆";
    });
  }
  body.querySelectorAll(".sj-star").forEach((btn) =>
    btn.addEventListener("click", () => {
      const n = Number(btn.dataset.n);
      ratingValue = ratingValue === n ? 0 : n;
      drawStars();
      scheduleSave();
    })
  );

  function updateRoutineProgress() {
    const checks = [...body.querySelectorAll(".sj-habit-check")];
    if (!checks.length) return;
    const done = checks.filter((c) => c.checked).length;
    const total = checks.length;
    const pct = Math.round((done / total) * 100);
    const bar = body.querySelector(".routine-item")?.closest(".card")?.querySelector(".progress-bar > div");
    if (bar) bar.style.width = `${pct}%`;
    const badge = body.querySelector(".routine-item")?.closest(".card")?.querySelector("h3")?.nextElementSibling;
    if (badge) {
      if (done === total) {
        badge.className = "pill";
        badge.textContent = "💪 Rutina hotová";
      } else {
        badge.className = "faint";
        badge.textContent = `${done}/${total} splněno`;
      }
    }
  }

  body.querySelectorAll(".sj-habit-check").forEach((cb) =>
    cb.addEventListener("change", async () => {
      try {
        await JournalHabitLogs.toggle(cb.dataset.habit, state.selectedDate, cb.checked);
        cb.closest(".list-item").classList.toggle("done", cb.checked);
        updateRoutineProgress();
      } catch (err) {
        toastError(err);
        cb.checked = !cb.checked;
      }
    })
  );

  body.querySelector("#sj-date").addEventListener("change", (ev) => {
    state.selectedDate = ev.target.value;
    renderTodayTab(container, body);
  });
  body.querySelector("#sj-prev-day").addEventListener("click", () => {
    state.selectedDate = addDaysIso(state.selectedDate, -1);
    renderTodayTab(container, body);
  });
  body.querySelector("#sj-next-day").addEventListener("click", () => {
    state.selectedDate = addDaysIso(state.selectedDate, 1);
    renderTodayTab(container, body);
  });
  body.querySelector("#sj-today-btn").addEventListener("click", () => {
    state.selectedDate = todayIso();
    renderTodayTab(container, body);
  });
  body.querySelector("#sj-skill-open").addEventListener("click", () => {
    openModal(`
      <div class="modal-header"><h3>🎯 ${escapeHtml(skill.title)}</h3></div>
      <div style="white-space:pre-line;line-height:1.55;">${escapeHtml(skill.body)}</div>
      <div class="modal-actions"><button class="btn btn-primary" data-close>Rozumím</button></div>
    `);
  });
}

// Týdenní review — styl Full Focus Planneru: jednou týdně se zastavíš,
// zhodnotíš uplynulý týden (co fungovalo / co ne) a nastavíš tři hlavní
// cíle na týden příští, místo aby ses spoléhal jen na denní zápisy.
async function renderWeekTab(container, body) {
  body.innerHTML = `<div class="center" style="padding:40px;"><div class="spinner"></div></div>`;
  const cycle = state.cycle;
  const weekStart = mondayOfWeek(todayIso());
  const weekEnd = addDaysIso(weekStart, 6);

  let review = null;
  let entries = [];
  let logs = [];
  try {
    [review, entries, logs] = await Promise.all([
      JournalWeeklyReviews.getByWeekStart(weekStart),
      JournalEntries.listByCycle(cycle.id),
      JournalHabitLogs.listForRange(weekStart, weekEnd),
    ]);
  } catch (e) {
    toastError(e);
  }

  const weekEntries = entries.filter((x) => x.entry_date >= weekStart && x.entry_date <= weekEnd);
  const filledDays = weekEntries.filter((x) => x.priorities?.length || x.gratitude?.length || x.intention || x.wins || x.lessons).length;
  const ratedDays = weekEntries.filter((x) => x.rating);
  const avgRating = ratedDays.length ? (ratedDays.reduce((s, x) => s + x.rating, 0) / ratedDays.length).toFixed(1) : "–";
  const habitTotal = state.habits.length * 7;
  const habitDone = logs.length;
  const habitPct = habitTotal ? Math.round((habitDone / habitTotal) * 100) : 0;

  const r = review || {};
  const big3 = r.next_week_big3?.length ? r.next_week_big3 : ["", "", ""];

  body.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="faint">TENTO TÝDEN</div>
      <div style="margin:2px 0 10px;font-weight:600;">${fmtDate(weekStart)} – ${fmtDate(weekEnd)}</div>
      <div class="grid grid-3">
        <div class="center" style="flex-direction:column;"><b style="font-size:20px;">${filledDays}/7</b><span class="faint">vyplněných dní</span></div>
        <div class="center" style="flex-direction:column;"><b style="font-size:20px;">${avgRating}</b><span class="faint">průměrné hodnocení</span></div>
        <div class="center" style="flex-direction:column;"><b style="font-size:20px;">${habitPct}%</b><span class="faint">plnění návyků</span></div>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h3 style="margin-top:0;">Ohlédnutí za týdnem</h3>
        <label>Co se tento týden povedlo</label>
        <textarea id="wr-wins" rows="3" placeholder="Vítězství, malá i velká…">${escapeHtml(r.wins || "")}</textarea>
        <label style="margin-top:10px;">Co nefungovalo / na čem zapracovat</label>
        <textarea id="wr-improve" rows="3">${escapeHtml(r.improve || "")}</textarea>
      </div>
      <div class="card">
        <h3 style="margin-top:0;">Co dál</h3>
        <label>Co si nechat (funguje to)</label>
        <textarea id="wr-keep" rows="2">${escapeHtml(r.keep_actions || "")}</textarea>
        <label style="margin-top:10px;">Co přestat dělat (brzdí tě to)</label>
        <textarea id="wr-stop" rows="2">${escapeHtml(r.stop_actions || "")}</textarea>
        <label style="margin-top:10px;">3 hlavní cíle na příští týden</label>
        ${big3
          .slice(0, 3)
          .map((g, i) => `<input type="text" class="wr-big3" data-i="${i}" placeholder="Cíl ${i + 1}" value="${escapeHtml(g)}" style="margin-bottom:6px;" />`)
          .join("")}
      </div>
    </div>
    <div class="faint" id="wr-save-status" style="margin-top:10px;"></div>
  `;

  const statusEl = body.querySelector("#wr-save-status");
  let saveTimer = null;
  function scheduleSave() {
    statusEl.textContent = "Ukládám…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 500);
  }
  async function save() {
    const fields = {
      cycle_id: cycle.id,
      wins: body.querySelector("#wr-wins").value.trim() || null,
      improve: body.querySelector("#wr-improve").value.trim() || null,
      keep_actions: body.querySelector("#wr-keep").value.trim() || null,
      stop_actions: body.querySelector("#wr-stop").value.trim() || null,
      next_week_big3: [...body.querySelectorAll(".wr-big3")].map((i) => i.value.trim()).filter(Boolean),
    };
    try {
      await JournalWeeklyReviews.upsert(weekStart, fields);
      statusEl.textContent = "Uloženo ✓";
    } catch (err) {
      statusEl.textContent = "";
      toastError(err);
    }
  }
  body.querySelectorAll("textarea, .wr-big3").forEach((inp) => inp.addEventListener("input", scheduleSave));
}

async function renderOverviewTab(container, body) {
  body.innerHTML = `<div class="center" style="padding:40px;"><div class="spinner"></div></div>`;
  const cycle = state.cycle;
  const len = cycleLength(cycle);

  let entries = [];
  let logs = [];
  try {
    [entries, logs] = await Promise.all([
      JournalEntries.listByCycle(cycle.id),
      JournalHabitLogs.listForRange(cycle.start_date, cycle.end_date),
    ]);
  } catch (e) {
    toastError(e);
  }
  const byDate = Object.fromEntries(entries.map((e) => [e.entry_date, e]));
  const doneDays = entries.length;
  const avgRating = entries.filter((e) => e.rating).length
    ? (entries.reduce((s, e) => s + (e.rating || 0), 0) / entries.filter((e) => e.rating).length).toFixed(1)
    : "–";
  const habitDoneCount = {};
  logs.forEach((l) => (habitDoneCount[l.habit_id] = (habitDoneCount[l.habit_id] || 0) + 1));

  const cells = [];
  for (let i = 1; i <= len; i++) {
    const dateIso = addDaysIso(cycle.start_date, i - 1);
    const entry = byDate[dateIso];
    const isFuture = dateIso > todayIso();
    let cls = "sj-day-empty";
    if (entry) cls = entry.rating ? `sj-day-r${entry.rating}` : "sj-day-filled";
    else if (isFuture) cls = "sj-day-future";
    cells.push(`<div class="sj-day ${cls}" data-date="${dateIso}" title="Den ${i} · ${fmtDate(dateIso)}">${i}</div>`);
  }

  body.innerHTML = `
    <div class="grid grid-3" style="margin-bottom:18px;">
      <div class="card center" style="flex-direction:column;"><b style="font-size:22px;">${doneDays}/${len}</b><span class="faint">vyplněných dní</span></div>
      <div class="card center" style="flex-direction:column;"><b style="font-size:22px;">${avgRating}</b><span class="faint">průměrné hodnocení</span></div>
      <div class="card center" style="flex-direction:column;"><b style="font-size:22px;">${Math.round((doneDays / len) * 100)}%</b><span class="faint">postup cyklem</span></div>
    </div>
    <div class="card" style="margin-bottom:18px;">
      <h3 style="margin-top:0;">90 dní</h3>
      <div class="sj-day-grid">${cells.join("")}</div>
    </div>
    ${
      state.habits.length
        ? `<div class="card">
            <h3 style="margin-top:0;">Ranní rutina za tento cyklus</h3>
            <div class="list">
              ${state.habits
                .map(
                  (h) => `<div class="list-item">
                    <div class="grow">${h.icon ? h.icon + " " : ""}${escapeHtml(h.name)}</div>
                    <span class="pill">${habitDoneCount[h.id] || 0}/${len}</span>
                  </div>`
                )
                .join("")}
            </div>
          </div>`
        : ""
    }
  `;

  body.querySelectorAll(".sj-day").forEach((cell) =>
    cell.addEventListener("click", () => {
      if (cell.dataset.date > todayIso()) return;
      state.selectedDate = cell.dataset.date;
      state.tab = "today";
      renderShell(container);
    })
  );
}

async function renderHistoryTab(container, body) {
  body.innerHTML = `<div class="center" style="padding:40px;"><div class="spinner"></div></div>`;
  try {
    const cycles = await JournalCycles.list();
    if (!cycles.length) {
      body.innerHTML = `<div class="empty-state"><div class="big">📗</div>Zatím žádné cykly.</div>`;
      return;
    }
    body.innerHTML = `<div class="list">
      ${cycles
        .map(
          (c) => `<div class="list-item">
            <div class="grow">
              <div class="title">${escapeHtml(c.title)} ${c.id === state.cycle?.id ? '<span class="pill">aktivní</span>' : ""}</div>
              <div class="faint">${fmtDate(c.start_date)} – ${fmtDate(c.end_date)} · ${c.status === "completed" ? "dokončeno" : c.status === "archived" ? "archivováno" : "aktivní"}</div>
            </div>
            ${
              c.status === "active"
                ? `<button class="btn btn-sm" data-complete="${c.id}">Dokončit</button>`
                : `<button class="btn btn-sm" data-reactivate="${c.id}">Obnovit jako aktivní</button>`
            }
            <button class="btn btn-icon btn-ghost btn-sm" data-del-cycle="${c.id}">✕</button>
          </div>`
        )
        .join("")}
    </div>
    <button class="btn btn-primary" id="new-cycle-from-history" style="margin-top:14px;">+ Nový 90denní cyklus</button>
    `;
    body.querySelector("#new-cycle-from-history").addEventListener("click", () => openCycleModal(container));
    body.querySelectorAll("[data-complete]").forEach((b) =>
      b.addEventListener("click", async () => {
        await JournalCycles.update(b.dataset.complete, { status: "completed" });
        render(container);
      })
    );
    body.querySelectorAll("[data-reactivate]").forEach((b) =>
      b.addEventListener("click", async () => {
        const current = await JournalCycles.getActive();
        if (current) await JournalCycles.update(current.id, { status: "archived" });
        await JournalCycles.update(b.dataset.reactivate, { status: "active" });
        render(container);
      })
    );
    body.querySelectorAll("[data-del-cycle]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (await confirmDialog("Smazat tento cyklus i se všemi zápisy?")) {
          await JournalCycles.remove(b.dataset.delCycle);
          render(container);
        }
      })
    );
  } catch (e) {
    toastError(e);
  }
}

async function openCycleModal(container, cycle) {
  const isNew = !cycle;
  let goals = cycle?.goals?.length ? [...cycle.goals] : ["", "", ""];
  let standards = cycle?.standards?.length ? [...cycle.standards] : ["", "", ""];
  let habits = [];
  if (!isNew) {
    try {
      habits = (await JournalHabits.listByCycle(cycle.id)).map((h) => ({ id: h.id, name: h.name, icon: h.icon || "" }));
    } catch {}
  }
  if (!habits.length) {
    // Nová rutina se předvyplní běžnými rannými návyky, aby s tím šlo hned
    // začít — uživatel si je klidně přejmenuje nebo smaže.
    habits = [
      { name: "Ustlat postel", icon: "🛏️" },
      { name: "Ranní hygiena / skincare", icon: "🧴" },
      { name: "Snídaně", icon: "🍳" },
      { name: "Sklenice vody", icon: "💧" },
      { name: "10 minut bez telefonu", icon: "📵" },
    ];
  }

  const start = cycle?.start_date || todayIso();
  const defaultEnd = addDaysIso(start, 89);

  const { el: modalEl, close } = openModal(
    `<div class="modal-header"><h3>${isNew ? "Nový 90denní cyklus" : "Upravit cyklus"}</h3><button class="btn btn-icon btn-ghost" data-close>✕</button></div>
     <div class="field"><label>Název cyklu</label><input type="text" id="cyc-title" value="${escapeHtml(cycle?.title || "")}" placeholder="např. Podzim 2026" /></div>
     <div class="row">
       <div class="field"><label>Začátek</label><input type="date" id="cyc-start" value="${start}" /></div>
       <div class="field"><label>Konec (auto, 90 dní)</label><input type="date" id="cyc-end" value="${cycle?.end_date || defaultEnd}" disabled /></div>
     </div>
     <div class="field"><label>Zaměření / vize cyklu</label><textarea id="cyc-theme" rows="2" placeholder="Na co se v těchto 90 dnech soustředím…">${escapeHtml(cycle?.theme || "")}</textarea></div>
     <div class="field"><label>Kým se chci stát (identita, ne jen výsledek)</label><textarea id="cyc-identity" rows="2" placeholder="např. Jsem člověk, který dodržuje sliby sám sobě…">${escapeHtml(cycle?.identity_statement || "")}</textarea></div>
     <div class="field">
       <label>Cíle cyklu</label>
       <div id="cyc-goals">
         ${goals.map((g, i) => `<input type="text" class="cyc-goal" data-i="${i}" value="${escapeHtml(g)}" placeholder="Cíl ${i + 1}" style="margin-bottom:6px;" />`).join("")}
       </div>
     </div>
     <div class="field">
       <label>Můj kodex (osobní pravidla, kterých se nevzdávám)</label>
       <div id="cyc-standards">
         ${standards.map((st, i) => `<input type="text" class="cyc-standard" data-i="${i}" value="${escapeHtml(st)}" placeholder="Pravidlo ${i + 1}, např. Nevynechám ranní trénink" style="margin-bottom:6px;" />`).join("")}
       </div>
     </div>
     <div class="field">
       <label>Ranní rutina (co si každé ráno odškrtneš)</label>
       <div id="cyc-habits">
         ${habits
           .map(
             (h, i) => `<div class="row" data-habit-row="${i}" style="margin-bottom:6px;">
               <input type="text" class="cyc-habit-icon" value="${escapeHtml(h.icon || "")}" placeholder="🏃" style="flex:0 0 54px;" />
               <input type="text" class="cyc-habit-name" value="${escapeHtml(h.name || "")}" placeholder="Položka rutiny, např. Protažení" />
             </div>`
           )
           .join("")}
       </div>
       <button type="button" class="btn btn-ghost btn-sm" id="add-habit-row">+ Další položka</button>
     </div>
     <div class="modal-actions">
       ${!isNew ? `<button class="btn btn-danger" id="cyc-delete" style="margin-right:auto;">Smazat cyklus</button>` : ""}
       <button class="btn" data-close>Zrušit</button>
       <button class="btn btn-primary" id="cyc-save">${isNew ? "Spustit cyklus" : "Uložit"}</button>
     </div>`,
    { large: true }
  );

  modalEl.querySelector("#cyc-start").addEventListener("change", (e) => {
    modalEl.querySelector("#cyc-end").value = addDaysIso(e.target.value, 89);
  });

  modalEl.querySelector("#add-habit-row").addEventListener("click", () => {
    const wrap = modalEl.querySelector("#cyc-habits");
    const row = document.createElement("div");
    row.className = "row";
    row.style.marginBottom = "6px";
    row.innerHTML = `<input type="text" class="cyc-habit-icon" placeholder="🏃" style="flex:0 0 54px;" /><input type="text" class="cyc-habit-name" placeholder="Položka rutiny, např. Protažení" />`;
    wrap.appendChild(row);
  });

  modalEl.querySelector("#cyc-save").addEventListener("click", async () => {
    const title = modalEl.querySelector("#cyc-title").value.trim() || "Nový cyklus";
    const startDate = modalEl.querySelector("#cyc-start").value;
    const endDate = modalEl.querySelector("#cyc-end").value || addDaysIso(startDate, 89);
    const theme = modalEl.querySelector("#cyc-theme").value.trim() || null;
    const identityStatement = modalEl.querySelector("#cyc-identity").value.trim() || null;
    const goalsVal = [...modalEl.querySelectorAll(".cyc-goal")].map((i) => i.value.trim()).filter(Boolean);
    const standardsVal = [...modalEl.querySelectorAll(".cyc-standard")].map((i) => i.value.trim()).filter(Boolean);
    const habitNames = [...modalEl.querySelectorAll(".cyc-habit-name")];
    const habitIcons = [...modalEl.querySelectorAll(".cyc-habit-icon")];

    try {
      let savedCycle;
      if (isNew) {
        const current = await JournalCycles.getActive();
        if (current) await JournalCycles.update(current.id, { status: "archived" });
        savedCycle = await JournalCycles.create({
          title,
          start_date: startDate,
          end_date: endDate,
          theme,
          identity_statement: identityStatement,
          goals: goalsVal,
          standards: standardsVal,
          status: "active",
        });
      } else {
        savedCycle = await JournalCycles.update(cycle.id, { title, theme, identity_statement: identityStatement, goals: goalsVal, standards: standardsVal });
      }

      if (isNew) {
        for (let i = 0; i < habitNames.length; i++) {
          const name = habitNames[i].value.trim();
          if (!name) continue;
          await JournalHabits.create({ cycle_id: savedCycle.id, name, icon: habitIcons[i].value.trim() || null, sort_order: i });
        }
      } else {
        const existing = await JournalHabits.listByCycle(cycle.id);
        for (let i = 0; i < habitNames.length; i++) {
          const name = habitNames[i].value.trim();
          const icon = habitIcons[i].value.trim() || null;
          const existingHabit = existing[i];
          if (!name) {
            if (existingHabit) await JournalHabits.remove(existingHabit.id);
            continue;
          }
          if (existingHabit) await JournalHabits.update(existingHabit.id, { name, icon });
          else await JournalHabits.create({ cycle_id: cycle.id, name, icon, sort_order: i });
        }
      }

      toast(isNew ? "Cyklus spuštěn 🎉" : "Cyklus uložen", "success");
      close();
      render(container);
    } catch (e) {
      toastError(e);
    }
  });

  if (!isNew) {
    modalEl.querySelector("#cyc-delete").addEventListener("click", async () => {
      if (await confirmDialog("Smazat tento cyklus i se všemi zápisy a návyky?")) {
        await JournalCycles.remove(cycle.id);
        close();
        render(container);
      }
    });
  }
}
