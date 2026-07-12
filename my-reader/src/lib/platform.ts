export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false
  return (
    /Mac|iPhone|iPad|iPod/.test(navigator.platform) ||
    /Mac OS X/.test(navigator.userAgent)
  )
}
