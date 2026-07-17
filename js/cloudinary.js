/**

cloudinary.js

IFAA HAQAA Admin CMS — Media upload via Cloudinary (NOT Firebase Storage)

Flow: phone/file picker -> Cloudinary unsigned upload -> { secure_url, public_id }

-> caller saves { url, public_id } into the relevant Firestore document.

SETUP REQUIRED (Cloudinary dashboard):

1. Create/confirm your cloud name below.



2. Settings -> Upload -> Add upload preset -> Signing Mode: "Unsigned".



3. Paste that preset name below.



Until both are set, uploads will fail with a clear on-screen error — there is

no silent mock/fallback, per the "no mock data" requirement.
*/


const CLOUDINARY_CLOUD_NAME = "gk1syntg";
const CLOUDINARY_UPLOAD_PRESET = "ifaa_haqaa_upload";
const CLOUDINARY_UPLOAD_URL = https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload;

// Server-side endpoint (see /api/delete-image.js) that performs the SIGNED
// Cloudinary destroy call. Deleting an asset requires your API secret,
// which must never live in this frontend file — so the actual delete
// happens on the server, using env vars set in the Vercel project.
const CLOUDINARY_DELETE_ENDPOINT = "/api/delete-image";

const MAX_FILE_SIZE_MB = 10;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

function assertConfigured() {
if (
CLOUDINARY_CLOUD_NAME === "YOUR_CLOUD_NAME" ||
CLOUDINARY_UPLOAD_PRESET === "YOUR_UNSIGNED_UPLOAD_PRESET"
) {
throw new Error(
"Cloudinary is not configured yet. Set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET in js/cloudinary.js."
);
}
}

function validateFile(file) {
if (!file) throw new Error("No file selected.");
if (!ACCEPTED_TYPES.includes(file.type)) {
throw new Error("Unsupported file type. Please upload a JPG, PNG, WEBP, GIF, or AVIF image.");
}
const sizeMB = file.size / (1024 * 1024);
if (sizeMB > MAX_FILE_SIZE_MB) {
throw new Error(File is too large (${sizeMB.toFixed(1)}MB). Max size is ${MAX_FILE_SIZE_MB}MB.);
}
}

/**

Uploads a single File/Blob to Cloudinary using an unsigned preset.

Works from mobile camera/gallery pickers as well as desktop drag/drop.

@param {File} file

@param {Object} [opts]

@param {string} [opts.folder] - optional Cloudinary folder, e.g. "ifaa-haqaa/products"

@param {(percent: number) => void} [opts.onProgress]

@returns {Promise<{url: string, public_id: string, width: number, height: number, format: string}>}
*/
export function uploadToCloudinary(file, opts = {}) {
assertConfigured();
validateFile(file);


const { folder, onProgress } = opts;

return new Promise((resolve, reject) => {
const formData = new FormData();
formData.append("file", file);
formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
if (folder) formData.append("folder", folder);

const xhr = new XMLHttpRequest();  
xhr.open("POST", CLOUDINARY_UPLOAD_URL, true);  

xhr.upload.onprogress = (e) => {  
  if (onProgress && e.lengthComputable) {  
    onProgress(Math.round((e.loaded / e.total) * 100));  
  }  
};  

xhr.onload = () => {  
  let payload;  
  try {  
    payload = JSON.parse(xhr.responseText);  
  } catch {  
    reject(new Error("Cloudinary returned an unreadable response."));  
    return;  
  }  

  if (xhr.status >= 200 && xhr.status < 300) {  
    resolve({  
      url: payload.secure_url,  
      public_id: payload.public_id,  
      width: payload.width,  
      height: payload.height,  
      format: payload.format  
    });  
  } else {  
    reject(new Error(payload?.error?.message || "Cloudinary upload failed."));  
  }  
};  

xhr.onerror = () => reject(new Error("Network error while uploading to Cloudinary."));  
xhr.send(formData);

});
}

/**

Convenience: wires a <input type="file"> element to Cloudinary upload,

showing progress on a target element and returning the result via callback.

@param {HTMLInputElement} inputEl

@param {Object} opts

@param {string} [opts.folder]

@param {(result: {url:string, public_id:string}) => void} opts.onSuccess

@param {(error: Error) => void} opts.onError

@param {(percent: number) => void} [opts.onProgress]

@param {() => void} [opts.onStart]
*/
export function wireFileInputToCloudinary(inputEl, opts) {
if (!inputEl) return;
inputEl.addEventListener("change", async () => {
const file = inputEl.files?.[0];
if (!file) return;
try {
opts.onStart?.();
const result = await uploadToCloudinary(file, {
folder: opts.folder,
onProgress: opts.onProgress
});
opts.onSuccess(result);
} catch (err) {
opts.onError(err);
} finally {
inputEl.value = "";
}
});
}


/**

Permanently deletes an asset from Cloudinary via the secure server-side

endpoint at /api/delete-image (see that file for the signed request).

Requires the caller to be signed in — pass a fresh Firebase ID token.

@param {string} publicId - the Cloudinary public_id to delete

@param {string} idToken - Firebase Auth ID token of the logged-in admin

@returns {Promise<{success: boolean, result: string}>}
*/
export async function deleteFromCloudinary(publicId, idToken) {
if (!publicId) throw new Error("No public_id provided — nothing to delete on Cloudinary.");
if (!idToken) throw new Error("Not authenticated — cannot delete media.");


const res = await fetch(CLOUDINARY_DELETE_ENDPOINT, {
method: "POST",
headers: {
"Content-Type": "application/json",
Authorization: Bearer ${idToken}
},
body: JSON.stringify({ public_id: publicId })
});

let payload;
try {
payload = await res.json();
} catch {
throw new Error("The delete endpoint returned an unreadable response.");
}

if (!res.ok) {
throw new Error(payload?.error || Cloudinary delete failed (HTTP ${res.status}).);
}

return payload;
}

/**

Deletion of Cloudinary assets requires a signed request (API secret),

which must never live in frontend code — that's what deleteFromCloudinary()

/api/delete-image.js are for.
*/
export function isCloudinaryConfigured() {
return (
CLOUDINARY_CLOUD_NAME !== "YOUR_CLOUD_NAME" &&
CLOUDINARY_UPLOAD_PRESET !== "YOUR_UNSIGNED_UPLOAD_PRESET"
);
}
