import { flattenFixedToc, flattenReflowToc } from "@/src/components/reader/reader-toc";

describe("flattenFixedToc", () => {
  test("flattens source toc recursively", () => {
    const result = flattenFixedToc(
      [
        {
          label: "Chapter A",
          href: "#a",
          index: 0,
          subitems: [
            {
              label: "Chapter B",
              href: "#b",
              index: 1,
            },
          ],
        },
      ],
      0
    );

    expect(result).toEqual([
      {
        id: "fixed-0-#a",
        label: "Chapter A",
        pageIndex: 0,
        chapterIndex: 0,
        href: "#a",
      },
      {
        id: "fixed-0.0-#b",
        label: "Chapter B",
        pageIndex: 1,
        chapterIndex: 1,
        href: "#b",
      },
    ]);
  });

  test("uses fallback pages when no toc and page count <= 20", () => {
    const result = flattenFixedToc([], 2);

    expect(result).toEqual([
      {
        id: "fixed-fallback-0-no-href",
        label: "第 1 页",
        pageIndex: 0,
        chapterIndex: 0,
      },
      {
        id: "fixed-fallback-1-no-href",
        label: "第 2 页",
        pageIndex: 1,
        chapterIndex: 1,
      },
    ]);
  });

  test("returns empty array when no toc and page count > 20", () => {
    expect(flattenFixedToc([], 21)).toEqual([]);
  });
});

describe("flattenReflowToc", () => {
  test("flattens and clamps invalid chapter index", () => {
    const result = flattenReflowToc([
      {
        label: "",
        href: undefined,
        index: -1,
      },
    ]);

    expect(result).toEqual([
      {
        id: "reflow-0-no-href",
        label: "Chapter 0",
        pageIndex: 0,
        chapterIndex: 0,
        href: undefined,
      },
    ]);
  });
});
