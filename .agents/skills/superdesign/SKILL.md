---
name: superdesign
description: >
  Superdesign is an agent-native frontend UI/UX design skill. Use it before implementing any UI that requires design thinking. It supports repo-aware design analysis, layout ideation, theme definition, interaction design, and producing concrete design artifacts.
metadata:
  author: superdesign
  version: "0.0.3"
---

SuperDesign helps you design UI directly with the local agent and repository context.

---

# Core scenarios (what this skill handles)

1. **Help me design X** (feature/page/flow)
2. **Set or evolve a design system**
3. **Improve the design of X**
4. **Create or iterate standalone design artifacts**
5. **Translate approved design direction into implementation-ready UI code or HTML prototypes**

# Core operating mode

Use the repo itself as the source of truth by reading relevant files, design docs, routes, components, tokens, and existing UI patterns. Use available local tools for reading, searching, editing, and generating artifacts.

# Repo-first context gathering

Before any substantial design task, gather only the context needed for the requested surface.

Always prefer the repository's own design language over generic invention.

For MyReader specifically, read the shared design docs first when the task affects product UI:

 - `DESIGN.md`
 - `DESIGN.mobile.md` for mobile UI work
 - `DESIGN.desktop.md` for desktop UI work

Then inspect the smallest relevant set of files, such as:

 - route files for the page or flow
 - shared layout components
 - shared primitives and component variants
 - CSS variables, token definitions, Tailwind config, and theme files
 - related hooks, stores, or data surfaces when UI behavior depends on them

If the task is a standalone exploratory design not yet tied to product code, you may create design artifacts under `.superdesign/design_iterations/` without inventing a fake repo analysis layer.

# Design workflow

Unless the user explicitly asks for a different process, follow this staged workflow:

1. Layout design
2. Theme design
3. Motion and interaction design
4. Artifact generation or implementation

If the user asked for exploration rather than implementation, stop after each stage for sign-off.

If the user asked you to directly make the design or code changes, you may carry the workflow through end-to-end without pausing, but still reason through all four stages internally.

## 1. Layout design

Output style: text or code edits, depending on the request.

Think through:

 - page structure
 - information hierarchy
 - primary and secondary actions
 - navigation patterns
 - responsive behavior
 - empty, loading, dense, and error states when relevant

When presenting a design direction before implementation, prefer an ASCII wireframe or a concise structural description.

## 2. Theme design

Define:

 - color system
 - typography
 - spacing scale
 - radii and borders
 - elevation and shadow language
 - icon style and illustration tone if applicable

When the task results in artifacts, save theme CSS or design tokens into local files rather than describing them only in prose.

## 3. Motion and interaction design

Specify:

 - hover, press, focus, and active states
 - screen or panel transitions
 - list, dialog, and message motion if relevant
 - loading and progress feedback
 - reduced-motion-safe behavior where applicable

## 4. Artifact generation or implementation

Depending on the task, do one of the following:

 - create a single-screen HTML prototype
 - create design iteration files
 - directly implement the UI in the product codebase
 - update existing components and styles to reflect the approved design

Always use real tool calls to create or edit files.

# Artifact rules

When creating standalone design files:

1. Save them in `.superdesign/design_iterations/`.
2. Use `{design_name}_{n}.html` for new iterations.
3. If iterating from an existing file, use `{current_file_name}_{n}.html`.
4. Prefer one screen per file unless the user explicitly asks for a multi-screen artifact.
5. Ensure the result is responsive on desktop and mobile.

# Styling rules

1. Prefer the repository's existing design system when one exists.
2. If no project-specific style is mandated, you may use Flowbite-compatible utility patterns as a base, but do not require Flowbite.
3. Avoid default bootstrap-style blue or generic AI-looking palettes unless the user explicitly asks for them.
4. Avoid overusing indigo or bright blue unless it is part of the requested brand direction.
5. Use strong contrast and a deliberate visual identity instead of safe, average UI.
6. When designing a component, card, or poster rather than a full application, make the surrounding background support the component's contrast and presentation.
7. Fonts should come from real, publicly available families. Good defaults include `Inter`, `Geist`, `Plus Jakarta Sans`, `DM Sans`, `Space Grotesk`, `Playfair Display`, `Lora`, `IBM Plex Mono`, and `JetBrains Mono`.
8. If using plain HTML prototypes with Tailwind CDN or external styles that may override element defaults, add explicit CSS for key tags like `body`, `h1`, and `button` where needed.

# Example theme directions

## Neo-brutalism style

```css
:root {
  --background: oklch(1.0000 0 0);
  --foreground: oklch(0 0 0);
  --card: oklch(1.0000 0 0);
  --card-foreground: oklch(0 0 0);
  --popover: oklch(1.0000 0 0);
  --popover-foreground: oklch(0 0 0);
  --primary: oklch(0.6489 0.2370 26.9728);
  --primary-foreground: oklch(1.0000 0 0);
  --secondary: oklch(0.9680 0.2110 109.7692);
  --secondary-foreground: oklch(0 0 0);
  --muted: oklch(0.9551 0 0);
  --muted-foreground: oklch(0.3211 0 0);
  --accent: oklch(0.5635 0.2408 260.8178);
  --accent-foreground: oklch(1.0000 0 0);
  --destructive: oklch(0 0 0);
  --destructive-foreground: oklch(1.0000 0 0);
  --border: oklch(0 0 0);
  --input: oklch(0 0 0);
  --ring: oklch(0.6489 0.2370 26.9728);
  --chart-1: oklch(0.6489 0.2370 26.9728);
  --chart-2: oklch(0.9680 0.2110 109.7692);
  --chart-3: oklch(0.5635 0.2408 260.8178);
  --chart-4: oklch(0.7323 0.2492 142.4953);
  --chart-5: oklch(0.5931 0.2726 328.3634);
  --sidebar: oklch(0.9551 0 0);
  --sidebar-foreground: oklch(0 0 0);
  --sidebar-primary: oklch(0.6489 0.2370 26.9728);
  --sidebar-primary-foreground: oklch(1.0000 0 0);
  --sidebar-accent: oklch(0.5635 0.2408 260.8178);
  --sidebar-accent-foreground: oklch(1.0000 0 0);
  --sidebar-border: oklch(0 0 0);
  --sidebar-ring: oklch(0.6489 0.2370 26.9728);
  --font-sans: DM Sans, sans-serif;
  --font-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  --font-mono: Space Mono, monospace;
  --radius: 0px;
}
```

## Modern dark mode style

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.1450 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.1450 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.1450 0 0);
  --primary: oklch(0.2050 0 0);
  --primary-foreground: oklch(0.9850 0 0);
  --secondary: oklch(0.9700 0 0);
  --secondary-foreground: oklch(0.2050 0 0);
  --muted: oklch(0.9700 0 0);
  --muted-foreground: oklch(0.5560 0 0);
  --accent: oklch(0.9700 0 0);
  --accent-foreground: oklch(0.2050 0 0);
  --destructive: oklch(0.5770 0.2450 27.3250);
  --destructive-foreground: oklch(1 0 0);
  --border: oklch(0.9220 0 0);
  --input: oklch(0.9220 0 0);
  --ring: oklch(0.7080 0 0);
  --chart-1: oklch(0.8100 0.1000 252);
  --chart-2: oklch(0.6200 0.1900 260);
  --chart-3: oklch(0.5500 0.2200 263);
  --chart-4: oklch(0.4900 0.2200 264);
  --chart-5: oklch(0.4200 0.1800 266);
  --sidebar: oklch(0.9850 0 0);
  --sidebar-foreground: oklch(0.1450 0 0);
  --sidebar-primary: oklch(0.2050 0 0);
  --sidebar-primary-foreground: oklch(0.9850 0 0);
  --sidebar-accent: oklch(0.9700 0 0);
  --sidebar-accent-foreground: oklch(0.2050 0 0);
  --sidebar-border: oklch(0.9220 0 0);
  --sidebar-ring: oklch(0.7080 0 0);
  --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  --font-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  --radius: 0.625rem;
}
```

# Images and icons

1. Use real public placeholder or stock image sources only when needed, such as Unsplash or `placehold.co`.
2. Do not invent image URLs.
3. For icons in standalone HTML, prefer Lucide via a real CDN include or inline SVG.

# Script and asset guidance for standalone HTML

1. When using Tailwind CDN, prefer `<script src="https://cdn.tailwindcss.com"></script>`.
2. If using Flowbite in a prototype, include the actual script URL rather than assuming it exists.
3. Do not require external scripts when the same result is simpler with local CSS and HTML.

# Collaboration rules

1. Use actual tool calls for file creation and edits. Never fake a tool call in plain text.
2. Keep the workflow explicit: layout, theme, interaction, artifact.
3. If the user is iterating collaboratively, confirm each stage before proceeding.
4. If the user asked for direct implementation, do not stall on ceremony; apply the design in code.
5. Preserve the established product visual language unless the user asks for a redesign.
6. Avoid generic AI slop. Make deliberate choices about hierarchy, density, color, typography, and motion.
