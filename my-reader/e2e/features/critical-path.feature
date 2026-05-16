# Layer 5: WebdriverIO E2E — desktop-native critical paths
@critical @desktop
Feature: 应用关键路径
  作为一位 MyReader 桌面用户
  我希望应用能正常启动和运行核心功能
  这样我可以信赖这个应用进行日常阅读

  @smoke
  Scenario: 启动应用并验证主窗口
    When 应用已启动
    Then 主窗口应该可见
    And 窗口标题应为 "MyReader"

  @smoke
  Scenario: 主窗口尺寸合理
    When 应用已启动
    Then 主窗口宽度应大于 800 像素
    And 主窗口高度应大于 600 像素

  @reader-window
  Scenario: 从书籍详情打开阅读器新窗口
    Given 应用已启动
    And 用户已打开书籍详情页
    When 用户点击 "开始阅读" 按钮
    Then 应打开新的阅读器窗口
    And 阅读器窗口标题应为书籍标题

  @reader-window
  Scenario: 关闭阅读器窗口不影响主窗口
    Given 阅读器窗口已打开
    When 用户关闭阅读器窗口
    Then 主窗口应仍然可见

  @file-dialog
  Scenario: 添加书库时打开文件选择对话框
    Given 用户已导航到设置页面
    And 用户在 "书库管理" 分区
    When 用户点击 "添加书库" 按钮
    Then 应打开文件选择对话框