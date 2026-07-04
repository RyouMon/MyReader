import * as React from "react"

const SIDEBAR_MOBILE_BREAKPOINT = 768
const sidebarMobileQuery = `(max-width: ${SIDEBAR_MOBILE_BREAKPOINT - 1}px)`

function subscribeSidebarMobile(callback: () => void) {
  const mql = window.matchMedia(sidebarMobileQuery)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

function getSidebarMobileSnapshot() {
  return window.matchMedia(sidebarMobileQuery).matches
}

function getServerSidebarMobileSnapshot() {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribeSidebarMobile,
    getSidebarMobileSnapshot,
    getServerSidebarMobileSnapshot,
  )
}
