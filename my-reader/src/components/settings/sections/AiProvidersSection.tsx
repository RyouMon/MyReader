import { useTranslation } from "react-i18next"
import { FormScrollArea } from "@/components/common/FormScrollArea"
import { Separator } from "@/components/ui/separator"
import LlmSection from "./LlmSection"
import { TtsProvidersSection } from "./SpeechSection"

export default function AiProvidersSection() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-7 py-5">
        <h1 className="text-xl font-semibold">{t("aiProviders.title")}</h1>
      </div>
      <FormScrollArea className="flex-1 space-y-8 px-7 py-5">
        <TtsProvidersSection />
        <Separator />
        <LlmSection />
      </FormScrollArea>
    </div>
  )
}
