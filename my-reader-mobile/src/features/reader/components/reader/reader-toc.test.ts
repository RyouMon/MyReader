import i18n from "@/src/i18n"

import { flattenFixedToc, flattenReflowToc } from "./reader-toc"

describe("flattenFixedToc", () => {
  test("should flatten source toc when fixed toc has nested entries", () => {
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
      0,
    )

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
    ])
  })

  test("should use page label and no href when fixed toc entry is empty", () => {
    expect(
      flattenFixedToc(
        [
          {
            label: "",
            href: "",
            index: 2,
          },
        ],
        0,
      ),
    ).toEqual([
      {
        id: "fixed-0-no-href",
        label: "Page 3",
        pageIndex: 2,
        chapterIndex: 2,
        href: undefined,
      },
    ])
  })

  test("should use fallback pages when no toc and page count is small", () => {
    const result = flattenFixedToc([], 2)

    expect(result).toEqual([
      {
        id: "fixed-fallback-0-no-href",
        label: i18n.t("reader.pageLabel", { page: 1 }),
        pageIndex: 0,
        chapterIndex: 0,
      },
      {
        id: "fixed-fallback-1-no-href",
        label: i18n.t("reader.pageLabel", { page: 2 }),
        pageIndex: 1,
        chapterIndex: 1,
      },
    ])
  })

  test("should return empty array when no toc and page count is large", () => {
    expect(flattenFixedToc([], 21)).toEqual([])
  })
})

describe("flattenReflowToc", () => {
  test("should flatten nested entries when toc is reflowable", () => {
    expect(
      flattenReflowToc([
        {
          label: "Part 1",
          href: "part-1.xhtml",
          index: 0,
          subitems: [
            {
              label: "Chapter 1",
              href: "chapter-1.xhtml",
              index: 1,
            },
          ],
        },
      ]),
    ).toEqual([
      {
        id: "reflow-0-part-1.xhtml",
        label: "Part 1",
        pageIndex: 0,
        chapterIndex: 0,
        href: "part-1.xhtml",
      },
      {
        id: "reflow-0.0-chapter-1.xhtml",
        label: "Chapter 1",
        pageIndex: 1,
        chapterIndex: 1,
        href: "chapter-1.xhtml",
      },
    ])
  })

  test("should clamp chapter index when reflow toc index is invalid", () => {
    const result = flattenReflowToc([
      {
        label: "",
        href: "",
        index: -1,
      },
    ])

    expect(result).toEqual([
      {
        id: "reflow-0-no-href",
        label: "Chapter 0",
        pageIndex: 0,
        chapterIndex: 0,
        href: undefined,
      },
    ])
  })
})
