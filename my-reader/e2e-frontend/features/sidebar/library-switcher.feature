@regression @sidebar @library-switcher
Feature: 侧边栏书库切换
  作为 MyReader 用户
  我希望在侧边栏头部快速切换当前书库
  以便在不同书库之间高效浏览

  Rule: 桌面端展开侧边栏中可以打开书库切换菜单

    Background:
      Given 已配置多个书库
      And 窗口宽度足够显示侧边栏
      And 用户访问书库首页

    @positive @smoke
    Scenario: 点击书库切换按钮弹出书库列表
      When 用户点击侧边栏书库切换按钮
      Then 书库切换菜单应该在侧边栏右侧显示
      And 菜单中应该显示所有已配置书库
      And 当前书库应该被高亮显示

    @positive
    Scenario: 在书库列表中选择另一书库
      Given 用户已打开书库切换菜单
      When 用户点击书库列表中的第二个书库
      Then 第二个书库应该成为当前书库
      And 书库切换菜单应该关闭
      And 侧边栏头部应该显示第二个书库名称

    @positive
    Scenario: 书库切换菜单包含添加书库入口
      When 用户点击侧边栏书库切换按钮
      Then 书库切换菜单中应该显示"添加书库"按钮

    @positive
    Scenario: 点击添加书库入口跳转到设置页
      Given 用户已打开书库切换菜单
      When 用户点击"添加书库"按钮
      Then 页面应该跳转到设置页

    @positive
    Scenario: 只有一个书库时仍显示切换菜单
      Given 系统只配置了一个书库
      And 用户访问书库首页
      When 用户点击侧边栏书库切换按钮
      Then 书库切换菜单应该在侧边栏右侧显示
      And 菜单中应该只显示一个书库
      And 该书库应该被高亮显示
      And 书库切换菜单中应该显示"添加书库"按钮

  Rule: 没有书库时显示添加入口

    Background:
      Given 系统没有配置任何书库
      And 窗口宽度足够显示侧边栏
      And 用户访问书库首页

    @positive
    Scenario: 没有书库时切换菜单显示空状态
      When 用户点击侧边栏书库切换按钮
      Then 书库切换菜单应该在侧边栏右侧显示
      And 菜单中应该显示"暂无书库"提示
      And 书库切换菜单中应该显示"添加书库"按钮

    @positive
    Scenario: 没有书库时点击添加书库跳转到设置页
      Given 用户已打开书库切换菜单
      When 用户点击"添加书库"按钮
      Then 页面应该跳转到设置页

  Rule: 折叠侧边栏中仍可打开书库切换菜单

    Background:
      Given 已配置多个书库
      And 窗口宽度足够显示侧边栏
      And 用户访问书库首页
      And 侧边栏已折叠

    @positive
    Scenario: 折叠状态下点击书库图标弹出书库列表
      When 用户点击侧边栏书库切换按钮
      Then 书库切换菜单应该在侧边栏右侧显示
      And 菜单中应该显示所有已配置书库
