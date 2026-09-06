import { ShoppingItems } from "../db.js";
import { escapeHtml, confirmDialog } from "../ui.js";
import { toastError } from "../toast.js";

let currentList = "Shopping";

export async function render(container) {
  container.innerHTML = `
    <div class="section-header">
      <div class="toolbar">
        <input type="text" id="list-name" value="${escapeHtml(currentList)}" style="width:180px;" />
        <button class="btn btn-sm" id="switch-list">Přepnout seznam</button>
      </div>
      <button class="btn btn-sm btn-danger" id="clear-checked">Vymazat odškrtnuté</button>
    </div>
    <form id="add-item-form" class="card" style="display:flex;gap:8px;margin-bottom:14px;">
      <input type="text" id="item-name" placeholder="Co koupit…" style="flex:2;" />
      <input type="text" id="item-qty" placeholder="Množství (volitelné)" style="flex:1;" />
      <button class="btn btn-primary" type="submit">Přidat</button>
    </form>
    <div class="list" id="shopping-list"></div>
  `;

  container.querySelector("#switch-list").addEventListener("click", () => {
    currentList = container.querySelector("#list-name").value.trim() || "Shopping";
    load(container);
  });

  container.querySelector("#add-item-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const item = container.querySelector("#item-name").value.trim();
    if (!item) return;
    try {
      await ShoppingItems.create({ item, quantity: container.querySelector("#item-qty").value.trim() || null, list_name: currentList });
      e.target.reset();
      load(container);
    } catch (err) {
      toastError(err);
    }
  });

  container.querySelector("#clear-checked").addEventListener("click", async () => {
    if (await confirmDialog("Vymazat všechny odškrtnuté položky?")) {
      await ShoppingItems.clearChecked(currentList);
      load(container);
    }
  });

  await load(container);
}

async function load(container) {
  const box = container.querySelector("#shopping-list");
  try {
    const items = await ShoppingItems.list(currentList);
    if (!items.length) {
      box.innerHTML = `<div class="empty-state"><div class="big">🛒</div>Seznam je prázdný.</div>`;
      return;
    }
    box.innerHTML = items
      .map(
        (i) => `<label class="list-item ${i.checked ? "done" : ""}">
          <input type="checkbox" data-id="${i.id}" class="check" ${i.checked ? "checked" : ""} />
          <div class="grow">
            <div class="title">${escapeHtml(i.item)}</div>
            ${i.quantity ? `<div class="faint">${escapeHtml(i.quantity)}</div>` : ""}
          </div>
          <button type="button" class="btn btn-icon btn-ghost btn-sm" data-del="${i.id}">✕</button>
        </label>`
      )
      .join("");
    box.querySelectorAll(".check").forEach((cb) =>
      cb.addEventListener("change", async () => {
        await ShoppingItems.update(cb.dataset.id, { checked: cb.checked });
        load(container);
      })
    );
    box.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", async (e) => {
        e.preventDefault();
        await ShoppingItems.remove(b.dataset.del);
        load(container);
      })
    );
  } catch (e) {
    toastError(e);
  }
}
