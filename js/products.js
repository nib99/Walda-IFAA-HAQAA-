/**
 * products.js
 * IFAA HAQAA Admin CMS — Product management (create, edit, delete, search, filter, featured toggle)
 *
 * Firestore shape: products/{productID}
 *   name: { om, am, en }
 *   description: { om, am, en }
 *   image: { url, public_id }
 *   category, featured, status, createdAt
 */

import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDocs, serverTimestamp, orderBy, query
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { uploadToCloudinary } from "./cloudinary.js";
import { LANGS, LANG_LABELS } from "./firebase-config.js";

const CATEGORIES = ["Jimaa / Khat", "Buna Keelloo / Coffee", "Horsiisee Bulaa / Livestock", "Biqiltoota Qonnaa / Agriculture", "Other"];

let cachedProducts = [];
let editingId = null;
let pendingImage = null; // { url, public_id } captured from Cloudinary before save
let searchTerm = "";
let categoryFilter = "";

export async function init(outlet, ctx) {
  renderShell(outlet, ctx);
  await refresh(outlet, ctx);
}

function renderShell(outlet, ctx) {
  outlet.innerHTML = `
    <div class="split-layout">
      <div class="panel">
        <div class="panel-header"><h3 id="productFormTitle">Add Product</h3></div>
        <form id="productForm" class="form-stack">
          <div class="lang-tabs" id="prodLangTabs" data-target="name"></div>
          <div id="prodNameFields"></div>

          <div class="lang-tabs" id="prodDescLangTabs" data-target="desc"></div>
          <div id="prodDescFields"></div>

          <div class="field-row">
            <div class="field">
              <label>Category</label>
              <select id="prodCategory">
                ${CATEGORIES.map((c) => `<option value="${ctx.esc(c)}">${ctx.esc(c)}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label>Status</label>
              <select id="prodStatus">
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div class="field checkbox-field">
            <label><input type="checkbox" id="prodFeatured"> Featured product</label>
          </div>

          <div class="field">
            <label>Product Image</label>
            <div class="image-upload-box" id="prodImageBox">
              <div class="image-preview" id="prodImagePreview">
                <span class="upload-placeholder">📷 No image selected</span>
              </div>
              <input 
  type="file" 
  id="prodImageInput" 
  accept="image/*" 
  class="file-input-hidden"
>
              <label for="prodImageInput" class="btn btn-ghost btn-sm">Choose / Take Photo</label>
              <div class="upload-progress hidden" id="prodUploadProgress"><div class="upload-progress-bar" id="prodUploadBar"></div></div>
            </div>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="prodSaveBtn">Save Product</button>
            <button type="button" class="btn btn-ghost hidden" id="prodCancelEdit">Cancel Edit</button>
          </div>
        </form>
      </div>

      <div class="panel">
        <div class="panel-header panel-header-wrap">
          <h3>Products</h3>
          <div class="toolbar">
            <input type="search" id="prodSearch" placeholder="Search products…" class="input-sm">
            <select id="prodCategoryFilter" class="input-sm">
              <option value="">All Categories</option>
              ${CATEGORIES.map((c) => `<option value="${ctx.esc(c)}">${ctx.esc(c)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div id="productList">${ctx.loadingState()}</div>
      </div>
    </div>
  `;

  renderLangFields(document.getElementById("prodNameFields"), "prodName", "Product name");
  renderLangFields(document.getElementById("prodDescFields"), "prodDesc", "Product description", true);
  renderLangTabGroup(document.getElementById("prodLangTabs"), "prodName");
  renderLangTabGroup(document.getElementById("prodDescLangTabs"), "prodDesc");

  wireImageInput(ctx);

  document.getElementById("productForm").addEventListener("submit", (e) => handleSave(e, outlet, ctx));
  document.getElementById("prodCancelEdit").addEventListener("click", () => resetForm());

  document.getElementById("prodSearch").addEventListener("input", (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    renderList(ctx);
  });
  document.getElementById("prodCategoryFilter").addEventListener("change", (e) => {
    categoryFilter = e.target.value;
    renderList(ctx);
  });
}

/** Renders one text input/textarea per language, only the active one visible. */
function renderLangFields(container, prefix, label, isTextarea = false) {
  container.className = "lang-field-group";
  container.innerHTML = LANGS.map((lang, i) => `
    <div class="lang-field ${i === 0 ? "" : "hidden"}" data-lang-field="${prefix}-${lang}">
      <label>${label} — ${LANG_LABELS[lang]}</label>
      ${isTextarea
        ? `<textarea id="${prefix}-${lang}" rows="3" class="font-ethiopic" placeholder="${label} in ${LANG_LABELS[lang]}…"></textarea>`
        : `<input type="text" id="${prefix}-${lang}" class="font-ethiopic" placeholder="${label} in ${LANG_LABELS[lang]}…">`}
    </div>
  `).join("");
}

function renderLangTabGroup(container, prefix) {
  container.innerHTML = LANGS.map((lang, i) => `
    <button type="button" class="lang-tab ${i === 0 ? "lang-tab-active" : ""}" data-lang="${lang}">${LANG_LABELS[lang]}</button>
  `).join("");
  container.querySelectorAll(".lang-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".lang-tab").forEach((b) => b.classList.remove("lang-tab-active"));
      btn.classList.add("lang-tab-active");
      const fieldsRoot = container.nextElementSibling;
      fieldsRoot.querySelectorAll("[data-lang-field]").forEach((f) => {
        f.classList.toggle("hidden", !f.dataset.langField.endsWith("-" + btn.dataset.lang));
      });
    });
  });
}

function wireImageInput(ctx) {
  document.getElementById("prodImageInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const progress = document.getElementById("prodUploadProgress");
    const bar = document.getElementById("prodUploadBar");
    progress.classList.remove("hidden");
    bar.style.width = "0%";

    try {
      const result = await uploadToCloudinary(file, {
        folder: "ifaa-haqaa/products",
        onProgress: (pct) => { bar.style.width = pct + "%"; }
      });
      pendingImage = result;
      document.getElementById("prodImagePreview").innerHTML = `<img src="${result.url}" alt="Product preview">`;
      ctx.showToast("Image uploaded to Cloudinary.", "success");
    } catch (err) {
      ctx.showToast(err.message, "error");
    } finally {
      setTimeout(() => progress.classList.add("hidden"), 400);
      e.target.value = "";
    }
  });
}

async function refresh(outlet, ctx) {
  const listEl = document.getElementById("productList");
  listEl.innerHTML = ctx.loadingState();
  try {
    const q = query(collection(ctx.db, ctx.COLLECTIONS.products), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    cachedProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderList(ctx);
  } catch (err) {
    listEl.innerHTML = ctx.emptyState("⚠", "Couldn't load products", err.message);
  }
}

function renderList(ctx) {
  const listEl = document.getElementById("productList");
  let items = cachedProducts;

  if (categoryFilter) items = items.filter((p) => p.category === categoryFilter);
  if (searchTerm) {
    items = items.filter((p) => {
      const haystack = LANGS.map((l) => p.name?.[l] || "").join(" ").toLowerCase();
      return haystack.includes(searchTerm);
    });
  }

  if (!items.length) {
    listEl.innerHTML = ctx.emptyState("📦", "No products found", "Try a different search or add your first product.");
    return;
  }

  listEl.innerHTML = `<div class="card-grid">${items.map((p) => `
    <div class="item-card">
      <div class="item-card-media">
        ${p.image?.url ? `<img src="${p.image.url}" alt="${ctx.esc(p.name?.en || p.name?.om || "")}">` : `<div class="item-card-noimg">📦</div>`}
        ${p.featured ? `<span class="pill pill-gold">★ Featured</span>` : ""}
      </div>
      <div class="item-card-body">
        <div class="item-card-title">${ctx.esc(p.name?.en || p.name?.om || p.name?.am || "Untitled")}</div>
        <div class="item-card-meta">${ctx.esc(p.category || "Uncategorized")} · <span class="badge badge-${p.status === "active" ? "green" : "gold"}">${ctx.esc(p.status || "active")}</span></div>
        <p class="item-card-desc">${ctx.esc((p.description?.en || p.description?.om || "").slice(0, 90))}${(p.description?.en || "").length > 90 ? "…" : ""}</p>
        <div class="item-card-actions">
          <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-toggle-featured="${p.id}">${p.featured ? "Unfeature" : "Feature"}</button>
          <button class="btn btn-danger btn-sm" data-delete="${p.id}">Delete</button>
        </div>
      </div>
    </div>
  `).join("")}</div>`;

  listEl.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => loadForEdit(btn.dataset.edit)));
  listEl.querySelectorAll("[data-toggle-featured]").forEach((btn) => btn.addEventListener("click", () => toggleFeatured(btn.dataset.toggleFeatured, ctx)));
  listEl.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => handleDelete(btn.dataset.delete, ctx)));
}

function loadForEdit(id) {
  const p = cachedProducts.find((x) => x.id === id);
  if (!p) return;
  editingId = id;
  pendingImage = p.image || null;

  LANGS.forEach((lang) => {
    document.getElementById(`prodName-${lang}`).value = p.name?.[lang] || "";
    document.getElementById(`prodDesc-${lang}`).value = p.description?.[lang] || "";
  });
  document.getElementById("prodCategory").value = p.category || CATEGORIES[0];
  document.getElementById("prodStatus").value = p.status || "active";
  document.getElementById("prodFeatured").checked = !!p.featured;
  document.getElementById("prodImagePreview").innerHTML = p.image?.url
    ? `<img src="${p.image.url}" alt="Product preview">`
    : `<span class="upload-placeholder">📷 No image selected</span>`;

  document.getElementById("productFormTitle").textContent = "Edit Product";
  document.getElementById("prodSaveBtn").textContent = "Update Product";
  document.getElementById("prodCancelEdit").classList.remove("hidden");
  document.getElementById("productForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetForm() {
  editingId = null;
  pendingImage = null;
  document.getElementById("productForm").reset();
  document.getElementById("prodImagePreview").innerHTML = `<span class="upload-placeholder">📷 No image selected</span>`;
  document.getElementById("productFormTitle").textContent = "Add Product";
  document.getElementById("prodSaveBtn").textContent = "Save Product";
  document.getElementById("prodCancelEdit").classList.add("hidden");
}

async function handleSave(e, outlet, ctx) {
  e.preventDefault();

  const name = Object.fromEntries(LANGS.map((l) => [l, document.getElementById(`prodName-${l}`).value.trim()]));
  const description = Object.fromEntries(LANGS.map((l) => [l, document.getElementById(`prodDesc-${l}`).value.trim()]));
  const category = document.getElementById("prodCategory").value;
  const status = document.getElementById("prodStatus").value;
  const featured = document.getElementById("prodFeatured").checked;

  const errors = ctx.validateRequired({
    "English name": name.en,
    "Afaan Oromoo name": name.om,
    "Category": category
  });
  if (errors.length) {
    ctx.showToast(errors[0], "error");
    return;
  }

  const btn = document.getElementById("prodSaveBtn");
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = editingId ? "Updating…" : "Saving…";

  try {
    const payload = {
      name, description, category, status, featured,
      image: pendingImage || { url: "", public_id: "" }
    };

    if (editingId) {
      await updateDoc(doc(ctx.db, ctx.COLLECTIONS.products, editingId), payload);
      ctx.showToast("Product updated.", "success");
    } else {
      await addDoc(collection(ctx.db, ctx.COLLECTIONS.products), { ...payload, createdAt: serverTimestamp() });
      ctx.showToast("Product created.", "success");
    }

    resetForm();
    await refresh(outlet, ctx);
  } catch (err) {
    ctx.showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

async function toggleFeatured(id, ctx) {
  const p = cachedProducts.find((x) => x.id === id);
  if (!p) return;
  try {
    await updateDoc(doc(ctx.db, ctx.COLLECTIONS.products, id), { featured: !p.featured });
    p.featured = !p.featured;
    renderList(ctx);
    ctx.showToast(p.featured ? "Marked as featured." : "Removed from featured.", "success");
  } catch (err) {
    ctx.showToast(err.message, "error");
  }
}

async function handleDelete(id, ctx) {
  const p = cachedProducts.find((x) => x.id === id);
  const ok = await ctx.confirmAction({
    title: "Delete product?",
    message: `"${p?.name?.en || p?.name?.om || "This product"}" will be permanently removed.`,
    confirmLabel: "Delete"
  });
  if (!ok) return;

  try {
    await deleteDoc(doc(ctx.db, ctx.COLLECTIONS.products, id));
    cachedProducts = cachedProducts.filter((x) => x.id !== id);
    renderList(ctx);
    ctx.showToast("Product deleted.", "success");
  } catch (err) {
    ctx.showToast(err.message, "error");
  }
}
