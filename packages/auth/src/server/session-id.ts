import "server-only";

/** `session_id` claim of an access token the server itself just received from Supabase Auth (not user input). */
export function decodeSessionId(accessToken: string): string {
  const payload = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { session_id?: string };
  if (!payload.session_id) throw new Error("session_id_missing");
  return payload.session_id;
}
