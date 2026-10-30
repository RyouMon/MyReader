import React, { useState, type ComponentProps } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks"
import { Settings2 } from "lucide-react"
import { AppThemeProvider } from "../src/components/AppThemeProvider"
import {
  BookNarrationSettings,
  type NarrationSubview,
} from "../src/components/reader/readium/BookNarrationSettings"
import { readerChromeThemeStyle } from "../src/components/reader/shared/ReaderChromeShell"
import {
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
} from "../src/components/reader/shared/ReaderSidePanelChrome"
import { EpubSearchService } from "../src/lib/readium/epubSearch"
import { findCharacterIntroductions } from "../src/lib/readium/characterIntroductions"
import { api } from "../src/lib/tauri-api"
import type {
  BookNarrationSettingsDto,
  CharacterDraftRequestDto,
  TtsConfigDto,
} from "../src/lib/tauri-specta"
import i18n from "../src/i18n"

function NarrationPanel(props: ComponentProps<typeof BookNarrationSettings>) {
  const [view, setView] = useState<NarrationSubview | null>(null)
  return (
    <ReaderSidePanelFrame visible side="right">
      <ReaderSidePanelHeader
        title={view?.title ?? "Listening settings"}
        icon={Settings2}
        onBack={view?.onBack}
        backLabel="Back"
      />
      <BookNarrationSettings {...props} onSubviewChange={setView} />
    </ReaderSidePanelFrame>
  )
}

export async function mountNarrationFixture(
  enabled = true,
  characterCount = 0,
) {
  mockIPC(() => null)
  mockWindows("reader-test")
  await i18n.changeLanguage("en")
  let settings: BookNarrationSettingsDto = {
    bookId: 42,
    enabled,
    revision: 0,
    scopeId: "book:fixture",
    scopeName: null,
    mergeSources: [],
    identityRevision: 0,
    characters: [
      {
        id: "narrator",
        name: "Narrator",
        nicknames: [],
        description: "",
        voice: null,
        instructions: "",
        source: null,
      },
      ...Array.from({ length: characterCount }, (_, index) => ({
        id: `character-${index}`,
        name: `Character ${index + 1}`,
        nicknames: [],
        description: "",
        voice: null,
        instructions: "",
        source: null,
      })),
    ],
  }
  const config: TtsConfigDto = {
    schemaVersion: 2,
    providers: [],
    profiles: [],
    defaultEngine: { kind: "system" },
    voiceByLanguage: {},
    playback: {
      speed: 1,
      pitch: 1,
      skipPageBreaks: true,
      skipFootnotes: true,
      announceContext: false,
    },
  }
  const drafts: CharacterDraftRequestDto[] = []
  const saves: BookNarrationSettingsDto[] = []
  Object.assign(window, { narrationDrafts: drafts, narrationSaves: saves })
  api.getBookNarration = async () => settings
  api.getLlmConfig = async () => ({
    schemaVersion: 2,
    defaultProfileId: "fixture",
    providers: [],
    profiles: [],
  })
  api.saveBookNarration = async (_, value) => {
    saves.push(value)
    settings = {
      ...value,
      revision: value.revision + 1,
      characters: value.characters.map((character, index) => ({
        ...character,
        id: character.id || `character-${index}`,
      })),
    }
    return settings
  }
  api.draftBookCharacters = async (_, request) => {
    drafts.push(request)
    return [
      {
        id: "",
        name: "Lin",
        nicknames: [],
        description: "A traveller",
        voice: null,
        instructions: "",
        source: null,
      },
    ]
  }
  const resources = [
    {
      href: "book.xhtml",
      type: "application/xhtml+xml",
      html: "<h1>Characters</h1><p>Lin: a traveller.</p><h1>Chapter 1</h1><p>Private reading text outside the introduction.</p>",
    },
  ]
  const find = () =>
    findCharacterIntroductions(
      new EpubSearchService(resources, []),
      resources,
      [],
    )
  const theme = readerChromeThemeStyle("sepia")
  const container = document.createElement("div")
  document.body.append(container)
  createRoot(container).render(
    <AppThemeProvider>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <div
          className="reader-window-root relative h-screen w-full"
          data-reader-theme="sepia"
          style={theme}
        >
          <NarrationPanel
            config={config}
            themeStyle={theme}
            book={{
              libraryId: "fixture",
              bookId: 42,
              title: "Fixture",
              authors: [],
              language: "en",
            }}
            findIntroductions={find}
          />
        </div>
      </QueryClientProvider>
    </AppThemeProvider>,
  )
}
