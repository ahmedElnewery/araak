import { Building2 } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

type Props = {
  name: string;
  /** URL of the tenant logo served by the portal route. Absent: a neutral icon is shown (never a provider logo). */
  logoSrc?: string | null;
  /** Localized alt text for the logo, e.g. "Organization logo". */
  logoAlt: string;
  className?: string;
};

export function TenantIdentity({ name, logoSrc, logoAlt, className }: Props) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      {logoSrc ? (
        <img src={logoSrc} alt={logoAlt} width={36} height={36} className="size-9 shrink-0 rounded-md object-contain" />
      ) : (
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Building2 className="size-5" />
        </span>
      )}
      <span dir="auto" className="truncate text-sm font-semibold">
        {name}
      </span>
    </div>
  );
}
