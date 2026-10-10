# Shared localization

Desktop and mobile use the same language registry in `src/languages.ts`.
The 11 locales are English (`en`), Simplified Chinese (`zh-CN`), Traditional
Chinese (`zh-Hant`), Japanese (`ja`), Korean (`ko`), Spanish (`es`), French (`fr`),
German (`de`), Brazilian Portuguese (`pt-BR`), Italian (`it`), and Russian (`ru`).

English is the fallback for unsupported system languages and missing or empty
translations. System detection uses the ordered language preferences and chooses
the first supported language. Explicit Chinese script tags take priority over
regions; Taiwan, Hong Kong, and Macau otherwise use Traditional Chinese.
Portuguese variants currently use Brazilian Portuguese. A manual app choice
overrides system preferences and is persisted by each app.

All resources ship with the app and work offline. Shared copy lives in
`src/locales/shared`; platform copy lives in `src/locales/desktop` and
`src/locales/mobile`. New translations started from machine translation with
contextual terminology and plural corrections; native-speaker review remains
recommended before release.

`syncFailureKeys` selects shared UI copy from Core's sync failure category. Both
apps translate these keys when rendering or showing a notification, so stored
failures follow the current language. Missing or unknown categories use generic
guidance; diagnostic messages stay in logs and sync history, not in UI copy.

`errorMessageKey` provides the same boundary for other operations: library and
source management, transfers, reading and speech. Platform adapters inspect typed
errors; UI selects copy at presentation time. Unknown errors use a generic message.
The error classes and transport adapters do not translate diagnostics.

When adding or updating a locale:

- Keep keys and interpolation variables aligned with English. Use i18next plural
  suffixes for the language's categories, including Russian `one`, `few`, `many`,
  and `other`. Call translations with a numeric `count`.
- Register its native display name and both platform resource bundles.
- Update Expo's `supportedLocales`, mobile plural-rule data, and the shared
  relative-time formatter. Rebuild native apps after changing supported locales.
- Run `pnpm qa` and `pnpm test:unit`. Resource contracts check locale coverage,
  placeholders, plural forms, and native locale declarations.
- Check desktop and mobile settings, reader controls, and narrow layouts in the
  rendered app. Automated checks cannot assess translation fluency.
