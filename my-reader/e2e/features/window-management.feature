# Layer 5: WebdriverIO E2E — window management
@critical @desktop @window
Feature: 窗口管理
  作为一位 MyReader 桌面用户
  我希望应用窗口行为符合桌面应用预期
  这样我可以正常使用多窗口阅读

  @smoke
  Scenario: 应用启动时只打开主窗口
    When 应用已启动
    Then 应只存在一个窗口

  @reader-window
  Scenario: 阅读器窗口独立于主窗口
    Given 阅读器窗口已打开
    Then 应存在两个窗口
    And 主窗口应显示书籍详情页

  @reader-window
  Scenario: 阅读器全屏切换
    Given 阅读器窗口已打开
    When 用户点击全屏按钮
    Then 阅读器窗口应切换为全屏模式