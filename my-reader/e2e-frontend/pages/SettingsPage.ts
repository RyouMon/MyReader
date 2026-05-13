import type { Page } from '@playwright/test'

export class SettingsPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/settings')
  }

  getHeading() {
    return this.page.getByRole('heading', { name: '书库管理' })
  }

  getAddLibraryButton() {
    return this.page.getByRole('button', { name: /添加书库/i })
  }
}
