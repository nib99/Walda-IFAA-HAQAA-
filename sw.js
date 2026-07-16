/**
 * sw.js — IFAA HAQAA Admin Dashboard
 * Caches the static app shell so the login screen and layout still load offline.
 * Firestore data itself requires connectivity (or Firestore's own offline cache,
 * enabled in firebase-config.js) — this worker only covers the static shell.
 */

const CACHE_NAME = "ifaa-haqaa-admin-shell-v1";
const APP_SHELL = [
  "/admin.html",
  "/css/admin.css",
  "/js/firebase-config.js",
  "/js/auth.js",
  "/js/admin.js",
  "/js/products.js",
  "/js/gallery.js",
  "/js/content.js",
  "/js/inquiries.js",
  "/js/testimonials.js",
  "/js/faq.js",
  "/js/cloudinary.js",
  "/manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never cache Firebase/Cloudinary/API calls — always go to network.
  if (
    request.url.includes("firestore.googleapis.com") ||
    request.url.includes("identitytoolkit.googleapis.com") ||
    request.url.includes("cloudinary.com") ||
    request.method !== "GET"
  ) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
