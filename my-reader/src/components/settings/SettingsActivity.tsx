import { useState } from "react"
import SettingsNav from "@/components/settings/SettingsNav"
import AboutSection from "@/components/settings/sections/AboutSection"
import AppearanceSection from "@/components/settings/sections/AppearanceSection"
import DataSourcesSection from "@/components/settings/sections/DataSourcesSection"
import LibrariesSection from "@/components/settings/sections/LibrariesSection"
import type { SettingsSection } from "@/types/settings"

interface SettingsActivityProps {
  onClose: () => void
  onAddLibrary: () => void
}

export default function SettingsActivity({
  onClose,
  onAddLibrary,
}: SettingsActivityProps) {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("libraries")

  return (
    <section
      className="flex h-full min-h-0 overflow-hidden bg-background"
      data-testid="settings-activity"
    >
      <SettingsNav
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        onBack={onClose}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {activeSection === "libraries" && (
          <LibrariesSection onAddLibrary={onAddLibrary} />
        )}
        {activeSection === "dataSources" && <DataSourcesSection />}
        {activeSection === "appearance" && <AppearanceSection />}
        {activeSection === "about" && <AboutSection />}
      </div>
    </section>
  )
}
