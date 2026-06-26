import { act, renderHook as baseRenderHook, waitFor } from "@testing-library/react-native";

import type { BookItem, DataSource, Library } from "@/src/domain/types";
import type { BookDetail } from "@my-reader/tools/types/book";
import { resolveCoverForDetail } from "@/src/utils/book-detail";

import { useBookCoverUri } from "./use-book-cover-uri";

jest.mock("@/src/utils/book-detail", () => ({
  resolveCoverForDetail: jest.fn(),
}));

const activeLibrary: Library = {
  id: "lib-1",
  name: "Test Library",
  path: "/test",
  sourceType: "local",
} as Library;

const detail = {
  id: 1,
  title: "Test Book",
  formats: ["EPUB"],
} as unknown as BookDetail;

const listBook = {
  id: "1",
  coverUri: "file:///list/cover.jpg",
} as unknown as BookItem;

const dataSources: DataSource[] = [];

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("useBookCoverUri", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(resolveCoverForDetail).mockResolvedValue(undefined);
  });

  it("should use listBook coverUri when detail is null", async () => {
    const { result } = baseRenderHook(() =>
      useBookCoverUri(activeLibrary, null, listBook, dataSources),
    );

    await act(async () => {});

    expect(result.current.coverUri).toBe("file:///list/cover.jpg");
  });

  it("should resolve coverUri from detail", async () => {
    jest.mocked(resolveCoverForDetail).mockResolvedValue("file:///resolved/cover.jpg");

    const { result } = baseRenderHook(() =>
      useBookCoverUri(activeLibrary, detail, listBook, dataSources),
    );

    await waitFor(() => {
      expect(result.current.coverUri).toBe("file:///resolved/cover.jpg");
    });
  });

  it("should fallback to undefined when listBook and resolved cover are missing", async () => {
    const { result } = baseRenderHook(() =>
      useBookCoverUri(activeLibrary, detail, null, dataSources),
    );

    await act(async () => {});

    expect(result.current.coverUri).toBeUndefined();
  });

  it("should ignore resolved cover after unmount", async () => {
    const { promise, resolve } = createDeferred<string | undefined>();
    jest.mocked(resolveCoverForDetail).mockReturnValue(promise);

    const { unmount } = baseRenderHook(() =>
      useBookCoverUri(activeLibrary, detail, listBook, dataSources),
    );

    unmount();
    resolve("file:///resolved/cover.jpg");
    await act(async () => {});
  });

  it("should reset coverUri to listBook coverUri when detail becomes null", async () => {
    jest.mocked(resolveCoverForDetail).mockResolvedValue("file:///resolved/cover.jpg");

    const { result, rerender } = baseRenderHook(
      ({ bookDetail }: { bookDetail: BookDetail | null }) =>
        useBookCoverUri(activeLibrary, bookDetail, listBook, dataSources),
      { initialProps: { bookDetail: detail } },
    );

    await waitFor(() => {
      expect(result.current.coverUri).toBe("file:///resolved/cover.jpg");
    });

    rerender({ bookDetail: null });
    await act(async () => {});

    expect(result.current.coverUri).toBe("file:///list/cover.jpg");
  });
});
