import { StreamingStatusLine } from "@/components/common/StreamingStatusLine"
import { useEffect, useState, type CSSProperties } from "react"
import { useTranslation } from "react-i18next"
import { narrationCharacterColor } from "@my-reader/tools/narration-plan"
import type { ReadingPlanController } from "@/hooks/reader/use-reading-plan"
import { ReaderItemList } from "@/components/reader/shared/ReaderItemList"
import { FormSwitch } from "@/components/common/FormSwitch"
import { FieldError } from "@/components/ui/field"
import { Button } from "@/components/ui/button"
import type { NarrationSubview } from "./BookNarrationSettings"

export function NarrationReadingPlan({
  plan,
  onClose,
  onSubviewChange,
  themeStyle,
}: {
  plan: ReadingPlanController
  onClose: () => void
  onSubviewChange?: (view: NarrationSubview | null) => void
  themeStyle?: CSSProperties
}) {
  const { t } = useTranslation()
  const { locateCurrent, currentIndex: sourceIndex } = plan
  const [currentIndex, setCurrentIndex] = useState(-1)
  useEffect(() => {
    setCurrentIndex(locateCurrent?.() ?? sourceIndex)
  }, [locateCurrent, sourceIndex])
  useEffect(() => {
    onSubviewChange?.({ title: t("narration.plan.title"), onBack: onClose })
    return () => onSubviewChange?.(null)
  }, [t, onClose, onSubviewChange])
  return (
    <ReaderItemList
      themeStyle={themeStyle}
      virtualized
      initialIndex={currentIndex}
      rows={plan.entries.map((entry, index) => ({
        active: index === currentIndex,
        id: entry.id,
        title: entry.speech.text,
        description: entry.speech.instructions,
        trailing: (
          <span
            className="rounded px-1.5 py-0.5"
            style={{
              color: narrationCharacterColor(entry.characterId),
              background: `${narrationCharacterColor(entry.characterId)}20`,
            }}
          >
            {entry.characterId === "narrator"
              ? t("narration.narrator")
              : entry.characterName}
          </span>
        ),
      }))}
      labels={{
        select: t("narration.plan.select"),
        deselect: t("common.cancel"),
        selected: (count) => t("narration.selected", { count }),
        deleteSelected: t("narration.plan.clearSelected"),
      }}
      onOpen={plan.play}
      jumpAction={{ label: t("narration.plan.jump"), onSelect: plan.jump }}
      onDelete={plan.clear}
      footerStatus={
        plan.analyzing ? (
          <StreamingStatusLine
            text={plan.progress}
            label={t("narration.plan.analyzing")}
          />
        ) : null
      }
      footerActions={
        plan.analyzing ? (
          <Button variant="ghost" onClick={plan.cancel}>
            {t("common.cancel")}
          </Button>
        ) : (
          <Button
            variant="ghost"
            disabled={plan.busy}
            onClick={() => void plan.analyze()}
          >
            {t("narration.plan.analyze")}
          </Button>
        )
      }
    >
      <div className="mb-4 flex flex-col gap-3">
        <FormSwitch
          id="narration-plan-marks"
          label={t("narration.plan.showMarks")}
          align="between"
          checked={plan.shown}
          onCheckedChange={plan.setShown}
        />
        {plan.error ? <FieldError>{plan.error}</FieldError> : null}
        {!plan.analyzing && !plan.entries.length ? (
          <p className="text-sm text-reader-chrome-muted">
            {t("narration.plan.empty")}
          </p>
        ) : null}
      </div>
    </ReaderItemList>
  )
}
