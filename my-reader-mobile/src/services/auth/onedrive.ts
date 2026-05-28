import { authorize, refresh, revoke } from "react-native-app-auth";

import {
  ONEDRIVE_CLIENT_ID,
  ONEDRIVE_ISSUER,
  ONEDRIVE_REDIRECT_URL,
  ONEDRIVE_SCOPES,
} from "../../constants/onedrive";
import {
  deleteOneDriveAccessToken,
  deleteOneDriveRefreshToken,
  readOneDriveAccessToken,
  readOneDriveRefreshToken,
  writeOneDriveAccessToken,
  writeOneDriveRefreshToken,
} from "../storage/credentials";

const authConfig = {
  issuer: ONEDRIVE_ISSUER,
  clientId: ONEDRIVE_CLIENT_ID,
  redirectUrl: ONEDRIVE_REDIRECT_URL,
  scopes: ONEDRIVE_SCOPES,
  serviceConfiguration: {
    authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    revocationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/logout',
  },
  useNonce: true,
  usePKCE: true,
  additionalParameters: {
    prompt: "login" as const,
  },
};

export function isUserCancelled(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // User closed the browser/SFSafariViewController on iOS (AppAuth general error -3)
  return error.message?.includes("error -3") ?? false;
}

export async function signIn(): Promise<{
  accessToken: string;
  refreshToken: string;
  displayName: string;
  email: string;
}> {
  const result = await authorize(authConfig);

  let displayName = "";
  let email = "";

  try {
    const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${result.accessToken}` },
    });
    const me = await meRes.json();
    displayName = me.displayName ?? "";
    email = me.mail ?? me.userPrincipalName ?? "";
  } catch {
    if (result.idToken != null) {
      try {
        const claims = JSON.parse(atob(result.idToken.split(".")[1]));
        displayName = claims.name ?? "";
        email = claims.email ?? claims.preferred_username ?? "";
      } catch {
        // idToken parse failed
      }
    }
  }

  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken ?? "",
    displayName,
    email,
  };
}

export async function refreshAccessToken(dataSourceId: string): Promise<{ accessToken: string; expiresAt: number }> {
  const refreshToken = await readOneDriveRefreshToken(dataSourceId);
  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  const result = await refresh(authConfig, { refreshToken });

  await writeOneDriveAccessToken(dataSourceId, result.accessToken);
  if (result.refreshToken) {
    await writeOneDriveRefreshToken(dataSourceId, result.refreshToken);
  }

  const expiresAt = new Date(result.accessTokenExpirationDate).getTime() - 5 * 60 * 1000;
  return { accessToken: result.accessToken, expiresAt };
}

export async function getValidAccessToken(dataSourceId: string): Promise<{ accessToken: string; expiresAt: number }> {
  const { accessToken, expiresAt } = await refreshAccessToken(dataSourceId);
  return { accessToken, expiresAt };
}

export async function revokeAuth(dataSourceId: string): Promise<void> {
  const token = await readOneDriveAccessToken(dataSourceId);
  if (token) {
    try {
      await revoke(authConfig, { tokenToRevoke: token });
    } catch {
      // Revocation may fail if token already expired — ignore
    }
  }
  await deleteOneDriveAccessToken(dataSourceId);
  await deleteOneDriveRefreshToken(dataSourceId);
}