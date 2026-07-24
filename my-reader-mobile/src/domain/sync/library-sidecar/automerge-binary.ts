import { CryptoDigestAlgorithm, digest } from "expo-crypto"

export async function hashLibrarySidecarAutomergeBytes(
  bytes: Uint8Array,
): Promise<string> {
  const digestBytes = new Uint8Array(
    await digest(CryptoDigestAlgorithm.SHA256, Uint8Array.from(bytes)),
  )
  return Array.from(digestBytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}
