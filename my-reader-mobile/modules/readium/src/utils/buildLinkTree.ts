import type { Link } from "../types/link"

/**
 * Reconstructs a nested Link tree from the flat array produced by the native
 * bridge. Each flat link carries `depth`, `hasChildren`, `parentHref`, and
 * `position` fields set by the native flattener. The native array is emitted in
 * pre-order, so `depth` is the only stable way to restore parents; TOC entries
 * commonly reuse the same href.
 */
export function buildLinkTree(flatLinks: Link[]): Link[] {
  const positionOf = new Map<Link, number>()
  const root: Link[] = []
  const stack: Link[] = []

  for (const flat of flatLinks) {
    const {
      depth: _d,
      hasChildren: _h,
      parentHref: _p,
      position: _pos,
      children: _c,
      ...rest
    } = flat
    const link: Link = { ...rest }
    positionOf.set(link, flat.position ?? 0)

    const depth =
      typeof flat.depth === "number" && Number.isFinite(flat.depth)
        ? Math.max(0, Math.trunc(flat.depth))
        : 0

    stack.length = Math.min(stack.length, depth)
    const parent = depth > 0 ? stack[depth - 1] : undefined
    if (parent) {
      parent.children = parent.children ?? []
      parent.children.push(link)
    } else {
      root.push(link)
    }
    stack[depth] = link
  }

  const sortByPosition = (a: Link, b: Link) =>
    (positionOf.get(a) ?? 0) - (positionOf.get(b) ?? 0)

  root.sort(sortByPosition)

  const sortChildren = (links: Link[]) => {
    for (const link of links) {
      if (link.children) {
        link.children.sort(sortByPosition)
        sortChildren(link.children)
      }
    }
  }
  sortChildren(root)

  return root
}
