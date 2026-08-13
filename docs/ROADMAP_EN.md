<div align="right"><a href="./ROADMAP.md">简体中文</a></div>

# MyReader Roadmap

> Roadmap and cross-platform support matrix. It records implemented, partially available, and planned capabilities; only items marked ✅ are current public capabilities. The roadmap indicates direction, not release dates or delivery commitments.

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Implemented and exposed in the UI |
| ⚠️ | Implemented underneath, partially available, or experimental, but not exposed in the UI / platform-limited / read-only / awaiting stability validation |
| ❌ | Not implemented |
| 🗑️ | Previously present in types or legacy code, now removed |
| — | Not applicable |

---

## Reader Settings

> Covers three formats: **Reflow (EPUB)**, **Fixed (PDF)**, and **Fixed (CBZ)**. PDF and CBZ share a `PDF/CBZ` column when their support is identical; otherwise they are shown separately.

### Implemented Settings

#### Theme

| Platform | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ✅ 8 presets | — |
| Mobile iOS | ✅ 8 presets | ✅ Background switch: light / dark / system |
| Mobile Android | ✅ 8 presets | ✅ Background switch: light / dark / system |

- Fixed formats have no separate theme panel. Mobile provides light, dark, and system options under Background; Desktop provides equivalent behavior in the Fixed background row.

#### Font Family

| Platform | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ⚠️ `serif` / `sans` / `system` [^font-1] | — |
| Mobile iOS | ⚠️ `serif` / `sans` / `system` [^font-1] | — |
| Mobile Android | ⚠️ `serif` / `sans` / `system` [^font-1] | — |

[^font-1]: Only three generic font-family choices are available. Language-specific stacks, such as `Noto Serif SC` for Chinese or `Lora`/`Merriweather` for English, are not implemented.

#### Font Size

| Platform | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ✅ 14–26 px | — |
| Mobile iOS | ✅ 14–28 px | — |
| Mobile Android | ✅ 14–28 px | — |

#### Line Height

| Platform | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ✅ 1.35–2.0 | — |
| Mobile iOS | ✅ 1.4–2.4 | — |
| Mobile Android | ✅ 1.4–2.4 | — |

#### Page Margin

| Platform | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ✅ 0–4 rem steps | — |
| Mobile iOS | ✅ 12–36 px | — |
| Mobile Android | ✅ 12–36 px | — |

#### Text Alignment

| Platform | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ✅ `auto` / `justify` / `start` | — |
| Mobile iOS | ✅ `auto` / `justify` / `start` | — |
| Mobile Android | ✅ `auto` / `justify` / `start` | — |

#### Column Count

| Platform | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ✅ `auto` / `1` / `2` | — |
| Mobile iOS | ✅ `auto` / `1` [^column-1] | — |
| Mobile Android | ✅ `auto` / `1` [^column-1] | — |

[^column-1]: Mobile does not expose `2`: two columns are hard to read on phones, while `auto` can use two columns on a landscape iPad.

#### Reading Layout (Paginated / Scrolled)

| Platform | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ✅ `paginate` / `scroll` | ❌ `paginate` only [^layout-1] |
| Mobile iOS | ❌ `paginate` only [^layout-1] | ❌ `paginate` only [^layout-1] |
| Mobile Android | ❌ `paginate` only [^layout-1] | ❌ `paginate` only [^layout-1] |

[^layout-1]: Mobile does not expose a scrolling mode. PDF can switch to vertical scrolling through Page Direction; CBZ cannot scroll vertically because of FXL navigator limitations.

#### Background (Fixed)

| Platform | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | — | ✅ `black` / `dim` / `paper` |
| Mobile iOS | — | ✅ `auto` / `black` / `white` |
| Mobile Android | — | ✅ `auto` / `black` / `white` [^bg-1] |

[^bg-1]: Android sets the navigator view background directly through the bridge because the Readium pdfium/image navigators do not natively support the `backgroundColor` preference.

#### Page Direction

| Platform | EPUB | PDF | CBZ |
|---|---|---|---|
| Desktop | — | ⚠️ Affects navigation direction; not exposed in Settings [^pagedir-1] | — [^pagedir-1] |
| Mobile iOS | — | ✅ `horizontal` / `vertical` | — [^pagedir-1] |
| Mobile Android | — | ✅ `horizontal` / `vertical` | — [^pagedir-1] |

[^pagedir-1]: The CBZ FXL navigator supports horizontal pagination only, so Page Direction is hidden. Desktop does not expose this option in the Fixed panel.

#### Reading Direction

| Platform | EPUB | PDF | CBZ |
|---|---|---|---|
| Desktop | ⚠️ Stored globally; not exposed in the EPUB panel [^readingdir-1] | ⚠️ Affects navigation direction; not exposed in the Fixed panel [^readingdir-1] | ⚠️ Affects navigation direction; not exposed in the Fixed panel [^readingdir-1] |
| Mobile iOS | — | ✅ `ltr` / `rtl` | ✅ `ltr` / `rtl` |
| Mobile Android | — | ✅ `ltr` / `rtl` | ✅ `ltr` / `rtl` [^readingdir-2] |

[^readingdir-1]: Desktop reading direction is implicit: `direction` (`ltr`/`rtl`) is stored in the global `fixedLayout` preference and affects edge-tap navigation for all formats, but it is not exposed separately in Reading Settings.

[^readingdir-2]: Android CBZ uses Readium `ImageNavigatorFragment`, whose navigator provides no reading-progression preference API. The implementation reflects into `R2RTLViewPager.direction`, sets it to `RTL` or `LTR`, changes the ViewPager layout direction, and lets `BaseReaderFragment` reverse edge-tap mapping accordingly.

#### Spread

| Platform | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ⚠️ FXL EPUB: `auto` / `single` / `double` | ✅ `auto` / `single` / `double` |
| Mobile iOS | — | ✅ `auto` / `never` |
| Mobile Android | — | ❌ Picker not exposed [^spread-1] |

[^spread-1]: Fixed spread is exposed only on iOS: the `spread` picker appears in Mobile iOS Settings but is not currently exposed on Android.

#### Zoom (Render Scale)

| Platform | EPUB | PDF | CBZ |
|---|---|---|---|
| Desktop | — | ✅ 0.75–3.0 | — |
| Mobile iOS | — | ❌ | ❌ |
| Mobile Android | — | ❌ | ❌ |

### Supported Underneath but Not Exposed

These settings are Readium REP-009 preferences or product-level plans that are not currently exposed, keeping the Settings panel manageable.

#### Scroll Mode

| Platform | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ✅ Implemented; see Reading Layout | ❌ Paginated only |
| Mobile iOS | ⚠️ Supported underneath | ⚠️ Supported underneath; Page Direction is a partial substitute |
| Mobile Android | ⚠️ Supported underneath | ⚠️ Supported underneath; Page Direction is a partial substitute |

#### Forced Two-Column Layout / `columnCount: 2`

| Platform | EPUB | PDF/CBZ |
|---|---|---|
| Desktop | ⚠️ Supported underneath | — |
| Mobile iOS | ⚠️ Supported underneath | — |
| Mobile Android | ⚠️ Supported underneath | — |

#### Other Typography Adjustments

| Setting | EPUB | PDF/CBZ | Why it is not exposed |
|---|---|---|---|
| Font weight `fontWeight` | ⚠️ Supported underneath | — | Low priority |
| Letter spacing `letterSpacing` | ⚠️ Supported underneath | — | Low priority |
| Word spacing `wordSpacing` | ⚠️ Supported underneath | — | Low priority |
| Paragraph spacing `paragraphSpacing` | ⚠️ Supported underneath | — | Low priority |
| Paragraph indent `paragraphIndent` | ⚠️ Supported underneath | — | Low priority |
| Hyphenation `hyphens` | ⚠️ Supported underneath | — | Low priority |
| Ligatures `ligatures` | ⚠️ Supported underneath | — | Low priority |
| Text normalization `textNormalization` | ⚠️ Supported underneath | — | Low priority |
| Image filter `imageFilter` | ⚠️ Supported underneath | — | Low priority |
| Type scale `typeScale` | ⚠️ Supported underneath | — | Low priority |
| Vertical text `verticalText` | ⚠️ Supported underneath | — | Useful for Chinese/Japanese EPUBs; not currently supported |
| Publisher styles `publisherStyles` | ⚠️ Supported underneath | — | Currently overridden so themes and fonts work; could become an advanced toggle |
| Language `language` | ⚠️ Supported underneath | — | Follows the system language; no separate override |

### Removed Settings

| Setting | Previous location | Reason removed |
|---|---|---|
| Brightness `brightness` | Legacy Reflow & Fixed `ReaderSettings` | Readium has no brightness preference; the old translucent black overlay was unreliable and affected rendering |
| Zoom scale `zoomScale` | Legacy Fixed `ReaderSettings` | Fixed formats use native pinch-to-zoom; programmatic `zoomScale` conflicts with PDFKit/pinch gestures |
| Fixed theme `fixed.theme` | Legacy Fixed `ReaderSettings` | FXL/PDF navigators do not support theme tokens; only the background can be substituted |

---

## Other Domains

### Data Storage and Sync

See the current library-scoped data and sync architecture in
[ADR-0014](./adr/0014-data-ownership-and-sync-storage.md),
[ADR-0016](./adr/0016-adopt-automerge-for-library-sidecar-sync.md), and
[ARCHITECTURE_EN.md](./ARCHITECTURE_EN.md). Each library sidecar is an independent sync boundary; there is no central user database spanning libraries.

| Stage | Status | Goal |
|---|---|---|
| Library sidecar database | ✅ | Library-domain data such as progress and bookmarks is stored with the library |
| Library and local replica identity | ✅ | `library_uuid` identifies the shared library document; each device-local sidecar has an independent `replica_id` |
| Automerge incremental library sync | ⚠️ | Syncs favorites, progress, bookmarks, annotations, reading sessions, and completion records; MyReader libraries also sync the catalog. This remains experimental and may have unknown issues |
| Cross-device compatibility and recovery validation | ❌ | Cover replay, interrupted recovery, unknown protocols, and deletion semantics |

### Future Product Directions

| Capability | Status | Current boundary |
|---|---|---|
| TTS and read/listen continuity | ❌ | No built-in narration or selectable TTS engine |
| ComfyUI creative generation | ❌ | No selection-to-image, image-to-image, comic-reference, or video-generation workflow |
