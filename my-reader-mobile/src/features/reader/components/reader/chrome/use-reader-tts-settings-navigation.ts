import { useCallback, useRef, useState } from "react"

export type ReaderTtsSettingsRouteName =
  | "settings"
  | "providers"
  | "providerType"
  | "providerForm"

type ReaderTtsSettingsRoute = {
  id: number
  name: ReaderTtsSettingsRouteName
}

type ReaderTtsSettingsNavigationState = {
  direction: "forward" | "back"
  routes: ReaderTtsSettingsRoute[]
}

const ROOT_ROUTE: ReaderTtsSettingsRoute = { id: 0, name: "settings" }

export function useReaderTtsSettingsNavigation() {
  const nextRouteId = useRef(1)
  const [state, setState] = useState<ReaderTtsSettingsNavigationState>({
    direction: "forward",
    routes: [ROOT_ROUTE],
  })

  const push = useCallback((name: ReaderTtsSettingsRouteName) => {
    const route = { id: nextRouteId.current++, name }
    setState((current) => {
      if (current.routes.at(-1)?.name === name) return current
      return {
        direction: "forward",
        routes: [...current.routes, route],
      }
    })
  }, [])

  const pop = useCallback(() => {
    setState((current) => {
      if (current.routes.length === 1) return current
      return {
        direction: "back",
        routes: current.routes.slice(0, -1),
      }
    })
  }, [])

  const popTo = useCallback((name: ReaderTtsSettingsRouteName) => {
    setState((current) => {
      const targetIndex = current.routes
        .map((route) => route.name)
        .lastIndexOf(name)
      if (targetIndex < 0 || targetIndex === current.routes.length - 1) {
        return current
      }
      return {
        direction: "back",
        routes: current.routes.slice(0, targetIndex + 1),
      }
    })
  }, [])

  const reset = useCallback(() => {
    const route = { id: nextRouteId.current++, name: "settings" as const }
    setState((current) => {
      if (
        current.routes.length === 1 &&
        current.routes[0]?.name === "settings"
      ) {
        return current
      }
      return { direction: "back", routes: [route] }
    })
  }, [])

  const currentRoute = state.routes.at(-1) ?? ROOT_ROUTE

  return {
    canGoBack: state.routes.length > 1,
    currentRoute,
    pop,
    popTo,
    push,
    reset,
    transitionDirection: state.direction,
  }
}
