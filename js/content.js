/**
 * content.js
 * IFAA HAQAA Admin CMS — Content CMS
 *
 * Firestore shape: content/{about|mission|vision|contact}
 *   title: { om, am, en }
 *   body: { om, am, en }
 */

import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { LANGS, LANG_LABELS } from "./firebase-config.js";

const PAGES = [
  { id: "about", label: "About" },
  { id: "mission", label: "Mission" },
  { id: "vision", label: "Vision" },
  { id: "values", label: "Values" },
  { id: "contact", label: "Contact" }
];

let activePage = "about";
let pageCache = {};

export async function init(outlet, ctx) {
  outlet.innerHTML = `
    <div class="panel">
      <div class="panel-header panel-header-wrap">
        <h3>Content CMS</h3>
        <div class="pill-tabs" id="contentPageTabs">
          ${PAGES.map((p, i) => `<button type="button" class="pill-tab ${i === 0 ? "pill-tab-active" : ""}" data-page="${p.id}">${p.label}</button>`).join("")}
        </div>
      </div>
      <div id="contentEditorRoot">${ctx.loadingState()}</div>
    </div>
  `;

  document.getElementById("contentPageTabs").querySelectorAll(".pill-tab").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll("#contentPageTabs .pill-tab").forEach((b) => b.classList.remove("pill-tab-active"));
      btn.classList.add("pill-tab-active");
      activePage = btn.dataset.page;
      await renderEditor(ctx);
    });
  });

  await renderEditor(ctx);
}

async function renderEditor(ctx) {
  const root = document.getElementById("contentEditorRoot");
  root.innerHTML = ctx.loadingState();

  let data = {
  title: {},
  body: {}
};

try {

  const snap = await getDoc(
    doc(ctx.db, ctx.COLLECTIONS.content, activePage)
  );

  if (snap.exists()) {
    data = snap.data();
  }

} catch (err) {

  root.innerHTML = ctx.emptyState(
    "⚠",
    "Couldn't load content",
    err.message
  );

  return;
}
      root.innerHTML = ctx.emptyState("⚠", "Couldn't load content", err.message);
      return;
    }
  }

  root.innerHTML = `
    <form id="contentForm" class="form-stack">
      <div class="lang-tabs" id="contentLangTabs"></div>
      <div id="contentFields"></div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary" id="contentSaveBtn">Save ${PAGES.find((p) => p.id === activePage).label}</button>
      </div>
    </form>
  `;

  const fieldsRoot = document.getElementById("contentFields");
  fieldsRoot.className = "lang-field-group";
  fieldsRoot.innerHTML = LANGS.map((lang, i) => `
    <div class="lang-field ${i === 0 ? "" : "hidden"}" data-lang-field="content-${lang}">
      <div class="field">
        <label>Title — ${LANG_LABELS[lang]}</label>
        <input type="text" id="contentTitle-${lang}" class="font-ethiopic" value="${ctx.esc(data.title?.[lang] || "")}">
      </div>
      <div class="field">
        <label>Body — ${LANG_LABELS[lang]}</label>
        <textarea id="contentBody-${lang}" rows="8" class="font-ethiopic">${ctx.esc(data.body?.[lang] || "")}</textarea>
      </div>
    </div>
  `).join("");

  const tabsRoot = document.getElementById("contentLangTabs");
  tabsRoot.innerHTML = LANGS.map((lang, i) => `<button type="button" class="lang-tab ${i === 0 ? "lang-tab-active" : ""}" data-lang="${lang}">${LANG_LABELS[lang]}</button>`).join("");
  tabsRoot.querySelectorAll(".lang-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      tabsRoot.querySelectorAll(".lang-tab").forEach((b) => b.classList.remove("lang-tab-active"));
      btn.classList.add("lang-tab-active");
      fieldsRoot.querySelectorAll("[data-lang-field]").forEach((f) => {
        f.classList.toggle("hidden", !f.dataset.langField.endsWith("-" + btn.dataset.lang));
      });
    });
  });

  document.getElementById("contentForm").addEventListener("submit", (e) => handleSave(e, ctx));
}

async function handleSave(e, ctx) {
  e.preventDefault();
  const title = Object.fromEntries(LANGS.map((l) => [l, document.getElementById(`contentTitle-${l}`).value.trim()]));
  const body = Object.fromEntries(LANGS.map((l) => [l, document.getElementById(`contentBody-${l}`).value.trim()]));

  const errors = ctx.validateRequired({ "English title": title.en, "English body": body.en });
  if (errors.length) { ctx.showToast(errors[0], "error"); return; }

  const btn = document.getElementById("contentSaveBtn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    await setDoc(doc(ctx.db, ctx.COLLECTIONS.content, activePage), { title, body, updatedAt: serverTimestamp() }, { merge: true });
    pageCache[activePage] = { title, body };
    ctx.showToast(`${PAGES.find((p) => p.id === activePage).label} content saved.`, "success");
  } catch (err) {
    ctx.showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = `Save ${PAGES.find((p) => p.id === activePage).label}`;
  }
}
