/** Cookie that remembers whether the primary sidebar is collapsed to icons. Read by the app layouts on the server so the
 * first paint already has the right width; written by AppShell when the person toggles it. A layout preference only. */
export const SIDEBAR_COOKIE = "sidebar";
export const SIDEBAR_COLLAPSED = "collapsed";
