/**
 * inquiries.js
 * IFAA HAQAA Admin CMS — Inquiry management
 *
 * Firestore shape: inquiries/{inquiryID}
 *   name, phone, email, message, status ("new"|"read"|"completed"), createdAt
 */

import {
  collection, deleteDoc, doc, getDocs, updateDoc, orderBy, query
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

let cachedInquiries = [];
let searchTerm = "";
let statusFilter = "";

export async function init(outlet, ctx) {
  outlet.innerHTML = `
    <div class="panel">
      <div class="panel-header panel-header-wrap">
        <h3>Inquiries</h3>
        <div class="toolbar">
          <input type="search" id="inqSearch" placeholder="Search name, phone, message…" class="input-sm">
          <select id="inqStatusFilter" class="input-sm">
            <option value="">All Statuses</option>
            <option value="new">New</option>
            <option value="read">Read</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>
      <div id="inquiryList">${ctx.loadingState()}</div>
    </div>
  `;

  document.getElementById("inqSearch").addEventListener("input", (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    renderList(ctx);
  });
  document.getElementById("inqStatusFilter").addEventListener("change", (e) => {
    statusFilter = e.target.value;
    renderList(ctx);
  });

  await refresh(ctx);
}

async function refresh(ctx) {
  const listEl = document.getElementById("inquiryList");
  listEl.innerHTML = ctx.loadingState();
  try {
    const q = query(collection(ctx.db, ctx.COLLECTIONS.inquiries), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    cachedInquiries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderList(ctx);
  } catch (err) {
    listEl.innerHTML = ctx.emptyState("⚠", "Couldn't load inquiries", err.message);
  }
}

function renderList(ctx) {
  const listEl = document.getElementById("inquiryList");
  let items = cachedInquiries;

  if (statusFilter) items = items.filter((i) => (i.status || "new") === statusFilter);
  if (searchTerm) {
    items = items.filter((i) =>
      [i.name, i.phone, i.email, i.message].join(" ").toLowerCase().includes(searchTerm)
    );
  }

  if (!items.length) {
    listEl.innerHTML = ctx.emptyState("✉️", "No inquiries found", "Messages submitted through the website's contact form will show up here.");
    return;
  }

  listEl.innerHTML = `<div class="table-scroll"><table class="data-table">
    <thead><tr><th>Name</th><th>Contact</th><th>Message</th><th>Status</th><th>Date</th><th></th></tr></thead>
    <tbody>${items.map((i) => `
      <tr>
        <td>${ctx.esc(i.name)}</td>
        <td>${ctx.esc(i.phone || i.email || "—")}</td>
        <td class="truncate-cell" title="${ctx.esc(i.message)}">${ctx.esc(i.message)}</td>
        <td>
          <select class="status-select status-${i.status || "new"}" data-status-for="${i.id}">
            <option value="new" ${i.status === "new" || !i.status ? "selected" : ""}>New</option>
            <option value="read" ${i.status === "read" ? "selected" : ""}>Read</option>
            <option value="completed" ${i.status === "completed" ? "selected" : ""}>Completed</option>
          </select>
        </td>
        <td>${ctx.formatDate(i.createdAt)}</td>
        <td><button class="btn btn-danger btn-sm" data-delete="${i.id}">Delete</button></td>
      </tr>
    `).join("")}</tbody>
  </table></div>`;

  listEl.querySelectorAll("[data-status-for]").forEach((sel) => {
    sel.addEventListener("change", (e) => updateStatus(sel.dataset.statusFor, e.target.value, ctx));
  });
  listEl.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => handleDelete(btn.dataset.delete, ctx)));
}

async function updateStatus(id, status, ctx) {
  try {
    await updateDoc(doc(ctx.db, ctx.COLLECTIONS.inquiries, id), { status });
    const item = cachedInquiries.find((i) => i.id === id);
    if (item) item.status = status;
    ctx.showToast("Status updated.", "success");
  } catch (err) {
    ctx.showToast(err.message, "error");
  }
}

async function handleDelete(id, ctx) {
  const ok = await ctx.confirmAction({ title: "Delete inquiry?", message: "This message will be permanently removed.", confirmLabel: "Delete" });
  if (!ok) return;
  try {
    await deleteDoc(doc(ctx.db, ctx.COLLECTIONS.inquiries, id));
    cachedInquiries = cachedInquiries.filter((i) => i.id !== id);
    renderList(ctx);
    ctx.showToast("Inquiry deleted.", "success");
  } catch (err) {
    ctx.showToast(err.message, "error");
  }
}
