/**
 * cloudinary.js
 * IFAA HAQAA Admin CMS — Media upload via Cloudinary (NOT Firebase Storage)
 *
 * Flow:
 * File picker → Cloudinary unsigned upload → { url, public_id }
 * Firestore stores media metadata.
 *
 * Delete:
 * Frontend → /api/delete-image.js → Cloudinary signed destroy API
 */

const CLOUDINARY_CLOUD_NAME = "gk1syntg";
const CLOUDINARY_UPLOAD_PRESET = "ifaa_haqaa_upload";

const CLOUDINARY_UPLOAD_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;

const CLOUDINARY_DELETE_ENDPOINT = "/api/delete-image";

const MAX_FILE_SIZE_MB = 10;

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif"
];


/**
 * Check Cloudinary configuration
 */
function assertConfigured() {
  if (
    CLOUDINARY_CLOUD_NAME === "YOUR_CLOUD_NAME" ||
    CLOUDINARY_UPLOAD_PRESET === "YOUR_UNSIGNED_UPLOAD_PRESET"
  ) {
    throw new Error(
      "Cloudinary is not configured. Check CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET."
    );
  }
}


/**
 * Validate uploaded file
 */
function validateFile(file) {

  if (!file) {
    throw new Error("No file selected.");
  }


  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error(
      "Unsupported file type. Upload JPG, PNG, WEBP, GIF or AVIF."
    );
  }


  const sizeMB = file.size / (1024 * 1024);


  if (sizeMB > MAX_FILE_SIZE_MB) {
    throw new Error(
      `File is too large (${sizeMB.toFixed(1)}MB). Maximum size is ${MAX_FILE_SIZE_MB}MB.`
    );
  }

}



/**
 * Upload file to Cloudinary
 *
 * @returns Promise<{url,public_id,width,height,format}>
 */
export function uploadToCloudinary(file, opts = {}) {

  assertConfigured();
  validateFile(file);


  const {
    folder,
    onProgress
  } = opts;


  return new Promise((resolve, reject)=>{


    const formData = new FormData();

    formData.append(
      "file",
      file
    );


    formData.append(
      "upload_preset",
      CLOUDINARY_UPLOAD_PRESET
    );


    if(folder){
      formData.append(
        "folder",
        folder
      );
    }



    const xhr = new XMLHttpRequest();


    xhr.open(
      "POST",
      CLOUDINARY_UPLOAD_URL,
      true
    );



    xhr.upload.onprogress = (event)=>{

      if(
        onProgress &&
        event.lengthComputable
      ){

        const percent =
          Math.round(
            (event.loaded / event.total) * 100
          );

        onProgress(percent);
      }

    };



    xhr.onload = ()=>{


      let data;


      try{

        data = JSON.parse(
          xhr.responseText
        );

      }catch{

        reject(
          new Error(
            "Cloudinary returned invalid response."
          )
        );

        return;

      }



      if(
        xhr.status >= 200 &&
        xhr.status < 300
      ){


        resolve({

          url:data.secure_url,

          public_id:data.public_id,

          width:data.width,

          height:data.height,

          format:data.format

        });


      }else{


        reject(
          new Error(
            data?.error?.message ||
            "Cloudinary upload failed."
          )
        );

      }

    };



    xhr.onerror = ()=>{

      reject(
        new Error(
          "Network error while uploading."
        )
      );

    };



    xhr.send(formData);


  });

}



/**
 * Connect file input with Cloudinary uploader
 */
export function wireFileInputToCloudinary(
  inputEl,
  opts
){

  if(!inputEl) return;


  inputEl.addEventListener(
    "change",
    async()=>{


      const file =
        inputEl.files?.[0];


      if(!file) return;



      try{


        opts.onStart?.();


        const result =
          await uploadToCloudinary(
            file,
            {
              folder:opts.folder,
              onProgress:opts.onProgress
            }
          );



        opts.onSuccess(result);



      }catch(error){


        opts.onError(error);



      }finally{


        inputEl.value = "";

      }


    }
  );

}




/**
 * Delete Cloudinary asset
 *
 * Uses secure backend:
 * /api/delete-image.js
 *
 * Requires Firebase Auth ID token.
 */
export async function deleteFromCloudinary(
  publicId,
  idToken
){

  if(!publicId){

    throw new Error(
      "No public_id provided."
    );

  }


  if(!idToken){

    throw new Error(
      "Not authenticated."
    );

  }



  const response =
    await fetch(
      CLOUDINARY_DELETE_ENDPOINT,
      {

        method:"POST",

        headers:{

          "Content-Type":
          "application/json",

          "Authorization":
          `Bearer ${idToken}`

        },


        body:JSON.stringify({

          public_id:publicId

        })

      }
    );



  let data;


  try{

    data =
      await response.json();

  }catch{

    throw new Error(
      "Delete API returned invalid response."
    );

  }



  if(!response.ok){

    throw new Error(
      data?.error ||
      "Cloudinary deletion failed."
    );

  }



  return data;

}





/**
 * Check if Cloudinary is ready
 */
export function isCloudinaryConfigured(){

  return (

    CLOUDINARY_CLOUD_NAME !== "YOUR_CLOUD_NAME"

    &&

    CLOUDINARY_UPLOAD_PRESET !== "YOUR_UNSIGNED_UPLOAD_PRESET"

  );

}
