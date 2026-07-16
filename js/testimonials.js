/**
 * testimonials.js
 * IFAA HAQAA Admin CMS — Testimonial moderation
 *
 * Firestore shape: testimonials/{ID}
 *   customerName, message: { om, am, en }, rating, approved
 *
 * Only approved === true testimonials are shown publicly on the website.
 */

import {
  collection, addDoc, deleteDoc, doc, getDocs, updateDoc, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { LANGS, LANG_LABELS } from "./firebase-config.js";

let cachedTestimonials = [];
let filter = "all"; // all | approved | pending

export async function init(outlet, ctx) {
  outlet.innerHTML = `
    <div class="split-layout">
      <div class="panel">
        <div class="panel-header"><h3>Add Testimonial</h3></div>
        <form id="testForm" class="form-stack">
          <div class="field">
            <label>Customer Name</label>
            <input type="text" id="testCustomerName" required>
          </div>
          <div class="field">
            <label>Rating</label>
            <select id="testRating">
              <option value="5">★★★★★ (5)</option>
              <option value="4">★★★★☆ (4)</option>
              <option value="3">★★★☆☆ (3)</option>
              <option value="2">★★☆☆☆ (2)</option>
              <option value="1">★☆☆☆☆ (1)</option>
            </select>
          </div>
          <div class="lang-tabs" id="testLangTabs"></div>
          <div id="testMessageFields"></div>
          <div class="field checkbox-field">
            <label><input type="checkbox" id="testApproved" checked> Approve immediately (visible on website)</label>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="testSaveBtn">Add Testimonial</button>
          </div>
        </form>
      </div>

      <div class="panel">
        <div class="panel-header panel-header-wrap">
          <h3>Testimonials</h3>
          <div class="pill-tabs" id="testFilterTabs">
            <button type="button" class="pill-tab pill-tab-active" data-filter="all">All</button>
            <button type="button" class="pill-tab" data-filter="approved">Approved</button>
            <button type="button" class="pill-tab" data-filter="pending">Pending</button>
          </div>
        </div>
        <div id="testimonialList">${ctx.loadingState()}</div>
      </div>
    </div>
  `;

  renderMessageFields(document.getElementById("testMessageFields"));
  renderLangTabs(document.getElementById("testLangTabs"));

  document.getElementById("testForm").addEventListener("submit", (e) => handleSave(e, ctx));
  document.getElementById("testFilterTabs").querySelectorAll(".pill-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#testFilterTabs .pill-tab").forEach((b) => b.classList.remove("pill-tab-active"));
      btn.classList.add("pill-tab-active");
      filter = btn.dataset.filter;
      renderList(ctx);
    });
  });

  await refresh(ctx);
}

function renderMessageFields(container) {
  container.className = "lang-field-group";
  container.innerHTML = LANGS.map((lang, i) => `
    <div class="lang-field ${i === 0 ? "" : "hidden"}" data-lang-field="testMsg-${lang}">
      <label>Testimonial — ${LANG_LABELS[lang]}</label>
      <textarea id="testMsg-${lang}" rows="3" class="font-ethiopic" placeholder="What did they say, in ${LANG_LABELS[lang]}?"></textarea>
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

async function refresh(ctx) {
  const listEl = document.getElementById("testimonialList");
  listEl.innerHTML = ctx.loadingState();
  try {
    const q = query(collection(ctx.db, ctx.COLLECTIONS.testimonials), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    cachedTestimonials = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderList(ctx);
  } catch (err) {
    listEl.innerHTML = ctx.emptyState("⚠", "Couldn't load testimonials", err.message);
  }
}

function renderList(ctx) {
  const listEl = document.getElementById("testimonialList");
  let items = cachedTestimonials;
  if (filter === "approved") items = items.filter((t) => t.approved);
  if (filter === "pending") items = items.filter((t) => !t.approved);

  if (!items.length) {
    listEl.innerHTML = ctx.emptyState("⭐", "No testimonials found", "Add one using the form, or check a different filter.");
    return;
  }

  listEl.innerHTML = items.map((t) => `
    <div class="testimonial-row">
      <div class="testimonial-row-header">
        <div>
          <strong>${ctx.esc(t.customerName)}</strong>
          <span class="stars">${"★".repeat(t.rating || 5)}${"☆".repeat(5 - (t.rating || 5))}</span>
        </div>
        <span class="badge badge-${t.approved ? "green" : "gold"}">${t.approved ? "Approved" : "Pending"}</span>
      </div>
      <p class="testimonial-row-text">${ctx.esc(t.message?.en || t.message?.om || t.message?.am || "")}</p>
      <div class="item-card-actions">
        <button class="btn btn-ghost btn-sm" data-approve="${t.id}">${t.approved ? "Unapprove" : "Approve"}</button>
        <button class="btn btn-danger btn-sm" data-delete="${t.id}">Delete</button>
      </div>
    </div>
  `).join("");

  listEl.querySelectorAll("[data-approve]").forEach((btn) => btn.addEventListener("click", () => toggleApproval(btn.dataset.approve, ctx)));
  listEl.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => handleDelete(btn.dataset.delete, ctx)));
}

async function handleSave(e, ctx) {
  e.preventDefault();
  const customerName = document.getElementById("testCustomerName").value.trim();
  const rating = Number(document.getElementById("testRating").value);
  const approved = document.getElementById("testApproved").checked;
  const message = Object.fromEntries(LANGS.map((l) => [l, document.getElementById(`testMsg-${l}`).value.trim()]));

  const errors = ctx.validateRequired({ "Customer name": customerName, "English testimonial": message.en });
  if (errors.length) { ctx.showToast(errors[0], "error"); return; }

  const btn = document.getElementById("testSaveBtn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    await addDoc(collection(ctx.db, ctx.COLLECTIONS.testimonials), {
      customerName, rating, approved, message, createdAt: serverTimestamp()
    });
    ctx.showToast("Testimonial added.", "success");
    document.getElementById("testForm").reset();
    document.getElementById("testApproved").checked = true;
    await refresh(ctx);
  } catch (err) {
    ctx.showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Add Testimonial";
  }
}

async function toggleApproval(id, ctx) {
  const t = cachedTestimonials.find((x) => x.id === id);
  if (!t) return;
  try {
    await updateDoc(doc(ctx.db, ctx.COLLECTIONS.testimonials, id), { approved: !t.approved });
    t.approved = !t.approved;
    renderList(ctx);
    ctx.showToast(t.approved ? "Testimonial approved — now visible on the website." : "Testimonial unapproved — hidden from the website.", "success");
  } catch (err) {
    ctx.showToast(err.message, "error");
  }
}

async function handleDelete(id, ctx) {
  const ok = await ctx.confirmAction({ title: "Delete testimonial?", message: "This will be permanently removed.", confirmLabel: "Delete" });
  if (!ok) return;
  try {
    await deleteDoc(doc(ctx.db, ctx.COLLECTIONS.testimonials, id));
    cachedTestimonials = cachedTestimonials.filter((x) => x.id !== id);
    renderList(ctx);
    ctx.showToast("Testimonial deleted.", "success");
  } catch (err) {
    ctx.showToast(err.message, "error");
  }
}
