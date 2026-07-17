/**
 * /api/delete-image.js
 * IFAA HAQAA — Secure Cloudinary asset deletion
 *
 * Cloudinary's destroy endpoint requires a SIGNED request (api_key + api_secret).
 * The secret must never be shipped to the browser, so this small serverless
 * function holds it (as a Vercel environment variable) and performs the
 * signed call on the admin dashboard's behalf.
 *
 * Flow: admin dashboard (gallery.js) --POST--> /api/delete-image
 *       --(verifies caller is signed in)--> Cloudinary destroy (signed)
 *
 * Required Vercel environment variables (Project Settings -> Environment Variables):
 *   CLOUDINARY_CLOUD_NAME   = gk1syntg
 *   CLOUDINARY_API_KEY      = <from Cloudinary Dashboard -> Settings -> API Keys>
 *   CLOUDINARY_API_SECRET   = <from Cloudinary Dashboard -> Settings -> API Keys>
 *
 * The Firebase Web API key below is NOT a secret (it's already public in the
 * client bundle) — it's only used to ask Google "is this ID token valid?".
 */

const crypto = require("crypto");

const FIREBASE_WEB_API_KEY = "AIzaSyA22wNSNIWNBrp25vGyLuB1MhhucwVwYaw";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  // ---- 1. Require a signed-in Firebase user (admin.js only calls this after login) ----
  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!idToken) {
    res.status(401).json({ error: "Missing Authorization header." });
    return;
  }

  const user = await verifyFirebaseIdToken(idToken);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired session. Please log in again." });
    return;
  }

  // ---- 2. Validate input ----
  const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body;
  const publicId = body?.public_id;

  if (!publicId || typeof publicId !== "string") {
    res.status(400).json({ error: "Missing or invalid public_id." });
    return;
  }

  // ---- 3. Confirm server credentials are configured ----
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    res.status(500).json({
      error:
        "Cloudinary server credentials are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your Vercel project's environment variables."
    });
    return;
  }

  // ---- 4. Build the signed Cloudinary destroy request ----
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureBase = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash("sha1").update(signatureBase).digest("hex");

  const form = new URLSearchParams();
  form.append("public_id", publicId);
  form.append("timestamp", String(timestamp));
  form.append("api_key", apiKey);
  form.append("signature", signature);

  try {
    const cloudinaryRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });

    const data = await cloudinaryRes.json();

    // Cloudinary returns result: "ok" on success, "not found" if it was already gone —
    // both mean the asset no longer exists, which is what the caller wants.
    if (data.result !== "ok" && data.result !== "not found") {
      res.status(502).json({ error: "Cloudinary did not confirm the deletion.", detail: data });
      return;
    }

    res.status(200).json({ success: true, result: data.result });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected error deleting the Cloudinary asset." });
  }
};

/** Confirms an ID token is currently valid by asking Firebase directly. */
async function verifyFirebaseIdToken(idToken) {
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken })
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.users && data.users[0] ? data.users[0] : null;
  } catch {
    return null;
  }
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
