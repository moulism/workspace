import { Meals, Recipes } from "../db.js";
import { escapeHtml, confirmDialog, todayIso, fmtDate } from "../ui.js";
import { toast, toastError } from "../toast.js";

const MEAL_TYPES = { breakfast: "Snídaně", lunch: "Oběd", dinner: "Večeře", snack: "Svačina" };
let selectedDate = todayIso();
let recipesCache = [];
let heroChart = null;

export async function render(container) {
  container.innerHTML = `
    <div class="hub-grid">
      <div class="card hub-hero" style="grid-column: span 5; grid-row: span 2;">
        <div class="toolbar" style="justify-content:center;">
          <button class="btn btn-icon" id="prev-day">←</button>
          <input type="date" id="meal-date" value="${selectedDate}" />
          <button class="btn btn-icon" id="next-day">→</button>
        </div>
        <div class="hub-hero-top">
          <div class="dash-goal-canvas-wrap hub-hero-ring">
            <canvas id="hero-ring"></canvas>
            <div class="dash-goal-pct" style="font-size:15px;" id="hero-kcal">0 kcal</div>
          </div>
        </div>
        <div class="dash-kpi-row" id="daily-totals"></div>
      </div>
      <div class="card" style="grid-column: span 7; grid-row: span 2;">
        <h3 style="margin:0 0 10px;">Záznamy dne</h3>
        <form id="add-meal-form" style="margin-bottom:14px;">
          <div class="row">
            <div class="field"><label>Typ</label>
              <select id="m-type">${Object.entries(MEAL_TYPES).map(([id, l]) => `<option value="${id}">${l}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Recept (volitelné)</label><select id="m-recipe"><option value="">— vlastní —</option></select></div>
          </div>
          <div class="row">
            <div class="field"><label>Název</label><input type="text" id="m-name" placeholder="Co jsi jedl/a" /></div>
          </div>
          <div class="row">
            <div class="field"><label>Kalorie</label><input type="number" id="m-cal" /></div>
            <div class="field"><label>B (g)</label><input type="number" id="m-protein" /></div>
            <div class="field"><label>S (g)</label><input type="number" id="m-carbs" /></div>
            <div class="field"><label>T (g)</label><input type="number" id="m-fat" /></div>
          </div>
          <button class="btn btn-primary btn-sm" type="submit">Přidat záznam</button>
        </form>
        <div class="list" id="meals-list"></div>
      </div>
    </div>
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
  const kcalLabel = container.querySelector("#hero-kcal");
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
    container.querySelector("#daily-totals").innerHTML = `
      <div class="dash-kpi"><div class="n">${totals.protein}g</div><div class="l">Bílkoviny</div></div>
      <div class="dash-kpi"><div class="n">${totals.carbs}g</div><div class="l">Sacharidy</div></div>
      <div class="dash-kpi"><div class="n">${totals.fat}g</div><div class="l">Tuky</div></div>
    `;
    kcalLabel.textContent = `${totals.cal} kcal`;

    heroChart?.destroy();
    const ringCanvas = container.querySelector("#hero-ring");
    const kcalFromMacros = [totals.protein * 4, totals.carbs * 4, totals.fat * 9];
    const hasMacros = kcalFromMacros.some((v) => v > 0);
    if (window.Chart && ringCanvas) {
      heroChart = new Chart(ringCanvas, {
        type: "doughnut",
        data: {
          labels: ["Bílkoviny", "Sacharidy", "Tuky"],
          datasets: [{ data: hasMacros ? kcalFromMacros : [1, 1, 1], backgroundColor: hasMacros ? ["#22d3ee", "#c98a1f", "#dc4c3f"] : ["rgba(147,163,181,.18)", "rgba(147,163,181,.12)", "rgba(147,163,181,.08)"], borderWidth: 0 }],
        },
        options: { cutout: "72%", plugins: { legend: { display: false }, tooltip: { enabled: hasMacros } }, animation: { duration: 400 } },
      });
    }

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
