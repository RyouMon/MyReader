import { ArrowLeft, ChevronRight, Cpu, Volume2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { AppRow } from "@/components/common/AppRow"
import { GroupList, GroupListItem } from "@/components/common/GroupList"
import { Button } from "@/components/ui/button"
import type { SettingsSection } from "@/types/settings"
import LlmSection from "./LlmSection"
import { TtsProvidersSection } from "./SpeechSection"

export default function AiProvidersSection({
  section,
  onSectionChange,
}: {
  section: "aiProviders" | "ttsProviders" | "llm"
  onSectionChange: (section: SettingsSection) => void
}) {
  const { t } = useTranslation()
  if (section !== "aiProviders") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 px-7 pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSectionChange("aiProviders")}
          >
            <ArrowLeft />
            {t("aiProviders.title")}
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {section === "ttsProviders" ? (
            <TtsProvidersSection />
          ) : (
            <LlmSection />
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-7 py-5">
        <h1 className="text-xl font-semibold">{t("aiProviders.title")}</h1>
      </div>
      <div className="overflow-y-auto px-7 py-5">
        <GroupList>
          {(
            [
              {
                section: "ttsProviders",
                label: t("ttsSettings.providers"),
                detail: t("aiProviders.ttsDescription"),
                Icon: Volume2,
              },
              {
                section: "llm",
                label: t("llm.title"),
                detail: t("aiProviders.llmDescription"),
                Icon: Cpu,
              },
            ] as const
          ).map(({ section, label, detail, Icon }) => (
            <GroupListItem key={section} className="p-0">
              <button
                type="button"
                className="w-full px-4 py-4 text-start hover:bg-accent"
                onClick={() => onSectionChange(section)}
              >
                <AppRow
                  body={label}
                  detail={detail}
                  head={<Icon className="size-4 text-muted-foreground" />}
                  tail={
                    <ChevronRight className="size-4 text-muted-foreground" />
                  }
                />
              </button>
            </GroupListItem>
          ))}
        </GroupList>
      </div>
    </div>
  )
}
