export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false
  return (
    /Mac|iPhone|iPad|iPod/.test(navigator.platform) ||
    /Mac OS X/.test(navigator.userAgent)
  )
}

export function isWindowsPlatform(): boolean {
  if (typeof navigator === "undefined") return false
  return /Win/.test(navigator.platform) || /Windows/.test(navigator.userAgent)
}
