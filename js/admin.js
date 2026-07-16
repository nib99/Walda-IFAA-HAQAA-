/**
 * admin.js
 * IFAA HAQAA Admin CMS — Dashboard shell & orchestration
 *
 * Responsibilities:
 *  - Guard admin.html behind authentication + role check (via auth.js)
 *  - Render the login screen and the dashboard shell (sidebar/topbar)
 *  - Handle section navigation (Dashboard, Products, Gallery, Content, Inquiries,
 *    Testimonials, FAQ, Settings, Profile)
 *  - Provide shared UI utilities (toast, confirm dialog, loading/empty states)
 *    to every feature module via dependency injection (no circular imports)
 *  - Compute and render the dashboard home stats + charts
 */

import { db, COLLECTIONS } from "./firebase-config.js";
import {
  login,
  logout,
  guardAdminRoute,
  requestPasswordReset,
  changePassword,
  describeAuthError,
  currentAdminProfile
} from "./auth.js";
import { collection, getCountFromServer, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import * as ProductsModule from "./products.js";
import * as GalleryModule from "./gallery.js";
import * as ContentModule from "./content.js";
import * as InquiriesModule from "./inquiries.js";
import * as TestimonialsModule from "./testimonials.js";
import * as FaqModule from "./faq.js";

/* =========================================================================
   SHARED UI UTILITIES (injected into every feature module)
   ========================================================================= */

/** Escapes text for safe HTML insertion. */
export function esc(str) {
  if (str === null || str === undefined) return "";
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

/** Formats a Firestore Timestamp / Date / ISO string for display. */
export function formatDate(value) {
  if (!value) return "—";
  const d = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

let toastTimer = null;
/** Shows a transient toast notification. type: 'success' | 'error' | 'info' */
export function showToast(message, type = "success") {
  const host = document.getElementById("toastHost");
  if (!host) return;

  const icons = { success: "✓", error: "✕", info: "ℹ" };
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${esc(message)}</span>`;
  host.appendChild(el);

  requestAnimationFrame(() => el.classList.add("toast-in"));

  setTimeout(() => {
    el.classList.remove("toast-in");
    el.classList.add("toast-out");
    setTimeout(() => el.remove(), 300);
  }, 3800);
}

/** Promise-based confirm dialog (replaces window.confirm with themed UI). */
export function confirmAction({ title = "Are you sure?", message = "", danger = true, confirmLabel = "Confirm" } = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("confirmOverlay");
    overlay.innerHTML = `
      <div class="confirm-box">
        <div class="confirm-icon ${danger ? "confirm-icon-danger" : ""}">${danger ? "⚠" : "?"}</div>
        <h3 class="confirm-title">${esc(title)}</h3>
        <p class="confirm-message">${esc(message)}</p>
        <div class="confirm-actions">
          <button type="button" class="btn btn-ghost" data-action="cancel">Cancel</button>
          <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-action="confirm">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    overlay.classList.add("visible");

    const cleanup = (result) => {
      overlay.classList.remove("visible");
      overlay.innerHTML = "";
      resolve(result);
    };

    overlay.querySelector('[data-action="cancel"]').onclick = () => cleanup(false);
    overlay.querySelector('[data-action="confirm"]').onclick = () => cleanup(true);
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
  });
}

/** Standard skeleton loading markup for a panel. */
export function loadingState(label = "Loading…") {
  return `<div class="empty-state"><div class="spinner"></div><p>${esc(label)}</p></div>`;
}

/** Standard empty-state markup. */
export function emptyState(icon, title, subtitle) {
  return `<div class="empty-state">
    <div class="empty-icon">${icon}</div>
    <p class="empty-title">${esc(title)}</p>
    ${subtitle ? `<p class="empty-subtitle">${esc(subtitle)}</p>` : ""}
  </div>`;
}

/** Simple client-side form validation helper. Returns array of error strings. */
export function validateRequired(fields) {
  const errors = [];
  for (const [label, value] of Object.entries(fields)) {
    if (value === undefined || value === null || String(value).trim() === "") {
      errors.push(`${label} is required.`);
    }
  }
  return errors;
}

/** Shared context object passed to every feature module's init(). */
const ctx = { db, COLLECTIONS, showToast, confirmAction, esc, formatDate, loadingState, emptyState, validateRequired };

/* =========================================================================
   SECTION REGISTRY
   ========================================================================= */

const SECTIONS = [
  { id: "dashboard", label: "Dashboard", icon: iconDashboard(), render: renderDashboardHome },
  { id: "products", label: "Products", icon: iconProducts(), render: (el) => ProductsModule.init(el, ctx) },
  { id: "gallery", label: "Gallery", icon: iconGallery(), render: (el) => GalleryModule.init(el, ctx) },
  { id: "content", label: "Content CMS", icon: iconContent(), render: (el) => ContentModule.init(el, ctx) },
  { id: "inquiries", label: "Inquiries", icon: iconInquiries(), render: (el) => InquiriesModule.init(el, ctx) },
  { id: "testimonials", label: "Testimonials", icon: iconTestimonials(), render: (el) => TestimonialsModule.init(el, ctx) },
  { id: "faq", label: "FAQ", icon: iconFaq(), render: (el) => FaqModule.init(el, ctx) },
  { id: "settings", label: "Settings", icon: iconSettings(), render: renderSettings },
  { id: "profile", label: "Profile", icon: iconProfile(), render: renderProfile }
];

let activeSection = "dashboard";

/* =========================================================================
   BOOTSTRAP
   ========================================================================= */

document.addEventListener("DOMContentLoaded", () => {
  wireLoginScreen();
  guardAdminRoute(onAuthorized, onUnauthorized);
});

function onAuthorized(profile) {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("dashboardShell").classList.remove("hidden");
  document.getElementById("appLoader").classList.add("hidden");
  renderShellChrome(profile);
  navigateTo(activeSection);
}

function onUnauthorized(reason) {
  document.getElementById("dashboardShell").classList.add("hidden");
  document.getElementById("appLoader").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");

  if (reason && reason !== "SIGNED_OUT") {
    const errEl = document.getElementById("loginError");
    errEl.textContent = describeAuthError({ code: reason });
    errEl.classList.remove("hidden");
  }
}

/* =========================================================================
   LOGIN SCREEN
   ========================================================================= */

function wireLoginScreen() {
  const form = document.getElementById("loginForm");
  const errEl = document.getElementById("loginError");
  const btn = document.getElementById("loginBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.classList.add("hidden");

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const remember = document.getElementById("loginRemember").checked;

    const errors = validateRequired({ Email: email, Password: password });
    if (errors.length) {
      errEl.textContent = errors.join(" ");
      errEl.classList.remove("hidden");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Signing in…";

    try {
      await login(email, password, remember);
      // onAuthStateChanged (via guardAdminRoute) will handle the transition.
    } catch (err) {
      errEl.textContent = describeAuthError(err);
      errEl.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign In";
    }
  });

  document.getElementById("forgotPasswordLink").addEventListener("click", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    if (!email) {
      errEl.textContent = "Enter your email above first, then click 'Forgot password?' again.";
      errEl.classList.remove("hidden");
      return;
    }
    try {
      await requestPasswordReset(email);
      showToast(`Password reset email sent to ${email}`, "success");
    } catch (err) {
      showToast(describeAuthError(err), "error");
    }
  });

  document.getElementById("togglePasswordVisibility").addEventListener("click", () => {
    const input = document.getElementById("loginPassword");
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    document.getElementById("togglePasswordVisibility").textContent = isPassword ? "Hide" : "Show";
  });
}

/* =========================================================================
   SHELL CHROME (sidebar + topbar)
   ========================================================================= */

function renderShellChrome(profile) {
  document.getElementById("sidebarUserName").textContent = profile.name || "Administrator";
  document.getElementById("sidebarUserEmail").textContent = profile.email || "";
  document.getElementById("topbarUserName").textContent = (profile.name || "Admin").split(" ")[0];

  const nav = document.getElementById("sidebarNav");
  nav.innerHTML = SECTIONS.map((s) => `
    <button type="button" class="nav-item" data-section="${s.id}">
      <span class="nav-icon">${s.icon}</span>
      <span class="nav-label">${s.label}</span>
    </button>
  `).join("");

  nav.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigateTo(btn.dataset.section);
      document.getElementById("dashboardShell").classList.remove("sidebar-open");
    });
  });

  document.getElementById("logoutBtn").addEventListener("click", handleLogout);
  document.getElementById("mobileMenuToggle").addEventListener("click", () => {
    document.getElementById("dashboardShell").classList.toggle("sidebar-open");
  });
  document.getElementById("sidebarOverlay").addEventListener("click", () => {
    document.getElementById("dashboardShell").classList.remove("sidebar-open");
  });
}

async function handleLogout() {
  const ok = await confirmAction({
    title: "Log out?",
    message: "You'll need to sign in again to access the dashboard.",
    danger: false,
    confirmLabel: "Log Out"
  });
  if (!ok) return;
  await logout();
  showToast("Logged out successfully.", "info");
}

function navigateTo(sectionId) {
  activeSection = sectionId;
  const section = SECTIONS.find((s) => s.id === sectionId) || SECTIONS[0];

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("nav-item-active", btn.dataset.section === sectionId);
  });

  document.getElementById("pageTitle").textContent = section.label;

  const outlet = document.getElementById("contentOutlet");
  outlet.innerHTML = loadingState(`Loading ${section.label}…`);
  outlet.scrollTop = 0;

  Promise.resolve(section.render(outlet)).catch((err) => {
    console.error(err);
    outlet.innerHTML = emptyState("⚠", "Something went wrong", err.message || "Please try again.");
  });
}

/* =========================================================================
   DASHBOARD HOME
   ========================================================================= */

async function renderDashboardHome(outlet) {
  outlet.innerHTML = `
    <div class="stats-grid" id="statsGrid">${loadingState("Loading stats…")}</div>
    <div class="charts-grid">
      <div class="panel">
        <div class="panel-header"><h3>Inquiry Activity (Last 7 Days)</h3></div>
        <div class="chart-wrap"><canvas id="inquiryChart" height="220"></canvas></div>
      </div>
      <div class="panel">
        <div class="panel-header"><h3>Products by Category</h3></div>
        <div class="chart-wrap"><canvas id="productChart" height="220"></canvas></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Recent Inquiries</h3><button class="btn btn-ghost btn-sm" id="viewAllInquiries">View all →</button></div>
      <div id="recentInquiries">${loadingState()}</div>
    </div>
  `;

  document.getElementById("viewAllInquiries").addEventListener("click", () => navigateTo("inquiries"));

  const [productsSnap, gallerySnap, newInquiriesSnap, approvedTestSnap, faqSnap] = await Promise.all([
    getCountFromServer(collection(db, COLLECTIONS.products)),
    getCountFromServer(collection(db, COLLECTIONS.gallery)),
    getCountFromServer(query(collection(db, COLLECTIONS.inquiries), where("status", "==", "new"))),
    getCountFromServer(query(collection(db, COLLECTIONS.testimonials), where("approved", "==", true))),
    getCountFromServer(collection(db, COLLECTIONS.faqs))
  ]);

  const stats = [
    { label: "Total Products", value: productsSnap.data().count, icon: "📦", tone: "gold" },
    { label: "Gallery Images", value: gallerySnap.data().count, icon: "🖼️", tone: "green" },
    { label: "New Inquiries", value: newInquiriesSnap.data().count, icon: "✉️", tone: "red" },
    { label: "Approved Testimonials", value: approvedTestSnap.data().count, icon: "⭐", tone: "gold" },
    { label: "FAQ Count", value: faqSnap.data().count, icon: "❓", tone: "green" }
  ];

  document.getElementById("statsGrid").innerHTML = stats.map((s) => `
    <div class="stat-card stat-${s.tone}">
      <div class="stat-icon">${s.icon}</div>
      <div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${esc(s.label)}</div>
      </div>
    </div>
  `).join("");

  // Recent inquiries + chart data
  const recentQ = query(collection(db, COLLECTIONS.inquiries), orderBy("createdAt", "desc"), limit(5));
  const allInquiriesQ = query(collection(db, COLLECTIONS.inquiries), orderBy("createdAt", "desc"), limit(200));
  const allProductsQ = query(collection(db, COLLECTIONS.products));

  const [recentSnap, inqSnap, prodSnap] = await Promise.all([
    getDocs(recentQ),
    getDocs(allInquiriesQ),
    getDocs(allProductsQ)
  ]);

  document.getElementById("recentInquiries").innerHTML = recentSnap.empty
    ? emptyState("✉️", "No inquiries yet", "Messages from the website's contact form will appear here.")
    : `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>Name</th><th>Contact</th><th>Message</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>${recentSnap.docs.map((d) => {
          const v = d.data();
          return `<tr>
            <td>${esc(v.name)}</td>
            <td>${esc(v.phone || v.email || "—")}</td>
            <td class="truncate-cell">${esc(v.message)}</td>
            <td><span class="badge badge-${statusTone(v.status)}">${esc(v.status || "new")}</span></td>
            <td>${formatDate(v.createdAt)}</td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>`;

  renderInquiryChart(inqSnap.docs.map((d) => d.data()));
  renderProductChart(prodSnap.docs.map((d) => d.data()));
}

function statusTone(status) {
  return { new: "red", read: "gold", completed: "green" }[status] || "gold";
}

let inquiryChartInstance = null;
let productChartInstance = null;

function renderInquiryChart(inquiries) {
  const ctxEl = document.getElementById("inquiryChart");
  if (!ctxEl || typeof Chart === "undefined") return;

  const days = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });

  const counts = days.map((day) =>
    inquiries.filter((inq) => {
      const created = inq.createdAt?.toDate ? inq.createdAt.toDate() : new Date(inq.createdAt);
      return created.toDateString() === day.toDateString();
    }).length
  );

  if (inquiryChartInstance) inquiryChartInstance.destroy();
  inquiryChartInstance = new Chart(ctxEl, {
    type: "line",
    data: {
      labels: days.map((d) => d.toLocaleDateString("en-GB", { weekday: "short" })),
      datasets: [{
        label: "Inquiries",
        data: counts,
        borderColor: "#D4A017",
        backgroundColor: "rgba(212,160,23,0.15)",
        tension: 0.35,
        fill: true,
        pointBackgroundColor: "#D4A017"
      }]
    },
    options: chartOptions()
  });
}

function renderProductChart(products) {
  const ctxEl = document.getElementById("productChart");
  if (!ctxEl || typeof Chart === "undefined") return;

  const byCategory = {};
  products.forEach((p) => {
    const cat = p.category || "Uncategorized";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  });

  if (productChartInstance) productChartInstance.destroy();
  productChartInstance = new Chart(ctxEl, {
    type: "doughnut",
    data: {
      labels: Object.keys(byCategory),
      datasets: [{
        data: Object.values(byCategory),
        backgroundColor: ["#D4A017", "#22c55e", "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6"],
        borderColor: "#132918",
        borderWidth: 2
      }]
    },
    options: { ...chartOptions(), plugins: { legend: { position: "bottom", labels: { color: "#dcfce7", boxWidth: 12, padding: 12 } } } }
  });
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: "#86efac" }, grid: { color: "rgba(255,255,255,0.05)" } },
      y: { ticks: { color: "#86efac" }, grid: { color: "rgba(255,255,255,0.05)" }, beginAtZero: true }
    }
  };
}

/* =========================================================================
   SETTINGS
   ========================================================================= */

function renderSettings(outlet) {
  outlet.innerHTML = `
    <div class="panel panel-narrow">
      <div class="panel-header"><h3>Change Password</h3></div>
      <form id="changePasswordForm" class="form-stack">
        <div class="field">
          <label>Current Password</label>
          <input type="password" id="currentPassword" required autocomplete="current-password">
        </div>
        <div class="field">
          <label>New Password</label>
          <input type="password" id="newPassword" required minlength="6" autocomplete="new-password">
        </div>
        <div class="field">
          <label>Confirm New Password</label>
          <input type="password" id="confirmNewPassword" required minlength="6" autocomplete="new-password">
        </div>
        <button type="submit" class="btn btn-primary" id="changePasswordBtn">Update Password</button>
      </form>
    </div>
    <div class="panel panel-narrow">
      <div class="panel-header"><h3>Session</h3></div>
      <p class="muted">You're signed in as <strong>${esc(currentAdminProfile?.email || "")}</strong> with role <strong>${esc(currentAdminProfile?.role || "")}</strong>.</p>
    </div>
  `;

  document.getElementById("changePasswordForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const current = document.getElementById("currentPassword").value;
    const next = document.getElementById("newPassword").value;
    const confirm = document.getElementById("confirmNewPassword").value;

    if (next !== confirm) {
      showToast("New passwords don't match.", "error");
      return;
    }
    if (next.length < 6) {
      showToast("New password must be at least 6 characters.", "error");
      return;
    }

    const btn = document.getElementById("changePasswordBtn");
    btn.disabled = true;
    btn.textContent = "Updating…";
    try {
      await changePassword(current, next);
      showToast("Password updated successfully.", "success");
      e.target.reset();
    } catch (err) {
      showToast(describeAuthError(err), "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Update Password";
    }
  });
}

/* =========================================================================
   PROFILE
   ========================================================================= */

function renderProfile(outlet) {
  const p = currentAdminProfile || {};
  outlet.innerHTML = `
    <div class="panel panel-narrow">
      <div class="panel-header"><h3>Admin Profile</h3></div>
      <div class="profile-card">
        <div class="profile-avatar">${esc((p.name || "A")[0])}</div>
        <div>
          <div class="profile-name">${esc(p.name || "Administrator")}</div>
          <div class="profile-email">${esc(p.email || "")}</div>
          <div class="profile-badges">
            <span class="badge badge-gold">${esc(p.role || "admin")}</span>
            <span class="badge badge-${p.active ? "green" : "red"}">${p.active ? "Active" : "Inactive"}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================================
   INLINE ICONS (no external icon font dependency)
   ========================================================================= */

function iconDashboard() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>`; }
function iconProducts() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`; }
function iconGallery() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`; }
function iconContent() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>`; }
function iconInquiries() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>`; }
function iconTestimonials() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.9 6.4 6.9.7-5.2 4.6 1.6 6.8L12 17l-6.2 3.5 1.6-6.8-5.2-4.6 6.9-.7z"/></svg>`; }
function iconFaq() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 3.5M12 17h.01"/></svg>`; }
function iconSettings() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`; }
function iconProfile() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>`; }
