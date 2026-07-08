import type { Link } from "../types/link"
import { buildLinkTree } from "./buildLinkTree"

describe("buildLinkTree", () => {
  it("should restore nested toc items when href values repeat", () => {
    const flatLinks: Link[] = [
      {
        href: "part.xhtml",
        title: "Part 1",
        depth: 0,
        hasChildren: true,
        position: 0,
      },
      {
        href: "part.xhtml",
        title: "Chapter 1",
        depth: 1,
        hasChildren: true,
        parentHref: "part.xhtml",
        position: 0,
      },
      {
        href: "part.xhtml#section-1",
        title: "Section 1",
        depth: 2,
        parentHref: "part.xhtml",
        position: 0,
      },
      {
        href: "appendix.xhtml",
        title: "Appendix",
        depth: 0,
        position: 1,
      },
    ]

    expect(buildLinkTree(flatLinks)).toEqual([
      {
        href: "part.xhtml",
        title: "Part 1",
        children: [
          {
            href: "part.xhtml",
            title: "Chapter 1",
            children: [
              {
                href: "part.xhtml#section-1",
                title: "Section 1",
              },
            ],
          },
        ],
      },
      {
        href: "appendix.xhtml",
        title: "Appendix",
      },
    ])
  })
})
