import { encode as encodeBase64 } from "base-64"

/**
 * Build HTTP Basic Authorization header from credentials.
 */
export function buildHttpBasicAuthHeader(
  username: string,
  password: string,
): Record<string, string> {
  const normalizedUsername = username.trim()
  if (!normalizedUsername && !password) {
    return {}
  }

  const plain = `${normalizedUsername}:${password}`
  const encoded =
    typeof globalThis.btoa === "function"
      ? globalThis.btoa(plain)
      : (() => {
          console.warn(
            "[http] globalThis.btoa is unavailable, falling back to base-64 encoding",
          )
          return encodeBase64(plain)
        })()

  return {
    Authorization: `Basic ${encoded}`,
  }
}
