import { type Href, router } from "expo-router"
import { create } from "zustand"

export type ModelDiscoverySessionInput = {
  models: { id: string }[]
  existing: string[]
  onAdd: (ids: string[]) => boolean | void | Promise<boolean | void>
  onClose?: () => void
}

export type ModelDiscoverySession = ModelDiscoverySessionInput & {
  id: number
}

type ModelDiscoveryState = {
  session: ModelDiscoverySession | null
  open: (input: ModelDiscoverySessionInput) => number
  close: (id?: number) => void
}

let nextSessionId = 1

export const useModelDiscoveryStore = create<ModelDiscoveryState>(
  (set, get) => ({
    session: null,
    open: (input) => {
      const previous = get().session
      const id = nextSessionId++
      set({ session: { ...input, id } })
      previous?.onClose?.()
      return id
    },
    close: (id) => {
      const current = get().session
      if (!current || (id !== undefined && current.id !== id)) return
      set({ session: null })
      current.onClose?.()
    },
  }),
)

export function openModelDiscovery(input: ModelDiscoverySessionInput): number {
  const id = useModelDiscoveryStore.getState().open(input)
  router.push("/model-discovery" as Href)
  return id
}

export function closeModelDiscovery(id?: number): void {
  useModelDiscoveryStore.getState().close(id)
}
