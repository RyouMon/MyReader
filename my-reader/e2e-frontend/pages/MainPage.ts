import type { Page } from '@playwright/test'

export class MainPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/')
  }

  getBranding() {
    return this.page.getByText('MyReader')
  }
}
