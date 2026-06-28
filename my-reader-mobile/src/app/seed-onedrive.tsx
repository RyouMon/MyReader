import { router } from "expo-router"
import { useEffect, useRef } from "react"
import { View } from "react-native"

import { useDataSourceActions } from "@/src/hooks/use-data-source-actions"
import { useAppStoreReady } from "@/src/store/app-store"

const FIXTURE_ID = "seed-onedrive-fixture"
const FIXTURE_NAME = "Test OneDrive"

export default function SeedOneDriveScreen() {
  const { createDataSource } = useDataSourceActions()
  const storeReady = useAppStoreReady()
  const seeded = useRef(false)

  useEffect(() => {
    if (!storeReady || seeded.current) return
    seeded.current = true
    let cancelled = false

    async function seedOneDrive() {
      await createDataSource(
        {
          id: FIXTURE_ID,
          type: "onedrive",
          name: FIXTURE_NAME,
          enabled: true,
          clientId: "test-client-id",
          displayName: "Test OneDrive",
          email: "test@example.com",
          rootPath: "/",
          hasRefreshToken: true,
          createdAt: Date.now(),
        },
        {
          type: "onedrive",
          accessToken: "test-access-token",
          refreshToken: "test-refresh-token",
        },
      )
    }

    seedOneDrive()
      .then(() => {
        if (!cancelled) router.dismissTo("/home")
      })
      .catch((error) => {
        console.error("[seed-onedrive] failed:", error)
        if (!cancelled) router.dismissTo("/home")
      })

    return () => {
      cancelled = true
    }
  }, [createDataSource, storeReady])

  return <View />
}
