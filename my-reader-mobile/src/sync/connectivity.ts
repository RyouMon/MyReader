import type { RemoteBackend } from "./backend";

export type ConnectivityCheckResult = {
  reachable: boolean;
  latencyMs: number;
  error?: string;
};

export async function checkConnectivity(backend: RemoteBackend): Promise<ConnectivityCheckResult> {
  const start = Date.now();
  try {
    await backend.statRemoteFile(".");
    return { reachable: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      reachable: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}