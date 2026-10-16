/** Full-page loading state for route `loading.tsx` files. The visible mark is the six-dot `.loader` animation. */
export function PageLoader({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-svh items-center justify-center bg-background text-foreground"
    >
      <div className="loader" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
