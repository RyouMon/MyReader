import { expect, test } from "@playwright/test"

for (const command of ["activate", "focus"] as const) {
  test(`late ${command} acknowledgement cannot undo a completed chapter navigation`, async ({
    page,
  }) => {
    await page.goto("/")
    await page.setContent(`
      <style>
        #reader-fixture { position: relative; width: 800px; height: 600px; }
        .readium-navigator-iframe { border: 0; width: 100%; height: 100%; }
      </style>
      <div id="reader-fixture"></div>
    `)
    const result = await page.evaluate(async (delayedCommand) => {
      const path = "/integration-frontend/readerActivationFixture.ts"
      const { exerciseDelayedActivation } = await import(path)
      return exerciseDelayedActivation(delayedCommand)
    }, command)
    expect(result).toEqual({
      restored: true,
      navigated: true,
      before: true,
      after: true,
      lateProgressions: [],
    })
  })
}
