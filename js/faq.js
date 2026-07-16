/**
 * faq.js
 * IFAA HAQAA Admin CMS — FAQ management
 *
 * Firestore shape: faqs/{ID}
 *   question: { om, am, en }, answer: { om, am, en }, active
 */

import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDocs, serverTimestamp, orderBy, query
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { LANGS, LANG_LABELS } from "./firebase-config.js";

let cachedFaqs = [];
let editingId = null;

export async function init(outlet, ctx) {
  outlet.innerHTML = `
    <div class="split-layout">
      <div class="panel">
        <div class="panel-header"><h3 id="faqFormTitle">Add FAQ</h3></div>
        <form id="faqForm" class="form-stack">
          <div class="lang-tabs" id="faqQLangTabs" data-target="q"></div>
          <div id="faqQFields"></div>
          <div class="lang-tabs" id="faqALangTabs" data-target="a"></div>
          <div id="faqAFields"></div>
          <div class="field checkbox-field">
            <label><input type="checkbox" id="faqActive" checked> Active (visible on website)</label>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="faqSaveBtn">Add FAQ</button>
            <button type="button" class="btn btn-ghost hidden" id="faqCancelEdit">Cancel Edit</button>
          </div>
        </form>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>FAQs</h3></div>
        <div id="faqList">${ctx.loadingState()}</div>
      </div>
    </div>
  `;

  renderFields(document.getElementById("faqQFields"), "faqQ", "Question");
  renderFields(document.getElementById("faqAFields"), "faqA", "Answer", true);
  renderLangTabs(document.getElementById("faqQLangTabs"));
  renderLangTabs(document.getElementById("faqALangTabs"));

  document.getElementById("faqForm").addEventListener("submit", (e) => handleSave(e, ctx));
  document.getElementById("faqCancelEdit").addEventListener("click", resetForm);

  await refresh(ctx);
}

function renderFields(container, prefix, label, textarea = false) {
  container.className = "lang-field-group";
  container.innerHTML = LANGS.map((lang, i) => `
    <div class="lang-field ${i === 0 ? "" : "hidden"}" data-lang-field="${prefix}-${lang}">
      <label>${label} — ${LANG_LABELS[lang]}</label>
      ${textarea
        ? `<textarea id="${prefix}-${lang}" rows="3" class="font-ethiopic"></textarea>`
        : `<input type="text" id="${prefix}-${lang}" class="font-ethiopic">`}
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
  const listEl = document.getElementById("faqList");
  listEl.innerHTML = ctx.loadingState();
  try {
    const q = query(collection(ctx.db, ctx.COLLECTIONS.faqs), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    cachedFaqs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderList(ctx);
  } catch (err) {
    listEl.innerHTML = ctx.emptyState("⚠", "Couldn't load FAQs", err.message);
  }
}

function renderList(ctx) {
  const listEl = document.getElementById("faqList");
  if (!cachedFaqs.length) {
    listEl.innerHTML = ctx.emptyState("❓", "No FAQs yet", "Add your first frequently asked question.");
    return;
  }
  listEl.innerHTML = cachedFaqs.map((f) => `
    <div class="faq-admin-row">
      <div class="faq-admin-row-header">
        <strong>${ctx.esc(f.question?.en || f.question?.om || "")}</strong>
        <span class="badge badge-${f.active ? "green" : "gold"}">${f.active ? "Active" : "Hidden"}</span>
      </div>
      <p class="muted">${ctx.esc(f.answer?.en || f.answer?.om || "")}</p>
      <div class="item-card-actions">
        <button class="btn btn-ghost btn-sm" data-edit="${f.id}">Edit</button>
        <button class="btn btn-ghost btn-sm" data-toggle="${f.id}">${f.active ? "Hide" : "Activate"}</button>
        <button class="btn btn-danger btn-sm" data-delete="${f.id}">Delete</button>
      </div>
    </div>
  `).join("");

  listEl.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => loadForEdit(btn.dataset.edit)));
  listEl.querySelectorAll("[data-toggle]").forEach((btn) => btn.addEventListener("click", () => toggleActive(btn.dataset.toggle, ctx)));
  listEl.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => handleDelete(btn.dataset.delete, ctx)));
}

function loadForEdit(id) {
  const f = cachedFaqs.find((x) => x.id === id);
  if (!f) return;
  editingId = id;
  LANGS.forEach((lang) => {
    document.getElementById(`faqQ-${lang}`).value = f.question?.[lang] || "";
    document.getElementById(`faqA-${lang}`).value = f.answer?.[lang] || "";
  });
  document.getElementById("faqActive").checked = f.active !== false;
  document.getElementById("faqFormTitle").textContent = "Edit FAQ";
  document.getElementById("faqSaveBtn").textContent = "Update FAQ";
  document.getElementById("faqCancelEdit").classList.remove("hidden");
  document.getElementById("faqForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetForm() {
  editingId = null;
  document.getElementById("faqForm").reset();
  document.getElementById("faqActive").checked = true;
  document.getElementById("faqFormTitle").textContent = "Add FAQ";
  document.getElementById("faqSaveBtn").textContent = "Add FAQ";
  document.getElementById("faqCancelEdit").classList.add("hidden");
}

async function handleSave(e, ctx) {
  e.preventDefault();
  const question = Object.fromEntries(LANGS.map((l) => [l, document.getElementById(`faqQ-${l}`).value.trim()]));
  const answer = Object.fromEntries(LANGS.map((l) => [l, document.getElementById(`faqA-${l}`).value.trim()]));
  const active = document.getElementById("faqActive").checked;

  const errors = ctx.validateRequired({ "English question": question.en, "English answer": answer.en });
  if (errors.length) { ctx.showToast(errors[0], "error"); return; }

  const btn = document.getElementById("faqSaveBtn");
  btn.disabled = true;
  btn.textContent = editingId ? "Updating…" : "Saving…";

  try {
    if (editingId) {
      await updateDoc(doc(ctx.db, ctx.COLLECTIONS.faqs, editingId), { question, answer, active });
      ctx.showToast("FAQ updated.", "success");
    } else {
      await addDoc(collection(ctx.db, ctx.COLLECTIONS.faqs), { question, answer, active, createdAt: serverTimestamp() });
      ctx.showToast("FAQ added.", "success");
    }
    resetForm();
    await refresh(ctx);
  } catch (err) {
    ctx.showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = editingId ? "Update FAQ" : "Add FAQ";
  }
}

async function toggleActive(id, ctx) {
  const f = cachedFaqs.find((x) => x.id === id);
  if (!f) return;
  try {
    await updateDoc(doc(ctx.db, ctx.COLLECTIONS.faqs, id), { active: !f.active });
    f.active = !f.active;
    renderList(ctx);
    ctx.showToast(f.active ? "FAQ activated." : "FAQ hidden.", "success");
  } catch (err) {
    ctx.showToast(err.message, "error");
  }
}

async function handleDelete(id, ctx) {
  const ok = await ctx.confirmAction({ title: "Delete FAQ?", message: "This question will be permanently removed.", confirmLabel: "Delete" });
  if (!ok) return;
  try {
    await deleteDoc(doc(ctx.db, ctx.COLLECTIONS.faqs, id));
    cachedFaqs = cachedFaqs.filter((x) => x.id !== id);
    renderList(ctx);
    ctx.showToast("FAQ deleted.", "success");
  } catch (err) {
    ctx.showToast(err.message, "error");
  }
}
