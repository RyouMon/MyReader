import { getCachedAuth, setCachedAuth, invalidateCachedAuth, clearAuthCache } from "./auth-cache";

beforeEach(() => {
  clearAuthCache();
});

describe("AuthCache", () => {
  test("returns null for missing entry", () => {
    expect(getCachedAuth("ds-1")).toBeNull();
  });

  test("stores and retrieves headers", () => {
    setCachedAuth("ds-1", { Authorization: "Bearer token" }, null);
    expect(getCachedAuth("ds-1")).toEqual({ Authorization: "Bearer token" });
  });

  test("returns null for expired entry", () => {
    const past = Date.now() - 1000;
    setCachedAuth("ds-1", { Authorization: "Bearer token" }, past);
    expect(getCachedAuth("ds-1")).toBeNull();
  });

  test("returns headers for non-expiring entry (expiresAt=null)", () => {
    setCachedAuth("ds-1", { Authorization: "Basic abc" }, null);
    expect(getCachedAuth("ds-1")).toEqual({ Authorization: "Basic abc" });
  });

  test("invalidateCachedAuth removes entry", () => {
    setCachedAuth("ds-1", { Authorization: "Bearer token" }, null);
    invalidateCachedAuth("ds-1");
    expect(getCachedAuth("ds-1")).toBeNull();
  });

  test("clearAuthCache removes all entries", () => {
    setCachedAuth("ds-1", { Authorization: "Bearer t1" }, null);
    setCachedAuth("ds-2", { Authorization: "Bearer t2" }, null);
    clearAuthCache();
    expect(getCachedAuth("ds-1")).toBeNull();
    expect(getCachedAuth("ds-2")).toBeNull();
  });

  test("overwrites previous entry for same key", () => {
    setCachedAuth("ds-1", { Authorization: "Bearer old" }, null);
    setCachedAuth("ds-1", { Authorization: "Bearer new" }, null);
    expect(getCachedAuth("ds-1")).toEqual({ Authorization: "Bearer new" });
  });
});
