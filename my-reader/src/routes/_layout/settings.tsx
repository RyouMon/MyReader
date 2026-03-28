import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"

import type { SettingsSection } from "@/types/settings"
import SettingsNav from "@/components/settings/SettingsNav"
import AboutSection from "@/components/settings/sections/AboutSection"
import AppearanceSection from "@/components/settings/sections/AppearanceSection"
import LibrariesSection from "@/components/settings/sections/LibrariesSection"
import ReadingSection from "@/components/settings/sections/ReadingSection"

export const Route = createFileRoute("/_layout/settings")({
  component: SettingsPage,
})

function SettingsPage() {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("libraries")

  return (
    <div className="flex h-full overflow-hidden">
      <SettingsNav
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        {activeSection === "libraries" && <LibrariesSection />}
        {activeSection === "appearance" && <AppearanceSection />}
        {activeSection === "reading" && <ReadingSection />}
        {activeSection === "about" && <AboutSection />}
      </div>
    </div>
  )
}
