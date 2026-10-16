"use client";

import { XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@workspace/ui/components/sheet";

type Props = {
  dir: "rtl" | "ltr"; title: string; description: string; closeLabel: string;
  /** The list URL without the open event; closing the sheet navigates back to it. */
  closeHref: string;
  children: ReactNode;
};

/**
 * Details of one audit or security event, opened by `?event_id=` so the server fetched (and authorized) it. The sheet
 * slides in from the reading end: right in LTR, left in RTL.
 */
export function EventDetailsSheet({ dir, title, description, closeLabel, closeHref, children }: Props) {
  const router = useRouter();
  return (
    <Sheet open onOpenChange={(open) => { if (!open) router.push(closeHref, { scroll: false }); }}>
      <SheetContent dir={dir} side={dir === "rtl" ? "left" : "right"} showCloseButton={false} className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="pe-12">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">{children}</div>
        <SheetClose className="absolute end-4 top-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden">
          <XIcon className="size-4" aria-hidden="true" />
          <span className="sr-only">{closeLabel}</span>
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}
