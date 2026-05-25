import type { RemoteFileOps } from "./backend";

export type ConnectivityCheckResult = {
  reachable: boolean;
  latencyMs: number;
  error?: string;
};

/**
 * Probe the backend by stat-ing the root path.
 * Accepts a pre-built backend so the caller controls the lifecycle.
 */
export async function checkConnectivity(backend: RemoteFileOps): Promise<ConnectivityCheckResult> {
  const start = Date.now();
  try {
    await backend.statRemote(".");
    return { reachable: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      reachable: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}