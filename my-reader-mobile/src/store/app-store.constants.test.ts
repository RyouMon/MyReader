import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "@/src/constants/local-library-data-source";
import { mergeDataSources, persistableDataSources } from "./app-store.constants";

describe("mergeDataSources", () => {
  test("filters out builtin local data source id", () => {
    const result = mergeDataSources([
      { id: LOCAL_LIBRARY_DATA_SOURCE_ID, hasPassword: false },
      { id: "webdav-1", hasPassword: false },
    ] as any);

    expect(result).toEqual([{ id: "webdav-1", hasPassword: false }]);
  });
});

describe("persistableDataSources", () => {
  test("removes password field and preserves hasPassword semantics", () => {
    const result = persistableDataSources([
      { id: LOCAL_LIBRARY_DATA_SOURCE_ID, hasPassword: false, password: "ignore" },
      { id: "webdav-1", hasPassword: false, password: "secret" },
      { id: "webdav-2", hasPassword: true },
    ] as any);

    expect(result).toEqual([
      { id: "webdav-1", hasPassword: true },
      { id: "webdav-2", hasPassword: true },
    ]);
    expect("password" in result[0]!).toBe(false);
  });
});
