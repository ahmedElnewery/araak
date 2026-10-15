import { redirect } from "next/navigation";
import { landingPath, requirePlatformSession } from "@/lib/platform-guards";

export default async function Home() {
  const ctx = await requirePlatformSession({ touch: false });
  redirect(landingPath(ctx.capabilities));
}
