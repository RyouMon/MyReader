import { useTranslation } from "react-i18next"
import { useAppUiStore } from "@/stores/appUiStore"
import {
  READER_SETTINGS_LABEL_CLASS,
  READER_SETTINGS_OPTION_CLASS,
  readerSettingsOptionStateClass,
} from "./ReaderSidePanelChrome"

export function FixedLayoutSettingsPanel({
  showPageDirection,
}: {
  showPageDirection: boolean
}) {
  const { t } = useTranslation()
  const fixedLayout = useAppUiStore((state) => state.fixedLayout)
  const patchFixedLayout = useAppUiStore((state) => state.patchFixedLayout)

  return (
    <>
      <SettingsGroup
        label={t("reader.background")}
        options={[
          ["auto", t("reader.backgroundOptions.auto")],
          ["black", t("reader.backgroundOptions.black")],
          ["white", t("reader.backgroundOptions.white")],
        ]}
        value={fixedLayout.background}
        onChange={(background) => patchFixedLayout({ background })}
      />
      {showPageDirection ? (
        <SettingsGroup
          label={t("reader.pageDirection")}
          options={[
            ["horizontal", t("reader.pageDirectionOptions.horizontal")],
            ["vertical", t("reader.pageDirectionOptions.vertical")],
          ]}
          value={fixedLayout.navigationMode}
          onChange={(navigationMode) => patchFixedLayout({ navigationMode })}
        />
      ) : null}
      <SettingsGroup
        label={t("reader.readingProgression")}
        options={[
          ["ltr", t("reader.readingProgressionOptions.ltr")],
          ["rtl", t("reader.readingProgressionOptions.rtl")],
        ]}
        value={fixedLayout.direction}
        onChange={(direction) => patchFixedLayout({ direction })}
      />
      <SettingsGroup
        label={t("reader.pageLayout")}
        options={[
          ["auto", t("reader.pageLayoutOptions.auto")],
          ["single", t("reader.pageLayoutOptions.single")],
          ["double", t("reader.pageLayoutOptions.double")],
        ]}
        value={fixedLayout.spreadMode}
        onChange={(spreadMode) => patchFixedLayout({ spreadMode })}
      />
    </>
  )
}

function SettingsGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly (readonly [T, string])[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="space-y-2">
      <legend className={READER_SETTINGS_LABEL_CLASS}>{label}</legend>
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        }}
      >
        {options.map(([optionValue, optionLabel]) => (
          <button
            key={optionValue}
            type="button"
            aria-pressed={value === optionValue}
            onClick={() => onChange(optionValue)}
            className={`${READER_SETTINGS_OPTION_CLASS} ${readerSettingsOptionStateClass(value === optionValue)}`}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
