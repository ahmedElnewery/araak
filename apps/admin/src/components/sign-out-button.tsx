import { LogOut } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { signOutAction } from "@/features/auth/sign-out-action";

/** Icon-only while the AppShell header is narrow (phones), labelled otherwise; the label stays the accessible name. */
export function SignOutButton({ label }: { label: string }) {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="outline" size="sm" className="@max-lg:px-2">
        <span aria-hidden="true" className="@lg:hidden">
          <LogOut className="size-4 rtl:-scale-x-100" />
        </span>
        <span className="@max-lg:sr-only">{label}</span>
      </Button>
    </form>
  );
}
