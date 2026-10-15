import "server-only";
import { processLogo, type LogoResult } from "@workspace/config/server";

/** Server-side logo validation for an uploaded form file: size, sniffed type, extension, decode, dimensions, re-encode. */
export async function validateLogoFile(file: File): Promise<LogoResult> {
  return processLogo({ bytes: new Uint8Array(await file.arrayBuffer()), declaredMime: file.type, fileName: file.name });
}
