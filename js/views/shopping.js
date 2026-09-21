import { ShoppingItems, Recipes } from "../db.js";
import { escapeHtml, openModal, confirmDialog } from "../ui.js";
import { toast, toastError } from "../toast.js";

const LAST_LIST_KEY = "pw-shopping-last-list";

function getStoredList() {
  try {
    return localStorage.getItem(LAST_LIST_KEY) || "Nákupy";
  } catch {
    return "Nákupy";
  }
}
function storeList(name) {
  try {
    localStorage.setItem(LAST_LIST_KEY, name);
  } catch {}
}

let currentList = getStoredList();

export async function render(container) {
  container.innerHTML = `
    <div class="section-header">
      <div class="toolbar">
        <select id="list-select"></select>
        <button class="btn btn-sm" id="new-list-btn">+ Nový seznam</button>
      </div>
      <button class="btn btn-sm btn-danger" id="clear-checked">Vymazat odškrtnuté</button>
    </div>
    <div class="card" id="shopping-progress-card" style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <b>Postup nákupu</b>
        <span class="pill" id="shopping-progress-pill">0 / 0</span>
      </div>
      <div class="progress-bar"><div id="shopping-progress-fill" style="width:0%;"></div></div>
    </div>
    <form id="add-item-form" class="card" style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
      <input type="text" id="item-name" placeholder="Co koupit…" style="flex:2;min-width:160px;" required />
      <input type="text" id="item-qty" placeholder="Množství (volitelné)" style="flex:1;min-width:120px;" />
      <input type="text" id="item-category" placeholder="Kategorie (volitelné)" style="flex:1;min-width:120px;" />
      <button class="btn btn-primary" type="submit">Přidat</button>
    </form>
    <div id="shopping-list"></div>
  `;

  await populateListSelect(container);

  container.querySelector("#list-select").addEventListener("change", (e) => {
    currentList = e.target.value;
    storeList(currentList);
    load(container);
  });

  container.querySelector("#new-list-btn").addEventListener("click", async () => {
    const name = await promptListName();
    if (!name) return;
    currentList = name;
    storeList(currentList);
    await populateListSelect(container);
    load(container);
  });

  container.querySelector("#add-item-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const item = container.querySelector("#item-name").value.trim();
    if (!item) return;
    try {
      await ShoppingItems.create({
        item,
        quantity: container.querySelector("#item-qty").value.trim() || null,
        category: container.querySelector("#item-category").value.trim() || null,
        list_name: currentList,
      });
      e.target.reset();
      container.querySelector("#item-name").focus();
      load(container);
    } catch (err) {
      toastError(err);
    }
  });

  container.querySelector("#clear-checked").addEventListener("click", async () => {
    if (await confirmDialog("Vymazat všechny odškrtnuté položky z tohoto seznamu?")) {
      try {
        await ShoppingItems.clearChecked(currentList);
        load(container);
      } catch (e) {
        toastError(e);
      }
    }
  });

  await load(container);
}

function promptListName() {
  return new Promise((resolve) => {
    const { el: modalEl, close } = openModal(`
      <div class="modal-header"><h3>Nový nákupní seznam</h3><button class="btn btn-icon btn-ghost" data-close>✕</button></div>
      <div class="field"><label>Název seznamu</label><input type="text" id="new-list-name" placeholder="např. Nákupy, Drogerie…" /></div>
      <div class="modal-actions">
        <button class="btn" data-close>Zrušit</button>
        <button class="btn btn-primary" id="create-list-btn">Vytvořit</button>
      </div>
    `);
    modalEl.querySelector("#create-list-btn").addEventListener("click", () => {
      const val = modalEl.querySelector("#new-list-name").value.trim();
      close();
      resolve(val || null);
    });
    setTimeout(() => modalEl.querySelector("#new-list-name")?.focus(), 30);
  });
}

async function populateListSelect(container) {
  const sel = container.querySelector("#list-select");
  try {
    let names = await ShoppingItems.listNames();
    if (!names.includes(currentList)) names = [currentList, ...names];
    if (!names.length) names = [currentList];
    sel.innerHTML = names.map((n) => `<option value="${escapeHtml(n)}" ${n === currentList ? "selected" : ""}>${escapeHtml(n)}</option>`).join("");
  } catch (e) {
    sel.innerHTML = `<option value="${escapeHtml(currentList)}">${escapeHtml(currentList)}</option>`;
  }
}

async function load(container) {
  const box = container.querySelector("#shopping-list");
  box.innerHTML = `<div class="center" style="padding:30px;"><div class="spinner"></div></div>`;
  try {
    const items = await ShoppingItems.list(currentList);

    const checkedCount = items.filter((i) => i.checked).length;
    const pct = items.length ? Math.round((checkedCount / items.length) * 100) : 0;
    const pill = container.querySelector("#shopping-progress-pill");
    const fill = container.querySelector("#shopping-progress-fill");
    if (pill) pill.textContent = `${checkedCount} / ${items.length}`;
    if (fill) fill.style.width = `${pct}%`;

    if (!items.length) {
      box.innerHTML = `<div class="empty-state"><div class="big">🛒</div>Seznam je prázdný. Přidej první položku výše.</div>`;
      return;
    }

    const recipeIds = [...new Set(items.map((i) => i.source_recipe_id).filter(Boolean))];
    let recipeTitles = {};
    if (recipeIds.length) {
      try {
        const results = await Promise.all(recipeIds.map((id) => Recipes.get(id).catch(() => null)));
        results.forEach((r, i) => {
          if (r) recipeTitles[recipeIds[i]] = r.title;
        });
      } catch {}
    }

    const groups = {};
    for (const it of items) {
      const key = it.category?.trim() || "Ostatní";
      (groups[key] ||= []).push(it);
    }
    const groupNames = Object.keys(groups).sort((a, b) => (a === "Ostatní" ? 1 : b === "Ostatní" ? -1 : a.localeCompare(b, "cs")));

    box.innerHTML = groupNames
      .map((g) => {
        const groupChecked = groups[g].filter((i) => i.checked).length;
        return `
      <div class="faint" style="margin:14px 0 6px;text-transform:uppercase;letter-spacing:.04em;display:flex;justify-content:space-between;">
        <span>${escapeHtml(g)}</span><span>${groupChecked} / ${groups[g].length}</span>
      </div>
      <div class="list">
        ${groups[g]
          .map(
            (i) => `<div class="list-item ${i.checked ? "done" : ""}" data-row="${i.id}">
              <input type="checkbox" data-id="${i.id}" class="check" ${i.checked ? "checked" : ""} style="width:auto;" />
              <div class="grow" data-edit="${i.id}" style="cursor:pointer;">
                <div class="title">${escapeHtml(i.item)}</div>
                <div class="faint">
                  ${i.quantity ? escapeHtml(i.quantity) : ""}
                  ${i.source_recipe_id && recipeTitles[i.source_recipe_id] ? `${i.quantity ? " · " : ""}🍳 ${escapeHtml(recipeTitles[i.source_recipe_id])}` : ""}
                </div>
              </div>
              <button type="button" class="btn btn-icon btn-ghost btn-sm" data-del="${i.id}" title="Smazat">✕</button>
            </div>`
          )
          .join("")}
      </div>`;
      })
      .join("");

    box.querySelectorAll(".check").forEach((cb) =>
      cb.addEventListener("change", async () => {
        try {
          await ShoppingItems.update(cb.dataset.id, { checked: cb.checked });
          load(container);
        } catch (e) {
          toastError(e);
        }
      })
    );
    box.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          await ShoppingItems.remove(b.dataset.del);
          load(container);
        } catch (err) {
          toastError(err);
        }
      })
    );
    box.querySelectorAll("[data-edit]").forEach((b) =>
      b.addEventListener("click", () => {
        const it = items.find((x) => x.id === b.dataset.edit);
        if (it) openEditItemModal(container, it);
      })
    );
  } catch (e) {
    box.innerHTML = `<div class="empty-state"><div class="big">⚠️</div>Nepodařilo se načíst nákupní seznam.</div>`;
    toastError(e);
  }
}

function openEditItemModal(container, item) {
  const { el: modalEl, close } = openModal(`
    <div class="modal-header"><h3>Upravit položku</h3><button class="btn btn-icon btn-ghost" data-close>✕</button></div>
    <div class="field"><label>Název</label><input type="text" id="e-name" value="${escapeHtml(item.item)}" /></div>
    <div class="row">
      <div class="field"><label>Množství</label><input type="text" id="e-qty" value="${escapeHtml(item.quantity || "")}" /></div>
      <div class="field"><label>Kategorie</label><input type="text" id="e-cat" value="${escapeHtml(item.category || "")}" /></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-danger" id="e-delete" style="margin-right:auto;">Smazat</button>
      <button class="btn" data-close>Zrušit</button>
      <button class="btn btn-primary" id="e-save">Uložit</button>
    </div>
  `);
  modalEl.querySelector("#e-save").addEventListener("click", async () => {
    const name = modalEl.querySelector("#e-name").value.trim();
    if (!name) return;
    try {
      await ShoppingItems.update(item.id, {
        item: name,
        quantity: modalEl.querySelector("#e-qty").value.trim() || null,
        category: modalEl.querySelector("#e-cat").value.trim() || null,
      });
      close();
      load(container);
    } catch (e) {
      toastError(e);
    }
  });
  modalEl.querySelector("#e-delete").addEventListener("click", async () => {
    if (await confirmDialog("Smazat tuto položku?")) {
      try {
        await ShoppingItems.remove(item.id);
        close();
        load(container);
      } catch (e) {
        toastError(e);
      }
    }
  });
}

/**
 * Adds a batch of ingredient rows (from a recipe) to a shopping list in one
 * go. Exported so the Recipes view can wire up "Add to shopping list".
 */
export async function addIngredientsToShoppingList(ingredients, { listName, recipeId, recipeTitle } = {}) {
  const list = listName || getStoredList();
  const rows = ingredients
    .filter((ing) => ing.name)
    .map((ing) => ({
      item: ing.name,
      quantity: ing.qty || null,
      category: "Recept" + (recipeTitle ? `: ${recipeTitle}` : ""),
      list_name: list,
      source_recipe_id: recipeId || null,
    }));
  if (!rows.length) return [];
  return ShoppingItems.createMany(rows);
}
