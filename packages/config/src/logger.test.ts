import { describe, expect, it } from "vitest";
import { redact } from "./logger";

const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl";

describe("redact", () => {
  it("redacts sensitive keys at any depth", () => {
    expect(redact({ a: 1, password: "p", nested: { Authorization: "Bearer x", ok: "y" }, list: [{ token: "t" }] })).toEqual({
      a: 1,
      password: "[redacted]",
      nested: { Authorization: "[redacted]", ok: "y" },
      list: [{ token: "[redacted]" }],
    });
  });
  it("redacts supabase cookies and secrets by key", () => {
    expect(redact({ "sb-abc-auth-token": "v", SUPABASE_SECRET_KEY: "k", cookie: "c" })).toEqual({
      "sb-abc-auth-token": "[redacted]",
      SUPABASE_SECRET_KEY: "[redacted]",
      cookie: "[redacted]",
    });
  });
  it("redacts JWT-shaped values inside strings and errors", () => {
    expect(redact({ msg: `failed for ${jwt} today` })).toEqual({ msg: "failed for [redacted] today" });
    expect(redact(new Error(`bad ${jwt}`))).toEqual({ name: "Error", message: "bad [redacted]" });
  });
  it("leaves ordinary values alone", () => {
    expect(redact({ event: "login.failed", tenant: "t1", n: 3 })).toEqual({ event: "login.failed", tenant: "t1", n: 3 });
  });
});
