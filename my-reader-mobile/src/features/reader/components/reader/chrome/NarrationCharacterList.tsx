import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/src/components"
import { NativeSelectMenu } from "@/src/components/ui/native-select-menu"
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import type { BookCharacter } from "@/src/services/core/narration"
import { View } from "@/tw"
import { ReaderChoiceRow } from "./ReaderChoiceRow"
import { ReaderSheetPage } from "./ReaderSheetPage"
import { ReaderListManagementBar } from "./ReaderListSelectionControls"
import type { CharacterImportMode } from "./NarrationCharacterImport"

export function NarrationCharacterList({
  characters,
  palette,
  busy,
  hasPublication,
  errorNode,
  onEdit,
  onImport,
  onDelete,
}: {
  characters: BookCharacter[]
  palette: ReaderChromePalette
  busy: boolean
  hasPublication: boolean
  errorNode: ReactNode
  onEdit: (character: BookCharacter) => void
  onImport: (mode: CharacterImportMode) => void
  onDelete: (characters: BookCharacter[]) => void
}) {
  const { t } = useTranslation()
  const [managing, setManaging] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => {
    setManaging(false)
    setSelected(new Set())
  }, [characters])
  const removable = characters.filter(
    (character) => character.id !== "narrator",
  )
  const selectedCharacters = removable.filter((character) =>
    selected.has(character.id),
  )
  const select = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const add = (mode: string) => {
    if (mode === "manual")
      onEdit({
        id: "",
        name: "",
        nicknames: [],
        description: "",
        instructions: "",
      })
    else onImport(mode as CharacterImportMode)
  }
  return (
    <ReaderSheetPage
      footer={
        <ReaderListManagementBar
          kind="characters"
          palette={palette}
          managing={managing}
          mutationDisabled={busy}
          deletionDisabled={busy || selectedCharacters.length === 0}
          selectedCount={selectedCharacters.length}
          totalCount={removable.length}
          toggleManagement={() => {
            setManaging(!managing)
            setSelected(new Set())
          }}
          toggleAll={() =>
            setSelected(
              selectedCharacters.length === removable.length
                ? new Set()
                : new Set(removable.map((character) => character.id)),
            )
          }
          deleteSelected={() =>
            showAlertWithStatusBarRestore(
              t("narration.deleteSelected"),
              t("narration.selected", { count: selectedCharacters.length }),
              [
                { text: t("common.cancel"), style: "cancel" },
                {
                  text: t("common.delete"),
                  style: "destructive",
                  onPress: () =>
                    onDelete(
                      characters.filter(
                        (character) =>
                          character.id === "narrator" ||
                          !selected.has(character.id),
                      ),
                    ),
                },
              ],
            )
          }
          trailingAction={
            <NativeSelectMenu
              label={t("narration.add")}
              disabled={busy}
              isAnchoredToRight
              actions={[
                { id: "manual", title: t("narration.manualAdd") },
                {
                  id: "book",
                  title: t("narration.fromBook"),
                  attributes: { disabled: !hasPublication },
                },
                { id: "encyclopedia", title: t("narration.import") },
                { id: "prompt", title: t("narration.organize") },
              ]}
              onSelect={add}
            >
              {(open) => (
                <Button
                  title={t("narration.add")}
                  variant="ghost"
                  icon={{ ios: "plus", android: "add" }}
                  colors={{
                    textColor: palette.accentText,
                    underlayColor: palette.segmentActive,
                  }}
                  disabled={busy}
                  onPress={open}
                />
              )}
            </NativeSelectMenu>
          }
        />
      }
    >
      {errorNode}
      <View>
        {characters.map((character) => (
          <ReaderChoiceRow
            key={character.id}
            title={
              character.id === "narrator"
                ? t("narration.narrator")
                : character.name
            }
            detail={character.voice?.voiceId || t("narration.defaultModel")}
            selected={managing ? selected.has(character.id) : undefined}
            disabled={busy || (managing && character.id === "narrator")}
            palette={palette}
            onPress={() =>
              managing ? select(character.id) : onEdit(character)
            }
          />
        ))}
      </View>
    </ReaderSheetPage>
  )
}
