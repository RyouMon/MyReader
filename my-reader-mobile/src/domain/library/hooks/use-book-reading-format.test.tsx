import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import type { Library } from "@/src/domain/types";
import { getAllBookFormats } from "@/src/domain/library/calibre";
import {
  clearBookReadingFormat,
  listBookReadingFormats,
  setBookReadingFormat,
} from "@/src/repos/book-reading-format";

import { useBookReadingFormat, fetchBookReadingFormats } from "./use-book-reading-format";

jest.mock("@/src/domain/library/calibre", () => ({
  getAllBookFormats: jest.fn(),
}));

jest.mock("@/src/repos/book-reading-format", () => ({
  clearBookReadingFormat: jest.fn(),
  listBookReadingFormats: jest.fn(),
  setBookReadingFormat: jest.fn(),
}));

const mockLibrary: Library = {
  id: "lib-1",
  name: "Test Library",
  path: "/test",
  sourceType: "local",
} as Library;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 0, gcTime: 0 } },
  });
  return (
    <QueryClientProvider client={client}>{children as never}</QueryClientProvider>
  );
}

describe("useBookReadingFormat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns an empty map when no library is selected", async () => {
    const { result, unmount } = renderHook(
      () => useBookReadingFormat(null),
      { wrapper },
    );

    expect(result.current.selectedFormatById).toEqual({});
    expect(listBookReadingFormats).not.toHaveBeenCalled();
    expect(getAllBookFormats).not.toHaveBeenCalled();

    unmount();
  });

  it("returns an empty map when fetching formats without a library", async () => {
    const result = await fetchBookReadingFormats(null);

    expect(result).toEqual({});
    expect(listBookReadingFormats).not.toHaveBeenCalled();
    expect(getAllBookFormats).not.toHaveBeenCalled();
  });

  it("returns selected formats only for books with multiple readable formats", async () => {
    jest.mocked(listBookReadingFormats).mockResolvedValue([
      { bookId: 1, readingFormat: "epub" },
      { bookId: 2, readingFormat: "pdf" },
      { bookId: 3, readingFormat: "cbz" },
    ] as Awaited<ReturnType<typeof listBookReadingFormats>>);

    jest.mocked(getAllBookFormats).mockResolvedValue({
      "1": ["EPUB", "PDF"],
      "2": ["EPUB"],
      "3": [],
    });

    const { result, unmount } = renderHook(
      () => useBookReadingFormat(mockLibrary),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.selectedFormatById).toEqual({ "1": "epub" }),
    );

    expect(getAllBookFormats).toHaveBeenCalledWith(mockLibrary);
    expect(listBookReadingFormats).toHaveBeenCalledWith(mockLibrary);

    unmount();
  });

  it("sets the reading format when the book has multiple readable formats", async () => {
    jest.mocked(listBookReadingFormats).mockResolvedValue([] as Awaited<ReturnType<typeof listBookReadingFormats>>);
    jest.mocked(getAllBookFormats).mockResolvedValue({
      "1": ["EPUB", "PDF"],
    });
    jest.mocked(setBookReadingFormat).mockResolvedValue(undefined);

    const { result, unmount } = renderHook(
      () => useBookReadingFormat(mockLibrary),
      { wrapper },
    );

    await waitFor(() => expect(result.current.selectedFormatById).toEqual({}));

    await act(async () => {
      await result.current.setBookReadingFormat("1", "pdf");
    });

    expect(setBookReadingFormat).toHaveBeenCalledWith(mockLibrary, 1, "pdf");
    expect(clearBookReadingFormat).not.toHaveBeenCalled();

    unmount();
  });

  it("clears the reading format when set to null", async () => {
    jest.mocked(listBookReadingFormats).mockResolvedValue([] as Awaited<ReturnType<typeof listBookReadingFormats>>);
    jest.mocked(getAllBookFormats).mockResolvedValue({});
    jest.mocked(clearBookReadingFormat).mockResolvedValue(undefined);

    const { result, unmount } = renderHook(
      () => useBookReadingFormat(mockLibrary),
      { wrapper },
    );

    await waitFor(() => expect(result.current.selectedFormatById).toEqual({}));

    await act(async () => {
      await result.current.setBookReadingFormat("1", null);
    });

    expect(clearBookReadingFormat).toHaveBeenCalledWith(mockLibrary, 1);
    expect(setBookReadingFormat).not.toHaveBeenCalled();

    unmount();
  });

  it("clears the reading format when the book has only one readable format", async () => {
    jest.mocked(listBookReadingFormats).mockResolvedValue([] as Awaited<ReturnType<typeof listBookReadingFormats>>);
    jest.mocked(getAllBookFormats).mockResolvedValue({
      "1": ["EPUB"],
    });
    jest.mocked(clearBookReadingFormat).mockResolvedValue(undefined);

    const { result, unmount } = renderHook(
      () => useBookReadingFormat(mockLibrary),
      { wrapper },
    );

    await waitFor(() => expect(result.current.selectedFormatById).toEqual({}));

    await act(async () => {
      await result.current.setBookReadingFormat("1", "pdf");
    });

    expect(clearBookReadingFormat).toHaveBeenCalledWith(mockLibrary, 1);
    expect(setBookReadingFormat).not.toHaveBeenCalled();

    unmount();
  });

  it("does nothing when setting format without a library", async () => {
    const { result, unmount } = renderHook(
      () => useBookReadingFormat(null),
      { wrapper },
    );

    await act(async () => {
      await result.current.setBookReadingFormat("1", "epub");
    });

    expect(setBookReadingFormat).not.toHaveBeenCalled();
    expect(clearBookReadingFormat).not.toHaveBeenCalled();

    unmount();
  });

  it("returns an empty map when the query fails", async () => {
    jest.mocked(listBookReadingFormats).mockRejectedValue(new Error("db error"));

    const { result, unmount } = renderHook(
      () => useBookReadingFormat(mockLibrary),
      { wrapper },
    );

    await waitFor(() => expect(result.current.selectedFormatById).toEqual({}));

    unmount();
  });
});
