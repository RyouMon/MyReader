import { tocItemsFromNativePdfTableContents } from "@/src/components/reader/native-pdf/tableContentsToToc";

describe("tocItemsFromNativePdfTableContents", () => {
  test("returns empty array for empty input", () => {
    expect(tocItemsFromNativePdfTableContents(undefined)).toEqual([]);
    expect(tocItemsFromNativePdfTableContents(null)).toEqual([]);
    expect(tocItemsFromNativePdfTableContents([])).toEqual([]);
  });

  test("maps nodes recursively and clamps invalid page index", () => {
    const items = tocItemsFromNativePdfTableContents([
      {
        title: "  ",
        pageIdx: -2,
      },
      {
        title: " Chapter 1 ",
        pageIdx: 2.9,
        children: [
          {
            pageIdx: 1,
          },
        ],
      },
    ]);

    expect(items).toEqual([
      {
        label: "第 1 页",
        href: "#pdf-page-0",
        index: 0,
        subitems: undefined,
      },
      {
        label: "Chapter 1",
        href: "#pdf-page-2",
        index: 2,
        subitems: [
          {
            label: "第 2 页",
            href: "#pdf-page-1",
            index: 1,
            subitems: undefined,
          },
        ],
      },
    ]);
  });
});
