import { Recipes } from "../db.js";
import { escapeHtml, openModal, confirmDialog } from "../ui.js";
import { toast, toastError } from "../toast.js";
import { addIngredientsToShoppingList } from "./shopping.js";

const MEALDB_BASE = "https://www.themealdb.com/api/json/v1/1";

const MEALTIME_LABEL = { breakfast: "🌅 Snídaně", lunch_dinner: "🍽️ Oběd / Večeře", snack: "🥐 Svačina / Předkrm" };
const DIFF_LABEL = { easy: "🟢 Snadné", medium: "🟡 Střední", hard: "🔴 Náročné" };

let tab = "mine"; // "mine" | "discover"
let search = "";

// discover state
let discoverResults = [];
let filterTime = "all";
let filterDiff = "all";
let discoverLoading = false;
let discoverQuery = "";
let discoverCategories = null; // lazy-loaded list of {name, thumb}
let activeCategory = null;

const CATEGORY_LABELS = {
  Beef: "🥩 Hovězí", Chicken: "🍗 Kuřecí", Dessert: "🍰 Dezerty", Lamb: "🐑 Jehněčí",
  Pasta: "🍝 Těstoviny", Pork: "🥓 Vepřové", Seafood: "🦐 Mořské plody", Side: "🥗 Přílohy",
  Starter: "🍤 Předkrmy", Vegan: "🌱 Veganské", Vegetarian: "🥕 Vegetariánské",
  Breakfast: "🍳 Snídaně", Goat: "🐐 Kozí", Miscellaneous: "🍲 Ostatní",
};

export async function render(container) {
  container.innerHTML = `
    <div class="section-header">
      <div class="toolbar">
        <button class="chip ${tab === "mine" ? "active" : ""}" data-tab="mine">Moje recepty</button>
        <button class="chip ${tab === "discover" ? "active" : ""}" data-tab="discover">✨ Objevit recepty</button>
      </div>
      <div class="toolbar" id="recipes-toolbar-right"></div>
    </div>
    <div id="recipes-body"></div>
  `;
  container.querySelectorAll("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      tab = b.dataset.tab;
      render(container);
    })
  );
  if (tab === "mine") await renderMineTab(container);
  else await renderDiscoverTab(container);
}

/* ============================= Moje recepty ============================= */

async function renderMineTab(container) {
  const right = container.querySelector("#recipes-toolbar-right");
  right.innerHTML = `
    <input type="search" id="recipe-search" placeholder="Hledat recept…" value="${escapeHtml(search)}" />
    <button class="btn btn-primary" id="new-recipe-btn">+ Přidat recept</button>
  `;
  right.querySelector("#recipe-search").addEventListener("input", (e) => {
    search = e.target.value;
    loadMine(container);
  });
  right.querySelector("#new-recipe-btn").addEventListener("click", () => openRecipeModal(container));
  container.querySelector("#recipes-body").innerHTML = `<div class="grid grid-3" id="recipes-grid"></div>`;
  await loadMine(container);
}

function ingredientRow(ing = {}) {
  return `<div class="row ing-row" style="margin-bottom:6px;">
    <input type="text" placeholder="Ingredience" class="ing-name" value="${escapeHtml(ing.name || "")}" />
    <input type="text" placeholder="Množství" class="ing-qty" style="max-width:110px;" value="${escapeHtml(ing.qty || "")}" />
    <button type="button" class="btn btn-icon btn-ghost remove-ing">✕</button>
  </div>`;
}

async function loadMine(container) {
  const grid = container.querySelector("#recipes-grid");
  if (!grid) return;
  try {
    const recipes = await Recipes.list(search || undefined);
    if (!recipes.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="big">📖</div>Zatím žádné recepty. Zkus taky záložku ✨ Objevit recepty.</div>`;
      return;
    }
    grid.innerHTML = recipes
      .map(
        (r) => `<div class="card" data-id="${r.id}">
          ${r.image_url ? `<div class="recipe-media"><img src="${escapeHtml(r.image_url)}" alt="" loading="lazy" /></div>` : ""}
          <b class="truncate">${escapeHtml(r.title)}</b>
          <div class="faint" style="margin-top:4px;">${r.servings ? r.servings + " porce" : ""} ${r.calories_per_serving ? "· " + r.calories_per_serving + " kcal/porci" : ""}</div>
          <div style="margin-top:8px;display:flex;gap:5px;flex-wrap:wrap;">
            ${r.meal_time ? `<span class="pill">${MEALTIME_LABEL[r.meal_time] || r.meal_time}</span>` : ""}
            ${r.difficulty ? `<span class="pill">${DIFF_LABEL[r.difficulty] || r.difficulty}</span>` : ""}
            ${(r.tags || []).map((t) => `<span class="pill">${escapeHtml(t)}</span>`).join("")}
          </div>
        </div>`
      )
      .join("");
    grid.querySelectorAll("[data-id]").forEach((c) => {
      const r = recipes.find((x) => x.id === c.dataset.id);
      c.addEventListener("click", () => openRecipeModal(container, r));
    });
  } catch (e) {
    toastError(e);
  }
}

function openRecipeModal(container, recipe) {
  const isNew = !recipe;
  const { el: modalEl, close } = openModal(
    `<div class="modal-header"><h3>${isNew ? "Nový recept" : "Upravit recept"}</h3><button class="btn btn-icon btn-ghost" data-close>✕</button></div>
     ${recipe?.image_url ? `<div class="recipe-media"><img src="${escapeHtml(recipe.image_url)}" alt="" /></div>` : ""}
     <div class="field"><label>Název</label><input type="text" id="r-title" value="${escapeHtml(recipe?.title || "")}" /></div>
     <label>Ingredience</label>
     <div id="ing-mount">${(recipe?.ingredients || [{}]).map(ingredientRow).join("")}</div>
     <button type="button" class="btn btn-sm" id="add-ing">+ Přidat ingredienci</button>
     <div class="field" style="margin-top:12px;"><label>Postup</label><textarea id="r-instructions" rows="4">${escapeHtml(recipe?.instructions || "")}</textarea></div>
     <div class="row">
       <div class="field"><label>Porce</label><input type="number" id="r-servings" value="${recipe?.servings || 1}" /></div>
       <div class="field"><label>Kcal/porci</label><input type="number" id="r-cal" value="${recipe?.calories_per_serving || ""}" /></div>
       <div class="field"><label>Bílkoviny (g)</label><input type="number" id="r-protein" value="${recipe?.protein_g || ""}" /></div>
       <div class="field"><label>Sacharidy (g)</label><input type="number" id="r-carbs" value="${recipe?.carbs_g || ""}" /></div>
       <div class="field"><label>Tuky (g)</label><input type="number" id="r-fat" value="${recipe?.fat_g || ""}" /></div>
     </div>
     <div class="field"><label>Štítky (oddělené čárkou)</label><input type="text" id="r-tags" value="${escapeHtml((recipe?.tags || []).join(", "))}" /></div>
     <div class="modal-actions">
       <button class="btn" id="r-to-shopping" style="margin-right:auto;">🛒 Přidat suroviny do nákupu</button>
       ${!isNew ? `<button class="btn btn-danger" id="r-delete">Smazat</button>` : ""}
       <button class="btn" data-close>Zrušit</button>
       <button class="btn btn-primary" id="r-save">Uložit</button>
     </div>`,
    { large: true }
  );

  const mount = modalEl.querySelector("#ing-mount");
  function wireRemove() {
    mount.querySelectorAll(".remove-ing").forEach((b) => b.addEventListener("click", () => b.closest(".ing-row").remove()));
  }
  wireRemove();
  modalEl.querySelector("#add-ing").addEventListener("click", () => {
    mount.insertAdjacentHTML("beforeend", ingredientRow());
    wireRemove();
  });

  function collectIngredients() {
    return [...mount.querySelectorAll(".ing-row")]
      .map((row) => ({ name: row.querySelector(".ing-name").value.trim(), qty: row.querySelector(".ing-qty").value.trim() }))
      .filter((i) => i.name);
  }

  modalEl.querySelector("#r-to-shopping").addEventListener("click", async () => {
    const ingredients = collectIngredients();
    if (!ingredients.length) {
      toast("Nejdřív přidej nějaké ingredience.", "error");
      return;
    }
    try {
      const title = modalEl.querySelector("#r-title").value.trim() || "Recept";
      await addIngredientsToShoppingList(ingredients, { recipeId: recipe?.id || null, recipeTitle: title });
      toast(`${ingredients.length} surovin přidáno do nákupního seznamu 🛒`, "success");
    } catch (e) {
      toastError(e);
    }
  });

  modalEl.querySelector("#r-save").addEventListener("click", async () => {
    const ingredients = collectIngredients();
    const fields = {
      title: modalEl.querySelector("#r-title").value.trim() || "Bez názvu",
      ingredients,
      instructions: modalEl.querySelector("#r-instructions").value.trim() || null,
      servings: Number(modalEl.querySelector("#r-servings").value) || 1,
      calories_per_serving: Number(modalEl.querySelector("#r-cal").value) || null,
      protein_g: Number(modalEl.querySelector("#r-protein").value) || null,
      carbs_g: Number(modalEl.querySelector("#r-carbs").value) || null,
      fat_g: Number(modalEl.querySelector("#r-fat").value) || null,
      tags: modalEl
        .querySelector("#r-tags")
        .value.split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    try {
      if (isNew) await Recipes.create(fields);
      else await Recipes.update(recipe.id, fields);
      toast("Uloženo", "success");
      close();
      render(container);
    } catch (e) {
      toastError(e);
    }
  });

  if (!isNew) {
    modalEl.querySelector("#r-delete").addEventListener("click", async () => {
      if (await confirmDialog("Smazat tento recept?")) {
        await Recipes.remove(recipe.id);
        close();
        render(container);
      }
    });
  }
}

/* ============================= Objevit recepty ============================= */

async function renderDiscoverTab(container) {
  const right = container.querySelector("#recipes-toolbar-right");
  right.innerHTML = "";
  const body = container.querySelector("#recipes-body");
  body.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="faint" style="margin-bottom:10px;">Prohledej velkou otevřenou databázi receptů (TheMealDB) podle názvu nebo si procházej celé kategorie — vždy s odhadem doby dne / obtížnosti a seznamem surovin.</div>
      <form id="discover-search-form" class="row" style="margin-bottom:10px;">
        <input type="search" id="discover-search-input" placeholder="Hledat recept podle názvu (anglicky funguje nejlépe)…" value="${escapeHtml(discoverQuery)}" />
        <button class="btn btn-primary" type="submit" style="flex:0 0 auto;">🔎 Hledat</button>
      </form>
      <div class="faint" style="margin:2px 0 6px;">Procházet kategorii:</div>
      <div class="toolbar" style="margin-bottom:10px;flex-wrap:wrap;gap:6px;" id="discover-categories">
        <span class="faint">Načítám kategorie…</span>
      </div>
      <div class="toolbar" style="margin-bottom:8px;">
        <span class="faint" style="margin-right:4px;">Doba dne:</span>
        ${chip("time", "all", "Vše")}${chip("time", "breakfast", "🌅 Snídaně")}${chip("time", "lunch_dinner", "🍽️ Oběd/Večeře")}${chip("time", "snack", "🥐 Svačina")}
      </div>
      <div class="toolbar" style="margin-bottom:8px;">
        <span class="faint" style="margin-right:4px;">Obtížnost:</span>
        ${chip("diff", "all", "Vše")}${chip("diff", "easy", "🟢 Snadné")}${chip("diff", "medium", "🟡 Střední")}${chip("diff", "hard", "🔴 Náročné")}
      </div>
      <button class="btn" id="discover-btn">${discoverResults.length ? "🔄 Náhodné nápady" : "✨ Náhodné nápady"}</button>
    </div>
    <div class="grid grid-3" id="discover-grid"></div>
  `;
  container.querySelectorAll("[data-chip]").forEach((b) =>
    b.addEventListener("click", () => {
      const [group, val] = b.dataset.chip.split("::");
      if (group === "time") filterTime = val;
      else filterDiff = val;
      renderDiscoverGrid(container);
      container.querySelectorAll(`[data-chip^="${group}::"]`).forEach((x) => x.classList.toggle("active", x.dataset.chip === b.dataset.chip));
    })
  );
  container.querySelector("#discover-btn").addEventListener("click", () => fetchDiscoverBatch(container));
  container.querySelector("#discover-search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = container.querySelector("#discover-search-input").value.trim();
    discoverQuery = q;
    if (q) searchMealsByName(container, q);
  });
  loadCategoryChips(container);
  renderDiscoverGrid(container);
}

async function loadCategoryChips(container) {
  const mount = container.querySelector("#discover-categories");
  if (!mount) return;
  try {
    if (!discoverCategories) {
      const res = await fetch(`${MEALDB_BASE}/categories.php`).then((r) => r.json());
      discoverCategories = (res?.categories || []).map((c) => c.strCategory);
    }
    mount.innerHTML = discoverCategories
      .map((name) => `<button type="button" class="chip ${activeCategory === name ? "active" : ""}" data-category="${escapeHtml(name)}">${CATEGORY_LABELS[name] || name}</button>`)
      .join("");
    mount.querySelectorAll("[data-category]").forEach((b) =>
      b.addEventListener("click", () => {
        activeCategory = activeCategory === b.dataset.category ? null : b.dataset.category;
        mount.querySelectorAll("[data-category]").forEach((x) => x.classList.toggle("active", x.dataset.category === activeCategory));
        if (activeCategory) browseCategory(container, activeCategory);
      })
    );
  } catch {
    mount.innerHTML = `<span class="faint">Kategorie se nepodařilo načíst.</span>`;
  }
}

async function searchMealsByName(container, query) {
  if (discoverLoading) return;
  discoverLoading = true;
  const btn = container.querySelector("#discover-search-form button");
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${MEALDB_BASE}/search.php?s=${encodeURIComponent(query)}`).then((r) => r.json());
    const meals = res?.meals || [];
    discoverResults = meals.map(normalizeMeal);
    if (!meals.length) toast(`Nic nenalezeno pro „${query}“. Zkus jiné (anglické) slovo, nebo procházej kategorie níže.`, "error");
  } catch (e) {
    toastError("Vyhledávání selhalo. Zkontroluj připojení a zkus to znovu.");
  } finally {
    discoverLoading = false;
    if (btn) btn.disabled = false;
    renderDiscoverGrid(container);
  }
}

async function browseCategory(container, category) {
  if (discoverLoading) return;
  discoverLoading = true;
  try {
    const res = await fetch(`${MEALDB_BASE}/filter.php?c=${encodeURIComponent(category)}`).then((r) => r.json());
    const meals = res?.meals || [];
    discoverResults = meals.map((m) => ({
      external_id: m.idMeal,
      source: "themealdb",
      title: m.strMeal,
      image_url: m.strMealThumb,
      category,
      area: null,
      ingredients: [],
      instructions: "",
      difficulty: null,
      meal_time: category === "Breakfast" ? "breakfast" : ["Starter", "Side", "Dessert"].includes(category) ? "snack" : "lunch_dinner",
      tags: [],
      _light: true,
    }));
  } catch (e) {
    toastError("Nepodařilo se načíst kategorii. Zkontroluj připojení a zkus to znovu.");
  } finally {
    discoverLoading = false;
    renderDiscoverGrid(container);
  }
}

async function loadFullMeal(externalId) {
  const res = await fetch(`${MEALDB_BASE}/lookup.php?i=${encodeURIComponent(externalId)}`).then((r) => r.json());
  const meal = res?.meals?.[0];
  if (!meal) throw new Error("Recept se nepodařilo načíst.");
  return normalizeMeal(meal);
}

function chip(group, val, label) {
  const active = (group === "time" ? filterTime : filterDiff) === val;
  return `<button class="chip ${active ? "active" : ""}" data-chip="${group}::${val}">${label}</button>`;
}

async function fetchDiscoverBatch(container) {
  if (discoverLoading) return;
  discoverLoading = true;
  const btn = container.querySelector("#discover-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Stahuji…";
  }
  try {
    const calls = Array.from({ length: 9 }, () => fetch(`${MEALDB_BASE}/random.php`).then((r) => r.json()));
    const results = await Promise.all(calls);
    const existingIds = new Set(discoverResults.map((m) => m.external_id));
    for (const res of results) {
      const meal = res?.meals?.[0];
      if (!meal || existingIds.has(meal.idMeal)) continue;
      existingIds.add(meal.idMeal);
      discoverResults.push(normalizeMeal(meal));
    }
  } catch (e) {
    toastError("Nepodařilo se stáhnout recepty z internetu. Zkontroluj připojení a zkus to znovu.");
  } finally {
    discoverLoading = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🔄 Načíst další nápady";
    }
    renderDiscoverGrid(container);
  }
}

function normalizeMeal(m) {
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const name = (m[`strIngredient${i}`] || "").trim();
    const qty = (m[`strMeasure${i}`] || "").trim();
    if (name) ingredients.push({ name, qty });
  }
  const instructions = (m.strInstructions || "").trim();
  const ingCount = ingredients.length;
  const instrLen = instructions.length;
  let difficulty = "medium";
  if (ingCount <= 6 && instrLen < 400) difficulty = "easy";
  else if (ingCount >= 12 || instrLen > 1200) difficulty = "hard";
  const cat = m.strCategory || "";
  let meal_time = "lunch_dinner";
  if (cat === "Breakfast") meal_time = "breakfast";
  else if (["Starter", "Side", "Dessert"].includes(cat)) meal_time = "snack";
  return {
    external_id: m.idMeal,
    source: "themealdb",
    title: m.strMeal,
    image_url: m.strMealThumb,
    category: cat,
    area: m.strArea || null,
    ingredients,
    instructions,
    difficulty,
    meal_time,
    tags: (m.strTags || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

function renderDiscoverGrid(container) {
  const grid = container.querySelector("#discover-grid");
  if (!grid) return;
  const filtered = discoverResults.filter(
    (m) => (m._light || filterTime === "all" || m.meal_time === filterTime) && (m._light || filterDiff === "all" || m.difficulty === filterDiff)
  );
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="big">✨</div>${
      discoverResults.length ? "Žádné recepty neodpovídají filtru — zkus jiný, nebo hledej/procházej znovu." : "Vyhledej recept podle názvu, procházej kategorii, nebo klikni na „Náhodné nápady“."
    }</div>`;
    return;
  }
  grid.innerHTML = filtered
    .map(
      (m, i) => `<div class="card" data-idx="${discoverResults.indexOf(m)}">
        <div class="recipe-media"><img src="${escapeHtml(m.image_url)}" alt="" loading="lazy" /></div>
        <b class="truncate">${escapeHtml(m.title)}</b>
        <div class="faint" style="margin-top:4px;">${escapeHtml(m.area || "")} ${m.category ? "· " + escapeHtml(m.category) : ""}</div>
        <div style="margin-top:8px;display:flex;gap:5px;flex-wrap:wrap;">
          <span class="pill">${MEALTIME_LABEL[m.meal_time]}</span>
          ${m._light ? "" : `<span class="pill">${DIFF_LABEL[m.difficulty]}</span><span class="pill">${m.ingredients.length} surovin</span>`}
        </div>
      </div>`
    )
    .join("");
  grid.querySelectorAll("[data-idx]").forEach((c) =>
    c.addEventListener("click", () => openDiscoverModal(container, discoverResults[Number(c.dataset.idx)]))
  );
}

async function openDiscoverModal(container, meal) {
  if (meal._light) {
    try {
      const full = await loadFullMeal(meal.external_id);
      Object.assign(meal, full);
      delete meal._light;
    } catch (e) {
      toastError(e);
      return;
    }
  }
  const { el: modalEl, close } = openModal(
    `<div class="modal-header"><h3 class="truncate">${escapeHtml(meal.title)}</h3><button class="btn btn-icon btn-ghost" data-close>✕</button></div>
     <div class="recipe-media"><img src="${escapeHtml(meal.image_url)}" alt="" /></div>
     <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;">
       <span class="pill">${MEALTIME_LABEL[meal.meal_time]}</span>
       <span class="pill">${DIFF_LABEL[meal.difficulty]} (odhad)</span>
       ${meal.area ? `<span class="pill">${escapeHtml(meal.area)}</span>` : ""}
       ${meal.category ? `<span class="pill">${escapeHtml(meal.category)}</span>` : ""}
     </div>
     <label>Co potřebuješ</label>
     <div class="recipe-ing-list">
       ${meal.ingredients.map((ing) => `<div class="list-item"><span class="grow">${escapeHtml(ing.name)}</span><span class="faint">${escapeHtml(ing.qty)}</span></div>`).join("")}
     </div>
     <label style="margin-top:10px;">Postup</label>
     <p class="muted" style="white-space:pre-line;">${escapeHtml(meal.instructions)}</p>
     <div class="modal-actions">
       <button class="btn" id="d-to-shopping" style="margin-right:auto;">🛒 Přidat do nákupního seznamu</button>
       <button class="btn" data-close>Zavřít</button>
       <button class="btn btn-primary" id="d-save">💾 Uložit recept</button>
     </div>`,
    { large: true }
  );

  modalEl.querySelector("#d-to-shopping").addEventListener("click", async () => {
    try {
      await addIngredientsToShoppingList(meal.ingredients, { recipeTitle: meal.title });
      toast(`${meal.ingredients.length} surovin přidáno do nákupního seznamu 🛒`, "success");
    } catch (e) {
      toastError(e);
    }
  });

  modalEl.querySelector("#d-save").addEventListener("click", async () => {
    try {
      await Recipes.create({
        title: meal.title,
        ingredients: meal.ingredients,
        instructions: meal.instructions,
        tags: meal.tags,
        image_url: meal.image_url,
        source: meal.source,
        external_id: meal.external_id,
        category: meal.category,
        area: meal.area,
        meal_time: meal.meal_time,
        difficulty: meal.difficulty,
      });
      toast("Recept uložen do Mých receptů 💾", "success");
    } catch (e) {
      if (e?.code === "23505" || /duplicate key/i.test(e?.message || "")) {
        toast("Tenhle recept už máš uložený.", "success");
      } else {
        toastError(e);
      }
    }
  });
}
