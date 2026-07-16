/**
 * auth.js
 * IFAA HAQAA Admin CMS — Authentication & authorization
 *
 * Handles: email/password login, remember-session toggle, logout,
 * forgot password, change password, and role-gated route protection.
 *
 * Authorization model:
 *   Firebase Auth confirms WHO the user is.
 *   Firestore users/{uid} confirms WHAT they're allowed to do.
 *   Only role === "super_admin" AND active === true may use the dashboard.
 */

import { auth, db, PERSISTENCE, COLLECTIONS } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  setPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/** Cache of the verified admin profile for the current session. */
export let currentAdminProfile = null;

/**
 * Reads users/{uid} and enforces the authorization policy.
 * @returns {Promise<object>} the admin profile document data
 * @throws {Error} if the account is not an active super_admin
 */
async function verifyAdminAccess(uid) {
  const snap = await getDoc(doc(db, COLLECTIONS.users, uid));

  if (!snap.exists()) {
    throw new Error("NO_ADMIN_PROFILE");
  }

  const data = snap.data();

  if (data.role !== "super_admin" || data.active !== true) {
    throw new Error("NOT_AUTHORIZED");
  }

  currentAdminProfile = { uid, ...data };
  return currentAdminProfile;
}

/**
 * Logs in with email/password.
 * @param {string} email
 * @param {string} password
 * @param {boolean} remember - true = persist across browser restarts, false = session-only
 */
export async function login(email, password, remember = true) {
  await setPersistence(auth, remember ? PERSISTENCE.local : PERSISTENCE.session);
  const cred = await signInWithEmailAndPassword(auth, email, password);

  try {
    await verifyAdminAccess(cred.user.uid);
  } catch (err) {
    // Authenticated with Firebase but not authorized for the dashboard — sign them back out.
    await signOut(auth);
    throw err;
  }

  return currentAdminProfile;
}

/** Logs the current user out and clears the cached profile. */
export async function logout() {
  currentAdminProfile = null;
  await signOut(auth);
}

/** Sends a password-reset email. */
export async function requestPasswordReset(email) {
  await sendPasswordResetEmail(auth, email);
}

/**
 * Changes the logged-in admin's password. Requires re-authentication
 * with the current password for security.
 */
export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error("NOT_LOGGED_IN");

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

/**
 * Route guard for admin.html. Resolves with the admin profile once verified,
 * or redirects to the login screen (via the onUnauthorized callback) otherwise.
 * Call this once on page load.
 *
 * @param {(profile: object) => void} onAuthorized
 * @param {(reason: string) => void} onUnauthorized
 * @returns {() => void} unsubscribe function
 */
export function guardAdminRoute(onAuthorized, onUnauthorized) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentAdminProfile = null;
      onUnauthorized("SIGNED_OUT");
      return;
    }

    try {
      const profile = await verifyAdminAccess(user.uid);
      onAuthorized(profile);
    } catch (err) {
      await signOut(auth).catch(() => {});
      onUnauthorized(err.message || "UNAUTHORIZED");
    }
  });
}

/** Human-readable messages for Firebase Auth error codes. */
export function describeAuthError(error) {
  const code = error?.code || error?.message || "";
  const map = {
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password. Please try again.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
    "auth/requires-recent-login": "For security, please log in again before changing your password.",
    "auth/weak-password": "Choose a stronger password (at least 6 characters).",
    NOT_AUTHORIZED: "This account is not authorized to access the admin dashboard.",
    NO_ADMIN_PROFILE: "No admin profile exists for this account. Contact a super admin."
  };
  return map[code] || error?.message || "Something went wrong. Please try again.";
}
