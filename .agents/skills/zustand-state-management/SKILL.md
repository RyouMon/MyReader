---
name: zustand-state-management
description: >-
  Zustand v5 store patterns, TypeScript create<T>()() usage, persist/devtools
  middleware, hydration pitfalls, slices, and migration notes. Use when
  implementing or reviewing global client state with Zustand in React apps.
---

# Zustand State Management

**Last updated:** 2026-01-21 · **Latest version:** zustand@5.0.10 (released 2026-01-12) · **Dependencies:** React 18–19, TypeScript 5+

## Quick Start

```bash
npm install zustand
```

### TypeScript store (critical: `create<T>()()` double parentheses)

```typescript
import { create } from 'zustand'

interface BearStore {
  bears: number
  increase: (by: number) => void
}

const useBearStore = create<BearStore>()((set) => ({
  bears: 0,
  increase: (by) => set((state) => ({ bears: state.bears + by })),
}))
```

### Use in components

```typescript
const bears = useBearStore((state) => state.bears) // Only re-renders when bears changes
const increase = useBearStore((state) => state.increase)
```

## Core patterns

### Basic store (JavaScript)

```javascript
const useStore = create((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}))
```

### TypeScript store (recommended)

```typescript
interface CounterStore {
  count: number
  increment: () => void
}

const useStore = create<CounterStore>()((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}))
```

### Persistent store (survives page reloads)

```typescript
import { persist, createJSONStorage } from 'zustand/middleware'

interface UserPreferences {
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: UserPreferences['theme']) => void
}

const useStore = create<UserPreferences>()(
  persist(
    (set) => ({ theme: 'system', setTheme: (theme) => set({ theme }) }),
    { name: 'user-preferences', storage: createJSONStorage(() => localStorage) },
  ),
)
```

## Critical rules

### Always do

- Use `create<T>()()` (double parentheses) in TypeScript for middleware compatibility.
- Define separate interfaces for state and actions.
- Use selector functions to extract specific state slices.
- Use `set` with updater functions for derived state: `set((state) => ({ count: state.count + 1 }))`.
- Use unique names for persist middleware storage keys.
- Handle Next.js hydration with a `hasHydrated` flag pattern.
- Use the `useShallow` hook when selecting multiple values.
- Keep actions pure (no side effects except state updates).

### Never do

- Use `create<T>(...)` (single parentheses) in TypeScript — breaks middleware types.
- Mutate state directly: `set((state) => { state.count++; return state })` — use immutable updates.
- Create new objects in selectors: `useStore((state) => ({ a: state.a }))` — causes infinite renders.
- Use the same storage name for multiple stores — causes data collisions.
- Access `localStorage` during SSR without a hydration check.
- Use Zustand for server state — use TanStack Query instead.
- Export the store instance directly — always export the hook.

## Known issues prevention

This skill prevents six documented issues.

### Issue #1: Next.js hydration mismatch

**Error:** “Text content does not match server-rendered HTML” or “Hydration failed”.

**Sources:**

- DEV Community: Persist middleware in Next.js
- [GitHub Discussions #2839](https://github.com/pmndrs/zustand/discussions/2839)

**Why it happens:** Persist middleware reads from `localStorage` on the client but not on the server, causing state mismatch.

**Prevention:**

```tsx
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface StoreWithHydration {
  count: number
  _hasHydrated: boolean
  setHasHydrated: (hydrated: boolean) => void
  increase: () => void
}

const useStore = create<StoreWithHydration>()(
  persist(
    (set) => ({
      count: 0,
      _hasHydrated: false,
      setHasHydrated: (hydrated) => set({ _hasHydrated: hydrated }),
      increase: () => set((state) => ({ count: state.count + 1 })),
    }),
    {
      name: 'my-store',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)

function MyComponent() {
  const hasHydrated = useStore((state) => state._hasHydrated)

  if (!hasHydrated) {
    return <div>Loading...</div>
  }

  return <ActualContent />
}
```

### Issue #2: TypeScript double parentheses missing

**Error:** Type inference fails; `StateCreator` types break with middleware.

**Source:** [Official Zustand TypeScript guide](https://zustand.docs.pmnd.rs/guides/typescript)

**Why it happens:** The currying syntax `create<T>()()` is required for middleware to work with TypeScript inference.

**Prevention:**

```typescript
// Wrong — single parentheses
const useStore = create<MyStore>((set) => ({
  // ...
}))

// Correct — double parentheses
const useStore = create<MyStore>()((set) => ({
  // ...
}))
```

**Rule:** Always use `create<T>()()` in TypeScript, even without middleware (future-proof).

### Issue #3: Persist middleware import error

**Error:** “Attempted import error: 'createJSONStorage' is not exported from 'zustand/middleware'”.

**Source:** [GitHub Discussion #2839](https://github.com/pmndrs/zustand/discussions/2839)

**Why it happens:** Wrong import path or version mismatch between Zustand and build tools.

**Prevention:**

```typescript
// Correct imports for v5
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// zustand@5.0.9+ includes createJSONStorage; v4.x uses a different API
// In package.json: "zustand": "^5.0.9"
```

### Issue #4: Infinite render loop

**Error:** Component re-renders infinitely; browser freezes.

```
Uncaught Error: Maximum update depth exceeded. This can happen when a component
repeatedly calls setState inside componentWillUpdate or componentDidUpdate.
```

**Sources:**

- [GitHub Discussions #2642](https://github.com/pmndrs/zustand/discussions/2642)
- [Issue #2863](https://github.com/pmndrs/zustand/issues/2863)

**Why it happens:** Creating new object references in selectors makes Zustand think state changed.

**v5 breaking change:** Zustand v5 surfaces this more explicitly than v4; you may see “Maximum update depth exceeded” immediately.

**Prevention:**

```typescript
import { useShallow } from 'zustand/shallow'

// Wrong — creates new object every time
const { bears, fishes } = useStore((state) => ({
  bears: state.bears,
  fishes: state.fishes,
}))

// Correct option 1 — select primitives separately
const bears = useStore((state) => state.bears)
const fishes = useStore((state) => state.fishes)

// Correct option 2 — useShallow for multiple values
const { bears, fishes } = useStore(
  useShallow((state) => ({ bears: state.bears, fishes: state.fishes })),
)
```

### Issue #5: Slices pattern TypeScript complexity

**Error:** `StateCreator` types fail to infer; complex middleware types break.

**Source:** [Official slices pattern guide](https://zustand.docs.pmnd.rs/guides/slices-pattern)

**Why it happens:** Combining multiple slices needs explicit type annotations for middleware compatibility.

**Prevention:**

```typescript
import { create, StateCreator } from 'zustand'

interface BearSlice {
  bears: number
  addBear: () => void
}

interface FishSlice {
  fishes: number
  addFish: () => void
}

const createBearSlice: StateCreator<
  BearSlice & FishSlice, // Combined store type
  [], // Middleware mutators (empty if none)
  [], // Chained middleware (empty if none)
  BearSlice // This slice's type
> = (set) => ({
  bears: 0,
  addBear: () => set((state) => ({ bears: state.bears + 1 })),
})

const createFishSlice: StateCreator<BearSlice & FishSlice, [], [], FishSlice> = (set) => ({
  fishes: 0,
  addFish: () => set((state) => ({ fishes: state.fishes + 1 })),
})

const useStore = create<BearSlice & FishSlice>()((...a) => ({
  ...createBearSlice(...a),
  ...createFishSlice(...a),
}))
```

### Issue #6: Persist middleware race condition (fixed v5.0.10+)

**Error:** Inconsistent state during concurrent rehydration attempts.

**Sources:**

- [GitHub PR #3336](https://github.com/pmndrs/zustand/pull/3336)
- Release v5.0.10

**Why it happens:** In Zustand v5.0.9 and earlier, concurrent `rehydrate` calls during persist middleware initialization could race.

**Prevention:** Upgrade to Zustand v5.0.10 or later. The fix is internal to persist middleware.

```bash
npm install zustand@latest # Ensure v5.0.10+
```

**Note:** Fixed in v5.0.10 (January 2026). If you are on v5.0.9 or earlier and see persist inconsistencies, upgrade.

## Middleware

### Persist (`localStorage`)

```typescript
import { persist, createJSONStorage } from 'zustand/middleware'

interface MyStore {
  data: unknown[]
  addItem: (item: unknown) => void
}

const useStore = create<MyStore>()(
  persist(
    (set) => ({
      data: [],
      addItem: (item) => set((state) => ({ data: [...state.data, item] })),
    }),
    {
      name: 'my-storage',
      partialize: (state) => ({ data: state.data }), // Only persist `data`
    },
  ),
)
```

### Devtools (Redux DevTools)

```typescript
import { devtools } from 'zustand/middleware'

const useStore = create<CounterStore>()(
  devtools(
    (set) => ({
      count: 0,
      increment: () => set((s) => ({ count: s.count + 1 }), undefined, 'increment'),
    }),
    { name: 'CounterStore' },
  ),
)
```

**v4 → v5:** In v4, devtools was imported from `zustand/middleware/devtools`. In v5, use `zustand/middleware`. If you see “Can't resolve 'zustand/middleware/devtools'”, update the import path.

### Combining middleware (order matters)

```typescript
const useStore = create<MyStore>()(
  devtools(persist((set) => ({ /* ... */ }), { name: 'storage' }), { name: 'MyStore' }),
)
```

## Common patterns

### Computed / derived values (in selector, not stored)

```typescript
const count = useStore((state) => state.items.length) // Computed on read
```

### Async actions

```typescript
const useAsyncStore = create<AsyncStore>()((set) => ({
  data: null as string | null,
  isLoading: false,
  fetchData: async () => {
    set({ isLoading: true })
    const response = await fetch('/api/data')
    set({ data: await response.text(), isLoading: false })
  },
}))
```

### Resetting store

```typescript
const initialState = { count: 0, name: '' }

const useStore = create<ResettableStore>()((set) => ({
  ...initialState,
  reset: () => set(initialState),
}))
```

### Selector with params

```typescript
const todo = useStore((state) => state.todos.find((t) => t.id === id))
```

## Bundled resources

- **Templates:** `basic-store.ts`, `typescript-store.ts`, `persist-store.ts`, `slices-pattern.ts`, `devtools-store.ts`, `nextjs-store.ts`, `computed-store.ts`, `async-actions-store.ts`
- **References:** `middleware-guide.md` (persist / devtools / immer / custom), `typescript-patterns.md`, `nextjs-hydration.md`, `migration-guide.md`
- **Scripts:** `check-versions.sh` (version compatibility)

## Advanced topics

### Vanilla store (without React)

```typescript
import { createStore } from 'zustand/vanilla'

const store = createStore<CounterStore>()((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
}))

const unsubscribe = store.subscribe((state) => console.log(state.count))
store.getState().increment()
```

### Custom middleware

```typescript
const logger: Logger = (f, name) => (set, get, store) => {
  const loggedSet: typeof set = (...a) => {
    set(...a)
    console.log(`[${name}]:`, get())
  }
  return f(loggedSet, get, store)
}
```

### Immer middleware (mutable updates)

```typescript
import { immer } from 'zustand/middleware/immer'

const useStore = create<TodoStore>()(
  immer((set) => ({
    todos: [],
    addTodo: (text) =>
      set((state) => {
        state.todos.push({ id: Date.now().toString(), text })
      }),
  })),
)
```

**v5.0.3 → v5.0.4:** If immer stops working after upgrading, confirm the import path `zustand/middleware/immer`.

### Experimental SSR-safe middleware (v5.0.9+)

**Status:** Experimental (API may change).

Zustand v5.0.9 introduced experimental `unstable_ssrSafe` for Next.js, as an alternative to `_hasHydrated` (Issue #1).

```typescript
import { unstable_ssrSafe } from 'zustand/middleware'

const useStore = create<Store>()(
  unstable_ssrSafe(
    persist(
      (set) => ({ /* state */ }),
      { name: 'my-store' },
    ),
  ),
)
```

**Recommendation:** Keep using the `_hasHydrated` pattern until this API stabilizes. Watch [Discussion #2740](https://github.com/pmndrs/zustand/discussions/2740) for updates.

## Official documentation

- [Zustand](https://zustand.docs.pmnd.rs/)
- [GitHub](https://github.com/pmndrs/zustand)
- [TypeScript guide](https://zustand.docs.pmnd.rs/guides/typescript)
- **Context7 library ID:** `/pmndrs/zustand`
