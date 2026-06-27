import { DEFAULT_SYNC_POLICY, resolveSyncOptions } from "./policy";

describe("resolveSyncOptions", () => {
  test("add trigger syncs both calibre and myreader by default", () => {
    const options = resolveSyncOptions("add", DEFAULT_SYNC_POLICY);

    expect(options).toMatchObject({
      scope: "all",
      forceCalibre: true,
      throwOnFailure: true,
    });
  });

  test("manual trigger syncs all scopes without forcing calibre", () => {
    const options = resolveSyncOptions("manual", DEFAULT_SYNC_POLICY);

    expect(options).toMatchObject({
      scope: "all",
      forceCalibre: false,
      throwOnFailure: true,
    });
  });

  test("startup trigger syncs all scopes without throwing", () => {
    const options = resolveSyncOptions("startup", DEFAULT_SYNC_POLICY);

    expect(options).toMatchObject({
      scope: "all",
      forceCalibre: false,
      throwOnFailure: false,
    });
  });

  test("scheduled reading trigger only pushes myreader changes", () => {
    const options = resolveSyncOptions("scheduled", DEFAULT_SYNC_POLICY, "reading");

    expect(options).toMatchObject({
      scope: "myreader",
      myreaderMode: "push_only",
      throwOnFailure: false,
    });
  });

  test("scheduled library trigger pulls myreader changes", () => {
    const options = resolveSyncOptions("scheduled", DEFAULT_SYNC_POLICY, "library");

    expect(options).toMatchObject({
      scope: "myreader",
      myreaderMode: "full",
      throwOnFailure: false,
    });
  });
});
