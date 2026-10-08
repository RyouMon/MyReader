---
name: myreader-design
description: Apply MyReader semantic colors and platform UI conventions when implementing or reviewing MyReader interfaces or design prototypes.
---

# MyReader design

Read [docs/DESIGN.md](../../../docs/DESIGN.md) before shared visual changes.
[colors_and_type.css](colors_and_type.css) is the canonical color source.

The shared design system controls colors only. Use platform/Tailwind defaults for UI fonts,
spacing, radii and shadows. Reader body fonts belong to the reader theme.
Use semantic colors, desktop shadcn primitives and native mobile interaction patterns.

After changing canonical colors, run `pnpm sync:design-tokens`, review generated changes,
and render the affected UI. Unit tests protect behavior/accessibility and durable layout
requirements, not exact padding or class strings.

For prototypes, read [.superdesign/README.md](../../../.superdesign/README.md).
The adjacent `preview/` files are historical references, not current product constraints.
