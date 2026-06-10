import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { View } from "react-native";

import { useDataSourceActions } from "@/src/hooks/use-data-source-actions";
import { useAppStoreReady } from "@/src/store/app-store";

const FIXTURE_ID = "seed-webdav-fixture";
const FIXTURE_NAME = "Test WebDAV";

export default function SeedWebDavScreen() {
  const { createDataSource } = useDataSourceActions();
  const storeReady = useAppStoreReady();
  const seeded = useRef(false);

  useEffect(() => {
    if (!storeReady || seeded.current) return;
    seeded.current = true;
    let cancelled = false;

    async function seedWebDav() {
      await createDataSource(
        {
          id: FIXTURE_ID,
          type: "webdav",
          name: FIXTURE_NAME,
          enabled: true,
          endpoint: "https://example.com",
          username: "test",
          rootPath: "/",
          hasPassword: true,
          createdAt: Date.now(),
        },
        { type: "webdav", password: "test" },
      );
    }

    seedWebDav()
      .then(() => {
        if (!cancelled) router.dismissTo("/home");
      })
      .catch((error) => {
        console.error("[seed-webdav] failed:", error);
        if (!cancelled) router.dismissTo("/home");
      });

    return () => {
      cancelled = true;
    };
  }, [createDataSource, storeReady]);

  return <View />;
}
