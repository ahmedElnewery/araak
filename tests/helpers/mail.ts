// Mail catcher access for E2E (Mailpit-compatible HTTP API). Never used outside tests.
const base = () => process.env.MAIL_CATCHER_URL ?? "http://127.0.0.1:8025";

type MailpitList = { messages: { ID: string; To: { Address: string }[] }[] };

/** Polls the catcher until a message for `to` arrives, then returns its plain-text body. */
export async function waitForMail(to: string, timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${base()}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    if (res.ok) {
      const list = (await res.json()) as MailpitList;
      const first = list.messages[0];
      if (first) {
        const msg = await fetch(`${base()}/api/v1/message/${first.ID}`);
        return ((await msg.json()) as { Text: string }).Text;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no mail for ${to} within ${timeoutMs}ms`);
}

export function extractLink(body: string, pathFragment: string): string {
  const m = new RegExp(`https?://[^\\s]*${pathFragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\s]*`).exec(body);
  if (!m) throw new Error(`no ${pathFragment} link in mail`);
  return m[0];
}

/** Empties the catcher so the next `waitForMail` can only see mail sent after this call. */
export async function clearMail(): Promise<void> {
  await fetch(`${base()}/api/v1/messages`, { method: "DELETE" });
}
