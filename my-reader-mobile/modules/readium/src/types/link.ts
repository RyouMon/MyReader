/**
 * A link to a resource within a publication (TOC / reading order / resources).
 *
 * Native flattens the TOC into a flat array and sets the bridge-internal
 * fields (`depth`, `hasChildren`, `parentHref`, `position`) so the JS side
 * can rebuild the tree via `buildLinkTree`. `children` is populated only on
 * the JS-rebuilt tree.
 */
export interface Link {
  href: string;
  title?: string;
  rels?: string[];
  languages?: string[];
  depth?: number;
  hasChildren?: boolean;
  parentHref?: string;
  position?: number;
  children?: Link[];
}
