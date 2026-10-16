"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { useRef, type ComponentType, type ReactNode } from "react";
import type { ShellLinkProps } from "@workspace/ui/components/app-shell";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";

type Props = {
  dir: "rtl" | "ltr";
  /** Display name, already direction-isolated by the caller (StaffName, LtrText). */
  name: ReactNode;
  /** Second line under the name in the trigger (role or username); hidden on phones. */
  detail?: ReactNode;
  /** Shown in the menu header under the name. */
  email?: ReactNode;
  initials: string;
  label: string;
  items?: { href: string; label: string; icon?: ReactNode }[];
  link: ComponentType<ShellLinkProps>;
  signOut: { label: string; action: () => void | Promise<void> };
};

function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-[10px] bg-accent text-[13px] font-extrabold text-accent-foreground ${className ?? "size-9"}`}>
      {initials}
    </span>
  );
}

/**
 * The account entry at the end of the top bar: avatar and name, opening the person's own pages and sign-out.
 * Sign-out posts a form that lives outside the menu, so closing the menu cannot cancel the submission.
 */
export function AccountMenu({ dir, name, detail, email, initials, label, items = [], link: Link, signOut }: Props) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <>
      <form ref={form} action={signOut.action} className="hidden" />
      <DropdownMenu dir={dir}>
        <DropdownMenuTrigger
          data-testid="account-menu"
          className="flex h-11 min-w-0 items-center gap-2.5 rounded-xl px-1.5 text-start transition-colors hover:bg-hover data-[state=open]:bg-hover md:px-2"
        >
          <Avatar initials={initials} />
          <span className="sr-only min-w-0 flex-col leading-tight md:not-sr-only md:flex">
            <span className="truncate text-[13px] font-bold">{name}</span>
            {detail ? <span className="truncate text-[11px] text-subtle">{detail}</span> : null}
          </span>
          <ChevronDown aria-hidden="true" className="hidden size-4 shrink-0 text-subtle md:block" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} aria-label={label} className="w-64 rounded-xl p-1.5">
          <DropdownMenuLabel className="flex items-center gap-2.5 px-2 py-2 font-normal">
            <Avatar initials={initials} />
            <span className="flex min-w-0 flex-col leading-snug">
              <span className="truncate text-[13px] font-bold">{name}</span>
              {/* an address is left-to-right: it is cut at its end, still aligned with the name in RTL */}
              {email ? <span dir="ltr" className="truncate text-xs text-subtle rtl:text-right">{email}</span> : null}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {items.map((item) => (
            <DropdownMenuItem key={item.href} asChild className="min-h-10 gap-2.5 px-2 text-sm font-semibold">
              <Link href={item.href}>
                {item.icon ? <span aria-hidden="true" className="flex [&_svg]:size-[1.125rem]">{item.icon}</span> : null}
                {item.label}
              </Link>
            </DropdownMenuItem>
          ))}
          {items.length ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem className="min-h-10 gap-2.5 px-2 text-sm font-semibold" onSelect={() => { form.current?.requestSubmit(); }}>
            <LogOut aria-hidden="true" className="size-[1.125rem] rtl:-scale-x-100" />
            {signOut.label}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
