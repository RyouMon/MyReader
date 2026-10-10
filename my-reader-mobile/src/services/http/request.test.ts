/** @jest-environment node */

import ky, { HTTPError } from "ky"
import { NetworkError } from "@/src/errors"
import { networkRequest } from "./request"

it("retains a rejected HTTP status for recovery policy", async () => {
  await expect(
    networkRequest(() =>
      ky("https://fixture.invalid", {
        retry: 0,
        fetch: async () => new Response(null, { status: 401 }),
      }),
    ),
  ).rejects.toMatchObject({ statusCode: 401, cause: expect.any(HTTPError) })
})

it("preserves the original transport failure as the cause", async () => {
  const failure = new TypeError("raw network diagnostic")
  await expect(
    networkRequest(() => Promise.reject(failure)),
  ).rejects.toMatchObject({
    name: "NetworkError",
    cause: failure,
  })
})

it("preserves cancellation and already classified HTTP errors", async () => {
  for (const failure of [
    Object.assign(new Error("cancelled"), { name: "AbortError" }),
    new NetworkError("unauthorized", 401),
  ]) {
    await expect(networkRequest(() => Promise.reject(failure))).rejects.toBe(
      failure,
    )
  }
})
