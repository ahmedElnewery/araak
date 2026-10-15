"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { requestSelfServiceRecovery } from "@workspace/auth/server";
import { getI18n } from "@/lib/locale";
import { getMailContext } from "@/lib/mail-context";
import { requireTenant } from "@/lib/tenant-context";

export type RecoveryRequestState = { done?: true };

const schema = z.object({ identifier: z.string().trim().min(1).max(320) });

/** The response is ALWAYS the same neutral confirmation, including for unknown input and when throttled. */
export async function requestRecoveryAction(_prev: RecoveryRequestState, formData: FormData): Promise<RecoveryRequestState> {
  const tenant = await requireTenant();
  const parsed = schema.safeParse({ identifier: formData.get("identifier") });
  if (!parsed.success) return { done: true };
  const { locale } = await getI18n();
  const mail = getMailContext();
  await requestSelfServiceRecovery({
    tenant: { id: tenant.id, displayName: tenant.displayName, subdomain: tenant.subdomain },
    identifier: parsed.data.identifier,
    headers: await headers(),
    hmacKey: mail.env.AUTH_THROTTLE_HMAC_KEY,
    trustedProxyHops: mail.env.TRUSTED_PROXY_HOPS,
    mailer: mail.mailer,
    locale,
    appEnv: mail.appEnv,
    portalBaseDomain: mail.portalBaseDomain,
    defer: (work) => {
      after(work);
    },
  });
  return { done: true };
}
