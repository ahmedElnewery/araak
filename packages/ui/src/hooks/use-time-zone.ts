import * as React from "react"

const subscribe = () => () => {}
const viewerZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
const serverZone = () => "UTC"

/**
 * The viewer's IANA time zone for formatting times. Server rendering and hydration use UTC (the server cannot know the
 * viewer's zone), then React re-renders with the browser's zone, so there is never a hydration mismatch.
 */
export function useTimeZone(): string {
  return React.useSyncExternalStore(subscribe, viewerZone, serverZone)
}
