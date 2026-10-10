import { HTTPError, TimeoutError } from "ky"
import { NetworkError } from "@/src/errors"

/** Call only around transport I/O, so parsing or filesystem failures stay distinct. */
export async function networkRequest<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request()
  } catch (error) {
    if (
      error instanceof NetworkError ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw error
    const status =
      error instanceof HTTPError ? error.response.status : undefined
    const diagnostic =
      error instanceof TimeoutError ? "Request timed out" : "Request failed"
    throw new NetworkError(diagnostic, status, { cause: error })
  }
}

export function fetchRemote(
  ...args: Parameters<typeof fetch>
): ReturnType<typeof fetch> {
  return networkRequest(() => fetch(...args))
}
