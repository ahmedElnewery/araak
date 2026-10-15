import { toErrorCode, type ErrorCode } from "@/lib/rpc-error";

export class RpcError extends Error {
  public readonly code: ErrorCode;
  constructor(error: { message: string; code?: string }) {
    super("rpc_error");
    this.name = "RpcError";
    this.code = toErrorCode(error);
  }
}

export function toErrorCodeOrGeneric(e: unknown): ErrorCode {
  return e instanceof RpcError ? e.code : "generic";
}
