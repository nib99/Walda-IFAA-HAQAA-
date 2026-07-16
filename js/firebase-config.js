/**
 * firebase-config.js
 * IFAA HAQAA Admin CMS — Firebase bootstrap
 *
 * Initializes Firebase App, Authentication, and Firestore.
 * DOES NOT initialize Firebase Storage — all media goes through Cloudinary (see cloudinary.js).
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA22wNSNIWNBrp25vGyLuB1MhhucwVwYaw",
  authDomain: "ifaa-haqaa.firebaseapp.com",
  projectId: "ifaa-haqaa",
  storageBucket: "ifaa-haqaa.firebasestorage.app",
  messagingSenderId: "638946129823",
  appId: "1:638946129823:web:21de2e11e1068c1e4defaa"
};

// ---- Initialize Firebase ----
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Default to local persistence (remembered across browser restarts).
// auth.js swaps this to session-only persistence when the user unchecks "Remember me".
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("[firebase-config] Failed to set default auth persistence:", err);
});

export const PERSISTENCE = {
  local: browserLocalPersistence,
  session: browserSessionPersistence
};

// Best-effort offline cache for a smoother mobile/PWA experience.
// Safe to fail silently (e.g. multiple tabs open).
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("[firebase-config] Offline persistence disabled: multiple tabs open.");
  } else if (err.code === "unimplemented") {
    console.warn("[firebase-config] Offline persistence not supported in this browser.");
  }
});

// Collection name constants — single source of truth, avoids typo bugs across modules.
export const COLLECTIONS = {
  users: "users",
  products: "products",
  gallery: "gallery",
  content: "content",
  inquiries: "inquiries",
  testimonials: "testimonials",
  faqs: "faqs"
};

export const LANGS = ["om", "am", "en"];
export const LANG_LABELS = { om: "Afaan Oromoo", am: "አማርኛ", en: "English" };
