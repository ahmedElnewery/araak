import "server-only";
import sharp from "sharp";
import {
  LOGO_EXTENSION, LOGO_MAX_BYTES, LOGO_MAX_DIMENSION, LOGO_MIN_DIMENSION, isLogoMime, type LogoErrorCode, type LogoMime,
} from "../branding";

export type ProcessedLogo = { bytes: Buffer; mime: LogoMime; extension: "png" | "jpg" | "webp" };
export type LogoResult = { ok: true; logo: ProcessedLogo } | { ok: false; code: LogoErrorCode };

const FORMAT_MIME: Partial<Record<string, LogoMime>> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

/** Magic-byte sniffing: the content decides the type, never the file name or the client-declared MIME. */
export function sniffLogoMime(b: Uint8Array): LogoMime | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/**
 * Validates an uploaded logo (size, sniffed type vs declared type and extension, decodability, dimensions) and re-encodes
 * it, which strips all metadata (EXIF, ICC, text chunks). Returns stable error codes only.
 */
export async function processLogo(input: { bytes: Uint8Array; declaredMime: string; fileName: string }): Promise<LogoResult> {
  const { bytes, declaredMime, fileName } = input;
  if (bytes.byteLength > LOGO_MAX_BYTES) return { ok: false, code: "logo_too_large" };
  const sniffed = sniffLogoMime(bytes);
  if (!sniffed || !isLogoMime(declaredMime)) return { ok: false, code: "logo_type" };
  const ext = /\.([A-Za-z0-9]+)$/.exec(fileName)?.[1]?.toLowerCase();
  const okExt = sniffed === "image/jpeg" ? ["jpg", "jpeg"] : [LOGO_EXTENSION[sniffed]];
  if (sniffed !== declaredMime || !ext || !okExt.includes(ext)) return { ok: false, code: "logo_mismatch" };
  try {
    const image = sharp(bytes, { limitInputPixels: LOGO_MAX_DIMENSION * LOGO_MAX_DIMENSION * 4, failOn: "error" });
    const meta = await image.metadata();
    const format = FORMAT_MIME[meta.format];
    if (format !== sniffed) return { ok: false, code: "logo_mismatch" };
    const { width, height } = meta;
    if (!width || !height) return { ok: false, code: "logo_corrupt" };
    if (width > LOGO_MAX_DIMENSION || height > LOGO_MAX_DIMENSION || width < LOGO_MIN_DIMENSION || height < LOGO_MIN_DIMENSION) {
      return { ok: false, code: "logo_dimensions" };
    }
    // Re-encode (no withMetadata): drops EXIF/ICC and any trailing or embedded payloads.
    const out = sniffed === "image/png" ? image.png() : sniffed === "image/jpeg" ? image.jpeg({ quality: 90 }) : image.webp({ quality: 90 });
    const encoded = await out.toBuffer();
    return { ok: true, logo: { bytes: encoded, mime: sniffed, extension: LOGO_EXTENSION[sniffed] } };
  } catch (e) {
    if (e instanceof Error && /pixel limit/i.test(e.message)) return { ok: false, code: "logo_dimensions" };
    return { ok: false, code: "logo_corrupt" };
  }
}
