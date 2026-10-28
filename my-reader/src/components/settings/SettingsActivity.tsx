import SettingsNav from "@/components/settings/SettingsNav"
import AboutSection from "@/components/settings/sections/AboutSection"
import AppearanceSection from "@/components/settings/sections/AppearanceSection"
import DataSourcesSection from "@/components/settings/sections/DataSourcesSection"
import LibrariesSection from "@/components/settings/sections/LibrariesSection"
import SpeechSection from "@/components/settings/sections/SpeechSection"
import AiProvidersSection from "@/components/settings/sections/AiProvidersSection"
import type { SettingsSection } from "@/types/settings"

interface SettingsActivityProps {
  onClose: () => void
  onAddLibrary: () => void
  initialSection?: SettingsSection
  onSectionChange: (section: SettingsSection) => void
}

export default function SettingsActivity({
  onClose,
  onAddLibrary,
  initialSection: activeSection = "libraries",
  onSectionChange,
}: SettingsActivityProps) {
  return (
    <section
      className="flex h-full min-h-0 overflow-hidden bg-background"
      data-testid="settings-activity"
    >
      <SettingsNav
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        onBack={onClose}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {activeSection === "libraries" && (
          <LibrariesSection onAddLibrary={onAddLibrary} />
        )}
        {activeSection === "dataSources" && <DataSourcesSection />}
        {(activeSection === "aiProviders" ||
          activeSection === "ttsProviders" ||
          activeSection === "llm") && <AiProvidersSection />}
        {activeSection === "speech" && <SpeechSection />}
        {activeSection === "appearance" && <AppearanceSection />}
        {activeSection === "about" && <AboutSection />}
      </div>
    </section>
  )
}
