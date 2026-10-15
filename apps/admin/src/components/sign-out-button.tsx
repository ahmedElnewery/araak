import { Button } from "@workspace/ui/components/button";
import { signOutAction } from "@/features/auth/sign-out-action";

export function SignOutButton({ label }: { label: string }) {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="outline" size="sm">
        {label}
      </Button>
    </form>
  );
}
