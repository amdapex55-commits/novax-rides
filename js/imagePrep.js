// Turn whatever the phone hands us into something the backend will accept.
//
// THE BUG THIS EXISTS FOR
//
// The presign endpoint whitelists jpeg/png/webp/pdf — correctly, because an
// open contentType field lets a client presign a URL for uploading an .html
// or an .exe into a bucket meant to hold documents. But a phone does not hand
// you a jpeg:
//
//   iPhone photo library  -> image/heic   (rejected)
//   some Android cameras  -> image/jpg    (rejected — not a real mime type)
//   a few pickers         -> ""           (rejected)
//
// So a driver picked a photo of their licence and got "Failed, tap to retry"
// forever, with nothing wrong on either side. Verified against production:
// image/jpeg passes, heic/heif/jpg/empty all 400.
//
// Widening the allowlist would have fixed the 400 and left two worse
// problems: Chrome cannot render HEIC, so ops would approve blank images, and
// a modern phone photo is 4–6MB, which on Karachi mobile data is a slow
// upload that frequently fails halfway.
//
// So the file is decoded and re-encoded as JPEG at a sane size instead. That
// normalises the type, kills the size problem, and applies EXIF rotation on
// the way through — iOS especially hands back sideways photos otherwise.

const MAX_EDGE = 1600;   // a licence is legible far below this
const QUALITY = 0.85;

/** PDFs and anything already acceptable and small are passed straight through. */
function needsNoWork(file) {
  return file.type === "application/pdf";
}

/**
 * @param {File} file
 * @returns {Promise<{blob: Blob, contentType: string, fileName: string}>}
 */
export async function prepareForUpload(file) {
  if (needsNoWork(file)) {
    return { blob: file, contentType: file.type, fileName: file.name || "document.pdf" };
  }

  try {
    const bitmap = await decode(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob) throw new Error("canvas produced nothing");

    return { blob, contentType: "image/jpeg", fileName: renameToJpg(file.name) };
  } catch {
    /* Decoding failed. Android Chrome cannot decode HEIC AT ALL, which is
       precisely the case that needs converting — so this path is not an edge
       case, it is a whole platform.

       The first version of this fallback handed back file.type unchanged,
       which meant it returned "image/heic" and the presign call rejected it
       exactly as before. The fix converted nothing and changed nothing on
       Android.

       The bytes are fine and the server now accepts these types, so the only
       job here is to never send a label the server will refuse: no empty
       string, no invented mime type. */
    return {
      blob: file,
      contentType: safeContentType(file),
      fileName: file.name || "upload.jpg",
    };
  }
}

/** A content type the presign endpoint is known to accept, every time. */
const BY_EXTENSION = {
  jpg: "image/jpeg", jpeg: "image/jpeg", jpe: "image/jpeg",
  png: "image/png", webp: "image/webp", pdf: "application/pdf",
  heic: "image/heic", heif: "image/heif",
};
const ACCEPTED = new Set([
  "image/jpeg", "image/png", "image/webp", "application/pdf",
  "image/heic", "image/heif", "image/jpg", "image/pjpeg",
]);

export function safeContentType(file) {
  const declared = String(file?.type || "").toLowerCase().trim();
  if (ACCEPTED.has(declared)) return declared;

  // The type is missing or something the server will not take. The filename
  // is the next best evidence, and phones name their files honestly even
  // when they label them badly.
  const ext = String(file?.name || "").toLowerCase().split(".").pop();
  if (BY_EXTENSION[ext]) return BY_EXTENSION[ext];

  // Nothing to go on. JPEG is the overwhelmingly likely truth for a file
  // chosen through accept="image/*", and a wrong-but-accepted label that
  // stores the bytes beats a correct label that loses them.
  return "image/jpeg";
}

/** createImageBitmap handles EXIF orientation; the <img> fallback does not,
 *  but it works in browsers that lack the option. */
async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return await createImageBitmap(file);
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error("image decode failed"));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function renameToJpg(name) {
  const base = String(name || "upload").replace(/\.[^.]+$/, "");
  return `${base || "upload"}.jpg`;
}
