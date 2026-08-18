import { describe, expect, it } from "vitest";
import { resolveOwnerClientIds } from "@/lib/auth/client-scope";

describe("resolveOwnerClientIds", () => {
  it("returns every assigned client when no client is requested", () => {
    const assigned = new Set(["client-a", "client-b"]);

    expect(resolveOwnerClientIds(assigned)).toEqual(["client-a", "client-b"]);
    expect(resolveOwnerClientIds(assigned, "")).toEqual(["client-a", "client-b"]);
  });

  it("narrows to the requested client when it is assigned", () => {
    const assigned = new Set(["client-a", "client-b"]);

    expect(resolveOwnerClientIds(assigned, "client-b")).toEqual(["client-b"]);
  });

  it("returns no client when the requested client is not assigned", () => {
    const assigned = new Set(["client-a"]);

    expect(resolveOwnerClientIds(assigned, "client-z")).toEqual([]);
  });

  it("returns no client when nothing is assigned", () => {
    expect(resolveOwnerClientIds(new Set())).toEqual([]);
    expect(resolveOwnerClientIds(new Set(), "client-a")).toEqual([]);
  });
});
