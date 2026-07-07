@regression @sidebar
Feature: 侧边栏行为
  作为 MyReader 用户
  我希望侧边栏能根据窗口宽度选择展开方式，并支持通过应用工具栏手动折叠和展开
  以便在不同屏幕尺寸下都能高效浏览书库

  Rule: 桌面端侧边栏以实际宽度展开

    Background:
      Given 用户访问书库首页
      And 窗口宽度足够显示侧边栏

    @positive @smoke
    Scenario: 侧边栏默认展开显示完整内容
      Then 侧边栏应该处于展开状态

    @positive
    Scenario: 点击侧边栏开关按钮后侧边栏折叠
      When 用户点击侧边栏开关按钮
      Then 侧边栏应该处于折叠状态

    @positive
    Scenario: 点击侧边栏开关按钮后侧边栏恢复展开
      Given 侧边栏已折叠
      When 用户点击侧边栏开关按钮
      Then 侧边栏应该处于展开状态

  Rule: 窄窗口下最小化侧边栏保持可见

    Background:
      Given 用户访问书库首页

    @positive
    Scenario: 已最小化的侧边栏在窗口缩窄后保持可见
      Given 窗口宽度足够显示侧边栏
      And 侧边栏已折叠
      When 窗口宽度调整为移动端宽度
      Then 最小化侧边栏应该保持可见

    @positive
    Scenario: 在移动端宽度下点击侧边栏开关按钮侧边栏以叠加层展开
      Given 窗口宽度调整为移动端宽度
      When 用户点击侧边栏开关按钮
      Then 侧边栏应该以叠加层形式展开

    @positive
    Scenario: 在叠加层模式下点击空白区域侧边栏关闭
      Given 窗口宽度调整为移动端宽度
      And 侧边栏已以叠加层形式展开
      When 用户点击叠加层外的空白区域
      Then 侧边栏叠加层应该关闭

    @positive
    Scenario: 在叠加层模式下点击侧边栏开关按钮侧边栏关闭
      Given 窗口宽度调整为移动端宽度
      And 侧边栏已以叠加层形式展开
      When 用户点击侧边栏开关按钮
      Then 侧边栏叠加层应该关闭
