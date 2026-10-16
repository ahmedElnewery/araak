import { cn } from "@workspace/ui/lib/utils";

const SIZES = { sm: "size-8 text-xs", md: "size-9 text-[13px]", lg: "size-10 text-sm" } as const;

type Props = {
  /** From `initials()` (lib/initials.ts). */
  initials: string;
  size?: keyof typeof SIZES;
  shape?: "rounded" | "circle";
  /** Neutral colours, e.g. for a disabled account. */
  muted?: boolean;
  className?: string;
};

/** Initials on a soft accent square. Decorative: the person's name is always written next to it. */
export function Avatar({ initials, size = "md", shape = "rounded", muted = false, className }: Props) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-extrabold select-none",
        SIZES[size],
        shape === "circle" ? "rounded-full" : "rounded-[10px]",
        muted ? "bg-neutral-soft text-muted-foreground" : "bg-accent text-accent-foreground",
        className,
      )}
    >
      {initials}
    </span>
  );
}
