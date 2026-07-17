/**
 * gallery.js
 * IFAA HAQAA Admin CMS — Gallery management
 *
 * Firestore shape: gallery/{imageID}
 *   title: { om, am, en }
 *   imageUrl, public_id, category, createdAt
 */

import {
  collection, addDoc, deleteDoc, doc, getDocs, serverTimestamp, orderBy, query
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { uploadToCloudinary, deleteFromCloudinary } from "./cloudinary.js";
import { auth, LANGS, LANG_LABELS } from "./firebase-config.js";

const CATEGORIES = ["Farm", "Products", "Team", "Events", "Facilities", "Other"];

let cachedImages = [];
let pendingUpload = null;
let searchTerm = "";

export async function init(outlet, ctx) {
  renderShell(outlet, ctx);
  await refresh(outlet, ctx);
}

function renderShell(outlet, ctx) {
  outlet.innerHTML = `
    <div class="split-layout">
      <div class="panel">
        <div class="panel-header"><h3>Upload Image</h3></div>
        <form id="galleryForm" class="form-stack">
          <div class="lang-tabs" id="galleryLangTabs"></div>
          <div id="galleryTitleFields"></div>

          <div class="field">
            <label>Category</label>
            <select id="galleryCategory">
              ${CATEGORIES.map((c) => `<option value="${ctx.esc(c)}">${ctx.esc(c)}</option>`).join("")}
            </select>
          </div>

          <div class="field">
            <label>Image</label>
            <div class="image-upload-box">
              <div class="image-preview" id="galleryImagePreview"><span class="upload-placeholder">📷 No image selected</span></div>
              <input type="file" id="galleryImageInput" accept="image/*" capture="environment" class="file-input-hidden">
              <label for="galleryImageInput" class="btn btn-ghost btn-sm">Choose / Take Photo</label>
              <div class="upload-progress hidden" id="galleryUploadProgress"><div class="upload-progress-bar" id="galleryUploadBar"></div></div>
            </div>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="gallerySaveBtn">Add to Gallery</button>
          </div>
        </form>
      </div>

      <div class="panel">
        <div class="panel-header panel-header-wrap">
          <h3>Gallery</h3>
          <div class="toolbar">
            <input type="search" id="gallerySearch" placeholder="Search by title…" class="input-sm">
          </div>
        </div>
        <div id="galleryGrid">${ctx.loadingState()}</div>
      </div>
    </div>
  `;

  renderTitleFields(document.getElementById("galleryTitleFields"));
  renderLangTabs(document.getElementById("galleryLangTabs"));
  wireImageInput(ctx);

  document.getElementById("galleryForm").addEventListener("submit", (e) => handleSave(e, outlet, ctx));
  document.getElementById("gallerySearch").addEventListener("input", (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    renderGrid(ctx);
  });
}

function renderTitleFields(container) {
  container.className = "lang-field-group";
  container.innerHTML = LANGS.map((lang, i) => `
    <div class="lang-field ${i === 0 ? "" : "hidden"}" data-lang-field="galleryTitle-${lang}">
      <label>Title — ${LANG_LABELS[lang]}</label>
      <input type="text" id="galleryTitle-${lang}" class="font-ethiopic" placeholder="Title in ${LANG_LABELS[lang]}…">
    </div>
  `).join("");
}

function renderLangTabs(container) {
  container.innerHTML = LANGS.map((lang, i) => `<button type="button" class="lang-tab ${i === 0 ? "lang-tab-active" : ""}" data-lang="${lang}">${LANG_LABELS[lang]}</button>`).join("");
  container.querySelectorAll(".lang-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".lang-tab").forEach((b) => b.classList.remove("lang-tab-active"));
      btn.classList.add("lang-tab-active");
      container.nextElementSibling.querySelectorAll("[data-lang-field]").forEach((f) => {
        f.classList.toggle("hidden", !f.dataset.langField.endsWith("-" + btn.dataset.lang));
      });
    });
  });
}

function wireImageInput(ctx) {
  document.getElementById("galleryImageInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const progress = document.getElementById("galleryUploadProgress");
    const bar = document.getElementById("galleryUploadBar");
    progress.classList.remove("hidden");
    bar.style.width = "0%";
    try {
      const result = await uploadToCloudinary(file, {
        folder: "ifaa-haqaa/gallery",
        onProgress: (pct) => { bar.style.width = pct + "%"; }
      });
      pendingUpload = result;
      document.getElementById("galleryImagePreview").innerHTML = `<img src="${result.url}" alt="Preview">`;
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
  const grid = document.getElementById("galleryGrid");
  grid.innerHTML = ctx.loadingState();
  try {
    const q = query(collection(ctx.db, ctx.COLLECTIONS.gallery), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    cachedImages = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderGrid(ctx);
  } catch (err) {
    grid.innerHTML = ctx.emptyState("⚠", "Couldn't load gallery", err.message);
  }
}

function renderGrid(ctx) {
  const grid = document.getElementById("galleryGrid");
  let items = cachedImages;
  if (searchTerm) {
    items = items.filter((img) => LANGS.some((l) => (img.title?.[l] || "").toLowerCase().includes(searchTerm)));
  }
  if (!items.length) {
    grid.innerHTML = ctx.emptyState("🖼️", "No images yet", "Upload your first photo above.");
    return;
  }
  grid.innerHTML = `<div class="photo-grid">${items.map((img) => `
    <div class="photo-tile">
      <img src="${img.url || img.imageUrl}" alt="${ctx.esc(img.title?.en || img.title?.om || "")}" loading="lazy">
      <div class="photo-tile-overlay">
        <div class="photo-tile-title">${ctx.esc(img.title?.en || img.title?.om || "Untitled")}</div>
        <div class="photo-tile-cat">${ctx.esc(img.category || "")}</div>
        <button class="btn btn-danger btn-sm" data-delete="${img.id}">Delete</button>
      </div>
    </div>
  `).join("")}</div>`;

  grid.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => handleDelete(btn.dataset.delete, ctx)));
}

async function handleSave(e, outlet, ctx) {
  e.preventDefault();
  const title = Object.fromEntries(LANGS.map((l) => [l, document.getElementById(`galleryTitle-${l}`).value.trim()]));
  const category = document.getElementById("galleryCategory").value;

  const errors = ctx.validateRequired({ "English title": title.en });
  if (errors.length) { ctx.showToast(errors[0], "error"); return; }
  if (!pendingUpload) { ctx.showToast("Please upload an image first.", "error"); return; }

  const btn = document.getElementById("gallerySaveBtn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    await addDoc(collection(ctx.db, ctx.COLLECTIONS.gallery), {
      title,
      category,
      url: pendingUpload.url,
      public_id: pendingUpload.public_id,
      createdAt: serverTimestamp()
    });
    ctx.showToast("Image added to gallery.", "success");
    document.getElementById("galleryForm").reset();
    document.getElementById("galleryImagePreview").innerHTML = `<span class="upload-placeholder">📷 No image selected</span>`;
    pendingUpload = null;
    await refresh(outlet, ctx);
  } catch (err) {
    ctx.showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Add to Gallery";
  }
}

async function handleDelete(id, ctx) {
  const img = cachedImages.find((x) => x.id === id);
  const ok = await ctx.confirmAction({
    title: "Delete image?",
    message: "This removes it from Cloudinary and the website permanently.",
    confirmLabel: "Delete"
  });
  if (!ok) return;

  try {
    // 1. Delete the actual file from Cloudinary (requires a signed server call).
    if (img?.public_id) {
      const idToken = await auth.currentUser.getIdToken();
      await deleteFromCloudinary(img.public_id, idToken);
    }

    // 2. Delete the Firestore record so it disappears from the admin list and the website.
    await deleteDoc(doc(ctx.db, ctx.COLLECTIONS.gallery, id));

    cachedImages = cachedImages.filter((x) => x.id !== id);
    renderGrid(ctx);
    ctx.showToast("Image deleted from Cloudinary and the website.", "success");
  } catch (err) {
    ctx.showToast(err.message, "error");
  }
}
