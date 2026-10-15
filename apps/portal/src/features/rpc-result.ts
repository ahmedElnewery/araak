import { toErrorCode, type ErrorCode } from "@/lib/rpc-error";
import { RpcError } from "./staff/rpc";

type Denied = { ok: false; error: string };
type Granted<T> = { ok: true } & T;

/**
 * The role and staff RPCs return `{ok:false,error}` for audited business denials and raise for missing authority.
 * Returns the success payload, or the stable error code (never raw database text).
 */
export function unwrapRpc<T extends object = object>(res: { data: unknown; error: { message: string; code?: string } | null }): { ok: true; data: Granted<T> } | { ok: false; error: ErrorCode } {
  if (res.error) return { ok: false, error: new RpcError(res.error).code };
  const d = res.data as Granted<T> | Denied | null;
  if (!d) return { ok: false, error: "generic" };
  if (!d.ok) return { ok: false, error: toErrorCode({ message: d.error }) };
  return { ok: true, data: d };
}
