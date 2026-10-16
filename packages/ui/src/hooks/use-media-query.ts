import * as React from "react"

/**
 * Whether a media query matches. Server rendering and hydration use `serverValue`, then React re-renders with the
 * browser's answer, so there is never a hydration mismatch.
 */
export function useMediaQuery(query: string, serverValue = true): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => { mql.removeEventListener("change", onChange) }
    },
    [query],
  )
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => serverValue)
}
