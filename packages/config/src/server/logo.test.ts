import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processLogo } from "./logo";

const img = (w: number, h: number, fmt: "png" | "jpeg" | "webp") =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#087e89" } })[fmt]().withExif({ IFD0: { Copyright: "secret-meta" } }).toBuffer();

describe("processLogo", () => {
  it("accepts PNG, JPEG and WebP and strips metadata by re-encoding", async () => {
    for (const [fmt, mime, name] of [["png", "image/png", "l.png"], ["jpeg", "image/jpeg", "l.jpg"], ["webp", "image/webp", "l.webp"]] as const) {
      const r = await processLogo({ bytes: await img(128, 96, fmt), declaredMime: mime, fileName: name });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.logo.mime).toBe(mime);
        expect(r.logo.bytes.includes(Buffer.from("secret-meta"))).toBe(false);
      }
    }
  });
  it("rejects a disallowed MIME (SVG, GIF) and non-image bytes", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(await processLogo({ bytes: svg, declaredMime: "image/svg+xml", fileName: "l.svg" })).toEqual({ ok: false, code: "logo_type" });
    expect(await processLogo({ bytes: svg, declaredMime: "image/png", fileName: "l.png" })).toEqual({ ok: false, code: "logo_type" });
  });
  it("rejects an extension or declared-type mismatch with the real content", async () => {
    const png = await img(128, 128, "png");
    expect(await processLogo({ bytes: png, declaredMime: "image/jpeg", fileName: "l.jpg" })).toEqual({ ok: false, code: "logo_mismatch" });
    expect(await processLogo({ bytes: png, declaredMime: "image/png", fileName: "l.jpg" })).toEqual({ ok: false, code: "logo_mismatch" });
    expect(await processLogo({ bytes: png, declaredMime: "image/png", fileName: "logo" })).toEqual({ ok: false, code: "logo_mismatch" });
  });
  it("rejects oversized files, corrupt data and out-of-range dimensions", async () => {
    const big = Buffer.concat([await img(128, 128, "png"), Buffer.alloc(1024 * 1024)]);
    expect(await processLogo({ bytes: big, declaredMime: "image/png", fileName: "l.png" })).toEqual({ ok: false, code: "logo_too_large" });
    const png = await img(128, 128, "png");
    const corrupt = png.subarray(0, Math.floor(png.length / 2));
    expect(await processLogo({ bytes: corrupt, declaredMime: "image/png", fileName: "l.png" })).toEqual({ ok: false, code: "logo_corrupt" });
    expect(await processLogo({ bytes: await img(2000, 100, "png"), declaredMime: "image/png", fileName: "l.png" })).toEqual({ ok: false, code: "logo_dimensions" });
    expect(await processLogo({ bytes: await img(32, 32, "png"), declaredMime: "image/png", fileName: "l.png" })).toEqual({ ok: false, code: "logo_dimensions" });
  });
});
