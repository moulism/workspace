import { Meals, Recipes } from "../db.js";
import { escapeHtml, confirmDialog, todayIso, fmtDate } from "../ui.js";
import { toast, toastError } from "../toast.js";

const MEAL_TYPES = { breakfast: "Snídaně", lunch: "Oběd", dinner: "Večeře", snack: "Svačina" };
let selectedDate = todayIso();
let recipesCache = [];

export async function render(container) {
  container.innerHTML = `
    <div class="section-header">
      <div class="toolbar">
        <button class="btn btn-icon" id="prev-day">←</button>
        <input type="date" id="meal-date" value="${selectedDate}" />
        <button class="btn btn-icon" id="next-day">→</button>
      </div>
      <div id="daily-totals" class="faint"></div>
    </div>
    <form id="add-meal-form" class="card" style="margin-bottom:14px;">
      <div class="row">
        <div class="field"><label>Typ</label>
          <select id="m-type">${Object.entries(MEAL_TYPES).map(([id, l]) => `<option value="${id}">${l}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Recept (volitelné)</label><select id="m-recipe"><option value="">— vlastní —</option></select></div>
        <div class="field"><label>Název</label><input type="text" id="m-name" placeholder="Co jsi jedl/a" /></div>
      </div>
      <div class="row">
        <div class="field"><label>Kalorie</label><input type="number" id="m-cal" /></div>
        <div class="field"><label>Bílkoviny (g)</label><input type="number" id="m-protein" /></div>
        <div class="field"><label>Sacharidy (g)</label><input type="number" id="m-carbs" /></div>
        <div class="field"><label>Tuky (g)</label><input type="number" id="m-fat" /></div>
      </div>
      <button class="btn btn-primary" type="submit">Přidat záznam</button>
    </form>
    <div class="list" id="meals-list"></div>
  `;

  container.querySelector("#meal-date").addEventListener("change", (e) => {
    selectedDate = e.target.value;
    load(container);
  });
  container.querySelector("#prev-day").addEventListener("click", () => shiftDay(container, -1));
  container.querySelector("#next-day").addEventListener("click", () => shiftDay(container, 1));

  try {
    recipesCache = await Recipes.list();
    const sel = container.querySelector("#m-recipe");
    sel.innerHTML += recipesCache.map((r) => `<option value="${r.id}">${escapeHtml(r.title)}</option>`).join("");
    sel.addEventListener("change", () => {
      const r = recipesCache.find((x) => x.id === sel.value);
      if (r) {
        container.querySelector("#m-name").value = r.title;
        container.querySelector("#m-cal").value = r.calories_per_serving || "";
        container.querySelector("#m-protein").value = r.protein_g || "";
        container.querySelector("#m-carbs").value = r.carbs_g || "";
        container.querySelector("#m-fat").value = r.fat_g || "";
      }
    });
  } catch (e) {
    toastError(e);
  }

  container.querySelector("#add-meal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = container.querySelector("#m-name").value.trim();
    if (!name) return;
    try {
      await Meals.create({
        meal_date: selectedDate,
        meal_type: container.querySelector("#m-type").value,
        recipe_id: container.querySelector("#m-recipe").value || null,
        name,
        calories: Number(container.querySelector("#m-cal").value) || null,
        protein_g: Number(container.querySelector("#m-protein").value) || null,
        carbs_g: Number(container.querySelector("#m-carbs").value) || null,
        fat_g: Number(container.querySelector("#m-fat").value) || null,
      });
      e.target.reset();
      load(container);
    } catch (err) {
      toastError(err);
    }
  });

  await load(container);
}

function shiftDay(container, delta) {
  const d = new Date(selectedDate);
  d.setDate(d.getDate() + delta);
  selectedDate = d.toISOString().slice(0, 10);
  container.querySelector("#meal-date").value = selectedDate;
  load(container);
}

async function load(container) {
  const list = container.querySelector("#meals-list");
  try {
    const meals = await Meals.list({ date: selectedDate });
    const totals = meals.reduce(
      (acc, m) => {
        acc.cal += m.calories || 0;
        acc.protein += Number(m.protein_g) || 0;
        acc.carbs += Number(m.carbs_g) || 0;
        acc.fat += Number(m.fat_g) || 0;
        return acc;
      },
      { cal: 0, protein: 0, carbs: 0, fat: 0 }
    );
    container.querySelector("#daily-totals").textContent =
      `${totals.cal} kcal · B ${totals.protein}g · S ${totals.carbs}g · T ${totals.fat}g`;

    if (!meals.length) {
      list.innerHTML = `<div class="empty-state"><div class="big">🍽️</div>Pro tento den zatím nic.</div>`;
      return;
    }
    list.innerHTML = meals
      .map(
        (m) => `<div class="list-item">
          <div class="grow">
            <div class="title">${escapeHtml(m.name)}</div>
            <div class="faint">${MEAL_TYPES[m.meal_type]} ${m.calories ? "· " + m.calories + " kcal" : ""}</div>
          </div>
          <button type="button" class="btn btn-icon btn-ghost btn-sm" data-del="${m.id}">✕</button>
        </div>`
      )
      .join("");
    list.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (await confirmDialog("Smazat záznam?")) {
          await Meals.remove(b.dataset.del);
          load(container);
        }
      })
    );
  } catch (e) {
    toastError(e);
  }
}
