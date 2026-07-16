# IFAA HAQAA Admin Dashboard — Setup & Deployment Guide

This dashboard is a static ES-module app (no build step). It talks directly to
Firebase Authentication + Firestore, and to Cloudinary for media. Deploy it
alongside your existing site on Vercel.

---

## 1. Files to add to your project

Copy these into the root of your existing `IFAA-IFA-HAQAA` repo (the same repo
that already contains your live `index.html`):

```
admin.html
manifest.json          (replaces/adds a manifest for the admin app)
sw.js
firestore.rules
css/admin.css
js/firebase-config.js
js/auth.js
js/admin.js
js/products.js
js/gallery.js
js/content.js
js/inquiries.js
js/testimonials.js
js/faq.js
js/cloudinary.js
```

Your existing `index.html` is untouched — the dashboard lives at `/admin.html`
and is a separate app that shares the same Firebase project.

---

## 2. Create the first super admin account

Firebase Authentication lets you create *who* can log in; Firestore's `users`
collection decides *whether that person is allowed into the dashboard*. Both
steps are required.

1. **Firebase Console → Authentication → Users → Add user**
   - Email: `ifaaqabusinesssc@gmail.com`
   - Password: choose a strong password (you can change it later from
     Settings inside the dashboard, or via "Forgot password?" on the login screen).
   - Copy the generated **UID**.

2. **Firebase Console → Firestore Database → Start collection**
   - Collection ID: `users`
   - Document ID: paste the UID from step 1
   - Fields:
     | Field  | Type    | Value |
     |--------|---------|-------|
     | name   | string  | Administrator |
     | email  | string  | ifaaqabusinesssc@gmail.com |
     | role   | string  | super_admin |
     | active | boolean | true |

Only accounts with `role == "super_admin"` and `active == true` can open the
dashboard — everyone else is signed out automatically, even if their Firebase
Authentication login succeeds.

To add a second admin later: create their Firebase Auth user, then add a
matching `users/{uid}` document the same way.

---

## 3. Authorized domains (already set, verify anyway)

**Firebase Console → Authentication → Settings → Authorized domains** should list:

- `localhost`
- `walda-ifa-haqa.vercel.app`
- `ifahaqa.com.et`

---

## 4. Deploy Firestore security rules

The rules in `firestore.rules` enforce: public visitors can read published
content and submit inquiries, but only a verified `super_admin` can write
anything or read private collections (all inquiries, all testimonials, users).

```bash
npm install -g firebase-tools     # if not already installed
firebase login
firebase use ifaa-haqaa
firebase deploy --only firestore:rules
```

(If this is the first time deploying rules for the project, run
`firebase init firestore` first and point it at `firestore.rules`.)

---

## 5. Set up Cloudinary (media storage — not Firebase Storage)

1. Sign in at https://cloudinary.com and copy your **Cloud Name** from the dashboard.
2. **Settings → Upload → Upload presets → Add upload preset**
   - Signing Mode: **Unsigned**
   - Folder (optional but recommended): `ifaa-haqaa`
   - Save, and copy the preset name.
3. Open `js/cloudinary.js` and replace:
   ```js
   const CLOUDINARY_CLOUD_NAME = "YOUR_CLOUD_NAME";
   const CLOUDINARY_UPLOAD_PRESET = "YOUR_UNSIGNED_UPLOAD_PRESET";
   ```
   with your real values.

Until these are set, the dashboard will show a clear on-screen error the
moment someone tries to upload an image — there is no silent placeholder.

**Note on deleting Cloudinary assets:** deleting a product/gallery entry in
the dashboard removes it from Firestore immediately. Actually purging the
file from Cloudinary storage requires a *signed* API request (your API
secret must never live in frontend code). If you want true deletion from
Cloudinary too, add a small serverless function (e.g. a Vercel Edge/Node
function) that holds your Cloudinary API secret and calls the Admin API's
`destroy` method, then call that endpoint from `cloudinary.js`.

---

## 6. Firestore collections created automatically

You don't need to pre-create these — the dashboard creates documents in them
the first time you use each feature:

- `products`, `gallery`, `faqs`, `testimonials`, `inquiries` — created on first write.
- `content` — has four fixed document IDs: `about`, `mission`, `vision`, `contact`.
  Visit **Content CMS** in the dashboard and save each tab once to create them.

---

## 7. Deploy to Vercel

If `admin.html`/`js/`/`css/` live in the same repo as your existing site,
Vercel will redeploy automatically on your next push — no config changes
needed, since this is all static files.

```bash
git add admin.html manifest.json sw.js firestore.rules css/admin.css js/*.js
git commit -m "Add production admin dashboard"
git push
```

Vercel will publish `https://walda-ifa-haqa.vercel.app/admin.html` (and the
same path on `https://ifahaqa.com.et`) within a minute or two.

**Keep the admin URL out of search engines:** `admin.html` already sets
`<meta name="robots" content="noindex, nofollow">`. Consider also adding a
`Disallow: /admin.html` line to your `robots.txt` if you have one.

---

## 8. Using the dashboard

1. Visit `/admin.html` and log in with the super admin account from step 2.
2. **Dashboard** — live counts (products, gallery images, new inquiries,
   approved testimonials, FAQs) plus a 7‑day inquiry trend chart and a
   products‑by‑category breakdown.
3. **Products** — add/edit with Afaan Oromoo, Amharic, and English fields,
   category, status, featured toggle, and a Cloudinary image upload (works
   from a phone camera via the "Choose / Take Photo" button).
4. **Gallery** — same Cloudinary upload flow, with title (3 languages) and category.
5. **Content CMS** — edit About, Mission, Vision, and Contact copy in all three languages.
6. **Inquiries** — everything submitted through the website's contact form;
   search, filter, change status (New/Read/Completed), delete.
7. **Testimonials** — add testimonials directly, or moderate ones however
   they arrive; only `approved: true` testimonials should be queried by your
   public site.
8. **FAQ** — multilingual question/answer pairs with an active/hidden toggle.
9. **Settings** — change your own password (requires re-entering your current one).
10. **Profile** — view your admin role and account status.

---

## 9. Wiring the public website to this data (optional next step)

Your current `index.html` uses hard-coded product/testimonial/FAQ content.
To make the dashboard the real source of truth, replace those hard-coded
sections with Firestore reads, e.g.:

```js
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./js/firebase-config.js";

const snap = await getDocs(query(collection(db, "testimonials"), where("approved", "==", true)));
```

This is a separate task from the dashboard itself and isn't required for the
dashboard to function — flag it if you'd like that wiring done next.
