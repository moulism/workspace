import { Recipes } from "../db.js";
import { escapeHtml, openModal, confirmDialog } from "../ui.js";
import { toast, toastError } from "../toast.js";

let search = "";

export async function render(container) {
  container.innerHTML = `
    <div class="section-header">
      <h2>Recepty</h2>
      <div class="toolbar">
        <input type="search" id="recipe-search" placeholder="Hledat recept…" value="${escapeHtml(search)}" />
        <button class="btn btn-primary" id="new-recipe-btn">+ Přidat recept</button>
      </div>
    </div>
    <div class="grid grid-3" id="recipes-grid"></div>
  `;
  container.querySelector("#recipe-search").addEventListener("input", (e) => {
    search = e.target.value;
    load(container);
  });
  container.querySelector("#new-recipe-btn").addEventListener("click", () => openRecipeModal(container));
  await load(container);
}

function ingredientRow(ing = {}) {
  return `<div class="row ing-row" style="margin-bottom:6px;">
    <input type="text" placeholder="Ingredience" class="ing-name" value="${escapeHtml(ing.name || "")}" />
    <input type="text" placeholder="Množství" class="ing-qty" style="max-width:110px;" value="${escapeHtml(ing.qty || "")}" />
    <button type="button" class="btn btn-icon btn-ghost remove-ing">✕</button>
  </div>`;
}

async function load(container) {
  const grid = container.querySelector("#recipes-grid");
  try {
    const recipes = await Recipes.list(search || undefined);
    if (!recipes.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="big">📖</div>Zatím žádné recepty.</div>`;
      return;
    }
    grid.innerHTML = recipes
      .map(
        (r) => `<div class="card" data-id="${r.id}" style="cursor:pointer;">
          <b class="truncate">${escapeHtml(r.title)}</b>
          <div class="faint" style="margin-top:4px;">${r.servings ? r.servings + " porce" : ""} ${r.calories_per_serving ? "· " + r.calories_per_serving + " kcal/porci" : ""}</div>
          ${r.tags?.length ? `<div style="margin-top:8px;display:flex;gap:5px;flex-wrap:wrap;">${r.tags.map((t) => `<span class="pill">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
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
       ${!isNew ? `<button class="btn btn-danger" id="r-delete" style="margin-right:auto;">Smazat</button>` : ""}
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

  modalEl.querySelector("#r-save").addEventListener("click", async () => {
    const ingredients = [...mount.querySelectorAll(".ing-row")]
      .map((row) => ({ name: row.querySelector(".ing-name").value.trim(), qty: row.querySelector(".ing-qty").value.trim() }))
      .filter((i) => i.name);
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
