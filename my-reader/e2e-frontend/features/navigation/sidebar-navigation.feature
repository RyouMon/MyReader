# Layer 4: Playwright E2E — sidebar and navigation behavior
@regression @navigation
Feature: 侧边栏与导航
  作为一位 MyReader 用户
  我希望通过侧边栏在不同视图间切换
  这样我可以快速找到想要的书籍或功能

  Background:
    Given 用户访问书库首页

  @smoke
  Scenario: 侧边栏显示书库导航项
    Then 侧边栏应显示 "全部" 导航项
    And 侧边栏应显示 "最近阅读" 导航项
    And 侧边栏应显示 "收藏" 导航项

  @smoke
  Scenario: 侧边栏显示分类浏览项
    Then 侧边栏应显示 "标签" 分类项
    And 侧边栏应显示 "丛书" 分类项
    And 侧边栏应显示 "作者" 分类项

  @smoke
  Scenario: 侧边栏显示设置入口
    Then 侧边栏应显示 "设置" 链接

  @sidebar
  Scenario: 折叠侧边栏
    When 用户点击侧边栏折叠按钮
    Then 侧边栏应折叠为图标模式

  @sidebar
  Scenario: 展开已折叠的侧边栏
    Given 侧边栏已折叠
    When 用户点击侧边栏展开按钮
    Then 侧边栏应恢复为完整模式

  @sidebar
  Scenario: 侧边栏显示当前书库名称
    Then 侧边栏应显示当前书库名称

  @sidebar
  Scenario: 侧边栏显示书籍总数
    Then 侧边栏 "全部" 项应显示书籍总数

  @sidebar
  Scenario: 侧边栏显示收藏数
    Then 侧边栏 "收藏" 项应显示收藏总数

  @library-switch
  Scenario: 打开书库切换菜单
    When 用户点击书库切换按钮
    Then 应显示书库选择菜单

  @library-switch
  Scenario: 切换到另一个书库
    Given 书库列表中存在多个书库
    And 书库切换菜单已打开
    When 用户选择另一个书库
    Then 当前书库应切换
    And 书籍列表应更新为新书库的书籍

  @library-switch
  Scenario: 当前书库在菜单中标记为选中
    Given 书库切换菜单已打开
    Then 当前书库应显示选中标记

  @library-switch
  Scenario: 关闭书库切换菜单
    Given 书库切换菜单已打开
    When 用户点击菜单外部区域
    Then 书库切换菜单应关闭

  @navigation
  Scenario: 从侧边栏导航到设置页
    When 用户点击侧边栏 "设置" 链接
    Then 应导航到设置页面

  @navigation
  Scenario: 从侧边栏导航回书库首页
    Given 用户已导航到设置页面
    When 用户点击侧边栏 "全部" 链接
    Then 应导航回书库首页
