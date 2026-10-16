import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { metadataEntries } from "@/features/audit/present";

/** Previous / "Page x of y" / Next. Links are plain GET URLs, so every page is re-authorized by the server. */
export function AuditPagination({ page, pages, href, labels }: {
  page: number; pages: number; href: (page: number) => string;
  labels: { pagination: string; previous: string; next: string; pageOf: string };
}) {
  if (pages <= 1) return null;
  const link = (enabled: boolean, target: number, text: string) =>
    enabled ? (
      <Link href={href(target)} className={buttonVariants({ variant: "outline", size: "sm" })}>{text}</Link>
    ) : (
      <span aria-disabled="true" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>{text}</span>
    );
  return (
    <nav aria-label={labels.pagination} className="flex flex-wrap items-center justify-between gap-3">
      {link(page > 1, page - 1, labels.previous)}
      <span className="text-sm text-muted-foreground">
        {labels.pageOf.replace("{page}", String(page)).replace("{pages}", String(pages))}
      </span>
      {link(page < pages, page + 1, labels.next)}
    </nav>
  );
}

/** A definition list of the event's fixed fields followed by its (already sanitized) metadata. */
export function EventDetails({ fields, metadata, labels }: {
  fields: { term: string; value: ReactNode }[]; metadata: Record<string, unknown>;
  labels: { details: string; noDetails: string };
}) {
  const entries = metadataEntries(metadata);
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {fields.map((f) => (
          <div key={f.term} className="contents">
            <dt className="text-muted-foreground">{f.term}</dt>
            <dd className="min-w-0 break-words">{f.value}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-2">
        <h3 className="font-medium">{labels.details}</h3>
        {entries.length === 0 ? <p className="text-muted-foreground">{labels.noDetails}</p> : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1" dir="ltr">
            {entries.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
                <dd className="min-w-0 break-all font-mono text-xs">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

/** Raw codes and ids stay left-to-right inside RTL text. */
export function Code({ children }: { children: ReactNode }) {
  return <bdi dir="ltr" className="font-mono text-xs">{children}</bdi>;
}
