@smoke @desktop @critical
Feature: 应用启动

  Scenario: 用户打开桌面应用
    Given 应用已启动
    Then 主窗口应该可见
    And 页面应该显示应用标题 "MyReader"
