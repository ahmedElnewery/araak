export type AuthErrorCode = "unauthenticated" | "forbidden" | "suspended" | "session_expired";

/** Stable, neutral error codes. Messages are localized by the callers; never put account details here. */
export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(code);
    this.name = "AuthError";
  }
}
