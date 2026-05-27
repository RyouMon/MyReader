import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";

import type { DataSource } from "@/src/data/types";
import { isUserCancelled, signIn } from "@/src/services/auth/onedrive";
import { useDataSourceStore } from "@/src/store/data-source-store";
import {
  writeOneDriveAccessToken,
  writeOneDriveRefreshToken,
} from "@/src/services/storage/credentials";

export function useAddOneDriveDataSource() {
  const { t } = useTranslation();
  const { dataSources, createDataSource } = useDataSourceStore();
  const [busy, setBusy] = useState(false);

  async function addOneDriveDataSource(): Promise<DataSource | null> {
    if (busy) return null;
    setBusy(true);
    try {
      const { accessToken, refreshToken, displayName, email } = await signIn();

      const existing = dataSources.find(
        (s) => s.type === "onedrive" && s.email && s.email === email,
      );
      if (existing) {
        Alert.alert(t("onedrive.add.alreadyAdded"), t("onedrive.add.alreadyAddedMessage", { email }));
        return null;
      }

      const draft: DataSource = {
        id: "",
        type: "onedrive",
        name: displayName || email || "OneDrive",
        enabled: true,
        clientId: "",
        displayName,
        email,
        rootPath: null,
        hasRefreshToken: Boolean(refreshToken),
      };

      const created = await createDataSource(draft);

      await writeOneDriveAccessToken(created.id, accessToken);
      if (refreshToken) {
        await writeOneDriveRefreshToken(created.id, refreshToken);
      }

      return created;
    } catch (caught) {
      if (isUserCancelled(caught)) return null;
      Alert.alert(
        t("onedrive.add.authFailed"),
        caught instanceof Error ? caught.message : t("onedrive.add.authFailedMessage"),
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { addOneDriveDataSource, busy };
}