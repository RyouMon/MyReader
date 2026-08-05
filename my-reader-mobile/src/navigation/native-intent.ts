/** Redirects native share URLs while preserving all other Expo Router paths. */
export function redirectSystemPath({
  path,
}: {
  path: string
  initial: boolean
}) {
  try {
    if (new URL(path).hostname === "expo-sharing") {
      return "/handle-share"
    }
  } catch {
    // Relative Expo Router paths are already valid destinations.
  }

  return path
}
