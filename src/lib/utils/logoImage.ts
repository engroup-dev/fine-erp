/**
 * W6-02: turn a picked image file into a PNG or WebP data URL small enough for the
 * company logo (the server takes PNG/JPEG/WebP up to `maxBytes`, prefix included,
 * and checks the bytes against the declared type). The image is redrawn on a canvas,
 * so what goes up is always a freshly encoded raster — never SVG, never the file's
 * own bytes or metadata.
 */

/** Longest side of the stored logo; a print header shows it about 48px tall. */
const MAX_SIDE = 600;
const MIN_SIDE = 48;
const WEBP_QUALITIES = [0.92, 0.85, 0.75, 0.6, 0.45];

export class LogoImageError extends Error {}

const isSvg = (file: File): boolean =>
  file.type === "image/svg+xml" || /\.svgz?$/i.test(file.name);

const encode = (bitmap: ImageBitmap, side: number, type: "image/png" | "image/webp", quality?: number): string => {
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new LogoImageError("تعذّر تجهيز الصورة.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(type, quality);
};

export async function fileToLogoDataUrl(file: File, maxBytes: number): Promise<string> {
  if (isSvg(file)) {
    throw new LogoImageError("صور SVG غير مقبولة — اختر صورة PNG أو JPEG أو WebP.");
  }
  if (!file.type.startsWith("image/")) {
    throw new LogoImageError("الملف المختار ليس صورة.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new LogoImageError("تعذّرت قراءة الصورة — جرّب ملف PNG أو JPEG.");
  }

  try {
    // PNG first (keeps transparency, sharp edges), then WebP at falling quality,
    // shrinking the image until one of them fits. The first pass is always at the image's
    // own size (capped at MAX_SIDE), so a logo already smaller than MIN_SIDE is still tried.
    let side = Math.min(MAX_SIDE, Math.max(bitmap.width, bitmap.height));
    for (;;) {
      const png = encode(bitmap, side, "image/png");
      if (png.length <= maxBytes) return png;
      for (const quality of WEBP_QUALITIES) {
        const webp = encode(bitmap, side, "image/webp", quality);
        // A canvas that cannot encode WebP falls back to PNG; only a real WebP counts here.
        if (webp.startsWith("data:image/webp;") && webp.length <= maxBytes) return webp;
      }
      if (side <= MIN_SIDE) break;
      side = Math.max(MIN_SIDE, Math.floor(side * 0.75));
    }
  } finally {
    bitmap.close();
  }
  throw new LogoImageError("تعذّر تصغير الصورة إلى الحجم المسموح (200 ك.ب) — اختر صورة أبسط.");
}
